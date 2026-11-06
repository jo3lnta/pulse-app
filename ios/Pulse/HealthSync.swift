import Foundation
import HealthKit

@MainActor final class HealthSync {
    private let store = HKHealthStore()
    private var observers: [HKObserverQuery] = []
    private var activeUser: UUID?
    private var syncing = false
    var onChange: (() async -> Void)?
    private var types: Set<HKObjectType> {
        Set([HKQuantityType.quantityType(forIdentifier:.stepCount)!,
             HKQuantityType.quantityType(forIdentifier:.heartRate)!,
             HKQuantityType.quantityType(forIdentifier:.heartRateVariabilitySDNN)!,
             HKCategoryType.categoryType(forIdentifier:.sleepAnalysis)!])
    }
    func authorize() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw PulseError.message("Salud no está disponible en este dispositivo.") }
        try await store.requestAuthorization(toShare:[], read:types)
    }
    func observe(userID: UUID) {
        stop(); activeUser = userID
        for type in types.compactMap({ $0 as? HKSampleType }) {
            let observer = HKObserverQuery(sampleType:type, predicate:nil) { [weak self] _, completion, error in
                Task { @MainActor in
                    defer { completion() }
                    guard let self, error == nil, self.activeUser == userID else { return }
                    do { try await self.sync(userID:userID); await self.onChange?() }
                    catch { /* Retry on next delivery or when the app becomes active. */ }
                }
            }
            store.execute(observer); observers.append(observer)
            store.enableBackgroundDelivery(for:type, frequency:.hourly) { _, _ in }
        }
    }
    func stop() {
        observers.forEach { store.stop($0) }; observers.removeAll(); activeUser = nil
        store.disableAllBackgroundDelivery { _, _ in }
    }
    func sync(userID: UUID) async throws {
        guard !syncing, activeUser == userID,
              let data = Vault.read("health." + userID.uuidString),
              let key = String(data:data, encoding:.utf8) else { return }
        syncing = true
        defer { syncing = false }
        let calendar = Calendar.current
        let today = calendar.startOfDay(for:Date())
        let start = calendar.date(byAdding:.day,value:-7,to:today)!
        let end = Date()
        var result = try await steps(start:start,end:end)
        result += try await latestQuantity(.heartRate, unit:HKUnit.count().unitDivided(by:.minute()), type:"hr", start:start, end:end)
        result += try await latestQuantity(.heartRateVariabilitySDNN, unit:.secondUnit(with:.milli), type:"hrv", start:start, end:end)
        result += try await sleep(start:start,end:end)
        guard activeUser == userID, Vault.read("health." + userID.uuidString) == data else { return }
        guard !result.isEmpty else { return }
        struct Payload: Encodable { let token: String; let records: [DailyRecord] }
        _ = try await PulseAPI().request("/rest/v1/rpc/health_ingest", method:"POST", body:JSONEncoder().encode(Payload(token:key,records:result)))
    }
    nonisolated static func day(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier:.gregorian)
        formatter.locale = Locale(identifier:"en_US_POSIX"); formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"; return formatter.string(from:date)
    }
    private func samples(_ type: HKSampleType, start: Date, end: Date) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart:start,end:end,options:[])
            store.execute(HKSampleQuery(sampleType:type,predicate:predicate,limit:HKObjectQueryNoLimit,sortDescriptors:[NSSortDescriptor(key:HKSampleSortIdentifierEndDate,ascending:false)]) { _, values, error in
                if let error { continuation.resume(throwing:error) }
                else { continuation.resume(returning:values ?? []) }
            })
        }
    }
    private func latestQuantity(_ id: HKQuantityTypeIdentifier, unit: HKUnit, type: String, start: Date, end: Date) async throws -> [DailyRecord] {
        let data = try await samples(HKQuantityType.quantityType(forIdentifier:id)!,start:start,end:end)
        var daily: [String:DailyRecord] = [:]
        for sample in data.compactMap({$0 as? HKQuantitySample}) where sample.endDate >= start && sample.endDate <= end {
            let day = Self.day(sample.endDate), value = sample.quantity.doubleValue(for:unit)
            let range: ClosedRange<Double> = type == "hr" ? 25...240 : 1...300
            if daily[day] == nil, value.isFinite, range.contains(value) { daily[day] = DailyRecord(type:type,date:day,value:value) }
        }
        return Array(daily.values)
    }
    private func steps(start: Date, end: Date) async throws -> [DailyRecord] {
        try await withCheckedThrowingContinuation { continuation in
            let type = HKQuantityType.quantityType(forIdentifier:.stepCount)!
            let query = HKStatisticsCollectionQuery(quantityType:type,quantitySamplePredicate:HKQuery.predicateForSamples(withStart:start,end:end),options:.cumulativeSum,anchorDate:Calendar.current.startOfDay(for:start),intervalComponents:DateComponents(day:1))
            query.initialResultsHandler = { _, collection, error in
                if let error { continuation.resume(throwing:error); return }
                var rows: [DailyRecord] = []
                collection?.enumerateStatistics(from:start,to:end) { stat, _ in
                    if let value = stat.sumQuantity()?.doubleValue(for:.count()), value >= 0, value <= 100000 {
                        rows.append(DailyRecord(type:"steps",date:Self.day(stat.startDate),value:value.rounded()))
                    }
                }
                continuation.resume(returning:rows)
            }
            store.execute(query)
        }
    }
    // Merge overlapping asleep intervals across devices and sleep stages.
    // A sample is attributed to the day it ends; in-bed and awake samples are excluded.
    private func sleep(start: Date, end: Date) async throws -> [DailyRecord] {
        let data = try await samples(HKCategoryType.categoryType(forIdentifier:.sleepAnalysis)!,start:start,end:end)
        let asleep = Set([HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue, HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                          HKCategoryValueSleepAnalysis.asleepDeep.rawValue, HKCategoryValueSleepAnalysis.asleepREM.rawValue])
        var grouped: [String:[DateInterval]] = [:]
        for sample in data.compactMap({$0 as? HKCategorySample}) where asleep.contains(sample.value) && sample.endDate >= start && sample.endDate <= end {
            grouped[Self.day(sample.endDate),default:[]].append(DateInterval(start:sample.startDate,end:sample.endDate))
        }
        return grouped.compactMap { day, intervals in
            let hours = Self.unionDuration(intervals) / 3600
            return hours > 0 && hours <= 24 ? DailyRecord(type:"sleep",date:day,value:hours) : nil
        }
    }
    nonisolated static func unionDuration(_ intervals: [DateInterval]) -> TimeInterval {
        let sorted = intervals.sorted { $0.start < $1.start }
        guard var current = sorted.first else { return 0 }
        var total: TimeInterval = 0
        for next in sorted.dropFirst() {
            if next.start <= current.end { current = DateInterval(start:current.start,end:max(current.end,next.end)) }
            else { total += current.duration; current = next }
        }
        return total + current.duration
    }
}

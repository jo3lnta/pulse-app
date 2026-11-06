import XCTest
@testable import Pulse
final class HealthMathTests: XCTestCase {
    func testOverlappingSleepStagesAndDevicesDoNotDoubleCount() {
        let base = Date(timeIntervalSince1970:0)
        let intervals = [DateInterval(start:base,duration:3600),
                         DateInterval(start:base.addingTimeInterval(1800),duration:3600),
                         DateInterval(start:base.addingTimeInterval(7200),duration:1800)]
        XCTAssertEqual(HealthSync.unionDuration(intervals),7200)
    }
    func testEmptySleepIsZero() { XCTAssertEqual(HealthSync.unionDuration([]),0) }
}

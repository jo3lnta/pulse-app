import Foundation
import Combine

@MainActor final class PulseModel: ObservableObject {
    @Published var session: PulseSession?
    @Published var records: [Measurement] = []
    @Published var message = ""
    @Published var busy = false
    @Published var restoring = true
    @Published var healthConnected = false
    let api = PulseAPI()
    let health = HealthSync()
    private var expiry: Double = 0
    private var refreshing: Task<String, Error>?
    private var generation = 0
    init() {
        // Register observers synchronously on launch, including HealthKit background launches.
        if let data = Vault.read("session"), let saved = try? JSONDecoder().decode(PulseSession.self, from:data) {
            session = saved
            expiry = UserDefaults.standard.double(forKey:"sessionExpiry")
            healthConnected = Vault.read("health." + saved.user.id.uuidString) != nil
            if healthConnected { health.observe(userID:saved.user.id) }
        }
        health.onChange = { [weak self] in await self?.refresh() }
    }
    func restore() async {
        defer { restoring = false }
        guard let data = Vault.read("session"), let saved = try? JSONDecoder().decode(PulseSession.self, from:data) else { return }
        session = saved
        expiry = UserDefaults.standard.double(forKey:"sessionExpiry")
        do {
            _ = try await accessToken()
            healthConnected = Vault.read("health." + saved.user.id.uuidString) != nil
            if healthConnected { health.observe(userID:saved.user.id) }
            await refresh()
        } catch PulseError.authenticationRequired { clearLocal(); message = "Tu sesión ha caducado. Vuelve a entrar." }
        catch { message = "No se pudo restaurar la sesión. Comprueba la conexión o vuelve a entrar." }
    }
    func accessToken() async throws -> String {
        guard let session else { throw PulseError.message("Inicia sesión.") }
        if expiry > Date().timeIntervalSince1970 + 60 { return session.access_token }
        if let refreshing { return try await refreshing.value }
        let userID = session.user.id
        let task = Task<String, Error> {
            let data = try await api.request("/auth/v1/token?grant_type=refresh_token", method:"POST", body:api.json(["refresh_token":session.refresh_token]))
            let next = try JSONDecoder().decode(PulseSession.self, from:data)
            guard self.session?.user.id == userID else { throw PulseError.message("La cuenta ha cambiado.") }
            try save(next)
            return next.access_token
        }
        refreshing = task
        defer { refreshing = nil }
        return try await task.value
    }
    private func save(_ next: PulseSession) throws {
        try Vault.write("session", JSONEncoder().encode(next))
        expiry = next.expiry
        UserDefaults.standard.set(expiry, forKey:"sessionExpiry")
        session = next
    }
    func login(email: String, password: String) async {
        guard !busy else { return }; busy = true; message = ""
        defer { busy = false }
        do {
            let data = try await api.request("/auth/v1/token?grant_type=password", method:"POST", body:api.json(["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"password":password]))
            try save(JSONDecoder().decode(PulseSession.self, from:data))
            healthConnected = session.flatMap { Vault.read("health." + $0.user.id.uuidString) } != nil
            if let id = session?.user.id, healthConnected { health.observe(userID:id) }
            await refresh()
        } catch { message = error.localizedDescription }
    }
    func signup(email: String, password: String) async {
        guard !busy else { return }; busy = true; message = ""
        defer { busy = false }
        do {
            let data = try await api.request("/auth/v1/signup?redirect_to=https%3A%2F%2Fjo3lnta.github.io%2Fpulse-app%2F", method:"POST", body:api.json(["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"password":password]))
            if let next = try? JSONDecoder().decode(PulseSession.self, from:data) { try save(next); await refresh() }
            else { message = "Revisa tu correo y confirma la dirección. Después vuelve a PULSE para iniciar sesión." }
        } catch { message = error.localizedDescription }
    }
    func recover(email: String) async {
        guard !busy else { return }; busy = true; message = ""
        defer { busy = false }
        do {
            _ = try await api.request("/auth/v1/recover?redirect_to=https%3A%2F%2Fjo3lnta.github.io%2Fpulse-app%2F", method:"POST", body:api.json(["email":email]))
            message = "Si existe la cuenta, recibirás un enlace. Abre el enlace en el navegador para cambiar la contraseña y vuelve a la app."
        } catch { message = error.localizedDescription }
    }
    func refresh() async {
        guard let id = session?.user.id else { return }
        let version = generation
        do {
            let token = try await accessToken()
            async let manual = api.request("/rest/v1/entries?select=id,type,value,date,created_at&user_id=eq.\(id.uuidString)&order=date.desc&limit=400", token:token)
            async let imported = api.request("/rest/v1/health_entries?select=id,type,value,date,created_at&user_id=eq.\(id.uuidString)&order=date.desc&limit=400", token:token)
            let (a,b) = try await (manual, imported)
            guard version == generation, session?.user.id == id else { return }
            records = try (JSONDecoder().decode([Measurement].self, from:a) + JSONDecoder().decode([Measurement].self, from:b)).sorted { $0.date == $1.date ? $0.created_at > $1.created_at : $0.date > $1.date }
        } catch { if version == generation { message = error.localizedDescription } }
    }
    func connectHealth() async {
        guard !busy, let id = session?.user.id else { return }; busy = true; message = ""
        defer { busy = false }
        do {
            try await health.authorize()
            let data = try await api.request("/rest/v1/rpc/health_connect", method:"POST", body:Data("{}".utf8), token:try await accessToken())
            let key = try JSONDecoder().decode(String.self, from:data)
            guard session?.user.id == id else { return }
            try Vault.write("health." + id.uuidString, Data(key.utf8))
            healthConnected = true
            health.observe(userID:id)
            try await health.sync(userID:id)
            await refresh()
            message = "Conexión preparada. Solo se envían las mediciones que permitas leer en Salud."
        } catch { message = error.localizedDescription }
    }
    func disconnectHealth() async {
        guard !busy, let id = session?.user.id else { return }; busy = true
        defer { busy = false }
        do {
            _ = try await api.request("/rest/v1/rpc/health_disconnect", method:"POST", body:Data("{}".utf8), token:try await accessToken())
            Vault.remove("health." + id.uuidString)
            health.stop(); healthConnected = false
            message = "Salud desconectada. Se conserva el historial."
        } catch { message = error.localizedDescription }
    }
    func syncHealth() async {
        guard !busy, let id = session?.user.id else { return }; busy = true; message = ""
        defer { busy = false }
        do { try await health.sync(userID:id); await refresh(); message = "Sincronización completada con los datos disponibles." }
        catch { message = error.localizedDescription }
    }
    func add(type: String, value: Double, date: String) async throws {
        guard let id = session?.user.id else { throw PulseError.message("Inicia sesión.") }
        let limits: [String:ClosedRange<Double>] = ["hr":25...240,"hrv":1...300,"sleep":0...24,"steps":0...100000]
        guard value.isFinite, limits[type]?.contains(value) == true, type != "steps" || value.rounded() == value else { throw PulseError.message("Comprueba la medición y sus unidades.") }
        let row: [String:Any] = ["id":UUID().uuidString,"user_id":id.uuidString,"type":type,"value":value,"date":date,"created_at":Date().timeIntervalSince1970 * 1000]
        _ = try await api.request("/rest/v1/entries", method:"POST", body:JSONSerialization.data(withJSONObject:row), token:try await accessToken())
        await refresh()
    }
    func logout() async {
        guard !busy else { return }; busy = true
        defer { busy = false }
        do {
            let token = try await accessToken()
            _ = try await api.request("/auth/v1/logout?scope=local", method:"POST", token:token)
            clearLocal()
        } catch { clearLocal() }
    }
    func deleteAccount() async {
        guard !busy else { return }; busy = true
        defer { busy = false }
        do {
            _ = try await api.request("/functions/v1/pulse-delete-account", method:"POST", body:api.json(["confirmation":"DELETE"]), token:try await accessToken())
            clearLocal()
            message = "Tu cuenta y tus mediciones se han eliminado."
        } catch { message = error.localizedDescription }
    }
    private func clearLocal() {
        generation += 1
        if let id = session?.user.id { Vault.remove("health." + id.uuidString) }
        health.stop(); Vault.remove("session"); UserDefaults.standard.removeObject(forKey:"sessionExpiry")
        session = nil; records = []; healthConnected = false
    }
}

import Foundation
import Security

struct PulseUser: Codable { let id: UUID; let email: String? }
struct PulseSession: Codable {
    let access_token: String
    let refresh_token: String
    let expires_in: Double?
    let expires_at: Double?
    let user: PulseUser
    var expiry: Double { expires_at ?? Date().timeIntervalSince1970 + (expires_in ?? 3600) }
}
struct Measurement: Codable, Identifiable {
    let id: UUID
    let type: String
    let value: Double
    let date: String
    let created_at: Double
    var title: String { ["hr":"Pulso", "hrv":"VFC", "sleep":"Sueño", "steps":"Pasos"][type] ?? type }
    var unit: String { ["hr":"bpm", "hrv":"ms", "sleep":"h", "steps":"pasos"][type] ?? "" }
}
struct DailyRecord: Codable { let type: String; let date: String; let value: Double }
struct APIError: Decodable { let msg: String?; let message: String?; let error_code: String?; let code: String? }
enum PulseError: LocalizedError {
    case message(String)
    case authenticationRequired
    var errorDescription: String? { if case .message(let text) = self { return text }; return "Tu sesión ha caducado. Vuelve a iniciar sesión." }
}
enum Vault {
    static func read(_ key: String) -> Data? {
        let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:"PULSE", kSecAttrAccount as String:key,
            kSecReturnData as String:true, kSecMatchLimit as String:kSecMatchLimitOne]
        var result: CFTypeRef?
        return SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess ? result as? Data : nil
    }
    static func write(_ key: String, _ value: Data) throws {
        let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:"PULSE", kSecAttrAccount as String:key]
        let attributes: [String: Any] = [kSecValueData as String:value,
            kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updated == errSecItemNotFound {
            let inserted = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
            guard inserted == errSecSuccess else { throw PulseError.message("No se pudo guardar la sesión de forma segura.") }
        } else if updated != errSecSuccess { throw PulseError.message("No se pudo guardar la sesión de forma segura.") }
    }
    static func remove(_ key: String) {
        SecItemDelete([kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:"PULSE", kSecAttrAccount as String:key] as CFDictionary)
    }
}
struct PulseAPI {
    static let base = "https://sxsrlucazbgigxllxfgc.supabase.co"
    static let key = "sb_publishable_WDTnMx0ugljuRqS4a16bGA_V-Y3c1w4"
    static let website = URL(string:"https://jo3lnta.github.io/pulse-app/")!
    func request(_ path: String, method: String = "GET", body: Data? = nil, token: String? = nil) async throws -> Data {
        var req = URLRequest(url:URL(string:Self.base + path)!)
        req.httpMethod = method; req.httpBody = body; req.timeoutInterval = 30
        req.setValue(Self.key, forHTTPHeaderField:"apikey")
        req.setValue("application/json", forHTTPHeaderField:"Content-Type")
        if let token { req.setValue("Bearer " + token, forHTTPHeaderField:"Authorization") }
        let (data, response) = try await URLSession.shared.data(for:req)
        guard let http = response as? HTTPURLResponse else { throw PulseError.message("Respuesta de red inválida.") }
        guard (200..<300).contains(http.statusCode) else {
            let error = try? JSONDecoder().decode(APIError.self, from:data)
            let code = error?.error_code ?? error?.code ?? ""
            if path.contains("grant_type=refresh_token"), http.statusCode == 400 || http.statusCode == 401 { throw PulseError.authenticationRequired }
            let message: String
            switch code {
            case "email_not_confirmed": message = "Confirma tu correo antes de entrar."
            case "email_address_not_authorized", "over_email_send_rate_limit": message = "PULSE no ha podido enviar el correo. El administrador debe configurar el proveedor de correo."
            case "invalid_credentials": message = "Correo o contraseña incorrectos. Crea una cuenta si todavía no tienes una."
            default: message = http.statusCode == 429 ? "Demasiados intentos. Espera unos minutos." : "No se pudo completar la operación. Inténtalo de nuevo."
            }
            throw PulseError.message(message)
        }
        return data
    }
    func json(_ value: [String:String]) throws -> Data { try JSONEncoder().encode(value) }
}

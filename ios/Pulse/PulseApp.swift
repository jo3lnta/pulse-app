import SwiftUI

@main struct PulseApp: App {
    @StateObject private var model = PulseModel()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model).preferredColorScheme(.dark).tint(.mint)
                .task { await model.restore() }
                .onChange(of:phase) { phase in
                    if phase == .active, !model.restoring, model.session != nil {
                        Task { if model.healthConnected { await model.syncHealth() } else { await model.refresh() } }
                    }
                }
        }
    }
}
struct RootView: View {
    @EnvironmentObject var model: PulseModel
    var body: some View {
        if model.restoring { ProgressView("Abriendo PULSE…") }
        else if model.session == nil { AuthView() }
        else {
            TabView {
                DashboardView().tabItem { Label("Resumen",systemImage:"waveform.path.ecg") }
                SettingsView().tabItem { Label("Perfil",systemImage:"person.crop.circle") }
            }
        }
    }
}
struct AuthView: View {
    @EnvironmentObject var model: PulseModel
    @State private var email = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var creating = false
    var body: some View {
        NavigationStack {
            Form {
                Section { Text("PULSE.").font(.largeTitle.bold()).foregroundStyle(.mint)
                    Text("Tus mediciones de salud, en un solo lugar.") }
                Section(creating ? "Crear cuenta" : "Iniciar sesión") {
                    TextField("Correo electrónico",text:$email).textInputAutocapitalization(.never).keyboardType(.emailAddress).textContentType(.username).autocorrectionDisabled()
                    SecureField("Contraseña",text:$password).textContentType(creating ? .newPassword : .password)
                    if creating { SecureField("Repite la contraseña",text:$confirmation).textContentType(.newPassword) }
                    Button(creating ? "Crear cuenta" : "Entrar") {
                        Task { if creating { await model.signup(email:email,password:password) } else { await model.login(email:email,password:password) }; password = ""; confirmation = "" }
                    }.disabled(model.busy || email.isEmpty || password.isEmpty || (creating && (password.count < 8 || password != confirmation)))
                    if !creating { Button("He olvidado la contraseña") { Task { await model.recover(email:email) } }.disabled(email.isEmpty || model.busy) }
                }
                if !model.message.isEmpty { Section { Text(model.message).font(.callout).accessibilityIdentifier("authMessage") } }
                Section {
                    Button(creating ? "Ya tengo cuenta" : "Crear una cuenta") { creating.toggle(); model.message = "" }
                    Link("Privacidad",destination:PulseAPI.website.appendingPathComponent("docs/privacy.html"))
                    Link("Ayuda",destination:PulseAPI.website.appendingPathComponent("docs/support.html"))
                }
            }.navigationTitle(creating ? "Crear cuenta" : "Bienvenido")
        }
    }
}
struct DashboardView: View {
    @EnvironmentObject var model: PulseModel
    @State private var adding = false
    private let metrics = ["hr","hrv","sleep","steps"]
    var body: some View {
        NavigationStack {
            List {
                Section("Tus últimas mediciones") {
                    ForEach(metrics,id:\.self) { type in
                        if let record = model.records.first(where:{$0.type == type}) {
                            HStack { VStack(alignment:.leading) { Text(record.title); Text(record.date).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text(record.value,format:.number.precision(.fractionLength(0...1))); Text(record.unit).foregroundStyle(.secondary) }
                        } else { Text(["hr":"Pulso","hrv":"VFC","sleep":"Sueño","steps":"Pasos"][type]! + ": sin datos").foregroundStyle(.secondary) }
                    }
                }
                Section("Historial") {
                    if model.records.isEmpty { Text("Añade una medición o conecta Apple Salud desde Perfil.") }
                    ForEach(model.records.prefix(80)) { record in
                        HStack { VStack(alignment:.leading) { Text(record.title); Text(record.date).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text(record.value,format:.number.precision(.fractionLength(0...1))); Text(record.unit).font(.caption) }
                    }
                }
                if !model.message.isEmpty { Section { Text(model.message).font(.callout) } }
                Section { Text("PULSE es un registro de bienestar. No ofrece diagnósticos ni consejo médico.").font(.footnote).foregroundStyle(.secondary) }
            }.navigationTitle("PULSE.").refreshable { if model.healthConnected { await model.syncHealth() } else { await model.refresh() } }
                .toolbar { Button { adding = true } label: { Label("Añadir medición",systemImage:"plus") } }
                .sheet(isPresented:$adding) { AddMeasurementView() }
        }
    }
}
struct AddMeasurementView: View {
    @EnvironmentObject var model: PulseModel
    @Environment(\.dismiss) private var dismiss
    @State private var type = "hr"
    @State private var value = ""
    @State private var date = Date()
    @State private var error = ""
    @State private var saving = false
    var body: some View {
        NavigationStack {
            Form {
                Picker("Medición",selection:$type) { Text("Pulso · bpm").tag("hr"); Text("VFC · ms").tag("hrv"); Text("Sueño · horas").tag("sleep"); Text("Pasos").tag("steps") }
                TextField("Valor real",text:$value).keyboardType(.decimalPad)
                DatePicker("Fecha",selection:$date,in:...Date(),displayedComponents:.date)
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
                Button("Guardar") {
                    guard let number = Double(value.replacingOccurrences(of:",",with:".")) else { error = "Introduce un número."; return }
                    saving = true
                    Task { defer { saving = false }; do { try await model.add(type:type,value:number,date:HealthSync.day(date)); dismiss() } catch { self.error = error.localizedDescription } }
                }.disabled(saving)
            }.navigationTitle("Añadir medición").toolbar { Button("Cancelar") { dismiss() } }
        }
    }
}
struct SettingsView: View {
    @EnvironmentObject var model: PulseModel
    @State private var consenting = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Cuenta") { Text(model.session?.user.email ?? "PULSE"); Button("Cerrar sesión") { Task { await model.logout() } }.disabled(model.busy) }
                Section("Apple Salud") {
                    Text("Con tu permiso, PULSE lee pasos, pulso, VFC y sueño de los últimos 7 días y guarda resúmenes diarios en tu cuenta para sincronizarlos con la web. No escribe en Salud. Puedes retirar permisos en Ajustes de iOS.").font(.callout)
                    if model.healthConnected {
                        Button("Sincronizar ahora") { Task { await model.syncHealth() } }
                        Button("Desconectar Salud",role:.destructive) { Task { await model.disconnectHealth() } }
                    } else { Button("Conectar Apple Salud") { consenting = true } }
                    Text("Las actualizaciones en segundo plano dependen de iOS y del desbloqueo del iPhone. Al abrir la app se reintenta la sincronización. Si antes usabas un atajo, conectar esta app renueva su clave y desactiva la anterior.").font(.footnote).foregroundStyle(.secondary)
                }.disabled(model.busy)
                if !model.message.isEmpty { Section { Text(model.message).font(.callout) } }
                Section {
                    Link("Política de privacidad",destination:PulseAPI.website.appendingPathComponent("docs/privacy.html"))
                    Link("Soporte",destination:PulseAPI.website.appendingPathComponent("docs/support.html"))
                    Text("La eliminación de cuentas desde la app todavía no está disponible.").font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle("Perfil")
                .alert("¿Conectar Apple Salud?",isPresented:$consenting) {
                    Button("Cancelar",role:.cancel) { }
                    Button("Continuar") { Task { await model.connectHealth() } }
                } message: { Text("Se enviarán las mediciones autorizadas a tu cuenta PULSE en Supabase. Elige después los permisos en la pantalla de Salud.") }
        }
    }
}

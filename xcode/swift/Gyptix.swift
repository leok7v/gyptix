import SwiftUI
import SwiftData

@main
struct Gyptix: App {

    @Environment(\.scenePhase) private var scenePhase

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()
    
    var body: some Scene {
        WindowGroup {
            ContentView().frame(minWidth: 240, minHeight: 320)
            .onAppear { start(); setupTerminationObserver() }
            .onChange(of: scenePhase) { oldPhase, newPhase in
                if newPhase == .background || newPhase == .inactive {
                    inactive();
                }
            }
        }
        .modelContainer(sharedModelContainer)
    }

    private func setupTerminationObserver() {
        #if os(macOS)
        NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { _ in stop() }
        #elseif os(iOS)
        NotificationCenter.default.addObserver(
            forName: UIApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { _ in stop() }
        #endif
    }
    
}

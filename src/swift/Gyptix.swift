import SwiftUI
import SwiftData
#if os(macOS)
import AppKit
#endif

@main
struct Gyptix: App {

    @Environment(\.scenePhase) private var scenePhase
    
    
    init() { // Ensure default language is set
        UserDefaults.standard.set(["en-US"], forKey: "AppleLanguages")
        UserDefaults.standard.synchronize()
        // Debug: Print current locale to verify
        print("Current Locale: \(Locale.current.identifier)")
    }

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
            ContentView()
                .frame(minWidth: 240, minHeight: 320)
                .environment(\.locale, Locale(identifier: "en_US"))
                .onAppear {
                    applyWindowRestrictions()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        removeTabRelatedMenuItems()
                    }
                    guard let f = Bundle.main.url(forResource: "granite-3.1-1b-a400m-instruct-Q8_0.gguf",
                                                  withExtension: nil) else {
                        fatalError("Could not get bundle url")
                    }
                    start(f.absoluteString);
                    setupTerminationObserver()
                }
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    if newPhase == .background || newPhase == .inactive {
                        inactive();
                    }
                }
                .navigationTitle("GyPTix")
        }
        .commands { // Disable "New Window" (Cmd+N):
            CommandGroup(replacing: .newItem) { }
            CommandGroup(replacing: .toolbar) { }
            #if os(macOS)
            CommandGroup(replacing: .windowList) { }
            #endif
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
    
    private func applyWindowRestrictions() {
        #if os(macOS)
        for window in NSApplication.shared.windows {
            window.tabbingMode = .disallowed
        }
        if let window = NSApplication.shared.windows.first {
            window.performSelector(onMainThread: #selector(NSWindow.toggleTabBar(_:)), with: nil, waitUntilDone: false)
        }
        if let window = NSApplication.shared.windows.first {
            window.collectionBehavior = [.fullScreenPrimary]
            window.delegate = WindowDelegate.shared
        }
        #endif
    }
    

    private func removeTabRelatedMenuItems() {
        #if os(macOS)
        if let mainMenu = NSApplication.shared.mainMenu {
            for item in mainMenu.items {
//              print(item);
                if item.title == "Window" || item.title == "View" {
                    if let submenu = item.submenu {
                        for menuItem in submenu.items {
                            let title = menuItem.title.lowercased()
//                          print(menuItem);
                            if title.contains("tab") {
                                submenu.removeItem(menuItem)
                            }
                        }
                    }
                }
            }
        }
        #endif
    }
}

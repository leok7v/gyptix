import SwiftUI
import SwiftData
#if os(macOS)
import AppKit
#endif
#if os(iOS)
import UIKit
#endif
import WebKit
import Darwin

public var webView: WKWebView?

@main
struct Gyptix: App {
    @Environment(\.scenePhase) private var scenePhase
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif
    
    init() {
        UserDefaults.standard.set(["en-US"], forKey: "AppleLanguages")
        UserDefaults.standard.synchronize()
        print("Current Locale: \(Locale.current.identifier)")
    }

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([])
        let modelConfiguration = ModelConfiguration(schema: schema,
                                                    isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema,
                                      configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()
        
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.locale, Locale(identifier: "en_US"))
                #if os(macOS)
                .frame(minWidth: Gyptix.w, minHeight: Gyptix.h)
                #else
                .statusBar(hidden: true)
                .ignoresSafeArea(edges: .all)
                #endif
                .onAppear {
                    applyWindowRestrictions()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        removeTabRelatedMenuItems()
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                        debugger_attached()
                    }
                    guard let f = Bundle.main.url(
                        forResource: "granite-3.1-1b-a400m-instruct-Q8_0.gguf",
                        withExtension: nil) else {
                            fatalError("Could not get bundle url")
                    }
                    gyptix.load(f.absoluteString)
                    setupTerminationObserver()
                    AppRating.trackAppLaunch()
                }
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    if newPhase == .background || newPhase == .inactive {
                        inactive()
                    }
                }
        }
        .commands {
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
        ) { _ in
            inactive()
            gyptix.stop()
        }
        #elseif os(iOS)
        NotificationCenter.default.addObserver(
            forName: UIApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { _ in
            inactive()
            gyptix.stop()
        }
        #endif
    }
    
    private func applyWindowRestrictions() {
        #if os(macOS)
        for window in NSApplication.shared.windows {
            window.tabbingMode = .disallowed
        }
        if let window = NSApplication.shared.windows.first {
            window.performSelector(onMainThread:
                #selector(NSWindow.toggleTabBar(_:)),
                with: nil, waitUntilDone: false)
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
                if item.title == "Window" || item.title == "View" {
                    if let submenu = item.submenu {
                        for menuItem in submenu.items {
                            let title = menuItem.title.lowercased()
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
    
    #if DEBUG || os(iOS)
    static var w: CGFloat = 240.0
    static var h: CGFloat = 320.0
    #else
    static var w: CGFloat = 480.0
    static var h: CGFloat = 640.0
    #endif
}


#if os(iOS)
class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession:
                     UISceneSession, options: UIScene.ConnectionOptions)
    -> UISceneConfiguration {
        if application.connectedScenes.count > 1 {
            application.requestSceneSessionDestruction(
                connectingSceneSession,
                options: nil
            ) { error in
                print("Failed to discard scene: \(error)")
            }
            return UISceneConfiguration(
                name: "Default Configuration",
                sessionRole: connectingSceneSession.role
            )
        }
        let config = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
        config.sceneClass = UIWindowScene.self
        return config
    }
}
#endif

func is_debugger_attached() -> Bool {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    let result = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
    guard result == 0 else { return false }
    return (info.kp_proc.p_flag & P_TRACED) != 0
}

public func inactive() {
    guard let view = webView else { return }
    var wait = true
    view.evaluateJavaScript("app.inactive()") { result, error in
        if let error = error {
            print("Error calling javascript inactive(): \(error)")
        } else {
            if let r = result {
                if (is_debugger_attached()) {
                    print("javascript inactive() result: \(r)") // "done"
                }
            } else {
                print("javascript inactive(): no result")
            }
        }
        wait = false
    }
    // Wait for up to 5 seconds while processing the run loop
    let timeout = Date().addingTimeInterval(5)
    while wait && Date() < timeout {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
    }
//  let end = DispatchTime.now().uptimeNanoseconds
//  print("elapsed: \((end - start) / 1_000) microseconds") // 2.5ms
    gyptix.inactive()
}

public func debugger_attached() {
    guard let view = webView else { return }
    let attached = is_debugger_attached() ? "true" : "false"
    view.evaluateJavaScript("app.debugger_attached(" + attached + ")") {
        result, error in
        if let error = error {
            print("Error calling javascript debugger_attached(): \(error)")
        }
    }
}

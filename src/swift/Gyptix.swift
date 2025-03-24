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

public var keyboardHeight: CGFloat = 0
public var webView: WKWebView?
public var js_ready: Bool = false // JavaScript app is initialized

@main
struct Gyptix: App {
    @Environment(\.scenePhase) private var scenePhase
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif

    init() {
        UserDefaults.standard.set(is_debugger_attached(),
                                  forKey: "WebKitDeveloperExtras")
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
                #else // iOS
                .statusBar(hidden: true)
                .ignoresSafeArea(edges: .all)
                #endif
                .onAppear {
                    #if os(iOS)
                    setupKeyboardHandlers()
                    #endif
                    applyWindowRestrictions()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        removeTabRelatedMenuItems()
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
            close_all_windows()
            gyptix_stop()
        }
        #elseif os(iOS)
        NotificationCenter.default.addObserver(
            forName: UIApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { _ in
            inactive()
            gyptix_stop()
        }
        #endif
    }
    
    private func applyWindowRestrictions() {
        #if os(macOS)
        for window in NSApplication.shared.windows {
            window.tabbingMode = .disallowed
            window_border(window)
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
    
    #if os(macOS)
    func window_border(_ window: NSWindow) {
        guard let view = window.contentView else { return }
        view.wantsLayer = true
        view.layer?.borderWidth = 1.0
        view.layer?.borderColor = NSColor(red: 0.51, green: 0.51, blue: 0.49, alpha: 0.125).cgColor
    }
    #endif
    
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

func setupKeyboardHandlers() {
    NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillShowNotification,
                                           object: nil,
                                           queue: .main) { notification in
        if let info = notification.userInfo,
           let frame = info[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
            keyboardHeight = frame.height
            print("keyboardHeight \(keyboardHeight)")
        }
    }
    NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillHideNotification,
                                           object: nil,
                                           queue: .main) { _ in
        keyboardHeight = 0
        print("keyboardHeight \(keyboardHeight)")
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
    let timing = false
    // if webView is not yet initialized it does not need app.inactive() call
    if (!js_ready) { return }
    let start = DispatchTime.now().uptimeNanoseconds
    let r = call_js("app.inactive()", sync: true)
    let end = DispatchTime.now().uptimeNanoseconds
    if (is_debugger_attached() && timing) {
        print("elapsed: \((end - start) / 1_000) microseconds") // 2.5ms
        print("app.inactive() -> \(r)")
    }
    gyptix.inactive()
}

public func debugger_attached() {
    let attached = is_debugger_attached() ? "true" : "false"
    let r = call_js("app.debugger_attached(\(attached))", sync: true)
    if (r == "") {
        print("app.debugger_attached(\(attached)) -> \(r)")
    }
}

public func gyptix_stop() { // stop backend unload model from GPU:
    let timing = false
    let start = DispatchTime.now().uptimeNanoseconds
    gyptix.stop()
    let end = DispatchTime.now().uptimeNanoseconds
    if (is_debugger_attached() && timing) {
        print("gyptix.stop(): \((end - start) / 1_000) microseconds") // 2.5ms
    }
}

public func close_all_windows() {
    #if os(macOS)
    DispatchQueue.main.async {
        NSApplication.shared.windows.forEach { $0.close() }
    }
    #endif
}

import SwiftUI
import SwiftData
#if os(macOS)
import AppKit
#endif
import WebKit

public var js_ready = false
public var web_view: WKWebView?
public var keyboard: CGRect = .zero // keyboard frame

public let gguf = "granite-3.1-1b-a400m-instruct-Q8_0.gguf"

@main
struct Gyptix: App {
    @Environment(\.scenePhase) private var phase

    init() {
        UserDefaults.standard.set(is_debugger_attached() || is_debug_build(),
                                  forKey: "WebKitDeveloperExtras")
    }

    var model: ModelContainer = {
        let s = Schema([])
        let c = ModelConfiguration(schema: s, isStoredInMemoryOnly: false)
        do { return try ModelContainer(for: s, configurations: [c]) }
        catch { fatalError("ModelContainer failed: \(error)") }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.locale, Locale(identifier: "en_US"))
                #if os(iOS)
                .statusBar(hidden: true)
                .ignoresSafeArea(edges: .all)
                #else // os(macOS)
                .frame(minWidth: Gyptix.w, minHeight: Gyptix.h)
                #endif
                .onAppear {
                    on_appear()
                }
                .onChange(of: phase) { _, new in
                    if new == .background || new == .inactive { inactive() }
                }
        }
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandGroup(replacing: .toolbar) { }
            #if os(macOS)
            CommandGroup(replacing: .windowList) { }
            #endif
        }
        .modelContainer(model)
    }
    
    #if DEBUG
    static var w: CGFloat = 240
    static var h: CGFloat = 320
    #else
    static var w: CGFloat = 480
    static var h: CGFloat = 640
    #endif


}

#if !os(iOS) // os(macOS)

private func setup_termination() {
    NotificationCenter.default.addObserver(
        forName: NSApplication.willTerminateNotification,
        object: nil,
        queue: .main
    ) { _ in inactive(); close_all_windows(); gyptix_stop() }
}

private func restrict_windows() {
    for w in NSApplication.shared.windows {
        w.tabbingMode = .disallowed
        window_border(w)
    }
    if let w = NSApplication.shared.windows.first {
        w.performSelector(onMainThread:
                          #selector(NSWindow.toggleTabBar(_:)),
                          with: nil, waitUntilDone: false)
        w.collectionBehavior = [.fullScreenPrimary]
        w.delegate = WindowDelegate.shared
    }
}

private func window_border(_ w: NSWindow) {
    guard let v = w.contentView else { return }
    v.wantsLayer = true
    v.layer?.borderWidth = 1.0
    v.layer?.borderColor = NSColor(red: 0.51, green: 0.51, blue: 0.49, alpha: 0.125).cgColor
}

private func trim_menu() {
    if let m = NSApplication.shared.mainMenu {
        for i in m.items where i.title == "Window" || i.title == "View" {
            if let s = i.submenu {
                for mi in s.items where mi.title.lowercased().contains("tab") {
                    s.removeItem(mi)
                }
            }
        }
    }
}

func close_all_windows() {
    let windows = NSApplication.shared.windows
    DispatchQueue.main.async { windows.forEach { $0.close() } }
}

#endif

public func on_appear() {
    #if !os(iOS)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { trim_menu() }
    restrict_windows()
    setup_termination()
    #endif
    AppRating.trackAppLaunch()
    if let f = Bundle.main.url(forResource: gguf, withExtension: nil) {
        DispatchQueue.main.async { gyptix.load(f.absoluteString) }
    } else {
        fatalError("Resource not found: \(gguf)")
    }
}

func is_debug_build() -> Bool {
    #if DEBUG
        return true
    #else
        return false
    #endif
}

public func is_debugger_attached() -> Bool {
    var i = kinfo_proc()
    var s = MemoryLayout<kinfo_proc>.stride
    var m: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    let r = sysctl(&m, UInt32(m.count), &i, &s, nil, 0)
    guard r == 0 else { return false }
    return (i.kp_proc.p_flag & P_TRACED) != 0
}

public func inactive() {
    let t = false
    if !js_ready { return }
    let s = DispatchTime.now().uptimeNanoseconds
    let r = call_js("app.inactive()", sync: true)
    let e = DispatchTime.now().uptimeNanoseconds
    if is_debugger_attached() && t {
        print("elapsed: \((e - s) / 1_000) us")
        print("app.inactive() -> \(r)")
    }
    gyptix.inactive()
}

public func debugger_attached() {
    let a = is_debugger_attached() ? "true" : "false"
    let r = call_js("app.debugger_attached(\(a))", sync: true)
    if r == "" { print("app.debugger_attached(\(a)) -> \(r)") }
}

public func gyptix_stop() {
    let t = false
    let s = DispatchTime.now().uptimeNanoseconds
    gyptix.stop()
    let e = DispatchTime.now().uptimeNanoseconds
    if is_debugger_attached() && t { print("gyptix.stop(): \((e - s) / 1_000) us") }
}


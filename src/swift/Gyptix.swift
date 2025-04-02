import SwiftUI
import SwiftData
import WebKit
#if os(iOS)
import StoreKit
#endif

public var js_ready = false
public var web_view: WKWebView?
public var keyboard: CGRect = .zero // keyboard frame
public let timing = true

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

// replacing max_bounds().* with .inifinity leads to
// internal NaN exceptions in some parts of SwiftUI code...

func max_bounds() -> CGRect {
    #if os(iOS)
        var rect = CGRect.null
        for session in UIApplication.shared.openSessions {
            if let ws = session.scene as? UIWindowScene {
                rect = rect.union(ws.screen.bounds)
            }
        }
        return rect
    #else
        return NSScreen.screens.reduce(CGRect.null) { rect, screen in
            rect.union(screen.frame)
        }
    #endif
}

public let schemeHandler = FileSchemeHandler()

struct ContentView: View {
    
    var body: some View {
        WebView().edgesIgnoringSafeArea(.all)
            .frame(maxWidth:  max_bounds().width,
                   maxHeight: max_bounds().height)
    }
    
}

public class FileSchemeHandler: NSObject, WKURLSchemeHandler {

    public func webView(_ webView: WKWebView,
                        start urlSchemeTask: WKURLSchemeTask) {

        func failWithError() {
            let error = NSError(domain: NSURLErrorDomain,
                                code: NSURLErrorResourceUnavailable,
                                userInfo: nil);
            urlSchemeTask.didFailWithError(error);
        }
        guard
        let u = urlSchemeTask.request.url,
        let p = u.path.removingPercentEncoding else {
            failWithError(); return
        }
        let path = p.hasPrefix("/") ? String(p.dropFirst()) : p
        guard let r = response(u, mt: mime_type(for: p)) else {
            failWithError(); return
        }
        if dispatch_post(path, urlSchemeTask, u) { return }
        if dispatch_get(path, urlSchemeTask, u) { return }
        if path == "quit" {
            let _ = quit()
            return
        }
        guard let f = Bundle.main.url(forResource: path,
                                      withExtension: nil) else {
            failWithError(); return
        }
        let ext = URL(fileURLWithPath: path).pathExtension.lowercased()
        let binary = ["png", "jpg", "jpeg", "gif", "ico", "webp"].contains(ext)
        urlSchemeTask.didReceive(r)
        if binary {
            guard let data = try? Data(contentsOf: f) else {
                failWithError(); return
            }
            urlSchemeTask.didReceive(data)
        } else {
            guard
                let fileContent = try? String(contentsOf: f, encoding: .utf8),
                let data = fileContent.data(using: .utf8) else {
                    failWithError(); return
            }
            urlSchemeTask.didReceive(data)
        }
        urlSchemeTask.didFinish()
    }

    public func webView(_ webView: WKWebView,
                        stop urlSchemeTask: WKURLSchemeTask) {
    }

}

public func body(_ task: WKURLSchemeTask, _ url: URL) -> String {
    if let body = task.request.httpBody {
        guard let s = String(data: body, encoding: .utf8) else {
            print("Failed to decode body as UTF-8 string.")
            return ""
        }
        return s
    } else {
        return ""
    }
}

private let allowedOrigin = "gyptix://"

public func response(_ u: URL, mt: String) -> HTTPURLResponse? {
    let responseHeaders = [
        "Access-Control-Allow-Origin": allowedOrigin,
        "Content-Type": mt,
    ]
    return HTTPURLResponse(url: u,
                           statusCode: 200,
                           httpVersion: "HTTP/1.1",
                           headerFields: responseHeaders)
}

public func send_response(_ u: URL, _ t: WKURLSchemeTask, _ s: String) {
    if let r = response(u, mt: "text/plain") {
        t.didReceive(r)
        if let data = s.data(using: .utf8) {
            t.didReceive(data)
            t.didFinish()
        } else {
            print("Failed to encode response body as UTF-8: ", s)
            t.didReceive(Data()) // send empty string
            t.didFinish()
        }
    }
}

public func mime_type(for p: String) -> String {
    switch URL(fileURLWithPath: p).pathExtension.lowercased() {
        case "html", "htm": return "text/html"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        default: return "application/octet-stream"
    }
}

private let appID = "6741091005"  // App Store ID

struct AppRating {

    static func trackAppLaunchDelayed() {
        let debugRating = false   // Debug mode: Always request review
        let now = Date().timeIntervalSince1970
        let oneDay: TimeInterval = 24 * 60 * 60
        let oneWeek: TimeInterval = 7 * oneDay
        let oneMonth: TimeInterval = 4 * oneWeek
        let uds = UserDefaults.standard
        var appLaunchCount   = uds.integer(forKey: "appLaunchCount")
        var lastPromptDate   = uds.double(forKey:  "lastPromptDate")
        var firstLaunchDate  = uds.double(forKey:  "firstLaunchDate")
        var ratingShownCount = uds.integer(forKey: "ratingShownCount")
        if firstLaunchDate == 0 {
            UserDefaults.standard.set(now, forKey: "firstLaunchDate")
            firstLaunchDate = now
        }
        if lastPromptDate == 0 {
            UserDefaults.standard.set(now, forKey: "lastPromptDate")
            lastPromptDate = now
        }
        // Determine rating frequency based on how many times it's been shown
        let ratingInterval: TimeInterval
        switch ratingShownCount {
            case 0...6:  ratingInterval = oneWeek  // Daily for first 7 times
            default:     ratingInterval = oneMonth // Monthly afterward
        }
        appLaunchCount += 1
        UserDefaults.standard.set(appLaunchCount, forKey: "appLaunchCount")
        if debugRating || (now - lastPromptDate > ratingInterval) {
            rate()
            UserDefaults.standard.set(now, forKey: "lastPromptDate")
            ratingShownCount += 1
            UserDefaults.standard.set(ratingShownCount,
                                      forKey: "ratingShownCount")
        }
    }

    static func rate() {
        #if os(iOS)
            if let windowScene = UIApplication.shared.connectedScenes.first
                as? UIWindowScene {
                SKStoreReviewController.requestReview(in: windowScene)
            }
        #else // os(macOS)
            rateManually(appID: appID)
        #endif
        var ratingShownCount =
            UserDefaults.standard.integer(forKey: "ratingShownCount")
        ratingShownCount += 1
        UserDefaults.standard.set(ratingShownCount,
                                  forKey: "ratingShownCount")
    }

    static func trackAppLaunch() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            AppRating.trackAppLaunchDelayed()
        }
    }
    
    static func rateManually(appID: String) {
        let u = "https://apps.apple.com/us/app/gyptix/id\(appID)"
        if let url = URL(string: "\(u)?action=write-review") {
            #if os(iOS)
                UIApplication.shared.open(url)
            #else // os(macOS)
                NSWorkspace.shared.open(url)
            #endif
        }
    }
    
}


#if !os(iOS) // os(macOS)

class WindowDelegate: NSObject, NSWindowDelegate {
    static let shared = WindowDelegate()

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        return true
    }
    
    func windowWillClose(_ notification: Notification) {
        NSApplication.shared.terminate(nil)
    }
}

private func setup_termination() {
    NotificationCenter.default.addObserver(
        forName: NSApplication.willTerminateNotification,
        object: nil,
        queue: .main
    ) { _ in inactive(); gyptix_stop(); close_all_windows() }
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
    v.layer?.borderColor = NSColor(red: 0.51, green: 0.51, blue: 0.49,
                                   alpha: 0.125).cgColor
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
    if !js_ready { return }
    var s = DispatchTime.now().uptimeNanoseconds
    let r = call_js("app.inactive()", sync: true)
    var e = DispatchTime.now().uptimeNanoseconds
    if is_debugger_attached() { print("app.inactive() -> \(r)") }
    if timing && is_debugger_attached() {
        print("app.inactive(): \((e - s) / 1_000_000)ms")
    }
    s = DispatchTime.now().uptimeNanoseconds
    gyptix.inactive()
    e = DispatchTime.now().uptimeNanoseconds
    if timing && is_debugger_attached() {
        print("gyptix.inactive(): \((e - s) / 1_000_000)ms")
    }
}

public func debugger_attached() {
    let a = is_debugger_attached() ? "true" : "false"
    let r = call_js("app.debugger_attached(\(a))", sync: true)
    if r == "" { print("app.debugger_attached(\(a)) -> \(r)") }
}

public func gyptix_stop() {
    let s = DispatchTime.now().uptimeNanoseconds
    gyptix.stop()
    let e = DispatchTime.now().uptimeNanoseconds
    if timing && is_debugger_attached() {
        print("gyptix.stop(): \((e - s) / 1_000_000)ms")
    }
}


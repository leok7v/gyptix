import Darwin
import Metal
import SwiftData
import SwiftUI
import WebKit
#if os(iOS)
import StoreKit
typealias Window = UIWindow
#elseif os(macOS)
typealias Window = NSWindow
#endif

let origin = "gyptix://"

public // JavaScript app "gyptix://./app.js"
let app = "app" // experiments: app1, app2, app3

let gguf = "granite-3.1-1b-a400m-instruct-Q8_0.gguf" // model

var js_ready = false
var web_view: WKWebView?
var keyboard: CGRect = .zero // keyboard frame
let timing = false

@main
struct Gyptix: App {
    
    @Environment(\.scenePhase) var phase

    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif

    init() { startup() }

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
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(.all, edges: [.top, .bottom])
                #else // os(macOS)
                .frame(minWidth: Gyptix.w, minHeight: Gyptix.h)
                #endif
                .onAppear { on_appear() }
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

struct ContentView: View { var body: some View { WebView() } }

class FileSchemeHandler: NSObject, WKURLSchemeHandler {

    func webView(_ webView: WKWebView,
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

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) { }

}

func response(_ u: URL, mt: String) -> HTTPURLResponse? {
    let responseHeaders = [
        "Access-Control-Allow-Origin": origin,
        "Content-Type": mt,
    ]
    return HTTPURLResponse(url: u,
                           statusCode: 200,
                           httpVersion: "HTTP/1.1",
                           headerFields: responseHeaders)
}

func send_response(_ u: URL, _ t: WKURLSchemeTask, _ s: String) {
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

func mime_type(for p: String) -> String {
    switch URL(fileURLWithPath: p).pathExtension.lowercased() {
        case "html", "htm": return "text/html"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        default: return "application/octet-stream"
    }
}

let appID = "6741091005"  // App Store ID

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
            let ws = UIApplication.shared.connectedScenes
            if let scene = ws.first as? UIWindowScene {
                SKStoreReviewController.requestReview(in: scene)
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

#if os(iOS)

class AppDelegate: NSObject, UIApplicationDelegate {
    var backgroundSessionCompletionHandler: (() -> Void)?

    func application(_ application: UIApplication,
                     handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        backgroundSessionCompletionHandler = completionHandler
    }
}

#endif

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

func setup_termination() {
    NotificationCenter.default.addObserver(
        forName: NSApplication.willTerminateNotification,
        object: nil,
        queue: .main
    ) { _ in inactive(); gyptix_stop(); close_all_windows() }
}

func restrict_windows() {
    if let w = window() {
        w.tabbingMode = .disallowed
        window_border(w)
        w.performSelector(onMainThread:
                          #selector(NSWindow.toggleTabBar(_:)),
                          with: nil, waitUntilDone: false)
        w.collectionBehavior = [.fullScreenPrimary]
        w.delegate = WindowDelegate.shared
    }
}

func window_border(_ w: NSWindow) {
    guard let v = w.contentView else { return }
    v.wantsLayer = true
    v.layer?.borderWidth = 1.0
    v.layer?.borderColor = NSColor(red: 0.51, green: 0.51, blue: 0.49,
                                   alpha: 0.125).cgColor
}

func trim_menu() {
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
    DispatchQueue.main.async { window()?.close() }
}

#endif

func window() -> Window? {
    #if os(iOS)
        let ws = UIApplication.shared.connectedScenes
        let cs = ws.compactMap({ $0 as? UIWindowScene }).first
        return cs?.windows.first
    #elseif os(macOS)
        return NSApplication.shared.windows.first
    #else
        return nil
    #endif
}

func is_first_run() -> Bool {
    !UserDefaults.standard.bool(forKey: "first_run_done")
}

func on_appear() {
    #if os(macOS)
    if is_first_run(), let win = NSApplication.shared.windows.first {
        win.setContentSize(NSSize(width: Gyptix.w, height: Gyptix.h))
        win.center()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { trim_menu() }
    restrict_windows()
    setup_termination()
    #else
    if let wv = web_view, let parent = wv.superview {
        wv.translatesAutoresizingMaskIntoConstraints = false
        parent.keyboardLayoutGuide.usesBottomSafeArea = false
        NSLayoutConstraint.activate([
            wv.topAnchor.constraint(equalTo: parent.topAnchor),
            wv.bottomAnchor.constraint(equalTo: parent.keyboardLayoutGuide.topAnchor),
            wv.leadingAnchor.constraint(equalTo: parent.leadingAnchor),
            wv.trailingAnchor.constraint(equalTo: parent.trailingAnchor)
        ])
    }
    #endif
    AppRating.trackAppLaunch()
    if let f = Bundle.main.url(forResource: gguf, withExtension: nil) {
        DispatchQueue.main.async { gyptix.load(f.absoluteString) }
    } else {
        fatalError("Resource not found: \(gguf)")
    }
    UserDefaults.standard.set(true, forKey: "first_run_done")
}

func is_debug_build() -> Bool {
    #if DEBUG
        return true
    #else
        return false
    #endif
}

func is_debugger_attached() -> Bool {
    var i = kinfo_proc()
    var s = MemoryLayout<kinfo_proc>.stride
    var m: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    let r = sysctl(&m, UInt32(m.count), &i, &s, nil, 0)
    guard r == 0 else { return false }
    return (i.kp_proc.p_flag & P_TRACED) != 0
}

func is_running_in_test_flight() -> Bool {
    if let receiptURL = Bundle.main.appStoreReceiptURL {
        return receiptURL.path.contains("sandboxReceipt")
    }
    return false
}

func inactive() {
    if !js_ready { return }
    var s = DispatchTime.now().uptimeNanoseconds
    let r = call_js("app.inactive()", sync: true)
    var e = DispatchTime.now().uptimeNanoseconds
//  if is_debugger_attached() { print("app.inactive() -> \(r)") }
    print("timing \(timing)")
    if timing && is_debugger_attached() {
        print("app.inactive(): \((e - s) / 1_000_000)ms -> \(r)")
    }
    s = DispatchTime.now().uptimeNanoseconds
    gyptix.inactive()
    e = DispatchTime.now().uptimeNanoseconds
    if timing && is_debugger_attached() {
        print("gyptix.inactive(): \((e - s) / 1_000_000)ms")
    }
}

func debugger_attached() {
    let a = is_debugger_attached() ? "true" : "false"
    let r = call_js("app.debugger_attached(\(a))", sync: true)
    if r == "" { print("app.debugger_attached(\(a)) -> \(r)") }
    print("is_running_in_test_flight(): \(is_running_in_test_flight())")
}

func gyptix_stop() {
    let s = DispatchTime.now().uptimeNanoseconds
    gyptix.stop()
    let e = DispatchTime.now().uptimeNanoseconds
    if timing && is_debugger_attached() {
        print("gyptix.stop(): \((e - s) / 1_000_000)ms")
    }
}

private func memory_stats() -> (total: UInt64, free: UInt64) {
    let total = ProcessInfo.processInfo.physicalMemory
    var s = vm_statistics64()
    var n = mach_msg_type_number_t(
        MemoryLayout.size(ofValue: s) /
        MemoryLayout<integer_t>.size)
    var pg: vm_size_t = 0
    host_page_size(mach_host_self(), &pg)
    _ = withUnsafeMutablePointer(to: &s) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(n)) {
            host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &n)
        }
    }
    let free = UInt64(s.free_count) * UInt64(pg)
    return (total, free)
}

private func free_storage() -> UInt64 {
    let path = NSHomeDirectory()
    let attr = try? FileManager.default
        .attributesOfFileSystem(forPath: path)
    let v = attr?[.systemFreeSize] as? NSNumber
    return v?.uint64Value ?? 0
}

func startup() {
    UserDefaults.standard.set(is_debugger_attached() || is_debug_build(),
                              forKey: "WebKitDeveloperExtras")
    #if os(macOS)
        gyptix.set_platform("macOS");
    #else
        var p = ""
        if #available(iOS 14, *) {
            /* .ipa on Mac  ➜  isiOSAppOnMac  */
            if ProcessInfo.processInfo.isiOSAppOnMac {
                p = "macOS"
                gyptix.startup.is_iOS_app_on_mac = 1
            }
            if ProcessInfo.processInfo.isMacCatalystApp {
                p = "macOS"
                gyptix.startup.is_mac_catalyst_app = 1
            }
        }
        if (p == "") {
            switch UIDevice.current.userInterfaceIdiom {
                case .pad:   p = "iPad"
                case .phone: p = "iPhone"
                default:     p = "iPhone"
            }
        }
        gyptix.set_platform(p)
    #endif
    if #available(iOS 14, *) {
        gyptix.startup.cpu = Int32(ProcessInfo.processInfo.processorCount)
        gyptix.startup.active_cpu =
            Int32(ProcessInfo.processInfo.activeProcessorCount)
    }
    let ram = memory_stats()
    let storage = free_storage()
    let MB = 1024.0 * 1024.0
    let GB = MB * 1024.0
    print("RAM.total: \(String(format: "%8.3f", Double(ram.total) / GB)) GB")
    print("RAM.free : \(String(format: "%8.3f", Double(ram.free)  / MB)) MB")
    print("Storage  : \(String(format: "%8.3f", Double(storage)   / GB)) GB")
    print("CPUs     : \(gyptix.startup.cpu) active: \(gyptix.startup.active_cpu)")
    gyptix.startup.ram     = Double(ram.total)
    gyptix.startup.storage = Double(storage)
    if let device = MTLCreateSystemDefaultDevice() {
        if #available(macOS 10.15, iOS 13.0, *) {
            gyptix.startup.gpu.recommended_max_working_set_size =
                Double(device.recommendedMaxWorkingSetSize)
            gyptix.startup.gpu.has_unified_memory =
                device.hasUnifiedMemory ? 1 : 0
            let wss = Double(gyptix.startup.gpu.recommended_max_working_set_size);
            print("GPU w.s.s: \(String(format: "%8.3f", wss / GB)) GB")
            if device.hasUnifiedMemory {
                print("GPU has unified memory")
            }
        }
    }
}

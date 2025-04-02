import SwiftUI
@preconcurrency
import WebKit

#if os(iOS)
typealias ViewRepresentable = UIViewRepresentable
typealias Context = UIViewRepresentableContext<WebView>
#else
typealias ViewRepresentable = NSViewRepresentable
typealias Context = NSViewRepresentableContext<WebView>
#endif

let app = "app" // experiments: app2, app3

struct WebView: ViewRepresentable {
    
    init() { }
    
    class Coordinator: NSObject, WKNavigationDelegate {
        
        let parent: WebView
        
        init(_ parent: WebView) { self.parent = parent; super.init() }
        
        func webView(_ webView: WKWebView,
             decidePolicyFor navigationAction: WKNavigationAction,
             decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url {
                #if os(iOS)
                UIApplication.shared.open(url, options: [:],
                                          completionHandler: nil)
                #else // os(macOS)
                NSWorkspace.shared.open(url)
                #endif
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
        
        func webView(_ webView: WKWebView,
                     didFinish navigation: WKNavigation!) { }
        
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func create_web_view() -> WKWebView {
        let debugger = is_debugger_attached() || is_debug_build()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "gyptix")
        config.preferences.setValue(debugger, forKey: "developerExtrasEnabled")
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isInspectable = debugger
        print("isInspectable: ", wv.isInspectable)
        #if os(iOS)
        wv.isOpaque = false
        wv.backgroundColor = .clear
        wv.allowsBackForwardNavigationGestures = false
        wv.scrollView.backgroundColor = .clear
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.delaysContentTouches = false
        #else
        wv.setValue(false, forKey: "drawsBackground")
        #endif
        web_view = wv
        return wv
    }

    func load(_ wv: WKWebView) {
        if let url = URL(string: "gyptix://./\(app).html") {
            wv.load(URLRequest(url: url))
        } else {
            fatalError("failed to load")
        }
    }
    
    func make_view(_ context: Context) -> WKWebView {
        let wv = create_web_view()
        wv.navigationDelegate = context.coordinator
        load(wv)
        return wv
    }

    #if os(iOS)

    func makeUIView(context: Context) -> UIView { make_view(context) }

    func updateUIView(_ uiView: UIView, context: Context) { }

    #else // macOS

    func makeNSView(context: Context) -> WKWebView { make_view(context) }

    func updateNSView(_ nsView: WKWebView, context: Context) { }

    #endif
}

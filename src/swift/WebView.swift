import SwiftUI
@preconcurrency
import WebKit
#if os(macOS)
import AppKit
#endif

#if os(macOS)
public typealias ViewRepresentable = NSViewRepresentable
#elseif os(iOS)
public typealias ViewRepresentable = UIViewRepresentable
#endif

struct WebView: ViewRepresentable {
    let htmlFileName: String
    let schemeHandler: WKURLSchemeHandler
    
    init(htmlFileName: String, schemeHandler: WKURLSchemeHandler) {
        self.htmlFileName = htmlFileName
        self.schemeHandler = schemeHandler
    }
    
    class Coordinator: NSObject, WKNavigationDelegate {
        let parent: WebView
        init(_ parent: WebView) {
            self.parent = parent
        }
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url {
                #if os(iOS)
                UIApplication.shared.open(url, options: [:],
                                          completionHandler: nil)
                #elseif os(macOS)
                NSWorkspace.shared.open(url)
                #endif
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
    
    #if os(macOS)
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "gyptix")
        config.preferences.setValue(is_debugger_attached(), forKey: "developerExtrasEnabled")
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isInspectable = is_debugger_attached()
        #if DEBUG
        wv.isInspectable = true // always inspectable in DEBUG build
        #endif
        wv.setValue(false, forKey: "drawsBackground")
        wv.navigationDelegate = context.coordinator
        webView = wv
        if let url = URL(string: "gyptix://./" + self.htmlFileName + ".html") {
            wv.load(URLRequest(url: url))
        }
        return wv
    }
    
    func updateNSView(_ nsView: WKWebView, context: Context) {
        // Handle updates if needed
    }
    
    #elseif os(iOS)
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "gyptix")
        let wv = WKWebView(frame: .zero, configuration: config)
//      wv.configuration.preferences.setValue(true,
//              forKey: "allowFileAccessFromFileURLs")
//      wv.configuration.setValue(true,
//              forKey: "_allowCrossOriginResourcePolicy")
//      wv.configuration.setValue(true,
//              forKey: "allowUniversalAccessFromFileURLs")
        wv.isInspectable = is_debugger_attached()
        #if DEBUG
        wv.isInspectable = true // always inspectable in DEBUG build
        #endif
        wv.isOpaque = false
        wv.backgroundColor = .clear
        wv.allowsBackForwardNavigationGestures = false
        wv.scrollView.backgroundColor = .clear
        wv.scrollView.isScrollEnabled = false // prevents input scroll up
        wv.scrollView.contentInsetAdjustmentBehavior = .automatic
        wv.translatesAutoresizingMaskIntoConstraints = false
        wv.navigationDelegate = context.coordinator
        webView = wv
        if let url = URL(string: "gyptix://./" + self.htmlFileName + ".html") {
            wv.load(URLRequest(url: url))
        }
        return wv
    }
    
    func updateUIView(_ uiView: WKWebView, context: Context) {
        // Handle updates if needed
    }
    #endif
    
    #if os(iOS)
    typealias Context = UIViewRepresentableContext<WebView>
    #else
    typealias Context = NSViewRepresentableContext<WebView>
    #endif
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
}


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
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.configuration.preferences.setValue(true,
                forKey: "allowFileAccessFromFileURLs")
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator
        if let url = URL(string: "gyptix://./" + self.htmlFileName + ".html") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }
    
    func updateNSView(_ nsView: WKWebView, context: Context) {
        // Handle updates if needed
    }
    #elseif os(iOS)
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "gyptix")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.configuration.preferences.setValue(true,
                forKey: "allowFileAccessFromFileURLs")
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.allowsBackForwardNavigationGestures = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.isScrollEnabled = false // prevents input scroll up
        webView.navigationDelegate = context.coordinator
        if let url = URL(string: "gyptix://./" + self.htmlFileName + ".html") {
            webView.load(URLRequest(url: url))
        }
        return webView
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

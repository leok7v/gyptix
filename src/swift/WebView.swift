import SwiftUI
import WebKit

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

    func loadHTML() -> String? {
        guard let bundleURL = Bundle.main.url(forResource: htmlFileName,
                                              withExtension: "html") else {
            return nil
        }
        let fileURL = bundleURL.deletingLastPathComponent()
                            .appendingPathComponent(htmlFileName + ".html")
        print("fileURL: \(fileURL)")
        let s = try? String(contentsOf: fileURL, encoding: .utf8)
        return s;
    }

#if os(macOS)
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "hyperapp")
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
//      config.preferences.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
//      webView.configuration.preferences.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        // Make background transparent
        webView.setValue(false, forKey: "drawsBackground")
//      if let htmlContent = loadHTML() {
//          webView.loadHTMLString(htmlContent, baseURL: Bundle.main.bundleURL)
//      }
        if let url = URL(string: "hyperapp://./index.html") {
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
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "hyperapp")
//      config.preferences.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear

        
//      if let htmlContent = loadHTML() {
//          webView.loadHTMLString(htmlContent, baseURL: Bundle.main.bundleURL)
//      }
        if let url = URL(string: "hyperapp://./index.html") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // Handle updates if needed
    }
#endif
}

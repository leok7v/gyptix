import SwiftUI
@preconcurrency
import WebKit

#if os(iOS)
typealias ViewRepresentable = UIViewRepresentable
#else
typealias ViewRepresentable = NSViewRepresentable
#endif

struct WebView: ViewRepresentable {
    
    #if os(iOS)
    typealias Context = UIViewRepresentableContext<WebView>
    #else
    typealias Context = NSViewRepresentableContext<WebView>
    #endif

    
    init() { }
    
    class Coordinator: NSObject, WKNavigationDelegate {
        
        let parent: WebView
        
        init(_ parent: WebView) {
            self.parent = parent
            super.init()
            #if os(iOS)
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(keyboardWillShow),
                name: UIResponder.keyboardWillShowNotification,
                object: nil
            )
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(keyboardWillHide),
                name: UIResponder.keyboardWillHideNotification,
                object: nil
            )
            #endif
        }
        
        // Handle navigation actions (existing logic)
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url {
                #if os(iOS)
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
                #else // os(macOS)
                NSWorkspace.shared.open(url)
                #endif
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
        
        #if os(iOS)
        
        @objc func keyboardWillShow(_ notification: Notification) {
            let info_key = UIResponder.keyboardFrameEndUserInfoKey
            if let kf = notification.userInfo?[info_key] as? CGRect,
               let wv = web_view {
                keyboard = kf
                let h = kf.height
//              print("keyboard_frame: \(keyboard)")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.125) {
                    let height = UIScreen.main.bounds.height - h
                    wv.frame.size.height = height
                    wv.scrollView.frame.size.height = height
                    wv.superview?.frame.size.height = height
                }
                wv.scrollView.setContentOffset(.zero, animated: true)
            }
        }
        
        @objc func keyboardWillHide(_ notification: Notification) {
            if let wv = web_view {
                keyboard = .zero
//              print("keyboard_frame: \(keyboard)")
                wv.superview?.frame.origin.y = 0
                let h = UIScreen.main.bounds.height
                wv.frame.size.height = h
                wv.scrollView.frame.size.height = h
                wv.superview?.frame.size.height = h
            }
        }
        
        #endif
        
        deinit {
            #if os(iOS) // Clean up observers
            NotificationCenter.default.removeObserver(self,
                  name: UIResponder.keyboardWillShowNotification, object: nil)
            NotificationCenter.default.removeObserver(self,
                  name: UIResponder.keyboardWillHideNotification, object: nil)
            #endif
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func create_web_view() -> WKWebView {
        let debugger = is_debugger_attached()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "gyptix")
        config.preferences.setValue(debugger, forKey: "developerExtrasEnabled")
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isInspectable = debugger
        #if DEBUG
        wv.isInspectable = true
        #endif
        print("isInspectable: ", wv.isInspectable)
        #if os(iOS)
        wv.isOpaque = false
        wv.backgroundColor = .clear
        wv.allowsBackForwardNavigationGestures = false
        wv.scrollView.backgroundColor = .clear
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.delaysContentTouches = false
        wv.translatesAutoresizingMaskIntoConstraints = true
        wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        #else
        wv.setValue(false, forKey: "drawsBackground")
        #endif
        web_view = wv
        return wv
    }

    func load(_ wv: WKWebView) {
        if let url = URL(string: "gyptix://./app.html") {
            wv.load(URLRequest(url: url))
        } else {
            fatalError("failed to load")
        }
    }
    
    #if os(iOS)
    
    func makeUIView(context: Context) -> UIView {
        let wv = create_web_view()
        wv.navigationDelegate = context.coordinator
        load(wv)
        return wv
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        // No frame manipulation; SwiftUI’s .frame handles height
        print("updateUIView")
    }

    #else // macOS

    func makeNSView(context: Context) -> WKWebView {
        let wv = create_web_view()
        wv.navigationDelegate = context.coordinator
        load(wv)
        return wv
    }
    
    func updateNSView(_ nsView: WKWebView, context: Context) {
        // No frame manipulation; SwiftUI handles it
        print("updateNSView")
    }

    #endif
}

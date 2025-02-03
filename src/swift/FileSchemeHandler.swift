import Foundation
import WebKit

class FileSchemeHandler: NSObject, WKURLSchemeHandler {

    func infer(_ request: String) -> String {
        return "🤔 What?\r\n" +
               "😕 I don't understand.\r\n" +
               "🫖 Where's the tea? ☕\r\n"
    }
        
    func question(_ webView: WKWebView, urlSchemeTask: WKURLSchemeTask, url: URL) {
        if let body = urlSchemeTask.request.httpBody {
            guard let request = String(data: body, encoding: .utf8) else {
                print("Failed to decode body as UTF-8 string.")
                return
            }
            request.withCString { s in ask(s) }
        }
        if let r = response(url, mt: "text/plain") {
            urlSchemeTask.didReceive(r)
            if let data = "OK".data(using: .utf8) {
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
                return;
            } else {
                print("Failed to encode response body as UTF-8.")
            }
        }
    }

    func poll(_ webView: WKWebView, urlSchemeTask: WKURLSchemeTask, url: URL) {
        var text: String = ""
        if let body = urlSchemeTask.request.httpBody {
            guard let request = String(data: body, encoding: .utf8) else {
                print("Failed to decode body as UTF-8 string.")
                return
            }
            request.withCString { s in
                if let response = answer(s) {
                    text = String(cString: response)
                    free(UnsafeMutableRawPointer(mutating: response))
                } else {
                    text = ""
                }
            }
        }
        if let r = response(url, mt: "text/plain") {
            urlSchemeTask.didReceive(r)
            if let data = text.data(using: .utf8) {
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
                return;
            } else {
                print("Failed to encode response body as UTF-8.")
            }
        }
    }
    
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {

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
        let resourcePath = p.hasPrefix("/") ? String(p.dropFirst()) : p
        guard let r = response(u, mt: mimeType(for: p)) else {
            failWithError(); return
        }
        if resourcePath == "ask" {
            question(webView, urlSchemeTask: urlSchemeTask, url: u)
            return
        }
        if resourcePath == "poll" {
            poll(webView, urlSchemeTask: urlSchemeTask, url: u)
            return
        }
        guard let f = Bundle.main.url(forResource: resourcePath,
                                      withExtension: nil) else {
            failWithError(); return
        }
        let ext = URL(fileURLWithPath: resourcePath).pathExtension.lowercased()
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

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    }

    // Helper function to determine the MIME type based on file extension
    private func mimeType(for p: String) -> String {
        switch URL(fileURLWithPath: p).pathExtension.lowercased() {
            case "html", "htm": return "text/html"
            case "js": return "text/javascript"
            case "css": return "text/css"
            case "png": return "image/png"
            case "jpg", "jpeg": return "image/jpeg"
            default: return "application/octet-stream"
        }
    }
    
    let allowedOrigin = "gyptix://"
    
    func response(_ u: URL, mt: String) -> HTTPURLResponse? {
        let responseHeaders = [
            "Access-Control-Allow-Origin": allowedOrigin,
            "Content-Type": mt,
            "Content-Security-Policy":
                "default-src 'self' gyptix://;" +
                "img-src 'self' gyptix:// data:;" +
                "style-src 'self' gyptix:// 'unsafe-inline';" +
                "script-src 'self' gyptix:// 'unsafe-inline';"
        ]
        return HTTPURLResponse(url: u,
                               statusCode: 200,
                               httpVersion: "HTTP/1.1",
                               headerFields: responseHeaders)
    }

}

import Foundation
import WebKit

public class FileSchemeHandler: NSObject, WKURLSchemeHandler {

    public func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {

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
        guard let r = response(u, mt: mimeType(for: p)) else {
            failWithError(); return
        }
        if dispatch_post(path, urlSchemeTask, u) { return }
        if dispatch_get(path, urlSchemeTask, u) { return }
        if path == "quit" {
            close_all_windows()
            #if os(iOS)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.001) {
                fatalError("Quit")
            }
            #endif
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

    public func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    }

}

func body(_ task: WKURLSchemeTask, _ url: URL) -> String {
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

let allowedOrigin = "gyptix://"

func response(_ u: URL, mt: String) -> HTTPURLResponse? {
    let responseHeaders = [
        "Access-Control-Allow-Origin": allowedOrigin,
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

private func mimeType(for p: String) -> String {
    // determine the MIME type based on file extension
    switch URL(fileURLWithPath: p).pathExtension.lowercased() {
        case "html", "htm": return "text/html"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        default: return "application/octet-stream"
    }
}


import Foundation
import SwiftUI

var completion: [URLSessionTask: (String?) -> Void] = [:]
var active:     [String: URLSessionDownloadTask] = [:]
var urls:       [URLSessionTask: String] = [:]
var progress:   [URLSessionTask: (Double) -> Void] = [:]
var failed:     [String: String] = [:]
var completed:  [String: String] = [:]
var downloaded: [String: Double] = [:]

class Downloads: NSObject, URLSessionDownloadDelegate {

    private lazy var session: URLSession = {
        let cfg = URLSessionConfiguration.background(
            withIdentifier: "gyptix.download.bg"
        )
        cfg.isDiscretionary = false
        cfg.sessionSendsLaunchEvents = true
        return URLSession(configuration: cfg,
                          delegate: self,
                          delegateQueue: nil)
    }()

    func start(_ url: String, _ file: String,
               _ cb: ((Double) -> Void)? = nil,
               _ done: @escaping (_ err: String?) -> Void) {
        if active[url] != nil {
            done("already in progress")
            return
        }
        guard let u = URL(string: url) else {
            done("bad url")
            return
        }
        let t = session.downloadTask(with: u)
        t.taskDescription = file
        progress[t] = cb
        completion[t] = done
        urls[t] = url
        active[url] = t
        t.resume()
    }

    func urlSession(_ s: URLSession,
                    downloadTask t: URLSessionDownloadTask,
                    didFinishDownloadingTo loc: URL) {
        let fm = FileManager.default
        guard
            let path = t.taskDescription,
            let url = urls[t]
        else {
            print("bad state")
            return
        }
        let dest = URL(fileURLWithPath: path)
        try? fm.removeItem(at: dest)
        do {
            try fm.moveItem(at: loc, to: dest)
            completed[url] = path
            completion[t]?(nil)
        } catch {
            failed[url] = error.localizedDescription
            completion[t]?(error.localizedDescription)
        }
        cleanup(t)
    }

    func urlSession(_ s: URLSession,
                    task t: URLSessionTask,
                    didCompleteWithError err: Error?) {
        if let err = err, let url = urls[t] {
            failed[url] = err.localizedDescription
            completion[t]?(err.localizedDescription)
            cleanup(t)
        }
    }

    func urlSessionDidFinishEvents(
        forBackgroundURLSession s: URLSession) {
        DispatchQueue.main.async {
            #if os(iOS)
            if let d = UIApplication.shared.delegate as? AppDelegate,
               let h = d.backgroundSessionCompletionHandler {
                h()
                d.backgroundSessionCompletionHandler = nil
            }
            #endif
        }
    }

    func urlSession(_ s: URLSession,
                    downloadTask t: URLSessionDownloadTask,
                    didWriteData b: Int64,
                    totalBytesWritten w: Int64,
                    totalBytesExpectedToWrite e: Int64) {
        guard e > 0, let url = urls[t] else { return }
        let r = Double(w) / Double(e)
        downloaded[url] = r
        progress[t]?(r)
    }

    private func cleanup(_ t: URLSessionTask) {
        if let url = urls[t] {
            active[url] = nil
            urls[t] = nil
            downloaded[url] = nil
        }
        completion[t] = nil
        progress[t] = nil
    }
}

private let dls = Downloads()

func is_downloading(_ url: String) -> Bool {
    active[url] != nil
}

func json() -> String {
    var items: [[String: Any]] = []
    for (url, t) in active {
        items.append([
            "filename": t.taskDescription ?? "",
            "url": url,
            "error": failed[url] ?? "",
            "ratio": downloaded[url] ?? 0.0,
            "completed": completed[url] != nil
        ])
    }
    for (url, file) in completed {
        items.append([
            "filename": file,
            "url": url,
            "error": "",
            "ratio": 1.0,
            "completed": true
        ])
    }
    for (url, err) in failed {
        items.append([
            "filename": "",
            "url": url,
            "error": err,
            "ratio": downloaded[url] ?? 0.0,
            "completed": false
        ])
    }
    guard let data = try? JSONSerialization.data(withJSONObject: items),
          let js = String(data: data, encoding: .utf8) else { return "[]" }
    return js
}

private func app_download(_ u: String, _ f: String, _ p: String,
                          _ e: String, _ d: String) {
    let j = json()
    DispatchQueue.main.async {
        let _ = call_js(
            "app.download('\(u)', '\(f)', '\(p)', '\(e)', \(d), '\(j)')",
            sync: false)
    }
}

func download(_ url: String) -> String {
    if is_downloading(url) { return "" } // already downloading
    guard
        let u = URL(string: url),
        let name = u.lastPathComponent.removingPercentEncoding,
        !name.isEmpty
    else { return "bad url \(url)" }
    let fm = FileManager.default
    let base = fm.urls(for: .cachesDirectory, in: .userDomainMask).first!
    let dir = base.appendingPathComponent("models")
    do { try fm.createDirectory(at: dir, withIntermediateDirectories: true) }
    catch {
        print("mkdir failed: \(error.localizedDescription)")
        return "mkdir failed: \(error.localizedDescription)"
    }
    let path = dir.appendingPathComponent(name).path
    dls.start(url, path, { r in
        let p = Int(r * 100)
        print("progress: \(p)%")
        app_download(url, path, "\(p)", "", "false")
    }) { err in
        let p = Int((downloaded[url] ?? 0) * 100)
        if let err = err {
            print("fail: \(err)")
            app_download(url,path, "\(p)", err, "true")
        } else {
            print("done: \(path)")
            app_download(url,path, "100", "", "true")
        }
    }
    return ""
}

func download_remove(_ url: String) -> String {
    var r = ""
    if (active[url] == nil && completed[url] == nil && failed[url] == nil) {
        r = "not downloading"
    }
    active[url]?.cancel()
    active[url] = nil
    failed[url] = nil
    completed[url] = nil
    downloaded[url] = nil
    for (task, u) in urls where u == url {
        completion[task] = nil
        progress[task] = nil
        urls[task] = nil
    }
    return r
}

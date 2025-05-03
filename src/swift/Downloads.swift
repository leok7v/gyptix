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

/*

[
  {
    "name": "Deepseek R1 Distill Llama - 8B",
    "description": "A distilled version of DeepSeek‑R1 based on Llama 8B for efficient reasoning.",
    "url": "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q8_0.gguf"
  },
  {
    "name": "Deepseek R1 Distill Qwen - 1.5B",
    "description": "A distilled version of the famous deep‑reasoning R1 model created by DeepSeek.",
    "url": "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf"
  },
  {
    "name": "Deepseek R1 Distill Qwen - 7B",
    "description": "A distilled version of DeepSeek‑R1 with 7 B parameters for lightweight deployments.",
    "url": "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q8_0gguf"
  },
  {
    "name": "Deepseek R1 Distill Qwen - 14B",
    "description": "A distilled version of DeepSeek‑R1 with 14 B parameters for efficient reasoning.",
    "url": "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-14B-Q8_0.gguf"
  },
  {
    "name": "Deepseek R1 Distill Qwen - 32B",
    "description": "A distilled version of DeepSeek‑R1 with 32 B parameters for advanced reasoning.",
    "url": "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf"
  },

  {
    "name": "Gemma 3 - 1B",
    "description": "The Gemma 3 model with 1 B parameter, created by Google.",
    "url": "https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q8_0.gguf"
  },
  {
    "name": "Gemma 3 - 4B",
    "description": "The Gemma 3 model with 4 B parameters, created by Google.",
    "url": "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q8_0.gguf"
  },
  {
    "name": "Gemma 3 - 12B",
    "description": "The Gemma 3 model with 12 B parameters, created by Google.",
    "url": "https://huggingface.co/ggml-org/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q8_0.gguf"
  },
  {
    "name": "Gemma 3 - 27B",
    "description": "The Gemma 3 model with 27 B parameters, created by Google.",
    "url": "https://huggingface.co/ggml-org/gemma-3-27b-it-GGUF/resolve/main/gemma-3-27b-it-Q4_K_M.gguf"
  },
  
  {
    "name": "Meta Llama 3.2 - 1B",
    "description": "Very small and fast chat model; runs well on most mobile devices.",
    "url": "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q8_0.gguf"
  },
  {
    "name": "Meta Llama 3.2 - 3B",
    "description": "Small and fast model created by Meta.",
    "url": "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q8_0.gguf"
  },
  {
    "name": "Meta Llama 3.1 - 8B",
    "description": "Top‑performing medium‑sized open‑source model.",
    "url": "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q8_0.gguf"
  },
  {
    "name": "Meta Llama 3.3 - 70B",
    "description": "Very large and very high‑quality chat model.",
    "url": "https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_L.gguf"
  },
  
  {
    "name": "Microsoft Phi 4 - 14B",
    "description": "Great medium‑size model.",
    "url": "https://huggingface.co/unsloth/phi-4-GGUF/resolve/main/phi-4-Q8_0.gguf"
  },
  {
    "name": "Microsoft Phi 3.5 Mini - 4B",
    "description": "Small, good‑quality chat model.",
    "url": "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q8_0.gguf"
  },
  
  {
    "name": "SmolLM2 - 135M",
    "description": "SmolLM2 compact language created by HuggingFace",
    "url": "https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q8_0.gguf"
  },
  {
    "name": "SmolLM2 - 360M",
    "description": "SmolLM2 compact language created by HuggingFace",
    "url": "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf"
  },
  {
    "name": "SmolLM2 - 1.7B (Q8_0)",
    "description": "SmolLM2 compact language created by HuggingFace",
    "url": "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q8_0.gguf"
  },
  {
    "name": "SmolLM2 - 1.7B (f16)",
    "description": "SmolLM2 compact language created by HuggingFace",
    "url": "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-f16.gguf"
  },
  
]

*/

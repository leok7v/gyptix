import Foundation
import WebKit

var in_call  = false // native called from JavaScript
var out_call = false // JavaScript called from native

public func run(_ id: String) -> String {
    id.withCString { s in gyptix.run(s) }
    return ""
}

public func ask(_ q: String) -> String {
    q.withCString { s in gyptix.ask(s) }
    return "OK"
}

public func poll(_ req: String) -> String {
    var text: String = ""
    req.withCString { s in
        if let response = gyptix.poll(s) {
            text = String(cString: response)
            free(UnsafeMutableRawPointer(mutating: response))
        } else {
            text = ""
        }
    }
//  if text != "" { print("poll: \(text)") }
    return text
}

public func remove(_ id: String) -> String {
    id.withCString { s in gyptix.remove(s) }
    return ""
}

public func is_answering() -> String {
    return gyptix.is_answering() != 0 ? "true" : "false"
}

public func is_running() -> String {
    return gyptix.is_running() != 0 ? "true" : "false"
}

public func erase() -> String {
    gyptix.erase()
    return ""
}

public func initialized() -> String {
    js_ready = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        // cannot call JS from callbacks directly - it will deadlock
        // report debugger attached or not to JS side
        debugger_attached()
    }
    return ""
}

public func quit() -> String {
    #if os(macOS)
    DispatchQueue.main.async {
        NSApplication.shared.windows.forEach { $0.close() }
    }
    #elseif os(iOS)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.001) {
    fatalError("Quit")
    }
    #endif
    // Intentionaly do NOT send response because JavaScript
    // trets model.quit() as NO RETURN fatal
    return ""
}

func check(_ path: String) {
    if (out_call) { fatalError("roundtrip deadlock: " + path) }
    if (in_call)  { fatalError("recursive incall: " + path) }
    in_call = true
}

func call(_ result: String) -> String {
    in_call = false
    return result
}

public func dispatch_get(_ path: String, _ t: WKURLSchemeTask, _ u: URL) -> Bool {
//  print("dispatch_get: " + path)
    var dispatched: Bool = true
    var s : String = "" // reply
    switch path {
        case "initialized":  check(path); s = call(initialized())
        case "is_running":   check(path); s = call(is_running())
        case "is_answering": check(path); s = call(is_answering())
        case "erase":        check(path); s = call(erase())
        case "quit":         check(path); s = call(quit())
        default:             dispatched = false
    }
    if dispatched { send_response(u, t, s) }
    return dispatched
}


public func dispatch_post(_ path: String, _ t: WKURLSchemeTask, _ u: URL) -> Bool {
    var dispatched: Bool = true
    let r = body(t, u)  // request
    var s: String = ""  // response
//  print("dispatch_post: " + path + " request: " + r)
    switch path {
        case "log":    print(r)
        case "run":    check(path); s = call(run(r));
        case "ask":    check(path); s = call(ask(r));
        case "poll":   check(path); s = call(poll(r));
        case "remove": check(path); s = call(remove(r));
        default:       dispatched = false
    }
    if dispatched { send_response(u, t, s) }
    return dispatched
}

public func call_js(_ call: String, sync: Bool = false) -> String {
    if !js_ready { fatalError("app.js is not yet initialized") }
    if in_call   { fatalError("roundtrip deadlock: " + call) }
    if out_call  { fatalError("recursive: " + call) }
    var wait = sync
    out_call = true
    guard let view = webView else { fatalError("too early: " + call) }
    var v : String = ""
    view.evaluateJavaScript(call) { result, error in
        if let error = error {
            print("Error calling \(call): \(error)")
        } else {
            if let r = result {
                v = "\(r)"
                if (is_debugger_attached()) {
//                  print("javascript \(call) result: \(r)")
                }
            } else {
                print("javascript \(call): no result")
            }
        }
        // The block above and the wait = false assignment will be
        // be executed when evaluateJavaScript() completes for sync
        // in the nested dispatch loop or fails with error.
        wait = false
    }
    out_call = false
    let timeout = Date().addingTimeInterval(2) // seconds
    while wait && Date() < timeout {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
    }
    if (wait) { // still true means call was not completed in 2 seconds
        print("Timeout calling \(call)")
    }
    return v
}

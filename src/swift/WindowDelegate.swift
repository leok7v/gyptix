#if os(macOS)
import AppKit

class WindowDelegate: NSObject, NSWindowDelegate {
    static let shared = WindowDelegate()

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        return true
    }
    
    func windowWillClose(_ notification: Notification) {
            NSApplication.shared.terminate(nil)
    }
}
#endif


#if os(macOS)
import AppKit

class SingleWindow: NSWindow {
    override func awakeFromNib() {
        super.awakeFromNib()
        self.tabbingMode = .disallowed
    }
}
#endif

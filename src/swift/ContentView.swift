import SwiftUI
import SwiftData


struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    let schemeHandler = FileSchemeHandler()
    
    var body: some View {
        #if os(macOS)
        WebView(htmlFileName: "app", schemeHandler: schemeHandler)
            .edgesIgnoringSafeArea(.bottom)
        #else
        FullScreenView {
            WebView(htmlFileName: "app", schemeHandler: schemeHandler)
                .statusBar(hidden: true)
        }.toolbar(.hidden, for: .navigationBar)
        #endif
    }
}

#if os(iOS)

struct FullScreenView<Content: View>: UIViewControllerRepresentable {
    let content: Content
    
    // Provide a custom initializer with a view builder.
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    
    func makeUIViewController(context: Context) -> UIHostingController<Content> {
        FullScreenHostingController(rootView: content)
    }
    
    func updateUIViewController(_ uiViewController: UIHostingController<Content>,
                                context: Context) {
        uiViewController.rootView = content
    }
}

class FullScreenHostingController<Content: View>: UIHostingController<Content> {
    override var prefersHomeIndicatorAutoHidden: Bool { true }
}

#endif


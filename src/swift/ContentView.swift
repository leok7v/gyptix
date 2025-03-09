import SwiftUI
import SwiftData
@preconcurrency
import WebKit

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    let schemeHandler = FileSchemeHandler()
    
    var body: some View {
        #if os(macOS)
        WebView(htmlFileName: "app",
                schemeHandler: schemeHandler)
            .edgesIgnoringSafeArea(.all)
        #else
        FullScreenView {
            WebView(htmlFileName: "app", schemeHandler: schemeHandler)
//              .statusBar(hidden: true)
//              .edgesIgnoringSafeArea(.all)
//              .ignoresSafeArea(.keyboard, edges: .bottom)
        }
//      .toolbar(.hidden, for: .navigationBar)
        #endif
    }
}

#if os(iOS)

struct FullScreenView<Content: View>: UIViewControllerRepresentable {
    let content: Content
    
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    
    func makeUIViewController(context: Context) -> UIHostingController<AnyView> {
        FullScreenHostingController(rootView: AnyView(content.ignoresSafeArea(edges: .vertical)))
    }
    
    func updateUIViewController(_ uiViewController: UIHostingController<AnyView>,
                                context: Context) {
        uiViewController.rootView = AnyView(content.ignoresSafeArea(edges: .vertical))
    }

}

class FullScreenHostingController<Content: View>: UIHostingController<Content> {

    override var prefersHomeIndicatorAutoHidden: Bool { true }

/*
    override func viewDidLoad() {
        super.viewDidLoad()
        if #available(iOS 11.0, *) {
            view.insetsLayoutMarginsFromSafeArea = false
            additionalSafeAreaInsets = .zero
        }
    }
       
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        additionalSafeAreaInsets = .zero
    }
*/

}

#endif

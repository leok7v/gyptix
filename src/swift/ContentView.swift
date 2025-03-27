import SwiftUI
import WebKit

public let schemeHandler = FileSchemeHandler()

struct ContentView: View {
    
    var body: some View {
        WebView().edgesIgnoringSafeArea(.all)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
}

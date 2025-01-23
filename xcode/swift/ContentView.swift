import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    let schemeHandler = FileSchemeHandler()
    
    var body: some View {
        WebView(htmlFileName: "index", schemeHandler: schemeHandler)
    }
    
}

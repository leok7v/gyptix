import SwiftUI
import SwiftData
import Network
import Combine

// see: https://medium.com/hyperapp/a-walk-through-hyperapp-2-b1f642fca172

@main
struct HyperApp: App {

    #if startWebServer
    @State private var cancellables: Set<AnyCancellable> = []
    #endif
    
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()
    
    var body: some Scene {
        WindowGroup {
            ContentView().frame(minWidth: 240, minHeight: 320)
            .onAppear {
                #if startWebServer
                let future = Future<Bool, Error> { promise in
                    do {
                        let webServer = try WebServer(port: NWEndpoint.Port(rawValue: 8080)!)
                        let success = webServer.start()
                        promise(.success(success))
                    } catch {
                        promise(.failure(error))
                    }
                }
                future.sink { completion in
                    switch completion {
                    case .finished:
                        print("WebServer started")
                    case .failure(let error):
                        print("Error starting WebServer: \(error)")
                    }
                } receiveValue: { success in
                        if success {
                            print("WebServer started successfully")
                        } else {
                            print("Failed to start WebServer")
                        }
                    }
                    .store(in: &cancellables)
                #endif
                }
        }
        .modelContainer(sharedModelContainer)
    }

}

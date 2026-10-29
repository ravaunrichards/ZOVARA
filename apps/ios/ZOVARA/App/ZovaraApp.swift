import SwiftUI

@main
struct ZovaraApp: App {
    var body: some Scene {
        WindowGroup {
            ZovaraWebContainer()
                .preferredColorScheme(.dark)
        }
    }
}
import SwiftUI
import WebKit

struct ZovaraWebContainer: UIViewRepresentable {
    private let deploymentURL = URL(string: ProcessInfo.processInfo.environment["ZOVARA_APP_URL"] ?? "")

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero)
        view.allowsBackForwardNavigationGestures = true
        guard let url = deploymentURL, url.scheme == "https" else {
            assertionFailure("Set ZOVARA_APP_URL to the HTTPS deployment URL in the build configuration")
            return view
        }
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
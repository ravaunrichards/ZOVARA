import SwiftUI
import WebKit

@main
struct ZOVARAApp: App {
    var body: some Scene { WindowGroup { ZOVARAWebContainer() .ignoresSafeArea(.container, edges: []) } }
}

struct ZOVARAWebContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = [.audio]
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false; view.backgroundColor = UIColor(red: 8/255, green: 11/255, blue: 24/255, alpha: 1)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        let urlString = Bundle.main.object(forInfoDictionaryKey: "ZOVARAWebURL") as? String ?? "http://localhost:3000/"
        if let url = URL(string: urlString), ["https", "http"].contains(url.scheme ?? ""), let host = url.host, !host.isEmpty { view.load(URLRequest(url: url)) }
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

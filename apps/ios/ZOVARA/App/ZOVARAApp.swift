import SwiftUI

@main
struct ZOVARAApp: App {
    var body: some Scene { WindowGroup { RootView() .preferredColorScheme(.dark) } }
}

struct RootView: View {
    @State private var selection = 0
    private let pages: [(String, String, String)] = [
        ("For you", "Your world, in motion.", "A creator-first social space. The native API client hooks into the ZOVARA backend deployment."),
        ("Discover", "Follow your curiosity.", "Find creators, media, and public communities through live API search."),
        ("Live", "Live, in real time.", "Broadcasting and viewing require your deployment's LiveKit credentials."),
        ("Profile", "Your profile. Your identity.", "Personal, creator, business, and community-facing identity modes.")
    ]
    var body: some View {
        TabView(selection: $selection) {
            ForEach(pages.indices, id: \.self) { index in
                VStack(alignment: .leading, spacing: 18) {
                    Text("ZOVARA").font(.system(size: 12, weight: .heavy, design: .rounded)).tracking(4).foregroundStyle(Color(red: 0.68, green: 0.62, blue: 1))
                    Text(pages[index].1).font(.system(size: 31, weight: .bold, design: .rounded)).tracking(-1).foregroundStyle(.white)
                    Text(pages[index].2).font(.system(size: 14)).lineSpacing(6).foregroundStyle(Color.white.opacity(0.65))
                    Spacer()
                    VStack(alignment: .leading, spacing: 10) {
                        Text("YOUR WORLD, BUILT BY YOU").font(.system(size: 10, weight: .semibold, design: .monospaced)).tracking(1.4).foregroundStyle(Color(red: 0.51, green: 0.96, blue: 0.79))
                        Text("This native iOS shell establishes the app structure and visual baseline. Complete API session persistence, AVFoundation uploads, push notifications, and LiveKit room handling before production release.").font(.system(size: 12)).lineSpacing(5).foregroundStyle(Color.white.opacity(0.60))
                    }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(Color.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 18))
                    Spacer()
                }.padding(24).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(red: 0.04, green: 0.045, blue: 0.07)).tabItem { Label(pages[index].0, systemImage: ["house.fill", "safari", "dot.radiowaves.left.and.right", "person.crop.circle"][index]) }.tag(index)
            }
        }.tint(Color(red: 0.68, green: 0.62, blue: 1))
    }
}

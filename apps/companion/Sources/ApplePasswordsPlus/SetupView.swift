import AppKit
import Combine
import CompanionCore
import SwiftUI

struct SetupView: View {
    @State private var model = SetupModel()
    private let timer = Timer.publish(every: 2, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Apple Passwords Plus").font(.title2.bold())
                Text("Unlock the browser extension with Touch ID instead of typing the code from your Mac.")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Step(
                number: 1,
                title: "Connect your browsers",
                detail: browsersDetail,
                done: model.browsersConnected,
                actionTitle: model.installedBrowsers.isEmpty ? nil : "Connect"
            ) { model.connectBrowsers() }
            Step(
                number: 2,
                title: "Run in the background",
                detail: agentDetail,
                done: model.agentEnabled,
                actionTitle: "Turn On"
            ) { model.enableAgent() }
            Step(
                number: 3,
                title: "Allow reading the pairing code",
                detail: "macOS calls this Accessibility. Apple Passwords Plus uses it only to read the code in "
                    + "Apple's own pairing window, and only after you confirm with Touch ID.",
                done: model.accessibilityTrusted,
                actionTitle: "Allow…"
            ) { model.requestAccessibility() }

            Step(
                number: 4,
                title: "Suggest your email addresses (optional)",
                detail: "On sign-up forms, the extension offers the emails on your contact card, like Safari.",
                done: model.contactsAllowed,
                actionTitle: "Allow…"
            ) { model.requestContacts() }

            if let error = model.lastError {
                Text(error).foregroundStyle(.red).font(.callout)
            }

            Divider()
            HStack {
                if model.ready {
                    Label("All set. Click Unlock in the extension.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
                Spacer()
                Button("Remove Setup", role: .destructive) { model.removeAll() }
                    .help("Disconnects the browsers and stops the background agent.")
            }
        }
        .padding(24)
        .frame(width: 480)
        .onAppear { model.refresh() }
        .onReceive(timer) { _ in model.refresh() }
    }

    private var browsersDetail: String {
        if model.installedBrowsers.isEmpty { return "No supported browser found." }
        let names = model.installedBrowsers.map(\.name).formatted(.list(type: .and))
        return "Lets the extension in \(names) reach Apple's password helper and this app."
    }

    private var agentDetail: String {
        switch model.agentStatus {
        case .requiresApproval: "Allow Apple Passwords Plus in System Settings → General → Login Items."
        default: "A small helper that starts only when the extension asks for a code."
        }
    }
}

private struct Step: View {
    let number: Int
    let title: String
    let detail: String
    let done: Bool
    let actionTitle: String?
    let action: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(done ? Color.green : Color.secondary.opacity(0.2)).frame(width: 24, height: 24)
                if done {
                    Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.white)
                } else {
                    Text("\(number)").font(.callout.bold())
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(detail).foregroundStyle(.secondary).font(.callout).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            if !done, let actionTitle {
                Button(actionTitle, action: action)
            }
        }
    }
}

struct CompanionApp: App {
    @NSApplicationDelegateAdaptor private var delegate: AppDelegate

    var body: some Scene {
        Window("Apple Passwords Plus", id: "setup") {
            SetupView()
        }
        .windowResizability(.contentSize)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_: Notification) {
        // Info.plist marks the bundle as a background app so the agent stays out of the Dock;
        // the setup window is a normal app.
        NSApp.setActivationPolicy(.regular)
        NSApp.activate()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_: NSApplication) -> Bool { true }
}

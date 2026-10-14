import ApplicationServices
import CompanionCore
import Foundation
import Observation
import ServiceManagement

/// The three things the companion needs, and how far along each one is.
@MainActor
@Observable
final class SetupModel {
    private(set) var connectedBrowsers: [Browser] = []
    private(set) var installedBrowsers: [Browser] = []
    private(set) var agentStatus: SMAppService.Status = .notRegistered
    private(set) var accessibilityTrusted = false
    private(set) var lastError: String?

    private let agent = SMAppService.agent(plistName: Identity.agentPlistName)
    private let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]

    var hostPath: String {
        Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/\(Identity.hostExecutableName)").path
    }

    var browsersConnected: Bool { !installedBrowsers.isEmpty && connectedBrowsers.count == installedBrowsers.count }
    var agentEnabled: Bool { agentStatus == .enabled }
    var ready: Bool { browsersConnected && agentEnabled && accessibilityTrusted }

    func refresh() {
        installedBrowsers = HostManifests.installed(in: support)
        connectedBrowsers = HostManifests.connected(hostPath: hostPath, support: support)
        agentStatus = agent.status
        accessibilityTrusted = AXIsProcessTrusted()
    }

    func connectBrowsers() {
        perform { try HostManifests.install(hostPath: hostPath, support: support) }
    }

    func enableAgent() {
        perform { try agent.register() }
        if agent.status == .requiresApproval { SMAppService.openSystemSettingsLoginItems() }
    }

    /// Shows macOS's own prompt, which adds the app to the Accessibility list and links to it.
    func requestAccessibility() {
        // the constant's value; reading the imported global trips Swift 6's concurrency checks
        let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
        accessibilityTrusted = AXIsProcessTrustedWithOptions(options)
    }

    /// Undoes everything the app set up. Accessibility can only be removed in System Settings.
    func removeAll() {
        HostManifests.uninstall(support: support)
        perform { try agent.unregister() }
    }

    private func perform(_ action: () throws -> Void) {
        do {
            try action()
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
        refresh()
    }
}

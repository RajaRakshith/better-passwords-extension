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
    private(set) var contactsAllowed = false
    private(set) var lastError: String?

    private let agent = SMAppService.agent(plistName: Identity.agentPlistName)
    private let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]

    var hostPath: String {
        Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/\(Identity.hostExecutableName)").path
    }

    var browsersConnected: Bool { !installedBrowsers.isEmpty && connectedBrowsers.count == installedBrowsers.count }
    var agentEnabled: Bool { agentStatus == .enabled }
    var ready: Bool { browsersConnected && agentEnabled && accessibilityTrusted }

    /// macOS ties a registered background agent to the exact build that registered it (for ad-hoc
    /// signed builds, by code hash). After a rebuild the old registration can no longer start the
    /// agent, so a new build re-registers it.
    func reRegisterIfRebuilt() {
        let key = "registeredBuild"
        guard let build = CodeSigning.ownCDHash() else { return }
        // no record (an older build registered it) counts as a different build
        guard agent.status == .enabled, UserDefaults.standard.string(forKey: key) != build else {
            UserDefaults.standard.set(build, forKey: key)
            return
        }
        Task {
            // the asynchronous unregister returns once macOS has dropped the old registration;
            // registering right after the synchronous one keeps the old build's pin. A fresh handle,
            // as older compilers won't send the main actor's one to the nonisolated method
            try? await SMAppService.agent(plistName: Identity.agentPlistName).unregister()
            perform { try agent.register() }
            UserDefaults.standard.set(build, forKey: key)
        }
    }

    func refresh() {
        installedBrowsers = HostManifests.installed(in: support)
        connectedBrowsers = HostManifests.connected(hostPath: hostPath, support: support)
        agentStatus = agent.status
        accessibilityTrusted = AXIsProcessTrusted()
        contactsAllowed = ContactCard.allowed
    }

    func connectBrowsers() {
        perform { try HostManifests.install(hostPath: hostPath, support: support) }
    }

    func enableAgent() {
        if let build = CodeSigning.ownCDHash() { UserDefaults.standard.set(build, forKey: "registeredBuild") }
        perform { try agent.register() }
        if agent.status == .requiresApproval { SMAppService.openSystemSettingsLoginItems() }
    }

    /// Shows macOS's own prompt, which adds the app to the Accessibility list and links to it.
    func requestAccessibility() {
        // the constant's value; reading the imported global trips Swift 6's concurrency checks
        let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
        accessibilityTrusted = AXIsProcessTrustedWithOptions(options)
    }

    /// Optional: lets the extension suggest the emails on the user's contact card.
    func requestContacts() {
        Task {
            _ = await ContactCard.requestAccess()
            refresh()
        }
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

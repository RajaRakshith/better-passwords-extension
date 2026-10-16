import Foundation
import Testing

@testable import CompanionCore

@Suite struct HostManifestsTests {
    private func temporarySupport(with browsers: [String]) throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        for browser in browsers {
            try FileManager.default.createDirectory(
                at: root.appendingPathComponent(browser), withIntermediateDirectories: true)
        }
        return root
    }

    @Test func installsOnlyForInstalledBrowsers() throws {
        let support = try temporarySupport(with: ["Google/Chrome", "Mozilla"])
        defer { try? FileManager.default.removeItem(at: support) }

        let done = try HostManifests.install(hostPath: "/Applications/X.app/host", support: support)
        #expect(done.map(\.name) == ["Google Chrome", "Firefox"])
        #expect(HostManifests.connected(hostPath: "/Applications/X.app/host", support: support).count == 2)
        // a moved app means the companion manifest is stale
        #expect(HostManifests.connected(hostPath: "/elsewhere/host", support: support).isEmpty)

        let chrome = support.appendingPathComponent("Google/Chrome/NativeMessagingHosts")
        let bridge =
            try JSONSerialization.jsonObject(
                with: Data(contentsOf: chrome.appendingPathComponent("io.github.fanckush.betterpasswords.bridge.json")))
            as? [String: Any]
        #expect(bridge?["path"] as? String == Identity.helperPath)
        #expect(bridge?["allowed_origins"] as? [String] == ["chrome-extension://kmkmelgjmhnfhhbgagdaejamhodddfmh/"])
        #expect(!FileManager.default.fileExists(atPath: support.appendingPathComponent("Chromium").path))
    }

    @Test func firefoxManifestsUseExtensionIDs() throws {
        let firefox = HostManifests.browsers.first { $0.kind == .firefox }!
        for manifest in HostManifests.manifests(for: firefox, hostPath: "/h") {
            #expect(manifest.allowedOrigins == nil)
            #expect(manifest.allowedExtensions == [Identity.firefoxExtensionID])
        }
    }

    @Test func companionHostAllowsBothChromiumBuilds() {
        let chrome = HostManifests.browsers[0]
        let companion = HostManifests.manifests(for: chrome, hostPath: "/h").first { $0.name == Identity.companionHost }
        #expect(
            companion?.allowedOrigins == [
                "chrome-extension://kmkmelgjmhnfhhbgagdaejamhodddfmh/",
                "chrome-extension://pejdijmoenmkgeppbflobdenhhabjlaj/",
            ])
    }

    @Test func uninstallRemovesOnlyOurFiles() throws {
        let support = try temporarySupport(with: ["Google/Chrome"])
        defer { try? FileManager.default.removeItem(at: support) }
        try HostManifests.install(hostPath: "/h", support: support)
        let directory = support.appendingPathComponent("Google/Chrome/NativeMessagingHosts")
        let apple = directory.appendingPathComponent("com.apple.passwordmanager.json")
        try Data("{}".utf8).write(to: apple)

        HostManifests.uninstall(support: support)
        let left = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        #expect(left == ["com.apple.passwordmanager.json"])
    }
}

import CompanionCore
import Foundation

/// What this build says about itself in Info.plist.
enum AppInfo {
    static var version: String? {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    }

    /// Sparkle's appcast. Development builds have none (scripts/bundle.sh removes it), so they never update.
    static var feedURL: URL? {
        (Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String).flatMap(URL.init(string:))
    }

    /// Sparkle's setting, which the user can turn off in the setup window. The agent follows it too.
    static var checksAutomatically: Bool {
        UserDefaults.standard.object(forKey: "SUEnableAutomaticChecks") as? Bool
            ?? Bundle.main.object(forInfoDictionaryKey: "SUEnableAutomaticChecks") as? Bool ?? false
    }

    /// The newest version the agent has seen, if it's newer than this build.
    static var availableUpdate: String? {
        guard let current = version, let latest = UserDefaults.standard.string(forKey: UpdateCheck.latestKey),
            Updates.isNewer(latest, than: current)
        else { return nil }
        return latest
    }
}

/// The agent's daily look at the appcast, so the extension can say when an update is out. Sparkle
/// notices too, but only while the setup window is open, and few people open it again after setup.
/// This reads only the newest version number; Sparkle, in the app, downloads and verifies updates.
final class UpdateCheck: @unchecked Sendable {
    static let shared = UpdateCheck()

    /// Shared with the setup window, which offers the update when it opens.
    static let latestKey = "latestVersion"
    private static let checkedKey = "latestVersionCheckedAt"
    private static let interval: TimeInterval = 24 * 60 * 60
    /// After a failed look (offline, say), try again in an hour rather than on every request.
    private static let retry: TimeInterval = 60 * 60

    private let queue = DispatchQueue(label: "update-check")
    private var checking = false

    /// A newer version than this one, if the agent has seen one. Looks again in the background once a
    /// day, so the answer can be a day old; the request that asks never waits for the network.
    func available() -> String? {
        guard let feed = AppInfo.feedURL, AppInfo.checksAutomatically else { return nil }
        let checked = UserDefaults.standard.object(forKey: Self.checkedKey) as? Date ?? .distantPast
        if Date().timeIntervalSince(checked) >= Self.interval { look(at: feed) }
        return AppInfo.availableUpdate
    }

    private func look(at feed: URL) {
        let start = queue.sync {
            defer { checking = true }
            return !checking
        }
        guard start else { return }
        IdleExit.shared.begin()
        Task {
            // no cookies or cache: the request carries nothing but the app's version
            let session = URLSession(configuration: .ephemeral)
            defer { session.finishTasksAndInvalidate() }
            let request = URLRequest(url: feed, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
            let defaults = UserDefaults.standard
            if let (data, response) = try? await session.data(for: request),
                (response as? HTTPURLResponse)?.statusCode == 200,
                let latest = Updates.latestVersion(inAppcast: data)
            {
                defaults.set(latest, forKey: Self.latestKey)
                defaults.set(Date(), forKey: Self.checkedKey)
            } else {
                defaults.set(Date(timeIntervalSinceNow: Self.retry - Self.interval), forKey: Self.checkedKey)
            }
            queue.sync { checking = false }
            IdleExit.shared.end()
        }
    }
}

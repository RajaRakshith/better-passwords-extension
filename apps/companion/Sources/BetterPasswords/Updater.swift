import Sparkle

/// Sparkle, for the setup app. While the app runs it checks once a day, and it installs an update
/// only when the user accepts it. Updates are verified against the EdDSA key in Info.plist.
@MainActor
final class Updater {
    static let shared = Updater()
    private var controller: SPUStandardUpdaterController?

    /// Starts checking. Development builds have no appcast, and an app outside Applications
    /// couldn't be replaced, so neither starts.
    func start() {
        guard controller == nil, AppInfo.feedURL != nil, AppLocation.isInstalled else { return }
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
    }

    var isRunning: Bool { controller != nil }

    var checksAutomatically: Bool {
        get { controller?.updater.automaticallyChecksForUpdates ?? false }
        set { controller?.updater.automaticallyChecksForUpdates = newValue }
    }

    /// Shows Sparkle's window: the update if there is one, or that this version is the newest.
    func checkForUpdates() {
        controller?.checkForUpdates(nil)
    }
}

import Foundation

/// Where the app has to live. Browsers and launchd are given paths inside the app, so it must stay
/// in one place: run from Downloads, from a disk image, or from where macOS runs a fresh download
/// (App Translocation), those paths stop working.
public enum Installation {
    /// Whether `app` is in /Applications or ~/Applications, or in a folder inside either.
    public static func isInApplications(_ app: URL, home: URL) -> Bool {
        let path = app.standardizedFileURL.path
        return applicationsFolders(home: home).contains { path.hasPrefix($0.path + "/") }
    }

    /// Where to move the app: /Applications, or ~/Applications for a user who can't write there.
    public static func destination(for app: URL, home: URL, canWriteSystemApplications: Bool) -> URL {
        let folder = applicationsFolders(home: home)[canWriteSystemApplications ? 0 : 1]
        return folder.appendingPathComponent(app.lastPathComponent)
    }

    private static func applicationsFolders(home: URL) -> [URL] {
        [URL(fileURLWithPath: "/Applications"), home.appendingPathComponent("Applications").standardizedFileURL]
    }
}

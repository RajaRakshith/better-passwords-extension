import AppKit
import CompanionCore

/// Keeps the app in Applications, where it must live (see `Installation`).
@MainActor
enum AppLocation {
    private static var bundle: URL { Bundle.main.bundleURL }
    private static var home: URL { FileManager.default.homeDirectoryForCurrentUser }

    /// True in an Applications folder, and for a bare executable (`swift run`), which has no bundle.
    static var isInstalled: Bool {
        bundle.pathExtension != "app" || Installation.isInApplications(bundle, home: home)
    }

    /// Copies the app into Applications, replacing an older copy there, and opens the copy; the caller
    /// quits. The downloaded original goes to the Trash; a disk image is left as it is.
    static func moveToApplications() async throws {
        let files = FileManager.default
        let destination = Installation.destination(
            for: bundle, home: home, canWriteSystemApplications: files.isWritableFile(atPath: "/Applications"))
        try files.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        if files.fileExists(atPath: destination.path) {
            try files.trashItem(at: destination, resultingItemURL: nil)
        }
        try files.copyItem(at: bundle, to: destination)
        // The user already opened this notarized app. A copy that keeps the download's quarantine
        // flag would be translocated again, as if it had never been moved.
        let xattr = Process()
        xattr.executableURL = URL(fileURLWithPath: "/usr/bin/xattr")
        xattr.arguments = ["-dr", "com.apple.quarantine", destination.path]
        try xattr.run()
        xattr.waitUntilExit()

        let original = originalLocation(of: bundle)
        if original != destination, Bundle(url: original)?.bundleIdentifier == Identity.appBundleID {
            // fails on a disk image, which is read-only: that's fine
            try? files.trashItem(at: original, resultingItemURL: nil)
        }

        let configuration = NSWorkspace.OpenConfiguration()
        configuration.createsNewApplicationInstance = true
        try await NSWorkspace.shared.openApplication(at: destination, configuration: configuration)
    }

    /// Where the user opened the app from. A fresh download runs from a hidden read-only copy
    /// (App Translocation); Security can say where its original is, though not in a public header.
    private static func originalLocation(of url: URL) -> URL {
        typealias CreateOriginalPath =
            @convention(c) (CFURL, UnsafeMutablePointer<Unmanaged<CFError>?>?) -> Unmanaged<CFURL>?
        guard let security = dlopen("/System/Library/Frameworks/Security.framework/Security", RTLD_NOW),
            let symbol = dlsym(security, "SecTranslocateCreateOriginalPathForURL")
        else { return url }
        let create = unsafeBitCast(symbol, to: CreateOriginalPath.self)
        return create(url as CFURL, nil)?.takeRetainedValue() as URL? ?? url
    }
}

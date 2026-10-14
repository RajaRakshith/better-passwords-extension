// Names and identities shared by the app, the agent and the native host. The extension IDs and
// host names must match apps/extension/src/config.ts and scripts/setup-mac.sh.

public enum Identity {
    /// Bundle identifier and code-signing identifier of the app (and of its agent mode).
    public static let appBundleID = "org.applepasswordsplus.companion"
    /// Code-signing identifier of the native-messaging host inside the app bundle.
    public static let hostSigningID = "org.applepasswordsplus.companion.host"
    /// launchd label of the agent, and the XPC service it vends.
    public static let agentService = "org.applepasswordsplus.agent"
    /// File name of the agent's launchd plist inside Contents/Library/LaunchAgents.
    public static let agentPlistName = "org.applepasswordsplus.agent.plist"
    /// Executable name of the native host, inside Contents/MacOS.
    public static let hostExecutableName = "apple-passwords-plus-host"

    /// Native host that reaches the companion (for Touch ID).
    public static let companionHost = "org.applepasswordsplus.companion"
    /// Native host that reaches Apple's helper for the store build (what setup-mac.sh writes).
    public static let bridgeHost = "org.applepasswordsplus.bridge"

    /// Our store build's ID. The bridge allows only this one: Apple's ID has Apple's own host.
    public static let storeExtensionID = "kmkmelgjmhnfhhbgagdaejamhodddfmh"
    /// The GitHub build borrows Apple's ID, so the companion host allows it too.
    public static let appleExtensionID = "pejdijmoenmkgeppbflobdenhhabjlaj"
    public static let firefoxExtensionID = "apple-passwords-plus@applepasswordsplus.org"

    public static let helperPath =
        "/System/Cryptexes/App/System/Library/CoreServices/PasswordManagerBrowserExtensionHelper.app/Contents/MacOS/PasswordManagerBrowserExtensionHelper"
    /// What Apple's helper must satisfy before we read anything from its windows.
    public static let helperRequirement =
        #"anchor apple and identifier "com.apple.PasswordManagerBrowserExtensionHelper""#

    /// Info.plist key holding the native host's cdhash in ad-hoc (development) builds, written by
    /// scripts/bundle.sh. Signed release builds check the team ID instead.
    public static let hostCDHashKey = "APPHostCDHash"
}

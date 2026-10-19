// swift-tools-version: 6.0
// The optional Mac companion: fills in Apple's pairing code after Touch ID.
// Build the app bundle with scripts/bundle.sh; `swift build` and `swift test` work as usual.

import PackageDescription

let package = Package(
    name: "Companion",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "BetterPasswords", targets: ["BetterPasswords"]),
        .executable(name: "better-passwords-host", targets: ["NativeHost"]),
    ],
    dependencies: [
        // In-app updates. Only the app links it; the native host stays dependency-free.
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.0")
    ],
    targets: [
        // Everything that can be tested without Accessibility, Touch ID or a browser.
        .target(name: "CompanionCore"),
        // The menu-bar app; started with --agent by launchd, it is the background agent instead.
        .executableTarget(
            name: "BetterPasswords",
            dependencies: ["CompanionCore", .product(name: "Sparkle", package: "Sparkle")]),
        // The native-messaging host the browser launches. It only relays to the agent.
        .executableTarget(name: "NativeHost", dependencies: ["CompanionCore"]),
        .testTarget(name: "CompanionCoreTests", dependencies: ["CompanionCore"]),
    ]
)

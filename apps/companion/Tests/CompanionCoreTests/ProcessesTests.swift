import Foundation
import Testing

@testable import CompanionCore

@Suite struct ProcessesTests {
    @Test func findsOwnParentAndPath() {
        let me = getpid()
        #expect(Processes.parent(of: me) == getppid())
        #expect(Processes.executablePath(of: me) != nil)
    }

    @Test func listsChildren() throws {
        let child = Process()
        child.executableURL = URL(fileURLWithPath: "/bin/sleep")
        child.arguments = ["5"]
        try child.run()
        defer { child.terminate() }
        #expect(Processes.children(of: getpid()).contains(child.processIdentifier))
        // /bin/sleep is Apple's, but it isn't the password helper
        #expect(Processes.appleHelpers(launchedBy: getpid()).isEmpty)
        #expect(Processes.process(child.processIdentifier, satisfies: "anchor apple"))
        #expect(!Processes.process(child.processIdentifier, satisfies: Identity.helperRequirement))
    }

    @Test func recognisesTheHelperByEitherPath() {
        #expect(Processes.isAppleHelperPath(Identity.helperPath))
        // how the kernel reports the running helper: the real location behind /System/Cryptexes
        #expect(
            Processes.isAppleHelperPath(
                "/System/Volumes/Preboot/Cryptexes/App/System/Library/CoreServices/PasswordManagerBrowserExtensionHelper.app/Contents/MacOS/PasswordManagerBrowserExtensionHelper"
            ))
        #expect(!Processes.isAppleHelperPath("/tmp/PasswordManagerBrowserExtensionHelper"))
    }

    @Test func pinnedRequirementsNeedARealHash() {
        #expect(CodeSigning.pinned(identifier: "x", cdhash: "nope") == nil)
        #expect(
            CodeSigning.pinned(identifier: "x", cdhash: String(repeating: "AB", count: 20))
                == #"identifier "x" and cdhash H"abababababababababababababababababababab""#)
    }

    @Test func sameTeamRequirementCompiles() {
        var requirement: SecRequirement?
        let text = CodeSigning.sameTeam("ABCDE12345", identifier: Identity.hostSigningID)
        #expect(SecRequirementCreateWithString(text as CFString, [], &requirement) == errSecSuccess)
    }
}

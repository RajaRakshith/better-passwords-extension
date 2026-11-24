import Testing

@testable import CompanionCore

@Suite struct PairingPresenceTests {
    @Test func readsThePairingCodeWithoutALocalAuthenticationPrompt() {
        #expect(PairingPresence.promptsBeforeRead == false)
    }
}

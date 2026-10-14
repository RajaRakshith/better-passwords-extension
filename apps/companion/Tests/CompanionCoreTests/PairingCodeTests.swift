import Testing

@testable import CompanionCore

@Suite struct PairingCodeTests {
    @Test func readsAppleFormattedCode() {
        // Apple separates the groups with a no-break space
        #expect(PairingCode.find(in: ["Verification code", "848\u{00A0}967"]) == "848967")
    }

    @Test func acceptsPlainAndSpacedCodes() {
        #expect(PairingCode.find(in: ["123456"]) == "123456")
        #expect(PairingCode.find(in: ["123 456"]) == "123456")
        #expect(PairingCode.find(in: ["code: 123\u{202F}456."]) == "123456")
    }

    @Test func ignoresLongerNumbers() {
        #expect(PairingCode.find(in: ["1234567"]) == nil)
        #expect(PairingCode.find(in: ["12345"]) == nil)
        #expect(PairingCode.find(in: ["123 4567"]) == nil)
    }

    @Test func refusesAmbiguousWindows() {
        #expect(PairingCode.find(in: ["111111", "222 222"]) == nil)
        // the same code shown twice (e.g. as title and value) is fine
        #expect(PairingCode.find(in: ["333 333", "333333"]) == "333333")
    }

    @Test func findsNothingWithoutCode() {
        #expect(PairingCode.find(in: []) == nil)
        #expect(PairingCode.find(in: ["Enter this code in your browser"]) == nil)
    }
}

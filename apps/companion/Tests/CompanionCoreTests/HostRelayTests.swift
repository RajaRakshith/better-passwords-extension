import Foundation
import Testing

@testable import CompanionCore

private struct StubAgent: HostRelay.Agent {
    var statusResult: Result<Bool, CompanionError> = .success(true)
    var codeResult: Result<String, CompanionError> = .success("123456")
    func status() async -> Result<Bool, CompanionError> { statusResult }
    func readPairingCode() async -> Result<String, CompanionError> { codeResult }
}

private func json(_ response: HostResponse) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: HostRelay.encode(response))) as? [String: Any] ?? [:]
}

@Suite struct HostRelayTests {
    @Test func helloReportsAccessibility() async {
        let relay = HostRelay(agent: StubAgent(statusResult: .success(false)))
        let reply = json(await relay.handle(Data(#"{"type":"hello"}"#.utf8)))
        #expect(reply["ok"] as? Bool == true)
        #expect(reply["accessibility"] as? Bool == false)
        #expect(reply["version"] as? Int == HostResponse.protocolVersion)
    }

    @Test func relaysTheCode() async {
        let relay = HostRelay(agent: StubAgent())
        let reply = json(await relay.handle(Data(#"{"type":"read-code"}"#.utf8)))
        #expect(reply["ok"] as? Bool == true)
        #expect(reply["code"] as? String == "123456")
    }

    @Test func relaysErrorsWithMessages() async {
        let relay = HostRelay(agent: StubAgent(codeResult: .failure(.cancelled)))
        let reply = json(await relay.handle(Data(#"{"type":"read-code"}"#.utf8)))
        #expect(reply["ok"] as? Bool == false)
        #expect(reply["error"] as? String == "cancelled")
        #expect(reply["message"] as? String == CompanionError.cancelled.message)
    }

    @Test func rejectsUnknownRequests() async {
        let relay = HostRelay(agent: StubAgent())
        #expect(json(await relay.handle(Data(#"{"type":"get-password"}"#.utf8)))["ok"] as? Bool == false)
        #expect(json(await relay.handle(Data("not json".utf8)))["ok"] as? Bool == false)
    }
}

import Foundation

/// The native host's logic, separate from stdin/stdout and XPC so it can be tested.
public struct HostRelay: Sendable {
    /// Talks to the agent. Real hosts use XPC; tests use a stub.
    public protocol Agent: Sendable {
        func status() async -> Result<Bool, CompanionError>
        func readPairingCode() async -> Result<String, CompanionError>
    }

    let agent: any Agent

    public init(agent: any Agent) { self.agent = agent }

    public func handle(_ data: Data) async -> HostResponse {
        guard let request = try? JSONDecoder().decode(HostRequest.self, from: data) else {
            return HostResponse(ok: false, message: "unknown request")
        }
        switch request.type {
        case .hello:
            switch await agent.status() {
            case .success(let trusted):
                return HostResponse(ok: true, accessibility: trusted)
            case .failure(let error):
                return .failure(error)
            }
        case .readCode:
            switch await agent.readPairingCode() {
            case .success(let code):
                return HostResponse(ok: true, code: code)
            case .failure(let error):
                return .failure(error)
            }
        }
    }

    public static func encode(_ response: HostResponse) -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return (try? encoder.encode(response)) ?? Data(#"{"ok":false}"#.utf8)
    }
}

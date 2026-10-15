import Foundation

/// The native host's connection to the agent over XPC.
public final class XPCAgentClient: HostRelay.Agent, @unchecked Sendable {
    /// Touch ID waits for the user, so allow plenty of time.
    private let timeout: Duration

    public init(timeout: Duration = .seconds(90)) {
        self.timeout = timeout
    }

    /// The agent must be our own app. Release builds check the team; ad-hoc development builds can
    /// only check the identifier, because the app is signed after the host.
    static func agentRequirement() -> String {
        if let team = CodeSigning.ownTeamID() {
            return CodeSigning.sameTeam(team, identifier: Identity.appBundleID)
        }
        return #"identifier "\#(Identity.appBundleID)""#
    }

    typealias Finish<T> = @Sendable (Result<T, CompanionError>) -> Void

    private func withAgent<T: Sendable>(
        _ body: @escaping @Sendable (CompanionAgentProtocol, @escaping Finish<T>) -> Void
    ) async -> Result<T, CompanionError> {
        let connection = NSXPCConnection(machServiceName: Identity.agentService, options: [])
        connection.remoteObjectInterface = AgentInterface.make()
        connection.setCodeSigningRequirement(Self.agentRequirement())
        connection.resume()
        defer { connection.invalidate() }

        let once = Once<Result<T, CompanionError>>()
        return await withCheckedContinuation { continuation in
            let finish: Finish<T> = { result in
                if once.claim(result) { continuation.resume(returning: result) }
            }
            let proxy = connection.remoteObjectProxyWithErrorHandler { _ in finish(.failure(.agentUnavailable)) }
            guard let agent = proxy as? CompanionAgentProtocol else { return finish(.failure(.agentUnavailable)) }
            body(agent, finish)
            let timeout = self.timeout
            Task {
                try? await Task.sleep(for: timeout)
                finish(.failure(.agentUnavailable))
            }
        }
    }

    public func status() async -> Result<Bool, CompanionError> {
        await withAgent { agent, finish in
            agent.status { trusted in finish(.success(trusted)) }
        }
    }

    public func myEmails() async -> Result<[String], CompanionError> {
        await withAgent { agent, finish in
            agent.myEmails { emails, error in
                if let emails {
                    finish(.success(emails))
                } else {
                    finish(.failure(error.flatMap(CompanionError.init(rawValue:)) ?? .needsContacts))
                }
            }
        }
    }

    public func readPairingCode() async -> Result<String, CompanionError> {
        await withAgent { agent, finish in
            agent.readPairingCode { code, error in
                if let code {
                    finish(.success(code))
                } else {
                    finish(.failure(error.flatMap(CompanionError.init(rawValue:)) ?? .noCode))
                }
            }
        }
    }
}

/// Lets exactly one of several racing callbacks win.
final class Once<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false

    func claim(_: T) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if done { return false }
        done = true
        return true
    }
}

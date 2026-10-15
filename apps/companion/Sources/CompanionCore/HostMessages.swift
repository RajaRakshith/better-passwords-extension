import Foundation

/// Messages between the extension and the native host (JSON over native messaging).
public struct HostRequest: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        /// Is the companion installed and ready?
        case hello
        /// Touch ID, then the code on screen.
        case readCode = "read-code"
        /// The emails on the user's contact card.
        case myEmails = "my-emails"
    }

    public var type: Kind

    public init(type: Kind) { self.type = type }
}

public struct HostResponse: Codable, Equatable, Sendable {
    public var ok: Bool
    /// Protocol version of the companion, so the extension can tell old installs apart.
    public var version = HostResponse.protocolVersion
    public var code: String?
    public var accessibility: Bool?
    public var emails: [String]?
    public var error: CompanionError?
    public var message: String?

    /// 1: hello, read-code. 2: adds my-emails.
    public static let protocolVersion = 2

    public static func failure(_ error: CompanionError) -> HostResponse {
        HostResponse(ok: false, error: error, message: error.message)
    }
}

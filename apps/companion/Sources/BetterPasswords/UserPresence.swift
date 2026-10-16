import Foundation
import LocalAuthentication

/// Touch ID, falling back to the Mac's login password where there is no Touch ID or it's locked
/// out, the same as macOS asks before showing passwords.
enum UserPresence {
    static func confirm(reason: String) async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Type the Code Instead"
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return false }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }
}

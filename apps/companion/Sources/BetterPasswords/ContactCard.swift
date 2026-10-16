import CompanionCore
import Contacts

/// The email addresses on the user's own card ("Me" in Contacts), which the extension suggests
/// on sign-up forms, as Safari does.
enum ContactCard {
    static var allowed: Bool {
        CNContactStore.authorizationStatus(for: .contacts) == .authorized
    }

    static func myEmails() -> Result<[String], CompanionError> {
        guard allowed else { return .failure(.needsContacts) }
        let keys = [CNContactEmailAddressesKey as CNKeyDescriptor]
        // no "Me" card set: nothing to suggest
        guard let me = try? CNContactStore().unifiedMeContactWithKeys(toFetch: keys) else { return .success([]) }
        return .success(me.emailAddresses.map { String($0.value) })
    }

    /// Shows macOS's Contacts permission prompt (from the setup window).
    static func requestAccess() async -> Bool {
        (try? await CNContactStore().requestAccess(for: .contacts)) ?? false
    }
}

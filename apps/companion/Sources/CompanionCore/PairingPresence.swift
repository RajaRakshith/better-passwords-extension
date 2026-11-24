/// Whether reading Apple's pairing code waits for Touch ID or the Mac login password.
/// The code is still required by Apple's protocol; this only controls the local prompt in front of reading it.
public enum PairingPresence {
    public static let promptsBeforeRead = false
}

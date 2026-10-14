import Foundation

/// Finds Apple's 6-digit pairing code among the strings of the helper's window.
public enum PairingCode {
    /// Apple shows the code as two groups of three, e.g. "848 967", joined by a no-break space.
    /// Accept that and close relatives, but nothing longer: a 7-digit run is not a code.
    private static let pattern = try! NSRegularExpression(
        pattern: #"(?<![0-9])([0-9]{3})[    ]?([0-9]{3})(?![0-9])"#
    )

    /// The code, if exactly one distinct code appears; nil when there is none or it is ambiguous.
    public static func find(in texts: [String]) -> String? {
        var found = Set<String>()
        for text in texts {
            let range = NSRange(text.startIndex..., in: text)
            for match in pattern.matches(in: text, range: range) {
                guard let first = Range(match.range(at: 1), in: text),
                    let second = Range(match.range(at: 2), in: text)
                else { continue }
                found.insert(String(text[first]) + String(text[second]))
            }
        }
        return found.count == 1 ? found.first : nil
    }
}

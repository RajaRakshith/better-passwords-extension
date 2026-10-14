import Darwin
import Foundation
import Security

/// Process lookups the agent uses to find the right copy of Apple's helper.
public enum Processes {
    public static func parent(of pid: pid_t) -> pid_t? {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &info, &size, nil, 0) == 0, size > 0 else { return nil }
        return info.kp_eproc.e_ppid
    }

    public static func executablePath(of pid: pid_t) -> String? {
        var buffer = [UInt8](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
        guard length > 0 else { return nil }
        return String(decoding: buffer.prefix(Int(length)), as: UTF8.self)
    }

    public static func children(of parent: pid_t) -> [pid_t] {
        let count = proc_listpids(UInt32(PROC_PPID_ONLY), UInt32(parent), nil, 0)
        guard count > 0 else { return [] }
        var pids = [pid_t](repeating: 0, count: Int(count) / MemoryLayout<pid_t>.size + 16)
        let bytes = proc_listpids(
            UInt32(PROC_PPID_ONLY), UInt32(parent), &pids, Int32(pids.count * MemoryLayout<pid_t>.size))
        guard bytes > 0 else { return [] }
        return Array(pids.prefix(Int(bytes) / MemoryLayout<pid_t>.size)).filter { $0 > 0 }
    }

    /// True if the running process `pid` is validly signed and satisfies `requirement`.
    public static func process(_ pid: pid_t, satisfies requirement: String) -> Bool {
        var code: SecCode?
        let attributes = [kSecGuestAttributePid: pid] as CFDictionary
        guard SecCodeCopyGuestWithAttributes(nil, attributes, [], &code) == errSecSuccess, let code else {
            return false
        }
        return CodeSigning.check(code, requirement)
    }

    /// Copies of Apple's helper that `browser` launched, after checking each one's signature.
    public static func appleHelpers(launchedBy browser: pid_t) -> [pid_t] {
        children(of: browser).filter { pid in
            executablePath(of: pid) == Identity.helperPath && process(pid, satisfies: Identity.helperRequirement)
        }
    }
}

public enum CodeSigning {
    public static func check(_ code: SecCode, _ requirement: String) -> Bool {
        var compiled: SecRequirement?
        guard SecRequirementCreateWithString(requirement as CFString, [], &compiled) == errSecSuccess,
            let compiled
        else { return false }
        return SecCodeCheckValidity(code, [], compiled) == errSecSuccess
    }

    /// The team ID this process is signed with, or nil for ad-hoc and unsigned builds.
    public static func ownTeamID() -> String? {
        var code: SecCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return nil }
        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else { return nil }
        var info: CFDictionary?
        guard
            SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info)
                == errSecSuccess
        else { return nil }
        return (info as? [String: Any])?[kSecCodeInfoTeamIdentifier as String] as? String
    }

    /// What a peer signed by the same developer as us must satisfy. Release builds are signed with a
    /// Developer ID, so we require the same team. Ad-hoc development builds have no team, so the
    /// caller must pin something else (see `pinned`).
    public static func sameTeam(_ teamID: String, identifier: String) -> String {
        #"anchor apple generic and certificate leaf[subject.OU] = "\#(teamID)" and identifier "\#(identifier)""#
    }

    /// A requirement pinned to one exact build (for ad-hoc development builds).
    public static func pinned(identifier: String, cdhash: String) -> String? {
        guard cdhash.count == 40, cdhash.allSatisfy(\.isHexDigit) else { return nil }
        return #"identifier "\#(identifier)" and cdhash H"\#(cdhash.lowercased())""#
    }
}

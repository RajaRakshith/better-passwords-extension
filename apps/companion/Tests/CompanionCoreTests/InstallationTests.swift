import Foundation
import Testing

@testable import CompanionCore

private let home = URL(fileURLWithPath: "/Users/jane")
private func app(_ path: String) -> URL { URL(fileURLWithPath: path) }

@Suite struct InstallationTests {
    @Test func acceptsApplicationsFolders() {
        #expect(Installation.isInApplications(app("/Applications/Better Passwords.app"), home: home))
        #expect(Installation.isInApplications(app("/Applications/Utilities/Better Passwords.app"), home: home))
        #expect(Installation.isInApplications(app("/Users/jane/Applications/Better Passwords.app"), home: home))
    }

    @Test func refusesEverywhereElse() {
        #expect(!Installation.isInApplications(app("/Users/jane/Downloads/Better Passwords.app"), home: home))
        #expect(!Installation.isInApplications(app("/Volumes/Better Passwords/Better Passwords.app"), home: home))
        #expect(
            !Installation.isInApplications(
                app("/private/var/folders/xy/T/AppTranslocation/0A1B/d/Better Passwords.app"), home: home))
        // a lookalike folder, and a path that only climbs back out of Applications
        #expect(!Installation.isInApplications(app("/Applications Old/Better Passwords.app"), home: home))
        #expect(!Installation.isInApplications(app("/Applications/../Users/jane/Better Passwords.app"), home: home))
    }

    @Test func movesToTheSystemFolderWhenItCan() {
        let downloaded = app("/Users/jane/Downloads/Better Passwords.app")
        #expect(
            Installation.destination(for: downloaded, home: home, canWriteSystemApplications: true).path
                == "/Applications/Better Passwords.app")
        #expect(
            Installation.destination(for: downloaded, home: home, canWriteSystemApplications: false).path
                == "/Users/jane/Applications/Better Passwords.app")
    }
}

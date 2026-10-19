import Foundation
import Testing

@testable import CompanionCore

private func appcast(_ items: String) -> Data {
    Data(
        """
        <?xml version="1.0" encoding="utf-8"?>
        <rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
          <channel>
            <title>Better Passwords</title>
            \(items)
          </channel>
        </rss>
        """.utf8)
}

private let sonoma = OperatingSystemVersion(majorVersion: 14, minorVersion: 6, patchVersion: 0)

@Suite struct UpdatesTests {
    @Test func comparesDottedVersions() {
        #expect(Updates.isNewer("1.10.0", than: "1.9.2"))
        #expect(Updates.isNewer("2.0", than: "1.9.9"))
        #expect(Updates.isNewer("1.0.1", than: "1.0"))
        #expect(!Updates.isNewer("1.0.0", than: "1.0"))
        #expect(!Updates.isNewer("1.2.0", than: "1.2.1"))
    }

    @Test func readsTheNewestVersion() {
        let data = appcast(
            """
            <item>
              <title>1.2.0</title>
              <sparkle:version>1.2.0</sparkle:version>
              <sparkle:shortVersionString>1.2.0</sparkle:shortVersionString>
              <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
              <enclosure url="https://example.com/a.dmg" length="1" type="application/octet-stream"/>
            </item>
            <item>
              <sparkle:shortVersionString>1.10.0</sparkle:shortVersionString>
            </item>
            """)
        #expect(Updates.latestVersion(inAppcast: data, system: sonoma) == "1.10.0")
    }

    @Test func fallsBackToTheBuildNumber() {
        let data = appcast("<item><sparkle:version>1.3.0</sparkle:version></item>")
        #expect(Updates.latestVersion(inAppcast: data, system: sonoma) == "1.3.0")
    }

    @Test func skipsVersionsThisMacCantRun() {
        let data = appcast(
            """
            <item>
              <sparkle:shortVersionString>2.0.0</sparkle:shortVersionString>
              <sparkle:minimumSystemVersion>15.0</sparkle:minimumSystemVersion>
            </item>
            <item>
              <sparkle:shortVersionString>1.4.0</sparkle:shortVersionString>
              <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
            </item>
            """)
        #expect(Updates.latestVersion(inAppcast: data, system: sonoma) == "1.4.0")
    }

    @Test func findsNothingInOtherDocuments() {
        #expect(Updates.latestVersion(inAppcast: appcast(""), system: sonoma) == nil)
        #expect(Updates.latestVersion(inAppcast: Data("<html><body>Not found".utf8), system: sonoma) == nil)
    }
}

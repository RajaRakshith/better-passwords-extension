import Foundation

/// The little the agent needs to know about updates: which version the appcast offers, and whether
/// it's newer. Sparkle, in the app, does the rest: it downloads the update and verifies it.
public enum Updates {
    /// The newest version in a Sparkle appcast that runs on `system` (default: this Mac).
    public static func latestVersion(
        inAppcast data: Data, system: OperatingSystemVersion = ProcessInfo.processInfo.operatingSystemVersion
    ) -> String? {
        let reader = AppcastReader()
        let parser = XMLParser(data: data)
        parser.delegate = reader
        guard parser.parse() else { return nil }
        let running = "\(system.majorVersion).\(system.minorVersion).\(system.patchVersion)"
        return reader.items
            .filter { item in item.minimumSystem.map { !isNewer($0, than: running) } ?? true }
            .compactMap(\.version)
            .max { isNewer($1, than: $0) }
    }

    /// Whether `version` is newer than `current`, comparing dotted numbers: 1.10.0 is newer than 1.9.2.
    public static func isNewer(_ version: String, than current: String) -> Bool {
        let a = components(version)
        let b = components(current)
        for index in 0..<max(a.count, b.count) {
            let x = index < a.count ? a[index] : 0
            let y = index < b.count ? b[index] : 0
            if x != y { return x > y }
        }
        return false
    }

    private static func components(_ version: String) -> [Int] {
        version.split(separator: ".").map { Int($0) ?? 0 }
    }
}

/// Collects each `<item>`'s version and minimum macOS from an appcast.
private final class AppcastReader: NSObject, XMLParserDelegate {
    struct Item {
        var version: String?
        var minimumSystem: String?
    }

    private(set) var items: [Item] = []
    private var item: Item?
    private var text = ""

    func parser(
        _: XMLParser, didStartElement name: String, namespaceURI _: String?, qualifiedName _: String?,
        attributes _: [String: String] = [:]
    ) {
        if name == "item" { item = Item() }
        text = ""
    }

    func parser(_: XMLParser, foundCharacters string: String) {
        text += string
    }

    func parser(_: XMLParser, didEndElement name: String, namespaceURI _: String?, qualifiedName _: String?) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        switch name {
        case "sparkle:shortVersionString": item?.version = value
        // older appcasts carry only the build number, which is the same as the version here
        case "sparkle:version" where item?.version == nil: item?.version = value
        case "sparkle:minimumSystemVersion": item?.minimumSystem = value
        case "item":
            if let item { items.append(item) }
            item = nil
        default: break
        }
    }
}

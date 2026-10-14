import ApplicationServices
import Foundation

/// Reads the text in one app's windows through the Accessibility API. Used only on processes that
/// passed Apple's code-signing check (see `Processes.appleHelpers`).
enum WindowReader {
    private static let maxDepth = 12
    private static let maxElements = 400

    static func texts(of pid: pid_t) -> [String] {
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 1)
        guard let windows = value(app, kAXWindowsAttribute) as? [AXUIElement] else { return [] }
        var texts: [String] = []
        var budget = maxElements
        for window in windows { collect(window, depth: 0, budget: &budget, into: &texts) }
        return texts
    }

    private static func collect(_ element: AXUIElement, depth: Int, budget: inout Int, into texts: inout [String]) {
        guard depth <= maxDepth, budget > 0 else { return }
        budget -= 1
        for name in [kAXValueAttribute, kAXTitleAttribute, kAXDescriptionAttribute] {
            if let text = value(element, name) as? String, !text.isEmpty { texts.append(text) }
        }
        for child in value(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] {
            collect(child, depth: depth + 1, budget: &budget, into: &texts)
        }
    }

    private static func value(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
        var value: CFTypeRef?
        return AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success ? value : nil
    }
}

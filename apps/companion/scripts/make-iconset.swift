// Renders the extension's SVG icon into a macOS .iconset (then: iconutil -c icns).
// Usage: swift make-iconset.swift <icon.svg> <out.iconset>
//
// macOS app icons leave a margin around the artwork (an 824-point body on a 1024-point canvas),
// so the SVG is drawn smaller than the canvas.

import AppKit

let arguments = CommandLine.arguments
guard arguments.count == 3, let svg = NSImage(contentsOf: URL(fileURLWithPath: arguments[1])) else {
    FileHandle.standardError.write(Data("usage: make-iconset.swift <icon.svg> <out.iconset>\n".utf8))
    exit(2)
}
let output = URL(fileURLWithPath: arguments[2])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = points * scale
        guard
            let bitmap = NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
                samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                bytesPerRow: 0, bitsPerPixel: 0)
        else { exit(1) }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let side = Double(pixels) * 824 / 1024
        let inset = (Double(pixels) - side) / 2
        svg.draw(in: NSRect(x: inset, y: inset, width: side, height: side))
        NSGraphicsContext.restoreGraphicsState()
        let name = scale == 1 ? "icon_\(points)x\(points).png" : "icon_\(points)x\(points)@2x.png"
        try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(name))
    }
}

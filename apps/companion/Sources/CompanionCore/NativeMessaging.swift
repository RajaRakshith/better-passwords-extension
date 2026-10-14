import Foundation

/// Browser native messaging: each message is a 32-bit length in native byte order (little-endian
/// on every Mac) followed by that many bytes of UTF-8 JSON.
public enum NativeMessaging {
    /// We only ever expect tiny requests; anything bigger is a bug or an attack.
    public static let maxIncomingBytes = 64 * 1024

    public enum FramingError: Error, Equatable {
        case tooLarge(Int)
        case truncated
    }

    public static func encode(_ json: Data) -> Data {
        var length = UInt32(json.count).littleEndian
        var frame = Data(bytes: &length, count: 4)
        frame.append(json)
        return frame
    }

    /// Splits complete frames off the front of `buffer`, leaving any partial frame in it.
    public static func decode(_ buffer: inout Data) throws -> [Data] {
        var messages: [Data] = []
        while buffer.count >= 4 {
            let start = buffer.startIndex
            let length = buffer[start..<start + 4].enumerated().reduce(0) { sum, byte in
                sum | Int(byte.element) << (8 * byte.offset)
            }
            if length > maxIncomingBytes { throw FramingError.tooLarge(length) }
            guard buffer.count >= 4 + length else { break }
            messages.append(Data(buffer[start + 4..<start + 4 + length]))
            buffer = Data(buffer[(start + 4 + length)...])
        }
        return messages
    }
}

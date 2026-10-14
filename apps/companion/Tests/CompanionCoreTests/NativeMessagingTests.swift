import Foundation
import Testing

@testable import CompanionCore

@Suite struct NativeMessagingTests {
    @Test func roundTripsFrames() throws {
        var buffer = NativeMessaging.encode(Data(#"{"type":"hello"}"#.utf8))
        buffer.append(NativeMessaging.encode(Data("{}".utf8)))
        let messages = try NativeMessaging.decode(&buffer)
        #expect(messages.map { String(decoding: $0, as: UTF8.self) } == [#"{"type":"hello"}"#, "{}"])
        #expect(buffer.isEmpty)
    }

    @Test func lengthIsLittleEndian() {
        let frame = NativeMessaging.encode(Data(count: 258))
        #expect(Array(frame.prefix(4)) == [2, 1, 0, 0])
    }

    @Test func keepsPartialFrames() throws {
        let frame = NativeMessaging.encode(Data("{}".utf8))
        var buffer = frame.prefix(3)
        #expect(try NativeMessaging.decode(&buffer).isEmpty)
        buffer.append(frame.dropFirst(3))
        #expect(try NativeMessaging.decode(&buffer).count == 1)
    }

    @Test func rejectsHugeFrames() {
        var buffer = Data([0, 0, 0, 1])
        #expect(throws: NativeMessaging.FramingError.tooLarge(16_777_216)) { try NativeMessaging.decode(&buffer) }
    }
}

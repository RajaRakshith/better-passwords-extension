// The native-messaging host the browser launches for the companion. It holds no permissions of
// its own: it relays each request to the agent over XPC and writes back the reply.

import CompanionCore
import Foundation

let relay = HostRelay(agent: XPCAgentClient())
let stdin = FileHandle.standardInput
let stdout = FileHandle.standardOutput
var buffer = Data()

while true {
    let chunk = stdin.availableData
    if chunk.isEmpty { break }  // the browser closed the port
    buffer.append(chunk)
    let messages: [Data]
    do {
        messages = try NativeMessaging.decode(&buffer)
    } catch {
        exit(1)
    }
    for message in messages {
        let response = await relay.handle(message)
        stdout.write(NativeMessaging.encode(HostRelay.encode(response)))
    }
}

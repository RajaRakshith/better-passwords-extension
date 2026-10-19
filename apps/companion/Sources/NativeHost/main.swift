// The native-messaging host the browser launches for the companion. It holds no permissions of
// its own: it relays each request to the agent over XPC and writes back the reply.

import CompanionCore
import Foundation

// the host lives inside the app bundle, so the main bundle is the app's
let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
let relay = HostRelay(agent: XPCAgentClient(), appVersion: appVersion) {
    // `open` finds the installed app by its bundle identifier, wherever it lives
    let open = Process()
    open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    open.arguments = ["-b", Identity.appBundleID]
    guard (try? open.run()) != nil else { return false }
    open.waitUntilExit()
    return open.terminationStatus == 0
}
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

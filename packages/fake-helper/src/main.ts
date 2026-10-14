#!/usr/bin/env bun
// Runs the fake helper as a native-messaging host (stdin/stdout), for end-to-end tests.
//
// Env: FAKE_HELPER_CODE  fixed pairing code (default 123456)
//      FAKE_HELPER_VAULT path to a JSON array of { hostname, username, password }
//      FAKE_HELPER_LOG   file to append a JSON line to for each request to open the Passwords app

import { appendFileSync } from "node:fs";
import { Command, type HelperMessage } from "@app/protocol";
import { FakeHelper, type VaultEntry } from "./fake-helper.ts";
import { encodeFrame, FrameDecoder } from "./native-messaging.ts";

const vaultPath = process.env.FAKE_HELPER_VAULT;
const vault: VaultEntry[] = vaultPath ? await Bun.file(vaultPath).json() : [];
const helper = new FakeHelper({ vault, code: process.env.FAKE_HELPER_CODE ?? "123456" });
const decoder = new FrameDecoder();

const reader = Bun.stdin.stream().getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const message of decoder.push(value)) {
    const logPath = process.env.FAKE_HELPER_LOG;
    if (logPath && (message as HelperMessage).cmd === Command.LaunchPasswordsApp) {
      appendFileSync(logPath, `${JSON.stringify({ url: (message as HelperMessage).searchQueryURL ?? "" })}\n`);
    }
    for (const reply of await helper.handle(message as HelperMessage)) {
      await Bun.write(Bun.stdout, encodeFrame(reply));
    }
  }
}

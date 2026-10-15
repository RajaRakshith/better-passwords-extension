#!/usr/bin/env bun
// Runs a stand-in for the Touch ID companion's native host (apps/companion), for end-to-end tests.
// It answers like the real host after the user confirmed (or cancelled) Touch ID.
//
// Env: FAKE_COMPANION_CODE    the code to "read" (the fake helper's fixed code)
//      FAKE_COMPANION_RESULT  "ok" (default), "cancelled" or "needs-accessibility"
//      FAKE_COMPANION_EMAILS  comma-separated emails on the "Me" card, or "needs-contacts"

import { encodeFrame, FrameDecoder } from "./native-messaging.ts";

const result = process.env.FAKE_COMPANION_RESULT ?? "ok";
const decoder = new FrameDecoder();

function reply(message: { type?: string }) {
  if (message.type === "hello") return { ok: true, version: 2, accessibility: result !== "needs-accessibility" };
  if (message.type === "my-emails") {
    const emails = process.env.FAKE_COMPANION_EMAILS ?? "";
    if (emails === "needs-contacts") {
      return { ok: false, version: 2, error: "needs-contacts", message: "Allow Contacts in Apple Passwords Plus." };
    }
    return { ok: true, version: 2, emails: emails ? emails.split(",") : [] };
  }
  if (message.type !== "read-code") return { ok: false, version: 1, message: "unknown request" };
  if (result === "ok") return { ok: true, version: 1, code: process.env.FAKE_COMPANION_CODE ?? "123456" };
  const messages: Record<string, string> = {
    cancelled: "Touch ID was cancelled.",
    "needs-accessibility": "Open Apple Passwords Plus and allow Accessibility.",
  };
  return { ok: false, version: 1, error: result, message: messages[result] ?? result };
}

const reader = Bun.stdin.stream().getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const message of decoder.push(value)) {
    await Bun.write(Bun.stdout, encodeFrame(reply(message as { type?: string })));
  }
}

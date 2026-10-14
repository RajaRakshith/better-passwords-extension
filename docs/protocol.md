# The helper protocol

Apple doesn't document this protocol. What follows was learned from earlier open-source clients (see [NOTICE](../NOTICE)) and checked against the live helper on macOS 27. The implementation is in `packages/protocol`.

## Transport

Chrome native messaging: every message is a 32-bit little-endian length followed by UTF-8 JSON. Replies echo the request's `cmd` and carry **no correlation id**, so the client sends one request at a time.

## Commands

| `cmd` | Meaning |
|---|---|
| 14 | Get capabilities (`shouldUseBase64`, OS version, feature flags) |
| 2 | Handshake: `msg.QID` is `m0` (client hello) or `m2` (client proof) |
| 4 | List login names for a URL (encrypted) |
| 5 | Get the password for a login name (encrypted; may trigger Touch ID) |
| 13 | Open the Passwords app; optional `searchQueryURL` (an http(s) URL) searches for that site. Plain, needs no pairing, no reply |
| 9 / 10 | From the helper: passwords disabled / re-login needed, so drop the session |
| 0 | End |

## Pairing (SRP-6a)

The group is the RFC 5054 3072-bit group (g = 5) with SHA-256. The *username* is a random 16-byte value encoded as text, and the *password* is the 6-digit code macOS shows.

1. **m0**: the client sends `A`, protocol version `"1.0"`, and `PROTO: [1]` (SRP with RFC verification). PAKE payloads are base64-encoded JSON.
2. The helper shows the code and answers with `B`, the salt `s`, and `PROTO: 1`.
3. Both sides compute:
   - `k = H(N | PAD(g))`
   - `x = H(s | H(I ":" P))`
   - `u = H(PAD(A) | PAD(B))`
   - `S` per RFC 5054
   - **`K = H(S)`**, with `S` in minimal big-endian form
4. **m2**: the client sends `M = H(H(N) xor H(PAD(g)) | H(I) | s | A | B | K)`. `A` and `B` are unpadded here.
5. The helper replies with `HAMK = H(A | M | K)`, or `ErrCode: 1` for a wrong code. The client must check `HAMK` (in constant time) before trusting the session.

A challenge allows exactly one verification attempt, and a new challenge replaces the old one. Binary fields are base64 when `shouldUseBase64` is set, otherwise hex.

The test suite checks `k`, `x`, `v`, `A`, `B`, `u` and `S` against the RFC 5054 Appendix B vectors, and checks that the 3072-bit `N` is prime. A shared bug between our client and our own fake helper could not hide behind self-consistency.

## Encrypted queries

The AES-128-GCM key is the first 16 bytes of `K`, with a 16-byte IV and a 128-bit tag. The framing is **asymmetric**:

- request: `ciphertext‖tag‖IV`
- reply: `IV‖ciphertext‖tag`

The query body goes in `payload.SMSG = JSON.stringify({ TID: username, SDATA: encode(encrypted) })`. The decrypted reply is `{ STATUS, Entries: [{ USR, PWD?, sites }] }`, where `STATUS` 0 means success and 3 means no results.

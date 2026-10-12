// AES-128-GCM channel keyed by the SRP session key.
//
// Apple's framing is asymmetric: requests are ciphertext||IV, replies are IV||ciphertext.
// Both use a 16-byte IV and WebCrypto's default 128-bit tag (appended to the ciphertext).

import { bytesToUtf8, concatBytes, randomBytes, toBufferSource, utf8ToBytes } from "./bytes.ts";

export const IV_LENGTH = 16;

export class SecureChannel {
  private constructor(readonly key: CryptoKey) {}

  static async fromSessionKey(sessionKey: Uint8Array, usage: KeyUsage[] = ["encrypt", "decrypt"]) {
    if (sessionKey.length < 16) throw new Error("session key too short");
    const raw = toBufferSource(sessionKey.slice(0, 16));
    return new SecureChannel(await crypto.subtle.importKey("raw", raw, "AES-GCM", false, usage));
  }

  /** Encrypts a request: returns ciphertext||IV. */
  async encryptRequest(payload: unknown): Promise<Uint8Array> {
    const iv = randomBytes(IV_LENGTH);
    return concatBytes(await this.#encrypt(payload, iv), iv);
  }

  /** Decrypts a reply framed as IV||ciphertext. */
  async decryptReply(framed: Uint8Array): Promise<unknown> {
    return this.#decrypt(framed.slice(0, IV_LENGTH), framed.slice(IV_LENGTH));
  }

  /** Server side (fake helper): encrypts a reply as IV||ciphertext. */
  async encryptReply(payload: unknown): Promise<Uint8Array> {
    const iv = randomBytes(IV_LENGTH);
    return concatBytes(iv, await this.#encrypt(payload, iv));
  }

  /** Server side (fake helper): decrypts a request framed as ciphertext||IV. */
  async decryptRequest(framed: Uint8Array): Promise<unknown> {
    return this.#decrypt(framed.slice(-IV_LENGTH), framed.slice(0, -IV_LENGTH));
  }

  async #encrypt(payload: unknown, iv: Uint8Array): Promise<Uint8Array> {
    const plaintext = toBufferSource(utf8ToBytes(JSON.stringify(payload)));
    const params = { name: "AES-GCM", iv: toBufferSource(iv) };
    return new Uint8Array(await crypto.subtle.encrypt(params, this.key, plaintext));
  }

  async #decrypt(iv: Uint8Array, ciphertext: Uint8Array): Promise<unknown> {
    const params = { name: "AES-GCM", iv: toBufferSource(iv) };
    const plaintext = await crypto.subtle.decrypt(params, this.key, toBufferSource(ciphertext));
    return JSON.parse(bytesToUtf8(new Uint8Array(plaintext)));
  }
}

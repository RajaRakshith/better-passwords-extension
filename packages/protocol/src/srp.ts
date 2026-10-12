// SRP-6a as used by Apple's helper: RFC 5054 group and k/x/u/S formulas, plus Apple's choices
// for the session key (K = H(S)), the client proof M and the server proof HAMK.
//
// The math is parameterized by group and hash so it can be checked against the RFC 5054
// Appendix B test vectors (SHA-1, 1024-bit) as well as used with Apple's SHA-256/3072-bit setup.

import {
  bigIntToBytes,
  bytesToBigInt,
  concatBytes,
  constantTimeEqual,
  mod,
  modPow,
  padStart,
  randomBytes,
  toBufferSource,
  utf8ToBytes,
} from "./bytes.ts";

export interface SrpGroup {
  readonly N: bigint;
  readonly g: bigint;
  /** Length of N in bytes, used for PAD(). */
  readonly byteLength: number;
}

export type HashFn = (...parts: Uint8Array[]) => Promise<Uint8Array>;

function webCryptoHash(algorithm: "SHA-1" | "SHA-256"): HashFn {
  return async (...parts) =>
    new Uint8Array(await crypto.subtle.digest(algorithm, toBufferSource(concatBytes(...parts))));
}

export const sha1 = webCryptoHash("SHA-1");
export const sha256 = webCryptoHash("SHA-256");

/** RFC 5054 Appendix A, 3072-bit group. */
export const RFC5054_3072: SrpGroup = {
  N: BigInt(
    "0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DD" +
      "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
      "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F" +
      "83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B" +
      "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA0510" +
      "15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7" +
      "ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
      "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF",
  ),
  g: 5n,
  byteLength: 384,
};

const pad = (group: SrpGroup, value: bigint) => padStart(bigIntToBytes(value), group.byteLength);

/** k = H(N | PAD(g)) */
export async function computeK(group: SrpGroup, hash: HashFn): Promise<bigint> {
  return bytesToBigInt(await hash(bigIntToBytes(group.N), pad(group, group.g)));
}

/** x = H(s | H(I | ":" | P)) */
export async function computeX(hash: HashFn, salt: Uint8Array, username: string, password: string): Promise<bigint> {
  return bytesToBigInt(await hash(salt, await hash(utf8ToBytes(`${username}:${password}`))));
}

/** u = H(PAD(A) | PAD(B)) */
export async function computeU(group: SrpGroup, hash: HashFn, A: bigint, B: bigint): Promise<bigint> {
  return bytesToBigInt(await hash(pad(group, A), pad(group, B)));
}

/** Client premaster secret: S = (B - k * g^x) ^ (a + u * x) mod N */
export function computeClientS(group: SrpGroup, k: bigint, x: bigint, u: bigint, a: bigint, B: bigint): bigint {
  const base = mod(B - k * modPow(group.g, x, group.N), group.N);
  return modPow(base, a + u * x, group.N);
}

/** Server-side helpers, used by the fake helper and by tests. */
export const server = {
  verifier: (group: SrpGroup, x: bigint) => modPow(group.g, x, group.N),
  publicKey: (group: SrpGroup, k: bigint, v: bigint, b: bigint) => mod(k * v + modPow(group.g, b, group.N), group.N),
  premasterSecret: (group: SrpGroup, A: bigint, v: bigint, u: bigint, b: bigint) =>
    modPow(mod(A * modPow(v, u, group.N), group.N), b, group.N),
};

/** Apple's session key: K = H(S), with S in minimal big-endian form. */
export async function computeSessionKey(hash: HashFn, S: bigint): Promise<Uint8Array> {
  return hash(bigIntToBytes(S));
}

/** Client proof: M = H(H(N) xor H(PAD(g)) | H(I) | s | A | B | K). A and B are not padded. */
export async function computeClientProof(
  group: SrpGroup,
  hash: HashFn,
  p: { username: string; salt: Uint8Array; A: bigint; B: bigint; K: Uint8Array },
): Promise<Uint8Array> {
  const hN = await hash(bigIntToBytes(group.N));
  const hg = await hash(pad(group, group.g));
  const xored = hN.map((byte, i) => byte ^ (hg[i] ?? 0));
  return hash(xored, await hash(utf8ToBytes(p.username)), p.salt, bigIntToBytes(p.A), bigIntToBytes(p.B), p.K);
}

/** Server proof: HAMK = H(A | M | K). */
export async function computeServerProof(hash: HashFn, A: bigint, M: Uint8Array, K: Uint8Array): Promise<Uint8Array> {
  return hash(bigIntToBytes(A), M, K);
}

export interface SrpHandshake {
  /** Session key K. Its first 16 bytes are the AES-128-GCM key. */
  readonly sessionKey: Uint8Array;
  /** Client proof M to send to the server. */
  readonly clientProof: Uint8Array;
  /** Checks the server's proof in constant time. */
  verifyServerProof(hamk: Uint8Array): boolean;
}

/** One SRP-6a client run against Apple's helper. A fresh instance is needed per challenge. */
export class SrpClient {
  readonly A: bigint;
  readonly #a: bigint;

  constructor(
    readonly username: string,
    readonly group: SrpGroup = RFC5054_3072,
    readonly hash: HashFn = sha256,
    privateKey: bigint = bytesToBigInt(randomBytes(32)),
  ) {
    this.#a = privateKey;
    this.A = modPow(group.g, privateKey, group.N);
  }

  async handshake(password: string, B: bigint, salt: Uint8Array): Promise<SrpHandshake> {
    const { group, hash, username, A } = this;
    // RFC 5054 2.5.4: abort if B % N == 0; a zero u would make the password irrelevant
    if (B <= 0n || B >= group.N) throw new Error("invalid server public key");
    if (salt.length === 0) throw new Error("empty salt");
    const u = await computeU(group, hash, A, B);
    if (u === 0n) throw new Error("invalid SRP parameter u");

    const k = await computeK(group, hash);
    const x = await computeX(hash, salt, username, password);
    const S = computeClientS(group, k, x, u, this.#a, B);
    const K = await computeSessionKey(hash, S);
    const M = await computeClientProof(group, hash, { username, salt, A, B, K });
    const expected = await computeServerProof(hash, A, M, K);
    return {
      sessionKey: K,
      clientProof: M,
      verifyServerProof: (hamk) => constantTimeEqual(hamk, expected),
    };
  }
}

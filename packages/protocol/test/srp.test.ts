import { describe, expect, it } from "vitest";
import { bigIntToBytes, bytesToBigInt, hexToBytes, modPow } from "../src/bytes.ts";
import { computeClientS, computeK, computeU, computeX, RFC5054_3072, type SrpGroup, server, sha1 } from "../src/srp.ts";

const hex = (s: string) => BigInt(`0x${s.replace(/\s+/g, "")}`);

// RFC 5054 Appendix A (1024-bit group) and Appendix B (test vectors, SHA-1)
const group1024: SrpGroup = {
  N: hex(`EEAF0AB9 ADB38DD6 9C33F80A FA8FC5E8 60726187 75FF3C0B 9EA2314C
          9C256576 D674DF74 96EA81D3 383B4813 D692C6E0 E0D5D8E2 50B98BE4
          8E495C1D 6089DAD1 5DC7D7B4 6154D6B6 CE8EF4AD 69B15D49 82559B29
          7BCF1885 C529F566 660E57EC 68EDBC3C 05726CC0 2FD4CBF4 976EAA9A
          FD5138FE 8376435B 9FC61D2F C0EB06E3`),
  g: 2n,
  byteLength: 128,
};

const vectors = {
  I: "alice",
  P: "password123",
  s: hexToBytes("BEB25379D1A8581EB5A727673A2441EE"),
  k: hex("7556AA04 5AEF2CDD 07ABAF0F 665C3E81 8913186F"),
  x: hex("94B7555A ABE9127C C58CCF49 93DB6CF8 4D16C124"),
  v: hex(`7E273DE8 696FFC4F 4E337D05 B4B375BE B0DDE156 9E8FA00A 9886D812
          9BADA1F1 822223CA 1A605B53 0E379BA4 729FDC59 F105B478 7E5186F5
          C671085A 1447B52A 48CF1970 B4FB6F84 00BBF4CE BFBB1681 52E08AB5
          EA53D15C 1AFF87B2 B9DA6E04 E058AD51 CC72BFC9 033B564E 26480D78
          E955A5E2 9E7AB245 DB2BE315 E2099AFB`),
  a: hex("60975527 035CF2AD 1989806F 0407210B C81EDC04 E2762A56 AFD529DD DA2D4393"),
  b: hex("E487CB59 D31AC550 471E81F0 0F6928E0 1DDA08E9 74A004F4 9E61F5D1 05284D20"),
  A: hex(`61D5E490 F6F1B795 47B0704C 436F523D D0E560F0 C64115BB 72557EC4
          4352E890 3211C046 92272D8B 2D1A5358 A2CF1B6E 0BFCF99F 921530EC
          8E393561 79EAE45E 42BA92AE ACED8251 71E1E8B9 AF6D9C03 E1327F44
          BE087EF0 6530E69F 66615261 EEF54073 CA11CF58 58F0EDFD FE15EFEA
          B349EF5D 76988A36 72FAC47B 0769447B`),
  B: hex(`BD0C6151 2C692C0C B6D041FA 01BB152D 4916A1E7 7AF46AE1 05393011
          BAF38964 DC46A067 0DD125B9 5A981652 236F99D9 B681CBF8 7837EC99
          6C6DA044 53728610 D0C6DDB5 8B318885 D7D82C7F 8DEB75CE 7BD4FBAA
          37089E6F 9C6059F3 88838E7A 00030B33 1EB76840 910440B1 B27AAEAE
          EB4012B7 D7665238 A8E3FB00 4B117B58`),
  u: hex("CE38B959 3487DA98 554ED47D 70A7AE5F 462EF019"),
  S: hex(`B0DC82BA BCF30674 AE450C02 87745E79 90A3381F 63B387AA F271A10D
          233861E3 59B48220 F7C4693C 9AE12B0A 6F67809F 0876E2D0 13800D6C
          41BB59B6 D5979B5C 00A172B4 A2A5903A 0BDCAF8A 709585EB 2AFAFA8F
          3499B200 210DCC1F 10EB3394 3CD67FC8 8A2F39A4 BE5BEC4E C0A3212D
          C346D7E4 74B29EDE 8A469FFE CA686E5A`),
};

describe("SRP-6a against RFC 5054 Appendix B", () => {
  it("computes k, x, v, A, B and u", async () => {
    const k = await computeK(group1024, sha1);
    const x = await computeX(sha1, vectors.s, vectors.I, vectors.P);
    expect(k).toBe(vectors.k);
    expect(x).toBe(vectors.x);
    expect(server.verifier(group1024, x)).toBe(vectors.v);
    expect(modPow(group1024.g, vectors.a, group1024.N)).toBe(vectors.A);
    expect(server.publicKey(group1024, k, vectors.v, vectors.b)).toBe(vectors.B);
    expect(await computeU(group1024, sha1, vectors.A, vectors.B)).toBe(vectors.u);
  });

  it("derives the same premaster secret on both sides", () => {
    const S = computeClientS(group1024, vectors.k, vectors.x, vectors.u, vectors.a, vectors.B);
    expect(S).toBe(vectors.S);
    expect(server.premasterSecret(group1024, vectors.A, vectors.v, vectors.u, vectors.b)).toBe(vectors.S);
  });
});

describe("RFC 5054 3072-bit group", () => {
  it("is 3072 bits with generator 5", () => {
    expect(RFC5054_3072.N.toString(2)).toHaveLength(3072);
    expect(bigIntToBytes(RFC5054_3072.N)).toHaveLength(RFC5054_3072.byteLength);
    expect(RFC5054_3072.g).toBe(5n);
  });

  // a single wrong digit (a real bug in another client) makes N composite and breaks interop
  it("is prime (Miller-Rabin, fixed bases)", () => {
    const N = RFC5054_3072.N;
    let d = N - 1n;
    let r = 0;
    while (d % 2n === 0n) {
      d /= 2n;
      r++;
    }
    for (const a of [2n, 3n, 5n, 7n]) {
      let x = modPow(a, d, N);
      if (x === 1n || x === N - 1n) continue;
      let witness = true;
      for (let i = 1; i < r && witness; i++) {
        x = (x * x) % N;
        if (x === N - 1n) witness = false;
      }
      expect(witness, `base ${a} proves N composite`).toBe(false);
    }
  });

  it("round-trips bigints through minimal big-endian bytes", () => {
    for (const n of [0n, 1n, 255n, 256n, RFC5054_3072.N]) expect(bytesToBigInt(bigIntToBytes(n))).toBe(n);
  });
});

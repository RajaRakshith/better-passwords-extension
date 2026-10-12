// Native messaging framing: a 4-byte little-endian length, then that many bytes of UTF-8 JSON.

export function encodeFrame(message: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  const frame = new Uint8Array(4 + body.length);
  new DataView(frame.buffer).setUint32(0, body.length, true);
  frame.set(body, 4);
  return frame;
}

/** Splits a byte stream into decoded messages. Keeps partial frames between chunks. */
export class FrameDecoder {
  #buffer = new Uint8Array(0);

  push(chunk: Uint8Array): unknown[] {
    const merged = new Uint8Array(this.#buffer.length + chunk.length);
    merged.set(this.#buffer);
    merged.set(chunk, this.#buffer.length);

    const messages: unknown[] = [];
    let offset = 0;
    while (merged.length - offset >= 4) {
      const length = new DataView(merged.buffer, offset, 4).getUint32(0, true);
      if (merged.length - offset - 4 < length) break;
      const body = merged.subarray(offset + 4, offset + 4 + length);
      messages.push(JSON.parse(new TextDecoder().decode(body)));
      offset += 4 + length;
    }
    this.#buffer = merged.slice(offset);
    return messages;
  }
}

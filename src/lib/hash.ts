// src/lib/hash.ts

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    out += B64[bytes[i] >> 2];
    out += B64[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    out += B64[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    out += B64[bytes[i + 2] & 63];
  }

  if (i < bytes.length) {
    out += B64[bytes[i] >> 2];
    if (i + 1 < bytes.length) {
      out += B64[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      out += B64[(bytes[i + 1] & 15) << 2];
      out += "=";
    } else {
      out += B64[(bytes[i] & 3) << 4];
      out += "==";
    }
  }

  // URL-safe
  return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** SHA-256 -> base64url. Works in browser, Node 18+, and Edge runtimes. */
export async function hashKey(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await (globalThis.crypto as Crypto).subtle.digest(
    "SHA-256",
    data
  );
  return toBase64Url(new Uint8Array(digest));
}

/** Convenience: cache key per (voiceId + say) */
export async function ttsCacheKey(voiceId: string, say: string) {
  return hashKey(`${voiceId}:${say}`);
}

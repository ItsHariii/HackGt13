// RFC 9530 Content-Digest (sha-256 only; sha-512 is accepted when verifying).

import { buf, timingSafeEqual, utf8 } from "./base64";
import { isInnerList, parseDictionary, serializeBareItem } from "./structured";

type Body = string | Uint8Array;

function bytesOf(body: Body): Uint8Array<ArrayBuffer> {
  return typeof body === "string" ? utf8(body) : buf(body);
}

/** `sha-256=:<base64>:` for the exact bytes that go on the wire. */
export async function contentDigest(body: Body): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytesOf(body));
  return `sha-256=${serializeBareItem(new Uint8Array(digest))}`;
}

const ALGORITHMS: Record<string, string> = {
  "sha-256": "SHA-256",
  "sha-512": "SHA-512",
};

/**
 * True when every supported digest in the header matches the body and at
 * least one supported digest is present. Unknown algorithms are ignored.
 */
export async function verifyContentDigest(
  header: string | null,
  body: Body,
): Promise<boolean> {
  if (!header) return false;
  let dict: ReturnType<typeof parseDictionary>;
  try {
    dict = parseDictionary(header);
  } catch {
    return false;
  }
  let checked = 0;
  for (const [alg, member] of dict) {
    const name = ALGORITHMS[alg];
    if (!name) continue;
    if (isInnerList(member) || !(member.value instanceof Uint8Array)) {
      return false;
    }
    const actual = new Uint8Array(
      await crypto.subtle.digest(name, bytesOf(body)),
    );
    if (!timingSafeEqual(actual, member.value)) return false;
    checked++;
  }
  return checked > 0;
}

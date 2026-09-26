import { describe, expect, it } from "vitest";
import { createTestAuthenticator } from "./fixtures/authenticator";
import { derToP1363, verifyContractSignature } from "./webauthn";

const bodyHash = `sha256:${"a".repeat(64)}` as const;
const origin = "https://cartel.example";
const rpId = "cartel.example";
const expect0 = { bodyHash, expectedOrigin: origin, expectedRpId: rpId };

describe.each(["ES256", "EdDSA"] as const)(
  "verifyContractSignature (%s)",
  (alg) => {
    it("accepts a genuine assertion over the contract hash", async () => {
      const auth = await createTestAuthenticator(alg);
      const sig = await auth.sign({
        bodyHash,
        nonce: "nonce-0123456789abcd",
        origin,
        rpId,
      });
      expect(await verifyContractSignature(sig, expect0)).toEqual({
        ok: true,
        nonce: "nonce-0123456789abcd",
        userVerified: true,
        signCount: 1,
      });
    });

    it.each([
      [
        "a different contract",
        { bodyHash: `sha256:${"b".repeat(64)}` },
        {},
        "body_hash_mismatch",
      ],
      [
        "another origin",
        { expectedOrigin: "https://evil.example" },
        {},
        "wrong_origin",
      ],
      ["another RP ID", { expectedRpId: "evil.example" }, {}, "wrong_rp_id"],
      [
        "no user verification",
        {},
        { userVerified: false },
        "user_not_verified",
      ],
      [
        "a registration ceremony",
        {},
        { type: "webauthn.create" },
        "wrong_type",
      ],
    ] as const)(
      "rejects %s",
      async (_name, expectOverride, signOverride, reason) => {
        const auth = await createTestAuthenticator(alg);
        const sig = await auth.sign({
          bodyHash,
          origin,
          rpId,
          ...signOverride,
        });
        expect(
          await verifyContractSignature(sig, { ...expect0, ...expectOverride }),
        ).toEqual({
          ok: false,
          reason,
        });
      },
    );

    it("rejects a hash swapped after signing and a foreign key", async () => {
      const auth = await createTestAuthenticator(alg);
      const other = await createTestAuthenticator(alg);
      const sig = await auth.sign({ bodyHash, origin, rpId });
      const otherHash = `sha256:${"c".repeat(64)}` as const;
      expect(
        await verifyContractSignature(
          { ...sig, bodyHash: otherHash },
          { ...expect0, bodyHash: otherHash },
        ),
      ).toEqual({ ok: false, reason: "challenge_mismatch" });
      expect(
        await verifyContractSignature(
          { ...sig, publicKeyJwk: other.publicKeyJwk },
          expect0,
        ),
      ).toEqual({ ok: false, reason: "bad_signature" });
    });
  },
);

describe("derToP1363", () => {
  it("rejects trailing garbage and oversize integers", () => {
    expect(
      derToP1363(Uint8Array.of(0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02)),
    ).not.toBeNull();
    expect(
      derToP1363(
        Uint8Array.of(0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x00),
      ),
    ).toBeNull();
    expect(derToP1363(Uint8Array.of(0x31, 0x00))).toBeNull();
  });
});

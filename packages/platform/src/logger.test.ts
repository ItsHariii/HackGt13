import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

/** T17.3: the values below must never reach a log line. */
const FORBIDDEN = [
  "4111",
  "Bearer eyJ",
  "sb_secret_",
  "sig1=:",
  "keyid=",
  "whsec_",
  "-----BEGIN",
];

function capture(log: (logger: ReturnType<typeof createLogger>) => void) {
  const lines: string[] = [];
  const logger = createLogger("test", {
    write: (line: string) => {
      lines.push(line);
    },
  });
  log(logger);
  return lines.join("");
}

describe("log redaction (T17.3)", () => {
  it("drops credentials, signatures and card data in the shapes the apps log", () => {
    const out = capture((logger) => {
      logger.info(
        {
          headers: {
            authorization: "Bearer eyJhbGciOi.secret",
            cookie: "sb-access-token=abc",
            apikey: "sb_secret_abc",
            signature: "sig1=:MEUCIQ...:",
            "signature-input": 'sig1=("@method");keyid="k1"',
            "x-api-key": "sb_secret_def",
          },
          req: {
            headers: { authorization: "Bearer eyJ..." },
            body: { card: { number: "4111111111111111" } },
          },
          body: '{"number":"4111111111111111"}',
          card: { number: "4111111111111111", cvv: "123" },
          payment: { pan: "4111111111111111" },
          secret: "whsec_abc",
          webhook: { secret: "whsec_def", signature: "sig1=:abc:" },
          config: { private_key: "-----BEGIN PRIVATE KEY-----" },
          token: "eyJ",
          grant: { token: "Bearer eyJgrant" },
          upstream: { authorization: "Bearer eyJnested" },
          user: { email: "a@example.com" },
        },
        "request",
      );
    });
    for (const needle of FORBIDDEN) expect(out).not.toContain(needle);
    expect(out).not.toContain("a@example.com");
    expect(out).toContain("[REDACTED]");
  });

  it("keeps the operational fields the apps rely on", () => {
    const out = capture((logger) =>
      logger.info(
        { requestId: "req_1", sessionId: "cs_1", status: "authorized" },
        "charge attempted",
      ),
    );
    expect(JSON.parse(out)).toMatchObject({
      requestId: "req_1",
      sessionId: "cs_1",
      status: "authorized",
      service: "test",
    });
  });
});

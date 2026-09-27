import pino from "pino";

export const redactionPaths = [
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "*.password",
  "*.secret",
  "*.token",
  "*.access_token",
  "*.refresh_token",
  "signature",
  "signature_input",
  "api_key",
  "apikey",
  "private_key",
  "*.authorization",
  "*.cookie",
  "*.signature",
  "*.signature_input",
  "*.api_key",
  "*.apikey",
  "*.private_key",
  "headers.authorization",
  "headers.cookie",
  "headers.apikey",
  'headers["set-cookie"]',
  "headers.signature",
  'headers["signature-input"]',
  'headers["x-api-key"]',
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.apikey",
  "req.headers.signature",
  'req.headers["signature-input"]',
  'res.headers["set-cookie"]',
  "req.body",
  "body",
  "user",
  "payment",
  "card",
];

export function createLogger(
  service: string,
  destination?: pino.DestinationStream,
) {
  const options: pino.LoggerOptions = {
    name: service,
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: redactionPaths, censor: "[REDACTED]" },
    base: { service },
  };
  return destination ? pino(options, destination) : pino(options);
}

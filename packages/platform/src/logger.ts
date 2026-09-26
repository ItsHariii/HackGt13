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
  "headers.authorization",
  "headers.cookie",
  "headers.apikey",
  'headers["set-cookie"]',
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.apikey",
  'res.headers["set-cookie"]',
  "req.body",
  "body",
  "user",
  "payment",
  "card",
];

export function createLogger(service: string) {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: redactionPaths, censor: "[REDACTED]" },
    base: { service },
  });
}

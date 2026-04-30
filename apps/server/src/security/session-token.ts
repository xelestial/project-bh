import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function createSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("base64url");
}

export function verifySessionTokenHash(
  token: string,
  secret: string,
  expectedHash: string
): boolean {
  const actualHash = hashSessionToken(token, secret);
  const actual = Buffer.from(actualHash, "utf8");
  const expected = Buffer.from(expectedHash, "utf8");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export function redactSessionToken(token: string): string {
  if (token.length < 12) {
    return "[redacted]";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

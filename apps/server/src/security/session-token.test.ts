import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionToken,
  hashSessionToken,
  redactSessionToken,
  verifySessionTokenHash
} from "./session-token.ts";

test("createSessionToken returns high-entropy base64url tokens", () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
});

test("hashSessionToken verifies without exposing plaintext", () => {
  const token = createSessionToken();
  const secret = "test-secret";
  const hash = hashSessionToken(token, secret);

  assert.notEqual(hash, token);
  assert.equal(hash.includes(token), false);
  assert.equal(verifySessionTokenHash(token, secret, hash), true);
  assert.equal(verifySessionTokenHash(`${token}x`, secret, hash), false);
});

test("redactSessionToken keeps logs token-safe", () => {
  assert.equal(redactSessionToken("abcdef1234567890"), "abcd...7890");
  assert.equal(redactSessionToken("short"), "[redacted]");
});

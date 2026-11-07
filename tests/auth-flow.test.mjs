import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, index] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
]);

test("signup flow contains confirmation and resend safeguards", () => {
  assert.match(index, /id="signupValidation"/);
  assert.match(index, /id="resendConfirmation"/);
  assert.match(app, /auth\.resend\(\{ type: "signup"/);
  assert.match(app, /remaining = 60/);
  assert.match(app, /button\.disabled = true/);
});

test("signup validation protects email, password and confirmation", () => {
  assert.match(app, /const validEmail =/);
  assert.match(app, /password\.length >= 8/);
  assert.match(app, /password !== confirmation/);
});

test("auth error mapping distinguishes rate limits and unconfirmed email", () => {
  assert.match(app, /over_email_send_rate_limit/);
  assert.match(app, /email not confirmed/);
  assert.match(app, /invalid login credentials/);
});

test("language-specific recovery messages are available", () => {
  assert.match(index, /PULSE_AUTH_TEXT/);
  assert.match(index, /recoverySent/);
  assert.match(app, /authText\("recoverySent"/);
});


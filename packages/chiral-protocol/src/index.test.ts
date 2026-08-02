import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertCompatibleVersion,
  isRelayEnvelope,
  isSecureMessage,
  PROTOCOL_VERSION,
  type PairingBundle,
  type RelayEnvelope,
} from "./index.js";

test("accepts the cross-language relay fixture shape", () => {
  const fixture = readFixture("relay-envelope.json") as RelayEnvelope;
  assert.equal(isRelayEnvelope(fixture), true);
  assert.equal(fixture.version, PROTOCOL_VERSION);
});

test("accepts the shared secure-message fixture", () => {
  assert.equal(isSecureMessage(readFixture("secure-message.json")), true);
});

test("keeps the shared PairingBundle wire shape", () => {
  const fixture = readFixture("pairing-bundle.json") as PairingBundle;
  assert.equal(fixture.protocolVersion, PROTOCOL_VERSION);
  assert.equal(fixture.expiresAt, "2030-01-02T03:04:05.000Z");
  assert.deepEqual(fixture.lanEndpoints, ["ws://192.0.2.10:3778/v1/local"]);
});

test("decrypts the deterministic Dart/Rust crypto fixture", () => {
  const fixture = readFixture("encrypted-message.json") as {
    key: string;
    plaintext: unknown;
    envelope: RelayEnvelope;
  };
  assert.equal(isRelayEnvelope(fixture.envelope), true);
  const decipher = createDecipheriv(
    "chacha20-poly1305",
    Buffer.from(fixture.key, "base64"),
    Buffer.from(fixture.envelope.nonce, "base64"),
    { authTagLength: 16 },
  );
  const combined = Buffer.from(fixture.envelope.ciphertext, "base64");
  decipher.setAAD(
    Buffer.from(
      [
        fixture.envelope.version,
        fixture.envelope.messageId,
        fixture.envelope.sourceDeviceId,
        fixture.envelope.targetDeviceId,
        fixture.envelope.sequence,
        fixture.envelope.kind,
      ].join("\n"),
    ),
    { plaintextLength: combined.length - 16 },
  );
  decipher.setAuthTag(combined.subarray(combined.length - 16));
  const plaintext = Buffer.concat([
    decipher.update(combined.subarray(0, combined.length - 16)),
    decipher.final(),
  ]);
  assert.deepEqual(JSON.parse(plaintext.toString("utf8")), fixture.plaintext);
});

function readFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../../protocol/v1/fixtures/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

test("rejects plaintext and invalid nonce fields", () => {
  assert.equal(
    isRelayEnvelope({
      version: PROTOCOL_VERSION,
      messageId: "msg-1",
      sourceDeviceId: "desktop-1",
      targetDeviceId: "mobile-1",
      sequence: 1,
      kind: "event",
      nonce: "not-a-nonce",
      ciphertext: "plaintext",
    }),
    false,
  );
  assert.equal(
    isRelayEnvelope({
      version: PROTOCOL_VERSION,
      messageId: "msg-2",
      sourceDeviceId: "desktop-1",
      targetDeviceId: "mobile-1",
      sequence: 1,
      kind: "event",
      nonce: Buffer.alloc(12).toString("base64"),
      ciphertext: Buffer.from("opaque").toString("base64"),
    }),
    false,
  );
});

test("validates operation namespaces and major versions", () => {
  assert.equal(
    isSecureMessage({
      operation: "session.list",
      timestamp: new Date().toISOString(),
      payload: {},
    }),
    true,
  );
  assert.doesNotThrow(() => assertCompatibleVersion("1.7"));
  assert.throws(() => assertCompatibleVersion("2.0"), /Unsupported/);
});

import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DeviceDescriptor, RelayEnvelope } from "@chiral/protocol";
import { WebSocket, type RawData } from "ws";
import { ChiralRelayServer } from "./server.js";

test("pairing is one-time and relay state contains no pairing token", async () => {
  const fixture = await startFixture();
  try {
    const pairing = await createPairing(fixture.baseUrl, fixture.desktop.device);
    const claimResponse = await fetch(
      `${fixture.baseUrl}/v1/pairings/${pairing.pairingId}/claim`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pairingToken: pairing.pairingToken,
          mobile: fixture.mobile.device,
        }),
      },
    );
    assert.equal(claimResponse.status, 200);
    const statusResponse = await fetch(
      `${fixture.baseUrl}/v1/pairings/${pairing.pairingId}`,
      { headers: { authorization: `Bearer ${pairing.pairingToken}` } },
    );
    assert.equal(statusResponse.status, 200);
    const status = (await statusResponse.json()) as {
      claimed: boolean;
      mobile: DeviceDescriptor;
    };
    assert.equal(status.claimed, true);
    assert.equal(status.mobile.deviceId, fixture.mobile.device.deviceId);
    const secondClaim = await fetch(
      `${fixture.baseUrl}/v1/pairings/${pairing.pairingId}/claim`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pairingToken: pairing.pairingToken,
          mobile: fixture.mobile.device,
        }),
      },
    );
    assert.equal(secondClaim.status, 409);
    assert.equal(
      readFileSync(fixture.statePath, "utf8").includes(pairing.pairingToken),
      false,
    );
  } finally {
    await fixture.server.close();
  }
});

test("routes only opaque envelopes between authenticated peers", async () => {
  const fixture = await startFixture();
  try {
    const pairing = await createPairing(fixture.baseUrl, fixture.desktop.device);
    await fetch(`${fixture.baseUrl}/v1/pairings/${pairing.pairingId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingToken: pairing.pairingToken,
        mobile: fixture.mobile.device,
      }),
    });
    const desktopSocket = await authenticatedSocket(
      fixture.websocketUrl,
      fixture.desktop,
    );
    const mobileSocket = await authenticatedSocket(
      fixture.websocketUrl,
      fixture.mobile,
    );
    const envelope: RelayEnvelope = {
      version: "1.0",
      messageId: "msg-opaque",
      sourceDeviceId: fixture.desktop.device.deviceId,
      targetDeviceId: fixture.mobile.device.deviceId,
      sequence: 1,
      kind: "event",
      nonce: nonceForSequence(1),
      ciphertext: Buffer.from("encrypted-only").toString("base64"),
    };
    const received = nextJson(mobileSocket);
    desktopSocket.send(JSON.stringify(envelope));
    assert.deepEqual(await received, envelope);
    assert.equal(
      readFileSync(fixture.statePath, "utf8").includes("encrypted-only"),
      false,
    );
    desktopSocket.close();
    mobileSocket.close();
  } finally {
    await fixture.server.close();
  }
});

test("rejects invalid pairing tokens without consuming the pairing", async () => {
  const fixture = await startFixture();
  try {
    const pairing = await createPairing(fixture.baseUrl, fixture.desktop.device);
    const invalid = await fetch(
      `${fixture.baseUrl}/v1/pairings/${pairing.pairingId}/claim`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pairingToken: "wrong-token",
          mobile: fixture.mobile.device,
        }),
      },
    );
    assert.equal(invalid.status, 401);
    const valid = await claimPairing(fixture, pairing);
    assert.equal(valid.status, 200);
  } finally {
    await fixture.server.close();
  }
});

test("rejects forged device authentication", async () => {
  const fixture = await startFixture();
  try {
    const pairing = await createPairing(fixture.baseUrl, fixture.desktop.device);
    await claimPairing(fixture, pairing);
    const socket = new WebSocket(fixture.websocketUrl);
    const challenge = (await nextJson(socket)) as { nonce: string };
    socket.send(
      JSON.stringify({
        type: "authenticate",
        deviceId: fixture.desktop.device.deviceId,
        signature: sign(
          null,
          Buffer.from(challenge.nonce, "utf8"),
          fixture.mobile.privateKey,
        ).toString("base64"),
      }),
    );
    const error = (await nextJson(socket)) as { type: string; code: string };
    assert.deepEqual(
      { type: error.type, code: error.code },
      { type: "relay_error", code: "SIGNATURE_INVALID" },
    );
    socket.close();
  } finally {
    await fixture.server.close();
  }
});

test("rejects replayed and out-of-order envelopes", async () => {
  const fixture = await startFixture();
  try {
    const pairing = await createPairing(fixture.baseUrl, fixture.desktop.device);
    await claimPairing(fixture, pairing);
    const desktopSocket = await authenticatedSocket(
      fixture.websocketUrl,
      fixture.desktop,
    );
    const mobileSocket = await authenticatedSocket(
      fixture.websocketUrl,
      fixture.mobile,
    );
    const envelope = opaqueEnvelope(fixture, 2, "sequence-two");
    const received = nextJson(mobileSocket);
    desktopSocket.send(JSON.stringify(envelope));
    assert.deepEqual(await received, envelope);
    const ack = (await nextJson(desktopSocket)) as { type: string };
    assert.equal(ack.type, "relay_ack");

    desktopSocket.send(
      JSON.stringify(opaqueEnvelope(fixture, 1, "out-of-order")),
    );
    const error = (await nextJson(desktopSocket)) as {
      type: string;
      code: string;
    };
    assert.equal(error.type, "relay_error");
    assert.equal(error.code, "SEQUENCE_REPLAYED");
    desktopSocket.close();
    mobileSocket.close();
  } finally {
    await fixture.server.close();
  }
});

test("signed revocation unlinks peers and blocks further routing", async () => {
  const fixture = await startFixture();
  try {
    const pairing = await createPairing(fixture.baseUrl, fixture.desktop.device);
    await claimPairing(fixture, pairing);
    const path =
      `/v1/devices/${fixture.desktop.device.deviceId}` +
      `/peers/${fixture.mobile.device.deviceId}`;
    const timestamp = new Date().toISOString();
    const response = await fetch(`${fixture.baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        "x-chiral-timestamp": timestamp,
        "x-chiral-signature": sign(
          null,
          Buffer.from(`DELETE\n${path}\n${timestamp}`, "utf8"),
          fixture.desktop.privateKey,
        ).toString("base64"),
      },
    });
    assert.equal(response.status, 204);

    const desktopSocket = await authenticatedSocket(
      fixture.websocketUrl,
      fixture.desktop,
    );
    desktopSocket.send(
      JSON.stringify(opaqueEnvelope(fixture, 1, "after-revoke")),
    );
    const error = (await nextJson(desktopSocket)) as {
      type: string;
      code: string;
    };
    assert.equal(error.code, "TARGET_NOT_PAIRED");
    desktopSocket.close();
  } finally {
    await fixture.server.close();
  }
});

test("rate limits envelope floods on an authenticated connection", async () => {
  const fixture = await startFixture({ messagesPerSecond: 3 });
  try {
    const pairing = await createPairing(fixture.baseUrl, fixture.desktop.device);
    await claimPairing(fixture, pairing);
    const desktopSocket = await authenticatedSocket(
      fixture.websocketUrl,
      fixture.desktop,
    );
    const rateLimited = nextMatchingJson(
      desktopSocket,
      (value) =>
        typeof value === "object" &&
        value !== null &&
        (value as { code?: string }).code === "RATE_LIMITED",
    );
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      desktopSocket.send(
        JSON.stringify(opaqueEnvelope(fixture, sequence, `flood-${sequence}`)),
      );
    }
    const error = (await rateLimited) as { type: string; code: string };
    assert.equal(error.type, "relay_error");
    assert.equal(error.code, "RATE_LIMITED");
    desktopSocket.close();
  } finally {
    await fixture.server.close();
  }
});

test("rejects expired revocation signatures", async () => {
  const fixture = await startFixture();
  try {
    const pairing = await createPairing(fixture.baseUrl, fixture.desktop.device);
    await claimPairing(fixture, pairing);
    const path =
      `/v1/devices/${fixture.desktop.device.deviceId}` +
      `/peers/${fixture.mobile.device.deviceId}`;
    const timestamp = new Date(Date.now() - 10 * 60_000).toISOString();
    const response = await fetch(`${fixture.baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        "x-chiral-timestamp": timestamp,
        "x-chiral-signature": sign(
          null,
          Buffer.from(`DELETE\n${path}\n${timestamp}`, "utf8"),
          fixture.desktop.privateKey,
        ).toString("base64"),
      },
    });
    assert.equal(response.status, 401);
  } finally {
    await fixture.server.close();
  }
});

async function startFixture(
  options: { messagesPerSecond?: number } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "chiral-relay-"));
  const statePath = join(directory, "state.json");
  const server = new ChiralRelayServer({ statePath, ...options });
  const port = await server.listen(0, "127.0.0.1");
  return {
    server,
    statePath,
    baseUrl: `http://127.0.0.1:${port}`,
    websocketUrl: `ws://127.0.0.1:${port}/v1/relay`,
    desktop: createDevice("desktop-test"),
    mobile: createDevice("mobile-test"),
  };
}

async function createPairing(baseUrl: string, desktop: DeviceDescriptor) {
  const response = await fetch(`${baseUrl}/v1/pairings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ desktop, lanEndpoints: ["ws://127.0.0.1:3778"] }),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as {
    pairingId: string;
    pairingToken: string;
  };
}

function claimPairing(
  fixture: Awaited<ReturnType<typeof startFixture>>,
  pairing: Awaited<ReturnType<typeof createPairing>>,
) {
  return fetch(
    `${fixture.baseUrl}/v1/pairings/${pairing.pairingId}/claim`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingToken: pairing.pairingToken,
        mobile: fixture.mobile.device,
      }),
    },
  );
}

function opaqueEnvelope(
  fixture: Awaited<ReturnType<typeof startFixture>>,
  sequence: number,
  content: string,
): RelayEnvelope {
  return {
    version: "1.0",
    messageId: `msg-${sequence}-${content}`,
    sourceDeviceId: fixture.desktop.device.deviceId,
    targetDeviceId: fixture.mobile.device.deviceId,
    sequence,
    kind: "event",
    nonce: nonceForSequence(sequence),
    ciphertext: Buffer.from(content).toString("base64"),
  };
}

function nonceForSequence(sequence: number, epoch = 1): string {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE(epoch, 0);
  nonce.writeBigUInt64BE(BigInt(sequence), 4);
  return nonce.toString("base64");
}

function createDevice(deviceId: string) {
  const identity = generateKeyPairSync("ed25519");
  const agreement = generateKeyPairSync("x25519");
  return {
    device: {
      deviceId,
      displayName: deviceId,
      identityPublicKey: identity.publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
      agreementPublicKey: agreement.publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
    },
    privateKey: identity.privateKey,
  };
}

async function authenticatedSocket(
  websocketUrl: string,
  identity: ReturnType<typeof createDevice>,
): Promise<WebSocket> {
  const socket = new WebSocket(websocketUrl);
  const challenge = (await nextJson(socket)) as { nonce: string };
  socket.send(
    JSON.stringify({
      type: "authenticate",
      deviceId: identity.device.deviceId,
      signature: sign(
        null,
        Buffer.from(challenge.nonce, "utf8"),
        identity.privateKey,
      ).toString("base64"),
    }),
  );
  const authenticated = (await nextJson(socket)) as { type: string };
  assert.equal(authenticated.type, "authenticated");
  return socket;
}

function nextJson(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket message"));
    }, 2_000);
    socket.once("message", (data) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function nextMatchingJson(
  socket: WebSocket,
  predicate: (value: unknown) => boolean,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for matching WebSocket message"));
    }, 2_000);
    const onMessage = (data: RawData) => {
      try {
        const value = JSON.parse(data.toString()) as unknown;
        if (!predicate(value)) return;
        clearTimeout(timeout);
        socket.off("message", onMessage);
        resolve(value);
      } catch (error) {
        clearTimeout(timeout);
        socket.off("message", onMessage);
        reject(error);
      }
    };
    socket.on("message", onMessage);
  });
}

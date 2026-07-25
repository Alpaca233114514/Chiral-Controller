import {
  createPublicKey,
  randomBytes,
  verify,
} from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import {
  isRelayEnvelope,
  PROTOCOL_VERSION,
  type DeviceDescriptor,
  type RelayEnvelope,
} from "@chiral/protocol";
import { WebSocket, WebSocketServer } from "ws";
import { RelayStateStore, StoreError } from "./state-store.js";

export type RelayServerOptions = {
  statePath: string;
  publicRelayUrl?: string;
  maxEnvelopeBytes?: number;
  maxAttachmentBytes?: number;
  pairingTtlSeconds?: number;
  messagesPerSecond?: number;
};

type AuthenticatedSocket = WebSocket & {
  deviceId?: string;
  challenge?: string;
  lastSequence?: number;
  rateWindow?: { second: number; count: number };
};

export class ChiralRelayServer {
  readonly httpServer: Server;
  private readonly sockets = new Map<string, Set<AuthenticatedSocket>>();
  private readonly store: RelayStateStore;
  private readonly websocketServer: WebSocketServer;
  private readonly options: Required<Omit<RelayServerOptions, "statePath">>;

  constructor(options: RelayServerOptions) {
    this.options = {
      publicRelayUrl:
        options.publicRelayUrl ?? "wss://chiral.liyuanstudio.com/v1/relay",
      maxEnvelopeBytes: options.maxEnvelopeBytes ?? 1_048_576,
      maxAttachmentBytes: options.maxAttachmentBytes ?? 20 * 1024 * 1024,
      pairingTtlSeconds: options.pairingTtlSeconds ?? 300,
      messagesPerSecond: options.messagesPerSecond ?? 50,
    };
    this.store = new RelayStateStore(options.statePath);
    this.httpServer = createServer((request, response) => {
      this.handleHttp(request, response).catch((error: unknown) => {
        this.sendError(response, error);
      });
    });
    this.websocketServer = new WebSocketServer({
      noServer: true,
      maxPayload: this.options.maxEnvelopeBytes,
    });
    this.httpServer.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://relay.local");
      if (url.pathname !== "/v1/relay") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }
      this.websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        this.websocketServer.emit("connection", websocket, request);
      });
    });
    this.websocketServer.on("connection", (socket) => {
      this.handleSocket(socket as AuthenticatedSocket);
    });
  }

  async listen(port: number, host = "0.0.0.0"): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(port, host, () => resolve());
    });
    const address = this.httpServer.address();
    if (!address || typeof address === "string") return port;
    return address.port;
  }

  async close(): Promise<void> {
    for (const socketSet of this.sockets.values()) {
      for (const socket of socketSet) socket.close(1001, "server shutdown");
    }
    await new Promise<void>((resolve) => {
      this.websocketServer.close(() => {
        this.httpServer.close(() => resolve());
      });
    });
  }

  private async handleHttp(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://relay.local");

    if (method === "GET" && url.pathname === "/healthz") {
      this.sendJson(response, 200, {
        status: "ok",
        protocolVersion: PROTOCOL_VERSION,
        connectedDevices: this.sockets.size,
      });
      return;
    }
    if (method === "GET" && url.pathname === "/v1/capabilities") {
      this.sendJson(response, 200, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: ["pairing.v1", "relay.v1", "revocation.v1"],
        limits: {
          maxEnvelopeBytes: this.options.maxEnvelopeBytes,
          maxAttachmentBytes: this.options.maxAttachmentBytes,
        },
      });
      return;
    }
    if (method === "POST" && url.pathname === "/v1/pairings") {
      const body = await readJson(request, 64 * 1024);
      const desktop = requireDevice(body.desktop);
      const lanEndpoints = requireStringArray(body.lanEndpoints ?? []);
      const pairing = this.store.createPairing(
        desktop,
        lanEndpoints,
        this.options.pairingTtlSeconds,
      );
      this.sendJson(response, 201, {
        protocolVersion: PROTOCOL_VERSION,
        relayUrl: this.options.publicRelayUrl,
        ...pairing,
        desktop,
        lanEndpoints,
      });
      return;
    }

    const pairingStatusMatch = url.pathname.match(/^\/v1\/pairings\/([^/]+)$/);
    if (method === "GET" && pairingStatusMatch) {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        throw new StoreError("PAIRING_TOKEN_REQUIRED", 401);
      }
      const status = this.store.pairingStatus(
        decodeURIComponent(pairingStatusMatch[1]),
        authorization.slice("Bearer ".length),
      );
      this.sendJson(response, 200, {
        protocolVersion: PROTOCOL_VERSION,
        ...status,
      });
      return;
    }

    const claimMatch = url.pathname.match(/^\/v1\/pairings\/([^/]+)\/claim$/);
    if (method === "POST" && claimMatch) {
      const body = await readJson(request, 64 * 1024);
      const mobile = requireDevice(body.mobile);
      const pairingToken = requireString(body.pairingToken, "pairingToken");
      const pairing = this.store.claimPairing(
        decodeURIComponent(claimMatch[1]),
        pairingToken,
        mobile,
      );
      this.sendJson(response, 200, {
        protocolVersion: PROTOCOL_VERSION,
        relayUrl: this.options.publicRelayUrl,
        mobile,
        ...pairing,
      });
      return;
    }

    const revokeMatch = url.pathname.match(
      /^\/v1\/devices\/([^/]+)\/peers\/([^/]+)$/,
    );
    if (method === "DELETE" && revokeMatch) {
      const deviceId = decodeURIComponent(revokeMatch[1]);
      const peerId = decodeURIComponent(revokeMatch[2]);
      this.verifyHttpSignature(request, deviceId, method, url.pathname);
      this.store.revokePeer(deviceId, peerId);
      this.disconnectPeer(deviceId, peerId);
      response.writeHead(204).end();
      return;
    }

    this.sendJson(response, 404, {
      error: { code: "NOT_FOUND", message: "Route not found", retryable: false },
    });
  }

  private handleSocket(socket: AuthenticatedSocket): void {
    socket.challenge = randomBytes(32).toString("base64url");
    socket.lastSequence = -1;
    socket.send(
      JSON.stringify({
        type: "challenge",
        protocolVersion: PROTOCOL_VERSION,
        nonce: socket.challenge,
      }),
    );
    const authenticationTimeout = setTimeout(() => {
      if (!socket.deviceId) socket.close(4401, "authentication timeout");
    }, 10_000);

    socket.on("message", (data, isBinary) => {
      try {
        if (isBinary) throw new ProtocolError("TEXT_FRAME_REQUIRED", 4400);
        if (!this.consumeRateBudget(socket)) {
          throw new ProtocolError("RATE_LIMITED", 4429);
        }
        const message = JSON.parse(data.toString()) as unknown;
        if (!socket.deviceId) {
          this.authenticateSocket(socket, message);
          clearTimeout(authenticationTimeout);
          return;
        }
        this.routeEnvelope(socket, message);
      } catch (error) {
        const protocolError =
          error instanceof ProtocolError
            ? error
            : new ProtocolError("INVALID_MESSAGE", 4400);
        socket.send(
          JSON.stringify({
            type: "relay_error",
            code: protocolError.code,
            retryable: protocolError.closeCode >= 4500,
          }),
        );
        if (protocolError.closeCode < 4500) {
          socket.close(protocolError.closeCode, protocolError.code);
        }
      }
    });
    socket.on("close", () => {
      clearTimeout(authenticationTimeout);
      if (!socket.deviceId) return;
      const set = this.sockets.get(socket.deviceId);
      set?.delete(socket);
      if (set?.size === 0) this.sockets.delete(socket.deviceId);
    });
  }

  private authenticateSocket(
    socket: AuthenticatedSocket,
    value: unknown,
  ): void {
    if (!value || typeof value !== "object") {
      throw new ProtocolError("AUTH_INVALID", 4401);
    }
    const message = value as Record<string, unknown>;
    if (
      message.type !== "authenticate" ||
      typeof message.deviceId !== "string" ||
      typeof message.signature !== "string" ||
      !socket.challenge
    ) {
      throw new ProtocolError("AUTH_INVALID", 4401);
    }
    const device = this.store.getDevice(message.deviceId);
    if (!device) throw new ProtocolError("DEVICE_UNKNOWN", 4401);
    if (
      !verifySignature(
        device.identityPublicKey,
        socket.challenge,
        message.signature,
      )
    ) {
      throw new ProtocolError("SIGNATURE_INVALID", 4401);
    }
    socket.deviceId = device.deviceId;
    let socketSet = this.sockets.get(device.deviceId);
    if (!socketSet) {
      socketSet = new Set();
      this.sockets.set(device.deviceId, socketSet);
    }
    socketSet.add(socket);
    socket.send(
      JSON.stringify({
        type: "authenticated",
        protocolVersion: PROTOCOL_VERSION,
      }),
    );
  }

  private routeEnvelope(socket: AuthenticatedSocket, value: unknown): void {
    if (!isRelayEnvelope(value)) {
      throw new ProtocolError("ENVELOPE_INVALID", 4400);
    }
    const envelope = value as RelayEnvelope;
    if (envelope.sourceDeviceId !== socket.deviceId) {
      throw new ProtocolError("SOURCE_MISMATCH", 4403);
    }
    if ((socket.lastSequence ?? -1) >= envelope.sequence) {
      throw new ProtocolError("SEQUENCE_REPLAYED", 4409);
    }
    if (!this.store.arePeers(envelope.sourceDeviceId, envelope.targetDeviceId)) {
      throw new ProtocolError("TARGET_NOT_PAIRED", 4403);
    }
    socket.lastSequence = envelope.sequence;
    const targetSockets = this.sockets.get(envelope.targetDeviceId);
    if (!targetSockets || targetSockets.size === 0) {
      socket.send(
        JSON.stringify({
          type: "relay_error",
          code: "TARGET_OFFLINE",
          retryable: true,
          messageId: envelope.messageId,
        }),
      );
      return;
    }
    const serialized = JSON.stringify(envelope);
    for (const target of targetSockets) {
      if (target.readyState === WebSocket.OPEN) target.send(serialized);
    }
    socket.send(
      JSON.stringify({
        type: "relay_ack",
        messageId: envelope.messageId,
        sequence: envelope.sequence,
      }),
    );
  }

  private verifyHttpSignature(
    request: IncomingMessage,
    deviceId: string,
    method: string,
    path: string,
  ): void {
    const timestamp = request.headers["x-chiral-timestamp"];
    const signature = request.headers["x-chiral-signature"];
    if (typeof timestamp !== "string" || typeof signature !== "string") {
      throw new StoreError("SIGNATURE_REQUIRED", 401);
    }
    const timestampMs = Date.parse(timestamp);
    if (
      Number.isNaN(timestampMs) ||
      Math.abs(Date.now() - timestampMs) > 5 * 60_000
    ) {
      throw new StoreError("SIGNATURE_EXPIRED", 401);
    }
    const device = this.store.getDevice(deviceId);
    const signedValue = `${method}\n${path}\n${timestamp}`;
    if (
      !device ||
      !verifySignature(device.identityPublicKey, signedValue, signature)
    ) {
      throw new StoreError("SIGNATURE_INVALID", 401);
    }
  }

  private disconnectPeer(deviceId: string, peerId: string): void {
    for (const id of [deviceId, peerId]) {
      for (const socket of this.sockets.get(id) ?? []) {
        socket.close(4403, "pairing revoked");
      }
    }
  }

  private consumeRateBudget(socket: AuthenticatedSocket): boolean {
    const second = Math.floor(Date.now() / 1000);
    if (!socket.rateWindow || socket.rateWindow.second !== second) {
      socket.rateWindow = { second, count: 1 };
      return true;
    }
    socket.rateWindow.count += 1;
    return socket.rateWindow.count <= this.options.messagesPerSecond;
  }

  private sendJson(
    response: ServerResponse,
    status: number,
    payload: unknown,
  ): void {
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(payload));
  }

  private sendError(response: ServerResponse, error: unknown): void {
    const status = error instanceof StoreError ? error.status : 400;
    const code =
      error instanceof StoreError ? error.code : "INVALID_REQUEST";
    this.sendJson(response, status, {
      error: { code, message: code, retryable: status >= 500 },
    });
  }
}

class ProtocolError extends Error {
  constructor(
    public readonly code: string,
    public readonly closeCode: number,
  ) {
    super(code);
  }
}

async function readJson(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new StoreError("BODY_TOO_LARGE", 413);
    chunks.push(buffer);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new StoreError("BODY_INVALID", 400);
  }
  return parsed as Record<string, unknown>;
}

function requireDevice(value: unknown): DeviceDescriptor {
  if (!value || typeof value !== "object") {
    throw new StoreError("DEVICE_INVALID", 400);
  }
  const device = value as Record<string, unknown>;
  return {
    deviceId: requireString(device.deviceId, "deviceId"),
    displayName: requireString(device.displayName, "displayName"),
    identityPublicKey: requireString(
      device.identityPublicKey,
      "identityPublicKey",
    ),
    agreementPublicKey: requireString(
      device.agreementPublicKey,
      "agreementPublicKey",
    ),
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 8192) {
    throw new StoreError(`${name.toUpperCase()}_INVALID`, 400);
  }
  return value;
}

function requireStringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 16 ||
    value.some((item) => typeof item !== "string" || item.length > 2048)
  ) {
    throw new StoreError("LAN_ENDPOINTS_INVALID", 400);
  }
  return value as string[];
}

function verifySignature(
  publicKeyBase64: string,
  value: string,
  signatureBase64: string,
): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(value, "utf8"),
      publicKey,
      Buffer.from(signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

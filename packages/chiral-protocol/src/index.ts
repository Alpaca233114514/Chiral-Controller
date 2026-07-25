export const PROTOCOL_VERSION = "1.0" as const;

export const RELAY_KINDS = [
  "request",
  "response",
  "event",
  "ack",
  "error",
] as const;

export type RelayKind = (typeof RELAY_KINDS)[number];

export type RelayEnvelope = {
  version: typeof PROTOCOL_VERSION;
  messageId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sequence: number;
  kind: RelayKind;
  nonce: string;
  ciphertext: string;
};

export type SecureMessage = {
  operation: string;
  requestId?: string | null;
  sessionId?: string | null;
  timestamp: string;
  payload: unknown;
};

export type HandshakePayload = {
  protocolVersion: typeof PROTOCOL_VERSION;
  capabilities: string[];
  limits: {
    maxEnvelopeBytes: number;
    maxAttachmentBytes: number;
  };
  resumeSequence: number;
};

export type DeviceDescriptor = {
  deviceId: string;
  displayName: string;
  identityPublicKey: string;
  agreementPublicKey: string;
};

export type PairingBundle = {
  protocolVersion: typeof PROTOCOL_VERSION;
  relayUrl: string;
  pairingId: string;
  pairingToken: string;
  desktop: DeviceDescriptor;
  lanEndpoints: string[];
};

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const OPERATION_PATTERN =
  /^(device|session|history|prompt|approval|question|file|workspace|task)\.[a-z][a-z0-9_.-]*$/;

export function isRelayEnvelope(value: unknown): value is RelayEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === PROTOCOL_VERSION &&
    typeof candidate.messageId === "string" &&
    candidate.messageId.length > 0 &&
    typeof candidate.sourceDeviceId === "string" &&
    DEVICE_ID_PATTERN.test(candidate.sourceDeviceId) &&
    typeof candidate.targetDeviceId === "string" &&
    DEVICE_ID_PATTERN.test(candidate.targetDeviceId) &&
    Number.isSafeInteger(candidate.sequence) &&
    Number(candidate.sequence) >= 0 &&
    RELAY_KINDS.includes(candidate.kind as RelayKind) &&
    isBase64(candidate.nonce, 12) &&
    isBase64(candidate.ciphertext)
  );
}

export function isSecureMessage(value: unknown): value is SecureMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.operation === "string" &&
    OPERATION_PATTERN.test(candidate.operation) &&
    typeof candidate.timestamp === "string" &&
    !Number.isNaN(Date.parse(candidate.timestamp)) &&
    Object.hasOwn(candidate, "payload")
  );
}

export function assertCompatibleVersion(version: string): void {
  const expectedMajor = PROTOCOL_VERSION.split(".")[0];
  const actualMajor = version.split(".")[0];
  if (actualMajor !== expectedMajor) {
    throw new Error(
      `Unsupported Chiral protocol version ${version}; expected ${expectedMajor}.x`,
    );
  }
}

function isBase64(value: unknown, byteLength?: number): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const buffer = Buffer.from(value, "base64");
    if (buffer.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) {
      return false;
    }
    return byteLength === undefined || buffer.length === byteLength;
  } catch {
    return false;
  }
}

import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { DeviceDescriptor } from "@chiral/protocol";

type StoredDevice = DeviceDescriptor & {
  createdAt: string;
  peers: string[];
  revokedAt?: string;
};

type StoredPairing = {
  pairingId: string;
  desktopDeviceId: string;
  tokenHash: string;
  expiresAt: string;
  claimedAt?: string;
  mobileDeviceId?: string;
  lanEndpoints: string[];
};

type StateData = {
  devices: Record<string, StoredDevice>;
  pairings: Record<string, StoredPairing>;
};

const EMPTY_STATE: StateData = { devices: {}, pairings: {} };

export class RelayStateStore {
  private state: StateData;

  constructor(private readonly filePath: string) {
    this.state = this.load();
  }

  createPairing(
    desktop: DeviceDescriptor,
    lanEndpoints: string[],
    ttlSeconds = 300,
  ): {
    pairingId: string;
    pairingToken: string;
    expiresAt: string;
  } {
    this.upsertDevice(desktop);
    const pairingId = randomUUID();
    const pairingToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    this.state.pairings[pairingId] = {
      pairingId,
      desktopDeviceId: desktop.deviceId,
      tokenHash: hashToken(pairingToken),
      expiresAt,
      lanEndpoints,
    };
    this.persist();
    return { pairingId, pairingToken, expiresAt };
  }

  claimPairing(
    pairingId: string,
    pairingToken: string,
    mobile: DeviceDescriptor,
  ): {
    desktop: DeviceDescriptor;
    lanEndpoints: string[];
  } {
    const pairing = this.state.pairings[pairingId];
    if (!pairing) throw new StoreError("PAIRING_NOT_FOUND", 404);
    if (pairing.claimedAt) throw new StoreError("PAIRING_ALREADY_CLAIMED", 409);
    if (Date.parse(pairing.expiresAt) <= Date.now()) {
      throw new StoreError("PAIRING_EXPIRED", 410);
    }
    if (hashToken(pairingToken) !== pairing.tokenHash) {
      throw new StoreError("PAIRING_TOKEN_INVALID", 401);
    }

    const desktop = this.state.devices[pairing.desktopDeviceId];
    if (!desktop || desktop.revokedAt) {
      throw new StoreError("DESKTOP_UNAVAILABLE", 410);
    }
    this.upsertDevice(mobile);
    linkPeers(desktop, this.state.devices[mobile.deviceId]);
    pairing.claimedAt = new Date().toISOString();
    pairing.mobileDeviceId = mobile.deviceId;
    this.persist();
    return {
      desktop: publicDevice(desktop),
      lanEndpoints: pairing.lanEndpoints,
    };
  }

  pairingStatus(
    pairingId: string,
    pairingToken: string,
  ): {
    claimed: boolean;
    expiresAt: string;
    mobile?: DeviceDescriptor;
  } {
    const pairing = this.state.pairings[pairingId];
    if (!pairing) throw new StoreError("PAIRING_NOT_FOUND", 404);
    if (hashToken(pairingToken) !== pairing.tokenHash) {
      throw new StoreError("PAIRING_TOKEN_INVALID", 401);
    }
    const mobile = pairing.mobileDeviceId
      ? this.getDevice(pairing.mobileDeviceId)
      : undefined;
    return {
      claimed: Boolean(pairing.claimedAt && mobile),
      expiresAt: pairing.expiresAt,
      mobile: mobile ? publicDevice(mobile) : undefined,
    };
  }

  getDevice(deviceId: string): StoredDevice | undefined {
    const device = this.state.devices[deviceId];
    return device && !device.revokedAt ? device : undefined;
  }

  arePeers(sourceDeviceId: string, targetDeviceId: string): boolean {
    const source = this.getDevice(sourceDeviceId);
    const target = this.getDevice(targetDeviceId);
    return Boolean(
      source &&
        target &&
        source.peers.includes(targetDeviceId) &&
        target.peers.includes(sourceDeviceId),
    );
  }

  revokePeer(deviceId: string, peerId: string): void {
    const device = this.getDevice(deviceId);
    const peer = this.getDevice(peerId);
    if (!device || !peer || !this.arePeers(deviceId, peerId)) {
      throw new StoreError("PEER_NOT_FOUND", 404);
    }
    device.peers = device.peers.filter((candidate) => candidate !== peerId);
    peer.peers = peer.peers.filter((candidate) => candidate !== deviceId);
    this.persist();
  }

  private upsertDevice(input: DeviceDescriptor): void {
    const existing = this.state.devices[input.deviceId];
    if (existing) {
      if (
        existing.identityPublicKey !== input.identityPublicKey ||
        existing.agreementPublicKey !== input.agreementPublicKey
      ) {
        throw new StoreError("DEVICE_IDENTITY_CONFLICT", 409);
      }
      existing.displayName = input.displayName;
      delete existing.revokedAt;
      return;
    }
    this.state.devices[input.deviceId] = {
      ...input,
      createdAt: new Date().toISOString(),
      peers: [],
    };
  }

  private load(): StateData {
    if (!existsSync(this.filePath)) return structuredClone(EMPTY_STATE);
    const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as StateData;
    return {
      devices: parsed.devices ?? {},
      pairings: parsed.pairings ?? {},
    };
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, this.filePath);
  }
}

export class StoreError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function publicDevice(device: StoredDevice): DeviceDescriptor {
  return {
    deviceId: device.deviceId,
    displayName: device.displayName,
    identityPublicKey: device.identityPublicKey,
    agreementPublicKey: device.agreementPublicKey,
  };
}

function linkPeers(left: StoredDevice, right: StoredDevice): void {
  if (!left.peers.includes(right.deviceId)) left.peers.push(right.deviceId);
  if (!right.peers.includes(left.deviceId)) right.peers.push(left.deviceId);
}

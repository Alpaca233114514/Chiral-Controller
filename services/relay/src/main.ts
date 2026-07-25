import { resolve } from "node:path";
import { ChiralRelayServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const host = process.env.HOST ?? "0.0.0.0";
const statePath = resolve(process.env.STATE_PATH ?? "./data/state.json");

const relay = new ChiralRelayServer({
  statePath,
  publicRelayUrl:
    process.env.PUBLIC_RELAY_URL ??
    "wss://chiral.liyuanstudio.com/v1/relay",
  maxEnvelopeBytes: Number.parseInt(
    process.env.MAX_ENVELOPE_BYTES ?? "1048576",
    10,
  ),
  maxAttachmentBytes: Number.parseInt(
    process.env.MAX_ATTACHMENT_BYTES ?? "20971520",
    10,
  ),
});

const actualPort = await relay.listen(port, host);
console.log(`[chiral-relay] listening on ${host}:${actualPort}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    relay.close().finally(() => process.exit(0));
  });
}

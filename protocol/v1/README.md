# Chiral Remote Protocol v1

Chiral Remote Protocol connects a Flutter controller to the Remote Bridge
embedded in Kimi Code Desktop. The relay routes opaque encrypted envelopes and
never receives a content-encryption key.

## Layers

1. `PairingBundle` is the relay-issued, time-limited QR payload. It contains
   the Desktop descriptor, Cloud relay URL, expiry, and optional LAN endpoints.
2. `RelayEnvelope` is visible to the relay and contains routing, ordering, and
   encrypted bytes only.
3. `SecureMessage` is JSON encoded, encrypted with ChaCha20-Poly1305, and stored
   in `RelayEnvelope.ciphertext`.
4. Device identity uses Ed25519. A paired connection derives its content key
   from X25519 plus HKDF-SHA256.

The 96-bit AEAD nonce is formed from a 32-bit connection epoch followed by a
64-bit monotonically increasing sequence number. A receiver must reject an
epoch/sequence pair it has already accepted.

## Compatibility

Peers exchange `HandshakePayload` before exposing features. Major versions must
match. New operation names and payload fields are additive and gated by the
advertised capability list. Unknown events must be retained as generic events.

## Transport

- Cloud: `wss://chiral.liyuanstudio.com/v1/relay`
- LAN: `ws://<desktop-ip>:3778/v1/local`
- Discovery: `_chiral._tcp.local`

Both transports carry exactly the same encrypted `RelayEnvelope`.

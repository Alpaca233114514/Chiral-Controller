# Chiral Mobile

Flutter remote controller for Kimi Code Desktop. Pair by scanning the QR code
shown in Desktop under **Settings → Remote Control**.

## Connection modes

- **LAN**: the app discovers `_chiral._tcp.local` and connects directly to
  `ws://<desktop-ip>:3778/v1/local` with end-to-end encryption.
- **Cloud**: when the LAN bridge is unavailable, pending requests are retried
  through the encrypted relay with the same request ID.

The phone and desktop should be on the same Wi-Fi for LAN mode. Android builds
need local-network multicast access; iOS prompts for local-network permission.

## Development

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

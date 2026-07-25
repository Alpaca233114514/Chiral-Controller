import 'dart:convert';
import 'dart:io';

import 'package:chiral_mobile/src/models/protocol.dart';
import 'package:chiral_mobile/src/services/identity_store.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'claimPairing sends public identity and derives the desktop-compatible key',
    () async {
      final IdentityMaterial mobileIdentity = await _identity('mobile-test');
      final SimpleKeyPairData desktopAgreement =
          await (await X25519().newKeyPair()).extract();
      final HttpServer server = await HttpServer.bind(
        InternetAddress.loopbackIPv4,
        0,
      );
      final Map<String, dynamic> received = <String, dynamic>{};
      server.listen((HttpRequest request) async {
        received.addAll(
          Map<String, dynamic>.from(
            jsonDecode(await utf8.decodeStream(request)) as Map,
          ),
        );
        request.response
          ..statusCode = HttpStatus.ok
          ..headers.contentType = ContentType.json
          ..write('{}');
        await request.response.close();
      });
      final _MemoryIdentityStore store = _MemoryIdentityStore(mobileIdentity);
      final PairingBundle bundle = PairingBundle(
        pairingId: 'pairing-1',
        pairingToken: 'one-time-token',
        expiresAt: DateTime.now()
            .add(const Duration(minutes: 5))
            .toUtc()
            .toIso8601String(),
        relayUrl: 'ws://127.0.0.1:${server.port}/v1/relay',
        desktop: DeviceDescriptor(
          deviceId: 'desktop-test',
          displayName: 'Desktop',
          identityPublicKey: 'unused',
          agreementPublicKey: base64Encode(<int>[
            ..._hex('302a300506032b656e032100'),
            ...desktopAgreement.publicKey.bytes,
          ]),
        ),
        lanEndpoints: const <String>[],
      );

      try {
        final PairedDesktop paired = await store.claimPairing(bundle);
        expect(received['pairingToken'], 'one-time-token');
        final Map<String, dynamic> mobile = Map<String, dynamic>.from(
          received['mobile'] as Map,
        );
        expect(mobile['deviceId'], 'mobile-test');
        expect(
          base64Decode(mobile['identityPublicKey'] as String),
          hasLength(44),
        );
        expect(store.saved, same(paired));

        final SecretKey shared = await X25519().sharedSecretKey(
          keyPair: desktopAgreement,
          remotePublicKey: mobileIdentity.agreementKeyPair.publicKey,
        );
        final SecretKey expected =
            await Hkdf(hmac: Hmac.sha256(), outputLength: 32).deriveKey(
              secretKey: shared,
              nonce: utf8.encode('chiral-remote-v1'),
              info: utf8.encode('desktop-test:mobile-test'),
            );
        expect(paired.sharedKey, await expected.extractBytes());
      } finally {
        await server.close(force: true);
      }
    },
  );

  test('rejects an expired pairing QR before contacting the relay', () async {
    final _MemoryIdentityStore store = _MemoryIdentityStore(
      await _identity('mobile-test'),
    );
    final PairingBundle expired = PairingBundle(
      pairingId: 'expired',
      pairingToken: 'unused',
      expiresAt: DateTime.now()
          .subtract(const Duration(minutes: 1))
          .toUtc()
          .toIso8601String(),
      relayUrl: 'ws://127.0.0.1:1/v1/relay',
      desktop: const DeviceDescriptor(
        deviceId: 'desktop-test',
        displayName: 'Desktop',
        identityPublicKey: 'unused',
        agreementPublicKey: 'unused',
      ),
      lanEndpoints: const <String>[],
    );
    await expectLater(store.claimPairing(expired), throwsStateError);
    expect(store.saved, isNull);
  });
}

Future<IdentityMaterial> _identity(String deviceId) async {
  return IdentityMaterial(
    deviceId: deviceId,
    signingKeyPair: await (await Ed25519().newKeyPair()).extract(),
    agreementKeyPair: await (await X25519().newKeyPair()).extract(),
  );
}

List<int> _hex(String value) => List<int>.generate(
  value.length ~/ 2,
  (int index) =>
      int.parse(value.substring(index * 2, index * 2 + 2), radix: 16),
);

class _MemoryIdentityStore extends IdentityStore {
  _MemoryIdentityStore(this.identity);

  final IdentityMaterial identity;
  PairedDesktop? saved;

  @override
  Future<IdentityMaterial> loadOrCreateIdentity() async => identity;

  @override
  Future<void> savePairedDesktop(PairedDesktop desktop) async {
    saved = desktop;
  }
}

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:chiral_mobile/src/models/protocol.dart';
import 'package:chiral_mobile/src/services/identity_store.dart';
import 'package:chiral_mobile/src/services/lan_discovery.dart';
import 'package:chiral_mobile/src/services/remote_transport.dart';
import 'package:chiral_mobile/src/services/secure_envelope_codec.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';

const List<int> _sharedKey = <int>[
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
];

List<int> _nonce(int epochByte, int sequence) {
  final ByteData data = ByteData(12);
  data.setUint32(0, epochByte * 0x01010101);
  data.setUint64(4, sequence);
  return data.buffer.asUint8List();
}

void main() {
  test('keeps a successful request on LAN without contacting Cloud', () async {
    final HttpServer lanServer = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      0,
    );
    final HttpServer cloudServer = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      0,
    );
    final SecureEnvelopeCodec desktopCodec = SecureEnvelopeCodec(
      localDeviceId: 'desktop-test',
      remoteDeviceId: 'mobile-test',
      sharedKey: _sharedKey,
    );
    bool cloudContacted = false;

    lanServer.listen((HttpRequest request) async {
      expect(request.uri.path, '/v1/local');
      final WebSocket socket = await WebSocketTransformer.upgrade(request);
      final RelayEnvelope envelope = RelayEnvelope.fromJson(
        Map<String, dynamic>.from(
          jsonDecode(await socket.first as String) as Map,
        ),
      );
      final SecureMessage requestMessage = await desktopCodec.decrypt(envelope);
      final SecureMessage response = SecureMessage(
        operation: requestMessage.operation,
        requestId: requestMessage.requestId,
        sessionId: requestMessage.sessionId,
        timestamp: DateTime.now().toUtc().toIso8601String(),
        payload: const <String, dynamic>{'accepted': true},
      );
      final RelayEnvelope responseEnvelope = await desktopCodec.encrypt(
        message: response,
        kind: RelayKind.response,
        sequence: 1,
        nonce: _nonce(24, 1),
      );
      socket.add(jsonEncode(responseEnvelope.toJson()));
    });
    cloudServer.listen((HttpRequest request) async {
      cloudContacted = true;
      request.response.statusCode = HttpStatus.serviceUnavailable;
      await request.response.close();
    });

    final IdentityMaterial identity = await _identity();
    final PairedDesktop paired = PairedDesktop(
      bundle: PairingBundle(
        pairingId: 'pairing-test',
        pairingToken: 'already-consumed',
        expiresAt: DateTime.now()
            .add(const Duration(minutes: 5))
            .toUtc()
            .toIso8601String(),
        relayUrl: 'ws://127.0.0.1:${cloudServer.port}/v1/relay',
        desktop: const DeviceDescriptor(
          deviceId: 'desktop-test',
          displayName: 'Test Desktop',
          identityPublicKey: 'unused',
          agreementPublicKey: 'unused',
        ),
        lanEndpoints: <String>['ws://127.0.0.1:${lanServer.port}'],
      ),
      mobile: const DeviceDescriptor(
        deviceId: 'mobile-test',
        displayName: 'Test Mobile',
        identityPublicKey: 'unused',
        agreementPublicKey: 'unused',
      ),
      sharedKey: _sharedKey,
    );
    final List<ConnectionMode> modes = <ConnectionMode>[];
    final RemoteTransport transport = RemoteTransport(
      identityStore: _FakeIdentityStore(identity),
      lanDiscovery: const _NoLanDiscovery(),
      onMessage: (_, _) {},
      onConnection: (ConnectionMode mode, _) => modes.add(mode),
    );

    try {
      await transport.connect(paired);
      final dynamic result = await transport.request(
        'prompt.send',
        sessionId: 'session-test',
        payload: const <String, dynamic>{'text': 'stay local'},
        timeout: const Duration(seconds: 5),
      );
      expect(result, <String, dynamic>{'accepted': true});
      expect(transport.mode, ConnectionMode.lan);
      expect(modes, contains(ConnectionMode.lan));
      expect(modes, isNot(contains(ConnectionMode.cloud)));
      expect(cloudContacted, isFalse);
    } finally {
      await transport.close();
      await lanServer.close(force: true);
      await cloudServer.close(force: true);
    }
  });

  test(
    'retries a pending LAN request through Cloud with the same request ID',
    () async {
      final HttpServer lanServer = await HttpServer.bind(
        InternetAddress.loopbackIPv4,
        0,
      );
      final HttpServer cloudServer = await HttpServer.bind(
        InternetAddress.loopbackIPv4,
        0,
      );
      final SecureEnvelopeCodec desktopCodec = SecureEnvelopeCodec(
        localDeviceId: 'desktop-test',
        remoteDeviceId: 'mobile-test',
        sharedKey: _sharedKey,
      );
      final Completer<SecureMessage> lanMessage = Completer<SecureMessage>();
      final Completer<SecureMessage> cloudMessage = Completer<SecureMessage>();

      lanServer.listen((HttpRequest request) async {
        final WebSocket socket = await WebSocketTransformer.upgrade(request);
        final RelayEnvelope envelope = RelayEnvelope.fromJson(
          Map<String, dynamic>.from(
            jsonDecode(await socket.first as String) as Map,
          ),
        );
        lanMessage.complete(await desktopCodec.decrypt(envelope));
        await socket.close();
      });
      cloudServer.listen((HttpRequest request) async {
        final WebSocket socket = await WebSocketTransformer.upgrade(request);
        final StreamIterator<dynamic> messages = StreamIterator<dynamic>(
          socket,
        );
        socket.add(
          jsonEncode(<String, dynamic>{
            'type': 'challenge',
            'protocolVersion': protocolVersion,
            'nonce': 'test-challenge',
          }),
        );
        expect(await messages.moveNext(), isTrue);
        final Map<String, dynamic> authentication = Map<String, dynamic>.from(
          jsonDecode(messages.current as String) as Map,
        );
        expect(authentication['deviceId'], 'mobile-test');
        socket.add(
          jsonEncode(<String, dynamic>{
            'type': 'authenticated',
            'protocolVersion': protocolVersion,
          }),
        );
        expect(await messages.moveNext(), isTrue);
        final RelayEnvelope retried = RelayEnvelope.fromJson(
          Map<String, dynamic>.from(
            jsonDecode(messages.current as String) as Map,
          ),
        );
        final SecureMessage requestMessage = await desktopCodec.decrypt(
          retried,
        );
        cloudMessage.complete(requestMessage);
        final SecureMessage response = SecureMessage(
          operation: requestMessage.operation,
          requestId: requestMessage.requestId,
          sessionId: requestMessage.sessionId,
          timestamp: DateTime.now().toUtc().toIso8601String(),
          payload: const <String, dynamic>{'accepted': true},
        );
        final RelayEnvelope responseEnvelope = await desktopCodec.encrypt(
          message: response,
          kind: RelayKind.response,
          sequence: 1,
          nonce: _nonce(42, 1),
        );
        socket.add(jsonEncode(responseEnvelope.toJson()));
      });

      final IdentityMaterial identity = await _identity();
      final PairedDesktop paired = PairedDesktop(
        bundle: PairingBundle(
          pairingId: 'pairing-test',
          pairingToken: 'already-consumed',
          expiresAt: DateTime.now()
              .add(const Duration(minutes: 5))
              .toUtc()
              .toIso8601String(),
          relayUrl: 'ws://127.0.0.1:${cloudServer.port}/v1/relay',
          desktop: const DeviceDescriptor(
            deviceId: 'desktop-test',
            displayName: 'Test Desktop',
            identityPublicKey: 'unused',
            agreementPublicKey: 'unused',
          ),
          lanEndpoints: <String>['ws://127.0.0.1:${lanServer.port}/v1/local'],
        ),
        mobile: const DeviceDescriptor(
          deviceId: 'mobile-test',
          displayName: 'Test Mobile',
          identityPublicKey: 'unused',
          agreementPublicKey: 'unused',
        ),
        sharedKey: _sharedKey,
      );
      final List<ConnectionMode> modes = <ConnectionMode>[];
      final RemoteTransport transport = RemoteTransport(
        identityStore: _FakeIdentityStore(identity),
        lanDiscovery: const _NoLanDiscovery(),
        onMessage: (_, _) {},
        onConnection: (ConnectionMode mode, _) => modes.add(mode),
      );

      try {
        await transport.connect(paired);
        final dynamic result = await transport.request(
          'prompt.send',
          sessionId: 'session-test',
          payload: const <String, dynamic>{'text': 'run once'},
          timeout: const Duration(seconds: 5),
        );
        final SecureMessage first = await lanMessage.future;
        final SecureMessage retried = await cloudMessage.future;
        expect(first.requestId, isNotNull);
        expect(retried.requestId, first.requestId);
        expect(retried.payload, first.payload);
        expect(result, <String, dynamic>{'accepted': true});
        expect(
          modes,
          containsAllInOrder(<ConnectionMode>[
            ConnectionMode.lan,
            ConnectionMode.connecting,
            ConnectionMode.cloud,
          ]),
        );
      } finally {
        await transport.close();
        await lanServer.close(force: true);
        await cloudServer.close(force: true);
      }
    },
  );

  test('does not accept requests while the Desktop is offline', () async {
    final IdentityMaterial identity = await _identity();
    final RemoteTransport transport = RemoteTransport(
      identityStore: _FakeIdentityStore(identity),
      lanDiscovery: const _NoLanDiscovery(),
      onMessage: (_, _) {},
      onConnection: (_, _) {},
    );
    await expectLater(
      transport.request('session.list'),
      throwsA(isA<StateError>()),
    );
  });
}

Future<IdentityMaterial> _identity() async {
  final SimpleKeyPairData signing = await (await Ed25519().newKeyPair())
      .extract();
  final SimpleKeyPairData agreement = await (await X25519().newKeyPair())
      .extract();
  return IdentityMaterial(
    deviceId: 'mobile-test',
    signingKeyPair: signing,
    agreementKeyPair: agreement,
  );
}

class _FakeIdentityStore extends IdentityStore {
  _FakeIdentityStore(this.identity);

  final IdentityMaterial identity;

  @override
  Future<IdentityMaterial> loadOrCreateIdentity() async => identity;
}

class _NoLanDiscovery extends LanDiscovery {
  const _NoLanDiscovery();

  @override
  Future<String?> findDesktop(
    String deviceId, {
    Duration timeout = const Duration(seconds: 2),
  }) async => null;
}

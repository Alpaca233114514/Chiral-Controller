import 'dart:convert';
import 'dart:io';

import 'package:chiral_mobile/src/models/protocol.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Dart decodes the shared TypeScript/Rust relay fixture', () async {
    final Map<String, dynamic> json = await _fixture('relay-envelope.json');
    final RelayEnvelope envelope = RelayEnvelope.fromJson(json);
    expect(envelope.sequence, 42);
    expect(envelope.kind, RelayKind.event);
    expect(base64Decode(envelope.nonce), hasLength(12));
    expect(envelope.toJson(), json);
  });

  test('Dart decodes the shared secure message fixture', () async {
    final Map<String, dynamic> json = await _fixture('secure-message.json');
    final SecureMessage message = SecureMessage.fromJson(json);
    expect(message.operation, 'session.status');
    expect(message.sessionId, 'session_fixture');
    expect(message.toJson(), json);
  });

  test('Dart decodes the shared PairingBundle fixture', () async {
    final Map<String, dynamic> json = await _fixture('pairing-bundle.json');
    final PairingBundle bundle = PairingBundle.fromJson(json);
    expect(bundle.pairingId, 'pairing_fixture');
    expect(bundle.expiresAt, '2030-01-02T03:04:05.000Z');
    expect(bundle.lanEndpoints, <String>['ws://192.0.2.10:3778/v1/local']);
    expect(bundle.toJson(), json);
  });

  test('rejects an unsupported relay envelope version', () {
    expect(
      () => RelayEnvelope.fromJson(<String, dynamic>{'version': '2.0'}),
      throwsFormatException,
    );
  });
}

Future<Map<String, dynamic>> _fixture(String name) async {
  final File file = File('../../protocol/v1/fixtures/$name');
  return Map<String, dynamic>.from(
    jsonDecode(await file.readAsString()) as Map,
  );
}

import 'dart:convert';
import 'dart:io';

import 'package:chiral_mobile/src/models/protocol.dart';
import 'package:chiral_mobile/src/services/secure_envelope_codec.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const List<int> sharedKey = <int>[
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
  final SecureEnvelopeCodec mobile = SecureEnvelopeCodec(
    localDeviceId: 'mobile-test',
    remoteDeviceId: 'desktop-test',
    sharedKey: sharedKey,
  );
  final SecureEnvelopeCodec desktop = SecureEnvelopeCodec(
    localDeviceId: 'desktop-test',
    remoteDeviceId: 'mobile-test',
    sharedKey: sharedKey,
  );
  const SecureMessage request = SecureMessage(
    operation: 'prompt.send',
    requestId: 'request-1',
    sessionId: 'session-1',
    timestamp: '2026-07-26T00:00:00.000Z',
    payload: <String, dynamic>{'text': 'hello'},
  );

  test('round-trips an authenticated encrypted request', () async {
    final RelayEnvelope envelope = await mobile.encrypt(
      message: request,
      kind: RelayKind.request,
      sequence: 7,
      nonce: _nonceFor(1, 7),
    );

    expect(envelope.ciphertext, isNot(contains('hello')));
    final SecureMessage decoded = await desktop.decrypt(envelope);
    expect(decoded.operation, request.operation);
    expect(decoded.requestId, request.requestId);
    expect(decoded.payload, <String, dynamic>{'text': 'hello'});
  });

  test('matches the deterministic Node/Rust crypto fixture', () async {
    final Map<String, dynamic> fixture = Map<String, dynamic>.from(
      jsonDecode(
            await File(
              '../../protocol/v1/fixtures/encrypted-message.json',
            ).readAsString(),
          )
          as Map,
    );
    final RelayEnvelope expected = RelayEnvelope.fromJson(
      Map<String, dynamic>.from(fixture['envelope'] as Map),
    );
    final SecureMessage plaintext = SecureMessage.fromJson(
      Map<String, dynamic>.from(fixture['plaintext'] as Map),
    );
    final SecureEnvelopeCodec encoder = SecureEnvelopeCodec(
      localDeviceId: 'mobile_fixture',
      remoteDeviceId: 'desktop_fixture',
      sharedKey: base64Decode(fixture['key'] as String),
    );
    final RelayEnvelope encoded = await encoder.encrypt(
      message: plaintext,
      kind: RelayKind.request,
      sequence: 7,
      nonce: base64Decode(expected.nonce),
    );
    expect(encoded.toJson(), expected.toJson());

    final SecureEnvelopeCodec decoder = SecureEnvelopeCodec(
      localDeviceId: 'desktop_fixture',
      remoteDeviceId: 'mobile_fixture',
      sharedKey: base64Decode(fixture['key'] as String),
    );
    expect((await decoder.decrypt(expected)).toJson(), plaintext.toJson());
  });

  test('rejects ciphertext and AAD tampering', () async {
    final RelayEnvelope envelope = await mobile.encrypt(
      message: request,
      kind: RelayKind.request,
      sequence: 8,
      nonce: _nonceFor(2, 8),
    );
    final List<int> ciphertext = base64Decode(envelope.ciphertext);
    ciphertext[0] ^= 0xff;
    final RelayEnvelope tamperedCiphertext = _copyEnvelope(
      envelope,
      ciphertext: base64Encode(ciphertext),
    );
    await expectLater(
      desktop.decrypt(tamperedCiphertext),
      throwsA(isA<SecretBoxAuthenticationError>()),
    );

    final RelayEnvelope tamperedMetadata = _copyEnvelope(
      envelope,
      messageId: 'changed-message-id',
    );
    await expectLater(
      desktop.decrypt(tamperedMetadata),
      throwsA(isA<SecretBoxAuthenticationError>()),
    );
  });

  test('rejects the wrong key and wrong device identity', () async {
    final RelayEnvelope envelope = await mobile.encrypt(
      message: request,
      kind: RelayKind.request,
      sequence: 9,
      nonce: _nonceFor(3, 9),
    );
    final SecureEnvelopeCodec wrongKey = SecureEnvelopeCodec(
      localDeviceId: 'desktop-test',
      remoteDeviceId: 'mobile-test',
      sharedKey: List<int>.filled(32, 99),
    );
    await expectLater(
      wrongKey.decrypt(envelope),
      throwsA(isA<SecretBoxAuthenticationError>()),
    );
    await expectLater(
      mobile.decrypt(envelope),
      throwsA(isA<FormatException>()),
    );
  });

  test(
    'rejects replayed sequences independently per peer and connection epoch',
    () {
      final InboundSequenceGuard guard = InboundSequenceGuard();
      final RelayEnvelope sequenceTwo = _fixtureEnvelope(
        source: 'desktop-a',
        sequence: 2,
        epoch: 1,
      );
      guard.accept(sequenceTwo);
      expect(() => guard.accept(sequenceTwo), throwsStateError);
      expect(
        () => guard.accept(
          _fixtureEnvelope(source: 'desktop-a', sequence: 1, epoch: 1),
        ),
        throwsStateError,
      );
      expect(
        () => guard.accept(
          _fixtureEnvelope(source: 'desktop-a', sequence: 1, epoch: 2),
        ),
        returnsNormally,
      );
      expect(
        () => guard.accept(
          _fixtureEnvelope(source: 'desktop-b', sequence: 1, epoch: 1),
        ),
        returnsNormally,
      );
    },
  );

  test('rejects nonce and sequence mismatches', () async {
    await expectLater(
      mobile.encrypt(
        message: request,
        kind: RelayKind.request,
        sequence: 10,
        nonce: _nonceFor(4, 9),
      ),
      throwsFormatException,
    );

    final RelayEnvelope valid = await mobile.encrypt(
      message: request,
      kind: RelayKind.request,
      sequence: 10,
      nonce: _nonceFor(4, 10),
    );
    await expectLater(
      desktop.decrypt(_copyEnvelope(valid, sequence: 11)),
      throwsFormatException,
    );
  });
}

RelayEnvelope _fixtureEnvelope({
  required String source,
  required int sequence,
  required int epoch,
}) {
  return RelayEnvelope(
    messageId: '$source-$sequence',
    sourceDeviceId: source,
    targetDeviceId: 'mobile-test',
    sequence: sequence,
    kind: RelayKind.event,
    nonce: base64Encode(_nonceFor(epoch, sequence)),
    ciphertext: base64Encode(utf8.encode('opaque-encrypted-content')),
  );
}

List<int> _nonceFor(int epoch, int sequence) => <int>[
  0,
  0,
  0,
  epoch,
  ...List<int>.generate(
    8,
    (int index) => (sequence >> ((7 - index) * 8)) & 0xff,
  ),
];

RelayEnvelope _copyEnvelope(
  RelayEnvelope source, {
  String? messageId,
  String? ciphertext,
  int? sequence,
}) {
  return RelayEnvelope(
    messageId: messageId ?? source.messageId,
    sourceDeviceId: source.sourceDeviceId,
    targetDeviceId: source.targetDeviceId,
    sequence: sequence ?? source.sequence,
    kind: source.kind,
    nonce: source.nonce,
    ciphertext: ciphertext ?? source.ciphertext,
  );
}

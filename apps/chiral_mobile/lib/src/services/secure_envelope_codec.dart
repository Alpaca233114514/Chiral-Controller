import 'dart:convert';

import 'package:cryptography/cryptography.dart';

import '../models/protocol.dart';

class SecureEnvelopeCodec {
  SecureEnvelopeCodec({
    required this.localDeviceId,
    required this.remoteDeviceId,
    required List<int> sharedKey,
  }) : _sharedKey = List<int>.unmodifiable(sharedKey);

  final String localDeviceId;
  final String remoteDeviceId;
  final List<int> _sharedKey;
  final Chacha20 _cipher = Chacha20.poly1305Aead();

  Future<RelayEnvelope> encrypt({
    required SecureMessage message,
    required RelayKind kind,
    required int sequence,
    required List<int> nonce,
  }) async {
    if (nonce.length != 12) {
      throw const FormatException('Chiral nonce must contain 12 bytes');
    }
    RelayEnvelope envelope = RelayEnvelope(
      messageId: '$localDeviceId-$sequence',
      sourceDeviceId: localDeviceId,
      targetDeviceId: remoteDeviceId,
      sequence: sequence,
      kind: kind,
      nonce: base64Encode(nonce),
      ciphertext: '',
    );
    final SecretBox secretBox = await _cipher.encrypt(
      utf8.encode(jsonEncode(message.toJson())),
      secretKey: SecretKey(_sharedKey),
      nonce: nonce,
      aad: utf8.encode(envelope.aad()),
    );
    envelope = RelayEnvelope(
      messageId: envelope.messageId,
      sourceDeviceId: envelope.sourceDeviceId,
      targetDeviceId: envelope.targetDeviceId,
      sequence: envelope.sequence,
      kind: envelope.kind,
      nonce: envelope.nonce,
      ciphertext: base64Encode(<int>[
        ...secretBox.cipherText,
        ...secretBox.mac.bytes,
      ]),
    );
    return envelope;
  }

  Future<SecureMessage> decrypt(RelayEnvelope envelope) async {
    if (envelope.targetDeviceId != localDeviceId ||
        envelope.sourceDeviceId != remoteDeviceId) {
      throw const FormatException('Envelope device identity mismatch');
    }
    final List<int> combined = base64Decode(envelope.ciphertext);
    if (combined.length < 16) {
      throw const FormatException('Encrypted payload is too short');
    }
    final List<int> nonce = base64Decode(envelope.nonce);
    if (nonce.length != 12) {
      throw const FormatException('Chiral nonce must contain 12 bytes');
    }
    final List<int> plaintext = await _cipher.decrypt(
      SecretBox(
        combined.sublist(0, combined.length - 16),
        nonce: nonce,
        mac: Mac(combined.sublist(combined.length - 16)),
      ),
      secretKey: SecretKey(_sharedKey),
      aad: utf8.encode(envelope.aad()),
    );
    return SecureMessage.fromJson(
      Map<String, dynamic>.from(jsonDecode(utf8.decode(plaintext)) as Map),
    );
  }
}

class InboundSequenceGuard {
  final Map<String, int> _lastSequence = <String, int>{};

  void accept(RelayEnvelope envelope) {
    final int previous = _lastSequence[envelope.sourceDeviceId] ?? -1;
    if (envelope.sequence <= previous) {
      throw StateError('Replayed or out-of-order remote envelope rejected');
    }
    _lastSequence[envelope.sourceDeviceId] = envelope.sequence;
  }
}

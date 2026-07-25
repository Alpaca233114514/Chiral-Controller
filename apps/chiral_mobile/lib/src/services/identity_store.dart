import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../models/protocol.dart';

class IdentityMaterial {
  const IdentityMaterial({
    required this.deviceId,
    required this.signingKeyPair,
    required this.agreementKeyPair,
  });

  final String deviceId;
  final SimpleKeyPairData signingKeyPair;
  final SimpleKeyPairData agreementKeyPair;

  DeviceDescriptor descriptor() {
    return DeviceDescriptor(
      deviceId: deviceId,
      displayName: 'Chiral Mobile',
      identityPublicKey: base64Encode(
        _spki('302a300506032b6570032100', signingKeyPair.publicKey.bytes),
      ),
      agreementPublicKey: base64Encode(
        _spki('302a300506032b656e032100', agreementKeyPair.publicKey.bytes),
      ),
    );
  }
}

class IdentityStore {
  IdentityStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const String _deviceIdKey = 'chiral.device_id';
  static const String _signingPrivateKey = 'chiral.ed25519.private';
  static const String _signingPublicKey = 'chiral.ed25519.public';
  static const String _agreementPrivateKey = 'chiral.x25519.private';
  static const String _agreementPublicKey = 'chiral.x25519.public';
  static const String _pairedDesktopKey = 'chiral.paired_desktop';

  final FlutterSecureStorage _storage;
  final Ed25519 _ed25519 = Ed25519();
  final X25519 _x25519 = X25519();

  Future<IdentityMaterial> loadOrCreateIdentity() async {
    final String deviceId =
        await _storage.read(key: _deviceIdKey) ?? _newDeviceId();
    await _storage.write(key: _deviceIdKey, value: deviceId);
    final SimpleKeyPairData signing = await _loadOrCreateKeyPair(
      createKeyPair: _ed25519.newKeyPair,
      type: KeyPairType.ed25519,
      privateKeyName: _signingPrivateKey,
      publicKeyName: _signingPublicKey,
    );
    final SimpleKeyPairData agreement = await _loadOrCreateKeyPair(
      createKeyPair: _x25519.newKeyPair,
      type: KeyPairType.x25519,
      privateKeyName: _agreementPrivateKey,
      publicKeyName: _agreementPublicKey,
    );
    return IdentityMaterial(
      deviceId: deviceId,
      signingKeyPair: signing,
      agreementKeyPair: agreement,
    );
  }

  Future<PairedDesktop?> loadPairedDesktop() async {
    final String? encoded = await _storage.read(key: _pairedDesktopKey);
    if (encoded == null) return null;
    return PairedDesktop.fromJson(
      Map<String, dynamic>.from(jsonDecode(encoded) as Map),
    );
  }

  Future<void> savePairedDesktop(PairedDesktop desktop) async {
    await _storage.write(
      key: _pairedDesktopKey,
      value: jsonEncode(desktop.toJson()),
    );
  }

  Future<void> clearPairedDesktop() {
    return _storage.delete(key: _pairedDesktopKey);
  }

  Future<void> revokePairing(PairedDesktop paired) async {
    final IdentityMaterial identity = await loadOrCreateIdentity();
    final String path =
        '/v1/devices/${Uri.encodeComponent(identity.deviceId)}'
        '/peers/${Uri.encodeComponent(paired.bundle.desktop.deviceId)}';
    final String timestamp = DateTime.now().toUtc().toIso8601String();
    final Signature signature = await _ed25519.sign(
      utf8.encode('DELETE\n$path\n$timestamp'),
      keyPair: identity.signingKeyPair,
    );
    final http.Response response = await http
        .delete(
          Uri.parse('${_relayApiRoot(paired.bundle.relayUrl)}$path'),
          headers: <String, String>{
            'x-chiral-timestamp': timestamp,
            'x-chiral-signature': base64Encode(signature.bytes),
          },
        )
        .timeout(const Duration(seconds: 10));
    if (response.statusCode != 204 && response.statusCode != 404) {
      throw StateError('Relay revocation failed (${response.statusCode})');
    }
  }

  Future<PairedDesktop> claimPairing(PairingBundle bundle) async {
    if (DateTime.tryParse(bundle.expiresAt)?.isBefore(DateTime.now()) == true) {
      throw StateError('Pairing QR code has expired');
    }
    final IdentityMaterial identity = await loadOrCreateIdentity();
    final DeviceDescriptor mobile = identity.descriptor();
    final Uri claimUri = Uri.parse(
      '${_relayApiRoot(bundle.relayUrl)}/v1/pairings/${Uri.encodeComponent(bundle.pairingId)}/claim',
    );
    final http.Response response = await http
        .post(
          claimUri,
          headers: const <String, String>{'content-type': 'application/json'},
          body: jsonEncode(<String, dynamic>{
            'pairingToken': bundle.pairingToken,
            'mobile': mobile.toJson(),
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
        'Pairing failed (${response.statusCode}): ${response.body}',
      );
    }

    final List<int> desktopRaw = _rawPublic(bundle.desktop.agreementPublicKey);
    final SecretKey shared = await _x25519.sharedSecretKey(
      keyPair: identity.agreementKeyPair,
      remotePublicKey: SimplePublicKey(desktopRaw, type: KeyPairType.x25519),
    );
    final SecretKey derived = await Hkdf(hmac: Hmac.sha256(), outputLength: 32)
        .deriveKey(
          secretKey: shared,
          nonce: utf8.encode('chiral-remote-v1'),
          info: utf8.encode('${bundle.desktop.deviceId}:${identity.deviceId}'),
        );
    final PairedDesktop paired = PairedDesktop(
      bundle: bundle,
      mobile: mobile,
      sharedKey: await derived.extractBytes(),
    );
    await savePairedDesktop(paired);
    return paired;
  }

  Future<SimpleKeyPairData> _loadOrCreateKeyPair({
    required Future<SimpleKeyPair> Function() createKeyPair,
    required KeyPairType type,
    required String privateKeyName,
    required String publicKeyName,
  }) async {
    final String? privateValue = await _storage.read(key: privateKeyName);
    final String? publicValue = await _storage.read(key: publicKeyName);
    if (privateValue != null && publicValue != null) {
      return SimpleKeyPairData(
        base64Decode(privateValue),
        publicKey: SimplePublicKey(base64Decode(publicValue), type: type),
        type: type,
      );
    }
    final SimpleKeyPairData extracted = await (await createKeyPair()).extract();
    await _storage.write(
      key: privateKeyName,
      value: base64Encode(extracted.bytes),
    );
    await _storage.write(
      key: publicKeyName,
      value: base64Encode(extracted.publicKey.bytes),
    );
    return SimpleKeyPairData(
      extracted.bytes,
      publicKey: SimplePublicKey(extracted.publicKey.bytes, type: type),
      type: type,
    );
  }
}

String _relayApiRoot(String relayUrl) {
  return relayUrl
      .replaceFirst(RegExp(r'/v1/relay$'), '')
      .replaceFirst('wss://', 'https://')
      .replaceFirst('ws://', 'http://');
}

String _newDeviceId() {
  final Random random = Random.secure();
  final String value = List<int>.generate(
    16,
    (_) => random.nextInt(256),
  ).map((int byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return 'mobile-$value';
}

List<int> _spki(String prefix, List<int> raw) {
  final List<int> bytes = <int>[];
  for (int index = 0; index < prefix.length; index += 2) {
    bytes.add(int.parse(prefix.substring(index, index + 2), radix: 16));
  }
  return <int>[...bytes, ...raw];
}

List<int> _rawPublic(String encoded) {
  final List<int> der = base64Decode(encoded);
  if (der.length < 32) throw const FormatException('Invalid public key');
  return der.sublist(der.length - 32);
}

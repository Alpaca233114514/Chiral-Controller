import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:uuid/uuid.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../models/protocol.dart';
import 'identity_store.dart';
import 'lan_discovery.dart';
import 'secure_envelope_codec.dart';

typedef SecureMessageHandler =
    void Function(SecureMessage message, RelayKind kind);
typedef ConnectionHandler = void Function(ConnectionMode mode, String? detail);

class RemoteTransport {
  RemoteTransport({
    required IdentityStore identityStore,
    required this.onMessage,
    required this.onConnection,
    LanDiscovery lanDiscovery = const LanDiscovery(),
  }) : _identityStore = identityStore,
       _lanDiscovery = lanDiscovery;

  final IdentityStore _identityStore;
  final LanDiscovery _lanDiscovery;
  final SecureMessageHandler onMessage;
  final ConnectionHandler onConnection;
  final Map<String, _PendingRequest> _pending = <String, _PendingRequest>{};
  final InboundSequenceGuard _inboundSequence = InboundSequenceGuard();
  final Uuid _uuid = const Uuid();

  WebSocketChannel? _channel;
  PairedDesktop? _paired;
  IdentityMaterial? _identity;
  SecureEnvelopeCodec? _codec;
  ConnectionMode _mode = ConnectionMode.disconnected;
  int _sequence = 0;
  late final List<int> _epoch = List<int>.generate(
    4,
    (_) => Random.secure().nextInt(256),
  );
  bool _closed = true;
  bool _fallingBack = false;

  ConnectionMode get mode => _mode;

  Future<void> connect(PairedDesktop paired) async {
    await close();
    _closed = false;
    _paired = paired;
    _identity = await _identityStore.loadOrCreateIdentity();
    _codec = SecureEnvelopeCodec(
      localDeviceId: paired.mobile.deviceId,
      remoteDeviceId: paired.bundle.desktop.deviceId,
      sharedKey: paired.sharedKey,
    );
    _setMode(ConnectionMode.connecting, 'Searching for LAN bridge');

    final String? discovered = await _lanDiscovery.findDesktop(
      paired.bundle.desktop.deviceId,
    );
    final List<String> lanEndpoints = <String>[];
    final Set<String> seenEndpoints = <String>{};
    for (final String candidate in <String>[
      ?discovered,
      ...paired.bundle.lanEndpoints,
    ]) {
      try {
        final String normalized = normalizeLanEndpoint(candidate);
        if (seenEndpoints.add(normalized)) lanEndpoints.add(normalized);
      } on FormatException {
        // Ignore malformed advertised endpoints and continue to cloud fallback.
      }
    }
    for (final String endpoint in lanEndpoints) {
      try {
        await _connectEndpoint(endpoint, cloud: false);
        return;
      } catch (_) {
        await _disposeChannel();
      }
    }
    await _connectCloud();
  }

  Future<dynamic> request(
    String operation, {
    String? sessionId,
    Map<String, dynamic> payload = const <String, dynamic>{},
    Duration timeout = const Duration(seconds: 30),
  }) async {
    if (_channel == null || _paired == null) {
      throw StateError('Desktop is not connected');
    }
    final String requestId = _uuid.v4();
    final Completer<dynamic> completer = Completer<dynamic>();
    final SecureMessage message = SecureMessage(
      operation: operation,
      requestId: requestId,
      sessionId: sessionId,
      timestamp: DateTime.now().toUtc().toIso8601String(),
      payload: payload,
    );
    _pending[requestId] = _PendingRequest(
      completer: completer,
      message: message,
    );
    await _sendSecure(RelayKind.request, message);
    try {
      return await completer.future.timeout(timeout);
    } finally {
      _pending.remove(requestId);
    }
  }

  Future<void> close() async {
    _closed = true;
    _fallingBack = false;
    for (final _PendingRequest pending in _pending.values) {
      if (!pending.completer.isCompleted) {
        pending.completer.completeError(StateError('Remote transport closed'));
      }
    }
    _pending.clear();
    await _disposeChannel();
    _setMode(ConnectionMode.disconnected, null);
  }

  Future<void> _connectCloud() async {
    final PairedDesktop paired = _requirePaired();
    _setMode(ConnectionMode.connecting, 'Connecting through encrypted relay');
    await _connectEndpoint(paired.bundle.relayUrl, cloud: true);
  }

  Future<void> _connectEndpoint(String endpoint, {required bool cloud}) async {
    final WebSocketChannel channel = WebSocketChannel.connect(
      Uri.parse(endpoint),
    );
    await channel.ready.timeout(const Duration(seconds: 3));
    final StreamIterator<dynamic> iterator = StreamIterator<dynamic>(
      channel.stream,
    );
    if (cloud) {
      if (!await iterator.moveNext()) {
        throw StateError('Relay closed before authentication');
      }
      final Map<String, dynamic> challenge = _decodeMap(iterator.current);
      if (challenge['type'] != 'challenge' || challenge['nonce'] is! String) {
        throw const FormatException('Relay sent an invalid challenge');
      }
      final Signature signature = await Ed25519().sign(
        utf8.encode(challenge['nonce'] as String),
        keyPair: _identity!.signingKeyPair,
      );
      channel.sink.add(
        jsonEncode(<String, dynamic>{
          'type': 'authenticate',
          'deviceId': _identity!.deviceId,
          'signature': base64Encode(signature.bytes),
        }),
      );
      if (!await iterator.moveNext()) {
        throw StateError('Relay closed during authentication');
      }
      final Map<String, dynamic> authenticated = _decodeMap(iterator.current);
      if (authenticated['type'] != 'authenticated') {
        throw StateError('Relay rejected this mobile device');
      }
    }
    _channel = channel;
    _setMode(cloud ? ConnectionMode.cloud : ConnectionMode.lan, endpoint);
    unawaited(_readLoop(channel, iterator));
    if (_pending.isNotEmpty) await _resendPending();
  }

  Future<void> _readLoop(
    WebSocketChannel channel,
    StreamIterator<dynamic> iterator,
  ) async {
    Object? failure;
    try {
      while (!_closed && identical(channel, _channel)) {
        if (!await iterator.moveNext()) break;
        final Map<String, dynamic> json = _decodeMap(iterator.current);
        if (json['type'] != null) {
          _handleControl(json);
          continue;
        }
        final RelayEnvelope envelope = RelayEnvelope.fromJson(json);
        await _handleEnvelope(envelope);
      }
    } catch (error) {
      failure = error;
    }
    if (_closed || !identical(channel, _channel)) return;
    await _disposeChannel();
    if (_mode == ConnectionMode.lan && !_fallingBack) {
      _fallingBack = true;
      try {
        await _connectCloud();
        _fallingBack = false;
        return;
      } catch (error) {
        failure = error;
      }
    }
    _setMode(
      ConnectionMode.disconnected,
      failure?.toString() ?? 'Connection closed',
    );
  }

  void _handleControl(Map<String, dynamic> value) {
    if (value['type'] == 'relay_error') {
      final String detail = (value['code'] ?? 'Relay error').toString();
      onConnection(_mode, detail);
    }
  }

  Future<void> _handleEnvelope(RelayEnvelope envelope) async {
    final SecureMessage message = await _requireCodec().decrypt(envelope);
    // Advance replay state only after authentication. Otherwise a forged
    // high-sequence ciphertext could poison the peer's sequence window.
    _inboundSequence.accept(envelope);
    if ((envelope.kind == RelayKind.response ||
            envelope.kind == RelayKind.error) &&
        message.requestId != null) {
      final _PendingRequest? pending = _pending[message.requestId];
      if (pending != null && !pending.completer.isCompleted) {
        if (envelope.kind == RelayKind.error) {
          final Map<String, dynamic> error = message.payload is Map
              ? Map<String, dynamic>.from(message.payload as Map)
              : <String, dynamic>{};
          pending.completer.completeError(
            RemoteOperationException(
              code: (error['code'] ?? 'REMOTE_ERROR').toString(),
              message: (error['message'] ?? 'Remote operation failed')
                  .toString(),
              retryable: error['retryable'] == true,
            ),
          );
        } else {
          pending.completer.complete(message.payload);
        }
      }
      return;
    }
    onMessage(message, envelope.kind);
  }

  Future<void> _sendSecure(RelayKind kind, SecureMessage message) async {
    final WebSocketChannel channel =
        _channel ?? (throw StateError('Remote transport is disconnected'));
    _sequence += 1;
    final List<int> nonce = <int>[..._epoch, ..._uint64(_sequence)];
    final RelayEnvelope envelope = await _requireCodec().encrypt(
      message: message,
      kind: kind,
      sequence: _sequence,
      nonce: nonce,
    );
    final String serialized = jsonEncode(envelope.toJson());
    if (utf8.encode(serialized).length > maxEnvelopeBytes) {
      throw StateError('Encrypted message exceeds relay envelope limit');
    }
    channel.sink.add(serialized);
  }

  Future<void> _resendPending() async {
    final List<_PendingRequest> requests = _pending.values
        .where((_PendingRequest pending) => !pending.completer.isCompleted)
        .toList(growable: false);
    for (final _PendingRequest pending in requests) {
      await _sendSecure(RelayKind.request, pending.message);
    }
  }

  Future<void> _disposeChannel() async {
    final WebSocketChannel? channel = _channel;
    _channel = null;
    if (channel != null) {
      await channel.sink.close();
    }
  }

  PairedDesktop _requirePaired() {
    return _paired ?? (throw StateError('No paired desktop'));
  }

  SecureEnvelopeCodec _requireCodec() {
    return _codec ?? (throw StateError('Remote encryption is unavailable'));
  }

  void _setMode(ConnectionMode mode, String? detail) {
    _mode = mode;
    onConnection(mode, detail);
  }
}

class _PendingRequest {
  const _PendingRequest({required this.completer, required this.message});

  final Completer<dynamic> completer;
  final SecureMessage message;
}

class RemoteOperationException implements Exception {
  const RemoteOperationException({
    required this.code,
    required this.message,
    required this.retryable,
  });

  final String code;
  final String message;
  final bool retryable;

  @override
  String toString() => '$code: $message';
}

Map<String, dynamic> _decodeMap(dynamic value) {
  final dynamic decoded = value is String
      ? jsonDecode(value)
      : jsonDecode(utf8.decode(value as List<int>));
  if (decoded is! Map) throw const FormatException('Expected JSON object');
  return Map<String, dynamic>.from(decoded);
}

List<int> _uint64(int value) {
  final ByteData data = ByteData(8)..setUint64(0, value);
  return data.buffer.asUint8List();
}

import 'dart:convert';

const String protocolVersion = '1.0';
const int maxEnvelopeBytes = 1024 * 1024;
const int maxAttachmentBytes = 20 * 1024 * 1024;

enum RelayKind { request, response, event, ack, error }

enum ConnectionMode { disconnected, connecting, lan, cloud }

class DeviceDescriptor {
  const DeviceDescriptor({
    required this.deviceId,
    required this.displayName,
    required this.identityPublicKey,
    required this.agreementPublicKey,
  });

  factory DeviceDescriptor.fromJson(Map<String, dynamic> json) {
    return DeviceDescriptor(
      deviceId: json['deviceId'] as String,
      displayName: json['displayName'] as String,
      identityPublicKey: json['identityPublicKey'] as String,
      agreementPublicKey: json['agreementPublicKey'] as String,
    );
  }

  final String deviceId;
  final String displayName;
  final String identityPublicKey;
  final String agreementPublicKey;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'deviceId': deviceId,
    'displayName': displayName,
    'identityPublicKey': identityPublicKey,
    'agreementPublicKey': agreementPublicKey,
  };
}

class PairingBundle {
  const PairingBundle({
    required this.pairingId,
    required this.pairingToken,
    required this.expiresAt,
    required this.relayUrl,
    required this.desktop,
    required this.lanEndpoints,
  });

  factory PairingBundle.fromJson(Map<String, dynamic> json) {
    final String version =
        (json['protocolVersion'] as String?) ?? protocolVersion;
    if (version.split('.').first != protocolVersion.split('.').first) {
      throw const FormatException('Unsupported Chiral protocol version');
    }
    return PairingBundle(
      pairingId: json['pairingId'] as String,
      pairingToken: json['pairingToken'] as String,
      expiresAt: json['expiresAt'] as String,
      relayUrl: json['relayUrl'] as String,
      desktop: DeviceDescriptor.fromJson(
        Map<String, dynamic>.from(json['desktop'] as Map),
      ),
      lanEndpoints: (json['lanEndpoints'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic value) => value.toString())
          .toList(growable: false),
    );
  }

  factory PairingBundle.fromQr(String value) {
    return PairingBundle.fromJson(
      Map<String, dynamic>.from(jsonDecode(value) as Map),
    );
  }

  final String pairingId;
  final String pairingToken;
  final String expiresAt;
  final String relayUrl;
  final DeviceDescriptor desktop;
  final List<String> lanEndpoints;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'protocolVersion': protocolVersion,
    'pairingId': pairingId,
    'pairingToken': pairingToken,
    'expiresAt': expiresAt,
    'relayUrl': relayUrl,
    'desktop': desktop.toJson(),
    'lanEndpoints': lanEndpoints,
  };
}

class RelayEnvelope {
  const RelayEnvelope({
    required this.messageId,
    required this.sourceDeviceId,
    required this.targetDeviceId,
    required this.sequence,
    required this.kind,
    required this.nonce,
    required this.ciphertext,
  });

  factory RelayEnvelope.fromJson(Map<String, dynamic> json) {
    if (json['version'] != protocolVersion) {
      throw const FormatException('Unsupported relay envelope version');
    }
    return RelayEnvelope(
      messageId: json['messageId'] as String,
      sourceDeviceId: json['sourceDeviceId'] as String,
      targetDeviceId: json['targetDeviceId'] as String,
      sequence: (json['sequence'] as num).toInt(),
      kind: RelayKind.values.byName(json['kind'] as String),
      nonce: json['nonce'] as String,
      ciphertext: json['ciphertext'] as String,
    );
  }

  final String messageId;
  final String sourceDeviceId;
  final String targetDeviceId;
  final int sequence;
  final RelayKind kind;
  final String nonce;
  final String ciphertext;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'version': protocolVersion,
    'messageId': messageId,
    'sourceDeviceId': sourceDeviceId,
    'targetDeviceId': targetDeviceId,
    'sequence': sequence,
    'kind': kind.name,
    'nonce': nonce,
    'ciphertext': ciphertext,
  };

  String aad() {
    return <Object>[
      protocolVersion,
      messageId,
      sourceDeviceId,
      targetDeviceId,
      sequence,
      kind.name,
    ].join('\n');
  }
}

class SecureMessage {
  const SecureMessage({
    required this.operation,
    required this.timestamp,
    required this.payload,
    this.requestId,
    this.sessionId,
  });

  factory SecureMessage.fromJson(Map<String, dynamic> json) {
    return SecureMessage(
      operation: json['operation'] as String,
      requestId: json['requestId'] as String?,
      sessionId: json['sessionId'] as String?,
      timestamp: json['timestamp'] as String,
      payload: json['payload'],
    );
  }

  final String operation;
  final String? requestId;
  final String? sessionId;
  final String timestamp;
  final dynamic payload;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'operation': operation,
    'requestId': requestId,
    'sessionId': sessionId,
    'timestamp': timestamp,
    'payload': payload,
  };
}

class PairedDesktop {
  const PairedDesktop({
    required this.bundle,
    required this.mobile,
    required this.sharedKey,
  });

  final PairingBundle bundle;
  final DeviceDescriptor mobile;
  final List<int> sharedKey;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'bundle': bundle.toJson(),
    'mobile': mobile.toJson(),
    'sharedKey': base64Encode(sharedKey),
  };

  factory PairedDesktop.fromJson(Map<String, dynamic> json) {
    return PairedDesktop(
      bundle: PairingBundle.fromJson(
        Map<String, dynamic>.from(json['bundle'] as Map),
      ),
      mobile: DeviceDescriptor.fromJson(
        Map<String, dynamic>.from(json['mobile'] as Map),
      ),
      sharedKey: base64Decode(json['sharedKey'] as String),
    );
  }
}

class ChiralSession {
  const ChiralSession({
    required this.sessionId,
    required this.title,
    required this.lastUpdated,
    this.isRunning = false,
    this.archived = false,
    this.workDir,
  });

  factory ChiralSession.fromJson(Map<String, dynamic> json) {
    return ChiralSession(
      sessionId: (json['session_id'] ?? json['sessionId'] ?? '').toString(),
      title: (json['title'] ?? 'Untitled').toString(),
      lastUpdated:
          DateTime.tryParse(
            (json['last_updated'] ?? json['lastUpdated'] ?? '').toString(),
          ) ??
          DateTime.now(),
      isRunning: (json['is_running'] ?? json['isRunning']) == true,
      archived: json['archived'] == true,
      workDir: (json['work_dir'] ?? json['workDir']) as String?,
    );
  }

  final String sessionId;
  final String title;
  final DateTime lastUpdated;
  final bool isRunning;
  final bool archived;
  final String? workDir;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'sessionId': sessionId,
    'title': title,
    'lastUpdated': lastUpdated.toIso8601String(),
    'isRunning': isRunning,
    'archived': archived,
    'workDir': workDir,
  };
}

enum ChatEntryKind {
  user,
  assistant,
  thinking,
  tool,
  approval,
  question,
  status,
  task,
  error,
}

class ChatEntry {
  const ChatEntry({
    required this.id,
    required this.kind,
    required this.content,
    required this.timestamp,
    this.data = const <String, dynamic>{},
  });

  final String id;
  final ChatEntryKind kind;
  final String content;
  final DateTime timestamp;
  final Map<String, dynamic> data;

  ChatEntry copyWith({String? content, Map<String, dynamic>? data}) {
    return ChatEntry(
      id: id,
      kind: kind,
      content: content ?? this.content,
      timestamp: timestamp,
      data: data ?? this.data,
    );
  }
}

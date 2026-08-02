import 'dart:async';

import 'package:multicast_dns/multicast_dns.dart';

class LanDiscovery {
  const LanDiscovery();

  Future<String?> findDesktop(
    String deviceId, {
    Duration timeout = const Duration(seconds: 2),
  }) async {
    final MDnsClient client = MDnsClient();
    try {
      await client.start();
      await for (final PtrResourceRecord pointer
          in client
              .lookup<PtrResourceRecord>(
                ResourceRecordQuery.serverPointer('_chiral._tcp.local'),
              )
              .timeout(timeout)) {
        final bool matches = await _matchesDevice(
          client,
          pointer.domainName,
          deviceId,
        );
        if (!matches) continue;
        final SrvResourceRecord service = await client
            .lookup<SrvResourceRecord>(
              ResourceRecordQuery.service(pointer.domainName),
            )
            .first
            .timeout(const Duration(milliseconds: 700));
        final IPAddressResourceRecord address = await client
            .lookup<IPAddressResourceRecord>(
              ResourceRecordQuery.addressIPv4(service.target),
            )
            .first
            .timeout(const Duration(milliseconds: 700));
        return normalizeLanEndpoint(
          'ws://${address.address.address}:${service.port}',
        );
      }
    } on TimeoutException {
      return null;
    } catch (_) {
      return null;
    } finally {
      client.stop();
    }
    return null;
  }

  Future<bool> _matchesDevice(
    MDnsClient client,
    String domainName,
    String deviceId,
  ) async {
    try {
      final TxtResourceRecord record = await client
          .lookup<TxtResourceRecord>(ResourceRecordQuery.text(domainName))
          .first
          .timeout(const Duration(milliseconds: 500));
      return record.text.contains('device_id=$deviceId');
    } on Object {
      return domainName.contains(deviceId);
    }
  }
}

String normalizeLanEndpoint(String endpoint) {
  final Uri uri = Uri.parse(endpoint.trim());
  if ((uri.scheme != 'ws' && uri.scheme != 'wss') ||
      uri.host.isEmpty ||
      uri.hasFragment) {
    throw FormatException('Invalid Chiral LAN endpoint: $endpoint');
  }
  final String path = uri.path.isEmpty || uri.path == '/'
      ? '/v1/local'
      : uri.path;
  return uri.replace(path: path).toString();
}

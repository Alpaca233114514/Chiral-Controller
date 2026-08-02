import 'package:chiral_mobile/src/services/lan_discovery.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('normalizeLanEndpoint', () {
    test('adds the local bridge path to mDNS endpoints', () {
      expect(
        normalizeLanEndpoint('ws://192.168.1.20:3778'),
        'ws://192.168.1.20:3778/v1/local',
      );
    });

    test('preserves an explicit websocket path', () {
      expect(
        normalizeLanEndpoint('wss://desktop.local:3778/custom'),
        'wss://desktop.local:3778/custom',
      );
    });

    test('rejects non-websocket endpoints', () {
      expect(
        () => normalizeLanEndpoint('http://192.168.1.20:3778'),
        throwsFormatException,
      );
    });

    test('rejects endpoints with fragments', () {
      expect(
        () => normalizeLanEndpoint('ws://192.168.1.20:3778/#unexpected'),
        throwsFormatException,
      );
    });
  });
}

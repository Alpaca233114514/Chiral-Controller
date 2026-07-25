import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:chiral_mobile/main.dart';
import 'package:chiral_mobile/src/models/protocol.dart';
import 'package:chiral_mobile/src/theme/chiral_theme.dart';

void main() {
  test('rejects an incompatible pairing protocol', () {
    expect(
      () => PairingBundle.fromJson(<String, dynamic>{'protocolVersion': '2.0'}),
      throwsFormatException,
    );
  });

  test('provides light and dark controller themes', () {
    expect(ChiralTheme.light.brightness.name, 'light');
    expect(ChiralTheme.dark.brightness.name, 'dark');
  });

  testWidgets('renders the offline controller shell without a device', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: ChiralApp()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('CHIRAL'), findsOneWidget);
    expect(find.text('Desktop 离线'), findsOneWidget);
    expect(find.text('先与 Kimi Code Desktop 配对'), findsOneWidget);
  });
}

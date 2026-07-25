import 'package:chiral_mobile/src/models/protocol.dart';
import 'package:chiral_mobile/src/screens/home_screen.dart';
import 'package:chiral_mobile/src/state/remote_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'renders connected timeline and dispatches approval and prompt actions',
    (WidgetTester tester) async {
      final _TestRemoteController controller = _TestRemoteController();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [remoteControllerProvider.overrideWith(() => controller)],
          child: const MaterialApp(home: HomeScreen()),
        ),
      );
      await tester.pump();

      expect(find.text('CLOUD · 端到端加密'), findsOneWidget);
      expect(find.text('Fixture session'), findsNWidgets(2));
      expect(find.text('KIMI'), findsOneWidget);
      expect(find.text('APPROVAL'), findsOneWidget);
      expect(find.text('Run the formatter?'), findsOneWidget);

      await tester.tap(find.text('允许'));
      await tester.pump();
      expect(controller.approvalDecision, 'approved');

      await tester.enterText(find.byType(TextField).last, 'continue');
      await tester.tap(find.byIcon(Icons.arrow_upward));
      await tester.pump();
      expect(controller.sentPrompt, 'continue');
    },
  );
}

class _TestRemoteController extends RemoteController {
  String? sentPrompt;
  String? approvalDecision;

  @override
  RemoteState build() {
    return RemoteState(
      initialized: true,
      pairedDesktop: PairedDesktop(
        bundle: PairingBundle(
          pairingId: 'pairing',
          pairingToken: 'consumed',
          expiresAt: DateTime(2030).toIso8601String(),
          relayUrl: 'wss://chiral.liyuanstudio.com/v1/relay',
          desktop: const DeviceDescriptor(
            deviceId: 'desktop',
            displayName: 'Fixture Desktop',
            identityPublicKey: 'identity',
            agreementPublicKey: 'agreement',
          ),
          lanEndpoints: const <String>[],
        ),
        mobile: const DeviceDescriptor(
          deviceId: 'mobile',
          displayName: 'Fixture Mobile',
          identityPublicKey: 'identity',
          agreementPublicKey: 'agreement',
        ),
        sharedKey: List<int>.filled(32, 0),
      ),
      connectionMode: ConnectionMode.cloud,
      sessions: <ChiralSession>[
        ChiralSession(
          sessionId: 'session-1',
          title: 'Fixture session',
          lastUpdated: DateTime(2026),
        ),
      ],
      selectedSessionId: 'session-1',
      entries: <ChatEntry>[
        ChatEntry(
          id: 'assistant-1',
          kind: ChatEntryKind.assistant,
          content: 'Ready to continue.',
          timestamp: DateTime(2026),
        ),
        ChatEntry(
          id: 'approval-1',
          kind: ChatEntryKind.approval,
          content: 'Run the formatter?',
          timestamp: DateTime(2026),
          data: const <String, dynamic>{'requestId': 'approval-1'},
        ),
      ],
    );
  }

  @override
  Future<void> sendPrompt(String text) async {
    sentPrompt = text;
  }

  @override
  Future<void> respondApproval(
    ChatEntry entry,
    String decision, {
    String? feedback,
  }) async {
    approvalDecision = decision;
  }

  @override
  void setDraft(String value) {}
}

import 'dart:typed_data';

import 'package:chiral_mobile/src/models/protocol.dart';
import 'package:chiral_mobile/src/services/attachment_chunker.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('represents an empty attachment with one empty chunk', () {
    final List<AttachmentChunk> chunks = splitAttachment(Uint8List(0));
    expect(chunks, hasLength(1));
    expect(chunks.single.index, 0);
    expect(chunks.single.total, 1);
    expect(chunks.single.bytes, isEmpty);
  });

  test('splits boundary-sized attachments without losing bytes', () {
    final Uint8List input = Uint8List.fromList(
      List<int>.generate(attachmentChunkBytes + 1, (int index) => index % 251),
    );
    final List<AttachmentChunk> chunks = splitAttachment(input);
    expect(chunks, hasLength(2));
    expect(chunks.first.bytes, hasLength(attachmentChunkBytes));
    expect(chunks.last.bytes, hasLength(1));
    expect(
      chunks.expand((AttachmentChunk chunk) => chunk.bytes).toList(),
      input,
    );
  });

  test('rejects attachments beyond the negotiated limit', () {
    expect(
      () => splitAttachment(Uint8List(maxAttachmentBytes + 1)),
      throwsStateError,
    );
  });
}

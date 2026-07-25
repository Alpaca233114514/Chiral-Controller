import 'dart:typed_data';

import '../models/protocol.dart';

const int attachmentChunkBytes = 256 * 1024;

class AttachmentChunk {
  const AttachmentChunk({
    required this.index,
    required this.total,
    required this.bytes,
  });

  final int index;
  final int total;
  final Uint8List bytes;
}

List<AttachmentChunk> splitAttachment(Uint8List bytes) {
  if (bytes.length > maxAttachmentBytes) {
    throw StateError('Attachment exceeds the 20 MiB limit');
  }
  final int total = bytes.isEmpty
      ? 1
      : (bytes.length + attachmentChunkBytes - 1) ~/ attachmentChunkBytes;
  return List<AttachmentChunk>.generate(total, (int index) {
    final int start = index * attachmentChunkBytes;
    final int end = (start + attachmentChunkBytes).clamp(0, bytes.length);
    return AttachmentChunk(
      index: index,
      total: total,
      bytes: Uint8List.fromList(bytes.sublist(start, end)),
    );
  }, growable: false);
}

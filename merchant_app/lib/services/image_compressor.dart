import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// يجهز الصور قبل الرفع لتقليل استهلاك البيانات والوقت.
/// يعيد JPEG مضغوطًا بعرض أقصى 1280px وحجم مستهدف 450KB.
Future<Uint8List> compressImageBytes(
  Uint8List input, {
  int maxWidth = 1280,
  int maxBytes = 450 * 1024,
}) async {
  final decoded = img.decodeImage(input);
  if (decoded == null || input.length <= maxBytes) return input;

  final resized = decoded.width > maxWidth
      ? img.copyResize(decoded, width: maxWidth)
      : decoded;
  var quality = 80;
  var output = Uint8List.fromList(img.encodeJpg(resized, quality: quality));
  while (output.length > maxBytes && quality > 35) {
    quality -= 10;
    output = Uint8List.fromList(img.encodeJpg(resized, quality: quality));
  }
  return output;
}

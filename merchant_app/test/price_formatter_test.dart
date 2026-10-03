import 'package:flutter_test/flutter_test.dart';
import '../lib/common.dart';

void main() {
  test('formats new prices with thousands separators', () {
    expect(formatMoney(250), '250 ل.س');
    expect(formatMoney(2500), '2,500 ل.س');
  });

  test('formats new and old prices when requested', () {
    expect(formatMoney(250, mode: 'new_with_old'), '250 ل.س (25,000 قديمة)');
  });

  test('missing, empty, and unknown modes default to new', () {
    expect(formatMoney(null), '0 ل.س');
    expect(formatMoney('', mode: ''), '0 ل.س');
    expect(formatMoney(250, mode: 'unknown'), '250 ل.س');
  });
}

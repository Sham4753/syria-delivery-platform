import 'package:flutter_test/flutter_test.dart';
import '../lib/common.dart';

void main() {
  test('formats whole and fractional new prices', () {
    expect(formatMoney(250), '250 ل.س');
    expect(formatMoney(2500), '2,500 ل.س');
    expect(formatMoney(12.5), '12.5 ل.س');
    expect(formatMoney(0.1), '0.1 ل.س');
    expect(formatMoney(12.55), '12.55 ل.س');
    expect(formatMoney(0.1 + 0.2), '0.3 ل.س');
    expect(formatMoney(1234.5), '1,234.5 ل.س');
    expect(formatMoney(0), '0 ل.س');
    expect(formatMoney(-1234.5), '-1,234.5 ل.س');
    expect(formatMoney('12.5'), '12.5 ل.س');
  });

  test('formats new and old prices using the same decimal rule', () {
    expect(formatMoney(250, mode: 'new_with_old'), '250 ل.س (25,000 قديمة)');
    expect(formatMoney(12.55, mode: 'new_with_old'), '12.55 ل.س (1,255 قديمة)');
  });

  test('missing, empty, and invalid values default safely', () {
    expect(formatMoney(null), '0 ل.س');
    expect(formatMoney('', mode: ''), '0 ل.س');
    expect(formatMoney('not-a-number'), '0 ل.س');
    expect(formatMoney(250, mode: 'unknown'), '250 ل.س');
  });
}

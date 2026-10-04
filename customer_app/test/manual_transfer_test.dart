import 'package:flutter_test/flutter_test.dart';
import '../lib/manual_transfer.dart';

void main() {
  test('returns enabled manual transfer channels only', () {
    final channels = enabledManualTransferChannels({
      'manual_transfer': {
        'channels': {
          'bank_transfer': {'enabled': true, 'display_name': 'تحويل بنكي'},
          'syriatel_cash': {'enabled': false},
          'sham_cash': {'enabled': true, 'account_label': 'وجهة شام'},
        },
      },
    });
    expect(channels.keys, containsAll(<String>['bank_transfer', 'sham_cash']));
    expect(channels.keys, isNot(contains('syriatel_cash')));
  });

  test('handles missing manual channels safely', () {
    expect(enabledManualTransferChannels(<String, dynamic>{}), isEmpty);
  });

  test('builds server-compatible manual transfer fields', () {
    expect(manualTransferOrderFields('sham_cash'), {
      'payment_method': 'manual_transfer',
      'payment_channel': 'sham_cash',
    });
  });

  test('explains duplicate reference and preserves server message', () {
    expect(manualTransferErrorMessage('already-exists', null), contains('مستخدم مسبقًا'));
    expect(manualTransferErrorMessage('failed-precondition', 'بدأت مراجعة العملية'), 'بدأت مراجعة العملية');
    expect(manualTransferErrorMessage('invalid-argument', ''), contains('تصحيح المرجع'));
  });
}

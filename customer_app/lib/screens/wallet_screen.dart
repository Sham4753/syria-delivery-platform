import '../common.dart';

class CustomerWalletPage extends StatelessWidget {
  const CustomerWalletPage({super.key});

  Future<void> _topUp(BuildContext context, String method, String reference) async {
    try {
      await appFunctions.httpsCallable('topUpWallet').call({'method': method, 'reference': reference.trim()});
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال طلب الشحن للمراجعة')));
    } on FirebaseFunctionsException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'تعذر تنفيذ الشحن')));
    }
  }

  Future<void> _showTopUp(BuildContext context) async {
    final reference = TextEditingController();
    String method = 'voucher';
    await showDialog<void>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('شحن المحفظة'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              value: method,
              decoration: const InputDecoration(labelText: 'طريقة الشحن'),
              items: const [
                DropdownMenuItem(value: 'voucher', child: Text('كود شحن')),
                DropdownMenuItem(value: 'local_transfer', child: Text('تحويل محلي')),
                DropdownMenuItem(value: 'change_to_wallet', child: Text('الباقي عبر المندوب')),
              ],
              onChanged: (value) => setState(() => method = value ?? method),
            ),
            const SizedBox(height: 12),
            TextField(controller: reference, decoration: const InputDecoration(labelText: 'الكود أو رقم العملية أو الطلب')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
            FilledButton(onPressed: () { Navigator.pop(context); _topUp(context, method, reference.text); }, child: const Text('إرسال')),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return const Scaffold(body: Center(child: Text('سجّل الدخول لعرض المحفظة')));
    final user = FirebaseFirestore.instance.collection('users').doc(uid);
    final ledger = user.collection('wallet_ledger').orderBy('created_at', descending: true).limit(30);
    return Scaffold(
      appBar: AppBar(title: const Text('المحفظة والولاء')),
      body: StreamBuilder<DocumentSnapshot>(
        stream: user.snapshots(),
        builder: (context, snapshot) {
          final data = snapshot.data?.data() as Map<String, dynamic>? ?? {};
          final balance = data['wallet_balance'] ?? 0;
          final points = data['loyalty_points'] ?? 0;
          return ListView(padding: const EdgeInsets.all(16), children: [
            Card(child: Padding(padding: const EdgeInsets.all(22), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.account_balance_wallet_rounded, size: 34),
              const SizedBox(height: 10), const Text('الرصيد المتاح'),
              Text('$balance ل.س', style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              Row(children: [Expanded(child: Text('نقاط الولاء: $points', style: const TextStyle(fontWeight: FontWeight.bold))), FilledButton.icon(onPressed: () => _showTopUp(context), icon: const Icon(Icons.add), label: const Text('شحن'))]),
            ]))),
            const SizedBox(height: 14),
            const Text('آخر الحركات', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            StreamBuilder<QuerySnapshot>(
              stream: ledger.snapshots(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                if (snapshot.data!.docs.isEmpty) return const Padding(padding: EdgeInsets.all(24), child: Text('لا توجد حركات بعد'));
                return Column(children: snapshot.data!.docs.map((doc) {
                  final item = doc.data() as Map<String, dynamic>;
                  return ListTile(leading: const Icon(Icons.receipt_long), title: Text(item['label'] ?? 'حركة محفظة'), trailing: Text('${item['amount'] ?? item['points'] ?? 0} ${item['unit'] ?? 'ل.س'}'));
                }).toList());
              },
            ),
          ]);
        },
      ),
    );
  }
}

class PaymentChoice {
  final String method;
  final num walletAmount;
  final num loyaltyPoints;
  final num cashChangeFor;
  const PaymentChoice(this.method, this.walletAmount, this.loyaltyPoints, this.cashChangeFor);
}

Future<PaymentChoice?> showPaymentSheet(BuildContext context, num total, Map<String, dynamic> user, {bool bankTransferEnabled = false, String bankName = ''}) async {
  String method = 'cash_on_delivery';
  num wallet = 0;
  num points = 0;
  num cashChange = 0;
  final balance = num.tryParse('${user['wallet_balance'] ?? 0}') ?? 0;
  final loyalty = num.tryParse('${user['loyalty_points'] ?? 0}') ?? 0;
  return showModalBottomSheet<PaymentChoice>(
    context: context,
    isScrollControlled: true,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => Padding(
        padding: EdgeInsets.only(left: 18, right: 18, top: 18, bottom: MediaQuery.of(context).viewInsets.bottom + 18),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('اختيار الدفع — $total ل.س', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          RadioListTile<String>(value: 'cash_on_delivery', groupValue: method, onChanged: (String? value) => setState(() => method = value ?? method), title: const Text('كاش عند الاستلام')),
          if (method == 'cash_on_delivery') TextField(decoration: const InputDecoration(labelText: 'الفئة النقدية'), keyboardType: TextInputType.number, onChanged: (value) => cashChange = num.tryParse(value) ?? 0),
          RadioListTile<String>(value: 'wallet', groupValue: method, onChanged: balance >= total ? (String? value) => setState(() { method = value ?? method; wallet = total; }) : null, title: Text('المحفظة — $balance ل.س')),
          RadioListTile<String>(value: 'hybrid', groupValue: method, onChanged: balance > 0 || loyalty > 0 ? (String? value) => setState(() => method = value ?? method) : null, title: const Text('دفع جزئي + كاش')),
          if (bankTransferEnabled) RadioListTile<String>(value: 'bank_transfer', groupValue: method, onChanged: (String? value) => setState(() { method = value ?? method; wallet = 0; points = 0; cashChange = 0; }), title: Text('تحويل بنكي${bankName.isEmpty ? '' : ' — $bankName'}')),
          if (method == 'hybrid') Row(children: [
            Expanded(child: TextField(decoration: const InputDecoration(labelText: 'من المحفظة'), keyboardType: TextInputType.number, onChanged: (value) => wallet = num.tryParse(value) ?? 0)),
            const SizedBox(width: 10),
            Expanded(child: TextField(decoration: const InputDecoration(labelText: 'نقاط'), keyboardType: TextInputType.number, onChanged: (value) => points = num.tryParse(value) ?? 0)),
          ]),
          const SizedBox(height: 14),
          SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(context, PaymentChoice(method, wallet, points, cashChange)), child: const Text('متابعة'))),
        ]),
      ),
    ),
  );
}

num walletPointValue(Map<String, dynamic> user) => num.tryParse('${user['loyalty_point_value'] ?? 0}') ?? 0;

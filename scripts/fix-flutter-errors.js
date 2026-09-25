const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const products = `import '../common.dart';
import 'address_book_screen.dart';
import 'login_screen.dart';
import 'order_screen.dart';
import 'wallet_screen.dart';

class ProductsPage extends StatefulWidget {
  final String vendorId, name, zoneId;
  const ProductsPage({super.key, required this.vendorId, required this.name, required this.zoneId});
  @override State<ProductsPage> createState() => _ProductsPageState();
}

class _ProductsPageState extends State<ProductsPage> {
  final cart = <String, Map<String, dynamic>>{};
  Map<String, dynamic>? address;
  final coupon = TextEditingController();
  String? couponCode;
  num discount = 0;
  num get subtotal => cart.values.fold<num>(0, (sum, item) => sum + (item['price'] ?? 0) * (item['quantity'] ?? 1));

  Future<void> addProduct(String id, Map<String, dynamic> data) async {
    final modifiers = (data['modifiers'] as List? ?? []).whereType<Map>().toList();
    final selected = <Map<String, dynamic>>[];
    for (final modifier in modifiers) {
      final add = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text('إضافة \${modifier['name'] ?? ''}؟'),
          content: Text('\${modifier['price'] ?? 0} ل.س'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('بدون')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('إضافة')),
          ],
        ),
      );
      if (add == true) selected.add(Map<String, dynamic>.from(modifier));
    }
    final key = '$id-\${selected.map((m) => m['name']).join('-')}';
    final extra = selected.fold<num>(0, (sum, m) => sum + (m['price'] ?? 0));
    setState(() => cart[key] = {...data, 'product_id': id, 'quantity': 1, 'selected_modifiers': selected, 'price': (data['price'] ?? 0) + extra});
  }

  Future<void> selectAddress() async {
    final result = await Navigator.push<Map<String, dynamic>>(context, MaterialPageRoute(builder: (_) => const AddressBookPage()));
    if (result != null && mounted) setState(() => address = result);
  }

  Future<void> applyCoupon() async {
    final value = coupon.text.trim().toUpperCase();
    if (value.isEmpty) return;
    final snap = await FirebaseFirestore.instance.collection('coupons').doc(value).get();
    final data = snap.data();
    if (!snap.exists || data?['is_active'] != true || subtotal < (data?['min_order_amount'] ?? 0)) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('الكوبون غير صالح')));
      return;
    }
    setState(() { couponCode = value; discount = data?['type'] == 'percentage' ? subtotal * ((data?['value'] ?? 0) / 100) : (data?['value'] ?? 0); });
  }

  Future<void> checkout() async {
    if (FirebaseAuth.instance.currentUser == null) {
      await Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginPage()));
      if (!mounted || FirebaseAuth.instance.currentUser == null) return;
    }
    if (address == null) { await selectAddress(); if (address == null) return; }
    final total = (subtotal - discount).clamp(0, double.infinity);
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final userSnap = await FirebaseFirestore.instance.collection('users').doc(uid).get();
    final choice = await showPaymentSheet(context, total, userSnap.data() ?? {});
    if (choice == null) return;
    try {
      final result = await FirebaseFunctions.instance.httpsCallable('createOrder').call({
        'vendor_id': widget.vendorId, 'zone_id': widget.zoneId, 'items': cart.values.toList(), 'coupon_code': couponCode,
        'delivery_address': address, 'payment_method': choice.method, 'wallet_amount': choice.walletAmount,
        'loyalty_points': choice.loyaltyPoints, 'cash_change_for': choice.cashChangeFor,
      });
      if (mounted) { setState(() => cart.clear()); Navigator.push(context, MaterialPageRoute(builder: (_) => OrderPage(orderId: result.data['order_id'] as String))); }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'تعذر إنشاء الطلب')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.name),
        actions: [
          IconButton(onPressed: selectAddress, icon: Icon(address == null ? Icons.location_on : Icons.location_on_outlined)),
          IconButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CustomerWalletPage())), icon: const Icon(Icons.account_balance_wallet)),
        ],
      ),
      body: Column(
        children: [
          Padding(padding: const EdgeInsets.all(12), child: Row(children: [Expanded(child: TextField(controller: coupon, decoration: const InputDecoration(labelText: 'كود الخصم'))), IconButton(onPressed: applyCoupon, icon: const Icon(Icons.check))])),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance.collection('vendors').doc(widget.vendorId).collection('products').where('is_available', isEqualTo: true).snapshots(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                return ListView(children: snapshot.data!.docs.map((doc) {
                  final data = doc.data() as Map<String, dynamic>;
                  final key = cart.keys.firstWhere((k) => k.startsWith('\${doc.id}-'), orElse: () => '');
                  final quantity = key.isEmpty ? 0 : (cart[key]!['quantity'] as int? ?? 0);
                  return Card(child: ListTile(
                    title: Text(data['name'] ?? ''), subtitle: Text('\${data['price'] ?? 0} ل.س'),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      if (quantity > 0) IconButton(onPressed: () => setState(() { if (quantity == 1) cart.remove(key); else cart[key]!['quantity'] = quantity - 1; }), icon: const Icon(Icons.remove_circle_outline)),
                      Text('$quantity'), IconButton(onPressed: () => addProduct(doc.id, data), icon: const Icon(Icons.add_circle)),
                    ]),
                  ));
                }).toList());
              },
            ),
          ),
          if (cart.isNotEmpty) Material(
            elevation: 12, color: Theme.of(context).colorScheme.primary,
            child: SafeArea(child: ListTile(
              title: Text('\${cart.values.fold<int>(0, (s, item) => s + (item['quantity'] as int? ?? 1))} أصناف  •  $subtotal ل.س', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              subtitle: discount > 0 ? Text('الخصم: $discount ل.س', style: const TextStyle(color: Colors.white70)) : null,
              trailing: FilledButton(onPressed: checkout, child: const Text('إتمام الطلب')),
            )),
          ),
        ],
      ),
    );
  }
}
`;

const login = `import 'package:flutter/foundation.dart' show kIsWeb;
import '../common.dart';
import 'home_screen.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final phone = TextEditingController();
  final code = TextEditingController();
  ConfirmationResult? webConfirmation;
  String? verificationId;
  bool busy = false;

  Future<void> social(AuthProvider provider) async {
    setState(() => busy = true);
    try {
      final result = await FirebaseAuth.instance.signInWithPopup(provider);
      final user = result.user;
      if (user != null) await FirebaseFirestore.instance.collection('users').doc(user.uid).set({'role': 'customer', 'display_name': user.displayName ?? '', 'phone': user.phoneNumber ?? '', 'updated_at': FieldValue.serverTimestamp()}, SetOptions(merge: true));
      await registerPushToken();
      if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage()));
    } on FirebaseAuthException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'تعذر التسجيل')));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> sendPhoneCode() async {
    setState(() => busy = true);
    try {
      if (kIsWeb) {
        webConfirmation = await FirebaseAuth.instance.signInWithPhoneNumber(phone.text.trim(), RecaptchaVerifier());
      } else {
        await FirebaseAuth.instance.verifyPhoneNumber(phoneNumber: phone.text.trim(), verificationCompleted: (credential) async { await FirebaseAuth.instance.signInWithCredential(credential); }, verificationFailed: (e) => throw e, codeSent: (id, _) => verificationId = id, codeAutoRetrievalTimeout: (id) => verificationId = id);
      }
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال رمز التفعيل')));
    } on FirebaseAuthException catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'تعذر إرسال الرمز'))); } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> verifyPhoneCode() async {
    try {
      final credential = kIsWeb ? await webConfirmation?.confirm(code.text.trim()) : await FirebaseAuth.instance.signInWithCredential(PhoneAuthProvider.credential(verificationId: verificationId!, smsCode: code.text.trim()));
      if (credential == null) return;
      await FirebaseFirestore.instance.collection('users').doc(credential.user!.uid).set({'role': 'customer', 'phone': phone.text.trim(), 'display_name': credential.user!.displayName ?? '', 'updated_at': FieldValue.serverTimestamp()}, SetOptions(merge: true));
      if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage()));
    } on FirebaseAuthException catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'رمز غير صحيح'))); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.delivery_dining, size: 70, color: Colors.teal),
      const Text('Syria Delivery', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
      const SizedBox(height: 16),
      TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الهاتف مع مفتاح الدولة', hintText: '+963...')),
      const SizedBox(height: 10),
      Row(children: [Expanded(child: TextField(controller: code, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'رمز التفعيل'))), const SizedBox(width: 8), FilledButton(onPressed: busy ? null : sendPhoneCode, child: const Text('إرسال'))]),
      const SizedBox(height: 10), SizedBox(width: double.infinity, child: FilledButton(onPressed: busy ? null : verifyPhoneCode, child: const Text('دخول برقم الهاتف'))),
      const Divider(height: 30),
      OutlinedButton.icon(onPressed: busy ? null : () => social(GoogleAuthProvider()), icon: const Icon(Icons.g_mobiledata), label: const Text('المتابعة بواسطة Google')),
      OutlinedButton.icon(onPressed: busy ? null : () => social(FacebookAuthProvider()), icon: const Icon(Icons.facebook), label: const Text('المتابعة بواسطة Facebook')),
      TextButton(onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage())), child: const Text('المتابعة كزائر — تصفح وأضف للسلة')),
    ]))));
  }
}
`;

const wallet = `import '../common.dart';

class CustomerWalletPage extends StatelessWidget {
  const CustomerWalletPage({super.key});
  Future<void> _topUp(BuildContext context, String method, String reference) async { try { await FirebaseFunctions.instance.httpsCallable('topUpWallet').call({'method': method, 'reference': reference.trim()}); if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال طلب الشحن للمراجعة'))); } on FirebaseFunctionsException catch (e) { if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'تعذر تنفيذ الشحن'))); } }
  Future<void> _showTopUp(BuildContext context) async { final reference = TextEditingController(); String method = 'voucher'; await showDialog<void>(context: context, builder: (_) => StatefulBuilder(builder: (context, setState) => AlertDialog(title: const Text('شحن المحفظة'), content: Column(mainAxisSize: MainAxisSize.min, children: [DropdownButtonFormField<String>(value: method, decoration: const InputDecoration(labelText: 'طريقة الشحن'), items: const [DropdownMenuItem(value: 'voucher', child: Text('كود شحن')), DropdownMenuItem(value: 'local_transfer', child: Text('تحويل محلي')), DropdownMenuItem(value: 'change_to_wallet', child: Text('الباقي عبر المندوب'))], onChanged: (v) => setState(() => method = v ?? method)), const SizedBox(height: 12), TextField(controller: reference, decoration: const InputDecoration(labelText: 'الكود أو رقم العملية أو الطلب'))]), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')), FilledButton(onPressed: () { Navigator.pop(context); _topUp(context, method, reference.text); }, child: const Text('إرسال'))]))); }
  @override Widget build(BuildContext context) { final uid = FirebaseAuth.instance.currentUser?.uid; if (uid == null) return const Scaffold(body: Center(child: Text('سجّل الدخول لعرض المحفظة'))); final user = FirebaseFirestore.instance.collection('users').doc(uid); final ledger = user.collection('wallet_ledger').orderBy('created_at', descending: true).limit(30); return Scaffold(appBar: AppBar(title: const Text('المحفظة والولاء')), body: StreamBuilder<DocumentSnapshot>(stream: user.snapshots(), builder: (context, snapshot) { final data = snapshot.data?.data() as Map<String, dynamic>? ?? {}; final balance = data['wallet_balance'] ?? 0; final points = data['loyalty_points'] ?? 0; return ListView(padding: const EdgeInsets.all(16), children: [Card(child: Padding(padding: const EdgeInsets.all(22), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Icon(Icons.account_balance_wallet_rounded, size: 34), const SizedBox(height: 10), const Text('الرصيد المتاح'), Text('$balance ل.س', style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)), const SizedBox(height: 14), Row(children: [Expanded(child: Text('نقاط الولاء: $points', style: const TextStyle(fontWeight: FontWeight.bold))), FilledButton.icon(onPressed: () => _showTopUp(context), icon: const Icon(Icons.add), label: const Text('شحن'))])]))), const SizedBox(height: 14), const Text('آخر الحركات', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)), StreamBuilder<QuerySnapshot>(stream: ledger.snapshots(), builder: (context, snapshot) { if (!snapshot.hasData) return const Center(child: CircularProgressIndicator()); if (snapshot.data!.docs.isEmpty) return const Padding(padding: EdgeInsets.all(24), child: Text('لا توجد حركات بعد')); return Column(children: snapshot.data!.docs.map((doc) { final item = doc.data() as Map<String, dynamic>; return ListTile(leading: const Icon(Icons.receipt_long), title: Text(item['label'] ?? 'حركة محفظة'), trailing: Text('\${item['amount'] ?? item['points'] ?? 0} \${item['unit'] ?? 'ل.س'}')); }).toList()); })]); })); }
}

class PaymentChoice { final String method; final num walletAmount; final num loyaltyPoints; final num cashChangeFor; const PaymentChoice(this.method, this.walletAmount, this.loyaltyPoints, this.cashChangeFor); }

Future<PaymentChoice?> showPaymentSheet(BuildContext context, num total, Map<String, dynamic> user) async { String method = 'cash_on_delivery'; num wallet = 0; num points = 0; num cashChange = 0; final balance = num.tryParse('\${user['wallet_balance'] ?? 0}') ?? 0; final loyalty = num.tryParse('\${user['loyalty_points'] ?? 0}') ?? 0; return showModalBottomSheet<PaymentChoice>(context: context, isScrollControlled: true, builder: (context) => StatefulBuilder(builder: (context, setState) => Padding(padding: EdgeInsets.only(left: 18, right: 18, top: 18, bottom: MediaQuery.of(context).viewInsets.bottom + 18), child: Column(mainAxisSize: MainAxisSize.min, children: [Text('اختيار الدفع — $total ل.س', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)), RadioListTile<String>(value: 'cash_on_delivery', groupValue: method, onChanged: (String? v) => setState(() => method = v ?? method), title: const Text('كاش عند الاستلام')), if (method == 'cash_on_delivery') TextField(decoration: const InputDecoration(labelText: 'الفئة النقدية'), keyboardType: TextInputType.number, onChanged: (v) => cashChange = num.tryParse(v) ?? 0), RadioListTile<String>(value: 'wallet', groupValue: method, onChanged: balance >= total ? (String? v) => setState(() { method = v ?? method; wallet = total; }) : null, title: Text('المحفظة — $balance ل.س')), RadioListTile<String>(value: 'hybrid', groupValue: method, onChanged: balance > 0 || loyalty > 0 ? (String? v) => setState(() => method = v ?? method) : null, title: const Text('دفع جزئي + كاش')), if (method == 'hybrid') Row(children: [Expanded(child: TextField(decoration: const InputDecoration(labelText: 'من المحفظة'), keyboardType: TextInputType.number, onChanged: (v) => wallet = num.tryParse(v) ?? 0)), const SizedBox(width: 10), Expanded(child: TextField(decoration: const InputDecoration(labelText: 'نقاط'), keyboardType: TextInputType.number, onChanged: (v) => points = num.tryParse(v) ?? 0))]), const SizedBox(height: 14), SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(context, PaymentChoice(method, wallet, points, cashChange)), child: const Text('متابعة'))])))); }

num walletPointValue(Map<String, dynamic> user) => num.tryParse('\${user['loyalty_point_value'] ?? 0}') ?? 0;
`;

fs.writeFileSync(path.join(root, 'customer_app/lib/screens/products_screen.dart'), products);
fs.writeFileSync(path.join(root, 'customer_app/lib/screens/login_screen.dart'), login);
fs.writeFileSync(path.join(root, 'customer_app/lib/screens/wallet_screen.dart'), wallet);

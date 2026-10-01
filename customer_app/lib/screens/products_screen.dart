import '../common.dart';
import 'address_book_screen.dart';
import 'login_screen.dart';
import 'orders_screen.dart';
import 'wallet_screen.dart';
import '../services/order_outbox.dart';

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
  String? pendingIdempotencyKey;
  num discount = 0;
  num deliveryDiscount = 0; // free-delivery coupons discount the delivery fee, not the items
  num get subtotal => cart.values.fold<num>(0, (sum, item) => sum + (item['price'] ?? 0) * (item['quantity'] ?? 1));

  Future<bool> ensureSignedIn() async {
    if (FirebaseAuth.instance.currentUser != null) return true;
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
    return mounted && FirebaseAuth.instance.currentUser != null;
  }

  Future<void> addProduct(String id, Map<String, dynamic> data) async {
    final modifiers = (data['modifiers'] as List? ?? []).whereType<Map>().toList();
    final selected = <Map<String, dynamic>>[];
    for (final modifier in modifiers) {
      final add = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text('إضافة ${modifier['name'] ?? ''}؟'),
          content: Text('${modifier['price'] ?? 0} ل.س'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('بدون')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('إضافة')),
          ],
        ),
      );
      if (add == true) selected.add(Map<String, dynamic>.from(modifier));
    }
    final key = '$id-${selected.map((m) => m['name']).join('-')}';
    final extra = selected.fold<num>(0, (sum, m) => sum + (m['price'] ?? 0));
    setState(() {
      final existing = cart[key];
      cart[key] = {
        ...data,
        'product_id': id,
        'quantity': (existing?['quantity'] as int? ?? 0) + 1,
        'selected_modifiers': selected,
        'price': (data['price'] as num? ?? 0) + extra,
      };
    });
  }

  Future<void> selectAddress() async {
    if (!await ensureSignedIn()) return;
    final result = await Navigator.push<Map<String, dynamic>>(context, MaterialPageRoute(builder: (_) => const AddressBookPage()));
    if (result != null && mounted) setState(() => address = result);
  }

  Future<void> applyCoupon() async {
    if (!await ensureSignedIn()) return;
    final value = coupon.text.trim().toUpperCase();
    if (value.isEmpty) return;
    // The server decides: coupons are no longer readable from the app, and previewCoupon applies exactly the rules createOrder will apply.
    try {
      final result = await FirebaseFunctions.instanceFor(region: 'europe-west1').httpsCallable('previewCoupon').call({
        'code': value, 'subtotal': subtotal, 'vendor_id': widget.vendorId, 'zone_id': widget.zoneId,
      });
      final data = Map<String, dynamic>.from(result.data as Map);
      if (data['valid'] == true) {
        final amount = (data['discount'] as num?) ?? 0;
        final onDelivery = data['applies_to'] == 'delivery';
        if (mounted) setState(() { couponCode = value; discount = onDelivery ? 0 : amount; deliveryDiscount = onDelivery ? amount : 0; });
        return;
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(
          error.code == 'resource-exhausted' ? 'محاولات كثيرة، حاول بعد قليل' : 'تعذر التحقق من الكوبون، حاول مجددًا',
        )));
      }
      return;
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذر التحقق من الكوبون، تحقق من الاتصال')));
      return;
    }
    if (mounted) {
      setState(() { couponCode = null; discount = 0; deliveryDiscount = 0; });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('الكوبون غير صالح')));
    }
  }

  Future<void> checkout() async {
    if (FirebaseAuth.instance.currentUser == null) {
      await Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginPage()));
      if (!mounted || FirebaseAuth.instance.currentUser == null) return;
    }
    if (address == null) { await selectAddress(); if (address == null) return; }
    final total = (subtotal - discount).clamp(0, double.infinity);
    final uid = FirebaseAuth.instance.currentUser!.uid;
    pendingIdempotencyKey ??= 'order-${DateTime.now().microsecondsSinceEpoch}-$uid';
    final userSnap = await FirebaseFirestore.instance.collection('users').doc(uid).get();
    final choice = await showPaymentSheet(context, total, userSnap.data() ?? {});
    if (choice == null) return;
    final sourceAddress = address!;
    final selectedLocation = sourceAddress['location'] as GeoPoint?;
    if (selectedLocation == null) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('حدد موقع التوصيل من الخريطة أو GPS أولاً')));
      return;
    }
    final selectedAddress = <String, dynamic>{
      for (final key in const ['label', 'building', 'floor', 'apartment', 'landmark'])
        if (sourceAddress[key] != null) key: sourceAddress[key],
      'location': {
      'latitude': selectedLocation.latitude,
      'longitude': selectedLocation.longitude,
      },
    };
    final payload = <String, dynamic>{
        'vendor_id': widget.vendorId, 'zone_id': widget.zoneId, 'items': cart.values.toList(), 'coupon_code': couponCode,
        'delivery_address': selectedAddress, 'payment_method': choice.method, 'wallet_amount': choice.walletAmount,
        'loyalty_points': choice.loyaltyPoints, 'cash_change_for': choice.cashChangeFor, 'idempotency_key': pendingIdempotencyKey,
      };
    try {
      await OrderOutbox.enqueue(payload);
      final submitted = await OrderOutbox.flush(onlyKey: pendingIdempotencyKey);
      if (submitted == null) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذر الاتصال بالخادم. حُفظ الطلب مؤقتًا وسيُعاد إرساله عند عودة الاتصال')));
        return;
      }
      if (mounted) {
        setState(() { cart.clear(); pendingIdempotencyKey = null; });
        Navigator.push(context, MaterialPageRoute(builder: (_) => OrderPage(orderId: submitted.orderId)));
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message ?? 'تعذر إنشاء الطلب')));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذر إنشاء الطلب. تحقق من البيانات والاتصال.')));
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
                if (snapshot.hasError) {
                  return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('تعذر تحميل القائمة الآن. تحقق من الاتصال ثم أعد المحاولة.')));
                }
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                return ListView(children: snapshot.data!.docs.map((doc) {
                  final data = doc.data() as Map<String, dynamic>;
                  final key = cart.keys.firstWhere((k) => k.startsWith('${doc.id}-'), orElse: () => '');
                  final quantity = key.isEmpty ? 0 : (cart[key]!['quantity'] as int? ?? 0);
                  return Card(child: ListTile(
                    title: Text(data['name'] ?? ''), subtitle: Text('${data['price'] ?? 0} ل.س'),
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
              title: Text('${cart.values.fold<int>(0, (s, item) => s + (item['quantity'] as int? ?? 1))} أصناف  •  $subtotal ل.س', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              subtitle: discount + deliveryDiscount > 0 ? Text(deliveryDiscount > 0 ? 'خصم التوصيل: $deliveryDiscount ل.س' : 'الخصم: $discount ل.س', style: const TextStyle(color: Colors.white70)) : null,
              trailing: FilledButton(onPressed: checkout, child: const Text('إتمام الطلب')),
            )),
          ),
        ],
      ),
    );
  }
}

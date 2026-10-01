import '../common.dart';
import '../services/order_outbox.dart';

class OrderPage extends StatefulWidget {
  final String orderId;
  const OrderPage({Key? key, required this.orderId});
  @override
  State<OrderPage> createState() => _OrderPageState();
}

class _OrderPageState extends State<OrderPage> {
  final message = TextEditingController();
  Future<void> cancelOrder() async {
    final reason = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('إلغاء الطلب'),
        content: TextField(
          controller: reason,
          decoration: const InputDecoration(labelText: 'السبب'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('تراجع'),
          ),
          FilledButton(
            onPressed: () async {
              await appFunctions.httpsCallable('cancelOrder').call({
                'order_id': widget.orderId,
                'reason': reason.text.trim(),
              });
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('إلغاء'),
          ),
        ],
      ),
    );
  }

  Future<void> callCourier() async {
    final order = await FirebaseFirestore.instance
        .collection('orders')
        .doc(widget.orderId)
        .get();
    final courierId = order.data()?['courier_id'];
    if (courierId == null) return;
    final courier = await FirebaseFirestore.instance
        .collection('couriers')
        .doc(courierId)
        .get();
    final phone = courier.data()?['phone'];
    if (phone != null)
      await launchUrl(Uri(scheme: 'tel', path: phone.toString()));
  }

  Future<void> shareTracking() async {
    final url = Uri(
      scheme: 'https',
      host: 'track.syria-delivery.local',
      path: '/orders/${widget.orderId}',
    );
    await launchUrl(
      Uri.parse(
        'https://wa.me/?text=${Uri.encodeComponent('رابط تتبع الطلب: $url')}',
      ),
    );
  }

  Future<void> sendMessage() async {
    if (message.text.trim().isEmpty) return;
    await FirebaseFirestore.instance
        .collection('chats')
        .doc(widget.orderId)
        .collection('messages')
        .add({
          'sender_id': FirebaseAuth.instance.currentUser?.uid,
          'sender_role': 'customer',
          'text': message.text.trim(),
          'created_at': FieldValue.serverTimestamp(),
          'read_by': [],
        });
    message.clear();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('تتبع الطلب'),
      actions: [
        IconButton(
          onPressed: shareTracking,
          tooltip: 'مشاركة التتبع',
          icon: const Icon(Icons.share),
        ),
        IconButton(onPressed: callCourier, icon: const Icon(Icons.phone)),
      ],
    ),
    body: Column(
      children: [
        StreamBuilder<DocumentSnapshot>(
          stream: FirebaseFirestore.instance
              .collection('orders')
              .doc(widget.orderId)
              .snapshots(),
          builder: (context, snapshot) {
            final data = snapshot.data?.data() as Map<String, dynamic>?;
            final courierId = data?['courier_id'];
            return Column(
              children: [
                ListTile(
                  title: const Text('الحالة'),
                  subtitle: Text(
                    '${data?['status'] ?? 'pending'}${data?['eta_minutes'] != null ? '\nالوصول المتوقع: ${data?['eta_minutes']} دقيقة' : ''}',
                  ),
                  trailing: data?['status'] == 'pending'
                      ? TextButton(
                          onPressed: cancelOrder,
                          child: const Text('إلغاء'),
                        )
                      : null,
                ),
                if (data?['status'] == 'on_the_way' ||
                    data?['status'] == 'picked_up')
                  FutureBuilder<DocumentSnapshot>(
                    future: FirebaseFirestore.instance
                        .collection('order_secrets')
                        .doc(widget.orderId)
                        .get(),
                    builder: (context, secret) => Card(
                      child: ListTile(
                        leading: const Icon(Icons.verified_user),
                        title: const Text('رمز التسليم الآمن'),
                        subtitle: Text(
                          secret.data?.data() is Map
                              ? ((secret.data!.data() as Map)['otp'] ??
                                    'يتم توليد الرمز آمنًا')
                              : 'رمز التسليم خاص بك؛ اعرضه للمندوب عند الوصول',
                        ),
                      ),
                    ),
                  ),
                if (courierId != null)
                  FutureBuilder<DocumentSnapshot>(
                    future: FirebaseFirestore.instance
                        .collection('couriers')
                        .doc(courierId)
                        .get(),
                    builder: (context, courier) {
                      final c =
                          courier.data?.data() as Map<String, dynamic>? ?? {};
                      return Card(
                        child: ListTile(
                          leading: c['photo_url'] != null
                              ? CircleAvatar(
                                  backgroundImage: NetworkImage(
                                    c['photo_url'].toString(),
                                  ),
                                )
                              : const CircleAvatar(child: Icon(Icons.person)),
                          title: Text(c['name'] ?? 'المندوب'),
                          subtitle: Text(
                            '${c['vehicle_type'] ?? 'مركبة'} — لوحة: ${c['vehicle_plate'] ?? 'غير مسجلة'}\n${c['phone'] ?? ''}',
                          ),
                        ),
                      );
                    },
                  ),
              ],
            );
          },
        ),
        SizedBox(
          height: 180,
          child: StreamBuilder<DocumentSnapshot>(
            stream: FirebaseFirestore.instance
                .collection('tracking')
                .doc(widget.orderId)
                .snapshots(),
            builder: (context, snapshot) {
              final data = snapshot.data?.data() as Map<String, dynamic>?;
              final point = data?['location'] as GeoPoint?;
              return FlutterMap(
                options: MapOptions(
                  initialCenter: LatLng(
                    point?.latitude ?? 33.51,
                    point?.longitude ?? 36.27,
                  ),
                  initialZoom: 13,
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  ),
                  if (point != null)
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: LatLng(point.latitude, point.longitude),
                          child: const Icon(
                            Icons.location_on,
                            color: Colors.red,
                            size: 36,
                          ),
                        ),
                      ],
                    ),
                ],
              );
            },
          ),
        ),
        Expanded(
          child: StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance
                .collection('chats')
                .doc(widget.orderId)
                .collection('messages')
                .orderBy('created_at')
                .snapshots(),
            builder: (context, snapshot) => ListView(
              children: (snapshot.data?.docs ?? [])
                  .map(
                    (d) => ListTile(
                      title: Text(
                        (d.data() as Map<String, dynamic>)['text'] ?? '',
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: message,
                decoration: const InputDecoration(hintText: 'رسالة للمندوب'),
              ),
            ),
            IconButton(onPressed: sendMessage, icon: const Icon(Icons.send)),
          ],
        ),
      ],
    ),
  );
}

class OrdersHistoryPage extends StatelessWidget {
  const OrdersHistoryPage({super.key});

  Future<void> reorder(BuildContext context, DocumentSnapshot source) async {
    final data = source.data() as Map<String, dynamic>? ?? {};
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || data['vendor_id'] == null) return;
    await OrderOutbox.enqueue({
      'vendor_id': data['vendor_id'],
      'zone_id': data['zone_id'],
      'items': data['items'],
      'coupon_code': data['coupon_code'],
      'delivery_address': data['delivery_address'],
      'idempotency_key': 'reorder-${DateTime.now().microsecondsSinceEpoch}-${user.uid}',
    });
    final result = await OrderOutbox.flush();
    if (result == null) throw StateError('تم حفظ إعادة الطلب محليًا');
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تمت إعادة الطلب بنجاح')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي')),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('orders')
            .where('customer_id', isEqualTo: uid)
            .snapshots(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final docs = snapshot.data!.docs;
          if (docs.isEmpty) {
            return const Center(child: Text('لا توجد طلبات سابقة'));
          }
          return ListView(
            children: docs.map((order) {
              final data = order.data() as Map<String, dynamic>;
              final shortId = order.id.length > 6
                  ? order.id.substring(0, 6)
                  : order.id;
              return Card(
                child: ListTile(
                  title: Text('طلب #$shortId — ${data['total'] ?? 0} ل.س'),
                  subtitle: Text('الحالة: ${data['status'] ?? 'pending'}'),
                  trailing: TextButton(
                    onPressed: () => reorder(context, order),
                    child: const Text('إعادة الطلب'),
                  ),
                ),
              );
            }).toList(),
          );
        },
      ),
    );
  }
}

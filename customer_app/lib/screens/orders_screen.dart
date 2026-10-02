import '../common.dart';
import '../services/order_outbox.dart';

class BlockedOutboxPage extends StatefulWidget {
  const BlockedOutboxPage({super.key});
  @override
  State<BlockedOutboxPage> createState() => _BlockedOutboxPageState();
}

class _BlockedOutboxPageState extends State<BlockedOutboxPage> {
  late Future<List<Map<String, dynamic>>> _items;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() => _items = OrderOutbox.blockedItems();

  Future<void> _retry(String key) async {
    await OrderOutbox.retryBlocked(key);
    try {
      final result = await OrderOutbox.flush(onlyKey: key);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result == null ? 'تعذر إرسال الطلب الآن' : 'تم إرسال الطلب بنجاح')));
    } on FirebaseFunctionsException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message ?? 'لا يزال الطلب غير صالح للإرسال')));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذر إعادة المحاولة، سيبقى الطلب محفوظًا')));
    }
    if (mounted) setState(_reload);
  }

  Future<void> _remove(String key) async {
    await OrderOutbox.remove(key);
    if (mounted) setState(_reload);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('طلبات تحتاج مراجعة')),
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: _items,
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final items = snapshot.data!;
        if (items.isEmpty) return const Center(child: Text('لا توجد طلبات محظورة'));
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: items.length,
          itemBuilder: (context, index) {
            final item = items[index];
            final key = '${item['idempotency_key'] ?? ''}';
            final payload = item['payload'] is Map ? Map<String, dynamic>.from(item['payload'] as Map) : <String, dynamic>{};
            return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('طلب محفوظ — متجر ${payload['vendor_id'] ?? 'غير معروف'}', style: const TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text('${item['last_error'] ?? 'تعذر إرسال الطلب'}', style: TextStyle(color: Colors.red.shade700)),
              const SizedBox(height: 10),
              Row(children: [
                FilledButton.icon(onPressed: key.isEmpty ? null : () => _retry(key), icon: const Icon(Icons.refresh), label: const Text('إعادة المحاولة')),
                const SizedBox(width: 8),
                OutlinedButton.icon(onPressed: key.isEmpty ? null : () => _remove(key), icon: const Icon(Icons.delete_outline), label: const Text('حذف')),
              ]),
            ])));
          },
        );
      },
    ),
  );
}

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
                if (data?['status'] == 'delivered')
                  RatingEditor(
                    orderId: widget.orderId,
                    vendorId: '${data?['vendor_id'] ?? ''}',
                    courierId: data?['courier_id']?.toString(),
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
              final rawUpdatedAt = data?['updated_at'];
              final updatedAt = rawUpdatedAt is Timestamp
                  ? rawUpdatedAt.toDate()
                  : rawUpdatedAt is DateTime
                      ? rawUpdatedAt
                      : null;
              final ageMinutes = updatedAt == null
                  ? null
                  : DateTime.now().difference(updatedAt).inMinutes;
              final isStale = ageMinutes != null && ageMinutes >= 8;
              return Column(
                children: [
                  if (point != null)
                    ListTile(
                      dense: true,
                      leading: Icon(
                        isStale ? Icons.warning_amber_rounded : Icons.gps_fixed,
                        color: isStale ? Colors.orange.shade800 : Colors.teal,
                      ),
                      title: Text(
                        isStale
                            ? 'آخر موقع معروف — قديم نسبيًا'
                            : 'تتبع السائق مباشرًا',
                      ),
                      subtitle: Text(
                        ageMinutes == null
                            ? 'جارٍ استلام موقع السائق…'
                            : ageMinutes == 0
                                ? 'تم التحديث الآن'
                                : 'آخر تحديث منذ $ageMinutes دقيقة',
                      ),
                    ),
                  Expanded(
                    child: FlutterMap(
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
                    ),
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
      appBar: AppBar(
        title: const Text('طلباتي'),
        actions: [
          IconButton(
            tooltip: 'طلبات تحتاج مراجعة',
            icon: const Icon(Icons.cloud_off),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BlockedOutboxPage())),
          ),
        ],
      ),
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


class RatingEditor extends StatefulWidget {
  final String orderId;
  final String vendorId;
  final String? courierId;
  const RatingEditor({super.key, required this.orderId, required this.vendorId, this.courierId});
  @override State<RatingEditor> createState() => _RatingEditorState();
}

class _RatingEditorState extends State<RatingEditor> {
  int vendorRating = 0;
  int courierRating = 0;
  bool loading = true;
  bool saving = false;
  final comment = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final snapshot = await FirebaseFirestore.instance.collection('ratings').doc(widget.orderId).get();
      final data = snapshot.data() as Map<String, dynamic>?;
      if (!mounted) return;
      setState(() {
        vendorRating = (data?['vendor_rating'] as num?)?.toInt() ?? 0;
        courierRating = (data?['courier_rating'] as num?)?.toInt() ?? 0;
        comment.text = '${data?['comment'] ?? ''}';
        loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  Widget _stars(String label, int value, ValueChanged<int> onChanged) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(children: [
          SizedBox(width: 105, child: Text(label)),
          ...List.generate(5, (index) => IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: () => onChanged(index + 1),
                icon: Icon(index < value ? Icons.star : Icons.star_border, color: Colors.amber.shade700),
              )),
        ]),
      );

  Future<void> _save() async {
    if (vendorRating == 0 || saving) return;
    setState(() => saving = true);
    try {
      await appFunctions.httpsCallable('submitRating').call({
        'order_id': widget.orderId,
        'vendor_rating': vendorRating,
        if (widget.courierId != null && courierRating > 0) 'courier_rating': courierRating,
        'comment': comment.text.trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم حفظ التقييم، شكرًا لملاحظتك')));
    } on FirebaseFunctionsException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message ?? 'تعذر حفظ التقييم')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Card(child: Padding(padding: EdgeInsets.all(14), child: LinearProgressIndicator()));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(vendorRating == 0 ? 'قيّم تجربتك' : 'تعديل التقييم', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
          _stars('المتجر', vendorRating, (value) => setState(() => vendorRating = value)),
          if (widget.courierId != null) _stars('السائق', courierRating, (value) => setState(() => courierRating = value)),
          TextField(controller: comment, maxLength: 500, decoration: const InputDecoration(labelText: 'ملاحظة اختيارية')),
          Align(alignment: AlignmentDirectional.centerEnd, child: FilledButton(onPressed: vendorRating == 0 || saving ? null : _save, child: Text(saving ? 'جارٍ الحفظ…' : 'حفظ التقييم'))),
        ]),
      ),
    );
  }

  @override
  void dispose() {
    comment.dispose();
    super.dispose();
  }
}

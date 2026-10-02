import 'dart:async';

import 'package:flutter/services.dart';

import '../common.dart';
import 'login_screen.dart';

class MerchantHome extends StatefulWidget {
  final String vendorId;
  final String role;
  const MerchantHome({Key? key, required this.vendorId, required this.role});
  @override
  State<MerchantHome> createState() => _MerchantHomeState();
}

class _MerchantHomeState extends State<MerchantHome> {
  int tab = 0;
  Timer? orderAlertTimer;
  Timer? kdsClock;
  bool alerting = false;
  DateTime kdsNow = DateTime.now();
  Stream<QuerySnapshot> get products => FirebaseFirestore.instance
      .collection('vendors')
      .doc(widget.vendorId)
      .collection('products')
      .snapshots();
  Stream<QuerySnapshot> get orders => FirebaseFirestore.instance
      .collection('orders')
      .where('vendor_id', isEqualTo: widget.vendorId)
      .orderBy('created_at', descending: true)
      .limit(50)
      .snapshots();
  Future<void> toggleBusy(bool busy) => FirebaseFirestore.instance
      .collection('vendors')
      .doc(widget.vendorId)
      .update({'is_busy': busy, 'updated_at': FieldValue.serverTimestamp()});

  @override
  void initState() {
    super.initState();
    kdsClock = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() => kdsNow = DateTime.now());
    });
  }

  Future<void> shiftAction() async {
    final activeRef = FirebaseFirestore.instance
        .collection('active_shifts')
        .doc('vendor_${widget.vendorId}');
    final active = await activeRef.get();
    final amount = TextEditingController();
    final isOpen = active.exists && active.data()?['shift_id'] != null;
    final value = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(isOpen ? 'إغلاق الوردية' : 'فتح وردية'),
        content: TextField(
          controller: amount,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: isOpen ? 'النقد الفعلي في الصندوق' : 'الرصيد الافتتاحي',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(context, amount.text.trim()), child: const Text('تأكيد')),
        ],
      ),
    );
    if (value == null || value.isEmpty) return;
    final callable = appFunctions.httpsCallable(isOpen ? 'closeShift' : 'openShift');
    await callable.call(isOpen
        ? {'shift_id': active.data()?['shift_id'], 'counted_cash': num.tryParse(value) ?? -1}
        : {'owner_type': 'vendor', 'owner_id': widget.vendorId, 'opening_cash': num.tryParse(value) ?? -1});
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(isOpen ? 'تم إغلاق الوردية وإرسالها للتسوية' : 'تم فتح الوردية')));
  }
  Future<void> updateOrder(
    String id,
    String status, {
    int? prepMinutes,
    String? reason,
  }) async {
    await appFunctions.httpsCallable('transitionOrderStatus').call({
      'order_id': id,
      'status': status,
      'reason': reason ?? '',
      if (prepMinutes != null) 'prep_minutes': prepMinutes,
    });
  }
  @override
  void dispose() {
    orderAlertTimer?.cancel();
    kdsClock?.cancel();
    super.dispose();
  }

  void syncOrderAlert(bool hasPending) {
    if (hasPending && !alerting) {
      alerting = true;
      SystemSound.play(SystemSoundType.alert);
      orderAlertTimer = Timer.periodic(
        const Duration(seconds: 4),
        (_) => SystemSound.play(SystemSoundType.alert),
      );
    } else if (!hasPending && alerting) {
      alerting = false;
      orderAlertTimer?.cancel();
      orderAlertTimer = null;
    }
  }

  Future<void> cancelOrder(String id) async {
    final reason = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('سبب الإلغاء'),
        content: TextField(
          controller: reason,
          decoration: const InputDecoration(hintText: 'الصنف غير متوفر مثلًا'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('تراجع'),
          ),
          FilledButton(
            onPressed: () async {
              await updateOrder(id, 'cancelled', reason: reason.text.trim());
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('تأكيد الإلغاء'),
          ),
        ],
      ),
    );
  }

  Future<void> editHours() async {
    final open = TextEditingController(text: '09:00'),
        close = TextEditingController(text: '23:00');
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('جدول العمل اليومي'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: open,
              decoration: const InputDecoration(labelText: 'وقت الفتح HH:MM'),
            ),
            TextField(
              controller: close,
              decoration: const InputDecoration(labelText: 'وقت الإغلاق HH:MM'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () async {
              await FirebaseFirestore.instance
                  .collection('vendors')
                  .doc(widget.vendorId)
                  .update({
                    'opening_hours': {
                      'open': open.text.trim(),
                      'close': close.text.trim(),
                    },
                    'updated_at': FieldValue.serverTimestamp(),
                  });
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('حفظ'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [_kds(), _menu(), _reports()];
    return Scaffold(
      appBar: AppBar(
        title: StreamBuilder<DocumentSnapshot>(
          stream: FirebaseFirestore.instance
              .collection('vendors')
              .doc(widget.vendorId)
              .snapshots(),
          builder: (c, s) {
            final data = s.data?.data() as Map<String, dynamic>? ?? {};
            return Text(
              merchantIsOpen(data)
                  ? 'إدارة المتجر'
                  : 'إدارة المتجر — مغلق حاليًا',
            );
          },
        ),
        actions: [
          IconButton(onPressed: shiftAction, tooltip: 'الوردية والتسوية', icon: const Icon(Icons.point_of_sale)),
          IconButton(
            onPressed: editHours,
            tooltip: 'جدول العمل',
            icon: const Icon(Icons.schedule),
          ),
          StreamBuilder<DocumentSnapshot>(
            stream: FirebaseFirestore.instance
                .collection('vendors')
                .doc(widget.vendorId)
                .snapshots(),
            builder: (c, s) {
              final busy =
                  (s.data?.data() as Map<String, dynamic>?)?['is_busy'] == true;
              return Row(
                children: [
                  const Text('مشغول'),
                  Switch(value: !busy, onChanged: (v) => toggleBusy(!v)),
                ],
              );
            },
          ),
          IconButton(
            onPressed: () async {
              await FirebaseAuth.instance.signOut();
              if (context.mounted)
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => const LoginPage()),
                  (_) => false,
                );
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: pages[tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() => tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.receipt_long),
                  label: 'شاشة المطبخ',
          ),
          NavigationDestination(icon: Icon(Icons.menu_book), label: 'القائمة'),
          NavigationDestination(icon: Icon(Icons.analytics), label: 'التقارير'),
        ],
      ),
    );
  }

  DateTime _orderClock(Map<String, dynamic> data) {
    final stamp = data['prep_started_at'] ?? data['created_at'];
    if (stamp is Timestamp) return stamp.toDate();
    return kdsNow;
  }

  String _ageLabel(Map<String, dynamic> data) {
    final minutes = kdsNow.difference(_orderClock(data)).inMinutes.clamp(0, 999);
    return minutes == 0 ? 'الآن' : 'منذ $minutes د';
  }

  Color _ageColor(Map<String, dynamic> data) {
    final limit = (data['prep_minutes'] as num?)?.toInt() ?? 20;
    final elapsed = kdsNow.difference(_orderClock(data)).inMinutes;
    if (elapsed > limit) return Colors.red;
    if (elapsed >= (limit * 0.75).round()) return Colors.orange;
    return Colors.green;
  }

  Widget _kdsCard(QueryDocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final items = (data['items'] as List? ?? []).whereType<Map>().toList();
    final status = data['status'] ?? 'pending';
    final color = _ageColor(data);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: Text('#${doc.id.substring(0, 6)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18))), Text(_ageLabel(data), style: TextStyle(color: color, fontWeight: FontWeight.bold))]),
          const Divider(),
          ...items.map((item) => Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Text('${item['quantity'] ?? 1} × ${item['name'] ?? 'صنف'}', style: const TextStyle(fontSize: 16)))),
          if ((data['notes'] ?? '').toString().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('ملاحظة: ${data['notes']}', style: const TextStyle(color: Colors.deepOrange))),
          const SizedBox(height: 8),
          Row(children: [Text('${data['total'] ?? 0} ل.س'), const Spacer(), if (status == 'pending') FilledButton(onPressed: () => updateOrder(doc.id, 'preparing', prepMinutes: (data['prep_minutes'] as num?)?.toInt() ?? 20), child: const Text('قبول وتحضير')), if (status == 'preparing') FilledButton(onPressed: () => updateOrder(doc.id, 'ready_for_pickup'), child: const Text('جاهز للاستلام'))]),
        ]),
      ),
    );
  }

  Widget _kdsColumn(String title, List<QueryDocumentSnapshot> docs, Color color) => Expanded(child: Container(margin: const EdgeInsets.all(6), padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: color.withOpacity(0.08), borderRadius: BorderRadius.circular(14)), child: Column(children: [Row(children: [Expanded(child: Text(title, style: TextStyle(fontWeight: FontWeight.bold, color: color))), CircleAvatar(radius: 12, child: Text('${docs.length}'))]), const SizedBox(height: 8), Expanded(child: ListView(children: docs.map(_kdsCard).toList()))])));

  Widget _kds() => StreamBuilder<QuerySnapshot>(
    stream: orders,
    builder: (c, s) {
      if (!s.hasData) return const Center(child: CircularProgressIndicator());
      final docs = s.data!.docs.where((d) => ['pending', 'preparing', 'ready_for_pickup', 'picked_up'].contains((d.data() as Map<String, dynamic>)['status'])).toList();
      syncOrderAlert(docs.any((d) => (d.data() as Map<String, dynamic>)['status'] == 'pending'));
      final columns = <String, List<QueryDocumentSnapshot>>{for (final status in ['pending', 'preparing', 'ready_for_pickup', 'picked_up']) status: []};
      for (final doc in docs) columns[(doc.data() as Map<String, dynamic>)['status'] ?? 'pending']!.add(doc);
      return LayoutBuilder(builder: (context, constraints) => SingleChildScrollView(scrollDirection: Axis.horizontal, child: SizedBox(width: constraints.maxWidth < 1000 ? 1000 : constraints.maxWidth, child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [_kdsColumn('جديد', columns['pending']!, Colors.blue), _kdsColumn('قيد التحضير', columns['preparing']!, Colors.orange), _kdsColumn('جاهز', columns['ready_for_pickup']!, Colors.green), _kdsColumn('تم الاستلام', columns['picked_up']!, Colors.grey)]))));
    },
  );

  Widget _orders() => StreamBuilder<QuerySnapshot>(
    stream: orders,
    builder: (c, s) {
      if (!s.hasData) return const Center(child: CircularProgressIndicator());
      final docs = s.data!.docs;
      syncOrderAlert(
        docs.any(
          (d) => (d.data() as Map<String, dynamic>)['status'] == 'pending',
        ),
      );
      if (docs.isEmpty) return const Center(child: Text('لا توجد طلبات'));
      return ListView(
        children: docs.map((d) {
          final x = d.data() as Map<String, dynamic>;
          final status = x['status'] ?? 'pending';
          return Card(
            child: ListTile(
              title: Text(
                'طلب #${d.id.substring(0, 6)} — ${x['total'] ?? 0} ل.س',
              ),
              subtitle: Text(
                'الحالة: $status\nالدفع: ${x['payment_method'] ?? 'cash_on_delivery'}',
              ),
              isThreeLine: true,
              trailing: status == 'pending'
                  ? Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          onPressed: () => cancelOrder(d.id),
                          icon: const Icon(Icons.cancel, color: Colors.red),
                        ),
                        PopupMenuButton<String>(
                          onSelected: (v) => updateOrder(
                            d.id,
                            v,
                            prepMinutes: v == 'preparing' ? 20 : null,
                          ),
                          itemBuilder: (_) => const [
                            PopupMenuItem(
                              value: 'preparing',
                              child: Text('قبول — تحضير 20 دقيقة'),
                            ),
                          ],
                        ),
                      ],
                    )
                  : status == 'preparing'
                  ? TextButton(
                      onPressed: () => updateOrder(d.id, 'ready_for_pickup'),
                      child: const Text('جاهز'),
                    )
                  : null,
            ),
          );
        }).toList(),
      );
    },
  );
  Widget _menu() => StreamBuilder<QuerySnapshot>(
    stream: products,
    builder: (c, s) {
      if (!s.hasData) return const Center(child: CircularProgressIndicator());
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton.icon(
              onPressed: () => editProduct(context),
              icon: const Icon(Icons.add),
              label: const Text('إضافة صنف'),
            ),
          ),
          ...s.data!.docs.map((d) {
            final x = d.data() as Map<String, dynamic>;
            final modifiers = (x['modifiers'] as List? ?? []).length;
            return Card(
              child: ListTile(
                leading: (x['image_url'] ?? '').toString().isEmpty
                    ? const Icon(Icons.fastfood)
                    : Image.network(
                        x['image_url'],
                        width: 48,
                        height: 48,
                        errorBuilder: (context, error, stackTrace) =>
                            const Icon(Icons.fastfood),
                      ),
                title: Text(x['name'] ?? ''),
                subtitle: Text(
                  '${x['category'] ?? 'عام'} — ${x['price'] ?? 0} ل.س — $modifiers خيارات',
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.edit),
                      onPressed: () =>
                          editProduct(context, ref: d.reference, data: x),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, color: Colors.red),
                      onPressed: () => d.reference.delete(),
                    ),
                    Switch(
                      value: x['is_available'] != false,
                      onChanged: (v) => d.reference.update({
                        'is_available': v,
                        'updated_at': FieldValue.serverTimestamp(),
                      }),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      );
    },
  );
  Future<void> editProduct(
    BuildContext context, {
    DocumentReference? ref,
    Map<String, dynamic>? data,
  }) async {
    final name = TextEditingController(text: data?['name'] ?? ''),
        category = TextEditingController(text: data?['category'] ?? 'عام'),
        image = TextEditingController(text: data?['image_url'] ?? ''),
        price = TextEditingController(text: '${data?['price'] ?? ''}'),
        modifiers = TextEditingController(
          text: ((data?['modifiers'] as List? ?? [])
              .map(
                (m) =>
                    '${m['name'] ?? ''}:${m['price'] ?? 0}:${m['mode'] ?? 'single'}:${m['required'] == true ? 'required' : 'optional'}',
              )
              .join('\n')),
        );
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(ref == null ? 'صنف جديد' : 'تعديل الصنف'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                decoration: const InputDecoration(labelText: 'الاسم'),
              ),
              TextField(
                controller: category,
                decoration: const InputDecoration(labelText: 'القسم'),
              ),
              TextField(
                controller: image,
                decoration: const InputDecoration(labelText: 'رابط الصورة'),
              ),
              TextField(
                controller: price,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'السعر'),
              ),
              TextField(
                controller: modifiers,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText:
                      'إضافات: الاسم:السعر:single|multiple:required|optional',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () async {
              final parsed = modifiers.text
                  .split('\n')
                  .map((line) {
                    final p = line.split(':');
                    return {
                      'name': p.first.trim(),
                      'price': p.length > 1
                          ? num.tryParse(p[1].trim()) ?? 0
                          : 0,
                      'mode':
                          p.length > 2 &&
                              ['single', 'multiple'].contains(p[2].trim())
                          ? p[2].trim()
                          : 'single',
                      'required': p.length > 3 && p[3].trim() == 'required',
                    };
                  })
                  .where((m) => (m['name'] as String).isNotEmpty)
                  .toList();
              final payload = {
                'name': name.text.trim(),
                'category': category.text.trim(),
                'image_url': image.text.trim(),
                'price': num.tryParse(price.text) ?? 0,
                'modifiers': parsed,
                'is_available': data?['is_available'] != false,
                'updated_at': FieldValue.serverTimestamp(),
              };
              if (ref == null)
                await FirebaseFirestore.instance
                    .collection('vendors')
                    .doc(widget.vendorId)
                    .collection('products')
                    .add({
                      ...payload,
                      'created_at': FieldValue.serverTimestamp(),
                    });
              else
                await ref.update(payload);
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('حفظ'),
          ),
        ],
      ),
    );
  }

  String _reportDate() {
    final now = DateTime.now();
    return '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  Future<Map<String, dynamic>> _loadReports() async {
    final result = await appFunctions.httpsCallable('getMerchantReports').call({
      'vendor_id': widget.vendorId,
      'date': _reportDate(),
    });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Widget _reportMetric(String title, Object? value, {String suffix = ' ل.س'}) => Card(
        child: ListTile(
          title: Text(title),
          trailing: Text('$value$suffix', style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
      );

  Widget _ratingSummary() => FutureBuilder<Map<String, dynamic>>(
        future: appFunctions.httpsCallable('getVendorRatings').call({'vendor_id': widget.vendorId}).then((result) => Map<String, dynamic>.from(result.data as Map)),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Card(child: Padding(padding: EdgeInsets.all(14), child: LinearProgressIndicator()));
          }
          if (snapshot.hasError) {
            return const Card(child: ListTile(title: Text('تعذر تحميل تقييمات العملاء'), subtitle: Text('تحقق من الاتصال ثم أعد فتح التقرير.')));
          }
          final data = snapshot.data ?? <String, dynamic>{};
          final ratings = (data['ratings'] as List? ?? []).whereType<Map>().toList();
          final average = (data['average'] as num?)?.toDouble() ?? 0;
          final count = (data['count'] as num?)?.toInt() ?? 0;
          return Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('تقييمات العملاء', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Row(children: [Icon(Icons.star, color: Colors.amber.shade700), const SizedBox(width: 6), Text('${average.toStringAsFixed(1)} / 5 — $count تقييم')]),
            ...ratings.take(3).map((item) => ListTile(contentPadding: EdgeInsets.zero, dense: true, title: Text('المتجر: ${item['vendor_rating'] ?? 0} نجوم'), subtitle: Text('${item['comment'] ?? 'بدون ملاحظة'}'))),
          ])));
        },
      );

  Widget _reports() => FutureBuilder<Map<String, dynamic>>(
        future: _loadReports(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('تعذر تحميل تقرير اليوم. تحقق من الاتصال ثم أعد المحاولة.', textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: () => setState(() {}), child: const Text('إعادة المحاولة')),
                  ],
                ),
              ),
            );
          }
          final data = snapshot.data ?? <String, dynamic>{};
          final settlement = Map<String, dynamic>.from(data['settlement'] as Map? ?? {});
          final products = (data['top_products'] as List? ?? []).whereType<Map>().toList();
          return RefreshIndicator(
            onRefresh: () async => setState(() {}),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                Text('تقرير ${data['date'] ?? _reportDate()}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                _ratingSummary(),
                Text('${data['orders_count'] ?? 0} طلبًا مُسلّمًا اليوم', style: TextStyle(color: Colors.blueGrey.shade700)),
                const SizedBox(height: 12),
                _reportMetric('إجمالي المبيعات', data['gross_sales'] ?? 0),
                _reportMetric('صافي المتجر بعد العمولة', data['vendor_net'] ?? 0),
                _reportMetric('عمولة المنصة', data['platform_commission'] ?? 0),
                _reportMetric('النقد المحصل للمتجر', data['cash_collected'] ?? 0),
                const SizedBox(height: 18),
                const Text('أكثر المنتجات مبيعًا', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                if (products.isEmpty) const Card(child: ListTile(title: Text('لا توجد مبيعات مُسلّمة لهذا اليوم'))),
                ...products.asMap().entries.map((entry) {
                  final item = Map<String, dynamic>.from(entry.value);
                  return Card(
                    child: ListTile(
                      leading: CircleAvatar(child: Text('${entry.key + 1}')),
                      title: Text('${item['name'] ?? 'صنف'}'),
                      subtitle: Text('${item['quantity'] ?? 0} وحدة'),
                      trailing: Text('${item['revenue'] ?? 0} ل.س'),
                    ),
                  );
                }),
                const SizedBox(height: 18),
                const Text('التسوية المالية', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                _reportMetric('المتوقع في الصندوق', settlement['expected_cash'] ?? 0),
                _reportMetric('المعدود فعليًا', settlement['counted_cash'] ?? 0),
                _reportMetric('الفرق', settlement['variance'] ?? 0),
                Card(
                  child: ListTile(
                    title: const Text('حالة التسويات'),
                    subtitle: Text('معتمدة: ${settlement['approved'] ?? 0}  •  بانتظار الاعتماد: ${settlement['pending'] ?? 0}'),
                    trailing: Text('ورديات اليوم: ${settlement['shifts_count'] ?? 0}'),
                  ),
                ),
              ],
            ),
          );
        },
      );

}

import 'dart:async';

import 'package:flutter/services.dart';

import '../common.dart';
import 'wallet_screen.dart';

class CourierGate extends StatelessWidget {
  const CourierGate({Key? key});
  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('couriers')
          .doc(uid)
          .snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data() as Map<String, dynamic>?;
        if (data?['zone_id'] == null || data?['zone_id'] == '')
          return const ZoneSetup();
        return const CourierHome();
      },
    );
  }
}

class ZoneSetup extends StatelessWidget {
  const ZoneSetup({Key? key});
  Future<void> saveZone(String zoneId) async {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    await FirebaseFirestore.instance.collection('couriers').doc(uid).set({
      'name': FirebaseAuth.instance.currentUser?.email ?? 'مندوب',
      'zone_id': zoneId,
      'is_available': true,
      'updated_at': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('اختيار منطقة التوصيل')),
    body: StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('zones')
          .where('is_active', isEqualTo: true)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData)
          return const Center(child: CircularProgressIndicator());
        if (snapshot.data!.docs.isEmpty)
          return const Center(child: Text('لا توجد مناطق مفعلة بعد'));
        return ListView(
          children: snapshot.data!.docs.map((doc) {
            final data = doc.data() as Map<String, dynamic>;
            return ListTile(
              title: Text(data['name'] ?? doc.id),
              trailing: const Icon(Icons.chevron_left),
              onTap: () async {
                await saveZone(doc.id);
              },
            );
          }).toList(),
        );
      },
    ),
  );
}

class CourierHome extends StatefulWidget {
  const CourierHome({Key? key});
  @override
  State<CourierHome> createState() => _CourierHomeState();
}

class _CourierHomeState extends State<CourierHome> {
  Timer? timer;
  Position? position;
  @override
  void initState() {
    super.initState();
    startLocation();
  }

  @override
  void dispose() {
    timer?.cancel();
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      FirebaseFirestore.instance.collection('couriers').doc(uid).set({'is_available': false, 'updated_at': FieldValue.serverTimestamp()}, SetOptions(merge: true));
    }
    super.dispose();
  }

  Future<void> startLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) return;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied)
      permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('يلزم السماح بالموقع لتحديث الطلبات')),
        );
      }
      return;
    }
    await sendLocation();
    timer = Timer.periodic(const Duration(minutes: 2), (_) => sendLocation());
  }

  Future<void> sendLocation() async {
    try {
      final current = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.low,
        ),
      );
      if (!mounted) return;
      setState(() => position = current);
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid != null)
        await FirebaseFirestore.instance.collection('couriers').doc(uid).set({
          'current_location': GeoPoint(current.latitude, current.longitude),
          'last_location_at': FieldValue.serverTimestamp(),
          'updated_at': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      if (uid != null) {
        final active = await FirebaseFirestore.instance
            .collection('orders')
            .where('courier_id', isEqualTo: uid)
            .where(
              'status',
              whereIn: ['preparing', 'ready_for_pickup', 'picked_up', 'on_the_way'],
            )
            .get();
        for (final order in active.docs) {
          await FirebaseFirestore.instance
              .collection('tracking')
              .doc(order.id)
              .set({
                'order_id': order.id,
                'courier_id': uid,
                'location': GeoPoint(current.latitude, current.longitude),
                'accuracy': current.accuracy,
                'updated_at': FieldValue.serverTimestamp(),
              }, SetOptions(merge: true));
        }
      }
    } on Exception catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر تحديث الموقع: $error')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final orders = FirebaseFirestore.instance
        .collection('orders')
        .where('courier_id', isEqualTo: uid)
        .where(
          'status',
          whereIn: [
            'pending',
            'preparing',
            'ready_for_pickup',
            'picked_up',
            'on_the_way',
          ],
        )
        .snapshots();
    return Scaffold(
      appBar: AppBar(title: const Text('طلبات التوصيل')),
      body: Column(
        children: [
          SizedBox(
            height: 220,
            child: FlutterMap(
              options: MapOptions(
                initialCenter: LatLng(
                  position?.latitude ?? 33.51,
                  position?.longitude ?? 36.27,
                ),
                initialZoom: 13,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                ),
                if (position != null)
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: LatLng(position!.latitude, position!.longitude),
                        child: const Icon(
                          Icons.two_wheeler,
                          color: Colors.indigo,
                          size: 36,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          WalletSummary(uid: uid),
          PendingOrders(uid: uid),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: orders,
              builder: (context, snapshot) {
                if (!snapshot.hasData)
                  return const Center(child: CircularProgressIndicator());
                if (snapshot.data!.docs.isEmpty)
                  return const Center(child: Text('لا توجد طلبات مسندة'));
                return ListView(
                  children: snapshot.data!.docs
                      .where((d) {
                        final status =
                            (d.data() as Map<String, dynamic>)['status'];
                        return [
                          'preparing',
                          'ready_for_pickup',
                          'picked_up',
                          'on_the_way',
                        ].contains(status);
                      })
                      .map(
                        (d) => OrderTile(
                          id: d.id,
                          data: d.data() as Map<String, dynamic>,
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class PendingOrders extends StatefulWidget {
  final String? uid;
  const PendingOrders({Key? key, required this.uid});
  @override
  State<PendingOrders> createState() => _PendingOrdersState();
}

class _PendingOrdersState extends State<PendingOrders> {
  Timer? alertTimer;
  @override
  void dispose() {
    alertTimer?.cancel();
    super.dispose();
  }

  void syncAlert(bool hasOrders) {
    if (hasOrders && alertTimer == null) {
      SystemSound.play(SystemSoundType.alert);
      alertTimer = Timer.periodic(
        const Duration(seconds: 4),
        (_) => SystemSound.play(SystemSoundType.alert),
      );
    }
    if (!hasOrders && alertTimer != null) {
      alertTimer!.cancel();
      alertTimer = null;
    }
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 150,
    child: StreamBuilder<DocumentSnapshot>(
      stream: widget.uid == null
          ? null
          : FirebaseFirestore.instance
                .collection('couriers')
                .doc(widget.uid)
                .snapshots(),
      builder: (context, courierSnapshot) {
        final courier = courierSnapshot.data?.data() as Map<String, dynamic>?;
        final zoneId = courier?['zone_id'];
        if (zoneId == null || widget.uid == null)
          return const Center(child: Text('حدد منطقة المندوب لاستلام الطلبات'));
        return StreamBuilder<QuerySnapshot>(
          stream: FirebaseFirestore.instance
              .collection('orders')
              .where('zone_id', isEqualTo: zoneId)
              .where('courier_id', isEqualTo: null)
              .where('dispatch_candidates', arrayContains: widget.uid)
              .where('status', whereIn: ['pending', 'preparing', 'ready_for_pickup'])
              .snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return const Center(child: Text('تعذر تحميل الطلبات الجديدة. تحقق من الصلاحيات والاتصال.'));
            }
            if (!snapshot.hasData)
              return const Center(child: CircularProgressIndicator());
            syncAlert(snapshot.data!.docs.isNotEmpty);
            if (snapshot.data!.docs.isEmpty)
              return const Center(child: Text('لا توجد طلبات جديدة في منطقتك'));
            return ListView(
              children: snapshot.data!.docs
                  .map(
                    (d) => OrderTile(
                      id: d.id,
                      data: d.data() as Map<String, dynamic>,
                      allowClaim: true,
                    ),
                  )
                  .toList(),
            );
          },
        );
      },
    ),
  );
}

class OrderTile extends StatelessWidget {
  final String id;
  final Map<String, dynamic> data;
  final bool allowClaim;
  const OrderTile({
    Key? key,
    required this.id,
    required this.data,
    this.allowClaim = false,
  });
  Future<void> claim() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    await appFunctions.httpsCallable('claimCourierOrder').call({'order_id': id});
  }

  Future<void> reject() async {
    await appFunctions.httpsCallable('rejectCourierOrder').call({'order_id': id, 'reason': 'غير مناسب للمندوب'});
  }

  Future<void> changeToWallet(BuildContext context) async {
    final amount = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('تحويل الفكة للمحفظة'),
        content: TextField(
          controller: amount,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'المبلغ بالليرة السورية',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, amount.text.trim()),
            child: const Text('تحويل'),
          ),
        ],
      ),
    );
    if (value == null || value.isEmpty) return;
    await appFunctions.httpsCallable('requestChangeToWallet').call({
      'order_id': id,
      'amount': num.tryParse(value) ?? 0,
    });
  }

  Future<void> setStatus(BuildContext context, String status) async {
    if (status != 'delivered') {
      await appFunctions.httpsCallable('transitionOrderStatus').call({
        'order_id': id,
        'status': status,
      });
      return;
    }
    final otp = TextEditingController();
    final confirmed = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('رمز التسليم'),
        content: TextField(
          controller: otp,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(
            labelText: 'أدخل الرمز الذي يظهر للعميل',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, otp.text.trim()),
            child: const Text('تأكيد'),
          ),
        ],
      ),
    );
    if (confirmed == null) return;
    try {
      await appFunctions.httpsCallable('completeDelivery').call({
        'order_id': id,
        'otp': confirmed,
      });
    } on FirebaseFunctionsException catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message ?? 'تعذر تأكيد التسليم')),
        );
      }
    }
  }

  Future<void> callCustomer() async {
    final customerId = data['customer_id'];
    if (customerId == null) return;
    final user = await FirebaseFirestore.instance
        .collection('users')
        .doc(customerId)
        .get();
    final phone = user.data()?['phone'];
    if (phone != null)
      await launchUrl(Uri(scheme: 'tel', path: phone.toString()));
  }

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      title: Text('طلب #${id.substring(0, 6)}'),
      subtitle: Text(
        'الحالة: ${data['status']}\n${data['dispatch_last_reason'] ?? ''}${data['status'] == 'on_the_way' ? 'اطلب رمز التسليم من العميل قبل الإنهاء' : ''}',
      ),
      trailing: allowClaim
          ? Row(mainAxisSize: MainAxisSize.min, children: [IconButton(onPressed: reject, icon: const Icon(Icons.close, color: Colors.red), tooltip: 'رفض العرض'), FilledButton(onPressed: claim, child: const Text('قبول الطلب'))])
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  onPressed: callCustomer,
                  icon: const Icon(Icons.phone),
                ),
                PopupMenuButton<String>(
                  onSelected: (v) => v == 'change_wallet'
                      ? changeToWallet(context)
                      : setStatus(context, v),
                  itemBuilder: (_) => const [
                    PopupMenuItem(
                      value: 'picked_up',
                      child: Text('تم الاستلام'),
                    ),
                    PopupMenuItem(
                      value: 'on_the_way',
                      child: Text('في الطريق'),
                    ),
                    PopupMenuItem(
                      value: 'delivered',
                      child: Text('تم التسليم'),
                    ),
                    PopupMenuItem(
                      value: 'change_wallet',
                      child: Text('تحويل الفكة للمحفظة'),
                    ),
                  ],
                ),
              ],
            ),
    ),
  );
}

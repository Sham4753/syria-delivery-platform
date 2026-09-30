import '../common.dart';
import 'orders_screen.dart';

class ErrandPage extends StatefulWidget {
  const ErrandPage({super.key});
  @override
  State<ErrandPage> createState() => _ErrandPageState();
}

class _ErrandPageState extends State<ErrandPage> {
  final pickup = TextEditingController();
  final dropoff = TextEditingController();
  final description = TextEditingController();
  final pickupLat = TextEditingController();
  final pickupLng = TextEditingController();
  final dropoffLat = TextEditingController();
  final dropoffLng = TextEditingController();
  bool busy = false;

  Future<void> submit() async {
    if ([pickup, dropoff, description, pickupLat, pickupLng, dropoffLat, dropoffLng]
        .any((c) => c.text.trim().isEmpty))
      return;
    final pickupAddress = {
      'label': pickup.text.trim(),
      'latitude': double.tryParse(pickupLat.text.trim()),
      'longitude': double.tryParse(pickupLng.text.trim()),
    };
    final dropoffAddress = {
      'label': dropoff.text.trim(),
      'latitude': double.tryParse(dropoffLat.text.trim()),
      'longitude': double.tryParse(dropoffLng.text.trim()),
    };
    if ([pickupAddress, dropoffAddress].any((point) =>
        point['latitude'] == null || point['longitude'] == null)) return;
    setState(() => busy = true);
    try {
      final quote = await FirebaseFunctions.instance
          .httpsCallable('quoteErrand')
          .call({
            'pickup_address': pickupAddress,
            'dropoff_address': dropoffAddress,
          });
      final quotedFee = quote.data['delivery' + '_fee'];
      final result = await FirebaseFunctions.instance
          .httpsCallable('createErrand')
          .call({
            'pickup_address': pickupAddress,
            'dropoff_address': dropoffAddress,
            'description': description.text.trim(),
            'expected_fee': quotedFee,
            'idempotency_key': DateTime.now().microsecondsSinceEpoch
                .toString()
                .padRight(16, '0'),
          });
      if (mounted)
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) =>
                OrderPage(orderId: result.data['order_id'] as String),
          ),
        );
    } on FirebaseFunctionsException catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message ?? 'تعذر إنشاء طلب الأمانات')),
        );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('أمانات وتوصيل خاص')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'أرسل طردًا أو غرضًا شخصيًا من نقطة إلى نقطة مع بطاقة أمان المندوب ورمز تسليم.',
          style: TextStyle(fontSize: 16),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: pickup,
          decoration: const InputDecoration(labelText: 'نقطة الاستلام'),
        ),
        TextField(
          controller: dropoff,
          decoration: const InputDecoration(labelText: 'نقطة التسليم'),
        ),
        TextField(
          controller: pickupLat,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          decoration: const InputDecoration(labelText: 'خط عرض الاستلام'),
        ),
        TextField(
          controller: pickupLng,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          decoration: const InputDecoration(labelText: 'خط طول الاستلام'),
        ),
        TextField(
          controller: dropoffLat,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          decoration: const InputDecoration(labelText: 'خط عرض التسليم'),
        ),
        TextField(
          controller: dropoffLng,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          decoration: const InputDecoration(labelText: 'خط طول التسليم'),
        ),
        TextField(
          controller: description,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'وصف الأمانة وملاحظات السلامة',
          ),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: busy ? null : submit,
          icon: const Icon(Icons.security),
          label: Text(busy ? 'جارٍ الإرسال…' : 'طلب مندوب آمن'),
        ),
      ],
    ),
  );
}

class ErrandHomeButton extends StatelessWidget {
  const ErrandHomeButton({super.key});
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: const Icon(Icons.inventory_2, color: Colors.deepPurple),
      title: const Text('أمانات وتوصيل خاص'),
      subtitle: const Text('نقل طرد أو غرض بين نقطتين'),
      trailing: const Icon(Icons.chevron_left),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const ErrandPage()),
      ),
    ),
  );
}

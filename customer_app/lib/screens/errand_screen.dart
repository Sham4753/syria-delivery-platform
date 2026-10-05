import '../common.dart';
import '../location_picker.dart';
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
  LatLng? pickupLocation;
  LatLng? dropoffLocation;
  late final String idempotencyKey =
      '${DateTime.now().microsecondsSinceEpoch}-errand';
  bool busy = false;

  void showValidationError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> submit() async {
    if ([pickup, dropoff, description].any((c) => c.text.trim().isEmpty) ||
        pickupLocation == null || dropoffLocation == null) {
      showValidationError('أكمل بيانات الاستلام والتسليم والوصف وحدد الموقعين من الخريطة أو GPS');
      return;
    }
    final pickupAddress = {
      'label': pickup.text.trim(),
      'latitude': pickupLocation!.latitude,
      'longitude': pickupLocation!.longitude,
    };
    final dropoffAddress = {
      'label': dropoff.text.trim(),
      'latitude': dropoffLocation!.latitude,
      'longitude': dropoffLocation!.longitude,
    };
    setState(() => busy = true);
    try {
      final quote = await appFunctions
          .httpsCallable('quoteErrand')
          .call({
            'pickup_address': pickupAddress,
            'dropoff_address': dropoffAddress,
          });
      final quotedFee = quote.data['delivery_fee'];
      final formattedFee = formatMoney(quotedFee);
      if (!mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('تأكيد رسم التوصيل'),
          content: Text('الرسم المحسوب من الخادم: $formattedFee'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('تعديل البيانات'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('تأكيد وإرسال'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
      final result = await appFunctions
          .httpsCallable('createErrand')
          .call({
            'pickup_address': pickupAddress,
            'dropoff_address': dropoffAddress,
            'description': description.text.trim(),
            'expected_fee': quotedFee,
            'idempotency_key': idempotencyKey,
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
        OutlinedButton.icon(
          onPressed: busy ? null : () async {
            final picked = await showLocationPicker(context, initialLocation: pickupLocation);
            if (picked != null && mounted) setState(() => pickupLocation = picked);
          },
          icon: Icon(pickupLocation == null ? Icons.map_outlined : Icons.location_on),
          label: Text(pickupLocation == null ? 'تحديد موقع الاستلام بالخريطة أو GPS' : 'تغيير موقع الاستلام'),
        ),
        if (pickupLocation != null)
          Text('الاستلام: ${pickupLocation!.latitude.toStringAsFixed(6)}, ${pickupLocation!.longitude.toStringAsFixed(6)}'),
        OutlinedButton.icon(
          onPressed: busy ? null : () async {
            final picked = await showLocationPicker(context, initialLocation: dropoffLocation);
            if (picked != null && mounted) setState(() => dropoffLocation = picked);
          },
          icon: Icon(dropoffLocation == null ? Icons.map_outlined : Icons.location_on),
          label: Text(dropoffLocation == null ? 'تحديد موقع التسليم بالخريطة أو GPS' : 'تغيير موقع التسليم'),
        ),
        if (dropoffLocation != null)
          Text('التسليم: ${dropoffLocation!.latitude.toStringAsFixed(6)}, ${dropoffLocation!.longitude.toStringAsFixed(6)}'),
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

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
  final fee = TextEditingController(text: '15000');
  bool busy = false;

  Future<void> submit() async {
    if ([pickup, dropoff, description, fee].any((c) => c.text.trim().isEmpty))
      return;
    setState(() => busy = true);
    try {
      final result = await FirebaseFunctions.instance
          .httpsCallable('createErrand')
          .call({
            'pickup_address': {'label': pickup.text.trim()},
            'dropoff_address': {'label': dropoff.text.trim()},
            'description': description.text.trim(),
            'delivery_fee': num.tryParse(fee.text.trim()) ?? 0,
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
          controller: description,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'وصف الأمانة وملاحظات السلامة',
          ),
        ),
        TextField(
          controller: fee,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'الرسم المقترح بالليرة السورية',
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

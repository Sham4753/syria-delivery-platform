import '../common.dart';
import 'store_screen.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({Key? key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  String error = '';

  Future<void> login() async {
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email.text.trim(),
        password: password.text,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const MerchantGate()),
      );
    } catch (_) {
      setState(() {
        error = 'تعذر الدخول. تحقق من الحساب والدور المرتبط بالمتجر.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.storefront, size: 70, color: Colors.blue),
              const SizedBox(height: 12),
              const Text(
                'بوابة التاجر',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: email,
                decoration: const InputDecoration(
                  labelText: 'البريد الإلكتروني',
                ),
              ),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'كلمة المرور'),
              ),
              if (error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(error, style: const TextStyle(color: Colors.red)),
                ),
              const SizedBox(height: 18),
              FilledButton(onPressed: login, child: const Text('تسجيل الدخول')),
            ],
          ),
        ),
      ),
    );
  }
}

class MerchantGate extends StatelessWidget {
  const MerchantGate({Key? key});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final profileStream = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .snapshots();

    return StreamBuilder<DocumentSnapshot>(
      stream: profileStream,
      builder: (context, snapshot) {
        final profile = snapshot.data?.data() as Map<String, dynamic>?;
        final valid =
            ['vendor_admin', 'vendor_supervisor', 'vendor_cashier', 'kitchen_staff'].contains(profile?['role']) && profile?['vendor_id'] != null;

        if (!valid) {
          return Scaffold(
            appBar: AppBar(title: const Text('صلاحية غير مكتملة')),
            body: const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'يجب أن يحتوي users/{uid} على دور مطعم صالح وvendor_id قبل استخدام التطبيق.',
                ),
              ),
            ),
          );
        }

        return MerchantHome(vendorId: profile!['vendor_id'], role: profile!['role']);
      },
    );
  }
}

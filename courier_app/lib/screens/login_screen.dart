import '../common.dart';
import 'orders_screen.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({Key? key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  Future<void> login() async {
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email.text,
        password: password.text,
      );
    } catch (_) {
      try {
        await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: email.text,
          password: password.text,
        );
      } catch (_) {}
    }
    if (mounted) {
      await registerPushToken();
      await ensureWallet();
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const CourierGate()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.two_wheeler, size: 68, color: Colors.indigo),
              const Text(
                'بوابة المندوب',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
              ),
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
              const SizedBox(height: 18),
              FilledButton(onPressed: login, child: const Text('تسجيل الدخول')),
            ],
          ),
        ),
      ),
    );
  }
}

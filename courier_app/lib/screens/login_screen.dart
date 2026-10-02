import '../common.dart';
import 'orders_screen.dart';
import 'legal_screen.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({Key? key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  String messageFor(String code) {
    if (code == 'invalid-input') return 'أدخل البريد وكلمة المرور';
    if (code == 'invalid-email') return 'صيغة البريد الإلكتروني غير صحيحة';
    if (code == 'user-disabled') return 'هذا الحساب معطل';
    return 'البريد أو كلمة المرور غير صحيحة';
  }

  Future<void> login() async {
    if (busy) return;
    setState(() => busy = true);
    try {
      final normalizedEmail = email.text.trim();
      if (normalizedEmail.isEmpty || password.text.isEmpty) {
        throw FirebaseAuthException(code: 'invalid-input');
      }
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: normalizedEmail,
        password: password.text,
      );
      try {
        await registerPushToken();
      } catch (_) {
        // Notifications are optional and must not block a successful login.
      }
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const CourierGate()),
      );
    } on FirebaseAuthException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(messageFor(error.code))));
    } finally {
      if (mounted) setState(() => busy = false);
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
              FilledButton(onPressed: busy ? null : login, child: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('تسجيل الدخول')),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LegalScreen(title: 'سياسة الخصوصية', content: LegalScreen.privacy))), child: const Text('الخصوصية')),
                TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LegalScreen(title: 'شروط الاستخدام', content: LegalScreen.terms))), child: const Text('الشروط')),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import '../common.dart';
import 'home_screen.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final phone = TextEditingController();
  final code = TextEditingController();
  ConfirmationResult? webConfirmation;
  String? verificationId;
  bool busy = false;
  DateTime? lastCodeSentAt;

  Future<void> social(AuthProvider provider) async {
    setState(() => busy = true);
    try {
      if (!kIsWeb) {
        throw FirebaseAuthException(code: 'unsupported-platform', message: 'تسجيل Google/Facebook عبر هذه الشاشة متاح على الويب فقط حالياً');
      }
      final result = await FirebaseAuth.instance.signInWithPopup(provider);
      final user = result.user;
      if (user != null) await FirebaseFirestore.instance.collection('users').doc(user.uid).set({'role': 'customer', 'display_name': user.displayName ?? '', 'phone': user.phoneNumber ?? '', 'updated_at': FieldValue.serverTimestamp()}, SetOptions(merge: true));
      await registerPushToken();
      if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage()));
    } on FirebaseAuthException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'تعذر التسجيل')));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> sendPhoneCode() async {
    final lastSent = lastCodeSentAt;
    if (lastSent != null && DateTime.now().difference(lastSent).inSeconds < 60) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('انتظر دقيقة قبل إعادة إرسال الرمز')));
      return;
    }
    setState(() => busy = true);
    try {
      if (kIsWeb) {
        webConfirmation = await FirebaseAuth.instance.signInWithPhoneNumber(phone.text.trim(), RecaptchaVerifier(auth: FirebaseAuthPlatform.instance));
      } else {
        FirebaseAuthException? phoneError;
        await FirebaseAuth.instance.verifyPhoneNumber(phoneNumber: phone.text.trim(), verificationCompleted: (credential) async { await FirebaseAuth.instance.signInWithCredential(credential); }, verificationFailed: (e) => phoneError = e, codeSent: (id, _) => verificationId = id, codeAutoRetrievalTimeout: (id) => verificationId = id);
        if (phoneError != null) throw phoneError!;
      }
      lastCodeSentAt = DateTime.now();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال رمز التفعيل')));
    } on FirebaseAuthException catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'تعذر إرسال الرمز'))); } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> verifyPhoneCode() async {
    try {
      if (!kIsWeb && (verificationId == null || verificationId!.isEmpty)) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('أرسل رمز التفعيل أولاً')));
        return;
      }
      final credential = kIsWeb ? await webConfirmation?.confirm(code.text.trim()) : await FirebaseAuth.instance.signInWithCredential(PhoneAuthProvider.credential(verificationId: verificationId!, smsCode: code.text.trim()));
      if (credential == null) return;
      await FirebaseFirestore.instance.collection('users').doc(credential.user!.uid).set({'role': 'customer', 'phone': phone.text.trim(), 'display_name': credential.user!.displayName ?? '', 'updated_at': FieldValue.serverTimestamp()}, SetOptions(merge: true));
      if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage()));
    } on FirebaseAuthException catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'رمز غير صحيح'))); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.delivery_dining, size: 70, color: Colors.teal),
      const Text('Syria Delivery', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
      const SizedBox(height: 16),
      TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الهاتف مع مفتاح الدولة', hintText: '+963...')),
      const SizedBox(height: 10),
      Row(children: [Expanded(child: TextField(controller: code, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'رمز التفعيل'))), const SizedBox(width: 8), FilledButton(onPressed: busy ? null : sendPhoneCode, child: const Text('إرسال'))]),
      const SizedBox(height: 10), SizedBox(width: double.infinity, child: FilledButton(onPressed: busy ? null : verifyPhoneCode, child: const Text('دخول برقم الهاتف'))),
      const Divider(height: 30),
      OutlinedButton.icon(onPressed: busy ? null : () => social(GoogleAuthProvider()), icon: const Icon(Icons.g_mobiledata), label: const Text('المتابعة بواسطة Google')),
      OutlinedButton.icon(onPressed: busy ? null : () => social(FacebookAuthProvider()), icon: const Icon(Icons.facebook), label: const Text('المتابعة بواسطة Facebook')),
      TextButton(onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage())), child: const Text('المتابعة كزائر — تصفح وأضف للسلة')),
    ]))));
  }
}

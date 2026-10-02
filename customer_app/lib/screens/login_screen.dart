import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import '../common.dart';
import 'home_screen.dart';
import 'legal_screen.dart';

const _resendCooldownSeconds = 60;

/// يحوّل الأرقام العربية (٠-٩) والفارسية (۰-۹) إلى أرقام لاتينية.
String latinDigits(String input) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  final out = StringBuffer();
  for (final rune in input.runes) {
    final ch = String.fromCharCode(rune);
    var index = arabic.indexOf(ch);
    if (index < 0) index = persian.indexOf(ch);
    out.write(index >= 0 ? '$index' : ch);
  }
  return out.toString();
}

/// يحوّل الرقم المكتوب إلى صيغة دولية (E.164) أو null إذا لم يكن صالحاً.
/// يقبل: +963xxxxxxxxx، 00963xxxxxxxxx، 09xxxxxxxx (رقم سوري محلي).
String? normalizePhone(String raw) {
  var value = latinDigits(raw).replaceAll(RegExp(r'[\s\-().]'), '');
  if (value.startsWith('00')) value = '+${value.substring(2)}';
  if (RegExp(r'^09\d{8}$').hasMatch(value)) value = '+963${value.substring(1)}';
  return RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(value) ? value : null;
}

/// رسالة عربية مفهومة لخطأ المصادقة. النص الفارغ يعني: لا تعرض شيئاً (إلغاء من المستخدم).
String authMessage(FirebaseAuthException e, String fallback) {
  switch (e.code) {
    case 'invalid-phone-number':
      return 'رقم الهاتف غير صالح';
    case 'too-many-requests':
      return 'محاولات كثيرة، حاول لاحقاً';
    case 'quota-exceeded':
      return 'تعذر إرسال الرمز حالياً، حاول لاحقاً';
    case 'invalid-verification-code':
      return 'رمز التفعيل غير صحيح';
    case 'session-expired':
      return 'انتهت صلاحية الرمز، أعد الإرسال';
    case 'network-request-failed':
      return 'لا يوجد اتصال بالإنترنت';
    case 'account-exists-with-different-credential':
      return 'هذا الحساب مرتبط بطريقة دخول أخرى';
    case 'popup-closed-by-user':
    case 'web-context-canceled':
    case 'canceled':
    case 'cancelled':
      return '';
    default:
      return fallback;
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final phone = TextEditingController();
  final code = TextEditingController();
  ConfirmationResult? webConfirmation;
  String? verificationId;
  bool busy = false;
  int cooldown = 0;
  Timer? cooldownTimer;

  @override
  void dispose() {
    cooldownTimer?.cancel();
    phone.dispose();
    code.dispose();
    super.dispose();
  }

  void say(String message) {
    if (!mounted || message.isEmpty) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void idle() {
    if (mounted) setState(() => busy = false);
  }

  void startCooldown() {
    cooldownTimer?.cancel();
    if (mounted) setState(() => cooldown = _resendCooldownSeconds);
    cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => cooldown -= 1);
      if (cooldown <= 0) timer.cancel();
    });
  }

  void stopCooldown() {
    cooldownTimer?.cancel();
    if (mounted) setState(() => cooldown = 0);
  }

  /// الخطوة المشتركة بعد أي تسجيل دخول ناجح (هاتف أو Google أو Facebook):
  /// إنشاء/تحديث ملف العميل، تسجيل إشعارات الدفع، ثم فتح الصفحة الرئيسية.
  Future<void> completeLogin(User user, {String? phoneNumber}) async {
    final name = user.displayName?.trim() ?? '';
    final number = (user.phoneNumber ?? phoneNumber ?? '').trim();
    try {
      // لا نكتب حقولاً فارغة حتى لا نمسح الاسم أو الهاتف المحفوظين سابقاً.
      await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
        'role': 'customer',
        if (name.isNotEmpty) 'display_name': name,
        if (number.isNotEmpty) 'phone': number,
        'updated_at': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') {
        // حساب موظف (تاجر/مندوب/أدمن) لا يُستخدم كعميل.
        await FirebaseAuth.instance.signOut();
        say('هذا الحساب غير مخصص للعملاء');
      } else {
        say('تعذر حفظ بيانات الحساب، تحقق من الاتصال وحاول مجدداً');
      }
      return;
    }
    try {
      await registerPushToken();
    } catch (_) {
      // الإشعارات اختيارية ولا يجب أن تمنع الدخول.
    }
    if (!mounted) return;
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage()));
  }

  Future<void> social(AuthProvider provider) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      final auth = FirebaseAuth.instance;
      // signInWithPopup يعمل على الويب فقط؛ على أندرويد وiOS نستخدم signInWithProvider.
      final result = kIsWeb ? await auth.signInWithPopup(provider) : await auth.signInWithProvider(provider);
      final user = result.user;
      if (user != null) await completeLogin(user);
    } on FirebaseAuthException catch (e) {
      say(authMessage(e, 'تعذر تسجيل الدخول'));
    } catch (_) {
      say('تعذر تسجيل الدخول، حاول مجدداً');
    } finally {
      idle();
    }
  }

  Future<void> sendPhoneCode() async {
    if (busy || cooldown > 0) return;
    final number = normalizePhone(phone.text);
    if (number == null) {
      say('أدخل رقماً صحيحاً مع مفتاح الدولة، مثل +963...');
      return;
    }
    phone.text = number;
    setState(() {
      busy = true;
      verificationId = null;
      webConfirmation = null;
    });
    try {
      if (kIsWeb) {
        webConfirmation = await FirebaseAuth.instance.signInWithPhoneNumber(number, RecaptchaVerifier(auth: FirebaseAuthPlatform.instance));
        startCooldown();
        say('تم إرسال رمز التفعيل');
        idle();
      } else {
        await FirebaseAuth.instance.verifyPhoneNumber(
          phoneNumber: number,
          timeout: const Duration(seconds: 60),
          verificationCompleted: (credential) async {
            // تحقق تلقائي على أندرويد: ندخل مباشرة ونكمل نفس خطوات الدخول.
            try {
              final result = await FirebaseAuth.instance.signInWithCredential(credential);
              final user = result.user;
              if (user != null) await completeLogin(user, phoneNumber: number);
            } on FirebaseAuthException catch (e) {
              say(authMessage(e, 'تعذر تسجيل الدخول'));
            }
            idle();
          },
          verificationFailed: (e) {
            stopCooldown();
            say(authMessage(e, 'تعذر إرسال الرمز'));
            idle();
          },
          codeSent: (id, _) {
            verificationId = id;
            startCooldown();
            say('تم إرسال رمز التفعيل');
            idle();
          },
          codeAutoRetrievalTimeout: (id) {
            verificationId = id;
            idle();
          },
        );
      }
    } on FirebaseAuthException catch (e) {
      stopCooldown();
      say(authMessage(e, 'تعذر إرسال الرمز'));
      idle();
    } catch (_) {
      stopCooldown();
      say('تعذر إرسال الرمز، حاول مجدداً');
      idle();
    }
  }

  Future<void> verifyPhoneCode() async {
    if (busy) return;
    final sms = latinDigits(code.text).trim();
    if (sms.length < 6) {
      say('أدخل رمز التفعيل المكوّن من 6 أرقام');
      return;
    }
    final id = verificationId;
    final web = webConfirmation;
    if (kIsWeb ? web == null : id == null) {
      say('اطلب رمز التفعيل أولاً');
      return;
    }
    setState(() => busy = true);
    try {
      final credential = kIsWeb
          ? await web!.confirm(sms)
          : await FirebaseAuth.instance.signInWithCredential(PhoneAuthProvider.credential(verificationId: id!, smsCode: sms));
      final user = credential.user;
      if (user != null) await completeLogin(user, phoneNumber: normalizePhone(phone.text));
    } on FirebaseAuthException catch (e) {
      say(authMessage(e, 'رمز غير صحيح'));
    } catch (_) {
      say('تعذر التحقق من الرمز، حاول مجدداً');
    } finally {
      idle();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.delivery_dining, size: 70, color: Colors.teal),
      const Text('Syria Delivery', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
      const SizedBox(height: 16),
      TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الهاتف مع مفتاح الدولة', hintText: '+963... أو 09...')),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: TextField(controller: code, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: 'رمز التفعيل', counterText: ''))),
        const SizedBox(width: 8),
        FilledButton(onPressed: busy || cooldown > 0 ? null : sendPhoneCode, child: Text(cooldown > 0 ? 'إعادة ($cooldown)' : 'إرسال')),
      ]),
      const SizedBox(height: 10), SizedBox(width: double.infinity, child: FilledButton(onPressed: busy ? null : verifyPhoneCode, child: const Text('دخول برقم الهاتف'))),
      const Divider(height: 30),
      OutlinedButton.icon(onPressed: busy ? null : () => social(GoogleAuthProvider()), icon: const Icon(Icons.g_mobiledata), label: const Text('المتابعة بواسطة Google')),
      OutlinedButton.icon(onPressed: busy ? null : () => social(FacebookAuthProvider()), icon: const Icon(Icons.facebook), label: const Text('المتابعة بواسطة Facebook')),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LegalScreen(title: 'سياسة الخصوصية', content: LegalScreen.privacy))), child: const Text('الخصوصية')),
        TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LegalScreen(title: 'شروط الاستخدام', content: LegalScreen.terms))), child: const Text('الشروط')),
      ]),
      TextButton(onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage())), child: const Text('المتابعة كزائر — تصفح وأضف للسلة')),
    ]))));
  }
}

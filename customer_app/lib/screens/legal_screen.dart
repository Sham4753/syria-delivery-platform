import '../common.dart';

class LegalScreen extends StatelessWidget {
  final String title;
  final String content;
  const LegalScreen({super.key, required this.title, required this.content});

  static const privacy = '''سياسة الخصوصية\n\nنعالج بيانات الحساب والطلبات والعناوين والموقع أثناء التوصيل ورمز الإشعارات لتشغيل الخدمة وتنفيذ الطلبات وتحسين الأمان والجودة. لا نبيع بياناتك، وقد نستخدم Firebase ومزودي التشغيل الضروريين.\n\nيمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذف الحساب عبر الدعم داخل التطبيق. يستخدم موقع السائق أثناء الطلب لتحديث التتبع، وقد يتأخر عند ضعف الشبكة.\n\nهذه المسودة تحتاج مراجعة قانونية وإضافة بيانات التواصل الرسمية قبل النشر.''';
  static const terms = '''شروط الاستخدام\n\nيجب تقديم بيانات صحيحة وعدم إساءة استخدام الحساب أو الطلبات أو التقييمات. يتحقق الخادم من الأسعار والتوفر والكوبونات قبل إنشاء الطلب. تخضع الإلغاءات والاستردادات لحالة الطلب والسياسة المعروضة.\n\nقد يتأخر التوصيل أو التتبع بسبب الشبكة والظروف التشغيلية. يلتزم المستخدم والتاجر والسائق بالتعاون والسلامة وعدم نشر محتوى مسيء.\n\nهذه المسودة تحتاج مراجعة قانونية وإضافة بيانات الجهة المسؤولة والقانون المطبق قبل النشر.''';

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title)),
    body: SingleChildScrollView(padding: const EdgeInsets.all(20), child: Text(content, textDirection: TextDirection.rtl, style: const TextStyle(fontSize: 16, height: 1.7))),
  );
}

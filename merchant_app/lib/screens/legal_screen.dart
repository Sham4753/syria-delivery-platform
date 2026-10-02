import '../common.dart';

class LegalScreen extends StatelessWidget {
  final String title;
  final String content;
  const LegalScreen({super.key, required this.title, required this.content});
  static const privacy = 'سياسة الخصوصية\n\nنعالج بيانات الحساب والمتجر والطلبات والتسويات ومعلومات التواصل لتشغيل المنصة. لا نبيع البيانات، وقد نستخدم Firebase ومزودي التشغيل الضروريين. يمكن طلب الوصول أو التصحيح أو الحذف عبر الدعم داخل التطبيق، مع مراعاة السجلات المالية.\n\nهذه مسودة تحتاج مراجعة قانونية وإضافة بيانات التواصل الرسمية قبل النشر.';
  static const terms = 'شروط الاستخدام\n\nيلتزم التاجر بدقة القائمة والأسعار وتجهيز الطلبات وعدم إساءة استخدام التقييمات أو بيانات العملاء. يتحقق الخادم من الطلبات والتسويات، وقد تُراجع العمليات أو يوقف الحساب عند المخالفة.\n\nهذه مسودة تحتاج مراجعة قانونية وإضافة بيانات الجهة المسؤولة والقانون المطبق قبل النشر.';
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(title)), body: SingleChildScrollView(padding: const EdgeInsets.all(20), child: Text(content, textDirection: TextDirection.rtl, style: const TextStyle(fontSize: 16, height: 1.7)));
}

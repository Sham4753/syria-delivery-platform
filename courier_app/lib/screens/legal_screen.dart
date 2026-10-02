import '../common.dart';

class LegalScreen extends StatelessWidget {
  final String title;
  final String content;
  const LegalScreen({super.key, required this.title, required this.content});
  static const privacy = 'سياسة الخصوصية\n\nنعالج بيانات الحساب والمركبة وموقع السائق أثناء تنفيذ الطلبات ورمز الإشعارات لتشغيل التوصيل. لا نبيع البيانات، ويُستخدم الموقع لتحديث التتبع للأطراف المخولة. يمكن طلب التصحيح أو الحذف عبر الدعم داخل التطبيق.\n\nهذه مسودة تحتاج مراجعة قانونية وإضافة بيانات التواصل الرسمية قبل النشر.';
  static const terms = 'شروط الاستخدام\n\nيلتزم السائق ببيانات صحيحة وبالسلامة وتسليم الطلبات وعدم إساءة استخدام النظام. قد يتأخر التتبع عند ضعف الشبكة، ولا يضمن التطبيق توفر الخدمة دون انقطاع. يخضع الحساب للمراجعة والإيقاف عند المخالفة.\n\nهذه مسودة تحتاج مراجعة قانونية وإضافة بيانات الجهة المسؤولة قبل النشر.';
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(title)), body: SingleChildScrollView(padding: const EdgeInsets.all(20), child: Text(content, textDirection: TextDirection.rtl, style: const TextStyle(fontSize: 16, height: 1.7)));
}

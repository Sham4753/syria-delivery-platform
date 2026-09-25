import 'common.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'screens/login_screen.dart';

Future<void> bootstrapCourierApp() async {
  WidgetsFlutterBinding.ensureInitialized();
  Object? startupError;
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: kIsWeb ? firebaseWebOptions : null,
      );
    }
    await connectToFirebaseEmulators();
    FirebaseFirestore.instance.settings = Settings(persistenceEnabled: true);
  } catch (error) {
    startupError = error;
  }
  runApp(
    startupError == null
        ? const CourierApp()
        : FirebaseStartupErrorApp(
            error: startupError.toString(),
            retry: bootstrapCourierApp,
          ),
  );
}

class CourierApp extends StatelessWidget {
  const CourierApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF4F46E5),
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xFFF6F7FB),
      fontFamily: 'Arial',
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFFF6F7FB),
        foregroundColor: Color(0xFF18213D),
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 50),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    ),
    home: const LoginPage(),
  );
}

class FirebaseStartupErrorApp extends StatelessWidget {
  final String error;
  final Future<void> Function() retry;

  const FirebaseStartupErrorApp({
    super.key,
    required this.error,
    required this.retry,
  });

  @override
  Widget build(BuildContext context) => MaterialApp(
    home: Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, size: 56),
              const SizedBox(height: 16),
              const Text(
                'تعذر تهيئة Firebase',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'تحقق من إعدادات Firebase أو شغّل التطبيق مع إعدادات المحاكي الصحيحة.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                error,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11, color: Colors.grey),
              ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: retry,
                child: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

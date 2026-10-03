import 'common.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'version_gate.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'screens/login_screen.dart';
import 'services/network_status.dart';

Future<void> bootstrapMerchantApp() async {
  WidgetsFlutterBinding.ensureInitialized();
  installAppErrorHandlers('merchant');
  Object? startupError;
  Map<String, dynamic> systemConfig = <String, dynamic>{};
  var appVersion = '1.0.0';
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: kIsWeb ? firebaseWebOptions : null,
      );
    }
    await connectToFirebaseEmulators();
    FirebaseFirestore.instance.settings = Settings(persistenceEnabled: true);
    await enableCrashlytics();
    systemConfig = await loadSystemConfig();
  } catch (error) {
    startupError = error;
  }
  try {
    appVersion = (await PackageInfo.fromPlatform()).version;
  } catch (_) {}
  runApp(
    startupError == null
        ? MerchantApp(systemConfig: systemConfig, appVersion: appVersion)
        : FirebaseStartupErrorApp(
            error: startupError.toString(),
            retry: bootstrapMerchantApp,
          ),
  );
}

class MerchantApp extends StatelessWidget {
  final Map<String, dynamic> systemConfig;
  final String appVersion;
  const MerchantApp({super.key, required this.systemConfig, required this.appVersion});

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFF97316),
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xFFFFF8F3),
      fontFamily: 'Arial',
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFFFFF8F3),
        foregroundColor: Color(0xFF3B2114),
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
    home: VersionControlGate(
      config: systemConfig,
      appKey: 'merchant',
      appVersion: appVersion,
      child: NetworkStatusBanner(
        child: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.idTokenChanges(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return snapshot.data == null ? const LoginPage() : const MerchantGate();
        },
      ),
      ),
    ),
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

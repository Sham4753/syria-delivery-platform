import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kDebugMode, kIsWeb, PlatformDispatcher, TargetPlatform;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/material.dart';

export 'package:cloud_functions/cloud_functions.dart';
export 'package:cloud_firestore/cloud_firestore.dart';
export 'package:firebase_auth/firebase_auth.dart';
export 'package:firebase_core/firebase_core.dart';
export 'package:flutter/material.dart';

String _priceDisplayMode = 'new';

String _groupMoney(num value) {
  final rounded = value.round().toString();
  return rounded.replaceAllMapped(RegExp(r'(?<!^)(?=(\d{3})+$)'), (match) => ',');
}

String formatMoney(Object? value, {String? mode}) {
  final number = value is num ? value.toDouble() : double.tryParse('${value ?? ''}') ?? 0;
  final safe = number.isFinite ? number : 0;
  final newAmount = _groupMoney(safe);
  final displayMode = (mode ?? _priceDisplayMode).trim();
  if (displayMode == 'new_with_old') {
    return '$newAmount ل.س (${_groupMoney(safe * 100)} قديمة)';
  }
  return '$newAmount ل.س';
}

final appFunctions = FirebaseFunctions.instanceFor(region: 'europe-west1');

void installAppErrorHandlers(String appName) {
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    debugPrint('[$appName][flutter_error] ${details.exceptionAsString()}');
    if (!kIsWeb && Firebase.apps.isNotEmpty) FirebaseCrashlytics.instance.recordFlutterError(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('[$appName][uncaught_error] $error');
    if (!kIsWeb && Firebase.apps.isNotEmpty) FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };
}
Future<void> enableCrashlytics() async {
  if (!kIsWeb && Firebase.apps.isNotEmpty) await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(!kDebugMode);
}

bool merchantIsOpen(Map<String, dynamic> data) {
  final hours = data['opening_hours'] as Map<String, dynamic>?;
  if (hours == null) return true;
  final now = TimeOfDay.now();
  final current = now.hour * 60 + now.minute;
  int parse(String value) {
    final p = value.split(':');
    return int.parse(p[0]) * 60 + int.parse(p[1]);
  }

  try {
    return current >= parse(hours['open'] ?? '00:00') &&
        current <= parse(hours['close'] ?? '23:59');
  } catch (_) {
    return true;
  }
}

const useFirebaseEmulators = bool.fromEnvironment(
  'USE_FIREBASE_EMULATORS',
  defaultValue: false,
);
const firebaseWebOptions = FirebaseOptions(
  apiKey: String.fromEnvironment('FIREBASE_API_KEY') == '' && useFirebaseEmulators ? 'demo-api-key' : String.fromEnvironment('FIREBASE_API_KEY'),
  appId: String.fromEnvironment('FIREBASE_APP_ID') == '' && useFirebaseEmulators ? '1:000000000000:web:demo' : String.fromEnvironment('FIREBASE_APP_ID'),
  messagingSenderId: String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID') == '' && useFirebaseEmulators ? '000000000000' : String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
  projectId: String.fromEnvironment('FIREBASE_PROJECT_ID') == '' && useFirebaseEmulators ? 'syria-delivery-2026-majed' : String.fromEnvironment('FIREBASE_PROJECT_ID'),
  authDomain: String.fromEnvironment('FIREBASE_AUTH_DOMAIN') == '' && useFirebaseEmulators ? 'syria-delivery-2026-majed.firebaseapp.com' : String.fromEnvironment('FIREBASE_AUTH_DOMAIN'),
  storageBucket: String.fromEnvironment('FIREBASE_STORAGE_BUCKET') == '' && useFirebaseEmulators ? 'syria-delivery-2026-majed.appspot.com' : String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
);
Future<void> loadSystemConfig() async {
  try {
    final snapshot = await FirebaseFirestore.instance.collection('public_config').doc('main').get();
    final data = snapshot.data() ?? <String, dynamic>{};
    _priceDisplayMode = (data['price_display_mode'] ?? '').toString().trim() == 'new_with_old' ? 'new_with_old' : 'new';
  } catch (_) {
    _priceDisplayMode = 'new';
  }
}
Future<void> initializeFirebaseApp() async {
  if (Firebase.apps.isNotEmpty) return;
  if (kIsWeb) {
    await Firebase.initializeApp(options: firebaseWebOptions);
  } else {
    await Firebase.initializeApp();
  }
}

String emulatorHost() {
  const override = String.fromEnvironment('EMULATOR_HOST');
  return override.isNotEmpty
      ? override
      : ((kIsWeb
            ? '127.0.0.1'
            : (defaultTargetPlatform == TargetPlatform.android
                  ? '10.0.2.2'
                  : '127.0.0.1')));
}

Future<void> connectToFirebaseEmulators() async {
  if (!useFirebaseEmulators) return;
  final host = emulatorHost();
  await FirebaseAuth.instance.useAuthEmulator(host, 9099);
  FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
  appFunctions.useFunctionsEmulator(host, 5001);
}

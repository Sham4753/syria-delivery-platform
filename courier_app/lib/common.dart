import 'dart:convert';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kDebugMode, kIsWeb, PlatformDispatcher, TargetPlatform;

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

export 'package:cloud_functions/cloud_functions.dart';
export 'package:cloud_firestore/cloud_firestore.dart';
export 'package:firebase_auth/firebase_auth.dart';
export 'package:firebase_core/firebase_core.dart';
export 'package:firebase_messaging/firebase_messaging.dart';
export 'package:flutter/material.dart';
export 'package:flutter_map/flutter_map.dart';
export 'package:geolocator/geolocator.dart';
export 'package:latlong2/latlong.dart' hide Path;
export 'package:url_launcher/url_launcher.dart';

String _priceDisplayMode = 'new';

String _groupInteger(String value) {
  final negative = value.startsWith('-');
  final digits = negative ? value.substring(1) : value;
  final grouped = digits.replaceAllMapped(RegExp(r'(?<!^)(?=(\d{3})+$)'), (match) => ',');
  return negative ? '-$grouped' : grouped;
}

String _groupMoney(num value) {
  // Round only to the two stored/displayed decimal places, then trim zeros.
  final fixed = value.toDouble().toStringAsFixed(2);
  final parts = fixed.split('.');
  var integer = parts.first;
  var fraction = parts.length > 1 ? parts[1].replaceFirst(RegExp(r'0+$'), '') : '';
  if (integer == '-0' && fraction.isEmpty) integer = '0';
  return '${_groupInteger(integer)}${fraction.isEmpty ? '' : '.$fraction'}';
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
Future<void> _cacheSystemConfig(Map<String, dynamic> data) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('courier.system_config', jsonEncode(data));
}

Future<Map<String, dynamic>> _readCachedSystemConfig() async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString('courier.system_config');
  if (raw == null || raw.isEmpty) return <String, dynamic>{};
  try {
    final decoded = jsonDecode(raw);
    return decoded is Map ? Map<String, dynamic>.from(decoded) : <String, dynamic>{};
  } catch (_) {
    return <String, dynamic>{};
  }
}

Future<Map<String, dynamic>> loadSystemConfig() async {
  try {
    final snapshot = await FirebaseFirestore.instance.collection('public_config').doc('main').get().timeout(const Duration(seconds: 8));
    final data = snapshot.data() ?? <String, dynamic>{};
    _priceDisplayMode = (data['price_display_mode'] ?? '').toString().trim() == 'new_with_old' ? 'new_with_old' : 'new';
    await _cacheSystemConfig(data);
    return data;
  } catch (_) {
    final cached = await _readCachedSystemConfig();
    _priceDisplayMode = (cached['price_display_mode'] ?? '').toString().trim() == 'new_with_old' ? 'new_with_old' : 'new';
    return cached;
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

Future<void> registerPushToken() async {
  if (kIsWeb) return; // Web tests do not have a VAPID key configured.
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) return;
  final messaging = FirebaseMessaging.instance;
  await messaging.requestPermission(alert: true, badge: true, sound: true);
  final token = await messaging.getToken();
  if (token != null) {
    await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
      'role': 'courier',
      'fcm_token': token,
      'updated_at': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
}

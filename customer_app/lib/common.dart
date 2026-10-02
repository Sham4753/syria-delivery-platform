import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, PlatformDispatcher, TargetPlatform;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

export 'package:cloud_functions/cloud_functions.dart';
export 'package:cloud_firestore/cloud_firestore.dart';
export 'package:firebase_auth/firebase_auth.dart';
export 'package:firebase_core/firebase_core.dart';
export 'package:firebase_messaging/firebase_messaging.dart';
export 'package:flutter/material.dart';
export 'package:flutter_map/flutter_map.dart';
export 'package:latlong2/latlong.dart' hide Path;
export 'package:url_launcher/url_launcher.dart';

final appFunctions = FirebaseFunctions.instanceFor(region: 'europe-west1');

void installAppErrorHandlers(String appName) {
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    debugPrint('[$appName][flutter_error] ${details.exceptionAsString()}');
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('[$appName][uncaught_error] $error');
    return true;
  };
}

const networkTimeout = Duration(seconds: 15);

Future<T> withNetworkTimeout<T>(Future<T> request, {Duration? timeout}) =>
    request.timeout(timeout ?? networkTimeout);

Future<void> cacheJson(String key, Object value) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(key, jsonEncode(jsonSafeValue(value)));
}

Future<dynamic> readCachedJson(String key) async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString(key);
  if (raw == null || raw.isEmpty) return null;
  try {
    return jsonDecode(raw);
  } catch (_) {
    return null;
  }
}

dynamic jsonSafeValue(dynamic value) {
  if (value is Timestamp) return value.toDate().toIso8601String();
  if (value is GeoPoint) {
    return {'latitude': value.latitude, 'longitude': value.longitude};
  }
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), jsonSafeValue(item)));
  }
  if (value is Iterable) return value.map(jsonSafeValue).toList();
  return value;
}

Future<Map<String, dynamic>> loadSystemConfig() async {
  try {
    final snapshot = await withNetworkTimeout(
      FirebaseFirestore.instance.collection('public_config').doc('main').get(),
    );
    final data = snapshot.data() ?? <String, dynamic>{};
    await cacheJson('customer.system_config', data);
    return data;
  } catch (_) {
    final cached = await readCachedJson('customer.system_config');
    return cached is Map ? Map<String, dynamic>.from(cached) : <String, dynamic>{};
  }
}

Future<List<Map<String, dynamic>>> loadVendors(String category) async {
  try {
    final snapshot = await withNetworkTimeout(
      FirebaseFirestore.instance.collection('public_vendors')
          .where('is_active', isEqualTo: true)
          .where('category', isEqualTo: category).get(),
    );
    final data = snapshot.docs
        .map((doc) => {'id': doc.id, ...doc.data()})
        .toList();
    await cacheJson('customer.vendors.$category', data);
    return data;
  } catch (error) {
    debugPrint('تعذر تحميل public_vendors للفئة $category: $error');
    final cached = await readCachedJson('customer.vendors.$category');
    if (cached is List && cached.isNotEmpty) {
      return cached.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
    }
    rethrow;
  }
}

/// الوقت الحالي بتوقيت دمشق (UTC+3 ثابتاً؛ ألغت سوريا التوقيت الصيفي في 2022).
/// نعتمد عليه بدل ساعة الجوال حتى تطابق النتيجة ما يتحقق منه السيرفر عند الطلب.
DateTime damascusNow([DateTime? now]) =>
    (now ?? DateTime.now()).toUtc().add(const Duration(hours: 3));

/// true إذا كان المتجر ضمن ساعات العمل. يدعم المتاجر التي تغلق بعد منتصف الليل
/// (مثل 18:00 إلى 02:00). بدون opening_hours = مفتوح، وساعات تالفة = مغلق
/// (نفس سلوك السيرفر في isVendorOpen).
bool vendorIsOpen(Map<String, dynamic> data, {DateTime? now}) {
  final hours = data['opening_hours'];
  if (hours is! Map) return true;

  int? parse(Object? value, String fallback) {
    final text = '${value ?? fallback}'.trim();
    final parts = text.split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return null;
    return h * 60 + m;
  }

  final open = parse(hours['open'], '00:00');
  final close = parse(hours['close'], '23:59');
  if (open == null || close == null) return false;

  final local = damascusNow(now);
  final current = local.hour * 60 + local.minute;
  return open <= close
      ? current >= open && current <= close
      : current >= open || current <= close;
}

const useFirebaseEmulators = bool.fromEnvironment(
  'USE_FIREBASE_EMULATORS',
  defaultValue: false,
);

const firebaseApiKey = String.fromEnvironment(
  'FIREBASE_API_KEY',
);
const firebaseAppId = String.fromEnvironment(
  'FIREBASE_APP_ID',
);
const firebaseMessagingSenderId = String.fromEnvironment(
  'FIREBASE_MESSAGING_SENDER_ID',
);
const firebaseProjectId = String.fromEnvironment(
  'FIREBASE_PROJECT_ID',
);
const firebaseAuthDomain = String.fromEnvironment(
  'FIREBASE_AUTH_DOMAIN',
);
const firebaseStorageBucket = String.fromEnvironment(
  'FIREBASE_STORAGE_BUCKET',
);
const firebaseWebOptions = FirebaseOptions(
  apiKey: firebaseApiKey == '' && useFirebaseEmulators ? 'demo-api-key' : firebaseApiKey,
  appId: firebaseAppId == '' && useFirebaseEmulators ? '1:000000000000:web:demo' : firebaseAppId,
  messagingSenderId: firebaseMessagingSenderId == '' && useFirebaseEmulators ? '000000000000' : firebaseMessagingSenderId,
  projectId: firebaseProjectId == '' && useFirebaseEmulators ? 'syria-delivery-2026-majed' : firebaseProjectId,
  authDomain: firebaseAuthDomain == '' && useFirebaseEmulators ? 'syria-delivery-2026-majed.firebaseapp.com' : firebaseAuthDomain,
  storageBucket: firebaseStorageBucket == '' && useFirebaseEmulators ? 'syria-delivery-2026-majed.appspot.com' : firebaseStorageBucket,
);

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
      'role': 'customer',
      'fcm_token': token,
      'updated_at': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
}

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, PlatformDispatcher, TargetPlatform;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

export 'package:cloud_functions/cloud_functions.dart';
export 'package:cloud_firestore/cloud_firestore.dart';
export 'package:firebase_auth/firebase_auth.dart';
export 'package:firebase_core/firebase_core.dart';
export 'package:flutter/material.dart';

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
  projectId: String.fromEnvironment('FIREBASE_PROJECT_ID') == '' && useFirebaseEmulators ? 'demo-syria-delivery' : String.fromEnvironment('FIREBASE_PROJECT_ID'),
  authDomain: String.fromEnvironment('FIREBASE_AUTH_DOMAIN') == '' && useFirebaseEmulators ? 'demo-syria-delivery.firebaseapp.com' : String.fromEnvironment('FIREBASE_AUTH_DOMAIN'),
  storageBucket: String.fromEnvironment('FIREBASE_STORAGE_BUCKET') == '' && useFirebaseEmulators ? 'demo-syria-delivery.appspot.com' : String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
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

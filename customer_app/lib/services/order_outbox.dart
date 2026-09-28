import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _outboxKey = 'customer.order_outbox.v1';

class OutboxSubmission {
  final String orderId;
  final bool replayed;

  const OutboxSubmission({required this.orderId, required this.replayed});
}

class OrderOutbox {
  static Future<List<Map<String, dynamic>>> _read() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_outboxKey);
    if (raw == null || raw.isEmpty) return <Map<String, dynamic>>[];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return <Map<String, dynamic>>[];
      return decoded
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  static Future<void> _write(List<Map<String, dynamic>> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_outboxKey, jsonEncode(_jsonSafe(items)));
  }

  static dynamic _jsonSafe(dynamic value) {
    if (value is Timestamp) return value.toDate().toIso8601String();
    if (value is GeoPoint) return {'latitude': value.latitude, 'longitude': value.longitude};
    if (value is DocumentReference) return value.path;
    if (value is Map) return value.map((key, item) => MapEntry(key.toString(), _jsonSafe(item)));
    if (value is Iterable) return value.map(_jsonSafe).toList();
    return value;
  }

  static Future<int> pendingCount() async => (await _read()).length;

  static Future<void> enqueue(Map<String, dynamic> payload) async {
    final key = '${payload['idempotency_key'] ?? ''}';
    if (key.isEmpty) throw ArgumentError('idempotency_key is required');
    final ownerUid = FirebaseAuth.instance.currentUser?.uid;
    if (ownerUid == null) throw StateError('Authentication is required to queue an order');
    final items = await _read();
    final existing = items.indexWhere((item) => item['idempotency_key'] == key && item['owner_uid'] == ownerUid);
    final queued = {
      'idempotency_key': key,
      'owner_uid': ownerUid,
      'payload': payload,
      'queued_at': DateTime.now().toUtc().toIso8601String(),
      'attempts': 0,
    };
    if (existing >= 0) {
      // Keep the same idempotency key but replace a stale, unsent payload.
      items[existing] = queued;
    } else {
      items.add(queued);
    }
    await _write(items);
  }

  static Future<OutboxSubmission?> flush({String? onlyKey}) async {
    final items = await _read();
    OutboxSubmission? completed;
    final remaining = <Map<String, dynamic>>[];
    final ownerUid = FirebaseAuth.instance.currentUser?.uid;
    if (ownerUid == null) return null;
    for (var index = 0; index < items.length; index++) {
      final item = items[index];
      final key = '${item['idempotency_key'] ?? ''}';
      if (item['owner_uid'] != ownerUid) {
        remaining.add(item);
        continue;
      }
      if (onlyKey != null && key != onlyKey) {
        remaining.add(item);
        continue;
      }
      final payload = Map<String, dynamic>.from(item['payload'] as Map? ?? {});
      try {
        final result = await FirebaseFunctions.instance
            .httpsCallable('createOrder')
            .call(payload)
            .timeout(const Duration(seconds: 15));
        final data = Map<String, dynamic>.from(result.data as Map);
        final orderId = '${data['order_id'] ?? ''}';
        if (orderId.isEmpty) throw StateError('The server returned no order id');
        completed = OutboxSubmission(
          orderId: orderId,
          replayed: data['replayed'] == true,
        );
        if (onlyKey != null) {
          remaining.addAll(items.skip(index + 1));
          break;
        }
      } on FirebaseFunctionsException catch (error) {
        const permanent = {
          'invalid-argument',
          'failed-precondition',
          'permission-denied',
          'unauthenticated',
          'not-found',
          'already-exists',
        };
        if (permanent.contains(error.code)) {
          if (onlyKey != null) rethrow;
          continue;
        }
        final retry = Map<String, dynamic>.from(item);
        retry['attempts'] = (retry['attempts'] as num? ?? 0) + 1;
        retry['last_error_at'] = DateTime.now().toUtc().toIso8601String();
        if ((retry['attempts'] as int) <= 5) remaining.add(retry);
      } catch (_) {
        final retry = Map<String, dynamic>.from(item);
        retry['attempts'] = (retry['attempts'] as num? ?? 0) + 1;
        retry['last_error_at'] = DateTime.now().toUtc().toIso8601String();
        if ((retry['attempts'] as int) <= 5) remaining.add(retry);
      }
    }
    await _write(remaining);
    return completed;
  }
}

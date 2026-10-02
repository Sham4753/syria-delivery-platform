import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'order_outbox.dart';

/// حالة الاتصال التي يراها التطبيق، مع تمييز الاتصال المحدود عن انقطاعه.
enum AppNetworkState { online, limited, offline }

class NetworkStatusController extends ChangeNotifier {
  NetworkStatusController() {
    _subscription = _connectivity.onConnectivityChanged.listen(_update);
    unawaited(_loadInitial());
  }

  final Connectivity _connectivity = Connectivity();
  late final StreamSubscription<List<ConnectivityResult>> _subscription;
  AppNetworkState state = AppNetworkState.online;
  bool _disposed = false;

  Future<void> _loadInitial() async {
    try {
      _update(await _connectivity.checkConnectivity());
    } catch (_) {
      // نبدأ بوضع متفائل؛ الطلبات نفسها تستخدم timeout وتدخل الطابور عند الفشل.
    }
  }

  void _update(List<ConnectivityResult> results) {
    final next = results.isEmpty || results.contains(ConnectivityResult.none)
        ? AppNetworkState.offline
        : (results.contains(ConnectivityResult.mobile) ||
                  results.contains(ConnectivityResult.wifi) ||
                  results.contains(ConnectivityResult.ethernet)
              ? AppNetworkState.online
              : AppNetworkState.limited);
    if (next != state) {
      state = next;
      if (!_disposed) notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_subscription.cancel());
    super.dispose();
  }
}

class NetworkStatusBanner extends StatefulWidget {
  const NetworkStatusBanner({super.key, required this.child, this.onOnline});

  final Widget child;
  final Future<void> Function()? onOnline;

  @override
  State<NetworkStatusBanner> createState() => _NetworkStatusBannerState();
}

class _NetworkStatusBannerState extends State<NetworkStatusBanner> {
  late final NetworkStatusController _controller;
  AppNetworkState _previous = AppNetworkState.online;
  int _pending = 0;

  @override
  void initState() {
    super.initState();
    _controller = NetworkStatusController()..addListener(_onStatusChanged);
    _refreshPending();
  }

  Future<void> _refreshPending() async {
    final count = await OrderOutbox.pendingCount();
    if (mounted) setState(() => _pending = count);
  }

  void _onStatusChanged() {
    final current = _controller.state;
    if (current == AppNetworkState.online &&
        _previous != AppNetworkState.online) {
      final callback = widget.onOnline;
      if (callback != null) unawaited(callback().whenComplete(_refreshPending));
    }
    _previous = current;
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.removeListener(_onStatusChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pending = _pending > 0 ? ' — $_pending عملية بانتظار المزامنة' : '';
    final message = switch (_controller.state) {
      AppNetworkState.offline => 'لا يوجد اتصال — سيتم حفظ العمليات وإرسالها عند عودة الشبكة$pending',
      AppNetworkState.limited => 'اتصال محدود — نستخدم وضع توفير البيانات$pending',
      AppNetworkState.online => null,
    };
    return Column(
      children: [
        if (message != null)
          Material(
            color: _controller.state == AppNetworkState.offline
                ? Colors.red.shade700
                : Colors.orange.shade800,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                child: Row(
                  children: [
                    Icon(
                      _controller.state == AppNetworkState.offline
                          ? Icons.cloud_off
                          : Icons.signal_cellular_alt,
                      color: Colors.white,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        message,
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        Expanded(child: widget.child),
      ],
    );
  }
}

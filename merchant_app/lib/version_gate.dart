import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'common.dart';
import 'versioning.dart';

class VersionControlGate extends StatelessWidget {
  final Map<String, dynamic> config;
  final String appKey;
  final String appVersion;
  final Widget child;

  const VersionControlGate({super.key, required this.config, required this.appKey, required this.appVersion, required this.child});

  @override
  Widget build(BuildContext context) {
    if (config['maintenance_mode'] == true) {
      return MaintenanceScreen(message: '${config['maintenance_message'] ?? ''}'.trim());
    }
    final minimum = (config['min_app_version'] is Map)
        ? '${(config['min_app_version'] as Map)[appKey] ?? ''}'.trim()
        : '';
    if (minimum.isNotEmpty && compareVersions(appVersion, minimum) < 0) {
      return ForceUpdateScreen(message: 'هذا الإصدار قديم. يرجى تحديث التطبيق للمتابعة.', updateUrl: '${config['update_url'] ?? ''}'.trim());
    }
    return child;
  }
}

class MaintenanceScreen extends StatelessWidget {
  final String message;
  const MaintenanceScreen({super.key, required this.message});

  @override
  Widget build(BuildContext context) => _ControlScreen(
        icon: Icons.construction_rounded,
        title: 'التطبيق قيد الصيانة',
        message: message.isEmpty ? 'سيعود التطبيق للعمل قريبًا.' : message,
      );
}

class ForceUpdateScreen extends StatelessWidget {
  final String message;
  final String updateUrl;
  const ForceUpdateScreen({super.key, required this.message, required this.updateUrl});

  Future<void> _openUpdate() async {
    final uri = Uri.tryParse(updateUrl);
    if (uri != null && uri.hasScheme && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) => _ControlScreen(
        icon: Icons.system_update_rounded,
        title: 'يتطلب التطبيق تحديثًا',
        message: message,
        action: updateUrl.isEmpty ? null : FilledButton.icon(onPressed: _openUpdate, icon: const Icon(Icons.download), label: const Text('تحديث')),
      );
}

class _ControlScreen extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  const _ControlScreen({required this.icon, required this.title, required this.message, this.action});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 72),
              const SizedBox(height: 18),
              Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              if (action != null) ...[const SizedBox(height: 22), action!],
            ]),
          ),
        ),
      );
}

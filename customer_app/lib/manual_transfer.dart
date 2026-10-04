Map<String, Map<String, dynamic>> enabledManualTransferChannels(Map<String, dynamic> config) {
  final manual = config['manual_transfer'];
  final channelsValue = manual is Map ? manual['channels'] : null;
  if (channelsValue is! Map) return <String, Map<String, dynamic>>{};
  final channels = <String, Map<String, dynamic>>{};
  for (final entry in channelsValue.entries) {
    if (entry.value is Map && (entry.value['enabled'] == true)) {
      channels[entry.key.toString()] = Map<String, dynamic>.from(entry.value as Map);
    }
  }
  return channels;
}

String manualTransferErrorMessage(String code, String? serverMessage) {
  if (code == 'already-exists') return 'هذا المرجع مستخدم مسبقًا لهذه القناة. أدخل مرجعًا آخر.';
  return serverMessage?.trim().isNotEmpty == true ? serverMessage!.trim() : 'تعذر إرسال إثبات التحويل؛ يمكنك تصحيح المرجع قبل بدء المراجعة.';
}

Map<String, dynamic> manualTransferOrderFields(String channel) => {
      'payment_method': 'manual_transfer',
      'payment_channel': channel,
    };

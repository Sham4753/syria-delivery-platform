import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:latlong2/latlong.dart';

import '../common.dart';
import '../location_picker.dart';


class AddressBookPage extends StatefulWidget {
  const AddressBookPage({Key? key});
  @override
  State<AddressBookPage> createState() => _AddressBookPageState();
}

class _AddressBookPageState extends State<AddressBookPage> {
  CollectionReference<Map<String, dynamic>> get addresses => FirebaseFirestore
      .instance
      .collection('users')
      .doc(FirebaseAuth.instance.currentUser!.uid)
      .collection('addresses');

  Future<LatLng?> _pickLocation({LatLng? initialLocation}) =>
      showLocationPicker(context, initialLocation: initialLocation);

  Future<void> addAddress() async {
    await showDialog(
      context: context,
      builder: (_) => _AddressFormDialog(
        onSave: (data) => addresses.doc().set(data),
        pickLocation: _pickLocation,
      ),
    );
  }

  Future<void> _selectOrUpdateLocation(QueryDocumentSnapshot<Map<String, dynamic>> document) async {
    final data = document.data();
    final current = data['location'] as GeoPoint?;
    if (current != null) {
      if (mounted) Navigator.pop(context, {'address_id': document.id, ...data});
      return;
    }
    final picked = await _pickLocation();
    if (picked == null) return;
    final location = GeoPoint(picked.latitude, picked.longitude);
    if (!await _updateLocation(document.reference, location)) return;
    if (mounted) Navigator.pop(context, {'address_id': document.id, ...data, 'location': location});
  }

  Future<bool> _updateLocation(DocumentReference<Map<String, dynamic>> reference, GeoPoint location) async {
    try {
      await reference.update({'location': location}).timeout(const Duration(seconds: 15));
      return true;
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذر تحديث الموقع الآن. تحقق من الاتصال وحاول مجددًا.')));
      return false;
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('عناويني'), actions: [IconButton(onPressed: addAddress, icon: const Icon(Icons.add))]),
        body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: addresses.snapshots(),
          builder: (context, snapshot) {
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            if (snapshot.data!.docs.isEmpty) return const Center(child: Text('لا توجد عناوين محفوظة بعد'));
            return ListView(
              children: snapshot.data!.docs.map((d) {
                final x = d.data();
                final location = x['location'] as GeoPoint?;
                return ListTile(
                  title: Text('${x['building'] ?? ''} - ${x['apartment'] ?? ''}'),
                  subtitle: Text('${x['landmark'] ?? ''}${location == null ? '\nالموقع غير محدد' : ''}'),
                  isThreeLine: location == null,
                  leading: Icon(location == null ? Icons.location_searching : Icons.location_on),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(icon: const Icon(Icons.edit_location_alt), onPressed: () async {
                        final picked = await _pickLocation(initialLocation: location == null ? null : LatLng(location.latitude, location.longitude));
                        if (picked != null) await _updateLocation(d.reference, GeoPoint(picked.latitude, picked.longitude));
                      }),
                      IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => d.reference.delete()),
                    ],
                  ),
                  onTap: () => _selectOrUpdateLocation(d),
                );
              }).toList(),
            );
          },
        ),
      );
}


class _AddressFormDialog extends StatefulWidget {
  final Future<void> Function(Map<String, dynamic> data) onSave;
  final Future<LatLng?> Function({LatLng? initialLocation}) pickLocation;
  const _AddressFormDialog({required this.onSave, required this.pickLocation});

  @override
  State<_AddressFormDialog> createState() => _AddressFormDialogState();
}

class _AddressFormDialogState extends State<_AddressFormDialog> {
  final building = TextEditingController();
  final floor = TextEditingController();
  final apartment = TextEditingController();
  final landmark = TextEditingController();
  LatLng? selectedLocation;
  bool saving = false;

  @override
  void dispose() {
    building.dispose();
    floor.dispose();
    apartment.dispose();
    landmark.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (selectedLocation == null || saving) return;
    setState(() => saving = true);
    try {
      await widget.onSave({
        'label': 'منزل',
        'building': building.text.trim(),
        'floor': floor.text.trim(),
        'apartment': apartment.text.trim(),
        'landmark': landmark.text.trim(),
        'location': GeoPoint(selectedLocation!.latitude, selectedLocation!.longitude),
        'is_default': false,
        'created_at': FieldValue.serverTimestamp(),
      }).timeout(const Duration(seconds: 15));
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (!mounted) return;
      setState(() => saving = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذر حفظ العنوان الآن. تحقق من الاتصال وحاول مجددًا.')));
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('إضافة عنوان'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: building, decoration: const InputDecoration(labelText: 'البناء')),
              TextField(controller: floor, decoration: const InputDecoration(labelText: 'الطابق')),
              TextField(controller: apartment, decoration: const InputDecoration(labelText: 'الشقة')),
              TextField(controller: landmark, decoration: const InputDecoration(labelText: 'علامة فارقة')),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: saving ? null : () async {
                  final picked = await widget.pickLocation(initialLocation: selectedLocation);
                  if (picked != null && mounted) setState(() => selectedLocation = picked);
                },
                icon: Icon(selectedLocation == null ? Icons.map_outlined : Icons.location_on),
                label: Text(selectedLocation == null ? 'تحديد الموقع على الخريطة أو GPS' : 'تغيير الموقع المحدد'),
              ),
              if (selectedLocation != null)
                Text('${selectedLocation!.latitude.toStringAsFixed(6)}, ${selectedLocation!.longitude.toStringAsFixed(6)}'),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: saving ? null : () => Navigator.pop(context), child: const Text('إلغاء')),
          FilledButton(
            onPressed: selectedLocation == null || saving ? null : save,
            child: saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('حفظ'),
          ),
        ],
      );
}

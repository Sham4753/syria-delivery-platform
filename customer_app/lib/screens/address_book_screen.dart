import 'dart:async';

import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../common.dart';

const _defaultMapCenter = LatLng(33.5138, 36.2765); // دمشق، كخيار احتياطي فقط.

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

  Future<LatLng?> _pickLocation({LatLng? initialLocation}) async {
    LatLng selected = initialLocation ?? _defaultMapCenter;
    final mapController = MapController();
    bool hasSelection = false;
    bool locating = false;
    String? locationError;
    bool permissionDeniedForever = false;

    return showDialog<LatLng>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          Future<void> useGps() async {
            setDialogState(() { locating = true; locationError = null; });
            try {
              if (!await Geolocator.isLocationServiceEnabled()) {
                throw StateError('فعّل خدمة الموقع في إعدادات الجهاز أولاً');
              }
              var permission = await Geolocator.checkPermission();
              if (permission == LocationPermission.denied) {
                permission = await Geolocator.requestPermission();
              }
              if (permission == LocationPermission.denied ||
                  permission == LocationPermission.deniedForever) {
                permissionDeniedForever = permission == LocationPermission.deniedForever;
                throw StateError(permissionDeniedForever
                    ? 'السماح بالموقع مطلوب من إعدادات التطبيق'
                    : 'لم يتم السماح بالوصول إلى الموقع');
              }
              final position = await Geolocator.getCurrentPosition(
                locationSettings: const LocationSettings(
                  accuracy: LocationAccuracy.high,
                  timeLimit: Duration(seconds: 15),
                ),
              );
              if (!context.mounted) return;
              setDialogState(() {
                selected = LatLng(position.latitude, position.longitude);
                hasSelection = true;
                locating = false;
              });
              mapController.move(selected, 16);
            } catch (error) {
              if (!context.mounted) return;
              setDialogState(() {
                locating = false;
                locationError = error is TimeoutException
                    ? 'تعذر الحصول على الموقع خلال المهلة المحددة'
                    : error.toString().replaceFirst('Bad state: ', '');
              });
            }
          }

          return AlertDialog(
            title: const Text('حدد موقع التوصيل'),
            contentPadding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            content: SizedBox(
              width: MediaQuery.sizeOf(context).width - 48,
              height: 430,
              child: Column(
                children: [
                  SizedBox(
                    height: 300,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: FlutterMap(
                        mapController: mapController,
                        options: MapOptions(
                          initialCenter: selected,
                          initialZoom: 13,
                          onTap: (_, point) => setDialogState(() {
                            selected = point;
                            hasSelection = true;
                            locationError = null;
                          }),
                        ),
                        children: [
                          TileLayer(
                            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                            userAgentPackageName: 'com.syria.delivery.customer',
                          ),
                          MarkerLayer(
                            markers: [
                              Marker(
                                point: selected,
                                width: 48,
                                height: 48,
                                child: Icon(
                                  hasSelection ? Icons.location_pin : Icons.add_location,
                                  size: 44,
                                  color: Theme.of(context).colorScheme.primary,
                                ),
                              ),
                            ],
                          ),
                          RichAttributionWidget(
                            attributions: [TextSourceAttribution('OpenStreetMap contributors')],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Text(
                      hasSelection
                          ? 'الإحداثيات: ${selected.latitude.toStringAsFixed(6)}, ${selected.longitude.toStringAsFixed(6)}'
                          : 'اضغط على الخريطة أو استخدم GPS لتحديد الموقع',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  if (locationError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(locationError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                  const Spacer(),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Wrap(
                      spacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: locating ? null : useGps,
                          icon: locating
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.my_location),
                          label: const Text('استخدام موقعي الحالي'),
                        ),
                        if (permissionDeniedForever)
                          TextButton(
                            onPressed: Geolocator.openAppSettings,
                            child: const Text('فتح الإعدادات'),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('إلغاء')),
              FilledButton(
                onPressed: hasSelection ? () => Navigator.pop(dialogContext, selected) : null,
                child: const Text('اعتماد الموقع'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> addAddress() async {
    final building = TextEditingController();
    final floor = TextEditingController();
    final apartment = TextEditingController();
    final landmark = TextEditingController();
    LatLng? selectedLocation;
    bool saving = false;
    try {
      await showDialog(
        context: context,
        builder: (_) => StatefulBuilder(
          builder: (dialogContext, setDialogState) => AlertDialog(
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
                    onPressed: () async {
                      final picked = await _pickLocation();
                      if (picked != null && dialogContext.mounted) setDialogState(() => selectedLocation = picked);
                    },
                    icon: Icon(selectedLocation == null ? Icons.map_outlined : Icons.location_on),
                    label: Text(selectedLocation == null ? 'تحديد الموقع على الخريطة أو GPS' : 'تغيير الموقع المحدد'),
                  ),
                  if (selectedLocation != null)
                    Text('${selectedLocation!.latitude.toStringAsFixed(6)}, ${selectedLocation!.longitude.toStringAsFixed(6)}', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('إلغاء')),
              FilledButton(
                onPressed: selectedLocation == null || saving
                    ? null
                    : () async {
                        setDialogState(() => saving = true);
                        try {
                          await addresses.add({
                            'label': 'منزل',
                            'building': building.text.trim(),
                            'floor': floor.text.trim(),
                            'apartment': apartment.text.trim(),
                            'landmark': landmark.text.trim(),
                            'location': GeoPoint(selectedLocation!.latitude, selectedLocation!.longitude),
                            'is_default': false,
                            'created_at': FieldValue.serverTimestamp(),
                          }).timeout(const Duration(seconds: 15));
                          if (dialogContext.mounted) Navigator.pop(dialogContext);
                        } catch (_) {
                          if (!dialogContext.mounted) return;
                          setDialogState(() => saving = false);
                          ScaffoldMessenger.of(this.context).showSnackBar(const SnackBar(content: Text('تعذر حفظ العنوان الآن. تحقق من الاتصال وحاول مجددًا.')));
                        }
                      },
                child: saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('حفظ'),
              ),
            ],
          ),
        ),
      );
    } finally {
      building.dispose();
      floor.dispose();
      apartment.dispose();
      landmark.dispose();
    }
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
    await document.reference.update({'location': location});
    if (mounted) Navigator.pop(context, {'address_id': document.id, ...data, 'location': location});
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
                        if (picked != null) await d.reference.update({'location': GeoPoint(picked.latitude, picked.longitude)});
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

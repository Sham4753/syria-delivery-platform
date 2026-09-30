import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

const _defaultMapCenter = LatLng(33.5138, 36.2765);

Future<LatLng?> showLocationPicker(BuildContext context, {LatLng? initialLocation}) {
  return Navigator.push<LatLng>(
    context,
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => LocationPickerPage(initialLocation: initialLocation),
    ),
  );
}

class LocationPickerPage extends StatefulWidget {
  final LatLng? initialLocation;
  const LocationPickerPage({super.key, this.initialLocation});

  @override
  State<LocationPickerPage> createState() => _LocationPickerPageState();
}

class _LocationPickerPageState extends State<LocationPickerPage> {
  late LatLng selected = widget.initialLocation ?? _defaultMapCenter;
  late bool hasSelection = widget.initialLocation != null;
  final mapController = MapController();
  bool locating = false;
  bool permissionDeniedForever = false;
  String? locationError;

  Future<void> useGps() async {
    setState(() {
      locating = true;
      locationError = null;
      permissionDeniedForever = false;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw StateError('فعّل خدمة الموقع في إعدادات الجهاز أولاً');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
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
      if (!mounted) return;
      setState(() {
        selected = LatLng(position.latitude, position.longitude);
        hasSelection = true;
        locating = false;
      });
      mapController.move(selected, 16);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        locating = false;
        locationError = error is TimeoutException
            ? 'تعذر الحصول على الموقع خلال المهلة المحددة'
            : error is StateError
                ? error.message
                : 'تعذر الحصول على موقعك. تحقق من إعدادات الموقع وحاول مجددًا.';
      });
    }
  }

  @override
  void dispose() {
    mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('حدد موقع التوصيل'),
          actions: [
            TextButton(
              onPressed: hasSelection ? () => Navigator.pop(context, selected) : null,
              child: const Text('اعتماد الموقع'),
            ),
          ],
        ),
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: FlutterMap(
                  mapController: mapController,
                  options: MapOptions(
                    initialCenter: selected,
                    initialZoom: 13,
                    onTap: (_, point) => setState(() {
                      selected = point;
                      hasSelection = true;
                      locationError = null;
                    }),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.mycompany.mimoapp',
                    ),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: selected,
                          width: 48,
                          height: 48,
                          child: Icon(Icons.location_pin, size: 44, color: Theme.of(context).colorScheme.primary),
                        ),
                      ],
                    ),
                    RichAttributionWidget(
                      attributions: [
                        TextSourceAttribution(
                          'OpenStreetMap contributors',
                          onTap: () => launchUrl(Uri.parse('https://www.openstreetmap.org/copyright')),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      hasSelection
                          ? 'الإحداثيات: ${selected.latitude.toStringAsFixed(6)}, ${selected.longitude.toStringAsFixed(6)}'
                          : 'اضغط على الخريطة أو استخدم GPS لتحديد الموقع',
                    ),
                    if (locationError != null)
                      Text(locationError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    const SizedBox(height: 8),
                    Wrap(
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
                          TextButton(onPressed: Geolocator.openAppSettings, child: const Text('فتح الإعدادات')),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

import '../common.dart';

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
  Future<void> addAddress() async {
    final building = TextEditingController(),
        floor = TextEditingController(),
        apartment = TextEditingController(),
        landmark = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('إضافة عنوان'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: building,
              decoration: const InputDecoration(labelText: 'البناء'),
            ),
            TextField(
              controller: floor,
              decoration: const InputDecoration(labelText: 'الطابق'),
            ),
            TextField(
              controller: apartment,
              decoration: const InputDecoration(labelText: 'الشقة'),
            ),
            TextField(
              controller: landmark,
              decoration: const InputDecoration(labelText: 'علامة فارقة'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () async {
              await addresses.add({
                'label': 'منزل',
                'building': building.text,
                'floor': floor.text,
                'apartment': apartment.text,
                'landmark': landmark.text,
                'location': null,
                'is_default': false,
                'created_at': FieldValue.serverTimestamp(),
              });
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('حفظ'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('عناويني'),
      actions: [IconButton(onPressed: addAddress, icon: const Icon(Icons.add))],
    ),
    body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: addresses.snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return ListView(
          children: snapshot.data!.docs.map((d) {
            final x = d.data();
            return ListTile(
              title: Text('${x['building'] ?? ''} - ${x['apartment'] ?? ''}'),
              subtitle: Text(x['landmark'] ?? ''),
              leading: const Icon(Icons.location_on),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () => d.reference.delete(),
              ),
              onTap: () => Navigator.pop(context, {'address_id': d.id, ...x}),
            );
          }).toList(),
        );
      },
    ),
  );
}

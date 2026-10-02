import 'dart:async';

import '../common.dart';
import 'errand_screen.dart';
import 'orders_screen.dart';
import 'products_screen.dart';
import 'wallet_screen.dart';
import '../services/order_outbox.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String category = 'restaurant';
  String search = '';
  String sort = 'speed';
  late Future<Map<String, dynamic>> configFuture;
  late Future<List<Map<String, dynamic>>> vendorFuture;

  @override
  void initState() {
    super.initState();
    configFuture = loadSystemConfig();
    vendorFuture = loadVendors(category);
    unawaited(OrderOutbox.flush());
  }

  final labels = const {
    'restaurant': 'مطاعم',
    'pharmacy': 'صيدلية',
    'grocery': 'بقالة',
  };

  void showSortDialog() {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('ترتيب النتائج'),
        content: DropdownButton<String>(
          value: sort,
          isExpanded: true,
          items: const [
            DropdownMenuItem(value: 'speed', child: Text('الأسرع')),
            DropdownMenuItem(value: 'rating', child: Text('الأعلى تقييمًا')),
            DropdownMenuItem(value: 'cost', child: Text('الأقل تكلفة')),
          ],
          onChanged: (value) {
            if (value != null) setState(() => sort = value);
            Navigator.pop(context);
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('المزودون'),
        actions: [
          IconButton(
            icon: const Icon(Icons.account_balance_wallet),
            tooltip: 'المحفظة والولاء',
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CustomerWalletPage())),
          ),
          IconButton(
            icon: const Icon(Icons.receipt_long),
            tooltip: 'طلباتي',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const OrdersHistoryPage()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.inventory_2),
            tooltip: 'أمانات',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ErrandPage()),
            ),
          ),
          IconButton(icon: const Icon(Icons.sort), onPressed: showSortDialog),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: configFuture,
        builder: (context, settingsSnapshot) {
          final settings = settingsSnapshot.data ?? {};
          final now = DateTime.now();
          final banners = (settings['banners'] as List? ?? [])
              .whereType<Map>()
              .where((banner) {
                if (banner['is_active'] == false) return false;
                final start = DateTime.tryParse('${banner['starts_at'] ?? ''}');
                final end = DateTime.tryParse('${banner['ends_at'] ?? ''}');
                return (start == null || !now.isBefore(start)) &&
                    (end == null || now.isBefore(end));
              })
              .toList();
          final configuredCategories = (settings['categories'] as List? ?? [])
              .whereType<Map>()
              .where((item) => item['id'] != null && item['name'] != null)
              .map(
                (item) =>
                    MapEntry(item['id'].toString(), item['name'].toString()),
              );
          final activeLabels = configuredCategories.isEmpty
              ? labels
              : Map<String, String>.fromEntries(configuredCategories);
          final featured = (settings['featured_vendor_ids'] as List? ?? [])
              .cast<String>();
          final freeDeliveryVendors =
              (settings['free_delivery_vendor_ids'] as List? ?? [])
                  .cast<String>();

          return Column(
            children: [
              if (settings['emergency_mode'] == true &&
                  (settings['emergency_message'] ?? '').toString().isNotEmpty)
                Container(
                  width: double.infinity,
                  color: Colors.orange.shade800,
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    settings['emergency_message'].toString(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              if (banners.isNotEmpty)
                SizedBox(
                  height: 125,
                  child: PageView(
                    children: banners.map((banner) {
                      final imageUrl = '${banner['image_url'] ?? ''}';
                      return Card(
                        margin: const EdgeInsets.all(10),
                        clipBehavior: Clip.antiAlias,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(
                              imageUrl,
                              fit: BoxFit.cover,
                              cacheWidth: settings['low_bandwidth_mode'] == true
                                  ? 480
                                  : 960,
                              filterQuality:
                                  settings['low_bandwidth_mode'] == true
                                  ? FilterQuality.low
                                  : FilterQuality.medium,
                              errorBuilder: (context, error, stackTrace) =>
                                  Container(color: Colors.blueGrey),
                            ),
                            Container(color: Colors.black38),
                            Align(
                              alignment: Alignment.bottomRight,
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Text(
                                  '${banner['title'] ?? ''}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: 'ابحث عن مطعم أو متجر أو صيدلية',
                  ),
                  onChanged: (value) =>
                      setState(() => search = value.trim().toLowerCase()),
                ),
              ),
              Wrap(
                spacing: 8,
                children: activeLabels.entries
                    .map(
                      (entry) => ChoiceChip(
                        label: Text(entry.value),
                        selected: category == entry.key,
                        onSelected: (_) => setState(() {
                          category = entry.key;
                          vendorFuture = loadVendors(category);
                        }),
                      ),
                    )
                    .toList(),
              ),
              Expanded(
                child: FutureBuilder<List<Map<String, dynamic>>>(
                  future: vendorFuture,
                  builder: (context, snapshot) {
                    if (snapshot.hasError) {
                      return const Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('تعذر الاتصال الآن. اسحب للتحديث أو تحقق من الشبكة.'),
                        ),
                      );
                    }
                    if (!snapshot.hasData) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    final docs = snapshot.data!.toList();
                    if (docs.isEmpty) {
                      return Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            useFirebaseEmulators
                                ? 'لا يوجد مزودون بهذه الفئة حالياً.\n(وضع Emulator مفعّل — تأكد أن public_vendors فيها بيانات وأن category مطابقة)'
                                : 'لا يوجد مزودون بهذه الفئة حالياً.',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      );
                    }
                    docs.sort((a, b) {
                      final aFeatured = featured.contains(a['id']);
                      final bFeatured = featured.contains(b['id']);
                      if (aFeatured == bFeatured) return 0;
                      return aFeatured ? -1 : 1;
                    });
                    return ListView(
                      children: docs.map((data) {
                        final vendorId = '${data['id'] ?? ''}';
                        final open =
                            vendorIsOpen(data) && data['is_busy'] != true;
                        final name = '${data['name'] ?? ''}';
                        if (search.isNotEmpty &&
                            !name.toLowerCase().contains(search)) {
                          return const SizedBox.shrink();
                        }
                        final status = freeDeliveryVendors.contains(vendorId)
                            ? ' — توصيل مجاني'
                            : '';
                        final rating = (data['rating_average'] as num?)?.toDouble() ?? 0;
                        final ratingCount = (data['rating_count'] as num?)?.toInt() ?? 0;
                        return Card(
                          child: InkWell(
                            borderRadius: BorderRadius.circular(20),
                            onTap: open
                                ? () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => ProductsPage(
                                        vendorId: vendorId,
                                        name: name,
                                        zoneId: data['zone_id'] ?? '',
                                      ),
                                    ),
                                  )
                                : null,
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                children: [
                                  Container(
                                    width: 54,
                                    height: 54,
                                    decoration: BoxDecoration(
                                      color: featured.contains(vendorId)
                                          ? Colors.amber.shade50
                                          : Theme.of(context)
                                                .colorScheme
                                                .primaryContainer,
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    child: Icon(
                                      featured.contains(vendorId)
                                          ? Icons.star_rounded
                                          : Icons.storefront_rounded,
                                      color: featured.contains(vendorId)
                                          ? Colors.amber.shade800
                                          : Theme.of(context)
                                                .colorScheme
                                                .primary,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 16,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '${data['address'] ?? ''}${open ? '' : ' • مغلق الآن'}',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            color: Colors.blueGrey.shade600,
                                            fontSize: 12,
                                          ),
                                        ),
                                        if (ratingCount > 0)
                                          Padding(
                                            padding: const EdgeInsets.only(top: 4),
                                            child: Text('★ ${rating.toStringAsFixed(1)} ($ratingCount)', style: TextStyle(color: Colors.amber.shade800, fontSize: 12, fontWeight: FontWeight.w600)),
                                          ),
                                        if (status.isNotEmpty || !open)
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              top: 8,
                                            ),
                                            child: Wrap(
                                              spacing: 6,
                                              children: [
                                                if (status.isNotEmpty)
                                                  _HomeBadge(
                                                    label: 'توصيل مجاني',
                                                    color: Colors.teal,
                                                  ),
                                                if (!open)
                                                  const _HomeBadge(
                                                    label: 'مغلق الآن',
                                                    color: Colors.blueGrey,
                                                  ),
                                              ],
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  Icon(
                                    Icons.chevron_left_rounded,
                                    color: open
                                        ? Theme.of(context).colorScheme.primary
                                        : Colors.blueGrey.shade200,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _HomeBadge extends StatelessWidget {
  final String label;
  final Color color;

  const _HomeBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
  );
}

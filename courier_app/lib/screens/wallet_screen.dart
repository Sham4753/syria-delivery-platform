import '../common.dart';

class WalletSummary extends StatelessWidget {
  final String? uid;

  const WalletSummary({Key? key, required this.uid});

  @override
  Widget build(BuildContext context) {
    final stream = uid == null
        ? null
        : FirebaseFirestore.instance
              .collection('courier_wallets')
              .doc(uid)
              .snapshots();

    return StreamBuilder<DocumentSnapshot>(
      stream: stream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        final data = snapshot.data?.data() as Map<String, dynamic>? ?? {};
        final balance = data['balance'] ?? 0;
        final earnings = data['total_earnings'] ?? 0;
        final debt = data['debt'] ?? 0;

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.account_balance_wallet),
                    SizedBox(width: 8),
                    Text(
                      'المحفظة والأرباح',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('الرصيد الحالي'),
                  trailing: Text(formatMoney(balance)),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('إجمالي الأرباح'),
                  trailing: Text(formatMoney(earnings)),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('الدين المسجل'),
                  trailing: Text(formatMoney(debt)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

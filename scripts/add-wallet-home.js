const fs = require('fs');
const file = require('path').resolve(__dirname, '..', 'customer_app/lib/screens/home_screen.dart');
let text = fs.readFileSync(file, 'utf8');
if (!text.includes("import 'wallet_screen.dart';")) text = text.replace("import 'products_screen.dart';", "import 'products_screen.dart';\nimport 'wallet_screen.dart';");
const old = "actions: [\n          IconButton(\n            icon: const Icon(Icons.receipt_long),";
const replacement = "actions: [\n          IconButton(\n            icon: const Icon(Icons.account_balance_wallet),\n            tooltip: 'المحفظة والولاء',\n            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CustomerWalletPage())),\n          ),\n          IconButton(\n            icon: const Icon(Icons.receipt_long),";
if (text.includes(old)) text = text.replace(old, replacement);
fs.writeFileSync(file, text);

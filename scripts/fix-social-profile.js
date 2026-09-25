const fs = require('fs');
const file = require('path').resolve(__dirname, '..', 'customer_app/lib/screens/login_screen.dart');
let text = fs.readFileSync(file, 'utf8');
const old = "await FirebaseAuth.instance.signInWithPopup(provider);\n      await registerPushToken();";
const next = "final result = await FirebaseAuth.instance.signInWithPopup(provider);\n      final user = result.user;\n      if (user != null) await FirebaseFirestore.instance.collection('users').doc(user.uid).set({'role': 'customer', 'display_name': user.displayName ?? '', 'phone': user.phoneNumber ?? '', 'updated_at': FieldValue.serverTimestamp()}, SetOptions(merge: true));\n      await registerPushToken();";
if (!text.includes(old)) throw new Error('social login anchor not found');
fs.writeFileSync(file, text.replace(old, next));

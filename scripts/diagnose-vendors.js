// فحص شامل لمشكلة "المزودون لا يظهرون عند الزبون"
// يفحص: هل الـ emulators شغالة، هل vendors موجودة، هل public_vendors متزامنة،
// وهل is_active/category صحيحة لكل مزود. يطبع تقرير عربي واضح بالنهاية.
const path = require('path');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}

const LINE = '─'.repeat(60);
const problems = [];
const ok = (msg) => console.log(`  ✅ ${msg}`);
const bad = (msg) => { console.log(`  ❌ ${msg}`); problems.push(msg); };
const warn = (msg) => console.log(`  ⚠️  ${msg}`);

async function checkPort(port, name) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = net.createConnection(port, '127.0.0.1');
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); ok(`${name} شغّال (بورت ${port})`); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); bad(`${name} غير شغّال أو ما بيرد (بورت ${port})`); resolve(false); });
    socket.on('error', () => { bad(`${name} غير شغّال (بورت ${port}) — شغّل: firebase emulators:start --only auth,firestore,functions`); resolve(false); });
  });
}

async function main() {
  console.log(LINE);
  console.log('  فحص 1: هل الخدمات المحلية شغّالة؟');
  console.log(LINE);
  const firestoreUp = await checkPort(8080, 'Firestore emulator');
  await checkPort(5001, 'Functions emulator');
  await checkPort(9099, 'Auth emulator');
  await checkPort(4000, 'Emulator UI');

  if (!firestoreUp) {
    console.log('\nتوقفت هون لأن Firestore مش شغّال. شغّل start-all.bat وأعد تشغيل هذا السكربت.');
    process.exit(1);
  }

  const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-syria-delivery' });
  const db = admin.firestore();

  console.log('\n' + LINE);
  console.log('  فحص 2: مجموعة vendors (الداخلية)');
  console.log(LINE);
  const vendorsSnap = await db.collection('vendors').get();
  if (vendorsSnap.empty) {
    bad('مجموعة vendors فاضية بالكامل — لسا ما ضفت ولا مزود من لوحة الإدارة أو سكربت الزرع لم يشتغل.');
  } else {
    ok(`عدد المزودين بمجموعة vendors: ${vendorsSnap.size}`);
  }

  console.log('\n' + LINE);
  console.log('  فحص 3: مجموعة public_vendors (اللي يقرأها تطبيق الزبون)');
  console.log(LINE);
  const publicSnap = await db.collection('public_vendors').get();
  const publicIds = new Set(publicSnap.docs.map((d) => d.id));
  if (publicSnap.empty && !vendorsSnap.empty) {
    bad('public_vendors فاضية رغم وجود مزودين بـ vendors — يعني دالة syncPublicVendor ما اشتغلت (تأكد أن Functions emulator شغّال، أو شغّل: node scripts/seed-emulator.js).');
  } else if (publicSnap.empty) {
    warn('public_vendors فاضية — متوقع لأن vendors فاضية أيضاً.');
  } else {
    ok(`عدد المستندات بـ public_vendors: ${publicSnap.size}`);
  }

  console.log('\n' + LINE);
  console.log('  فحص 4: مطابقة كل مزوّد (is_active / category / المزامنة)');
  console.log(LINE);
  const validCategories = ['restaurant', 'pharmacy', 'grocery'];
  let anyVisible = false;
  for (const doc of vendorsSnap.docs) {
    const v = doc.data();
    const label = `${v.name || doc.id} (${doc.id})`;
    const isActive = v.is_active === true;
    const categoryOk = validCategories.includes(v.category);
    const synced = publicIds.has(doc.id);
    if (!synced) { bad(`${label}: غير متزامن مع public_vendors إطلاقاً.`); continue; }
    if (!isActive) { bad(`${label}: is_active ليست true — لن يظهر عند الزبون حتى لو تزامن.`); continue; }
    if (!categoryOk) { bad(`${label}: category = "${v.category}" غير صالحة (يجب: restaurant/pharmacy/grocery).`); continue; }
    ok(`${label}: متزامن وصالح ويجب أن يظهر عند الزبون.`);
    anyVisible = true;
  }

  console.log('\n' + LINE);
  console.log('  الخلاصة');
  console.log(LINE);
  if (anyVisible && problems.length === 0) {
    console.log('  كل شي سليم من جهة البيانات. إذا الزبون بعده ما شايف شي:');
    console.log('  السبب شبه مؤكد أن تطبيق الزبون نفسه غير متصل بالـ emulator.');
    console.log('  تأكد أنك شغّلته بـ: flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1');
    console.log('  أو من VS Code باستخدام إعداد "Emulator - Chrome" بملف .vscode/launch.json.');
  } else if (anyVisible) {
    console.log(`  في ${problems.length} مشكلة/مشاكل محددة أعلاه (❌) — بعض المزودين سليمين وبعضهم لأ. صحح البنود المعلّمة ❌.`);
  } else {
    console.log('  ولا مزوّد واحد جاهز للظهور عند الزبون. راجع كل سطر ❌ أعلاه بالترتيب وصححه.');
  }
  console.log(LINE);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ فشل السكربت بخطأ غير متوقع:', err.message);
  console.error('تأكد أن Firestore emulator شغّال وأن functions/node_modules موجودة (npm install داخل functions).');
  process.exit(1);
});

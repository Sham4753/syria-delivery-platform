const { execFileSync } = require('child_process');
const ports = [8080, 9099, 5001];
function run(args) { return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
try {
  const devices = run(['devices']).split(/\r?\n/).slice(1).filter(line => line.endsWith('\tdevice'));
  if (!devices.length) throw new Error('لم يتم العثور على هاتف متصل بحالة device. فعّل USB debugging واقبل رسالة RSA.');
  for (const deviceLine of devices) {
    const serial = deviceLine.split('\t')[0];
    for (const port of ports) run(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    console.log(`تم إعداد adb reverse للجهاز ${serial}: ${ports.join(', ')}`);
  }
  console.log('استخدم EMULATOR_HOST=127.0.0.1 عند تشغيل تطبيق Flutter على الهاتف الحقيقي.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

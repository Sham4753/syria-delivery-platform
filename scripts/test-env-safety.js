const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const tracked = execFileSync('git', ['ls-files'], {cwd: root, encoding: 'utf8'})
  .split(/\r?\n/)
  .filter(Boolean);
const forbidden = /^\s*SMOKE_FAIL_AFTER_ORDER_WRITE\s*=/m;
const unsafeFiles = tracked.filter((relative) => {
  const name = path.basename(relative);
  const isEnv = name === '.env' || name.startsWith('.env.');
  const isLocalOnly = name === '.env.local' || name === '.env.example';
  if (!isEnv || isLocalOnly) return false;
  return forbidden.test(fs.readFileSync(path.join(root, relative), 'utf8'));
});

if (unsafeFiles.length) {
  throw new Error(`SMOKE_FAIL_AFTER_ORDER_WRITE must not be tracked outside local env files: ${unsafeFiles.join(', ')}`);
}

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
if (!/^\.env\.\*/m.test(gitignore) || !/^!\.env\.example$/m.test(gitignore)) {
  throw new Error('.gitignore must ignore .env.* while allowing .env.example');
}

console.log('env safety tests passed');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {sanitize} = require('../functions/logger');
const serverLogger = require('../server/src/logger');

const input = {
  password: 'do-not-log',
  access_token: 'do-not-log',
  nested: {api_key: 'do-not-log', visible: 'kept'},
  long: 'x'.repeat(700),
};
const safe = sanitize(input);
assert.equal(safe.password, '[redacted]');
assert.equal(safe.access_token, '[redacted]');
assert.equal(safe.nested.api_key, '[redacted]');
assert.equal(safe.nested.visible, 'kept');
assert.ok(safe.long.length <= 501);
assert.equal(serverLogger.sanitize({authorization: 'secret'}).authorization, '[redacted]');

const functionsSource = fs.readFileSync('functions/index.js', 'utf8');
const serverSource = fs.readFileSync('server/src/app.js', 'utf8');
assert.match(functionsSource, /callable_operation_failed/);
assert.match(serverSource, /x-request-id/);
assert.match(serverSource, /http_unhandled_error/);

console.log('batch5 error/logging contract tests passed');

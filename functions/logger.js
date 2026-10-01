'use strict';

const SENSITIVE = /password|secret|token|authorization|api[_-]?key|otp|credential|private[_-]?key/i;

function sanitize(value, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (value instanceof Error) return {name: value.name, message: String(value.message).slice(0, 300), code: value.code || undefined};
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key, SENSITIVE.test(key) ? '[redacted]' : sanitize(item, depth + 1)]));
  }
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  return value;
}

function write(level, event, details = {}) {
  const record = {severity: level, event: String(event).slice(0, 100), timestamp: new Date().toISOString(), ...sanitize(details)};
  const output = JSON.stringify(record);
  if (level === 'ERROR') console.error(output);
  else if (level === 'WARNING') console.warn(output);
  else console.log(output);
}

function logError(event, error, details = {}) {
  write('ERROR', event, {...details, error});
}
function logWarn(event, details = {}) {
  write('WARNING', event, details);
}
function logInfo(event, details = {}) {
  write('INFO', event, details);
}

module.exports = {sanitize, write, logError, logWarn, logInfo};

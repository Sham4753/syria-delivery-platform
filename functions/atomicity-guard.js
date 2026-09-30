function prepareCreateOrderPayload(data, {functionsEmulator = false} = {}) {
  const payload = data && typeof data === 'object' && !Array.isArray(data) ? {...data} : {};
  const smokeFields = Object.keys(payload).filter((key) => key.startsWith('__smoke'));
  if (smokeFields.length && !functionsEmulator) {
    const error = new Error('حقول الاختبار المحلي غير مسموحة');
    error.code = 'invalid-argument';
    throw error;
  }
  if (smokeFields.some((key) => key !== '__smoke_fail_after_order_write')) {
    const error = new Error('حقل اختبار محلي غير معروف');
    error.code = 'invalid-argument';
    throw error;
  }
  const shouldInjectFailure = functionsEmulator && payload.__smoke_fail_after_order_write === true;
  delete payload.__smoke_fail_after_order_write;
  return {payload, shouldInjectFailure};
}

module.exports = {prepareCreateOrderPayload};

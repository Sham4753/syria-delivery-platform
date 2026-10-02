/* global fetch, URLSearchParams */
const ALERT_ENDPOINT = 'https://api.twilio.com/2010-04-01/Accounts';

function normalizedPhone(value) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!raw) return '';
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('09') && raw.length === 10) return `+963${raw.slice(1)}`;
  return raw.startsWith('+') ? raw : `+${raw}`;
}

async function sendTwilioMessage({to, body, channel}) {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = channel === 'whatsapp'
    ? String(process.env.TWILIO_WHATSAPP_FROM || '').trim()
    : String(process.env.TWILIO_SMS_FROM || '').trim();
  if (!sid || !token || !from) throw new Error(`Twilio ${channel} is not configured`);
  const recipient = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  const response = await fetch(`${ALERT_ENDPOINT}/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({To: recipient, From: from, Body: body}),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twilio ${channel} failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return {channel, sent: true};
}

/**
 * Sends an operational alert only when MERCHANT_ALERT_CHANNEL is configured.
 * Channel values: off (default), sms, whatsapp, or both.
 * When both/whatsapp is selected, SMS is attempted as a fallback if WhatsApp fails.
 */
async function sendMerchantFallback({phone, body, logWarn = () => {}}) {
  const channel = String(process.env.MERCHANT_ALERT_CHANNEL || 'off').trim().toLowerCase();
  const to = normalizedPhone(phone);
  if (channel === 'off' || !to) return {enabled: false, sent: false};
  const results = [];
  const wantsWhatsApp = channel === 'whatsapp' || channel === 'both';
  const wantsSms = channel === 'sms' || channel === 'both' || channel === 'whatsapp';
  if (wantsWhatsApp) {
    try {
      results.push(await sendTwilioMessage({to, body, channel: 'whatsapp'}));
      return {enabled: true, sent: true, results};
    } catch (error) {
      logWarn('merchant_whatsapp_fallback_failed', {channel: 'whatsapp', error: error.message});
    }
  }
  if (wantsSms) {
    try {
      results.push(await sendTwilioMessage({to, body, channel: 'sms'}));
      return {enabled: true, sent: true, results};
    } catch (error) {
      logWarn('merchant_sms_fallback_failed', {channel: 'sms', error: error.message});
    }
  }
  return {enabled: true, sent: false, results};
}

module.exports = {normalizedPhone, sendMerchantFallback};

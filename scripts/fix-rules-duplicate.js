const fs = require('fs');
const file = require('path').resolve(__dirname, '..', 'firestore.rules');
let text = fs.readFileSync(file, 'utf8');
text = text.replace("'display_name', 'phone', 'fcm_token', 'referred_by', 'updated_at', 'emergency_mode_seen', 'display_name', 'phone'", "'display_name', 'phone', 'fcm_token', 'referred_by', 'updated_at', 'emergency_mode_seen'");
fs.writeFileSync(file, text);

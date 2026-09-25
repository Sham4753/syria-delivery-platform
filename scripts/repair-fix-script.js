const fs = require('fs');
const file = require('path').resolve(__dirname, 'fix-flutter-errors.js');
let text = fs.readFileSync(file, 'utf8');
text = text.replaceAll('\\\\${', '\\${');
fs.writeFileSync(file, text);

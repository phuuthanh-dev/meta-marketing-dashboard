const fs = require('fs');
const path = require('path');

function decodeHtmlEntities(text) {
  return text.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

const files = [
  'public/index.html',
  'public/login.html'
];

files.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = decodeHtmlEntities(content);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Converted: ${file}`);
  } else {
    console.log(`✗ Not found: ${file}`);
  }
});

console.log('\nDone! HTML files now use UTF-8 encoding directly.');

const fs = require('fs');
const path = require('path');

const files = [
  'public/index.html',
  'public/login.html',
  'public/js/ads.js',
  'public/js/instagram.js',
  'public/js/phase3-charts.js'
];

const patterns = [
  'khong ', ' duoc ', ' da ', ' se ', 'khong the', 'khong con',
  'khong co', 'khong duoc', 'khong ho tro', 'khong hoat dong',
  'khong on dinh', 'khong tra ve', 'khong tra', 'khong hien thi',
  'khong hien', 'khong tim thay', 'khong co gi', 'khong co du lieu',
  'khong co thong tin', 'khong the thuc hien', 'khong the truy cap',
  'khong the tai', 'khong the xem', 'chon ', 'tai ', 'nhap ',
  'dang ', 'quan ly', 'thong tin', 'bao cao', 'tich cuc', 'phan tich'
];

let count = 0;

files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      for (const p of patterns) {
        if (lower.includes(p) &&
            !line.includes('function') &&
            !line.includes('const ') &&
            !line.includes('let ') &&
            !line.includes('var ') &&
            !line.includes('//') &&
            !line.includes('http') &&
            !line.includes('<script')) {
          console.log(`${file}:${i+1}: ${line.trim().substring(0, 100)}`);
          count++;
          break;
        }
      }
    });
  } catch(e) {}
});

console.log(`\nTotal: ${count} lines found`);

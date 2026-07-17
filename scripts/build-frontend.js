/**
 * scripts/build-frontend.js
 * Bundle + minify tất cả JS frontend vào 1 file duy nhất
 * Dùng: node scripts/build-frontend.js
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const OUT_DIR = path.join(PUBLIC, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'bundle.min.js');
const VENDOR_DIR = path.join(PUBLIC, 'js', 'vendor');
const CHART_SRC = path.resolve(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
const CHART_OUT = path.join(VENDOR_DIR, 'chart.min.js');

// Thứ tự QUAN TRỌNG: phải load theo dependency order
const JS_FILES = [
  'js/api.js',           // api client — không phụ thuộc gì
  'js/charts.js',        // chart utilities — cần api
  'js/app.js',           // app controller — cần api + charts
  'js/phase1.js',        // FB posts/comments — cần app
  'js/phase2.js',        // messages/media — cần app
  'js/phase3.js',        // analytics — cần app + charts
  'js/phase3-charts.js', // advanced charts — cần phase3
  'js/additional-charts.js', // extra charts — cần phase3
  'js/ads.js',           // ads module — cần app
  'js/instagram.js',     // instagram module — cần app
  'js/content-plan.js',  // content plan module — cần app
].map(f => path.join(PUBLIC, f));

async function build() {
  // Tạo output dir
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(VENDOR_DIR)) {
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
  }

  // Copy local Chart.js UMD build so index.html has no CDN dependency.
  fs.copyFileSync(CHART_SRC, CHART_OUT);

  const startMs = Date.now();

  // Đọc và nối tất cả files, mỗi file cách nhau bằng comment
  const combined = JS_FILES.map(filePath => {
    const name = path.basename(filePath);
    const src = fs.readFileSync(filePath, 'utf8');
    return `/* ── ${name} ── */\n${src}`;
  }).join('\n\n');

  // Ghi file tạm để esbuild minify
  const tmpFile = path.join(OUT_DIR, '_combined.tmp.js');
  fs.writeFileSync(tmpFile, combined, 'utf8');

  // Minify bằng esbuild (rất nhanh — <100ms)
  await esbuild.build({
    entryPoints: [tmpFile],
    bundle: false,     // không bundle imports, chỉ minify
    minify: true,
    sourcemap: false,
    platform: 'browser',
    outfile: OUT_FILE,
  });

  // Xóa file tạm
  fs.unlinkSync(tmpFile);

  const elapsed = Date.now() - startMs;
  const rawKb = (JS_FILES.reduce((sum, f) => sum + fs.statSync(f).size, 0) / 1024).toFixed(1);
  const outKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  const saved = (((rawKb - outKb) / rawKb) * 100).toFixed(0);

  console.log(`✅ Bundle built in ${elapsed}ms`);
  console.log(`   Input : ${rawKb} KB (${JS_FILES.length} files)`);
  console.log(`   Output: ${outKb} KB (1 file)`);
  console.log(`   Saved : ${saved}% smaller`);
  console.log(`   Vendor: public/js/vendor/chart.min.js`);
  console.log(`   → public/dist/bundle.min.js`);
}

build().catch(err => {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
});

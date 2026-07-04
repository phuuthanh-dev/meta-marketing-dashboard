const Database = require('../src/database');
const config = require('../src/config');

console.log('🧪 Testing database operations...\n');

const db = new Database();

// Test save page
console.log('1️⃣  Saving test page...');
db.savePage({
  id: 'test_page_1',
  name: 'Test Page',
  category: 'Test',
  fan_count: 100,
  followers_count: 50,
  portfolio: 'Test Portfolio'
});
console.log('✅ Page saved\n');

// Test get pages
console.log('2️⃣  Getting all pages...');
const pages = db.getPages();
console.log(`Found ${pages.length} pages`);
console.log('Pages:', pages.map(p => `${p.name} (${p.fan_count} fans)`).join(', '));
console.log();

// Test save page metrics
console.log('3️⃣  Saving page metrics...');
const today = new Date().toISOString().split('T')[0];
db.savePageMetrics({
  page_id: 'test_page_1',
  date: today,
  post_engagements: 10,
  video_views: 5,
  total_actions: 15,
  reactions_like: 8,
  reactions_love: 2,
  reactions_wow: 1,
  reactions_haha: 3,
  reactions_sorry: 0,
  reactions_anger: 1
});
console.log('✅ Metrics saved\n');

// Test get page metrics
console.log('4️⃣  Getting page metrics...');
const metrics = db.getPageMetrics('test_page_1', 7);
console.log(`Found ${metrics.length} metric records`);
if (metrics.length > 0) {
  const m = metrics[0];
  console.log(`Latest: ${m.date} - ${m.post_engagements} engagements, ${m.video_views} video views`);
}
console.log();

// Cleanup
console.log('5️⃣  Cleaning up test data...');
const db2 = require('better-sqlite3')('./data/metrics.db');
db2.prepare('DELETE FROM pages WHERE id = ?').run('test_page_1');
db2.prepare('DELETE FROM page_metrics WHERE page_id = ?').run('test_page_1');
db2.close();
console.log('✅ Test data removed\n');

db.close();
console.log('✅ All tests passed!');

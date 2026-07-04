#!/usr/bin/env node

const MetricsFetcher = require('./facebook/metrics');
const AdsFetcher = require('./meta-ads/fetcher');
const InstagramFetcher = require('./instagram/fetcher');
const config = require('./config');

const date = process.argv[2]; // Optional: YYYY-MM-DD

console.log('🔧 Manual Metrics Fetch');
console.log('='.repeat(50));

async function main() {
  if (date) {
    console.log(`ℹ️ Ignoring custom date ${date}; current fetcher always pulls the recent window.`);
  }

  for (const portfolio of config.portfolios) {
    console.log(`\n📊 Portfolio: ${portfolio.name}`);
    const fetcher = new MetricsFetcher(portfolio);
    await fetcher.fetchAllMetrics();
    const adsFetcher = new AdsFetcher(portfolio);
    await adsFetcher.fetchAllAdsMetrics();
    const instagramFetcher = new InstagramFetcher(portfolio);
    await instagramFetcher.fetchAllInstagramMetrics();
    console.log(`✅ Finished: ${portfolio.name}`);
  }

  console.log('\n✅ Done!');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});

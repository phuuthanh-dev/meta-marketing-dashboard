const cron = require('node-cron');
const MetricsFetcher = require('./facebook/metrics');
const AdsFetcher = require('./meta-ads/fetcher');
const InstagramFetcher = require('./instagram/fetcher');
const config = require('./config');

class Scheduler {
  constructor() {
    this.portfolios = config.portfolios;
  }

  start() {
    console.log('⏰ Scheduler started');
    console.log(`   Daily job: ${config.schedule.daily}`);

    // Schedule daily fetch
    cron.schedule(config.schedule.daily, () => {
      console.log('\n🕐 Running scheduled daily fetch...');
      this.fetchAll();
    });

    // Run immediately on startup
    console.log('\n🚀 Running initial fetch...');
    this.fetchAll();
  }

  async fetchAll() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Starting metrics fetch for ALL portfolios');
    console.log('='.repeat(60));

    // Fetch tất cả portfolios
    for (const portfolio of this.portfolios) {
      try {
        console.log(`\n🚀 Starting portfolio: ${portfolio.name}`);
        const fetcher = new MetricsFetcher(portfolio);
        await fetcher.fetchAllMetrics();
        const adsFetcher = new AdsFetcher(portfolio);
        await adsFetcher.fetchAllAdsMetrics();
        const instagramFetcher = new InstagramFetcher(portfolio);
        await instagramFetcher.fetchAllInstagramMetrics();
        console.log(`✅ Finished portfolio: ${portfolio.name}`);
      } catch (err) {
        console.error(`❌ Error fetching ${portfolio.name}:`, err.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All portfolios processed');
    console.log('='.repeat(60) + '\n');
  }
}

module.exports = Scheduler;

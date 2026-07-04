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
    if (!config.security.enableScheduler) {
      console.log('Scheduler disabled by ENABLE_SCHEDULER=false');
      return;
    }

    console.log('Scheduler started');
    console.log(`   Daily job: ${config.schedule.daily}`);

    cron.schedule(config.schedule.daily, () => {
      console.log('\nRunning scheduled daily fetch...');
      this.fetchAll();
    });

    if (config.security.enableStartupFetch) {
      console.log('\nRunning initial fetch...');
      this.fetchAll();
    } else {
      console.log('Initial fetch disabled by ENABLE_STARTUP_FETCH=false');
    }
  }

  async fetchAll() {
    console.log('\n' + '='.repeat(60));
    console.log('Starting metrics fetch for all portfolios');
    console.log('='.repeat(60));

    for (const portfolio of this.portfolios) {
      try {
        console.log(`\nStarting portfolio: ${portfolio.name}`);
        const fetcher = new MetricsFetcher(portfolio);
        await fetcher.fetchAllMetrics();

        const adsFetcher = new AdsFetcher(portfolio);
        await adsFetcher.fetchAllAdsMetrics();

        const instagramFetcher = new InstagramFetcher(portfolio);
        await instagramFetcher.fetchAllInstagramMetrics();

        console.log(`Finished portfolio: ${portfolio.name}`);
      } catch (err) {
        console.error(`Error fetching ${portfolio.name}:`, err.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('All portfolios processed');
    console.log('='.repeat(60) + '\n');
  }
}

module.exports = Scheduler;

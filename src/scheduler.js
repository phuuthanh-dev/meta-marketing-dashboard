const cron = require('node-cron');
const MetricsFetcher = require('./facebook/metrics');
const AdsFetcher = require('./meta-ads/fetcher');
const InstagramFetcher = require('./instagram/fetcher');
const InstagramAPI = require('./instagram/api');
const Database = require('./database');
const config = require('./config');

class Scheduler {
  constructor() {
    this.portfolios = config.portfolios;
    this.db = Database.getInstance();
    this.processingDualPublishJobs = false;
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

    cron.schedule('* * * * *', () => {
      this.processDueDualPublishJobs();
    });

    setTimeout(() => {
      this.processDueDualPublishJobs();
    }, 5000);

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

  async processDueDualPublishJobs() {
    if (this.processingDualPublishJobs) return;
    this.processingDualPublishJobs = true;

    try {
      const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const staleCount = this.db.markStaleDualPublishJobsError(staleCutoff);
      if (staleCount > 0) {
        console.warn(`Marked ${staleCount} stale dual-publish job(s) as error.`);
      }

      const jobs = this.db.getDueDualPublishJobs(new Date().toISOString(), 10);
      if (jobs.length === 0) return;

      console.log(`\nProcessing ${jobs.length} due Instagram dual-publish job(s)...`);
      for (const job of jobs) {
        await this.publishDualPublishJob(job);
      }
    } catch (err) {
      console.error('Dual publish scheduler error:', err.message);
    } finally {
      this.processingDualPublishJobs = false;
    }
  }

  async publishDualPublishJob(job) {
    const runningJob = this.db.markDualPublishJobRunning(job.id);
    if (!runningJob || runningJob.status !== 'publishing') return;

    try {
      if (!runningJob.instagram_account_id) {
        throw new Error('Job không còn Instagram account để publish.');
      }
      if (!runningJob.media_url) {
        throw new Error('Job không có media URL để publish Instagram.');
      }

      const portfolio = this.portfolios.find(item => item.name === runningJob.portfolio && item.token);
      if (!portfolio) {
        throw new Error(`Không tìm thấy token portfolio cho ${runningJob.portfolio || 'job'}.`);
      }

      const api = new InstagramAPI(portfolio.token);
      const result = await api.publishSingleImage(
        runningJob.instagram_account_id,
        runningJob.media_url,
        runningJob.message || ''
      );

      this.db.markDualPublishJobPublished(runningJob.id, result);
      console.log(`Dual publish Instagram job ${runningJob.id} published: ${result.media_id}`);
    } catch (err) {
      this.db.markDualPublishJobError(runningJob.id, err.message);
      console.error(`Dual publish Instagram job ${runningJob.id} failed: ${err.message}`);
    }
  }
}

module.exports = Scheduler;

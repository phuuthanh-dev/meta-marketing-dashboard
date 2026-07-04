const config = require('../src/config');
const FacebookAPI = require('../src/facebook/api');
const MetaAdsAPI = require('../src/meta-ads/api');
const InstagramAPI = require('../src/instagram/api');
const Database = require('../src/database');

async function main() {
  console.log('Smoke test: config, API access, and database summary\n');

  console.log('Configured portfolios:');
  config.portfolios.forEach((portfolio, index) => {
    const token = portfolio.token || '';
    console.log(`  ${index + 1}. ${portfolio.name} | token present: ${token.length > 0} | token length: ${token.length}`);
  });

  for (const portfolio of config.portfolios) {
    console.log(`\nTesting portfolio: ${portfolio.name}`);
    const api = new FacebookAPI(portfolio.token);
    const pages = await api.getPages();
    console.log(`  Pages available: ${pages.length}`);

    if (pages.length > 0) {
      const sample = pages[0];
      console.log(`  Sample page: ${sample.name} (${sample.id})`);
    }

    const adsApi = new MetaAdsAPI(portfolio.token);
    try {
      const adAccounts = await adsApi.getAdAccounts();
      console.log(`  Ad accounts available: ${adAccounts.length}`);
      if (adAccounts.length > 0) {
        const sampleAccount = adAccounts[0];
        console.log(`  Sample ad account: ${sampleAccount.name} (${sampleAccount.id})`);
      }
    } catch (error) {
      console.log(`  Ads discovery unavailable: ${error.message}`);
    }

    const instagramApi = new InstagramAPI(portfolio.token);
    try {
      const instagramAccounts = await instagramApi.getLinkedInstagramAccounts();
      console.log(`  Instagram accounts linked: ${instagramAccounts.length}`);
      if (instagramAccounts.length > 0) {
        const sampleInstagram = instagramAccounts[0];
        console.log(`  Sample Instagram account: ${sampleInstagram.username || sampleInstagram.instagram_account_id} (${sampleInstagram.instagram_account_id})`);
      }
    } catch (error) {
      console.log(`  Instagram discovery unavailable: ${error.message}`);
    }
  }

  const db = new Database();
  const pages = db.getPages();
  const grouped = pages.reduce((acc, page) => {
    acc[page.portfolio || 'unknown'] = (acc[page.portfolio || 'unknown'] || 0) + 1;
    return acc;
  }, {});

  console.log('\nDatabase snapshot:');
  console.log(`  Total pages: ${pages.length}`);
  Object.entries(grouped).forEach(([portfolio, count]) => {
    console.log(`  ${portfolio}: ${count}`);
  });

  const adAccounts = db.getAdAccounts();
  console.log(`  Stored ad accounts: ${adAccounts.length}`);
  const instagramAccounts = db.getInstagramAccounts();
  console.log(`  Stored Instagram accounts: ${instagramAccounts.length}`);

  db.close();
}

main().catch(error => {
  console.error('\nSmoke test failed:', error.message);
  process.exit(1);
});

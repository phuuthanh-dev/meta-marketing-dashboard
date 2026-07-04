const Database = require('../database');
const MetaAdsAPI = require('./api');
const config = require('../config');

class AdsFetcher {
  constructor(portfolio) {
    this.portfolio = portfolio;
    this.api = new MetaAdsAPI(portfolio.token);
    this.db = Database.getInstance();
  }

  aggregateSnapshotInsights(insights, level, days) {
    if (level === 'account') {
      return insights.map(insight => ({
        ...insight,
        data_grain: 'daily',
        sync_window_days: 1
      }));
    }

    const grouped = new Map();

    for (const insight of insights) {
      const entityId = level === 'ad'
        ? (insight.ad_id || '')
        : level === 'adset'
          ? (insight.adset_id || '')
          : (insight.campaign_id || '');

      if (!entityId) {
        continue;
      }

      if (!grouped.has(entityId)) {
        grouped.set(entityId, {
          ...insight,
          impressions: 0,
          reach: 0,
          clicks: 0,
          spend: 0,
          frequency_sum: 0,
          frequency_count: 0,
          date_start: insight.date_start,
          date_stop: insight.date_stop
        });
      }

      const current = grouped.get(entityId);
      current.impressions += parseInt(insight.impressions, 10) || 0;
      current.reach += parseInt(insight.reach, 10) || 0;
      current.clicks += parseInt(insight.clicks, 10) || 0;
      current.spend += parseFloat(insight.spend) || 0;
      current.frequency_sum += parseFloat(insight.frequency) || 0;
      current.frequency_count += 1;

      if (insight.date_start && (!current.date_start || insight.date_start < current.date_start)) {
        current.date_start = insight.date_start;
      }

      if (insight.date_stop && (!current.date_stop || insight.date_stop > current.date_stop)) {
        current.date_stop = insight.date_stop;
      }
    }

    return Array.from(grouped.values()).map(insight => {
      const ctr = insight.impressions > 0 ? (insight.clicks * 100 / insight.impressions) : 0;
      const cpc = insight.clicks > 0 ? (insight.spend / insight.clicks) : 0;
      const cpm = insight.impressions > 0 ? (insight.spend * 1000 / insight.impressions) : 0;
      const frequency = insight.frequency_count > 0 ? (insight.frequency_sum / insight.frequency_count) : 0;

      return {
        ...insight,
        ctr,
        cpc,
        cpm,
        frequency,
        data_grain: 'all_days',
        sync_window_days: parseInt(days, 10) || config.ads.defaultDays
      };
    });
  }

  async fetchAllAdsMetrics(days = config.ads.defaultDays, options = {}) {
    const includeDeepLevels = options.includeDeepLevels === true;
    const insightLevels = includeDeepLevels
      ? ['account', 'campaign', 'adset', 'ad']
      : ['account', 'campaign'];
    const targetAdAccountIds = Array.isArray(options.adAccountIds) && options.adAccountIds.length > 0
      ? new Set(options.adAccountIds)
      : null;

    console.log(`\n💰 Fetching ads data for portfolio: ${this.portfolio.name}`);

    let adAccounts = [];

    try {
      adAccounts = await this.api.getAdAccounts();
    } catch (error) {
      console.log(`  ⚠️ Ads discovery unavailable for ${this.portfolio.name}: ${error.message}`);
      return {
        success: false,
        portfolio: this.portfolio.name,
        error: error.message,
        adAccounts: 0
      };
    }

    if (adAccounts.length === 0) {
      console.log('  ℹ️ No accessible ad accounts found');
      return {
        success: true,
        portfolio: this.portfolio.name,
        adAccounts: 0
      };
    }

    if (targetAdAccountIds) {
      adAccounts = adAccounts.filter(adAccount => targetAdAccountIds.has(adAccount.id));
      console.log(`  Filtered to ${adAccounts.length} target ad account(s)`);
    }

    console.log(`  Found ${adAccounts.length} ad account(s)`);

    for (const adAccount of adAccounts) {
      const accountId = adAccount.id;
      const campaignIds = new Set();
      const adSetIds = new Set();
      console.log(`\n  📣 Ad account: ${adAccount.name || accountId} (${accountId})`);

      this.db.saveAdAccount({
        id: accountId,
        account_id: adAccount.account_id || accountId.replace(/^act_/, ''),
        name: adAccount.name || accountId,
        account_status: adAccount.account_status || null,
        currency: adAccount.currency || '',
        timezone_name: adAccount.timezone_name || '',
        portfolio: this.portfolio.name
      });

      try {
        const campaigns = await this.api.getCampaigns(accountId);
        campaigns.forEach(campaign => {
          campaignIds.add(campaign.id);
          this.db.saveCampaign({
            id: campaign.id,
            ad_account_id: accountId,
            name: campaign.name || campaign.id,
            status: campaign.status || '',
            effective_status: campaign.effective_status || '',
            objective: campaign.objective || '',
            buying_type: campaign.buying_type || '',
            start_time: campaign.start_time || null,
            stop_time: campaign.stop_time || null
          });
        });
        console.log(`    ✅ Saved ${campaigns.length} campaign(s)`);
      } catch (error) {
        console.log(`    ⚠️ Campaign sync error: ${error.message}`);
      }

      if (includeDeepLevels) {
        try {
          const adSets = await this.api.getAdSets(accountId);
          adSets.forEach(adSet => {
            adSetIds.add(adSet.id);
            this.db.saveAdSet({
              id: adSet.id,
              ad_account_id: accountId,
              campaign_id: adSet.campaign_id && campaignIds.has(adSet.campaign_id) ? adSet.campaign_id : null,
              name: adSet.name || adSet.id,
              status: adSet.status || '',
              effective_status: adSet.effective_status || '',
              optimization_goal: adSet.optimization_goal || '',
              billing_event: adSet.billing_event || '',
              bid_strategy: adSet.bid_strategy || '',
              daily_budget: adSet.daily_budget || null,
              lifetime_budget: adSet.lifetime_budget || null,
              start_time: adSet.start_time || null,
              end_time: adSet.end_time || null
            });
          });
          console.log(`    ✅ Saved ${adSets.length} ad set(s)`);
        } catch (error) {
          console.log(`    ⚠️ Ad set sync error: ${error.message}`);
        }

        try {
          const ads = await this.api.getAds(accountId);
          ads.forEach(ad => {
            this.db.saveAd({
              id: ad.id,
              ad_account_id: accountId,
              campaign_id: ad.campaign_id && campaignIds.has(ad.campaign_id) ? ad.campaign_id : null,
              ad_set_id: ad.adset_id && adSetIds.has(ad.adset_id) ? ad.adset_id : null,
              name: ad.name || ad.id,
              status: ad.status || '',
              effective_status: ad.effective_status || '',
              creative_id: ad.creative?.id || null
            });
          });
          console.log(`    ✅ Saved ${ads.length} ad(s)`);
        } catch (error) {
          console.log(`    ⚠️ Ad sync error: ${error.message}`);
        }
      }

      for (const level of insightLevels) {
        try {
          const rawInsights = await this.api.getInsights(accountId, {
            level,
            days,
            timeIncrement: level === 'account' ? 1 : 'all_days'
          });
          const insights = this.aggregateSnapshotInsights(rawInsights, level, days);
          insights.forEach(insight => {
            this.db.saveAdInsight({
              ad_account_id: accountId,
              level,
              data_grain: insight.data_grain,
              sync_window_days: insight.sync_window_days,
              account_id: insight.account_id || adAccount.account_id || accountId.replace(/^act_/, ''),
              account_name: insight.account_name || adAccount.name || '',
              campaign_id: insight.campaign_id && campaignIds.has(insight.campaign_id) ? insight.campaign_id : null,
              campaign_name: insight.campaign_name || '',
              ad_set_id: insight.adset_id && adSetIds.has(insight.adset_id) ? insight.adset_id : null,
              ad_set_name: insight.adset_name || '',
              ad_id: insight.ad_id || null,
              ad_name: insight.ad_name || '',
              date_start: insight.date_start,
              date_stop: insight.date_stop,
              impressions: insight.impressions || 0,
              reach: insight.reach || 0,
              clicks: insight.clicks || 0,
              ctr: insight.ctr || 0,
              cpc: insight.cpc || 0,
              cpm: insight.cpm || 0,
              spend: insight.spend || 0,
              frequency: insight.frequency || 0,
              raw_json: JSON.stringify(insight)
            });
          });
          console.log(`    ✅ Saved ${insights.length} ${level} insight row(s)`);
        } catch (error) {
          console.log(`    ⚠️ ${level} insights sync error: ${error.message}`);
        }
      }
    }

    return {
      success: true,
      portfolio: this.portfolio.name,
      adAccounts: adAccounts.length,
      deepLevels: includeDeepLevels
    };
  }
}

module.exports = AdsFetcher;

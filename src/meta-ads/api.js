const axios = require('axios');
const config = require('../config');

class MetaAdsAPI {
  constructor(token) {
    this.token = token;
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${config.fb.version}`,
      timeout: 30000
    });
    this.lastRequestTime = 0;
  }

  async rawGet(endpoint, params) {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    }

    this.lastRequestTime = Date.now();

    try {
      const response = await this.client.get(endpoint, { params });
      return response.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;

        if ([4, 17, 32].includes(fb.code)) {
          const wait = parseInt(error.response.headers['retry-after'], 10) || 60;
          console.log(`  ⏳ Ads rate limit hit, waiting ${wait}s...`);
          await new Promise(resolve => setTimeout(resolve, wait * 1000));
          return this.rawGet(endpoint, params);
        }

        throw new Error(`FB [${fb.code}]: ${fb.message}`);
      }

      throw error;
    }
  }

  async rawPost(endpoint, payload) {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    }

    this.lastRequestTime = Date.now();

    try {
      const response = await this.client.post(endpoint, payload);
      return response.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`FB [${fb.code}]: ${fb.message}`);
      }

      throw error;
    }
  }

  async fetchPaginated(endpoint, params, options = {}) {
    const results = [];
    const maxPages = options.maxPages || 100;
    let pageCount = 0;
    let nextUrl = null;
    let currentEndpoint = endpoint;
    let currentParams = params;

    while (pageCount < maxPages) {
      const data = nextUrl
        ? await this.rawGet(nextUrl, undefined)
        : await this.rawGet(currentEndpoint, currentParams);

      results.push(...(data.data || []));
      pageCount += 1;

      if (!data.paging?.next) {
        break;
      }

      nextUrl = data.paging.next;
      currentEndpoint = null;
      currentParams = undefined;
    }

    return results;
  }

  normalizeAdAccountId(adAccountId) {
    if (!adAccountId) return adAccountId;
    return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  }

  toApiBudgetAmount(amount, currency = 'USD') {
    const numeric = Number(amount || 0);
    if (!numeric) return 0;

    const zeroDecimalCurrencies = new Set([
      'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
      'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
    ]);

    return zeroDecimalCurrencies.has(String(currency || '').toUpperCase())
      ? Math.round(numeric)
      : Math.round(numeric * 100);
  }

  async createCampaign(adAccountId, draft, options = {}) {
    const currency = options.currency || 'USD';
    const payload = {
      access_token: this.token,
      name: draft.name,
      objective: draft.objective || 'OUTCOME_ENGAGEMENT',
      buying_type: draft.buying_type || 'AUCTION',
      status: options.status || draft.meta_status || 'PAUSED',
      special_ad_categories: JSON.stringify(draft.special_ad_categories || [])
    };

    const dailyBudget = this.toApiBudgetAmount(draft.daily_budget, currency);
    const lifetimeBudget = this.toApiBudgetAmount(draft.lifetime_budget, currency);
    if (dailyBudget > 0) payload.daily_budget = dailyBudget;
    if (lifetimeBudget > 0) payload.lifetime_budget = lifetimeBudget;

    return this.rawPost(`/${this.normalizeAdAccountId(adAccountId)}/campaigns`, payload);
  }

  async createAdSet(adAccountId, draft, campaignId, options = {}) {
    const currency = options.currency || 'USD';
    const payload = {
      access_token: this.token,
      name: draft.name,
      campaign_id: campaignId,
      optimization_goal: draft.optimization_goal || 'POST_ENGAGEMENT',
      billing_event: draft.billing_event || 'IMPRESSIONS',
      bid_strategy: draft.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      status: options.status || draft.meta_status || 'PAUSED',
      targeting: JSON.stringify(draft.targeting || {})
    };

    const dailyBudget = this.toApiBudgetAmount(draft.daily_budget, currency);
    const lifetimeBudget = this.toApiBudgetAmount(draft.lifetime_budget, currency);
    if (dailyBudget > 0) payload.daily_budget = dailyBudget;
    if (lifetimeBudget > 0) payload.lifetime_budget = lifetimeBudget;
    if (draft.start_time) payload.start_time = draft.start_time;
    if (draft.end_time) payload.end_time = draft.end_time;

    return this.rawPost(`/${this.normalizeAdAccountId(adAccountId)}/adsets`, payload);
  }

  async createAdCreative(adAccountId, draft) {
    const link = draft.destination_url || '';
    const linkData = {
      message: draft.message || '',
      link,
      name: draft.headline || draft.name || '',
      description: draft.description || '',
      call_to_action: {
        type: draft.call_to_action || 'LEARN_MORE',
        value: { link }
      }
    };

    if (draft.asset_url && draft.asset_type !== 'video') {
      linkData.picture = draft.asset_url;
    }

    const objectStorySpec = {
      page_id: draft.page_id,
      link_data: linkData
    };

    if (draft.instagram_account_id) {
      objectStorySpec.instagram_actor_id = draft.instagram_account_id;
    }

    return this.rawPost(`/${this.normalizeAdAccountId(adAccountId)}/adcreatives`, {
      access_token: this.token,
      name: draft.creative_name || `${draft.name || 'Ad'} Creative`,
      object_story_spec: JSON.stringify(objectStorySpec)
    });
  }

  async createAd(adAccountId, draft, adSetId, creativeId, options = {}) {
    return this.rawPost(`/${this.normalizeAdAccountId(adAccountId)}/ads`, {
      access_token: this.token,
      name: draft.name,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: options.status || draft.meta_status || 'PAUSED'
    });
  }

  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  buildDateRange(days, options = {}) {
    const until = options.until ? new Date(options.until) : new Date();
    until.setHours(0, 0, 0, 0);

    const since = options.since
      ? new Date(options.since)
      : new Date(until.getTime() - ((days - 1) * 24 * 60 * 60 * 1000));
    since.setHours(0, 0, 0, 0);

    return {
      since: this.formatDate(since),
      until: this.formatDate(until)
    };
  }

  buildDateChunks(days, chunkSizeDays) {
    const chunks = [];
    const range = this.buildDateRange(days);
    const until = new Date(range.until);
    const since = new Date(range.since);

    let cursor = new Date(since);
    while (cursor <= until) {
      const chunkStart = new Date(cursor);
      const chunkEnd = new Date(cursor);
      chunkEnd.setDate(chunkEnd.getDate() + chunkSizeDays - 1);
      if (chunkEnd > until) {
        chunkEnd.setTime(until.getTime());
      }

      chunks.push({
        since: this.formatDate(chunkStart),
        until: this.formatDate(chunkEnd)
      });

      cursor = new Date(chunkEnd);
      cursor.setDate(cursor.getDate() + 1);
    }

    return chunks;
  }

  getInsightFields(includeOptional = true) {
    const fields = [...config.ads.insightFields];
    if (includeOptional && Array.isArray(config.ads.optionalInsightFields)) {
      fields.push(...config.ads.optionalInsightFields);
    }
    return [...new Set(fields)].join(',');
  }

  isOptionalInsightFieldError(error) {
    const message = String(error?.message || '');
    return /field|parameter|metric|nonexisting|unknown|valid/i.test(message)
      && /(actions|roas|outbound|inline_link|unique_click|cost_per|conversion)/i.test(message);
  }

  async fetchInsightsWindow(adAccountId, params, level) {
    try {
      return await this.fetchPaginated(`/${this.normalizeAdAccountId(adAccountId)}/insights`, params, {
        maxPages: level === 'account' ? 20 : 50
      });
    } catch (error) {
      if (!String(error.message).includes('Please reduce the amount of data')) {
        throw error;
      }

      params.limit = 25;
      return this.fetchPaginated(`/${this.normalizeAdAccountId(adAccountId)}/insights`, params, {
        maxPages: level === 'account' ? 20 : 50
      });
    }
  }

  async getAdAccounts() {
    return this.fetchPaginated('/me/adaccounts', {
      access_token: this.token,
      fields: config.ads.accountFields.join(','),
      limit: 100
    });
  }

  async getCampaigns(adAccountId, limit = 200) {
    return this.fetchPaginated(`/${this.normalizeAdAccountId(adAccountId)}/campaigns`, {
      access_token: this.token,
      fields: config.ads.campaignFields.join(','),
      limit
    });
  }

  async getAdSets(adAccountId, limit = 200) {
    return this.fetchPaginated(`/${this.normalizeAdAccountId(adAccountId)}/adsets`, {
      access_token: this.token,
      fields: config.ads.adSetFields.join(','),
      limit
    });
  }

  async getAds(adAccountId, limit = 200) {
    return this.fetchPaginated(`/${this.normalizeAdAccountId(adAccountId)}/ads`, {
      access_token: this.token,
      fields: config.ads.adFields.join(','),
      limit
    });
  }

  async getInsights(adAccountId, options = {}) {
    const level = options.level || 'account';
    const days = parseInt(options.days, 10) || config.ads.defaultDays;
    const timeIncrement = options.timeIncrement || 1;
    const params = {
      access_token: this.token,
      level,
      fields: this.getInsightFields(true),
      limit: level === 'account' ? 500 : 100
    };

    if (timeIncrement) {
      params.time_increment = timeIncrement;
    }

    if (options.since || options.until) {
      params.time_range = JSON.stringify(this.buildDateRange(days, {
        since: options.since,
        until: options.until
      }));
    } else {
      params.time_range = JSON.stringify(this.buildDateRange(days));
    }

    try {
      return await this.fetchInsightsWindow(adAccountId, params, level);
    } catch (error) {
      if (this.isOptionalInsightFieldError(error)) {
        console.log('  ⚠️ Optional Ads insight fields unavailable, retrying with baseline fields...');
        params.fields = this.getInsightFields(false);
        return this.fetchInsightsWindow(adAccountId, params, level);
      }

      if (!String(error.message).includes('Please reduce the amount of data') || level === 'account') {
        throw error;
      }

      const chunkSizeDays = level === 'campaign' ? 60 : 30;
      const chunks = this.buildDateChunks(days, chunkSizeDays);
      const rows = [];

      for (const chunk of chunks) {
        const chunkParams = {
          access_token: this.token,
          level,
          fields: params.fields,
          time_range: JSON.stringify(chunk),
          limit: level === 'campaign' ? 50 : 25
        };

        if (timeIncrement) {
          chunkParams.time_increment = timeIncrement;
        }

        const chunkRows = await this.fetchInsightsWindow(adAccountId, chunkParams, level);
        rows.push(...chunkRows);
      }

      return rows;
    }
  }
}

module.exports = MetaAdsAPI;

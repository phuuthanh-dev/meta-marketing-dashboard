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
      fields: config.ads.insightFields.join(','),
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
          fields: config.ads.insightFields.join(','),
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

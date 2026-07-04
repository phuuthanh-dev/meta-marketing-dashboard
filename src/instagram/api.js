const axios = require('axios');
const config = require('../config');

class InstagramAPI {
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
        throw new Error(`FB [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  async getLinkedInstagramAccounts() {
    const data = await this.rawGet('/me/accounts', {
      access_token: this.token,
      fields: 'id,name,instagram_business_account{id,username,name}',
      limit: 100
    });

    return (data.data || [])
      .filter(page => page.instagram_business_account)
      .map(page => ({
        page_id: page.id,
        page_name: page.name,
        instagram_account_id: page.instagram_business_account.id,
        username: page.instagram_business_account.username || '',
        name: page.instagram_business_account.name || ''
      }));
  }

  async getInstagramAccountProfile(instagramAccountId) {
    const data = await this.rawGet(`/${instagramAccountId}`, {
      access_token: this.token,
      fields: config.instagram.profileFields.join(',')
    });
    return data;
  }

  async getInstagramMedia(instagramAccountId, limit = config.instagram.mediaFetchLimit) {
    const data = await this.rawGet(`/${instagramAccountId}/media`, {
      access_token: this.token,
      fields: config.instagram.mediaFields.join(','),
      limit
    });
    return data.data || [];
  }

  async getAccountDayInsights(instagramAccountId, days = config.instagram.defaultDays) {
    const data = await this.rawGet(`/${instagramAccountId}/insights`, {
      access_token: this.token,
      metric: config.instagram.accountDayMetrics.join(','),
      period: 'day',
      since: Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000)
    });
    return data.data || [];
  }

  async getAccountTotalValueInsights(instagramAccountId) {
    try {
      const data = await this.rawGet(`/${instagramAccountId}/insights`, {
        access_token: this.token,
        metric: config.instagram.accountTotalValueMetrics.join(','),
        metric_type: 'total_value',
        period: 'day'
      });
      return data.data || [];
    } catch (error) {
      return config.instagram.accountTotalValueMetrics.map(metric => ({
        name: metric,
        unsupported: true,
        error: error.message
      }));
    }
  }

  async getFollowerDemographics(instagramAccountId) {
    try {
      const data = await this.rawGet(`/${instagramAccountId}/insights`, {
        access_token: this.token,
        metric: config.instagram.demographicsMetric,
        period: 'lifetime',
        metric_type: 'total_value',
        breakdown: 'age,gender,country,city'
      });
      return {
        supported: true,
        data: data.data || []
      };
    } catch (error) {
      return {
        supported: false,
        reason: error.message,
        data: []
      };
    }
  }

  async getMediaInsights(mediaId) {
    try {
      const data = await this.rawGet(`/${mediaId}/insights`, {
        access_token: this.token,
        metric: config.instagram.mediaInsightMetrics.join(',')
      });
      return {
        supported: true,
        data: data.data || []
      };
    } catch (error) {
      return {
        supported: false,
        reason: error.message,
        data: []
      };
    }
  }
}

module.exports = InstagramAPI;

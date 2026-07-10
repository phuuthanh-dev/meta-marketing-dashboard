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

  async rawDelete(endpoint, params) {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    }
    this.lastRequestTime = Date.now();

    try {
      const response = await this.client.delete(endpoint, { params });
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
    const maxPages = options.maxPages || 25;
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
    const data = await this.fetchPaginated(`/${instagramAccountId}/media`, {
      access_token: this.token,
      fields: config.instagram.mediaFields.join(','),
      limit: Math.min(limit, 50)
    });
    return data.slice(0, limit);
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

  async createImageContainer(instagramAccountId, imageUrl, caption = '') {
    return this.rawPost(`/${instagramAccountId}/media`, {
      access_token: this.token,
      image_url: imageUrl,
      caption
    });
  }

  async publishMediaContainer(instagramAccountId, creationId) {
    return this.rawPost(`/${instagramAccountId}/media_publish`, {
      access_token: this.token,
      creation_id: creationId
    });
  }

  async publishSingleImage(instagramAccountId, imageUrl, caption = '') {
    const container = await this.createImageContainer(instagramAccountId, imageUrl, caption);
    const media = await this.publishMediaContainer(instagramAccountId, container.id);
    return {
      container_id: container.id,
      media_id: media.id
    };
  }

  async deleteMedia(mediaId) {
    return this.rawDelete(`/${mediaId}`, {
      access_token: this.token
    });
  }
}

module.exports = InstagramAPI;

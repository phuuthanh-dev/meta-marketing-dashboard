const axios = require('axios');
const config = require('../config');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createFacebookError(fb) {
  const error = new Error(`FB [${fb.code}]: ${fb.message}`);
  error.fbCode = fb.code;
  error.fbSubcode = fb.error_subcode;
  error.fbType = fb.type;
  error.fbTraceId = fb.fbtrace_id;
  return error;
}

function isMediaNotReadyError(error) {
  return error?.fbCode === 9007 || /Media ID is not available|FB \[9007\]/i.test(error?.message || '');
}

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
        throw createFacebookError(error.response.data.error);
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
        throw createFacebookError(error.response.data.error);
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
        throw createFacebookError(error.response.data.error);
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
    const instagramImageUrl = this.prepareImageUrlForInstagram(imageUrl);
    return this.rawPost(`/${instagramAccountId}/media`, {
      access_token: this.token,
      image_url: instagramImageUrl,
      caption
    });
  }

  prepareImageUrlForInstagram(imageUrl) {
    const url = String(imageUrl || '').trim();
    if (!url) return url;

    if (/res\.cloudinary\.com\/[^/]+\/image\/upload\//i.test(url) && !/\/image\/upload\/[^/]*f_(jpg|jpeg)/i.test(url)) {
      return url.replace('/image/upload/', '/image/upload/f_jpg,q_auto/');
    }

    return url;
  }

  async getMediaContainerStatus(containerId) {
    return this.rawGet(`/${containerId}`, {
      access_token: this.token,
      fields: 'id,status,status_code'
    });
  }

  async waitForMediaContainer(containerId, options = {}) {
    const maxAttempts = options.maxAttempts || 8;
    const delayMs = options.delayMs || 5000;
    let lastStatus = null;
    let statusCheckFailed = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const status = await this.getMediaContainerStatus(containerId);
        lastStatus = status.status_code || status.status || 'UNKNOWN';

        if (lastStatus === 'FINISHED') return status;
        if (lastStatus === 'ERROR' || lastStatus === 'EXPIRED') {
          throw new Error(`Instagram media container ${containerId} status ${lastStatus}`);
        }
      } catch (error) {
        if (!options.allowStatusCheckFailure) throw error;
        statusCheckFailed = true;
      }

      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }

    if (statusCheckFailed && options.allowStatusCheckFailure) {
      return { id: containerId, status_code: 'UNKNOWN' };
    }

    const error = new Error(`Instagram media container ${containerId} chưa sẵn sàng để publish (${lastStatus || 'UNKNOWN'}).`);
    error.retryable = true;
    throw error;
  }

  async publishMediaContainer(instagramAccountId, creationId) {
    return this.rawPost(`/${instagramAccountId}/media_publish`, {
      access_token: this.token,
      creation_id: creationId
    });
  }

  async publishSingleImage(instagramAccountId, imageUrl, caption = '', options = {}) {
    const container = options.existingContainerId
      ? { id: options.existingContainerId }
      : await this.createImageContainer(instagramAccountId, imageUrl, caption);

    if (!options.existingContainerId && typeof options.onContainerCreated === 'function') {
      await options.onContainerCreated(container);
    }

    const retryDelays = options.publishRetryDelaysMs || [0, 10000, 20000, 30000];
    let lastError = null;

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (retryDelays[attempt] > 0) {
        await sleep(retryDelays[attempt]);
      }

      try {
        await this.waitForMediaContainer(container.id, {
          maxAttempts: options.containerPollAttempts || 6,
          delayMs: options.containerPollDelayMs || 5000,
          allowStatusCheckFailure: true
        });

        const media = await this.publishMediaContainer(instagramAccountId, container.id);
        return {
          container_id: container.id,
          media_id: media.id,
          image_url: this.prepareImageUrlForInstagram(imageUrl)
        };
      } catch (error) {
        lastError = error;
        if (!error.retryable && !isMediaNotReadyError(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  isMediaNotReadyError(error) {
    return isMediaNotReadyError(error);
  }

  async deleteMedia(mediaId) {
    return this.rawDelete(`/${mediaId}`, {
      access_token: this.token
    });
  }
}

module.exports = InstagramAPI;

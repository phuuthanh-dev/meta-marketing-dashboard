const axios = require('axios');
const config = require('../config');

class FacebookAPI {
  constructor(token) {
    this.token = token;
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${config.fb.version}`,
      timeout: 30000
    });
    this.lastRequestTime = 0;
    this.pageTokenCache = {};
  }

  // Rate-limited raw GET
  async rawGet(endpoint, params) {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < 1000) {
      await new Promise(r => setTimeout(r, 1000 - elapsed));
    }
    this.lastRequestTime = Date.now();

    try {
      const resp = await this.client.get(endpoint, { params });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        if ([4, 17, 32].includes(fb.code)) {
          const wait = parseInt(error.response.headers['retry-after']) || 60;
          console.log(`  ⏳ Rate limit, waiting ${wait}s...`);
          await new Promise(r => setTimeout(r, wait * 1000));
          return this.rawGet(endpoint, params);
        }
        throw new Error(`FB [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Get Page Access Token (cached)
  async getPageToken(pageId) {
    if (this.pageTokenCache[pageId]) return this.pageTokenCache[pageId];
    const data = await this.rawGet(`/${pageId}`, {
      fields: 'access_token',
      access_token: this.token
    });
    this.pageTokenCache[pageId] = data.access_token;
    return data.access_token;
  }

  // Get all pages with their access tokens
  async getPages() {
    const data = await this.rawGet('/me/accounts', {
      fields: 'id,name,category,fan_count,followers_count,access_token',
      limit: 100,
      access_token: this.token
    });
    for (const p of data.data) {
      if (p.access_token) this.pageTokenCache[p.id] = p.access_token;
    }
    return data.data;
  }

  // Page insights (uses Page Token)
  async getPageInsights(pageId, metric, since, until) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/insights`, {
      access_token: pt,
      metric,
      period: 'day',
      since,
      until
    });
    return data.data || [];
  }

  // Get posts (uses Page Token, no deprecated fields)
  async getPagePosts(pageId, limit = 50) {
    const pt = await this.getPageToken(pageId);
    const limitsToTry = [limit, 25, 10, 5].filter((value, index, arr) => value > 0 && arr.indexOf(value) === index);
    let lastError = null;

    for (const batchLimit of limitsToTry) {
      try {
        const data = await this.rawGet(`/${pageId}/posts`, {
          access_token: pt,
          fields: 'id,message,created_time',
          limit: batchLimit
        });
        return data.data || [];
      } catch (error) {
        lastError = error;
        if (!error.message.includes('Please reduce the amount of data')) {
          throw error;
        }
        console.log(`  ⚠️ Posts fetch too large for page ${pageId}, retrying with limit ${batchLimit === 5 ? batchLimit : Math.max(5, Math.floor(batchLimit / 2))}...`);
      }
    }

    throw lastError;
  }

  // Get comments for a post
  async getPostComments(postId, limit = 100) {
    const pageId = postId.split('_')[0];
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${postId}/comments`, {
      access_token: pt,
      fields: 'id,message,from,created_time,like_count,comment_count,is_hidden',
      limit
    });
    return data.data || [];
  }

  // Post insights (uses Page Token)
  async getPostInsights(postId, metrics) {
    const pageId = postId.split('_')[0];
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${postId}/insights`, {
      access_token: pt,
      metric: metrics.join(',')
    });
    return data.data || [];
  }

  // ========== POST MANAGEMENT ==========

  // Create a new post
  async createPost(pageId, message, options = {}) {
    const pt = await this.getPageToken(pageId);
    const postData = {
      message,
      access_token: pt,
      ...options
    };
    
    try {
      const resp = await this.client.post(`/${pageId}/feed`, postData);
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Create post failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Schedule a post (published=false, scheduled_publish_time)
  async schedulePost(pageId, message, scheduledTime) {
    const pt = await this.getPageToken(pageId);
    const postData = {
      message,
      published: false,
      scheduled_publish_time: Math.floor(scheduledTime.getTime() / 1000),
      access_token: pt
    };
    
    try {
      const resp = await this.client.post(`/${pageId}/feed`, postData);
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Schedule post failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Delete a post
  async deletePost(postId) {
    const pageId = postId.split('_')[0];
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.delete(`/${postId}`, {
        params: { access_token: pt }
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Delete post failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Update a post
  async updatePost(postId, message) {
    const pageId = postId.split('_')[0];
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${postId}`, {
        message,
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Update post failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Get scheduled posts
  async getScheduledPosts(pageId) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/scheduled_posts`, {
      access_token: pt,
      fields: 'id,message,scheduled_publish_time,created_time'
    });
    return data.data || [];
  }

  // ========== COMMENTS MANAGEMENT ==========

  // Get comments for a post
  async getComments(postId, limit = 100) {
    const pageId = postId.split('_')[0];
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${postId}/comments`, {
      access_token: pt,
      fields: 'id,message,from,created_time,like_count,comment_count',
      limit
    });
    return data.data || [];
  }

  // Reply to a comment
  async replyToComment(commentId, message, pageId) {
    const resolvedPageId = pageId || commentId.split('_')[0];
    const pt = await this.getPageToken(resolvedPageId);
    
    try {
      const resp = await this.client.post(`/${commentId}/comments`, {
        message,
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Reply failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Delete a comment
  async deleteComment(commentId, pageId) {
    const resolvedPageId = pageId || commentId.split('_')[0];
    const pt = await this.getPageToken(resolvedPageId);
    
    try {
      const resp = await this.client.delete(`/${commentId}`, {
        params: { access_token: pt }
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Delete comment failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Hide a comment
  async hideComment(commentId, pageId) {
    const resolvedPageId = pageId || commentId.split('_')[0];
    const pt = await this.getPageToken(resolvedPageId);
    
    try {
      const resp = await this.client.post(`/${commentId}`, {
        is_hidden: true,
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Hide comment failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // ========== AUDIENCE INSIGHTS ==========

  // Get page audience (demographics)
  async getAudience(pageId) {
    return {
      supported: false,
      reason: 'Facebook Page demographics metrics used by the legacy implementation are deprecated and return invalid metric errors.',
      deprecated_metrics: [
        'page_fans',
        'page_fans_locale',
        'page_fans_city',
        'page_fans_country'
      ],
      recommendation: 'Use Instagram account demographics for a linked professional account, or treat Page demographics as unavailable in this dashboard.'
    };
  }

  // Get page reach
  async getReach(pageId, days = 30) {
    return {
      supported: false,
      reason: 'The legacy Page Insights reach metrics used by this dashboard currently return invalid metric errors for the tested Page API flow.',
      tested_metrics: [
        'page_impressions',
        'page_impressions_paid',
        'page_impressions_organic'
      ],
      recommendation: 'Treat Facebook Page reach trend as unavailable in this flow, or move this report to another supported Meta surface.'
    };
  }

  // Get engagement rate
  async getEngagementRate(pageId, days = 30) {
    return {
      supported: false,
      reason: 'The Page Insights metrics needed to calculate engagement rate currently return invalid metric errors for the tested Facebook Page API flow.',
      tested_metrics: [
        'page_engaged_users',
        'page_impressions'
      ],
      recommendation: 'Do not render a Page-level reach-based engagement rate until a supported metrics source is confirmed.'
    };
  }

  // ========== INBOX/MESSAGES MANAGEMENT ==========

  // Get conversations for a page
  async getConversations(pageId, limit = 25) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/conversations`, {
      access_token: pt,
      fields: 'id,snippet,updated_time,unread_count,messages{id,message,from,created_time}',
      limit
    });
    return data.data || [];
  }

  // Get messages in a conversation
  async getMessages(conversationId, limit = 50) {
    const data = await this.rawGet(`/${conversationId}/messages`, {
      access_token: this.token,
      fields: 'id,message,from,created_time,attachments',
      limit
    });
    return data.data || [];
  }

  // Send a message (reply to conversation)
  async sendMessage(pageId, recipientId, message) {
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${pageId}/messages`, {
        recipient: { id: recipientId },
        message: { text: message },
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Send message failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Mark conversation as read
  async markAsRead(conversationId) {
    try {
      const resp = await this.client.post(`/${conversationId}`, {
        is_subscribed: true,
        access_token: this.token
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Mark as read failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Get page notifications
  async getNotifications(pageId, limit = 50) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/notifications`, {
      access_token: pt,
      limit
    });
    return data.data || [];
  }

  // ========== MEDIA UPLOAD ==========

  // Upload photo to a page
  async uploadPhoto(pageId, photoUrl, caption = '') {
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${pageId}/photos`, {
        url: photoUrl,
        caption,
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Upload photo failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Upload video to a page
  async uploadVideo(pageId, videoUrl, title = '', description = '') {
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${pageId}/videos`, {
        file_url: videoUrl,
        title,
        description,
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Upload video failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Create photo album
  async createAlbum(pageId, name, description = '') {
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${pageId}/albums`, {
        name,
        message: description,
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Create album failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Get page albums
  async getAlbums(pageId, limit = 25) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/albums`, {
      access_token: pt,
      fields: 'id,name,description,count,created_time,cover_photo',
      limit
    });
    return data.data || [];
  }

  // Get photos from album
  async getAlbumPhotos(albumId, limit = 50) {
    const data = await this.rawGet(`/${albumId}/photos`, {
      access_token: this.token,
      fields: 'id,name,source,images,created_time',
      limit
    });
    return data.data || [];
  }

  // Delete media (photo/video)
  async deleteMedia(mediaId) {
    try {
      const resp = await this.client.delete(`/${mediaId}`, {
        params: { access_token: this.token }
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Delete media failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // ========== PHASE 3: PAGE MANAGEMENT ==========

  // Get detailed page info
  async getPageDetails(pageId) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}`, {
      access_token: pt,
      fields: 'id,name,about,description,category,category_list,location,phone,website,emails,fan_count,followers_count,link,picture{url},cover{source},engagement'
    });
    return data;
  }

  // Update page info
  async updatePageInfo(pageId, updates) {
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${pageId}`, {
        ...updates,
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Update page failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Get page roles/admins
  async getPageRoles(pageId) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/roles`, {
      access_token: pt,
      fields: 'id,name,email,role,created_time'
    });
    return data.data || [];
  }

  // Get page settings
  async getPageSettings(pageId) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/settings`, {
      access_token: pt
    });
    return data.data || [];
  }

  // ========== PHASE 3: ADVANCED ANALYTICS ==========

  // Get video insights
  async getVideoInsights(pageId, days = 30) {
    return {
      supported: false,
      reason: 'The tested Page API flow does not expose the video_insights edge for these Pages.',
      tested_edge: 'video_insights',
      recommendation: 'Use supported page video view metrics from /insights instead of the video_insights edge.'
    };
  }

  // Get page lifetime stats
  async getPageLifetimeStats(pageId) {
    const details = await this.getPageDetails(pageId);

    return [
      {
        name: 'fan_count',
        title: 'Page Likes',
        values: [{ value: details.fan_count || 0 }]
      },
      {
        name: 'followers_count',
        title: 'Followers',
        values: [{ value: details.followers_count || 0 }]
      },
      {
        name: 'engagement_count',
        title: 'Engagement',
        values: [{ value: details.engagement?.count || 0 }]
      }
    ];
  }

  // Get content performance
  async getContentPerformance(pageId, days = 30) {
    return {
      supported: false,
      reason: 'The tested Page Insights metrics for content performance currently return invalid metric errors in this API flow.',
      tested_metrics: [
        'page_content_posts_impressions',
        'page_content_posts_engagement'
      ],
      recommendation: 'Use local post-level metrics from stored posts instead of these Page Insights content metrics.'
    };
  }

  // Get post engagement by type
  async getPostEngagementByType(pageId, days = 30) {
    return {
      supported: false,
      reason: 'The tested Page Insights metrics for engagement-by-type currently return invalid metric errors in this API flow.',
      tested_metrics: [
        'page_post_engagements',
        'page_consumptions',
        'page_places_checkin_total'
      ],
      recommendation: 'Use supported reaction and action metrics already collected in local daily snapshots.'
    };
  }

  // Get supported video view breakdown metrics
  async getVideoViewsBreakdown(pageId, days = 30) {
    const pt = await this.getPageToken(pageId);
    const until = Math.floor(Date.now() / 1000);
    const since = until - (days * 86400);

    const data = await this.rawGet(`/${pageId}/insights`, {
      access_token: pt,
      metric: [
        'page_video_views',
        'page_video_views_paid',
        'page_video_views_organic',
        'page_video_views_autoplayed',
        'page_video_views_click_to_play'
      ].join(','),
      since,
      until,
      period: 'day'
    });
    return data.data || [];
  }

  // ========== PHASE 3: AUTOMATION ==========

  // Get page milestones
  async getMilestones(pageId) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/milestones`, {
      access_token: pt,
      fields: 'id,title,description,created_time,updated_time'
    });
    return data.data || [];
  }

  // Create milestone
  async createMilestone(pageId, title, description, time) {
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${pageId}/milestones`, {
        title,
        description,
        milestone_timestamp: Math.floor(new Date(time).getTime() / 1000),
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Create milestone failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Get page offers
  async getOffers(pageId) {
    const pt = await this.getPageToken(pageId);
    const data = await this.rawGet(`/${pageId}/offers`, {
      access_token: pt,
      fields: 'id,title,description,expiration_time,redemption_code,redemption_link'
    });
    return data.data || [];
  }

  // Create offer
  async createOffer(pageId, title, description, expirationTime) {
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${pageId}/offers`, {
        title,
        message: description,
        expiration_time: Math.floor(new Date(expirationTime).getTime() / 1000),
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Create offer failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }

  // Get auto-reply rules
  async getAutoReplyRules(pageId) {
    const pt = await this.getPageToken(pageId);
    
    try {
      const data = await this.rawGet(`/${pageId}/message_configuration`, {
        access_token: pt
      });
      return data;
    } catch (error) {
      // May not be available
      return null;
    }
  }

  // Set instant reply
  async setInstantReply(pageId, message) {
    const pt = await this.getPageToken(pageId);
    
    try {
      const resp = await this.client.post(`/${pageId}/message_configuration`, {
        instant_replies: message,
        access_token: pt
      });
      return resp.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const fb = error.response.data.error;
        throw new Error(`Set instant reply failed [${fb.code}]: ${fb.message}`);
      }
      throw error;
    }
  }
}

module.exports = FacebookAPI;

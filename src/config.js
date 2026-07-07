require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  portfolios: [
    {
      name: 'DelementsYou',
      token: process.env.TOKEN_PORTFOLIO_1
    },
    {
      name: 'Cute Girl Around',
      token: process.env.TOKEN_PORTFOLIO_2
    }
  ],

  fb: {
    version: 'v21.0',
    baseUrl: 'https://graph.facebook.com',
    rateLimitBuffer: 0.8
  },

  // Metrics that work without App Review
  pageMetrics: [
    'page_actions_post_reactions_like_total',
    'page_actions_post_reactions_love_total',
    'page_actions_post_reactions_wow_total',
    'page_actions_post_reactions_haha_total',
    'page_actions_post_reactions_sorry_total',
    'page_actions_post_reactions_anger_total',
    'page_post_engagements',
    'page_video_views',
    'page_total_actions'
  ],

  postMetrics: [
    'post_reactions_like_total',
    'post_reactions_love_total',
    'post_reactions_wow_total',
    'post_reactions_haha_total',
    'post_clicks',
    'post_video_views'
  ],

  ads: {
    defaultDays: 30,
    accountFields: [
      'id',
      'account_id',
      'name',
      'account_status',
      'currency',
      'timezone_name'
    ],
    campaignFields: [
      'id',
      'name',
      'status',
      'effective_status',
      'objective',
      'buying_type',
      'start_time',
      'stop_time'
    ],
    adSetFields: [
      'id',
      'name',
      'campaign_id',
      'status',
      'effective_status',
      'optimization_goal',
      'billing_event',
      'bid_strategy',
      'daily_budget',
      'lifetime_budget',
      'start_time',
      'end_time'
    ],
    adFields: [
      'id',
      'name',
      'campaign_id',
      'adset_id',
      'status',
      'effective_status',
      'creative{id}'
    ],
    insightFields: [
      'account_id',
      'account_name',
      'campaign_id',
      'campaign_name',
      'adset_id',
      'adset_name',
      'ad_id',
      'ad_name',
      'date_start',
      'date_stop',
      'impressions',
      'reach',
      'clicks',
      'ctr',
      'cpc',
      'cpm',
      'spend',
      'frequency'
    ],
    optionalInsightFields: [
      'actions',
      'cost_per_action_type',
      'purchase_roas',
      'website_purchase_roas',
      'outbound_clicks',
      'inline_link_clicks',
      'unique_clicks',
      'unique_inline_link_clicks',
      'cost_per_inline_link_click',
      'cost_per_unique_click'
    ]
  },

  instagram: {
    defaultDays: 30,
    mediaFetchLimit: 50,
    mediaInsightsLimit: 20,
    profileFields: [
      'id',
      'username',
      'name',
      'biography',
      'followers_count',
      'follows_count',
      'media_count',
      'profile_picture_url'
    ],
    mediaFields: [
      'id',
      'caption',
      'media_type',
      'media_product_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'like_count',
      'comments_count'
    ],
    accountDayMetrics: [
      'reach',
      'follower_count'
    ],
    accountTotalValueMetrics: [
      'profile_views',
      'accounts_engaged',
      'total_interactions'
    ],
    demographicsMetric: 'follower_demographics',
    mediaInsightMetrics: [
      'impressions',
      'reach',
      'saved',
      'likes',
      'comments',
      'shares',
      'total_interactions',
      'views'
    ]
  },

  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost'
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'social-commerce'
  },

  security: {
    enableScheduler: process.env.ENABLE_SCHEDULER === 'true',
    enableStartupFetch: process.env.ENABLE_STARTUP_FETCH === 'true',
    readOnly: process.env.READ_ONLY !== 'false',
    auth: {
      username: process.env.APP_USERNAME || 'admin',
      password: process.env.APP_PASSWORD || '',
      passwordHash: process.env.APP_PASSWORD_HASH || '',
      sessionSecret: process.env.SESSION_SECRET || 'change-me-in-env',
      cookieName: 'fb_metrics_session'
    }
  },

  schedule: {
    daily: '0 6 * * *'
  }
};

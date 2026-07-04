const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DB {
  constructor() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.db = new Database(path.join(dataDir, 'metrics.db'));
    this.init();
  }

  init() {
    // Enable foreign keys
    this.db.exec('PRAGMA foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        fan_count INTEGER,
        followers_count INTEGER,
        portfolio TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        page_id TEXT,
        message TEXT,
        created_time TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS page_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id TEXT,
        date TEXT,
        fan_count INTEGER,
        followers_count INTEGER,
        post_engagements INTEGER,
        video_views INTEGER,
        total_actions INTEGER,
        reactions_like INTEGER,
        reactions_love INTEGER,
        reactions_wow INTEGER,
        reactions_haha INTEGER,
        reactions_sorry INTEGER,
        reactions_anger INTEGER,
        impressions INTEGER DEFAULT 0,
        impressions_paid INTEGER DEFAULT 0,
        impressions_organic INTEGER DEFAULT 0,
        engaged_users INTEGER DEFAULT 0,
        consumptions INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(page_id, date),
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS post_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT,
        date TEXT,
        reactions_like INTEGER,
        reactions_love INTEGER,
        reactions_wow INTEGER,
        reactions_haha INTEGER,
        clicks INTEGER,
        video_views INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, date),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        post_id TEXT,
        from_id TEXT,
        from_name TEXT,
        message TEXT,
        created_time TEXT,
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        is_hidden INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ad_accounts (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        name TEXT,
        account_status TEXT,
        currency TEXT,
        timezone_name TEXT,
        portfolio TEXT,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        ad_account_id TEXT,
        name TEXT,
        status TEXT,
        effective_status TEXT,
        objective TEXT,
        buying_type TEXT,
        start_time TEXT,
        stop_time TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ad_sets (
        id TEXT PRIMARY KEY,
        ad_account_id TEXT,
        campaign_id TEXT,
        name TEXT,
        status TEXT,
        effective_status TEXT,
        optimization_goal TEXT,
        billing_event TEXT,
        bid_strategy TEXT,
        daily_budget TEXT,
        lifetime_budget TEXT,
        start_time TEXT,
        end_time TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ads (
        id TEXT PRIMARY KEY,
        ad_account_id TEXT,
        campaign_id TEXT,
        ad_set_id TEXT,
        name TEXT,
        status TEXT,
        effective_status TEXT,
        creative_id TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (ad_set_id) REFERENCES ad_sets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ad_insights_daily (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad_account_id TEXT,
        level TEXT,
        account_id TEXT,
        account_name TEXT,
        campaign_id TEXT,
        campaign_name TEXT,
        ad_set_id TEXT,
        ad_set_name TEXT,
        ad_id TEXT,
        ad_name TEXT,
        date_start TEXT,
        date_stop TEXT,
        impressions INTEGER DEFAULT 0,
        reach INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        ctr REAL DEFAULT 0,
        cpc REAL DEFAULT 0,
        cpm REAL DEFAULT 0,
        spend REAL DEFAULT 0,
        frequency REAL DEFAULT 0,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(level, ad_account_id, campaign_id, ad_set_id, ad_id, date_start, date_stop),
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (ad_set_id) REFERENCES ad_sets(id) ON DELETE CASCADE,
        FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS instagram_accounts (
        id TEXT PRIMARY KEY,
        page_id TEXT,
        page_name TEXT,
        username TEXT,
        name TEXT,
        biography TEXT,
        followers_count INTEGER DEFAULT 0,
        follows_count INTEGER DEFAULT 0,
        media_count INTEGER DEFAULT 0,
        profile_picture_url TEXT,
        portfolio TEXT,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS instagram_media (
        id TEXT PRIMARY KEY,
        instagram_account_id TEXT,
        caption TEXT,
        media_type TEXT,
        media_product_type TEXT,
        media_url TEXT,
        thumbnail_url TEXT,
        permalink TEXT,
        timestamp TEXT,
        like_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instagram_account_id) REFERENCES instagram_accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS instagram_account_insight_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instagram_account_id TEXT,
        snapshot_date TEXT,
        reach INTEGER DEFAULT 0,
        follower_count INTEGER DEFAULT 0,
        profile_views INTEGER DEFAULT 0,
        accounts_engaged INTEGER DEFAULT 0,
        total_interactions INTEGER DEFAULT 0,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(instagram_account_id, snapshot_date),
        FOREIGN KEY (instagram_account_id) REFERENCES instagram_accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS instagram_demographics_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instagram_account_id TEXT,
        snapshot_date TEXT,
        supported INTEGER DEFAULT 0,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(instagram_account_id, snapshot_date),
        FOREIGN KEY (instagram_account_id) REFERENCES instagram_accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS instagram_media_insight_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id TEXT,
        snapshot_date TEXT,
        supported INTEGER DEFAULT 0,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(media_id, snapshot_date),
        FOREIGN KEY (media_id) REFERENCES instagram_media(id) ON DELETE CASCADE
      );
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_posts_page_id ON posts(page_id);
      CREATE INDEX IF NOT EXISTS idx_posts_created_time ON posts(created_time);
      CREATE INDEX IF NOT EXISTS idx_page_metrics_page_id ON page_metrics(page_id);
      CREATE INDEX IF NOT EXISTS idx_page_metrics_date ON page_metrics(date);
      CREATE INDEX IF NOT EXISTS idx_post_metrics_post_id ON post_metrics(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_metrics_date ON post_metrics(date);
      CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
      CREATE INDEX IF NOT EXISTS idx_comments_created_time ON comments(created_time);
      CREATE INDEX IF NOT EXISTS idx_ad_accounts_portfolio ON ad_accounts(portfolio);
      CREATE INDEX IF NOT EXISTS idx_campaigns_account_id ON campaigns(ad_account_id);
      CREATE INDEX IF NOT EXISTS idx_ad_sets_account_id ON ad_sets(ad_account_id);
      CREATE INDEX IF NOT EXISTS idx_ad_sets_campaign_id ON ad_sets(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_ads_account_id ON ads(ad_account_id);
      CREATE INDEX IF NOT EXISTS idx_ads_campaign_id ON ads(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_ads_ad_set_id ON ads(ad_set_id);
      CREATE INDEX IF NOT EXISTS idx_ad_insights_account_date ON ad_insights_daily(ad_account_id, date_start);
      CREATE INDEX IF NOT EXISTS idx_ad_insights_level_date ON ad_insights_daily(level, date_start);
      CREATE INDEX IF NOT EXISTS idx_ad_insights_campaign_date ON ad_insights_daily(campaign_id, date_start);
      CREATE INDEX IF NOT EXISTS idx_instagram_accounts_portfolio ON instagram_accounts(portfolio);
      CREATE INDEX IF NOT EXISTS idx_instagram_accounts_page_id ON instagram_accounts(page_id);
      CREATE INDEX IF NOT EXISTS idx_instagram_media_account_id ON instagram_media(instagram_account_id);
      CREATE INDEX IF NOT EXISTS idx_instagram_media_timestamp ON instagram_media(timestamp);
      CREATE INDEX IF NOT EXISTS idx_instagram_insight_snapshots_account_date ON instagram_account_insight_snapshots(instagram_account_id, snapshot_date);
    `);

    // Migration: Add fan_count and followers_count columns if they don't exist
    try {
      this.db.exec(`ALTER TABLE page_metrics ADD COLUMN fan_count INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE page_metrics ADD COLUMN followers_count INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }

    console.log('✅ Database initialized with indexes and foreign keys');
  }

  savePage(page) {
    this.db.prepare(`
      INSERT INTO pages (id, name, category, fan_count, followers_count, portfolio)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        category=excluded.category,
        fan_count=excluded.fan_count,
        followers_count=excluded.followers_count,
        portfolio=excluded.portfolio,
        updated_at=CURRENT_TIMESTAMP
    `).run(page.id, page.name, page.category, page.fan_count, page.followers_count, page.portfolio);
  }

  savePost(post) {
    this.db.prepare(`
      INSERT INTO posts (id, page_id, message, created_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        page_id=excluded.page_id,
        message=excluded.message,
        created_time=excluded.created_time,
        updated_at=CURRENT_TIMESTAMP
    `).run(post.id, post.page_id, post.message, post.created_time);
  }

  savePageMetrics(metrics) {
    this.db.prepare(`
      INSERT INTO page_metrics (page_id, date, fan_count, followers_count, post_engagements, video_views, total_actions,
        reactions_like, reactions_love, reactions_wow, reactions_haha, reactions_sorry, reactions_anger,
        impressions, impressions_paid, impressions_organic, engaged_users, consumptions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(page_id, date) DO UPDATE SET
        fan_count=excluded.fan_count,
        followers_count=excluded.followers_count,
        post_engagements=excluded.post_engagements,
        video_views=excluded.video_views,
        total_actions=excluded.total_actions,
        reactions_like=excluded.reactions_like,
        reactions_love=excluded.reactions_love,
        reactions_wow=excluded.reactions_wow,
        reactions_haha=excluded.reactions_haha,
        reactions_sorry=excluded.reactions_sorry,
        reactions_anger=excluded.reactions_anger,
        impressions=excluded.impressions,
        impressions_paid=excluded.impressions_paid,
        impressions_organic=excluded.impressions_organic,
        engaged_users=excluded.engaged_users,
        consumptions=excluded.consumptions
    `).run(
      metrics.page_id, metrics.date,
      metrics.fan_count || 0, metrics.followers_count || 0,
      metrics.post_engagements || 0, metrics.video_views || 0, metrics.total_actions || 0,
      metrics.reactions_like || 0, metrics.reactions_love || 0, metrics.reactions_wow || 0,
      metrics.reactions_haha || 0, metrics.reactions_sorry || 0, metrics.reactions_anger || 0,
      metrics.impressions || 0, metrics.impressions_paid || 0, metrics.impressions_organic || 0,
      metrics.engaged_users || 0, metrics.consumptions || 0
    );
  }

  savePostMetrics(metrics) {
    this.db.prepare(`
      INSERT INTO post_metrics (post_id, date, reactions_like, reactions_love, reactions_wow,
        reactions_haha, clicks, video_views)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(post_id, date) DO UPDATE SET
        reactions_like=excluded.reactions_like,
        reactions_love=excluded.reactions_love,
        reactions_wow=excluded.reactions_wow,
        reactions_haha=excluded.reactions_haha,
        clicks=excluded.clicks,
        video_views=excluded.video_views
    `).run(
      metrics.post_id, metrics.date,
      metrics.reactions_like || 0, metrics.reactions_love || 0, metrics.reactions_wow || 0,
      metrics.reactions_haha || 0, metrics.clicks || 0, metrics.video_views || 0
    );
  }

  getPages() {
    return this.db.prepare('SELECT * FROM pages ORDER BY fan_count DESC').all();
  }

  getAggregatedMetrics(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    
    const metrics = this.db.prepare(`
      SELECT 
        date,
        SUM(post_engagements) as engagements,
        SUM(video_views) as video_views,
        SUM(total_actions) as total_actions,
        SUM(reactions_like) as like_count,
        SUM(reactions_love) as love_count,
        SUM(reactions_wow) as wow_count,
        SUM(reactions_haha) as haha_count,
        SUM(reactions_sorry) as sorry_count,
        SUM(reactions_anger) as anger_count
      FROM page_metrics
      WHERE date >= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(sinceStr);
    
    const totals = this.db.prepare(`
      SELECT 
        SUM(post_engagements) as total_engagements,
        SUM(video_views) as total_video_views,
        SUM(total_actions) as total_actions,
        SUM(reactions_like) as total_like,
        SUM(reactions_love) as total_love,
        SUM(reactions_wow) as total_wow,
        SUM(reactions_haha) as total_haha,
        SUM(reactions_sorry) as total_sorry,
        SUM(reactions_anger) as total_anger
      FROM page_metrics
      WHERE date >= ?
    `).get(sinceStr);
    
    return { metrics, totals };
  }

  getPageMetrics(pageId, days = 30) {
    return this.db.prepare(`
      SELECT * FROM page_metrics
      WHERE page_id = ?
      ORDER BY date DESC
      LIMIT ?
    `).all(pageId, days);
  }

  getPostsByPage(pageId) {
    return this.db.prepare(`
      SELECT p.*, 
        COALESCE(SUM(pm.reactions_like), 0) as like_count,
        COALESCE(SUM(pm.reactions_love), 0) as love_count,
        COALESCE(SUM(pm.reactions_wow), 0) as wow_count,
        COALESCE(SUM(pm.reactions_haha), 0) as haha_count,
        COALESCE(SUM(pm.clicks), 0) as click_count,
        COALESCE(SUM(pm.video_views), 0) as video_views
      FROM posts p
      LEFT JOIN post_metrics pm ON p.id = pm.post_id
      WHERE p.page_id = ?
      GROUP BY p.id
      ORDER BY p.created_time DESC
    `).all(pageId);
  }

  getPostMetrics(postId) {
    return this.db.prepare(`
      SELECT * FROM post_metrics
      WHERE post_id = ?
      ORDER BY date DESC
    `).all(postId);
  }

  getFanGrowth(pageId, days = 30) {
    return this.db.prepare(`
      SELECT date, fan_count, followers_count
      FROM page_metrics
      WHERE page_id = ?
      ORDER BY date ASC
    `).all(pageId).slice(-days);
  }

  getReactionsTimeline(pageId, days = 30) {
    return this.db.prepare(`
      SELECT date,
        reactions_like as like,
        reactions_love as love,
        reactions_wow as wow,
        reactions_haha as haha,
        reactions_sorry as sorry,
        reactions_anger as angry
      FROM page_metrics
      WHERE page_id = ?
      ORDER BY date ASC
    `).all(pageId).slice(-days);
  }

  getBestPostingTimes(pageId, days = 30) {
    return this.db.prepare(`
      SELECT 
        CAST(strftime('%w', created_time) AS INTEGER) as day,
        CAST(strftime('%H', created_time) AS INTEGER) as hour,
        AVG(COALESCE(like_count,0) + COALESCE(love_count,0) + COALESCE(wow_count,0) + COALESCE(haha_count,0) + COALESCE(click_count,0)) as avgEngagement,
        COUNT(*) as postCount
      FROM posts
      WHERE page_id = ?
      GROUP BY day, hour
      ORDER BY avgEngagement DESC
    `).all(pageId);
  }

  getTopPosts(pageId, limit = 10) {
    return this.db.prepare(`
      SELECT p.id, p.message,
        COALESCE(SUM(pm.reactions_like), 0) as likes,
        COALESCE(SUM(pm.reactions_love), 0) as loves,
        COALESCE(SUM(pm.reactions_wow), 0) as wows,
        COALESCE(SUM(pm.reactions_haha), 0) as hahas,
        COALESCE(SUM(pm.clicks), 0) as clicks,
        COALESCE(SUM(pm.video_views), 0) as video_views,
        (COALESCE(SUM(pm.reactions_like),0) + COALESCE(SUM(pm.reactions_love),0) + 
         COALESCE(SUM(pm.reactions_wow),0) + COALESCE(SUM(pm.reactions_haha),0)) as total_engagement
      FROM posts p
      LEFT JOIN post_metrics pm ON p.id = pm.post_id
      WHERE p.page_id = ?
      GROUP BY p.id
      ORDER BY total_engagement DESC
      LIMIT ?
    `).all(pageId, limit);
  }

  saveAdAccount(account) {
    this.db.prepare(`
      INSERT INTO ad_accounts (id, account_id, name, account_status, currency, timezone_name, portfolio)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        account_id=excluded.account_id,
        name=excluded.name,
        account_status=excluded.account_status,
        currency=excluded.currency,
        timezone_name=excluded.timezone_name,
        portfolio=excluded.portfolio,
        last_synced_at=CURRENT_TIMESTAMP
    `).run(
      account.id,
      account.account_id || account.id.replace(/^act_/, ''),
      account.name || account.id,
      account.account_status || '',
      account.currency || '',
      account.timezone_name || '',
      account.portfolio || ''
    );
  }

  saveCampaign(campaign) {
    this.db.prepare(`
      INSERT INTO campaigns (id, ad_account_id, name, status, effective_status, objective, buying_type, start_time, stop_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ad_account_id=excluded.ad_account_id,
        name=excluded.name,
        status=excluded.status,
        effective_status=excluded.effective_status,
        objective=excluded.objective,
        buying_type=excluded.buying_type,
        start_time=excluded.start_time,
        stop_time=excluded.stop_time,
        updated_at=CURRENT_TIMESTAMP
    `).run(
      campaign.id,
      campaign.ad_account_id,
      campaign.name || campaign.id,
      campaign.status || '',
      campaign.effective_status || '',
      campaign.objective || '',
      campaign.buying_type || '',
      campaign.start_time || null,
      campaign.stop_time || null
    );
  }

  saveAdSet(adSet) {
    this.db.prepare(`
      INSERT INTO ad_sets (id, ad_account_id, campaign_id, name, status, effective_status, optimization_goal, billing_event, bid_strategy, daily_budget, lifetime_budget, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ad_account_id=excluded.ad_account_id,
        campaign_id=excluded.campaign_id,
        name=excluded.name,
        status=excluded.status,
        effective_status=excluded.effective_status,
        optimization_goal=excluded.optimization_goal,
        billing_event=excluded.billing_event,
        bid_strategy=excluded.bid_strategy,
        daily_budget=excluded.daily_budget,
        lifetime_budget=excluded.lifetime_budget,
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        updated_at=CURRENT_TIMESTAMP
    `).run(
      adSet.id,
      adSet.ad_account_id,
      adSet.campaign_id || null,
      adSet.name || adSet.id,
      adSet.status || '',
      adSet.effective_status || '',
      adSet.optimization_goal || '',
      adSet.billing_event || '',
      adSet.bid_strategy || '',
      adSet.daily_budget || null,
      adSet.lifetime_budget || null,
      adSet.start_time || null,
      adSet.end_time || null
    );
  }

  saveAd(ad) {
    this.db.prepare(`
      INSERT INTO ads (id, ad_account_id, campaign_id, ad_set_id, name, status, effective_status, creative_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ad_account_id=excluded.ad_account_id,
        campaign_id=excluded.campaign_id,
        ad_set_id=excluded.ad_set_id,
        name=excluded.name,
        status=excluded.status,
        effective_status=excluded.effective_status,
        creative_id=excluded.creative_id,
        updated_at=CURRENT_TIMESTAMP
    `).run(
      ad.id,
      ad.ad_account_id,
      ad.campaign_id || null,
      ad.ad_set_id || null,
      ad.name || ad.id,
      ad.status || '',
      ad.effective_status || '',
      ad.creative_id || null
    );
  }

  saveAdInsight(insight) {
    const normalized = {
      ad_account_id: insight.ad_account_id,
      level: insight.level,
      account_id: insight.account_id || '',
      account_name: insight.account_name || '',
      campaign_id: insight.campaign_id || null,
      campaign_name: insight.campaign_name || '',
      ad_set_id: insight.ad_set_id || null,
      ad_set_name: insight.ad_set_name || '',
      ad_id: insight.ad_id || null,
      ad_name: insight.ad_name || '',
      date_start: insight.date_start,
      date_stop: insight.date_stop,
      impressions: parseInt(insight.impressions, 10) || 0,
      reach: parseInt(insight.reach, 10) || 0,
      clicks: parseInt(insight.clicks, 10) || 0,
      ctr: parseFloat(insight.ctr) || 0,
      cpc: parseFloat(insight.cpc) || 0,
      cpm: parseFloat(insight.cpm) || 0,
      spend: parseFloat(insight.spend) || 0,
      frequency: parseFloat(insight.frequency) || 0,
      raw_json: insight.raw_json || null
    };

    const existing = this.db.prepare(`
      SELECT id
      FROM ad_insights_daily
      WHERE level = ?
        AND ad_account_id = ?
        AND COALESCE(campaign_id, '') = COALESCE(?, '')
        AND COALESCE(ad_set_id, '') = COALESCE(?, '')
        AND COALESCE(ad_id, '') = COALESCE(?, '')
        AND date_start = ?
        AND date_stop = ?
      LIMIT 1
    `).get(
      normalized.level,
      normalized.ad_account_id,
      normalized.campaign_id,
      normalized.ad_set_id,
      normalized.ad_id,
      normalized.date_start,
      normalized.date_stop
    );

    if (existing) {
      this.db.prepare(`
        UPDATE ad_insights_daily
        SET
          account_id = ?,
          account_name = ?,
          campaign_id = ?,
          campaign_name = ?,
          ad_set_id = ?,
          ad_set_name = ?,
          ad_id = ?,
          ad_name = ?,
          impressions = ?,
          reach = ?,
          clicks = ?,
          ctr = ?,
          cpc = ?,
          cpm = ?,
          spend = ?,
          frequency = ?,
          raw_json = ?
        WHERE id = ?
      `).run(
        normalized.account_id,
        normalized.account_name,
        normalized.campaign_id,
        normalized.campaign_name,
        normalized.ad_set_id,
        normalized.ad_set_name,
        normalized.ad_id,
        normalized.ad_name,
        normalized.impressions,
        normalized.reach,
        normalized.clicks,
        normalized.ctr,
        normalized.cpc,
        normalized.cpm,
        normalized.spend,
        normalized.frequency,
        normalized.raw_json,
        existing.id
      );
      return;
    }

    this.db.prepare(`
      INSERT INTO ad_insights_daily (
        ad_account_id, level, account_id, account_name, campaign_id, campaign_name,
        ad_set_id, ad_set_name, ad_id, ad_name, date_start, date_stop, impressions,
        reach, clicks, ctr, cpc, cpm, spend, frequency, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.ad_account_id,
      normalized.level,
      normalized.account_id,
      normalized.account_name,
      normalized.campaign_id,
      normalized.campaign_name,
      normalized.ad_set_id,
      normalized.ad_set_name,
      normalized.ad_id,
      normalized.ad_name,
      normalized.date_start,
      normalized.date_stop,
      normalized.impressions,
      normalized.reach,
      normalized.clicks,
      normalized.ctr,
      normalized.cpc,
      normalized.cpm,
      normalized.spend,
      normalized.frequency,
      normalized.raw_json
    );
  }

  cleanupDuplicateAdInsights() {
    const before = this.db.prepare(`SELECT COUNT(*) as cnt FROM ad_insights_daily`).get().cnt;
    const duplicateGroups = this.db.prepare(`
      SELECT
        level,
        ad_account_id,
        COALESCE(campaign_id, '') as campaign_key,
        COALESCE(ad_set_id, '') as ad_set_key,
        COALESCE(ad_id, '') as ad_key,
        date_start,
        date_stop,
        MIN(id) as keep_id,
        COUNT(*) as cnt
      FROM ad_insights_daily
      GROUP BY level, ad_account_id, COALESCE(campaign_id, ''), COALESCE(ad_set_id, ''), COALESCE(ad_id, ''), date_start, date_stop
      HAVING COUNT(*) > 1
    `).all();

    const deleteStmt = this.db.prepare(`
      DELETE FROM ad_insights_daily
      WHERE level = ?
        AND ad_account_id = ?
        AND COALESCE(campaign_id, '') = ?
        AND COALESCE(ad_set_id, '') = ?
        AND COALESCE(ad_id, '') = ?
        AND date_start = ?
        AND date_stop = ?
        AND id <> ?
    `);

    const transaction = this.db.transaction((groups) => {
      for (const group of groups) {
        deleteStmt.run(
          group.level,
          group.ad_account_id,
          group.campaign_key,
          group.ad_set_key,
          group.ad_key,
          group.date_start,
          group.date_stop,
          group.keep_id
        );
      }
    });

    transaction(duplicateGroups);

    const after = this.db.prepare(`SELECT COUNT(*) as cnt FROM ad_insights_daily`).get().cnt;
    return {
      before,
      after,
      deleted: before - after,
      duplicateGroups: duplicateGroups.length
    };
  }

  getAdAccounts() {
    return this.db.prepare(`
      SELECT *
      FROM ad_accounts
      ORDER BY name COLLATE NOCASE ASC
    `).all();
  }

  getCampaignsByAdAccount(adAccountId) {
    return this.db.prepare(`
      SELECT *
      FROM campaigns
      WHERE ad_account_id = ?
      ORDER BY name COLLATE NOCASE ASC
    `).all(adAccountId);
  }

  getAdSetsByAdAccount(adAccountId) {
    return this.db.prepare(`
      SELECT *
      FROM ad_sets
      WHERE ad_account_id = ?
      ORDER BY name COLLATE NOCASE ASC
    `).all(adAccountId);
  }

  getAdsByAdAccount(adAccountId) {
    return this.db.prepare(`
      SELECT *
      FROM ads
      WHERE ad_account_id = ?
      ORDER BY name COLLATE NOCASE ASC
    `).all(adAccountId);
  }

  getAdInsights({ adAccountId, level = 'account', days = 30, campaignId = null }) {
    const since = new Date();
    since.setDate(since.getDate() - (parseInt(days, 10) || 30));
    const sinceStr = since.toISOString().split('T')[0];

    let sql = `
      SELECT *
      FROM ad_insights_daily
      WHERE level = ?
        AND date_start >= ?
    `;
    const params = [level, sinceStr];

    if (adAccountId) {
      sql += ' AND ad_account_id = ?';
      params.push(adAccountId);
    }

    if (campaignId) {
      sql += ' AND campaign_id = ?';
      params.push(campaignId);
    }

    sql += ' ORDER BY date_start ASC';

    return this.db.prepare(sql).all(...params);
  }

  getAdInsightsSummaryByLevel({ adAccountId, level = 'campaign', days = 30, campaignId = null }) {
    const since = new Date();
    since.setDate(since.getDate() - (parseInt(days, 10) || 30));
    const sinceStr = since.toISOString().split('T')[0];

    let idField = 'campaign_id';
    let nameField = 'campaign_name';

    if (level === 'adset') {
      idField = 'ad_set_id';
      nameField = 'ad_set_name';
    } else if (level === 'ad') {
      idField = 'ad_id';
      nameField = 'ad_name';
    }

    let sql = `
      SELECT
        ${idField} as entity_id,
        ${nameField} as entity_name,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(reach) as reach,
        SUM(clicks) as clicks,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks) * 100.0 / SUM(impressions)) ELSE 0 END as ctr,
        CASE WHEN SUM(clicks) > 0 THEN (SUM(spend) / SUM(clicks)) ELSE 0 END as cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) * 1000.0 / SUM(impressions)) ELSE 0 END as cpm,
        AVG(frequency) as frequency,
        MIN(date_start) as first_date,
        MAX(date_stop) as last_date
      FROM ad_insights_daily
      WHERE level = ?
        AND date_start >= ?
    `;
    const params = [level, sinceStr];

    if (adAccountId) {
      sql += ' AND ad_account_id = ?';
      params.push(adAccountId);
    }

    if (campaignId) {
      sql += ' AND campaign_id = ?';
      params.push(campaignId);
    }

    sql += `
      AND ${idField} IS NOT NULL
      GROUP BY ${idField}, ${nameField}
      ORDER BY spend DESC, clicks DESC, entity_name COLLATE NOCASE ASC
    `;

    return this.db.prepare(sql).all(...params);
  }

  getAdsSummary(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - (parseInt(days, 10) || 30));
    const sinceStr = since.toISOString().split('T')[0];

    const metrics = this.db.prepare(`
      SELECT
        date_start,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(reach) as reach,
        SUM(clicks) as clicks,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks) * 100.0 / SUM(impressions)) ELSE 0 END as ctr,
        CASE WHEN SUM(clicks) > 0 THEN (SUM(spend) / SUM(clicks)) ELSE 0 END as cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) * 1000.0 / SUM(impressions)) ELSE 0 END as cpm,
        AVG(frequency) as frequency
      FROM ad_insights_daily
      WHERE level = 'account'
        AND date_start >= ?
      GROUP BY date_start
      ORDER BY date_start ASC
    `).all(sinceStr);

    const totals = this.db.prepare(`
      SELECT
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(reach) as total_reach,
        SUM(clicks) as total_clicks,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks) * 100.0 / SUM(impressions)) ELSE 0 END as avg_ctr,
        CASE WHEN SUM(clicks) > 0 THEN (SUM(spend) / SUM(clicks)) ELSE 0 END as avg_cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) * 1000.0 / SUM(impressions)) ELSE 0 END as avg_cpm,
        AVG(frequency) as avg_frequency
      FROM ad_insights_daily
      WHERE level = 'account'
        AND date_start >= ?
    `).get(sinceStr);

    return { metrics, totals };
  }

  saveInstagramAccount(account) {
    this.db.prepare(`
      INSERT INTO instagram_accounts (
        id, page_id, page_name, username, name, biography,
        followers_count, follows_count, media_count, profile_picture_url, portfolio
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        page_id=excluded.page_id,
        page_name=excluded.page_name,
        username=excluded.username,
        name=excluded.name,
        biography=excluded.biography,
        followers_count=excluded.followers_count,
        follows_count=excluded.follows_count,
        media_count=excluded.media_count,
        profile_picture_url=excluded.profile_picture_url,
        portfolio=excluded.portfolio,
        last_synced_at=CURRENT_TIMESTAMP
    `).run(
      account.id,
      account.page_id || null,
      account.page_name || '',
      account.username || '',
      account.name || '',
      account.biography || '',
      parseInt(account.followers_count, 10) || 0,
      parseInt(account.follows_count, 10) || 0,
      parseInt(account.media_count, 10) || 0,
      account.profile_picture_url || '',
      account.portfolio || ''
    );
  }

  saveInstagramMedia(media) {
    this.db.prepare(`
      INSERT INTO instagram_media (
        id, instagram_account_id, caption, media_type, media_product_type,
        media_url, thumbnail_url, permalink, timestamp, like_count, comments_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        instagram_account_id=excluded.instagram_account_id,
        caption=excluded.caption,
        media_type=excluded.media_type,
        media_product_type=excluded.media_product_type,
        media_url=excluded.media_url,
        thumbnail_url=excluded.thumbnail_url,
        permalink=excluded.permalink,
        timestamp=excluded.timestamp,
        like_count=excluded.like_count,
        comments_count=excluded.comments_count,
        updated_at=CURRENT_TIMESTAMP
    `).run(
      media.id,
      media.instagram_account_id,
      media.caption || '',
      media.media_type || '',
      media.media_product_type || '',
      media.media_url || '',
      media.thumbnail_url || '',
      media.permalink || '',
      media.timestamp || null,
      parseInt(media.like_count, 10) || 0,
      parseInt(media.comments_count, 10) || 0
    );
  }

  saveInstagramAccountInsightSnapshot(snapshot) {
    const metrics = {
      reach: 0,
      follower_count: 0,
      profile_views: 0,
      accounts_engaged: 0,
      total_interactions: 0
    };

    (snapshot.day_metrics || []).forEach(metric => {
      const latestValue = Array.isArray(metric.values) && metric.values.length > 0
        ? metric.values[metric.values.length - 1]?.value
        : 0;
      if (metric.name in metrics) {
        metrics[metric.name] = parseInt(latestValue, 10) || 0;
      }
    });

    (snapshot.total_metrics || []).forEach(metric => {
      const value = metric.total_value?.value
        ?? (Array.isArray(metric.values) && metric.values.length > 0 ? metric.values[0]?.value : 0);
      if (metric.name in metrics) {
        metrics[metric.name] = parseInt(value, 10) || 0;
      }
    });

    this.db.prepare(`
      INSERT INTO instagram_account_insight_snapshots (
        instagram_account_id, snapshot_date, reach, follower_count,
        profile_views, accounts_engaged, total_interactions, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instagram_account_id, snapshot_date) DO UPDATE SET
        reach=excluded.reach,
        follower_count=excluded.follower_count,
        profile_views=excluded.profile_views,
        accounts_engaged=excluded.accounts_engaged,
        total_interactions=excluded.total_interactions,
        raw_json=excluded.raw_json
    `).run(
      snapshot.instagram_account_id,
      snapshot.snapshot_date,
      metrics.reach,
      metrics.follower_count,
      metrics.profile_views,
      metrics.accounts_engaged,
      metrics.total_interactions,
      JSON.stringify({
        day_metrics: snapshot.day_metrics || [],
        total_metrics: snapshot.total_metrics || []
      })
    );
  }

  replaceInstagramDemographicsSnapshot(snapshot) {
    this.db.prepare(`
      INSERT INTO instagram_demographics_snapshots (
        instagram_account_id, snapshot_date, supported, raw_json
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(instagram_account_id, snapshot_date) DO UPDATE SET
        supported=excluded.supported,
        raw_json=excluded.raw_json
    `).run(
      snapshot.instagram_account_id,
      snapshot.snapshot_date,
      snapshot.payload?.supported ? 1 : 0,
      JSON.stringify(snapshot.payload || { supported: false, data: [] })
    );
  }

  replaceInstagramMediaInsightsSnapshot(snapshot) {
    this.db.prepare(`
      INSERT INTO instagram_media_insight_snapshots (
        media_id, snapshot_date, supported, raw_json
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(media_id, snapshot_date) DO UPDATE SET
        supported=excluded.supported,
        raw_json=excluded.raw_json
    `).run(
      snapshot.media_id,
      snapshot.snapshot_date,
      snapshot.payload?.supported ? 1 : 0,
      JSON.stringify(snapshot.payload || { supported: false, data: [] })
    );
  }

  getInstagramAccounts() {
    return this.db.prepare(`
      SELECT *
      FROM instagram_accounts
      ORDER BY username COLLATE NOCASE ASC, name COLLATE NOCASE ASC
    `).all();
  }

  getInstagramMediaByAccount(instagramAccountId, limit = 25) {
    return this.db.prepare(`
      SELECT *
      FROM instagram_media
      WHERE instagram_account_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(instagramAccountId, limit);
  }

  getInstagramAccountInsightSnapshots(instagramAccountId, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - (parseInt(days, 10) || 30));
    const sinceStr = since.toISOString().split('T')[0];

    return this.db.prepare(`
      SELECT *
      FROM instagram_account_insight_snapshots
      WHERE instagram_account_id = ?
        AND snapshot_date >= ?
      ORDER BY snapshot_date ASC
    `).all(instagramAccountId, sinceStr);
  }

  getLatestInstagramDemographics(instagramAccountId) {
    return this.db.prepare(`
      SELECT *
      FROM instagram_demographics_snapshots
      WHERE instagram_account_id = ?
      ORDER BY snapshot_date DESC
      LIMIT 1
    `).get(instagramAccountId);
  }

  getLatestInstagramMediaInsights(mediaId) {
    return this.db.prepare(`
      SELECT *
      FROM instagram_media_insight_snapshots
      WHERE media_id = ?
      ORDER BY snapshot_date DESC
      LIMIT 1
    `).get(mediaId);
  }

  saveComment(comment) {
    this.db.prepare(`
      INSERT INTO comments (id, post_id, from_id, from_name, message, created_time, like_count, comment_count, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        post_id=excluded.post_id,
        from_id=excluded.from_id,
        from_name=excluded.from_name,
        message=excluded.message,
        created_time=excluded.created_time,
        like_count=excluded.like_count,
        comment_count=excluded.comment_count,
        is_hidden=excluded.is_hidden,
        updated_at=CURRENT_TIMESTAMP
    `).run(
      comment.id,
      comment.post_id,
      comment.from_id || '',
      comment.from_name || '',
      comment.message || '',
      comment.created_time,
      comment.like_count || 0,
      comment.comment_count || 0,
      comment.is_hidden ? 1 : 0
    );
  }

  getCommentsByPost(postId) {
    return this.db.prepare(`
      SELECT * FROM comments
      WHERE post_id = ?
      ORDER BY created_time DESC
    `).all(postId);
  }

  getCommentsByPage(pageId, limit = 100) {
    return this.db.prepare(`
      SELECT c.*, p.page_id
      FROM comments c
      JOIN posts p ON c.post_id = p.id
      WHERE p.page_id = ?
      ORDER BY c.created_time DESC
      LIMIT ?
    `).all(pageId, limit);
  }

  getAllCommentsByPage(pageId) {
    return this.db.prepare(`
      SELECT c.*, p.page_id
      FROM comments c
      JOIN posts p ON c.post_id = p.id
      WHERE p.page_id = ?
      ORDER BY c.created_time DESC
    `).all(pageId);
  }

  getLatestPostDate(pageId) {
    const result = this.db.prepare(`
      SELECT MAX(created_time) as latest
      FROM posts
      WHERE page_id = ?
    `).get(pageId);
    return result?.latest || null;
  }

  getLatestMetricDate(pageId) {
    const result = this.db.prepare(`
      SELECT MAX(date) as latest
      FROM page_metrics
      WHERE page_id = ?
    `).get(pageId);
    return result?.latest || null;
  }

  getDemographics(pageId) {
    return {
      age_gender: [],
      country: [],
      city: [],
      locale: []
    };
  }

  close() {
    this.db.close();
  }
}

module.exports = DB;

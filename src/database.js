const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function parseJsonSafe(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

class DB {
  constructor() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.db = new Database(path.join(dataDir, 'metrics.db'));
    this.init();
  }

  mergePortfolioValues(currentValue, nextValue) {
    const values = new Set();

    for (const raw of [currentValue, nextValue]) {
      const items = String(raw || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      for (const item of items) {
        values.add(item);
      }
    }

    return Array.from(values).sort((a, b) => a.localeCompare(b)).join(', ');
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
        data_grain TEXT DEFAULT 'legacy',
        sync_window_days INTEGER,
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

      CREATE TABLE IF NOT EXISTS ad_campaign_drafts (
        id TEXT PRIMARY KEY,
        ad_account_id TEXT,
        name TEXT,
        objective TEXT,
        buying_type TEXT DEFAULT 'AUCTION',
        special_ad_categories TEXT DEFAULT '[]',
        daily_budget REAL DEFAULT 0,
        lifetime_budget REAL DEFAULT 0,
        meta_status TEXT DEFAULT 'PAUSED',
        meta_campaign_id TEXT,
        published_at DATETIME,
        publish_error TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS ad_set_drafts (
        id TEXT PRIMARY KEY,
        campaign_draft_id TEXT,
        ad_account_id TEXT,
        name TEXT,
        optimization_goal TEXT,
        billing_event TEXT,
        bid_strategy TEXT,
        destination_type TEXT,
        targeting_json TEXT,
        daily_budget REAL DEFAULT 0,
        lifetime_budget REAL DEFAULT 0,
        start_time TEXT,
        end_time TEXT,
        meta_status TEXT DEFAULT 'PAUSED',
        meta_ad_set_id TEXT,
        published_at DATETIME,
        publish_error TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_draft_id) REFERENCES ad_campaign_drafts(id) ON DELETE CASCADE,
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS ad_drafts (
        id TEXT PRIMARY KEY,
        ad_set_draft_id TEXT,
        campaign_draft_id TEXT,
        ad_account_id TEXT,
        name TEXT,
        page_id TEXT,
        instagram_account_id TEXT,
        creative_name TEXT,
        message TEXT,
        headline TEXT,
        description TEXT,
        call_to_action TEXT,
        asset_url TEXT,
        asset_type TEXT,
        destination_url TEXT,
        meta_status TEXT DEFAULT 'PAUSED',
        meta_ad_id TEXT,
        meta_creative_id TEXT,
        published_at DATETIME,
        publish_error TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ad_set_draft_id) REFERENCES ad_set_drafts(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_draft_id) REFERENCES ad_campaign_drafts(id) ON DELETE CASCADE,
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS ad_budget_change_drafts (
        id TEXT PRIMARY KEY,
        ad_account_id TEXT,
        ad_set_id TEXT,
        ad_set_name TEXT,
        current_daily_budget REAL DEFAULT 0,
        current_lifetime_budget REAL DEFAULT 0,
        proposed_daily_budget REAL DEFAULT 0,
        proposed_lifetime_budget REAL DEFAULT 0,
        recommended_action TEXT,
        rationale TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (ad_set_id) REFERENCES ad_sets(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS ad_budget_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad_account_id TEXT,
        snapshot_date TEXT,
        days INTEGER,
        total_spend REAL DEFAULT 0,
        active_ad_sets INTEGER DEFAULT 0,
        daily_budget REAL DEFAULT 0,
        lifetime_budget REAL DEFAULT 0,
        estimated_period_budget REAL DEFAULT 0,
        utilization REAL DEFAULT 0,
        high_alerts INTEGER DEFAULT 0,
        medium_alerts INTEGER DEFAULT 0,
        low_alerts INTEGER DEFAULT 0,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ad_account_id, snapshot_date, days),
        FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
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

      CREATE TABLE IF NOT EXISTS dual_publish_jobs (
        id TEXT PRIMARY KEY,
        page_id TEXT,
        page_name TEXT,
        portfolio TEXT,
        instagram_account_id TEXT,
        instagram_username TEXT,
        facebook_post_id TEXT,
        media_url TEXT,
        message TEXT,
        scheduled_time TEXT,
        status TEXT DEFAULT 'scheduled',
        attempts INTEGER DEFAULT 0,
        instagram_container_id TEXT,
        instagram_media_id TEXT,
        publish_error TEXT,
        last_attempt_at TEXT,
        published_at TEXT,
        canceled_at TEXT,
        facebook_deleted_at TEXT,
        instagram_deleted_at TEXT,
        deleted_at TEXT,
        delete_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE SET NULL,
        FOREIGN KEY (instagram_account_id) REFERENCES instagram_accounts(id) ON DELETE SET NULL
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
      CREATE INDEX IF NOT EXISTS idx_ad_campaign_drafts_account ON ad_campaign_drafts(ad_account_id);
      CREATE INDEX IF NOT EXISTS idx_ad_set_drafts_campaign ON ad_set_drafts(campaign_draft_id);
      CREATE INDEX IF NOT EXISTS idx_ad_set_drafts_account ON ad_set_drafts(ad_account_id);
      CREATE INDEX IF NOT EXISTS idx_ad_drafts_ad_set ON ad_drafts(ad_set_draft_id);
      CREATE INDEX IF NOT EXISTS idx_ad_drafts_account ON ad_drafts(ad_account_id);
      CREATE INDEX IF NOT EXISTS idx_ad_budget_change_drafts_account ON ad_budget_change_drafts(ad_account_id);
      CREATE INDEX IF NOT EXISTS idx_ad_budget_snapshots_account_date ON ad_budget_snapshots(ad_account_id, snapshot_date);
      CREATE INDEX IF NOT EXISTS idx_instagram_accounts_portfolio ON instagram_accounts(portfolio);
      CREATE INDEX IF NOT EXISTS idx_instagram_accounts_page_id ON instagram_accounts(page_id);
      CREATE INDEX IF NOT EXISTS idx_instagram_media_account_id ON instagram_media(instagram_account_id);
      CREATE INDEX IF NOT EXISTS idx_instagram_media_timestamp ON instagram_media(timestamp);
      CREATE INDEX IF NOT EXISTS idx_instagram_insight_snapshots_account_date ON instagram_account_insight_snapshots(instagram_account_id, snapshot_date);
      CREATE INDEX IF NOT EXISTS idx_dual_publish_jobs_status_time ON dual_publish_jobs(status, scheduled_time);
      CREATE INDEX IF NOT EXISTS idx_dual_publish_jobs_page ON dual_publish_jobs(page_id);
      CREATE INDEX IF NOT EXISTS idx_dual_publish_jobs_instagram_account ON dual_publish_jobs(instagram_account_id);
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
    try {
      this.db.exec(`ALTER TABLE ad_insights_daily ADD COLUMN data_grain TEXT DEFAULT 'legacy'`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE ad_insights_daily ADD COLUMN sync_window_days INTEGER`);
    } catch (e) {
      // Column already exists
    }
    for (const table of ['ad_campaign_drafts', 'ad_set_drafts', 'ad_drafts']) {
      try {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN meta_status TEXT DEFAULT 'PAUSED'`);
      } catch (e) {
        // Column already exists
      }
    }
    for (const column of [
      `facebook_deleted_at TEXT`,
      `instagram_deleted_at TEXT`,
      `deleted_at TEXT`,
      `delete_error TEXT`
    ]) {
      try {
        this.db.exec(`ALTER TABLE dual_publish_jobs ADD COLUMN ${column}`);
      } catch (e) {
        // Column already exists
      }
    }
    for (const { table, columns } of [
      {
        table: 'ad_campaign_drafts',
        columns: [
          `meta_campaign_id TEXT`,
          `published_at DATETIME`,
          `publish_error TEXT`
        ]
      },
      {
        table: 'ad_set_drafts',
        columns: [
          `meta_ad_set_id TEXT`,
          `published_at DATETIME`,
          `publish_error TEXT`
        ]
      },
      {
        table: 'ad_drafts',
        columns: [
          `meta_ad_id TEXT`,
          `meta_creative_id TEXT`,
          `published_at DATETIME`,
          `publish_error TEXT`
        ]
      }
    ]) {
      for (const column of columns) {
        try {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`);
        } catch (e) {
          // Column already exists
        }
      }
    }

    this.db.exec(`
      UPDATE ad_insights_daily
      SET data_grain = CASE
        WHEN level = 'account' THEN 'daily'
        ELSE 'all_days'
      END
      WHERE data_grain IS NULL OR data_grain = '' OR data_grain = 'legacy'
    `);

    this.db.exec(`
      UPDATE ad_insights_daily
      SET sync_window_days = CASE
        WHEN level = 'account' THEN 1
        ELSE CAST((julianday(date_stop) - julianday(date_start) + 1) AS INTEGER)
      END
      WHERE sync_window_days IS NULL OR sync_window_days <= 0
    `);
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
    const existing = this.db.prepare(`
      SELECT portfolio
      FROM ad_accounts
      WHERE id = ?
    `).get(account.id);

    const mergedPortfolio = this.mergePortfolioValues(existing?.portfolio, account.portfolio);

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
      mergedPortfolio
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
      data_grain: insight.data_grain || (insight.level === 'account' ? 'daily' : 'all_days'),
      sync_window_days: parseInt(insight.sync_window_days, 10) || (insight.level === 'account' ? 1 : null),
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
          data_grain = ?,
          sync_window_days = ?,
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
        normalized.data_grain,
        normalized.sync_window_days,
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
        ad_account_id, level, data_grain, sync_window_days, account_id, account_name, campaign_id, campaign_name,
        ad_set_id, ad_set_name, ad_id, ad_name, date_start, date_stop, impressions,
        reach, clicks, ctr, cpc, cpm, spend, frequency, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.ad_account_id,
      normalized.level,
      normalized.data_grain,
      normalized.sync_window_days,
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

  cleanupAdBreakdownInsights() {
    const before = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN level = 'account' THEN 1 ELSE 0 END) as account_rows,
        SUM(CASE WHEN level = 'campaign' THEN 1 ELSE 0 END) as campaign_rows,
        SUM(CASE WHEN level = 'adset' THEN 1 ELSE 0 END) as adset_rows,
        SUM(CASE WHEN level = 'ad' THEN 1 ELSE 0 END) as ad_rows
      FROM ad_insights_daily
    `).get();

    const deleted = this.db.prepare(`
      DELETE FROM ad_insights_daily
      WHERE level IN ('campaign', 'adset', 'ad')
    `).run();

    const after = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN level = 'account' THEN 1 ELSE 0 END) as account_rows,
        SUM(CASE WHEN level = 'campaign' THEN 1 ELSE 0 END) as campaign_rows,
        SUM(CASE WHEN level = 'adset' THEN 1 ELSE 0 END) as adset_rows,
        SUM(CASE WHEN level = 'ad' THEN 1 ELSE 0 END) as ad_rows
      FROM ad_insights_daily
    `).get();

    return {
      before,
      after,
      deleted: deleted.changes
    };
  }

  cleanupInvalidAdBreakdownRows() {
    const before = this.db.prepare(`
      SELECT
        SUM(CASE WHEN level = 'campaign' AND campaign_id IS NULL THEN 1 ELSE 0 END) as missing_campaign_rows,
        SUM(CASE WHEN level = 'adset' AND (campaign_id IS NULL OR ad_set_id IS NULL) THEN 1 ELSE 0 END) as missing_adset_rows,
        SUM(CASE WHEN level = 'ad' AND (campaign_id IS NULL OR ad_set_id IS NULL OR ad_id IS NULL) THEN 1 ELSE 0 END) as missing_ad_rows
      FROM ad_insights_daily
      WHERE data_grain = 'all_days'
    `).get();

    const deleted = this.db.prepare(`
      DELETE FROM ad_insights_daily
      WHERE data_grain = 'all_days'
        AND (
          (level = 'campaign' AND campaign_id IS NULL)
          OR (level = 'adset' AND (campaign_id IS NULL OR ad_set_id IS NULL))
          OR (level = 'ad' AND (campaign_id IS NULL OR ad_set_id IS NULL OR ad_id IS NULL))
        )
    `).run();

    const after = this.db.prepare(`
      SELECT
        SUM(CASE WHEN level = 'campaign' AND campaign_id IS NULL THEN 1 ELSE 0 END) as missing_campaign_rows,
        SUM(CASE WHEN level = 'adset' AND (campaign_id IS NULL OR ad_set_id IS NULL) THEN 1 ELSE 0 END) as missing_adset_rows,
        SUM(CASE WHEN level = 'ad' AND (campaign_id IS NULL OR ad_set_id IS NULL OR ad_id IS NULL) THEN 1 ELSE 0 END) as missing_ad_rows
      FROM ad_insights_daily
      WHERE data_grain = 'all_days'
    `).get();

    return {
      before,
      after,
      deleted: deleted.changes
    };
  }

  getAdAccounts() {
    return this.db.prepare(`
      SELECT
        a.*,
        (
          SELECT COUNT(*)
          FROM ad_insights_daily i
          WHERE i.ad_account_id = a.id
            AND i.level = 'account'
            AND i.data_grain = 'daily'
        ) as account_daily_rows,
        (
          SELECT COUNT(*)
          FROM ad_insights_daily i
          WHERE i.ad_account_id = a.id
            AND i.level IN ('campaign', 'adset', 'ad')
            AND i.data_grain = 'all_days'
        ) as breakdown_rows
      FROM ad_accounts a
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
        AND data_grain = 'daily'
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
      WITH ranked AS (
        SELECT
          ${idField} as entity_id,
          ${nameField} as entity_name,
          data_grain,
          sync_window_days,
          spend,
          impressions,
          reach,
          clicks,
          ctr,
          cpc,
          cpm,
          frequency,
          raw_json,
          date_start as first_date,
          date_stop as last_date,
          ROW_NUMBER() OVER (
            PARTITION BY ${idField}
            ORDER BY
              CASE
                WHEN sync_window_days = ? THEN 0
                WHEN sync_window_days IS NULL THEN 2
                ELSE 1
              END,
              ABS(COALESCE(sync_window_days, 999999) - ?),
              date_stop DESC,
              date_start ASC
          ) as rn
        FROM ad_insights_daily
        WHERE level = ?
          AND data_grain = 'all_days'
          AND date_stop >= ?
    `;
    const requestedDays = parseInt(days, 10) || 30;
    const params = [requestedDays, requestedDays, level, sinceStr];

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
      )
      SELECT
        entity_id,
        entity_name,
        data_grain,
        sync_window_days,
        spend,
        impressions,
        reach,
        clicks,
        CASE WHEN impressions > 0 THEN (clicks * 100.0 / impressions) ELSE 0 END as ctr,
        CASE WHEN clicks > 0 THEN (spend / clicks) ELSE 0 END as cpc,
        CASE WHEN impressions > 0 THEN (spend * 1000.0 / impressions) ELSE 0 END as cpm,
        frequency,
        raw_json,
        first_date,
        last_date
      FROM ranked
      WHERE rn = 1
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
        AND data_grain = 'daily'
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
        AND data_grain = 'daily'
        AND date_start >= ?
    `).get(sinceStr);

    return { metrics, totals };
  }

  normalizeAdBudgetAmount(rawValue, currency = 'USD') {
    const raw = Number(rawValue || 0);
    if (!raw) return 0;

    const zeroDecimalCurrencies = new Set([
      'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
      'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
    ]);

    return zeroDecimalCurrencies.has(String(currency || '').toUpperCase())
      ? raw
      : raw / 100;
  }

  normalizeMetaDeliveryStatus(value, fallback = 'PAUSED') {
    const allowed = ['PAUSED', 'ACTIVE'];
    const normalized = String(value || fallback || 'PAUSED').toUpperCase();
    const fallbackStatus = String(fallback || 'PAUSED').toUpperCase();
    return allowed.includes(normalized)
      ? normalized
      : allowed.includes(fallbackStatus) ? fallbackStatus : 'PAUSED';
  }

  createCampaignDraft(draft) {
    this.db.prepare(`
      INSERT INTO ad_campaign_drafts (
        id, ad_account_id, name, objective, buying_type, special_ad_categories,
        daily_budget, lifetime_budget, meta_status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.ad_account_id || null,
      draft.name || '',
      draft.objective || 'OUTCOME_ENGAGEMENT',
      draft.buying_type || 'AUCTION',
      JSON.stringify(draft.special_ad_categories || []),
      Number(draft.daily_budget || 0),
      Number(draft.lifetime_budget || 0),
      this.normalizeMetaDeliveryStatus(draft.meta_status),
      draft.notes || ''
    );
    return this.getCampaignDraft(draft.id);
  }

  createAdSetDraft(draft) {
    this.db.prepare(`
      INSERT INTO ad_set_drafts (
        id, campaign_draft_id, ad_account_id, name, optimization_goal, billing_event,
        bid_strategy, destination_type, targeting_json, daily_budget, lifetime_budget,
        start_time, end_time, meta_status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.campaign_draft_id,
      draft.ad_account_id || null,
      draft.name || '',
      draft.optimization_goal || 'POST_ENGAGEMENT',
      draft.billing_event || 'IMPRESSIONS',
      draft.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      draft.destination_type || '',
      JSON.stringify(draft.targeting || {}),
      Number(draft.daily_budget || 0),
      Number(draft.lifetime_budget || 0),
      draft.start_time || null,
      draft.end_time || null,
      this.normalizeMetaDeliveryStatus(draft.meta_status),
      draft.notes || ''
    );
    return this.getAdSetDraft(draft.id);
  }

  createAdDraft(draft) {
    this.db.prepare(`
      INSERT INTO ad_drafts (
        id, ad_set_draft_id, campaign_draft_id, ad_account_id, name, page_id,
        instagram_account_id, creative_name, message, headline, description,
        call_to_action, asset_url, asset_type, destination_url, meta_status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.ad_set_draft_id,
      draft.campaign_draft_id,
      draft.ad_account_id || null,
      draft.name || '',
      draft.page_id || null,
      draft.instagram_account_id || null,
      draft.creative_name || '',
      draft.message || '',
      draft.headline || '',
      draft.description || '',
      draft.call_to_action || 'LEARN_MORE',
      draft.asset_url || '',
      draft.asset_type || '',
      draft.destination_url || '',
      this.normalizeMetaDeliveryStatus(draft.meta_status),
      draft.notes || ''
    );
    return this.getAdDraft(draft.id);
  }

  updateCampaignDraft(id, draft) {
    const existing = this.getCampaignDraft(id);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE ad_campaign_drafts
      SET
        name = ?,
        objective = ?,
        buying_type = ?,
        special_ad_categories = ?,
        daily_budget = ?,
        lifetime_budget = ?,
        meta_status = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      draft.name ?? existing.name,
      draft.objective ?? existing.objective,
      draft.buying_type ?? existing.buying_type,
      JSON.stringify(draft.special_ad_categories || parseJsonSafe(existing.special_ad_categories, [])),
      Number(draft.daily_budget ?? existing.daily_budget ?? 0),
      Number(draft.lifetime_budget ?? existing.lifetime_budget ?? 0),
      this.normalizeMetaDeliveryStatus(draft.meta_status, existing.meta_status || 'PAUSED'),
      draft.notes ?? existing.notes ?? '',
      id
    );

    return this.getCampaignDraft(id);
  }

  updateAdSetDraft(id, draft) {
    const existing = this.getAdSetDraft(id);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE ad_set_drafts
      SET
        name = ?,
        optimization_goal = ?,
        billing_event = ?,
        bid_strategy = ?,
        destination_type = ?,
        targeting_json = ?,
        daily_budget = ?,
        lifetime_budget = ?,
        start_time = ?,
        end_time = ?,
        meta_status = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      draft.name ?? existing.name,
      draft.optimization_goal ?? existing.optimization_goal,
      draft.billing_event ?? existing.billing_event,
      draft.bid_strategy ?? existing.bid_strategy,
      draft.destination_type ?? existing.destination_type,
      JSON.stringify(draft.targeting || parseJsonSafe(existing.targeting_json, {})),
      Number(draft.daily_budget ?? existing.daily_budget ?? 0),
      Number(draft.lifetime_budget ?? existing.lifetime_budget ?? 0),
      draft.start_time ?? existing.start_time,
      draft.end_time ?? existing.end_time,
      this.normalizeMetaDeliveryStatus(draft.meta_status, existing.meta_status || 'PAUSED'),
      draft.notes ?? existing.notes ?? '',
      id
    );

    return this.getAdSetDraft(id);
  }

  updateAdDraft(id, draft) {
    const existing = this.getAdDraft(id);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE ad_drafts
      SET
        name = ?,
        page_id = ?,
        instagram_account_id = ?,
        creative_name = ?,
        message = ?,
        headline = ?,
        description = ?,
        call_to_action = ?,
        asset_url = ?,
        asset_type = ?,
        destination_url = ?,
        meta_status = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      draft.name ?? existing.name,
      draft.page_id ?? existing.page_id,
      draft.instagram_account_id ?? existing.instagram_account_id,
      draft.creative_name ?? existing.creative_name ?? '',
      draft.message ?? existing.message ?? '',
      draft.headline ?? existing.headline ?? '',
      draft.description ?? existing.description ?? '',
      draft.call_to_action ?? existing.call_to_action ?? 'LEARN_MORE',
      draft.asset_url ?? existing.asset_url ?? '',
      draft.asset_type ?? existing.asset_type ?? '',
      draft.destination_url ?? existing.destination_url ?? '',
      this.normalizeMetaDeliveryStatus(draft.meta_status, existing.meta_status || 'PAUSED'),
      draft.notes ?? existing.notes ?? '',
      id
    );

    return this.getAdDraft(id);
  }

  deleteCampaignDraft(id) {
    return this.db.prepare(`DELETE FROM ad_campaign_drafts WHERE id = ?`).run(id).changes;
  }

  deleteAdSetDraft(id) {
    return this.db.prepare(`DELETE FROM ad_set_drafts WHERE id = ?`).run(id).changes;
  }

  deleteAdDraft(id) {
    return this.db.prepare(`DELETE FROM ad_drafts WHERE id = ?`).run(id).changes;
  }

  markCampaignDraftPublished(id, metaCampaignId) {
    this.db.prepare(`
      UPDATE ad_campaign_drafts
      SET meta_campaign_id = ?, publish_error = NULL, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(metaCampaignId, id);
    return this.getCampaignDraft(id);
  }

  markAdSetDraftPublished(id, metaAdSetId) {
    this.db.prepare(`
      UPDATE ad_set_drafts
      SET meta_ad_set_id = ?, publish_error = NULL, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(metaAdSetId, id);
    return this.getAdSetDraft(id);
  }

  markAdDraftPublished(id, metaAdId, metaCreativeId) {
    this.db.prepare(`
      UPDATE ad_drafts
      SET meta_ad_id = ?, meta_creative_id = ?, publish_error = NULL, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(metaAdId, metaCreativeId, id);
    return this.getAdDraft(id);
  }

  markCampaignDraftPublishError(id, message) {
    this.db.prepare(`
      UPDATE ad_campaign_drafts
      SET publish_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(message || '').slice(0, 1000), id);
  }

  markAdSetDraftPublishError(id, message) {
    this.db.prepare(`
      UPDATE ad_set_drafts
      SET publish_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(message || '').slice(0, 1000), id);
  }

  markAdDraftPublishError(id, message) {
    this.db.prepare(`
      UPDATE ad_drafts
      SET publish_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(message || '').slice(0, 1000), id);
  }

  getAdSetDraftsByCampaign(campaignDraftId) {
    return this.db.prepare(`
      SELECT *
      FROM ad_set_drafts
      WHERE campaign_draft_id = ?
      ORDER BY created_at ASC
    `).all(campaignDraftId);
  }

  getAdDraftsByAdSet(adSetDraftId) {
    return this.db.prepare(`
      SELECT *
      FROM ad_drafts
      WHERE ad_set_draft_id = ?
      ORDER BY created_at ASC
    `).all(adSetDraftId);
  }

  getCampaignDraft(id) {
    return this.db.prepare(`
      SELECT d.*, a.name as ad_account_name, a.currency
      FROM ad_campaign_drafts d
      LEFT JOIN ad_accounts a ON a.id = d.ad_account_id
      WHERE d.id = ?
    `).get(id);
  }

  getAdSetDraft(id) {
    return this.db.prepare(`
      SELECT s.*, c.name as campaign_name, a.name as ad_account_name, a.currency
      FROM ad_set_drafts s
      LEFT JOIN ad_campaign_drafts c ON c.id = s.campaign_draft_id
      LEFT JOIN ad_accounts a ON a.id = s.ad_account_id
      WHERE s.id = ?
    `).get(id);
  }

  getAdDraft(id) {
    return this.db.prepare(`
      SELECT ad.*, s.name as ad_set_name, c.name as campaign_name, p.name as page_name
      FROM ad_drafts ad
      LEFT JOIN ad_set_drafts s ON s.id = ad.ad_set_draft_id
      LEFT JOIN ad_campaign_drafts c ON c.id = ad.campaign_draft_id
      LEFT JOIN pages p ON p.id = ad.page_id
      WHERE ad.id = ?
    `).get(id);
  }

  getAdDrafts(adAccountId = null) {
    const filter = adAccountId ? 'WHERE d.ad_account_id = ?' : '';
    const params = adAccountId ? [adAccountId] : [];

    const campaigns = this.db.prepare(`
      SELECT d.*, a.name as ad_account_name, a.currency
      FROM ad_campaign_drafts d
      LEFT JOIN ad_accounts a ON a.id = d.ad_account_id
      ${filter}
      ORDER BY d.updated_at DESC, d.created_at DESC
    `).all(...params);

    const adSetFilter = adAccountId ? 'WHERE s.ad_account_id = ?' : '';
    const adSets = this.db.prepare(`
      SELECT s.*, c.name as campaign_name, a.name as ad_account_name, a.currency
      FROM ad_set_drafts s
      LEFT JOIN ad_campaign_drafts c ON c.id = s.campaign_draft_id
      LEFT JOIN ad_accounts a ON a.id = s.ad_account_id
      ${adSetFilter}
      ORDER BY s.updated_at DESC, s.created_at DESC
    `).all(...params);

    const adFilter = adAccountId ? 'WHERE ad.ad_account_id = ?' : '';
    const ads = this.db.prepare(`
      SELECT ad.*, s.name as ad_set_name, c.name as campaign_name, p.name as page_name
      FROM ad_drafts ad
      LEFT JOIN ad_set_drafts s ON s.id = ad.ad_set_draft_id
      LEFT JOIN ad_campaign_drafts c ON c.id = ad.campaign_draft_id
      LEFT JOIN pages p ON p.id = ad.page_id
      ${adFilter}
      ORDER BY ad.updated_at DESC, ad.created_at DESC
    `).all(...params);

    return { campaigns, adSets, ads };
  }

  getBudgetChangeDrafts(adAccountId = null) {
    const filter = adAccountId ? 'WHERE d.ad_account_id = ?' : '';
    const params = adAccountId ? [adAccountId] : [];

    return this.db.prepare(`
      SELECT d.*, a.currency
      FROM ad_budget_change_drafts d
      LEFT JOIN ad_accounts a ON a.id = d.ad_account_id
      ${filter}
      ORDER BY d.updated_at DESC, d.created_at DESC
    `).all(...params);
  }

  createBudgetChangeDraft(draft) {
    this.db.prepare(`
      INSERT INTO ad_budget_change_drafts (
        id, ad_account_id, ad_set_id, ad_set_name, current_daily_budget,
        current_lifetime_budget, proposed_daily_budget, proposed_lifetime_budget,
        recommended_action, rationale, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.ad_account_id || null,
      draft.ad_set_id || null,
      draft.ad_set_name || '',
      Number(draft.current_daily_budget || 0),
      Number(draft.current_lifetime_budget || 0),
      Number(draft.proposed_daily_budget || 0),
      Number(draft.proposed_lifetime_budget || 0),
      draft.recommended_action || 'inspect',
      draft.rationale || '',
      draft.notes || ''
    );

    return this.getBudgetChangeDraft(draft.id);
  }

  getBudgetChangeDraft(id) {
    return this.db.prepare(`
      SELECT d.*, a.currency
      FROM ad_budget_change_drafts d
      LEFT JOIN ad_accounts a ON a.id = d.ad_account_id
      WHERE d.id = ?
    `).get(id);
  }

  deleteBudgetChangeDraft(id) {
    return this.db.prepare(`DELETE FROM ad_budget_change_drafts WHERE id = ?`).run(id).changes;
  }

  saveAdBudgetSnapshot(report) {
    const account = report?.account;
    if (!account?.id) return null;

    const snapshotDate = new Date().toISOString().slice(0, 10);
    const totals = report.totals || {};
    const alertCounts = report.alert_counts || {};
    const rawJson = JSON.stringify({
      account_id: account.id,
      account_name: account.name,
      days: report.days,
      totals,
      alert_counts: alertCounts,
      recommendation_count: (report.recommendations || []).length,
      generated_at: new Date().toISOString()
    });

    this.db.prepare(`
      INSERT INTO ad_budget_snapshots (
        ad_account_id, snapshot_date, days, total_spend, active_ad_sets,
        daily_budget, lifetime_budget, estimated_period_budget, utilization,
        high_alerts, medium_alerts, low_alerts, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ad_account_id, snapshot_date, days) DO UPDATE SET
        total_spend=excluded.total_spend,
        active_ad_sets=excluded.active_ad_sets,
        daily_budget=excluded.daily_budget,
        lifetime_budget=excluded.lifetime_budget,
        estimated_period_budget=excluded.estimated_period_budget,
        utilization=excluded.utilization,
        high_alerts=excluded.high_alerts,
        medium_alerts=excluded.medium_alerts,
        low_alerts=excluded.low_alerts,
        raw_json=excluded.raw_json,
        created_at=CURRENT_TIMESTAMP
    `).run(
      account.id,
      snapshotDate,
      Number(report.days || 30),
      Number(totals.spend || 0),
      Number(totals.active_ad_sets || 0),
      Number(totals.daily_budget || 0),
      Number(totals.lifetime_budget || 0),
      Number(totals.estimated_period_budget || 0),
      Number(totals.utilization || 0),
      Number(alertCounts.high || 0),
      Number(alertCounts.medium || 0),
      Number(alertCounts.low || 0),
      rawJson
    );

    return this.db.prepare(`
      SELECT *
      FROM ad_budget_snapshots
      WHERE ad_account_id = ? AND snapshot_date = ? AND days = ?
    `).get(account.id, snapshotDate, Number(report.days || 30));
  }

  getAdBudgetSnapshots(adAccountId, limit = 12) {
    return this.db.prepare(`
      SELECT *
      FROM ad_budget_snapshots
      WHERE ad_account_id = ?
      ORDER BY snapshot_date DESC, created_at DESC
      LIMIT ?
    `).all(adAccountId, Number(limit) || 12);
  }

  getAdBudgetReport(adAccountId, days = 30) {
    const account = this.db.prepare(`
      SELECT * FROM ad_accounts WHERE id = ?
    `).get(adAccountId);

    if (!account) {
      return null;
    }

    const requestedDays = parseInt(days, 10) || 30;
    const adSets = this.getAdSetsByAdAccount(adAccountId);
    const insightRows = this.getAdInsightsSummaryByLevel({
      adAccountId,
      level: 'adset',
      days: requestedDays
    });
    const insightByAdSet = new Map(insightRows.map(row => [row.entity_id, row]));

    const rows = adSets.map(adSet => {
      const insight = insightByAdSet.get(adSet.id) || {};
      const dailyBudget = this.normalizeAdBudgetAmount(adSet.daily_budget, account.currency);
      const lifetimeBudget = this.normalizeAdBudgetAmount(adSet.lifetime_budget, account.currency);
      const budgetType = dailyBudget > 0 ? 'daily' : lifetimeBudget > 0 ? 'lifetime' : 'none';
      const periodBudget = dailyBudget > 0 ? dailyBudget * requestedDays : lifetimeBudget;
      const spend = Number(insight.spend || 0);
      const utilization = periodBudget > 0 ? (spend / periodBudget) * 100 : 0;

      return {
        id: adSet.id,
        name: adSet.name,
        campaign_id: adSet.campaign_id,
        status: adSet.status,
        effective_status: adSet.effective_status,
        optimization_goal: adSet.optimization_goal,
        billing_event: adSet.billing_event,
        bid_strategy: adSet.bid_strategy,
        currency: account.currency || '',
        raw_daily_budget: adSet.daily_budget,
        raw_lifetime_budget: adSet.lifetime_budget,
        daily_budget: dailyBudget,
        lifetime_budget: lifetimeBudget,
        budget_type: budgetType,
        estimated_period_budget: periodBudget,
        spend,
        impressions: Number(insight.impressions || 0),
        reach: Number(insight.reach || 0),
        clicks: Number(insight.clicks || 0),
        ctr: Number(insight.ctr || 0),
        cpc: Number(insight.cpc || 0),
        cpm: Number(insight.cpm || 0),
        frequency: Number(insight.frequency || 0),
        utilization
      };
    });

    const totals = rows.reduce((acc, row) => {
      const active = String(row.effective_status || row.status || '').toUpperCase() === 'ACTIVE';
      acc.total_ad_sets += 1;
      acc.active_ad_sets += active ? 1 : 0;
      acc.paused_ad_sets += String(row.effective_status || row.status || '').toUpperCase() === 'PAUSED' ? 1 : 0;
      acc.daily_budget += row.daily_budget || 0;
      acc.lifetime_budget += row.lifetime_budget || 0;
      acc.estimated_period_budget += row.estimated_period_budget || 0;
      acc.spend += row.spend || 0;
      acc.clicks += row.clicks || 0;
      acc.impressions += row.impressions || 0;
      acc.zero_delivery_budgeted += active && row.estimated_period_budget > 0 && row.spend === 0 ? 1 : 0;
      acc.high_frequency += row.frequency >= 3 ? 1 : 0;
      acc.low_ctr_spenders += row.spend > 0 && row.ctr > 0 && row.ctr < 1 ? 1 : 0;
      return acc;
    }, {
      total_ad_sets: 0,
      active_ad_sets: 0,
      paused_ad_sets: 0,
      daily_budget: 0,
      lifetime_budget: 0,
      estimated_period_budget: 0,
      spend: 0,
      clicks: 0,
      impressions: 0,
      zero_delivery_budgeted: 0,
      high_frequency: 0,
      low_ctr_spenders: 0
    });

    totals.utilization = totals.estimated_period_budget > 0
      ? (totals.spend / totals.estimated_period_budget) * 100
      : 0;
    totals.avg_ctr = totals.impressions > 0 ? (totals.clicks * 100 / totals.impressions) : 0;

    const alerts = [];
    const addAlert = (severity, scope, entity, title, detail, action) => {
      alerts.push({
        severity,
        scope,
        entity_id: entity?.id || null,
        entity_name: entity?.name || account.name || adAccountId,
        title,
        detail,
        action
      });
    };

    rows.forEach(row => {
      const active = String(row.effective_status || row.status || '').toUpperCase() === 'ACTIVE';
      if (active && row.estimated_period_budget > 0 && row.spend === 0) {
        addAlert(
          'high',
          'ad_set',
          row,
          'Có ngân sách nhưng không chi tiêu',
          `${row.name} có ngân sách ${account.currency || ''} nhưng không phát sinh chi tiêu trong cửa sổ đang chọn.`,
          'Kiểm tra trạng thái phân phối, lịch chạy, quy mô audience và trạng thái duyệt.'
        );
      }
      if (active && row.estimated_period_budget === 0) {
        addAlert(
          'medium',
          'ad_set',
          row,
          'Nhóm đang chạy nhưng chưa có ngân sách lưu local',
          `${row.name} đang active nhưng local chưa có daily/lifetime budget.`,
          'Đồng bộ lại Ads và kiểm tra ngân sách đang ở cấp campaign hay thiếu field từ API.'
        );
      }
      if (row.spend > 0 && row.clicks === 0) {
        addAlert(
          'high',
          'ad_set',
          row,
          'Có chi tiêu nhưng không có click',
          `${row.name} đã chi ${row.spend.toFixed(2)} ${account.currency || ''} nhưng không có click.`,
          'Kiểm tra creative, objective, placement và mức khớp với URL đích.'
        );
      }
      if (row.spend > 0 && row.ctr > 0 && row.ctr < 1) {
        addAlert(
          'medium',
          'ad_set',
          row,
          'CTR below 1%',
          `${row.name} có CTR ${row.ctr.toFixed(2)}% dù đã có chi tiêu.`,
          'Test hook mạnh hơn, visual rõ hơn và thông điệp khớp audience hơn.'
        );
      }
      if (row.frequency >= 3) {
        addAlert(
          'medium',
          'ad_set',
          row,
          'Tần suất chạm mức cần theo dõi fatigue',
          `${row.name} có frequency ${row.frequency.toFixed(2)}.`,
          'Chuẩn bị làm mới creative hoặc mở rộng audience.'
        );
      }
      if (row.utilization > 120) {
        addAlert(
          'medium',
          'ad_set',
          row,
          'Chi tiêu vượt ngân sách ước tính của kỳ',
          `${row.name} đang ở mức ${row.utilization.toFixed(1)}% so với ngân sách ước tính của kỳ.`,
          'Kiểm tra cửa sổ ngày, loại ngân sách hoặc đơn vị ngân sách.'
        );
      } else if (row.estimated_period_budget > 0 && row.utilization > 0 && row.utilization < 20) {
        addAlert(
          'low',
          'ad_set',
          row,
          'Mức dùng ngân sách thấp',
          `${row.name} mới dùng ${row.utilization.toFixed(1)}% ngân sách ước tính của kỳ.`,
          'Kiểm tra ràng buộc phân phối và xem ngân sách có lớn hơn nhu cầu có thể reach hay không.'
        );
      }
    });

    const accountDaily = this.getAdInsights({
      adAccountId,
      level: 'account',
      days: Math.max(requestedDays, 14)
    });
    const lastThree = accountDaily.slice(-3);
    const previousSeven = accountDaily.slice(-10, -3);
    const avgSpend = list => list.length > 0
      ? list.reduce((sum, row) => sum + Number(row.spend || 0), 0) / list.length
      : 0;
    const recentAvgSpend = avgSpend(lastThree);
    const previousAvgSpend = avgSpend(previousSeven);
    if (recentAvgSpend > 0 && previousAvgSpend > 0 && recentAvgSpend > previousAvgSpend * 1.75) {
      addAlert(
        'medium',
        'account',
        account,
        'Chi tiêu account tăng đột biến',
        `Chi tiêu trung bình 3 ngày gần nhất là ${recentAvgSpend.toFixed(2)} ${account.currency || ''}, cao hơn trung bình 7 ngày trước đó ${previousAvgSpend.toFixed(2)}.`,
        'Kiểm tra các thay đổi ngân sách/trạng thái gần đây trước khi scale tiếp.'
      );
    }

    alerts.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2, info: 3 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    });

    const alertCounts = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {});
    const priorityScore = { high: 3, medium: 2, low: 1, info: 0 };
    const spendingCpcRows = rows.filter(row => row.spend > 0 && row.clicks > 0 && row.cpc > 0);
    const avgCpc = spendingCpcRows.length > 0
      ? spendingCpcRows.reduce((sum, row) => sum + row.cpc, 0) / spendingCpcRows.length
      : 0;
    const roundMoney = value => Number((Number(value || 0)).toFixed(2));
    const budgetProposal = (row, multiplier) => ({
      proposed_daily_budget: row.daily_budget > 0 ? roundMoney(row.daily_budget * multiplier) : 0,
      proposed_lifetime_budget: row.daily_budget > 0
        ? 0
        : row.lifetime_budget > 0 ? roundMoney(row.lifetime_budget * multiplier) : 0
    });
    const recommendations = rows.map(row => {
      const active = String(row.effective_status || row.status || '').toUpperCase() === 'ACTIVE';
      let recommendedAction = 'hold';
      let priority = 'low';
      let multiplier = 1;
      let rationale = 'Dữ liệu local đã đồng bộ chưa phát hiện vấn đề ngân sách lớn.';
      let nextStep = 'Tiếp tục theo dõi sau lần đồng bộ tiếp theo.';

      if (active && row.estimated_period_budget > 0 && row.spend === 0) {
        recommendedAction = 'inspect';
        priority = 'high';
        rationale = 'Có ngân sách nhưng không ghi nhận chi tiêu trong cửa sổ này.';
        nextStep = 'Kiểm tra duyệt quảng cáo, lịch chạy, audience size, bid strategy và giới hạn delivery trước khi đổi ngân sách.';
      } else if (row.spend > 0 && row.clicks === 0) {
        recommendedAction = 'reduce';
        priority = 'high';
        multiplier = 0.5;
        rationale = 'Có chi tiêu nhưng không có click.';
        nextStep = 'Tạo draft giảm ngân sách và kiểm tra creative/objective/placement trước khi chi thêm.';
      } else if (row.spend > 0 && row.ctr > 0 && row.ctr < 1) {
        recommendedAction = 'reduce';
        priority = 'medium';
        multiplier = 0.8;
        rationale = 'CTR dưới 1% trong khi ad set đang chi tiêu.';
        nextStep = 'Tạo draft giảm nhẹ ngân sách trong lúc test creative mạnh hơn và thông điệp khớp audience hơn.';
      } else if (row.frequency >= 3) {
        recommendedAction = 'reduce';
        priority = 'medium';
        multiplier = 0.85;
        rationale = 'Frequency đã chạm mức cần theo dõi fatigue.';
        nextStep = 'Chuẩn bị creative mới hoặc mở rộng audience trước khi scale.';
      } else if (
        active &&
        row.spend > 0 &&
        row.clicks > 0 &&
        row.ctr >= 2 &&
        row.frequency < 3 &&
        (!avgCpc || row.cpc <= avgCpc * 1.15)
      ) {
        recommendedAction = 'increase';
        priority = 'medium';
        multiplier = 1.15;
        rationale = 'CTR, click và CPC đang khỏe so với trung bình account.';
        nextStep = 'Tạo draft tăng ngân sách nhẹ và theo dõi delivery sau khi duyệt.';
      } else if (row.estimated_period_budget > 0 && row.utilization > 0 && row.utilization < 20) {
        recommendedAction = 'inspect';
        priority = 'low';
        rationale = 'Mức dùng ngân sách thấp trong cửa sổ đang chọn.';
        nextStep = 'Kiểm tra ràng buộc delivery trước khi quyết định có giảm ngân sách hay không.';
      }

      return {
        ad_set_id: row.id,
        ad_set_name: row.name,
        campaign_id: row.campaign_id,
        status: row.effective_status || row.status || '',
        priority,
        recommended_action: recommendedAction,
        rationale,
        next_step: nextStep,
        currency: account.currency || '',
        current_daily_budget: row.daily_budget,
        current_lifetime_budget: row.lifetime_budget,
        ...budgetProposal(row, multiplier),
        spend: row.spend,
        ctr: row.ctr,
        cpc: row.cpc,
        frequency: row.frequency,
        utilization: row.utilization
      };
    }).filter(item => item.recommended_action !== 'hold')
      .sort((a, b) => {
        if ((priorityScore[b.priority] || 0) !== (priorityScore[a.priority] || 0)) {
          return (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0);
        }
        return (b.spend || 0) - (a.spend || 0);
      });

    const checklist = [];
    if (totals.zero_delivery_budgeted > 0) {
      checklist.push({
        severity: 'warning',
        title: 'Nhóm có ngân sách nhưng không chi tiêu',
        detail: `${totals.zero_delivery_budgeted} ad set đang active có ngân sách nhưng không chi tiêu trong cửa sổ đang chọn.`,
        action: 'Kiểm tra trạng thái delivery, audience size, lịch chạy và giới hạn learning.'
      });
    }
    if (totals.low_ctr_spenders > 0) {
      checklist.push({
        severity: 'warning',
        title: 'Nhóm đang chi tiêu nhưng CTR thấp',
        detail: `${totals.low_ctr_spenders} ad set đang chi tiêu có CTR dưới 1%.`,
        action: 'Kiểm tra góc creative, hook, độ khớp audience-message và placement mix.'
      });
    }
    if (totals.high_frequency > 0) {
      checklist.push({
        severity: 'info',
        title: 'Danh sách theo dõi frequency cao',
        detail: `${totals.high_frequency} ad set có frequency từ 3 trở lên.`,
        action: 'Chuẩn bị làm mới creative hoặc mở rộng audience trước khi fatigue tăng.'
      });
    }
    if (checklist.length === 0) {
      checklist.push({
        severity: 'ok',
        title: 'Chưa thấy vấn đề ngân sách rõ ràng',
        detail: 'Dữ liệu local đã đồng bộ chưa phát hiện cờ pacing ngân sách.',
        action: 'Tiếp tục theo dõi sau lần đồng bộ tiếp theo.'
      });
    }

    return {
      account,
      days: requestedDays,
      rows,
      totals,
      checklist,
      alerts,
      alert_counts: alertCounts,
      recommendations,
      budget_change_drafts: this.getBudgetChangeDrafts(adAccountId),
      budget_snapshots: this.getAdBudgetSnapshots(adAccountId, 12)
    };
  }

  saveInstagramAccount(account) {
    const existing = this.db.prepare(`
      SELECT portfolio
      FROM instagram_accounts
      WHERE id = ?
    `).get(account.id);

    const mergedPortfolio = this.mergePortfolioValues(existing?.portfolio, account.portfolio);

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
      mergedPortfolio
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

  pruneInstagramMediaForAccount(instagramAccountId, keepMediaIds = []) {
    const ids = Array.isArray(keepMediaIds)
      ? keepMediaIds.map(id => String(id || '').trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return this.db.prepare(`
        DELETE FROM instagram_media
        WHERE instagram_account_id = ?
      `).run(instagramAccountId).changes;
    }

    const placeholders = ids.map(() => '?').join(', ');
    return this.db.prepare(`
      DELETE FROM instagram_media
      WHERE instagram_account_id = ?
        AND id NOT IN (${placeholders})
    `).run(instagramAccountId, ...ids).changes;
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

  createDualPublishJob(job) {
    this.db.prepare(`
      INSERT INTO dual_publish_jobs (
        id, page_id, page_name, portfolio, instagram_account_id, instagram_username,
        facebook_post_id, media_url, message, scheduled_time, status,
        instagram_container_id, instagram_media_id, publish_error, published_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.page_id,
      job.page_name || '',
      job.portfolio || '',
      job.instagram_account_id,
      job.instagram_username || '',
      job.facebook_post_id || '',
      job.media_url,
      job.message || '',
      job.scheduled_time,
      job.status || 'scheduled',
      job.instagram_container_id || '',
      job.instagram_media_id || '',
      job.publish_error || null,
      job.published_at || null
    );

    return this.getDualPublishJob(job.id);
  }

  getDualPublishJob(id) {
    return this.db.prepare(`
      SELECT *
      FROM dual_publish_jobs
      WHERE id = ?
    `).get(id);
  }

  getDualPublishJobs(limit = 50) {
    return this.db.prepare(`
      SELECT *
      FROM dual_publish_jobs
      ORDER BY scheduled_time DESC, created_at DESC
      LIMIT ?
    `).all(parseInt(limit, 10) || 50);
  }

  getDueDualPublishJobs(nowIso = new Date().toISOString(), limit = 10) {
    return this.db.prepare(`
      SELECT *
      FROM dual_publish_jobs
      WHERE status = 'scheduled'
        AND scheduled_time <= ?
      ORDER BY scheduled_time ASC, created_at ASC
      LIMIT ?
    `).all(nowIso, parseInt(limit, 10) || 10);
  }

  markStaleDualPublishJobsError(cutoffIso) {
    return this.db.prepare(`
      UPDATE dual_publish_jobs
      SET status = 'error',
        publish_error = 'Job bị kẹt ở trạng thái đang đăng. Vui lòng retry.',
        updated_at = CURRENT_TIMESTAMP
      WHERE status = 'publishing'
        AND last_attempt_at < ?
    `).run(cutoffIso).changes;
  }

  markDualPublishJobRunning(id) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE dual_publish_jobs
      SET status = 'publishing',
        attempts = attempts + 1,
        last_attempt_at = ?,
        publish_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'scheduled'
    `).run(now, id);
    return this.getDualPublishJob(id);
  }

  markDualPublishJobPublished(id, result = {}) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE dual_publish_jobs
      SET status = 'published',
        instagram_container_id = ?,
        instagram_media_id = ?,
        publish_error = NULL,
        published_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      result.container_id || '',
      result.media_id || '',
      now,
      id
    );
    return this.getDualPublishJob(id);
  }

  markDualPublishJobError(id, errorMessage) {
    this.db.prepare(`
      UPDATE dual_publish_jobs
      SET status = 'error',
        publish_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(errorMessage || 'Unknown Instagram publish error'), id);
    return this.getDualPublishJob(id);
  }

  retryDualPublishJob(id) {
    this.db.prepare(`
      UPDATE dual_publish_jobs
      SET status = 'scheduled',
        publish_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'error'
    `).run(id);
    return this.getDualPublishJob(id);
  }

  cancelDualPublishJob(id) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE dual_publish_jobs
      SET status = 'canceled',
        canceled_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status IN ('scheduled', 'error')
    `).run(now, id);
    return this.getDualPublishJob(id);
  }

  markDualPublishJobDeleted(id, outcome = {}) {
    const job = this.getDualPublishJob(id);
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE dual_publish_jobs
      SET status = 'deleted',
        facebook_deleted_at = ?,
        instagram_deleted_at = ?,
        deleted_at = ?,
        delete_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      outcome.facebookDeleted ? now : (job?.facebook_deleted_at || null),
      outcome.instagramDeleted ? now : (job?.instagram_deleted_at || null),
      now,
      id
    );
    return this.getDualPublishJob(id);
  }

  markDualPublishJobDeleteError(id, errorMessage, outcome = {}) {
    const job = this.getDualPublishJob(id);
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE dual_publish_jobs
      SET status = 'delete_error',
        facebook_deleted_at = ?,
        instagram_deleted_at = ?,
        delete_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      outcome.facebookDeleted ? now : (job?.facebook_deleted_at || null),
      outcome.instagramDeleted ? now : (job?.instagram_deleted_at || null),
      String(errorMessage || 'Không xoá được dual publish.'),
      id
    );
    return this.getDualPublishJob(id);
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

// ─── Singleton ────────────────────────────────────────────────────────────────
// Đảm bảo toàn bộ app dùng chung 1 DB connection duy nhất.
// Thay vì `new Database()`, hãy dùng `Database.getInstance()`.
let _dbInstance = null;

DB.getInstance = function () {
  if (!_dbInstance) {
    _dbInstance = new DB();
  }
  return _dbInstance;
};
// ─────────────────────────────────────────────────────────────────────────────

module.exports = DB;

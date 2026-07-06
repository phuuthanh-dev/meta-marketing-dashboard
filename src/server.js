const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const Database = require('./database');
const FacebookAPI = require('./facebook/api');
const MetaAdsAPI = require('./meta-ads/api');
const AdsFetcher = require('./meta-ads/fetcher');
const InstagramAPI = require('./instagram/api');
const InstagramFetcher = require('./instagram/fetcher');
const CloudinaryService = require('./cloudinary');
const config = require('./config');
const WebSocket = require('ws');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// Rate limiter: tối đa 10 lần thử login trong 15 phút
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

function getRecentPosts(posts, days) {
  const daysNum = parseInt(days, 10) || 30;
  const now = new Date();
  const startDate = new Date(now.getTime() - daysNum * 24 * 60 * 60 * 1000);
  return posts.filter(post => post.created_time && new Date(post.created_time) >= startDate);
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value).replace(/"/g, '""');
  return `"${stringValue}"`;
}

function toCsv(rows) {
  return rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
}

function parseInstagramInsightMetricValue(metric) {
  return Number(
    metric?.values?.[0]?.value
    ?? metric?.total_value?.value
    ?? 0
  ) || 0;
}

function parseInstagramMediaSnapshot(rawJson) {
  const payload = rawJson ? JSON.parse(rawJson) : null;
  const metricMap = new Map((payload?.data || []).map(metric => [
    metric.name,
    parseInstagramInsightMetricValue(metric)
  ]));

  return {
    supported: payload?.supported === true,
    reason: payload?.reason || null,
    metrics: {
      impressions: Number(metricMap.get('impressions') || 0),
      reach: Number(metricMap.get('reach') || 0),
      views: Number(metricMap.get('views') || 0),
      likes: Number(metricMap.get('likes') || 0),
      comments: Number(metricMap.get('comments') || 0),
      saved: Number(metricMap.get('saved') || 0),
      shares: Number(metricMap.get('shares') || 0),
      total_interactions: Number(metricMap.get('total_interactions') || 0)
    },
    raw: payload
  };
}

function flattenInstagramDemographics(data) {
  return (data || []).flatMap(metric => {
    const breakdowns = metric?.total_value?.breakdowns || [];
    return breakdowns.flatMap(breakdown => {
      const dimensions = Array.isArray(breakdown.dimension_keys) ? breakdown.dimension_keys : [];
      const results = Array.isArray(breakdown.results) ? breakdown.results : [];
      return results.map(result => ({
        metric_name: metric.name || '',
        metric_title: metric.title || metric.name || '',
        dimensions,
        dimension_label: dimensions.join('+') || 'unknown',
        label: dimensions.map(key => result?.dimension_values?.[key]).filter(Boolean).join(' | '),
        values: result?.dimension_values || {},
        value: Number(result?.value || 0)
      }));
    });
  });
}

function summarizeInstagramDemographics(data) {
  const rows = flattenInstagramDemographics(data);
  const byDimension = new Map();

  rows.forEach(row => {
    const groupKey = row.dimension_label;
    if (!byDimension.has(groupKey)) {
      byDimension.set(groupKey, {
        key: groupKey,
        dimensions: row.dimensions,
        metric_title: row.metric_title,
        total: 0,
        items: []
      });
    }

    const group = byDimension.get(groupKey);
    group.total += row.value;
    group.items.push({
      label: row.label || '-',
      values: row.values,
      value: row.value
    });
  });

  return Array.from(byDimension.values()).map(group => ({
    ...group,
    items: group.items
      .sort((a, b) => b.value - a.value)
      .map(item => ({
        ...item,
        pct: group.total > 0 ? (item.value * 100) / group.total : 0
      }))
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function buildUnavailableMeta(reason) {
  return {
    supported: false,
    reason
  };
}

function normalizeDays(value, fallback = 30) {
  return parseInt(value, 10) || fallback;
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function normalizeMediaType(value = '') {
  const mediaType = String(value || '').trim().toLowerCase();
  return mediaType === 'photo' || mediaType === 'video' ? mediaType : '';
}

function parseScheduledTime(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Scheduled time is invalid.');
  }

  return parsed;
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('=') || '');
    return acc;
  }, {});
}

class Server {
  constructor() {
    this.app = express();
    this.db = Database.getInstance(); // Singleton — dùng chung 1 DB connection
    this.wsClients = new Set();
    this.sessions = new Map();
    this.setupRoutes();
  }

  createSession(username) {
    const token = crypto
      .createHmac('sha256', config.security.auth.sessionSecret)
      .update(`${username}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
      .digest('hex');

    this.sessions.set(token, {
      username,
      createdAt: new Date().toISOString()
    });

    return token;
  }

  getSessionFromRequest(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[config.security.auth.cookieName];
    return token ? this.sessions.get(token) || null : null;
  }

  clearSession(req, res) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[config.security.auth.cookieName];
    if (token) {
      this.sessions.delete(token);
    }

    res.setHeader('Set-Cookie', `${config.security.auth.cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  }

  setSessionCookie(res, token) {
    res.setHeader('Set-Cookie', `${config.security.auth.cookieName}=${token}; HttpOnly; Path=/; SameSite=Lax`);
  }

  isAuthenticated(req) {
    return Boolean(this.getSessionFromRequest(req));
  }

  isReadOnlyBlockedRoute(req) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return false;
    }

    if (req.path === '/api/auth/login' || req.path === '/api/auth/logout') {
      return false;
    }

    if (req.path === '/api/ads/sync' || req.path === '/api/instagram/sync') {
      return false;
    }

    if (/^\/api\/ads\/accounts\/[^/]+\/sync$/.test(req.path)) {
      return false;
    }

    if (/^\/api\/instagram\/accounts\/[^/]+\/sync$/.test(req.path)) {
      return false;
    }

    return [
      /^\/api\/pages\/[^/]+\/posts(?:\/schedule)?$/,
      /^\/api\/pages\/[^/]+\/publish$/,
      /^\/api\/posts\/[^/]+$/,
      /^\/api\/comments\/[^/]+(?:\/replies|\/hide)?$/,
      /^\/api\/pages\/[^/]+\/messages$/,
      /^\/api\/conversations\/[^/]+\/read$/,
      /^\/api\/pages\/[^/]+\/(?:photos|videos|albums)$/,
      /^\/api\/media\/[^/]+$/,
      /^\/api\/pages\/[^/]+$/,
      /^\/api\/pages\/[^/]+\/(?:milestones|offers|auto-reply)$/
    ].some(pattern => pattern.test(req.path));
  }

  setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws, req) => {
      if (!this.isAuthenticated(req)) {
        ws.close(1008, 'Authentication required');
        return;
      }
      console.log('🔌 WebSocket client connected');
      this.wsClients.add(ws);
      
      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        this.wsClients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.wsClients.delete(ws);
      });
    });
    
    this.wss = wss;
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    this.wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: false }));

    this.app.get('/login', (req, res) => {
      if (this.isAuthenticated(req)) {
        return res.redirect('/');
      }

      res.type('html').send(fs.readFileSync(path.join(PUBLIC_DIR, 'login.html'), 'utf8'));
    });

    this.app.post('/api/auth/login', loginLimiter, async (req, res) => {
      const { username, password } = req.body || {};

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      // Hỗ trợ cả bcrypt hash (APP_PASSWORD_HASH) lẫn plain-text (APP_PASSWORD) để tương thích ngược
      const isPasswordValid = await (async () => {
        if (config.security.auth.passwordHash) {
          // Bcrypt hash mode — an toàn hơn
          return bcrypt.compare(password, config.security.auth.passwordHash);
        }
        // Plain-text fallback — vẫn hoạt động nhưng console.warn nhắc nhở
        if (config.security.auth.password) {
          console.warn('⚠️  [Security] APP_PASSWORD is plain-text. Set APP_PASSWORD_HASH for better security.');
          return password === config.security.auth.password;
        }
        return false;
      })();

      if (username !== config.security.auth.username || !isPasswordValid) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = this.createSession(username);
      this.setSessionCookie(res, token);
      res.json({
        data: {
          username,
          readOnly: config.security.readOnly
        }
      });
    });

    this.app.post('/api/auth/logout', (req, res) => {
      this.clearSession(req, res);
      res.json({ data: { loggedOut: true } });
    });

    this.app.get('/api/auth/session', (req, res) => {
      const session = this.getSessionFromRequest(req);
      if (!session) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      res.json({
        data: {
          username: session.username,
          readOnly: config.security.readOnly
        }
      });
    });

    this.app.use((req, res, next) => {
      const isPublicPath = req.path === '/login' || req.path === '/health' || req.path === '/api/auth/login';

      if (isPublicPath || this.isAuthenticated(req)) {
        return next();
      }

      const acceptsHtml = (req.headers.accept || '').includes('text/html');
      if (acceptsHtml && !req.path.startsWith('/api/')) {
        return res.redirect('/login');
      }

      res.status(401).json({ error: 'Authentication required' });
    });

    this.app.use((req, res, next) => {
      if (config.security.readOnly && this.isReadOnlyBlockedRoute(req)) {
        return res.status(403).json({ error: 'READ_ONLY mode is enabled for this environment' });
      }

      next();
    });

    this.app.get('/api/app-state', (req, res) => {
      const session = this.getSessionFromRequest(req);
      res.json({
        data: {
          authenticated: Boolean(session),
          username: session?.username || null,
          readOnly: config.security.readOnly
        }
      });
    });

    // Serve static files
    // ── Cache headers: JS/CSS/vendor assets → 7 ngày, HTML → không cache ──
    this.app.use('/dist', express.static(path.join(PUBLIC_DIR, 'dist'), {
      maxAge: '7d',
      immutable: true,
      etag: true
    }));
    this.app.use('/js/vendor', express.static(path.join(PUBLIC_DIR, 'js', 'vendor'), {
      maxAge: '30d',
      immutable: true,
      etag: true
    }));
    this.app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), {
      maxAge: '1d',
      etag: true
    }));
    this.app.use(express.static(PUBLIC_DIR, { etag: true }));

    this.app.post('/api/pages/:id/publish', upload.single('mediaFile'), async (req, res) => {
      try {
        const { id } = req.params;
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }

        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }

        const message = String(req.body.message || '').trim();
        const title = String(req.body.title || '').trim();
        const mediaType = normalizeMediaType(req.body.mediaType);
        const mediaUrlInput = String(req.body.mediaUrl || '').trim();
        const shouldSchedule = normalizeBoolean(req.body.schedule);
        const scheduledTime = shouldSchedule ? parseScheduledTime(req.body.scheduledTime) : null;

        if (!message && !mediaType) {
          return res.status(400).json({ error: 'Please provide a message or select a media type.' });
        }

        let mediaUrl = mediaUrlInput;
        let cloudinaryAsset = null;

        if (req.file) {
          if (!CloudinaryService.isConfigured()) {
            return res.status(400).json({ error: 'Cloudinary is not configured for local file uploads.' });
          }

          const uploadResult = await CloudinaryService.uploadLocalFile(req.file, {
            resourceType: mediaType || 'auto'
          });

          mediaUrl = uploadResult.secure_url;
          cloudinaryAsset = {
            public_id: uploadResult.public_id,
            secure_url: uploadResult.secure_url,
            resource_type: uploadResult.resource_type,
            bytes: uploadResult.bytes
          };
        }

        const api = new FacebookAPI(portfolio.token);
        let result;

        if (!mediaType) {
          if (!message) {
            return res.status(400).json({ error: 'Message is required for text posts.' });
          }

          result = scheduledTime
            ? await api.schedulePost(id, message, scheduledTime)
            : await api.createPost(id, message);
        } else {
          if (!mediaUrl) {
            return res.status(400).json({ error: 'Please provide a media URL or upload a file.' });
          }

          result = await api.publishMediaPost(id, {
            mediaType,
            mediaUrl,
            message,
            title,
            scheduledTime
          });
        }

        res.json({
          data: result,
          meta: {
            mediaType: mediaType || 'text',
            scheduled: Boolean(scheduledTime),
            mediaUrl: mediaUrl || null,
            cloudinary: cloudinaryAsset
          }
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get all pages
    this.app.get('/api/pages', (req, res) => {
      const pages = this.db.getPages();
      res.json({ data: pages });
    });

    // Get aggregated metrics
    this.app.get('/api/metrics/aggregated', (req, res) => {
      const { days = 30 } = req.query;
      const metrics = this.db.getAggregatedMetrics(parseInt(days));
      res.json({ data: metrics });
    });

    // Get page metrics
    this.app.get('/api/pages/:id/metrics', (req, res) => {
      const { id } = req.params;
      const { days = 30 } = req.query;
      const metrics = this.db.getPageMetrics(id, parseInt(days));
      res.json({ data: metrics });
    });

    // Get post metrics
    this.app.get('/api/posts/:id/metrics', (req, res) => {
      const { id } = req.params;
      const metrics = this.db.getPostMetrics(id);
      res.json({ data: metrics });
    });

    // Summary stats
    this.app.get('/api/summary', (req, res) => {
      const pages = this.db.getPages();
      const totalFans = pages.reduce((sum, p) => sum + (p.fan_count || 0), 0);
      const totalFollowers = pages.reduce((sum, p) => sum + (p.followers_count || 0), 0);

      res.json({
        total_pages: pages.length,
        total_fans: totalFans,
        total_followers: totalFollowers,
        portfolios: [...new Set(pages.map(p => p.portfolio))]
      });
    });

    // ========== ADS REPORTING ==========

    this.app.get('/api/ads/discovery', async (req, res) => {
      const results = [];

      for (const portfolio of config.portfolios) {
        const api = new MetaAdsAPI(portfolio.token);

        try {
          const accounts = await api.getAdAccounts();
          results.push({
            portfolio: portfolio.name,
            success: true,
            accountCount: accounts.length,
            accounts
          });
        } catch (error) {
          results.push({
            portfolio: portfolio.name,
            success: false,
            accountCount: 0,
            error: error.message
          });
        }
      }

      res.json({ data: results });
    });

    this.app.post('/api/ads/sync', express.json(), async (req, res) => {
      try {
        const days = normalizeDays(req.body?.days, config.ads.defaultDays);
        const includeDeepLevels = req.body?.deep === true;
        const results = [];

        for (const portfolio of config.portfolios) {
          const fetcher = new AdsFetcher(portfolio);
          const result = await fetcher.fetchAllAdsMetrics(days, { includeDeepLevels });
          results.push(result);
        }

        res.json({ data: results, days, deep: includeDeepLevels });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/ads/accounts/:id/sync', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const days = normalizeDays(req.body?.days, config.ads.defaultDays);
        const includeDeepLevels = req.body?.deep === true;
        const accounts = await Promise.all(config.portfolios.map(async portfolio => {
          const api = new MetaAdsAPI(portfolio.token);
          try {
            const adAccounts = await api.getAdAccounts();
            return adAccounts.some(account => account.id === id) ? portfolio : null;
          } catch (_) {
            return null;
          }
        }));

        const matchedPortfolio = accounts.find(Boolean);
        if (!matchedPortfolio) {
          return res.status(404).json({ error: 'Ad account not accessible by current portfolios' });
        }

        const fetcher = new AdsFetcher(matchedPortfolio);
        const result = await fetcher.fetchAllAdsMetrics(days, {
          includeDeepLevels,
          adAccountIds: [id]
        });

        res.json({ data: result, days, deep: includeDeepLevels });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/ads/accounts', (req, res) => {
      const accounts = this.db.getAdAccounts();
      res.json({ data: accounts });
    });

    this.app.get('/api/ads/summary', (req, res) => {
      const days = normalizeDays(req.query.days, config.ads.defaultDays);
      const summary = this.db.getAdsSummary(days);
      const meta = summary.metrics.length === 0
        ? buildUnavailableMeta(
            'No ad insights rows are stored for the selected window yet. Run ads sync first, or expand the date range if the ad accounts had no recent delivery.'
          )
        : {
            supported: true,
            diagnosticOnly: true,
            reason: 'This summary aggregates all ad accounts together and may mix currencies such as USD and VND. Use account-level Ads views in the UI for marketing-facing KPIs.'
          };
      res.json({ data: summary, meta, days });
    });

    this.app.get('/api/ads/accounts/:id/campaigns', (req, res) => {
      const { id } = req.params;
      const campaigns = this.db.getCampaignsByAdAccount(id);
      res.json({ data: campaigns });
    });

    this.app.get('/api/ads/accounts/:id/adsets', (req, res) => {
      const { id } = req.params;
      const adSets = this.db.getAdSetsByAdAccount(id);
      res.json({ data: adSets });
    });

    this.app.get('/api/ads/accounts/:id/ads', (req, res) => {
      const { id } = req.params;
      const ads = this.db.getAdsByAdAccount(id);
      res.json({ data: ads });
    });

    this.app.get('/api/ads/accounts/:id/insights', (req, res) => {
      const { id } = req.params;
      const days = normalizeDays(req.query.days, config.ads.defaultDays);
      const level = req.query.level || 'account';
      const campaignId = req.query.campaign_id || null;

      const insights = level === 'account'
        ? this.db.getAdInsights({
            adAccountId: id,
            level,
            days,
            campaignId
          })
        : this.db.getAdInsightsSummaryByLevel({
            adAccountId: id,
            level,
            days,
            campaignId
          });

      const meta = insights.length === 0
        ? {
            supported: false,
            level,
            days,
            adAccountId: id,
            reason: 'No stored ad insights were found for this query. This usually means the account had no delivery in the selected window, or ads sync has not populated insights yet.'
          }
        : {
            supported: true,
            dataShape: level === 'account' ? 'daily' : 'summary',
            level,
            days,
            adAccountId: id
          };

      res.json({ data: insights, meta });
    });

    this.app.get('/api/ads/accounts/:id/insights-summary', (req, res) => {
      const { id } = req.params;
      const days = normalizeDays(req.query.days, config.ads.defaultDays);
      const level = req.query.level || 'campaign';
      const campaignId = req.query.campaign_id || null;

      const rows = this.db.getAdInsightsSummaryByLevel({
        adAccountId: id,
        level,
        days,
        campaignId
      });

      const meta = rows.length === 0
        ? {
            supported: false,
            adAccountId: id,
            level,
            days,
            reason: 'No summarized ad insights are stored for this level and window yet.'
          }
        : {
            supported: true,
            adAccountId: id,
            level,
            days
          };

      res.json({ data: rows, meta });
    });

    // ========== INSTAGRAM REPORTING ==========

    this.app.get('/api/instagram/discovery', async (req, res) => {
      const results = [];

      for (const portfolio of config.portfolios) {
        const api = new InstagramAPI(portfolio.token);

        try {
          const accounts = await api.getLinkedInstagramAccounts();
          results.push({
            portfolio: portfolio.name,
            success: true,
            accountCount: accounts.length,
            accounts
          });
        } catch (error) {
          results.push({
            portfolio: portfolio.name,
            success: false,
            accountCount: 0,
            error: error.message
          });
        }
      }

      res.json({ data: results });
    });

    this.app.post('/api/instagram/sync', express.json(), async (req, res) => {
      try {
        const days = normalizeDays(req.body?.days, config.instagram.defaultDays);
        const results = [];

        for (const portfolio of config.portfolios) {
          const fetcher = new InstagramFetcher(portfolio);
          const result = await fetcher.fetchAllInstagramMetrics(days);
          results.push(result);
        }

        res.json({ data: results, days });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/instagram/accounts/:id/sync', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const days = normalizeDays(req.body?.days, config.instagram.defaultDays);
        const portfolios = await Promise.all(config.portfolios.map(async portfolio => {
          const api = new InstagramAPI(portfolio.token);
          try {
            const accounts = await api.getLinkedInstagramAccounts();
            return accounts.some(account => account.instagram_account_id === id) ? portfolio : null;
          } catch (_) {
            return null;
          }
        }));

        const matchedPortfolio = portfolios.find(Boolean);
        if (!matchedPortfolio) {
          return res.status(404).json({ error: 'Instagram account not accessible by current portfolios' });
        }

        const fetcher = new InstagramFetcher(matchedPortfolio);
        const result = await fetcher.fetchAllInstagramMetrics(days, {
          instagramAccountIds: [id]
        });

        res.json({ data: result, days });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/instagram/accounts', (req, res) => {
      const accounts = this.db.getInstagramAccounts();
      res.json({ data: accounts });
    });

    this.app.get('/api/instagram/accounts/:id/media', (req, res) => {
      const { id } = req.params;
      const limit = parseInt(req.query.limit, 10) || 50;
      const media = this.db.getInstagramMediaByAccount(id, limit).map(item => {
        const latestSnapshot = this.db.getLatestInstagramMediaInsights(item.id);
        const parsedSnapshot = latestSnapshot ? parseInstagramMediaSnapshot(latestSnapshot.raw_json) : null;
        const interactions = Number(parsedSnapshot?.metrics?.total_interactions || 0)
          || ((Number(item.like_count) || 0) + (Number(item.comments_count) || 0));
        const reach = Number(parsedSnapshot?.metrics?.reach || 0);
        return {
          ...item,
          insights_snapshot: parsedSnapshot,
          engagement_rate: reach > 0 ? (interactions * 100) / reach : 0
        };
      });
      res.json({ data: media });
    });

    this.app.get('/api/instagram/accounts/:id/insights', (req, res) => {
      const { id } = req.params;
      const days = normalizeDays(req.query.days, config.instagram.defaultDays);
      const snapshots = this.db.getInstagramAccountInsightSnapshots(id, days);
      const meta = snapshots.length === 0
        ? buildUnavailableMeta('No Instagram insight snapshots were stored for the selected account and window yet. Run Instagram sync first.')
        : { supported: true, instagramAccountId: id, days };
      res.json({ data: snapshots, meta });
    });

    this.app.get('/api/instagram/accounts/:id/insights-trend', (req, res) => {
      const { id } = req.params;
      const days = normalizeDays(req.query.days, config.instagram.defaultDays);
      const snapshots = this.db.getInstagramAccountInsightSnapshots(id, 365);
      const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

      if (!latest) {
        return res.json({
          data: [],
          meta: buildUnavailableMeta('No Instagram insight snapshot is stored yet for this account.')
        });
      }

      const payload = JSON.parse(latest.raw_json || '{}');
      const dayMetrics = payload.day_metrics || [];
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split('T')[0];
      const byDate = new Map();

      dayMetrics.forEach(metric => {
        (metric.values || []).forEach(value => {
          if (!value.end_time) return;
          const dateKey = value.end_time.split('T')[0];
          if (dateKey < sinceStr) return;
          if (!byDate.has(dateKey)) {
            byDate.set(dateKey, { date: dateKey });
          }
          byDate.get(dateKey)[metric.name] = value.value || 0;
        });
      });

      const data = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
      res.json({
        data,
        meta: {
          supported: data.length > 0,
          instagramAccountId: id,
          snapshot_date: latest.snapshot_date,
          reason: data.length === 0 ? 'No day-series values were available in the latest Instagram snapshot.' : null
        }
      });
    });

    this.app.get('/api/instagram/accounts/:id/demographics', (req, res) => {
      const { id } = req.params;
      const latest = this.db.getLatestInstagramDemographics(id);

      if (!latest) {
        return res.json({
          data: [],
          meta: buildUnavailableMeta('No Instagram demographics snapshot is stored yet for this account.')
        });
      }

      const payload = JSON.parse(latest.raw_json || '{}');
      res.json({
        data: payload.data || [],
        meta: {
          supported: payload.supported === true,
          snapshot_date: latest.snapshot_date,
          reason: payload.reason || null
        }
      });
    });

    this.app.get('/api/instagram/accounts/:id/demographics-summary', (req, res) => {
      const { id } = req.params;
      const latest = this.db.getLatestInstagramDemographics(id);

      if (!latest) {
        return res.json({
          data: [],
          meta: buildUnavailableMeta('No Instagram demographics snapshot is stored yet for this account.')
        });
      }

      const payload = JSON.parse(latest.raw_json || '{}');
      const data = payload.supported === true ? summarizeInstagramDemographics(payload.data || []) : [];
      res.json({
        data,
        meta: {
          supported: payload.supported === true && data.length > 0,
          snapshot_date: latest.snapshot_date,
          reason: payload.reason || (data.length === 0 ? 'Meta did not return enough demographic rows to build a usable breakdown.' : null)
        }
      });
    });

    this.app.get('/api/instagram/accounts/:id/media-ranking', (req, res) => {
      const { id } = req.params;
      const limit = parseInt(req.query.limit, 10) || 10;
      const sortBy = String(req.query.sort_by || 'total_interactions');
      const media = this.db.getInstagramMediaByAccount(id, 100).map(item => {
        const latestSnapshot = this.db.getLatestInstagramMediaInsights(item.id);
        const parsedSnapshot = latestSnapshot ? parseInstagramMediaSnapshot(latestSnapshot.raw_json) : null;
        const metricMap = new Map(Object.entries(parsedSnapshot?.metrics || {}));
        const fallbackInteractions = (Number(item.like_count) || 0) + (Number(item.comments_count) || 0);
        const interactions = Number(metricMap.get('total_interactions') || 0) || fallbackInteractions;
        const reach = Number(metricMap.get('reach') || 0);
        const scoreByMetric = {
          total_interactions: interactions,
          reach,
          impressions: Number(metricMap.get('impressions') || 0),
          views: Number(metricMap.get('views') || 0),
          saves: Number(metricMap.get('saved') || 0),
          shares: Number(metricMap.get('shares') || 0),
          engagement_rate: reach > 0 ? (interactions * 100) / reach : 0
        };
        const score = Number(scoreByMetric[sortBy] ?? scoreByMetric.total_interactions);

        return {
          ...item,
          supported_insights: parsedSnapshot?.supported === true,
          ranking_score: score,
          ranking_metric: sortBy,
          reach,
          impressions: Number(metricMap.get('impressions') || 0),
          saves: Number(metricMap.get('saved') || 0),
          shares: Number(metricMap.get('shares') || 0),
          views: Number(metricMap.get('views') || 0),
          engagement_rate: reach > 0 ? (interactions * 100) / reach : 0,
          total_interactions: interactions
        };
      }).sort((a, b) => b.ranking_score - a.ranking_score)
        .slice(0, limit);

      res.json({ data: media, meta: { sort_by: sortBy } });
    });

    this.app.get('/api/export/instagram/accounts.csv', (req, res) => {
      const accounts = this.db.getInstagramAccounts();
      const csv = toCsv([
        ['instagram_account_id', 'username', 'name', 'page_id', 'page_name', 'portfolio', 'followers_count', 'follows_count', 'media_count', 'last_synced_at'],
        ...accounts.map(account => [
          account.id,
          account.username || '',
          account.name || '',
          account.page_id || '',
          account.page_name || '',
          account.portfolio || '',
          account.followers_count || 0,
          account.follows_count || 0,
          account.media_count || 0,
          account.last_synced_at || account.updated_at || ''
        ])
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="instagram-accounts.csv"');
      res.send(csv);
    });

    this.app.get('/api/export/instagram/accounts/:id/insights.csv', (req, res) => {
      const { id } = req.params;
      const days = normalizeDays(req.query.days, config.instagram.defaultDays);
      const snapshots = this.db.getInstagramAccountInsightSnapshots(id, days);
      const csv = toCsv([
        ['instagram_account_id', 'snapshot_date', 'reach', 'follower_count', 'profile_views', 'accounts_engaged', 'total_interactions'],
        ...snapshots.map(snapshot => [
          snapshot.instagram_account_id,
          snapshot.snapshot_date,
          snapshot.reach || 0,
          snapshot.follower_count || 0,
          snapshot.profile_views || 0,
          snapshot.accounts_engaged || 0,
          snapshot.total_interactions || 0
        ])
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="instagram-${id}-insights-${days}d.csv"`);
      res.send(csv);
    });

    this.app.get('/api/export/instagram/accounts/:id/media.csv', (req, res) => {
      const { id } = req.params;
      const limit = parseInt(req.query.limit, 10) || 100;
      const mediaRows = this.db.getInstagramMediaByAccount(id, limit).map(item => {
        const latestSnapshot = this.db.getLatestInstagramMediaInsights(item.id);
        const parsedSnapshot = latestSnapshot ? parseInstagramMediaSnapshot(latestSnapshot.raw_json) : null;

        return [
          item.instagram_account_id,
          item.id,
          item.media_product_type || '',
          item.media_type || '',
          item.timestamp || '',
          item.like_count || 0,
          item.comments_count || 0,
          item.permalink || '',
          parsedSnapshot?.supported ? 'yes' : 'no',
          parsedSnapshot?.metrics?.impressions || 0,
          parsedSnapshot?.metrics?.reach || 0,
          parsedSnapshot?.metrics?.views || 0,
          parsedSnapshot?.metrics?.saved || 0,
          parsedSnapshot?.metrics?.shares || 0,
          parsedSnapshot?.metrics?.total_interactions || 0,
          parsedSnapshot?.reason || ''
        ];
      });

      const csv = toCsv([
        ['instagram_account_id', 'media_id', 'media_product_type', 'media_type', 'timestamp', 'like_count', 'comments_count', 'permalink', 'insights_supported', 'impressions', 'reach', 'views', 'saved', 'shares', 'total_interactions', 'insights_reason'],
        ...mediaRows
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="instagram-${id}-media.csv"`);
      res.send(csv);
    });

    this.app.get('/api/export/instagram/accounts/:id/demographics.csv', (req, res) => {
      const { id } = req.params;
      const latest = this.db.getLatestInstagramDemographics(id);

      if (!latest) {
        const csv = toCsv([
          ['instagram_account_id', 'snapshot_date', 'dimension_group', 'label', 'value'],
          [id, '', '', '', '']
        ]);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="instagram-${id}-demographics.csv"`);
        return res.send(csv);
      }

      const payload = JSON.parse(latest.raw_json || '{}');
      const summary = summarizeInstagramDemographics(payload.data || []);
      const csv = toCsv([
        ['instagram_account_id', 'snapshot_date', 'dimension_group', 'label', 'value', 'pct'],
        ...summary.flatMap(group => group.items.map(item => [
          id,
          latest.snapshot_date,
          group.key,
          item.label,
          item.value,
          item.pct.toFixed(2)
        ]))
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="instagram-${id}-demographics.csv"`);
      res.send(csv);
    });

    // Export page summary as CSV
    this.app.get('/api/export/pages.csv', (req, res) => {
      const pages = this.db.getPages();
      const csv = toCsv([
        ['page_id', 'name', 'portfolio', 'category', 'fan_count', 'followers_count', 'updated_at'],
        ...pages.map(page => [
          page.id,
          page.name,
          page.portfolio,
          page.category || '',
          page.fan_count || 0,
          page.followers_count || 0,
          page.updated_at || ''
        ])
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pages-summary.csv"');
      res.send(csv);
    });

    // Export top posts for a page as CSV
    this.app.get('/api/export/pages/:id/top-posts.csv', (req, res) => {
      const { id } = req.params;
      const limit = parseInt(req.query.limit, 10) || 20;
      const days = parseInt(req.query.days, 10) || 30;
      const page = this.db.getPages().find(item => item.id === id);

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      const posts = getRecentPosts(this.db.getPostsByPage(id), days)
        .map(post => ({
          id: post.id,
          created_time: post.created_time,
          message: post.message || '',
          likes: post.like_count || 0,
          loves: post.love_count || 0,
          wows: post.wow_count || 0,
          hahas: post.haha_count || 0,
          clicks: post.click_count || 0,
          video_views: post.video_views || 0,
          engagement: (post.like_count || 0) + (post.love_count || 0) +
            (post.wow_count || 0) + (post.haha_count || 0) +
            (post.click_count || 0) + (post.video_views || 0)
        }))
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, limit);

      const csv = toCsv([
        ['page_id', 'page_name', 'post_id', 'created_time', 'engagement', 'likes', 'loves', 'wows', 'hahas', 'clicks', 'video_views', 'message'],
        ...posts.map(post => [
          page.id,
          page.name,
          post.id,
          post.created_time || '',
          post.engagement,
          post.likes,
          post.loves,
          post.wows,
          post.hahas,
          post.clicks,
          post.video_views,
          post.message
        ])
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="top-posts-${id}.csv"`);
      res.send(csv);
    });

    this.app.get('/api/export/ads/accounts/:id/insights.csv', (req, res) => {
      const { id } = req.params;
      const days = normalizeDays(req.query.days, config.ads.defaultDays);
      const level = req.query.level || 'account';
      const campaignId = req.query.campaign_id || null;

      const rows = level === 'account'
        ? this.db.getAdInsights({
            adAccountId: id,
            level,
            days,
            campaignId
          })
        : this.db.getAdInsightsSummaryByLevel({
            adAccountId: id,
            level,
            days,
            campaignId
          });

      const csv = toCsv([
        ['ad_account_id', 'level', 'data_grain', 'sync_window_days', 'account_name', 'entity_id', 'entity_name', 'campaign_id', 'campaign_name', 'ad_set_id', 'ad_set_name', 'ad_id', 'ad_name', 'date_start', 'date_stop', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm', 'spend', 'frequency'],
        ...rows.map(row => [
          row.ad_account_id || id,
          row.level || level,
          row.data_grain || (level === 'account' ? 'daily' : 'all_days'),
          row.sync_window_days || '',
          row.account_name || '',
          row.entity_id || '',
          row.entity_name || '',
          row.campaign_id || '',
          row.campaign_name || '',
          row.ad_set_id || '',
          row.ad_set_name || '',
          row.ad_id || '',
          row.ad_name || '',
          row.date_start || '',
          row.date_stop || '',
          row.impressions || 0,
          row.reach || 0,
          row.clicks || 0,
          row.ctr || 0,
          row.cpc || 0,
          row.cpm || 0,
          row.spend || 0,
          row.frequency || 0
        ])
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ads-insights-${id}-${level}.csv"`);
      res.send(csv);
    });

    // Cross-page comparison report
    this.app.get('/api/reporting/page-comparison', (req, res) => {
      const days = parseInt(req.query.days, 10) || 30;
      const pages = this.db.getPages();

      const data = pages.map(page => {
        const metrics = this.db.getPageMetrics(page.id, days);
        const recentPosts = getRecentPosts(this.db.getPostsByPage(page.id), days);

        const totals = metrics.reduce((acc, metric) => {
          acc.engagements += metric.post_engagements || 0;
          acc.reactions += (metric.reactions_like || 0) + (metric.reactions_love || 0) +
            (metric.reactions_wow || 0) + (metric.reactions_haha || 0) +
            (metric.reactions_sorry || 0) + (metric.reactions_anger || 0);
          acc.videoViews += metric.video_views || 0;
          acc.totalActions += metric.total_actions || 0;
          return acc;
        }, {
          engagements: 0,
          reactions: 0,
          videoViews: 0,
          totalActions: 0
        });

        const baselineFans = page.fan_count || 0;
        const engagementRate = baselineFans > 0
          ? Number(((totals.engagements / baselineFans) * 100).toFixed(2))
          : 0;

        return {
          pageId: page.id,
          pageName: page.name,
          portfolio: page.portfolio,
          category: page.category || '',
          fanCount: page.fan_count || 0,
          followersCount: page.followers_count || 0,
          postCount: recentPosts.length,
          totalEngagements: totals.engagements,
          totalReactions: totals.reactions,
          totalVideoViews: totals.videoViews,
          totalActions: totals.totalActions,
          engagementRate
        };
      }).sort((a, b) => b.totalEngagements - a.totalEngagements);

      res.json({ data, days });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ========== POST MANAGEMENT ==========

    // Create a new post
    this.app.post('/api/pages/:id/posts', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { message, options } = req.body;
        
        // Find the portfolio for this page
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.createPost(id, message, options);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Schedule a post
    this.app.post('/api/pages/:id/posts/schedule', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { message, scheduledTime } = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.schedulePost(id, message, new Date(scheduledTime));
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete a post
    this.app.delete('/api/posts/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const pageIdOverride = String(req.query.pageId || '').trim();
        
        const pageId = pageIdOverride || id.split('_')[0];
        const page = this.db.getPages().find(p => p.id === pageId);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.deletePost(id, pageIdOverride);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Update a post
    this.app.put('/api/posts/:id', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { message } = req.body;
        
        const pageId = id.split('_')[0];
        const page = this.db.getPages().find(p => p.id === pageId);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.updatePost(id, message);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get scheduled posts
    this.app.get('/api/pages/:id/posts/scheduled', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const posts = await api.getScheduledPosts(id);
        res.json({ data: posts });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== COMMENTS MANAGEMENT ==========

    // Get comments for a post
    this.app.get('/api/posts/:id/comments', async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 100 } = req.query;
        
        const pageId = id.split('_')[0];
        const page = this.db.getPages().find(p => p.id === pageId);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const comments = await api.getComments(id, parseInt(limit));
        res.json({ data: comments });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Reply to a comment
    this.app.post('/api/comments/:id/replies', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { message } = req.body;
        
        // Extract page ID from comment ID (format: pageid_commentid)
        const pageId = id.split('_')[0];
        const page = this.db.getPages().find(p => p.id === pageId);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.replyToComment(id, message, pageId);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete a comment
    this.app.delete('/api/comments/:id', async (req, res) => {
      try {
        const { id } = req.params;
        
        // Extract page ID from comment ID
        const pageId = id.split('_')[0];
        const page = this.db.getPages().find(p => p.id === pageId);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.deleteComment(id, pageId);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Hide a comment
    this.app.post('/api/comments/:id/hide', async (req, res) => {
      try {
        const { id } = req.params;
        
        // Extract page ID from comment ID
        const pageId = id.split('_')[0];
        const page = this.db.getPages().find(p => p.id === pageId);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.hideComment(id, pageId);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== AUDIENCE INSIGHTS ==========

    // Get audience demographics
    this.app.get('/api/pages/:id/audience', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const audience = await api.getAudience(id);
        if (Array.isArray(audience)) {
          return res.json({ data: audience });
        }

        res.json({ data: [], meta: audience });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get reach data
    this.app.get('/api/pages/:id/reach', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const reach = await api.getReach(id, parseInt(days));
        if (Array.isArray(reach)) {
          return res.json({ data: reach });
        }

        res.json({ data: [], meta: reach });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get engagement rate
    this.app.get('/api/pages/:id/engagement-rate', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const rate = await api.getEngagementRate(id, parseInt(days));
        if (Array.isArray(rate)) {
          return res.json({ data: rate });
        }

        res.json({ data: [], meta: rate });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== INBOX/MESSAGES MANAGEMENT ==========

    // Get conversations
    this.app.get('/api/pages/:id/conversations', async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 25 } = req.query;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const conversations = await api.getConversations(id, parseInt(limit));
        res.json({ data: conversations });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get messages in a conversation
    this.app.get('/api/conversations/:id/messages', async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 50 } = req.query;
        
        // Try all portfolios until one works
        let messages = null;
        let lastError = null;
        
        for (const portfolio of config.portfolios) {
          try {
            const api = new FacebookAPI(portfolio.token);
            messages = await api.getMessages(id, parseInt(limit));
            break; // Success
          } catch (err) {
            lastError = err;
            continue; // Try next portfolio
          }
        }
        
        if (messages === null) {
          throw lastError || new Error('No valid token found');
        }
        
        res.json({ data: messages });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Send a message
    this.app.post('/api/pages/:id/messages', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { recipientId, message } = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.sendMessage(id, recipientId, message);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Mark conversation as read
    this.app.post('/api/conversations/:id/read', async (req, res) => {
      try {
        const { id } = req.params;
        
        let result = null;
        let lastError = null;

        for (const portfolio of config.portfolios) {
          try {
            const api = new FacebookAPI(portfolio.token);
            result = await api.markAsRead(id);
            break;
          } catch (err) {
            lastError = err;
            continue;
          }
        }

        if (result === null) {
          throw lastError || new Error('No valid token found');
        }

        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get notifications
    this.app.get('/api/pages/:id/notifications', async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 50 } = req.query;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const notifications = await api.getNotifications(id, parseInt(limit));
        res.json({ data: notifications });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== MEDIA UPLOAD ==========

    // Upload photo
    this.app.post('/api/pages/:id/photos', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { photoUrl, caption } = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.uploadPhoto(id, photoUrl, caption);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Upload video
    this.app.post('/api/pages/:id/videos', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { videoUrl, title, description } = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.uploadVideo(id, videoUrl, title, description);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Create album
    this.app.post('/api/pages/:id/albums', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { name, description } = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.createAlbum(id, name, description);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get albums
    this.app.get('/api/pages/:id/albums', async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 25 } = req.query;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const albums = await api.getAlbums(id, parseInt(limit));
        res.json({ data: albums });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get photos from album
    this.app.get('/api/albums/:id/photos', async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 50 } = req.query;
        
        // Try all portfolios until one works
        let photos = null;
        let lastError = null;
        
        for (const portfolio of config.portfolios) {
          try {
            const api = new FacebookAPI(portfolio.token);
            photos = await api.getAlbumPhotos(id, parseInt(limit));
            break;
          } catch (err) {
            lastError = err;
            continue;
          }
        }
        
        if (photos === null) {
          throw lastError || new Error('No valid token found');
        }
        
        res.json({ data: photos });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete media
    this.app.delete('/api/media/:id', async (req, res) => {
      try {
        const { id } = req.params;
        
        // Try all portfolios until one works
        let result = null;
        let lastError = null;
        
        for (const portfolio of config.portfolios) {
          try {
            const api = new FacebookAPI(portfolio.token);
            result = await api.deleteMedia(id);
            break;
          } catch (err) {
            lastError = err;
            continue;
          }
        }
        
        if (result === null) {
          throw lastError || new Error('No valid token found');
        }
        
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== PHASE 3: PAGE MANAGEMENT ==========

    // Get page details
    this.app.get('/api/pages/:id/details', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const details = await api.getPageDetails(id);
        res.json({ data: details });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Update page info
    this.app.put('/api/pages/:id', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.updatePageInfo(id, updates);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get page roles
    this.app.get('/api/pages/:id/roles', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const roles = await api.getPageRoles(id);
        res.json({ data: roles });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get page settings
    this.app.get('/api/pages/:id/settings', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const settings = await api.getPageSettings(id);
        res.json({ data: settings });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== PHASE 3: ADVANCED ANALYTICS ==========

    // Get video insights
    this.app.get('/api/pages/:id/video-insights', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const insights = await api.getVideoInsights(id, parseInt(days));
        if (Array.isArray(insights)) {
          return res.json({ data: insights });
        }

        res.json({ data: [], meta: insights });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get lifetime stats
    this.app.get('/api/pages/:id/lifetime', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const stats = await api.getPageLifetimeStats(id);
        res.json({ data: stats });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get content performance
    this.app.get('/api/pages/:id/content-performance', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const performance = await api.getContentPerformance(id, parseInt(days));
        if (Array.isArray(performance)) {
          return res.json({ data: performance });
        }

        res.json({ data: [], meta: performance });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get post engagement by type
    this.app.get('/api/pages/:id/engagement-by-type', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const engagement = await api.getPostEngagementByType(id, parseInt(days));
        if (Array.isArray(engagement)) {
          return res.json({ data: engagement });
        }

        res.json({ data: [], meta: engagement });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== PHASE 3: AUTOMATION ==========

    // Get milestones
    this.app.get('/api/pages/:id/milestones', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const milestones = await api.getMilestones(id);
        res.json({ data: milestones });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Create milestone
    this.app.post('/api/pages/:id/milestones', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { title, description, time } = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.createMilestone(id, title, description, time);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get offers
    this.app.get('/api/pages/:id/offers', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const offers = await api.getOffers(id);
        res.json({ data: offers });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Create offer
    this.app.post('/api/pages/:id/offers', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { title, description, expirationTime } = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.createOffer(id, title, description, expirationTime);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get auto-reply rules
    this.app.get('/api/pages/:id/auto-reply', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const rules = await api.getAutoReplyRules(id);
        res.json({ data: rules });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Set instant reply
    this.app.post('/api/pages/:id/auto-reply', express.json(), async (req, res) => {
      try {
        const { id } = req.params;
        const { message } = req.body;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const api = new FacebookAPI(portfolio.token);
        const result = await api.setInstantReply(id, message);
        res.json({ data: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== CHARTS DATA ENDPOINTS ==========

    // Fan growth trend data
    this.app.get('/api/pages/:id/fan-growth', async (req, res) => {
      try {
        const { id } = req.params;
        const page = this.db.getPages().find(item => item.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }

        res.json({
          data: [],
          meta: buildUnavailableMeta(
            'Historical fan and follower snapshots are not collected accurately in the current fetch pipeline, so growth trends are hidden to avoid misleading charts.'
          )
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Reactions breakdown timeline
    this.app.get('/api/pages/:id/reactions-timeline', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const metrics = this.db.getPageMetrics(id, parseInt(days)).slice().reverse();
        
        const chartData = metrics.map(m => ({
          date: m.date,
          like: m.reactions_like || 0,
          love: m.reactions_love || 0,
          wow: m.reactions_wow || 0,
          haha: m.reactions_haha || 0,
          sorry: m.reactions_sorry || 0,
          angry: m.reactions_anger || 0
        }));
        
        res.json({ data: chartData });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Best posting times (from post metrics)
    this.app.get('/api/pages/:id/best-posting-times', async (req, res) => {
      try {
        const { id } = req.params;
        const days = parseInt(req.query.days) || 30;
        
        // Get posts with their metrics
        const posts = this.db.getPostsByPage(id);
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const recentPosts = posts.filter(post => post.created_time && new Date(post.created_time) >= startDate);
        
        // Analyze posting times and engagement
        const timeAnalysis = {};
        
        recentPosts.forEach(post => {
          if (post.created_time) {
            const date = new Date(post.created_time);
            const dayOfWeek = date.getDay(); // 0 = Sunday
            const hour = date.getHours();
            const key = `${dayOfWeek}-${hour}`;
            
            if (!timeAnalysis[key]) {
              timeAnalysis[key] = {
                day: dayOfWeek,
                hour: hour,
                totalEngagement: 0,
                postCount: 0
              };
            }
            
            const engagement = (post.like_count || 0) + (post.love_count || 0) + 
                             (post.wow_count || 0) + (post.haha_count || 0) + 
                             (post.click_count || 0);
            timeAnalysis[key].totalEngagement += engagement;
            timeAnalysis[key].postCount += 1;
          }
        });
        
        // Convert to array and calculate averages
        const chartData = Object.values(timeAnalysis).map(item => ({
          day: item.day,
          hour: item.hour,
          avgEngagement: item.postCount > 0 ? item.totalEngagement / item.postCount : 0,
          postCount: item.postCount
        }));
        
        res.json({ data: chartData });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Top performing posts
    this.app.get('/api/pages/:id/top-posts', async (req, res) => {
      try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const days = parseInt(req.query.days) || 30;
        
        const posts = getRecentPosts(this.db.getPostsByPage(id), days);
        
        // Calculate total engagement for each post
        const postsWithEngagement = posts.map(post => ({
          id: post.id,
          message: post.message || '',
          created_time: post.created_time,
          engagement: (post.like_count || 0) + (post.love_count || 0) + 
                     (post.wow_count || 0) + (post.haha_count || 0) + 
                     (post.click_count || 0) + (post.video_views || 0),
          likes: post.like_count || 0,
          loves: post.love_count || 0,
          wows: post.wow_count || 0,
          hahas: post.haha_count || 0,
          clicks: post.click_count || 0,
          video_views: post.video_views || 0
        }));
        
        // Sort by engagement and take top N
        const topPosts = postsWithEngagement
          .sort((a, b) => b.engagement - a.engagement)
          .slice(0, limit);
        
        res.json({ data: topPosts });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Age and gender distribution - Facebook API limitation
    this.app.get('/api/pages/:id/demographics', async (req, res) => {
      try {
        const { id } = req.params;
        
        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }
        
        // Facebook Graph API doesn't provide age/gender breakdown directly
        // Return empty structure with explanation
        const demographics = {
          age_gender: [],
          city: [],
          country: [],
          locale: [],
          note: 'Facebook Graph API không cung cấp dữ liệu nhân khẩu học (age/gender) trực tiếp qua Page Insights. Cần sử dụng Meta Business Suite hoặc Audience Insights trong Facebook Creator Studio để xem dữ liệu chi tiết.'
        };
        
        res.json({ data: demographics });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ========== NEW CHARTS DATA ENDPOINTS ==========

    // 1. Engagement Rate Trend - Tỷ lệ engagement/fans theo thời gian
    this.app.get('/api/pages/:id/engagement-rate-trend', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const metrics = this.db.getPageMetrics(id, parseInt(days)).slice().reverse();

        const hasReachData = metrics.some(m => (m.impressions || 0) > 0 || (m.engaged_users || 0) > 0);
        if (!hasReachData) {
          return res.json({
            data: [],
            meta: buildUnavailableMeta(
              'Daily impressions and engaged users snapshots are not available in local history. Live testing on July 4, 2026 also showed the legacy Page Insights metrics used for this chart return invalid metric errors in the current API flow.'
            )
          });
        }

        const chartData = metrics.map(m => {
          const impressions = m.impressions || 0;
          const engagedUsers = m.engaged_users || 0;
          const denominator = impressions || 1;

          return {
            date: m.date,
            engagementRate: Number(((engagedUsers / denominator) * 100).toFixed(2)),
            engagedUsers,
            impressions
          };
        });

        res.json({
          data: chartData,
          meta: {
            supported: true,
            formula: 'engaged_users / impressions * 100'
          }
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 2. Post Frequency Analysis - Tần suất đăng bài theo ngày/tuần
    this.app.get('/api/pages/:id/post-frequency', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const posts = this.db.getPostsByPage(id);
        const daysNum = parseInt(days);
        const now = new Date();
        const startDate = new Date(now.getTime() - daysNum * 24 * 60 * 60 * 1000);
        
        // Filter posts within date range
        const recentPosts = posts.filter(p => {
          const postDate = new Date(p.created_time);
          return postDate >= startDate;
        });
        
        // Group by date
        const frequencyMap = {};
        recentPosts.forEach(post => {
          const dateStr = post.created_time.split('T')[0];
          frequencyMap[dateStr] = (frequencyMap[dateStr] || 0) + 1;
        });
        
        // Convert to array and fill missing dates
        const chartData = [];
        for (let i = 0; i < daysNum; i++) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = date.toISOString().split('T')[0];
          chartData.push({
            date: dateStr,
            postCount: frequencyMap[dateStr] || 0
          });
        }
        
        chartData.reverse();
        res.json({ data: chartData });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 3. Reaction Ratio Pie Chart - Tỷ lệ các loại reaction
    this.app.get('/api/pages/:id/reaction-ratio', async (req, res) => {
      try {
        const { id } = req.params;
        const { days = 30 } = req.query;
        
        const metrics = this.db.getPageMetrics(id, parseInt(days)).slice().reverse();
        
        const totals = {
          like: 0,
          love: 0,
          wow: 0,
          haha: 0,
          sorry: 0,
          angry: 0
        };
        
        metrics.forEach(m => {
          totals.like += m.reactions_like || 0;
          totals.love += m.reactions_love || 0;
          totals.wow += m.reactions_wow || 0;
          totals.haha += m.reactions_haha || 0;
          totals.sorry += m.reactions_sorry || 0;
          totals.angry += m.reactions_anger || 0;
        });
        
        const total = Object.values(totals).reduce((a, b) => a + b, 0);
        
        const chartData = Object.entries(totals).map(([type, count]) => ({
          type: type,
          count: count,
          percentage: total > 0 ? ((count / total) * 100).toFixed(2) : 0
        }));
        
        res.json({ data: chartData, total: total });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 4. Comments vs Likes Comparison - So sánh số comments và likes
    this.app.get('/api/pages/:id/comments-vs-likes', async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 20 } = req.query;
        const days = parseInt(req.query.days) || 30;
        
        const posts = getRecentPosts(this.db.getPostsByPage(id), days);
        
        const chartData = posts.map(post => {
          const totalLikes = (post.like_count || 0) + (post.love_count || 0) + 
                           (post.wow_count || 0) + (post.haha_count || 0);
          
          // Get comments count from comments table
          const comments = this.db.getCommentsByPost(post.id);
          
          return {
            postId: post.id,
            message: (post.message || '').substring(0, 50),
            likes: totalLikes,
            comments: comments.length,
            totalInteractions: totalLikes + comments.length,
            created_time: post.created_time
          };
        }).sort((a, b) => b.totalInteractions - a.totalInteractions)
          .slice(0, parseInt(limit));
        
        res.json({ data: chartData });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.get('/api/pages/:id/total-actions-trend', async (req, res) => {
      try {
        const { id } = req.params;
        const days = parseInt(req.query.days, 10) || 30;

        const metrics = this.db.getPageMetrics(id, days).slice().reverse();
        const data = metrics.map(metric => ({
          date: metric.date,
          totalActions: metric.total_actions || 0,
          postEngagements: metric.post_engagements || 0,
          totalReactions:
            (metric.reactions_like || 0) +
            (metric.reactions_love || 0) +
            (metric.reactions_wow || 0) +
            (metric.reactions_haha || 0) +
            (metric.reactions_sorry || 0) +
            (metric.reactions_anger || 0)
        }));

        res.json({ data });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.get('/api/pages/:id/comment-activity', async (req, res) => {
      try {
        const { id } = req.params;
        const days = parseInt(req.query.days, 10) || 30;
        const comments = this.db.getAllCommentsByPage(id);
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const countByDate = {};

        comments.forEach(comment => {
          if (!comment.created_time) return;
          const commentDate = new Date(comment.created_time);
          if (commentDate < startDate) return;
          const dateKey = comment.created_time.split('T')[0];
          countByDate[dateKey] = (countByDate[dateKey] || 0) + 1;
        });

        const data = [];
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateKey = date.toISOString().split('T')[0];
          data.push({
            date: dateKey,
            comments: countByDate[dateKey] || 0
          });
        }

        res.json({ data });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.get('/api/pages/:id/video-views-breakdown', async (req, res) => {
      try {
        const { id } = req.params;
        const days = parseInt(req.query.days, 10) || 30;

        const page = this.db.getPages().find(p => p.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }

        const portfolio = config.portfolios.find(p => p.name === page.portfolio);
        if (!portfolio) {
          return res.status(404).json({ error: 'Portfolio not found' });
        }

        const api = new FacebookAPI(portfolio.token);
        const insights = await api.getVideoViewsBreakdown(id, days);
        const byName = new Map();

        insights.forEach(insight => {
          byName.set(insight.name, insight.values || []);
        });

        const baseValues = byName.get('page_video_views') || [];
        const data = baseValues.map(item => {
          const dateKey = item.end_time ? item.end_time.split('T')[0] : '';
          const findValue = (metricName) => {
            const values = byName.get(metricName) || [];
            const match = values.find(value => value.end_time && value.end_time.split('T')[0] === dateKey);
            return match?.value || 0;
          };

          return {
            date: dateKey,
            totalViews: item.value || 0,
            paidViews: findValue('page_video_views_paid'),
            organicViews: findValue('page_video_views_organic'),
            autoplayedViews: findValue('page_video_views_autoplayed'),
            clickToPlayViews: findValue('page_video_views_click_to_play')
          };
        });

        res.json({ data });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 5. Growth Rate Chart - Tốc độ tăng trưởng fans/followers (%)
    this.app.get('/api/pages/:id/growth-rate', async (req, res) => {
      try {
        const { id } = req.params;
        const page = this.db.getPages().find(item => item.id === id);
        if (!page) {
          return res.status(404).json({ error: 'Page not found' });
        }

        res.json({
          data: [],
          meta: buildUnavailableMeta(
            'Growth rate depends on accurate day-by-day fan history. The current dataset stores current fan counts, not historical snapshots, so this chart is hidden for now.'
          )
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 6. Post Length vs Engagement - Tương quan độ dài bài viết và engagement
    this.app.get('/api/pages/:id/post-length-engagement', async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 50 } = req.query;
        const days = parseInt(req.query.days) || 30;
        
        const posts = getRecentPosts(this.db.getPostsByPage(id), days);
        
        const chartData = posts.slice(0, parseInt(limit)).map(post => {
          const message = post.message || '';
          const length = message.length;
          const engagement = (post.like_count || 0) + (post.love_count || 0) + 
                           (post.wow_count || 0) + (post.haha_count || 0) + 
                           (post.click_count || 0);
          
          return {
            postId: post.id,
            length: length,
            engagement: engagement,
            message: message.substring(0, 30)
          };
        });
        
        res.json({ data: chartData });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 7. Weekly/Monthly Comparison - So sánh theo tuần/tháng
    this.app.get('/api/pages/:id/period-comparison', async (req, res) => {
      try {
        const { id } = req.params;
        const { period = 'weekly' } = req.query; // weekly or monthly
        
        const metrics = this.db.getPageMetrics(id, 90);
        
        if (period === 'weekly') {
          // Group by week
          const weekMap = {};
          metrics.forEach(m => {
            const date = new Date(m.date);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekKey = weekStart.toISOString().split('T')[0];
            
            if (!weekMap[weekKey]) {
              weekMap[weekKey] = {
                week: weekKey,
                totalEngagements: 0,
                totalReactions: 0,
                days: 0
              };
            }
            
            weekMap[weekKey].totalEngagements += m.post_engagements || 0;
            weekMap[weekKey].totalReactions += (m.reactions_like || 0) + (m.reactions_love || 0) + 
                                              (m.reactions_wow || 0) + (m.reactions_haha || 0);
            weekMap[weekKey].days += 1;
          });
          
          const chartData = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
          res.json({ data: chartData, period: 'weekly' });
        } else {
          // Group by month
          const monthMap = {};
          metrics.forEach(m => {
            const monthKey = m.date.substring(0, 7); // YYYY-MM
            
            if (!monthMap[monthKey]) {
              monthMap[monthKey] = {
                month: monthKey,
                totalEngagements: 0,
                totalReactions: 0,
                days: 0
              };
            }
            
            monthMap[monthKey].totalEngagements += m.post_engagements || 0;
            monthMap[monthKey].totalReactions += (m.reactions_like || 0) + (m.reactions_love || 0) + 
                                                (m.reactions_wow || 0) + (m.reactions_haha || 0);
            monthMap[monthKey].days += 1;
          });
          
          const chartData = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
          res.json({ data: chartData, period: 'monthly' });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  start(port = 3000, host = 'localhost') {
    const server = this.app.listen(port, host, () => {
      console.log(`🌐 API Server running on http://localhost:${port}`);
      console.log(`   GET /api/pages - List all pages`);
      console.log(`   GET /api/pages/:id/metrics - Page metrics`);
      console.log(`   GET /api/posts/:id/metrics - Post metrics`);
      console.log(`   GET /api/summary - Summary stats`);
    });
    
    // Setup WebSocket
    this.setupWebSocket(server);
    console.log('🔌 WebSocket server initialized');
    
    // Periodic broadcast of metrics (every 30 seconds)
    setInterval(() => {
      if (this.wsClients.size > 0) {
        const pages = this.db.getPages();
        const summary = {
          total_pages: pages.length,
          total_fans: pages.reduce((sum, p) => sum + (p.fan_count || 0), 0),
          total_followers: pages.reduce((sum, p) => sum + (p.followers_count || 0), 0),
          portfolios: [...new Set(pages.map(p => p.portfolio))]
        };
        
        this.broadcast({
          type: 'metrics_update',
          data: summary,
          timestamp: new Date().toISOString()
        });
      }
    }, 30000);
    
    return server;
  }
}

module.exports = Server;

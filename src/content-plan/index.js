/**
 * Content Plan - API Router
 * Express router cho Content Plan module
 */

const express = require('express');
const crypto = require('crypto');
const Database = require('../database');
const { syncContentPlan } = require('./sheets-sync');
const { getImageUrl, getDriveFileStream, listDriveFiles } = require('./drive-download');
const { updateSheetStatus } = require('./sheet-updater');
const FacebookAPI = require('../facebook/api');
const InstagramAPI = require('../instagram/api');
const config = require('../config');

const router = express.Router();

function normalizeContentStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'published') return 'done';
  if (normalized === 'scheduled') return 'scheduled';
  if (normalized === 'skip' || normalized === 'skipped') return 'skipped';
  if (normalized === 'error') return 'error';
  return 'pending';
}

function isLockedContentStatus(status) {
  return ['done', 'scheduled', 'skipped'].includes(normalizeContentStatus(status));
}

function getFutureScheduledTime(item) {
  if (!item.scheduled_at) return null;
  const scheduledTime = new Date(item.scheduled_at);
  if (Number.isNaN(scheduledTime.getTime())) return null;
  return scheduledTime.getTime() > Date.now() + 60 * 1000 ? scheduledTime : null;
}

function buildFacebookPostUrl(postId) {
  if (!postId) return '';
  return `https://www.facebook.com/${postId}`;
}

function findLinkedInstagramAccount(db, pageId, portfolioName) {
  return db.getInstagramAccounts()
    .filter(account => account.page_id === pageId)
    .filter(account => !portfolioName || String(account.portfolio || '').split(',').map(item => item.trim()).includes(portfolioName))[0];
}

function normalizeMatchText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function slugifyContentPlanFilename(filename = '') {
  return String(filename || '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getMinuteBucket(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 60000);
}

function getDualJobDerivedStatus(job) {
  const status = String(job?.status || '').trim().toLowerCase();
  if (status === 'scheduled' || status === 'publishing') return 'scheduled';
  if (status === 'published') return 'done';
  if (status === 'error' || status === 'delete_error') return 'error';
  return null;
}

function scoreDualJobMatch(item, job) {
  const itemMessage = normalizeMatchText(item.caption);
  const jobMessage = normalizeMatchText(job.message);
  const itemTitle = normalizeMatchText(item.title);
  const itemMinute = getMinuteBucket(item.scheduled_at);
  const jobMinute = getMinuteBucket(job.scheduled_time);
  const mediaSlug = slugifyContentPlanFilename(item.image_filename);
  const mediaUrl = String(job.media_url || '').toLowerCase();

  let score = 0;

  if (itemMinute !== null && jobMinute !== null && Math.abs(itemMinute - jobMinute) <= 2) score += 5;
  if (itemMessage && itemMessage === jobMessage) score += 6;
  if (itemTitle && jobMessage.includes(itemTitle)) score += 3;
  if (mediaSlug && mediaUrl.includes(mediaSlug)) score += 4;
  if (String(job.status || '').toLowerCase() === 'scheduled') score += 1;

  return score;
}

function findMatchingDualPublishJob(item, jobs = []) {
  const candidates = jobs
    .filter(job => !['canceled', 'deleted'].includes(String(job.status || '').toLowerCase()))
    .map(job => ({ job, score: scoreDualJobMatch(item, job) }))
    .filter(candidate => candidate.score >= 7)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.job || null;
}

function decorateContentPlanItem(item, job) {
  if (!job) {
    return {
      ...item,
      source_status: item.status,
      status_source: 'content_plan'
    };
  }

  const derivedStatus = getDualJobDerivedStatus(job);
  if (!derivedStatus) {
    return {
      ...item,
      source_status: item.status,
      status_source: 'content_plan'
    };
  }

  return {
    ...item,
    source_status: item.status,
    status: derivedStatus,
    status_source: 'dual_publish_job',
    post_url: item.post_url || buildFacebookPostUrl(job.facebook_post_id),
    published_page_id: item.published_page_id || job.page_id,
    published_ig_media_id: item.published_ig_media_id || job.instagram_media_id,
    dual_publish_job: {
      id: job.id,
      status: job.status,
      page_id: job.page_id,
      page_name: job.page_name,
      instagram_account_id: job.instagram_account_id,
      instagram_username: job.instagram_username,
      facebook_post_id: job.facebook_post_id,
      scheduled_time: job.scheduled_time,
      published_at: job.published_at,
      publish_error: job.publish_error
    }
  };
}

function getDecoratedContentPlanItems(db) {
  const jobs = db.getDualPublishJobs(500);
  return db.getContentPlanItems().map(item => decorateContentPlanItem(item, findMatchingDualPublishJob(item, jobs)));
}

/**
 * GET /api/content-plan
 * List tất cả content plan items
 */
router.get('/', (req, res) => {
  try {
    const db = Database.getInstance();
    const items = getDecoratedContentPlanItems(db);
    res.json({ data: items });
  } catch (err) {
    console.error('[Content Plan] Error listing items:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/content-plan/sync
 * Trigger sync từ Google Sheet
 */
router.post('/sync', async (req, res) => {
  try {
    const full = req.body?.full === true || req.body?.full === 'true' || req.query?.full === 'true';
    console.log(`[Content Plan] Manual sync triggered${full ? ' (full)' : ''}`);
    const result = await syncContentPlan({ full });
    res.json({
      message: 'Sync hoàn tất',
      data: result
    });
  } catch (err) {
    console.error('[Content Plan] Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/content-plan/:id/media
 * Stream media preview directly from Google Drive for the dashboard.
 */
router.get('/:id/media', async (req, res) => {
  try {
    const db = Database.getInstance();
    const item = db.getContentPlanItem(req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Không tìm thấy content plan item' });
    }

    if (!item.image_filename) {
      return res.status(404).json({ error: 'Bài này chưa có file hình ảnh' });
    }

    const { file, stream } = await getDriveFileStream(item.image_filename);

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name || item.image_filename)}"`);

    stream.on('error', error => {
      console.error('[Content Plan] Media stream error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.end();
      }
    });

    stream.pipe(res);
  } catch (err) {
    console.error('[Content Plan] Media preview error:', err);
    const statusCode = /không tìm thấy/i.test(err.message) ? 404 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

/**
 * POST /api/content-plan/:id/publish
 * Publish một content plan item
 * Body: { pageId, publishInstagram: boolean }
 */
router.post('/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const { pageId, publishInstagram = false } = req.body;

    const db = Database.getInstance();
    const item = db.getContentPlanItem(id);

    if (!item) {
      return res.status(404).json({ error: 'Không tìm thấy content plan item' });
    }

    const currentStatus = normalizeContentStatus(item.status);
    if (isLockedContentStatus(currentStatus)) {
      return res.status(400).json({ error: `Bài này đang ở trạng thái ${currentStatus}, không thể publish lại.` });
    }

    const existingJob = findMatchingDualPublishJob(item, db.getDualPublishJobs(500));
    if (existingJob && ['scheduled', 'publishing', 'published'].includes(String(existingJob.status || '').toLowerCase())) {
      return res.status(409).json({
        error: 'Bài này đã có dual publish job trong tab Post, không tạo lịch trùng.',
        data: {
          dualPublishJobId: existingJob.id,
          status: existingJob.status,
          scheduledTime: existingJob.scheduled_time,
          facebookPostId: existingJob.facebook_post_id,
          pageName: existingJob.page_name,
          instagramUsername: existingJob.instagram_username
        }
      });
    }

    if (!pageId) {
      return res.status(400).json({ error: 'Vui lòng chọn Page để publish' });
    }

    // Tìm page và portfolio
    const page = db.getPages().find(p => p.id === pageId);
    if (!page) {
      return res.status(404).json({ error: 'Không tìm thấy Page' });
    }

    const portfolio = config.portfolios.find(p => p.name === page.portfolio);
    if (!portfolio) {
      return res.status(404).json({ error: 'Không tìm thấy portfolio của Page' });
    }

    const scheduledTime = getFutureScheduledTime(item);
    const format = String(item.format || 'image').toLowerCase();
    const supportsInstagram = format === 'image' || format === 'photo';
    let instagramAccount = null;

    if (publishInstagram) {
      if (!item.image_filename || !supportsInstagram) {
        return res.status(400).json({ error: 'Instagram dual publish từ Content Plan hiện chỉ hỗ trợ bài ảnh.' });
      }

      instagramAccount = findLinkedInstagramAccount(db, pageId, page.portfolio);
      if (!instagramAccount) {
        return res.status(400).json({ error: 'Không tìm thấy Instagram account đã liên kết với Page này.' });
      }
    }

    console.log(`[Content Plan] Publishing ${item.content_code} to page ${page.name}`);

    // Download ảnh từ Drive và upload lên Cloudinary
    let mediaUrl = null;
    if (item.image_filename) {
      try {
        mediaUrl = await getImageUrl(item.image_filename);
        console.log(`[Content Plan] ✓ Image uploaded: ${mediaUrl}`);
      } catch (err) {
        console.error(`[Content Plan] ✗ Failed to get image:`, err.message);
        return res.status(500).json({ error: `Không thể tải ảnh: ${err.message}` });
      }
    }

    // Publish lên Facebook
    const fbApi = new FacebookAPI(portfolio.token);
    let fbPostId = null;
    let fbPostUrl = null;

    try {
      if (mediaUrl && supportsInstagram) {
        // Photo post
        const result = await fbApi.publishMediaPost(pageId, {
          mediaType: 'photo',
          mediaUrl,
          message: item.caption || '',
          title: item.title || '',
          scheduledTime
        });
        fbPostId = result.post_id || result.id;
        fbPostUrl = buildFacebookPostUrl(fbPostId);
      } else if (mediaUrl && format === 'video') {
        // Video post
        const result = await fbApi.publishMediaPost(pageId, {
          mediaType: 'video',
          mediaUrl,
          message: item.caption || '',
          title: item.title || '',
          scheduledTime
        });
        fbPostId = result.post_id || result.id;
        fbPostUrl = buildFacebookPostUrl(fbPostId);
      } else {
        // Text-only post
        const result = scheduledTime
          ? await fbApi.schedulePost(pageId, item.caption || '', scheduledTime)
          : await fbApi.createPost(pageId, item.caption || '');
        fbPostId = result.post_id || result.id;
        fbPostUrl = buildFacebookPostUrl(fbPostId);
      }

      console.log(`[Content Plan] ✓ Facebook post ${scheduledTime ? 'scheduled' : 'published'}: ${fbPostId}`);
    } catch (err) {
      console.error(`[Content Plan] ✗ Facebook publish failed:`, err.message);
      return res.status(500).json({ error: `Lỗi publish Facebook: ${err.message}` });
    }

    // Publish lên Instagram (nếu được chọn)
    let igMediaId = null;
    let dualPublishJobId = null;
    let instagramStatus = publishInstagram ? 'not_published' : 'not_requested';
    let instagramError = null;
    if (publishInstagram && mediaUrl) {
      if (scheduledTime) {
        const job = db.createDualPublishJob({
          id: `dual_${crypto.randomUUID()}`,
          page_id: pageId,
          page_name: page.name || '',
          portfolio: page.portfolio || '',
          instagram_account_id: instagramAccount.id,
          instagram_username: instagramAccount.username || '',
          facebook_post_id: fbPostId || '',
          media_url: mediaUrl,
          message: item.caption || '',
          scheduled_time: scheduledTime.toISOString(),
          status: 'scheduled'
        });
        dualPublishJobId = job.id;
        instagramStatus = 'scheduled';
        console.log(`[Content Plan] ✓ Instagram job scheduled: ${job.id}`);
      } else {
        try {
          const igApi = new InstagramAPI(portfolio.token);
          const igResult = await igApi.publishSingleImage(instagramAccount.id, mediaUrl, item.caption || '');
          igMediaId = igResult.media_id;
          const job = db.createDualPublishJob({
            id: `dual_${crypto.randomUUID()}`,
            page_id: pageId,
            page_name: page.name || '',
            portfolio: page.portfolio || '',
            instagram_account_id: instagramAccount.id,
            instagram_username: instagramAccount.username || '',
            facebook_post_id: fbPostId || '',
            media_url: mediaUrl,
            message: item.caption || '',
            scheduled_time: new Date().toISOString(),
            status: 'published',
            instagram_container_id: igResult.container_id,
            instagram_media_id: igResult.media_id,
            published_at: new Date().toISOString()
          });
          dualPublishJobId = job.id;
          instagramStatus = 'published';
          console.log(`[Content Plan] ✓ Instagram post published: ${igMediaId}`);
        } catch (err) {
          instagramError = err.message;
          instagramStatus = 'error';
          const job = db.createDualPublishJob({
            id: `dual_${crypto.randomUUID()}`,
            page_id: pageId,
            page_name: page.name || '',
            portfolio: page.portfolio || '',
            instagram_account_id: instagramAccount.id,
            instagram_username: instagramAccount.username || '',
            facebook_post_id: fbPostId || '',
            media_url: mediaUrl,
            message: item.caption || '',
            scheduled_time: new Date().toISOString(),
            status: 'error',
            publish_error: err.message
          });
          dualPublishJobId = job.id;
          console.error(`[Content Plan] ✗ Instagram publish failed:`, err.message);
        }
      }
    }

    // Update database status
    const nextStatus = scheduledTime ? 'scheduled' : 'done';
    db.updateContentPlanStatus(id, nextStatus, fbPostUrl, pageId, igMediaId);

    // Update Google Sheet
    try {
      await updateSheetStatus(item.content_code, fbPostUrl, scheduledTime ? 'SCHEDULED' : 'DONE');
      console.log(`[Content Plan] ✓ Sheet updated for ${item.content_code}`);
    } catch (err) {
      console.error(`[Content Plan] ✗ Sheet update failed:`, err.message);
      // Không fail cả request, chỉ log warning
    }

    res.json({
      message: 'Publish thành công',
      data: {
        contentCode: item.content_code,
        facebookPostId: fbPostId,
        facebookPostUrl: fbPostUrl,
        instagramMediaId: igMediaId,
        instagramStatus,
        instagramError,
        dualPublishJobId,
        scheduled: Boolean(scheduledTime),
        scheduledTime: scheduledTime ? scheduledTime.toISOString() : null,
        mediaUrl
      }
    });
  } catch (err) {
    console.error('[Content Plan] Publish error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/content-plan/drive-files
 * List tất cả files trong Drive folder
 */
router.get('/drive-files', async (req, res) => {
  try {
    const files = await listDriveFiles();
    res.json({ data: files });
  } catch (err) {
    console.error('[Content Plan] Error listing Drive files:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

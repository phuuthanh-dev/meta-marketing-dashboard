/**
 * Content Plan - Frontend Module
 * Quản lý content plan từ Google Sheet, publish lên FB+IG
 */

// State
let contentPlanItems = [];
let contentPlanPages = [];
let contentPlanInstagramAccounts = [];
let contentPlanControlsInitialized = false;
const DEFAULT_CONTENT_PLAN_PAGE_NAME = 'Delements Lab';
const contentPlanPublishingIds = new Set();

function setContentPlanStatus(message, type = 'info') {
  const box = document.getElementById('contentPlanResult');
  const safeMessage = escapeContentPlanText(message);
  const className = type === 'loading'
    ? 'loading'
    : type === 'error'
      ? 'error'
      : type === 'success'
        ? 'success'
        : 'composer-hint';

  if (box) {
    box.innerHTML = `<div class="${className}">${safeMessage}</div>`;
  }

  if (!box) {
    const log = type === 'error' ? console.error : console.log;
    log(`[Content Plan] ${message}`);
  }
}

function setContentPlanButtonLoading(button, isLoading, loadingText = 'Đang xử lý...') {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent.trim();
    button.disabled = true;
    button.textContent = loadingText;
    return;
  }
  button.disabled = false;
  button.textContent = button.dataset.originalText || button.textContent;
  delete button.dataset.originalText;
}

function escapeContentPlanText(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

function escapeContentPlanAttr(value) {
  return escapeContentPlanText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizeContentPlanStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'published') return 'done';
  if (normalized === 'scheduled') return 'scheduled';
  if (normalized === 'skip' || normalized === 'skipped') return 'skipped';
  if (normalized === 'error') return 'error';
  return 'pending';
}

function isContentPlanLocked(item) {
  return ['done', 'scheduled', 'skipped'].includes(normalizeContentPlanStatus(item.status));
}

function isContentPlanDue(item) {
  if (!item.scheduled_at) return true;
  const scheduledAt = new Date(item.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime())) return true;
  return scheduledAt.getTime() <= Date.now();
}

function renderContentPlanStatus(status, item = {}) {
  const normalized = normalizeContentPlanStatus(status);
  const labels = {
    done: '<span class="badge badge-success">DONE</span>',
    scheduled: '<span class="badge badge-info">SCHEDULED</span>',
    skipped: '<span class="badge badge-secondary">SKIPPED</span>',
    error: '<span class="badge badge-danger">ERROR</span>',
    pending: '<span class="badge badge-warning">Pending</span>'
  };
  const source = item.status_source === 'dual_publish_job'
    ? '<div class="content-plan-status-note">Dual job</div>'
    : '';
  return `${labels[normalized] || labels.pending}${source}`;
}

function formatContentPlanDate(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getSelectedContentPlanPageName() {
  const pageSelect = document.getElementById('contentPlanPageSelect');
  const selectedPage = contentPlanPages.find(page => String(page.id) === String(pageSelect?.value));
  return selectedPage?.name || 'Facebook Page';
}

function getSelectedContentPlanPage() {
  const pageSelect = document.getElementById('contentPlanPageSelect');
  return contentPlanPages.find(page => String(page.id) === String(pageSelect?.value)) || null;
}

function getLinkedContentPlanInstagramAccount(page = getSelectedContentPlanPage()) {
  if (!page) return null;
  return contentPlanInstagramAccounts
    .filter(account => String(account.page_id) === String(page.id))
    .filter(account => {
      if (!page.portfolio) return true;
      return String(account.portfolio || '')
        .split(',')
        .map(item => item.trim())
        .includes(page.portfolio);
    })[0] || null;
}

function updateContentPlanPublishMode(options = {}) {
  const preserveChoice = Boolean(options.preserveChoice);
  const checkbox = document.getElementById('contentPlanPublishInstagram');
  const mode = document.getElementById('contentPlanPublishMode');
  const page = getSelectedContentPlanPage();
  const account = getLinkedContentPlanInstagramAccount(page);

  if (!checkbox) return;

  if (account) {
    checkbox.disabled = false;
    checkbox.title = '';
    if (!preserveChoice) {
      checkbox.checked = true;
    }
  } else {
    checkbox.checked = false;
    checkbox.disabled = true;
    checkbox.title = page ? 'Page này chưa có Instagram liên kết' : 'Chọn Page trước';
  }

  if (!mode) return;
  const isDual = Boolean(account && checkbox.checked);
  mode.className = `content-plan-mode ${isDual ? 'is-dual' : 'is-facebook-only'}`;
  mode.textContent = account
    ? (isDual ? `Facebook + Instagram (@${account.username || account.id})` : `Facebook only - IG @${account.username || account.id} đang tắt`)
    : (page ? 'Facebook only - Page chưa có Instagram liên kết' : 'Chọn Page để kiểm tra Instagram liên kết');
}

function setupContentPlanPublishControls() {
  if (contentPlanControlsInitialized) return;
  contentPlanControlsInitialized = true;

  const pageSelect = document.getElementById('contentPlanPageSelect');
  const checkbox = document.getElementById('contentPlanPublishInstagram');

  pageSelect?.addEventListener('change', () => updateContentPlanPublishMode({ preserveChoice: false }));
  checkbox?.addEventListener('change', () => updateContentPlanPublishMode({ preserveChoice: true }));
}

function getContentPlanMediaMarkup(item) {
  if (!item.image_filename) {
    return `
      <div class="content-plan-post-media is-empty">
        <span>Chưa có file ảnh trong Content Plan</span>
      </div>
    `;
  }

  const mediaUrl = `/api/content-plan/${encodeURIComponent(item.id)}/media`;
  return `
    <div class="content-plan-post-media">
      <img
        src="${escapeContentPlanAttr(mediaUrl)}"
        alt="${escapeContentPlanAttr(item.image_filename)}"
        loading="lazy"
        onerror="this.closest('.content-plan-post-media').classList.add('is-error')"
      >
      <div class="content-plan-media-error">
        Không tải được ảnh từ Drive: ${escapeContentPlanText(item.image_filename)}
      </div>
    </div>
  `;
}

/**
 * Initialize Content Plan tab
 */
function initContentPlan() {
  setupContentPlanPublishControls();
  loadContentPlanItems();
  loadContentPlanPages();
  loadContentPlanInstagramAccounts();
}

/**
 * Load pages cho dropdown
 */
async function loadContentPlanPages() {
  try {
    const response = await fetch('/api/pages');
    const result = await response.json();
    contentPlanPages = result.data || [];

    const select = document.getElementById('contentPlanPageSelect');
    if (select) {
      const currentValue = select.value;
      select.innerHTML = '<option value="">-- Chọn Page --</option>';
      contentPlanPages.forEach(page => {
        const option = document.createElement('option');
        option.value = page.id;
        option.textContent = `${page.name} (${page.portfolio || 'N/A'})`;
        select.appendChild(option);
      });

      const defaultPage = contentPlanPages.find(page => page.name === DEFAULT_CONTENT_PLAN_PAGE_NAME);
      select.value = currentValue || defaultPage?.id || '';
      updateContentPlanPublishMode({ preserveChoice: false });
    }
  } catch (err) {
    console.error('Error loading pages:', err);
    setContentPlanStatus('Lỗi khi tải danh sách Page', 'error');
  }
}

async function loadContentPlanInstagramAccounts() {
  try {
    const response = await fetch('/api/instagram/accounts');
    const result = await response.json();
    contentPlanInstagramAccounts = result.data || [];
    updateContentPlanPublishMode({ preserveChoice: false });
  } catch (err) {
    console.error('Error loading Instagram accounts:', err);
    contentPlanInstagramAccounts = [];
    updateContentPlanPublishMode({ preserveChoice: true });
  }
}

/**
 * Load content plan items từ API
 */
async function loadContentPlanItems() {
  try {
    const response = await fetch('/api/content-plan');
    const result = await response.json();
    contentPlanItems = result.data || [];
    renderContentPlanTable();
  } catch (err) {
    console.error('Error loading content plan:', err);
    setContentPlanStatus('Lỗi khi tải Content Plan', 'error');
  }
}

/**
 * Render bảng content plan
 */
function renderContentPlanTable() {
  const tbody = document.querySelector('#contentPlanTable tbody');
  if (!tbody) return;

  if (contentPlanItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">Chưa có content plan nào. Click "Sync từ đầu" để đồng bộ từ Google Sheet.</td></tr>';
    return;
  }

  tbody.innerHTML = contentPlanItems.map(item => {
    const scheduledDate = formatContentPlanDate(item.scheduled_at);

    const statusBadge = renderContentPlanStatus(item.status, item);

    const channelIcon = item.channel === 'instagram' ? '📷' : '📘';
    const locked = isContentPlanLocked(item);
    const dueLabel = isContentPlanDue(item) ? 'Publish' : 'Schedule';

    return `
      <tr>
        <td>${escapeContentPlanText(item.content_code)}</td>
        <td>${channelIcon} ${escapeContentPlanText(item.channel || 'facebook')}</td>
        <td>${escapeContentPlanText(item.title || '(Không có tiêu đề)')}</td>
        <td>${escapeContentPlanText(scheduledDate)}</td>
        <td>${escapeContentPlanText(item.format || 'image')}</td>
        <td>${statusBadge}</td>
        <td>
          ${!locked ? `
            <button type="button" class="btn btn-sm btn-primary" onclick="publishContentPlanItem(${item.id}, this)" ${contentPlanPublishingIds.has(item.id) ? 'disabled' : ''}>
              ${contentPlanPublishingIds.has(item.id) ? 'Đang xử lý...' : dueLabel}
            </button>
          ` : `
            <a href="${escapeContentPlanText(item.post_url || '#')}" target="_blank" class="btn btn-sm btn-secondary">
              View Post
            </a>
          `}
          <button type="button" class="btn btn-sm btn-info" onclick="previewContentPlanItem(${item.id})">
            Preview
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Sync content plan từ Google Sheet
 */
async function syncContentPlan() {
  const btn = document.getElementById('syncContentPlanBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang sync từ đầu...';
  }

  try {
    const response = await fetch('/api/content-plan/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full: true })
    });
    const result = await response.json();

    if (response.ok) {
      setContentPlanStatus(`Sync từ đầu thành công: ${result.data.synced} bài, bỏ qua ${result.data.skipped}`, 'success');
      await loadContentPlanItems();
    } else {
      setContentPlanStatus(`Lỗi sync: ${result.error}`, 'error');
    }
  } catch (err) {
    console.error('Error syncing content plan:', err);
    setContentPlanStatus('Lỗi khi sync Content Plan', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sync từ đầu';
    }
  }
}

/**
 * Publish một content plan item
 */
async function publishContentPlanItem(id, triggerButton = null) {
  const item = contentPlanItems.find(i => i.id === id);
  if (!item) {
    setContentPlanStatus('Không tìm thấy bài viết', 'error');
    return;
  }

  if (contentPlanPublishingIds.has(id)) {
    setContentPlanStatus(`Bài ${item.content_code} đang được xử lý, vui lòng chờ kết quả.`, 'info');
    return;
  }

  // Get page selection
  const pageSelect = document.getElementById('contentPlanPageSelect');
  const pageId = pageSelect?.value;

  if (!pageId) {
    setContentPlanStatus('Vui lòng chọn Page để publish', 'error');
    return;
  }

  // Get Instagram option
  const publishInstagram = document.getElementById('contentPlanPublishInstagram')?.checked || false;
  const actionText = isContentPlanDue(item) ? 'publish' : 'schedule';
  const actionLabel = isContentPlanDue(item) ? 'publish ngay' : 'lên lịch theo thời gian trong Content Plan';
  const channelLabel = publishInstagram ? 'Facebook + Instagram' : 'Facebook only';

  if (!confirm(`Bạn có chắc muốn ${actionLabel} bài "${item.title || item.content_code}"?\n\nChế độ: ${channelLabel}`)) {
    return;
  }

  try {
    contentPlanPublishingIds.add(id);
    setContentPlanButtonLoading(triggerButton, true, actionText === 'schedule' ? 'Đang schedule...' : 'Đang publish...');
    setContentPlanStatus(`Đang gọi API /api/content-plan/${id}/publish cho ${item.content_code} (${channelLabel})...`, 'loading');

    const response = await fetch(`/api/content-plan/${id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, publishInstagram })
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok) {
      const scheduledText = result.data?.scheduled
        ? `Đã lên lịch thành công ${item.content_code}.`
        : `Publish thành công ${item.content_code}.`;
      const facebookText = result.data?.facebookPostUrl
        ? ` Facebook: ${result.data.facebookPostUrl}.`
        : '';
      const instagramText = result.data?.instagramStatus === 'scheduled'
        ? ` Instagram đã tạo job scheduler: ${result.data.dualPublishJobId}.`
        : result.data?.instagramMediaId
          ? ' Instagram đã publish.'
          : result.data?.instagramStatus === 'error'
            ? ` Instagram lỗi: ${result.data.instagramError}.`
            : '';
      setContentPlanStatus(`${scheduledText}${facebookText}${instagramText}`, result.data?.instagramStatus === 'error' ? 'error' : 'success');
      await loadContentPlanItems();
    } else {
      setContentPlanStatus(response.status === 409 ? `Đã có lịch: ${result.error}` : `Lỗi publish: ${result.error || response.statusText}`, 'error');
    }
  } catch (err) {
    console.error('Error publishing content plan item:', err);
    setContentPlanStatus(`Lỗi khi publish/schedule bài viết: ${err.message}`, 'error');
  } finally {
    contentPlanPublishingIds.delete(id);
    setContentPlanButtonLoading(triggerButton, false);
  }
}

/**
 * Preview content plan item
 */
function previewContentPlanItem(id) {
  const item = contentPlanItems.find(i => i.id === id);
  if (!item) return;

  const scheduledDate = formatContentPlanDate(item.scheduled_at);
  const pageName = getSelectedContentPlanPageName();
  const status = normalizeContentPlanStatus(item.status);
  const actionLabel = isContentPlanDue(item) ? 'Publish' : 'Schedule';
  const avatarLetter = escapeContentPlanText(pageName.slice(0, 1).toUpperCase() || 'P');
  const dualJob = item.dual_publish_job;
  const previewPageName = dualJob?.page_name || pageName;
  const previewInstagram = dualJob?.instagram_username ? `@${dualJob.instagram_username}` : '';

  const modalHtml = `
    <div id="contentPlanPreviewModal" class="modal content-plan-preview-modal" onclick="if (event.target.id === 'contentPlanPreviewModal') closeContentPlanPreview()">
      <div class="modal-content content-plan-preview-content">
        <button class="content-plan-preview-close" onclick="closeContentPlanPreview()" aria-label="Đóng preview">&times;</button>

        <div class="content-plan-preview-layout">
          <article class="content-plan-post-card">
            <header class="content-plan-post-header">
              <div class="content-plan-post-avatar">${avatarLetter}</div>
              <div class="content-plan-post-identity">
                <strong>${escapeContentPlanText(previewPageName)}</strong>
                <span>${escapeContentPlanText(scheduledDate)} · ${escapeContentPlanText(item.channel || 'facebook')}</span>
              </div>
              <span class="content-plan-post-status ${escapeContentPlanAttr(status)}">${escapeContentPlanText(status)}</span>
            </header>

            <div class="content-plan-post-copy">
              <strong>${escapeContentPlanText(item.title || item.content_code)}</strong>
              <p>${escapeContentPlanText(item.caption || '(Không có caption)')}</p>
            </div>

            ${getContentPlanMediaMarkup(item)}

            <footer class="content-plan-post-footer">
              <span>👍 Thích</span>
              <span>💬 Bình luận</span>
              <span>↗ Chia sẻ</span>
            </footer>
          </article>

          <aside class="content-plan-preview-side">
            <h3>Thông tin bài</h3>
            <dl>
              <div>
                <dt>Content code</dt>
                <dd>${escapeContentPlanText(item.content_code)}</dd>
              </div>
              <div>
                <dt>Định dạng</dt>
                <dd>${escapeContentPlanText(item.format || 'image')}</dd>
              </div>
              <div>
                <dt>File ảnh</dt>
                <dd>${escapeContentPlanText(item.image_filename || 'Chưa có')}</dd>
              </div>
              <div>
                <dt>Lịch đăng</dt>
                <dd>${escapeContentPlanText(scheduledDate)}</dd>
              </div>
              ${dualJob ? `
                <div>
                  <dt>Dual job</dt>
                  <dd>${escapeContentPlanText(dualJob.id)}</dd>
                </div>
                <div>
                  <dt>Instagram</dt>
                  <dd>${escapeContentPlanText(previewInstagram || 'N/A')}</dd>
                </div>
                <div>
                  <dt>Facebook post</dt>
                  <dd>${escapeContentPlanText(dualJob.facebook_post_id || 'N/A')}</dd>
                </div>
              ` : ''}
            </dl>
            ${item.post_url ? `<a class="content-plan-post-link" href="${escapeContentPlanAttr(item.post_url)}" target="_blank">Mở bài đã đăng</a>` : ''}
          </aside>
        </div>

        <div class="content-plan-preview-actions">
          <button type="button" class="btn btn-secondary" onclick="closeContentPlanPreview()">Đóng</button>
          ${!isContentPlanLocked(item) ? `
            <button type="button" class="btn btn-primary" onclick="closeContentPlanPreview(); publishContentPlanItem(${item.id})">
              ${escapeContentPlanText(actionLabel)}
            </button>
          ` : ''}
        </div>
          </div>
    </div>
  `;

  // Remove existing modal if any
  const existingModal = document.getElementById('contentPlanPreviewModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Close preview modal
 */
function closeContentPlanPreview() {
  const modal = document.getElementById('contentPlanPreviewModal');
  if (modal) {
    modal.remove();
  }
}

/**
 * Bulk publish tất cả pending items
 */
async function bulkPublishContentPlan() {
  const pendingItems = contentPlanItems.filter(item => !isContentPlanLocked(item) && isContentPlanDue(item));

  if (pendingItems.length === 0) {
    setContentPlanStatus('Không có bài pending nào đã tới lịch để publish', 'info');
    return;
  }

  const pageSelect = document.getElementById('contentPlanPageSelect');
  const pageId = pageSelect?.value;

  if (!pageId) {
    setContentPlanStatus('Vui lòng chọn Page để publish', 'error');
    return;
  }

  const publishInstagram = document.getElementById('contentPlanPublishInstagram')?.checked || false;
  const btn = document.getElementById('bulkPublishContentPlanBtn');
  const channelLabel = publishInstagram ? 'Facebook + Instagram' : 'Facebook only';

  if (!confirm(`Bạn có chắc muốn publish ${pendingItems.length} bài đã tới lịch?\n\nChế độ: ${channelLabel}`)) {
    return;
  }

  setContentPlanButtonLoading(btn, true, 'Đang publish...');
  setContentPlanStatus(`Đang gọi API publish cho ${pendingItems.length} bài đã tới lịch (${channelLabel})...`, 'loading');

  let successCount = 0;
  let errorCount = 0;

  try {
    for (const item of pendingItems) {
      try {
        const response = await fetch(`/api/content-plan/${item.id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId, publishInstagram })
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
    }

    setContentPlanStatus(`Publish hoàn tất: ${successCount} thành công, ${errorCount} thất bại`, successCount > 0 ? 'success' : 'error');
    await loadContentPlanItems();
  } finally {
    setContentPlanButtonLoading(btn, false);
  }
}

// Export functions
window.initContentPlan = initContentPlan;
window.syncContentPlan = syncContentPlan;
window.publishContentPlanItem = publishContentPlanItem;
window.previewContentPlanItem = previewContentPlanItem;
window.closeContentPlanPreview = closeContentPlanPreview;
window.bulkPublishContentPlan = bulkPublishContentPlan;

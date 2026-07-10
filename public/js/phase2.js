// Phase 2: Messages, Media, Real-time Features

// ========== WEBSOCKET CONNECTION ==========
let ws = null;
let wsReconnectTimer = null;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('🔌 WebSocket connected');
    updateWsStatus(true);
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWsMessage(data);
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  };
  
  ws.onclose = () => {
    console.log('🔌 WebSocket disconnected');
    updateWsStatus(false);
    // Reconnect after 5 seconds
    wsReconnectTimer = setTimeout(connectWebSocket, 5000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateWsStatus(false);
  };
}

function updateWsStatus(connected) {
  const statusEl = document.getElementById('wsStatus');
  if (statusEl) {
    statusEl.textContent = connected ? '🟢 Live' : '🔴 Offline';
    statusEl.className = connected ? 'ws-status connected' : 'ws-status disconnected';
  }
}

function handleWsMessage(data) {
  if (data.type === 'metrics_update') {
    // Update summary cards
    updateSummaryCards(data.data);
    
    // Show notification
    showNotification('📊 Metrics updated', 'success');
  }
}

function updateSummaryCards(summary) {
  const elements = {
    totalPages: summary.total_pages,
    totalFans: summary.total_fans,
    totalFollowers: summary.total_followers,
    totalPortfolios: summary.portfolios ? summary.portfolios.length : 0
  };
  
  Object.entries(elements).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el && value !== undefined) {
      el.textContent = typeof value === 'number' ? value.toLocaleString() : value;
    }
  });
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ========== MESSAGES MANAGEMENT ==========

async function loadConversations() {
  const pageId = document.getElementById('inboxPageSelect').value;
  const container = document.getElementById('conversationsList');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải conversations...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/conversations`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const conversations = data.data || [];
    
    if (conversations.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có conversations</div>';
      return;
    }
    
    let html = '<div class="conversations-list">';
    conversations.forEach(conv => {
      const unread = conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : '';
      const time = conv.updated_time ? new Date(conv.updated_time).toLocaleString('vi-VN') : '';
      
      html += `
        <div class="conversation-item" onclick="viewConversation('${conv.id}')">
          <div class="conv-header">
            <span class="conv-id">${conv.id}</span>
            ${unread}
          </div>
          <div class="conv-snippet">${conv.snippet || 'No message'}</div>
          <div class="conv-time">${time}</div>
        </div>
      `;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function viewConversation(convId) {
  const container = document.getElementById('conversationsList');
  container.innerHTML = '<div class="loading">Đang tải messages...</div>';
  
  try {
    const response = await fetch(`/api/conversations/${convId}/messages`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const messages = data.data || [];
    
    if (messages.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có messages</div>';
      return;
    }
    
    let html = '<div class="messages-list">';
    html += `<button onclick="loadConversations()" class="btn btn-secondary">← Quay lại</button>`;
    
    messages.forEach(msg => {
      const from = msg.from?.name || 'Unknown';
      const time = msg.created_time ? new Date(msg.created_time).toLocaleString('vi-VN') : '';
      const message = msg.message || '';
      
      html += `
        <div class="message-item">
          <div class="msg-header">
            <strong>${from}</strong>
            <span class="msg-time">${time}</span>
          </div>
          <div class="msg-content">${message}</div>
        </div>
      `;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function sendMessage() {
  const pageId = document.getElementById('sendMsgPageSelect').value;
  const recipientId = document.getElementById('sendMsgRecipient').value;
  const message = document.getElementById('sendMsgContent').value;
  const resultBox = document.getElementById('sendMessageResult');
  
  if (!pageId || !recipientId || !message) {
    resultBox.innerHTML = '<div class="error-state">Vui lòng điền đầy đủ thông tin</div>';
    return;
  }
  
  resultBox.innerHTML = '<div class="loading">Đang gửi...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, message })
    });
    
    const data = await response.json();
    
    if (data.error) {
      resultBox.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    resultBox.innerHTML = '<div class="success-state">✓ Đã gửi tin nhắn</div>';
    document.getElementById('sendMsgRecipient').value = '';
    document.getElementById('sendMsgContent').value = '';
  } catch (error) {
    resultBox.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadNotifications() {
  const pageId = document.getElementById('notificationsPageSelect').value;
  const container = document.getElementById('notificationsList');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải notifications...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/notifications`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const notifications = data.data || [];
    
    if (notifications.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có notifications</div>';
      return;
    }
    
    let html = '<div class="notifications-list">';
    notifications.forEach(notif => {
      const title = notif.title || 'Notification';
      const time = notif.created_time ? new Date(notif.created_time).toLocaleString('vi-VN') : '';
      
      html += `
        <div class="notification-item">
          <div class="notif-title">${title}</div>
          <div class="notif-time">${time}</div>
        </div>
      `;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

// ========== MEDIA MANAGEMENT ==========

function escapeHtmlText(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

function buildPagePostUrl(postId) {
  if (!postId || !String(postId).includes('_')) {
    return '';
  }

  const [pageId, entryId] = String(postId).split('_');
  if (!pageId || !entryId) {
    return '';
  }

  return `https://www.facebook.com/${pageId}/posts/${entryId}`;
}

async function uploadPhoto() {
  const pageId = document.getElementById('uploadPhotoPageSelect').value;
  const photoUrl = document.getElementById('uploadPhotoUrl').value;
  const caption = document.getElementById('uploadPhotoCaption').value;
  const resultBox = document.getElementById('uploadPhotoResult');
  
  if (!pageId || !photoUrl) {
    resultBox.innerHTML = '<div class="error-state">Vui lòng chọn page và nhập URL ảnh</div>';
    return;
  }
  
  resultBox.innerHTML = '<div class="loading">Đang upload...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoUrl, caption })
    });
    
    const data = await response.json();
    
    if (data.error) {
      resultBox.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }

    const postId = data.data?.post_id || data.data?.id || '';
    const photoId = data.data?.photo_id || '';
    const postUrl = data.data?.permalink_url || buildPagePostUrl(postId);
    const postLinkHtml = postUrl
      ? `<a class="publish-link" href="${postUrl}" target="_blank" rel="noopener noreferrer">Mở bài đăng trên Facebook</a>`
      : '';

    resultBox.innerHTML = `
      <div class="success-state">
        ✓ Đã tạo bài đăng ảnh trên Feed
        <div>Post ID: ${escapeHtmlText(postId || 'N/A')}</div>
        <div>Photo ID: ${escapeHtmlText(photoId || 'N/A')}</div>
        ${postLinkHtml}
      </div>
    `;
    document.getElementById('uploadPhotoUrl').value = '';
    document.getElementById('uploadPhotoCaption').value = '';
  } catch (error) {
    resultBox.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function uploadVideo() {
  const pageId = document.getElementById('uploadVideoPageSelect').value;
  const videoUrl = document.getElementById('uploadVideoUrl').value;
  const title = document.getElementById('uploadVideoTitle').value;
  const description = document.getElementById('uploadVideoDesc').value;
  const resultBox = document.getElementById('uploadVideoResult');
  
  if (!pageId || !videoUrl) {
    resultBox.innerHTML = '<div class="error-state">Vui lòng chọn page và nhập URL video</div>';
    return;
  }
  
  resultBox.innerHTML = '<div class="loading">Đang upload (có thể mất vài phút)...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, title, description })
    });
    
    const data = await response.json();
    
    if (data.error) {
      resultBox.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    resultBox.innerHTML = `<div class="success-state">✓ Đã upload video (ID: ${data.data.id || 'N/A'})</div>`;
    document.getElementById('uploadVideoUrl').value = '';
    document.getElementById('uploadVideoTitle').value = '';
    document.getElementById('uploadVideoDesc').value = '';
  } catch (error) {
    resultBox.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadAlbums() {
  const pageId = document.getElementById('albumsPageSelect').value;
  const container = document.getElementById('albumsList');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải albums...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/albums`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const albums = data.data || [];
    
    if (albums.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có albums</div>';
      return;
    }
    
    let html = '<div class="albums-grid">';
    albums.forEach(album => {
      const name = album.name || 'Unnamed Album';
      const count = album.count || 0;
      const time = album.created_time ? new Date(album.created_time).toLocaleDateString('vi-VN') : '';
      
      html += `
        <div class="album-card">
          <div class="album-name">${name}</div>
          <div class="album-info">${count} photos</div>
          <div class="album-time">${time}</div>
          <button onclick="viewAlbum('${album.id}')" class="btn btn-secondary">Xem ảnh</button>
        </div>
      `;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function viewAlbum(albumId) {
  const container = document.getElementById('albumsList');
  container.innerHTML = '<div class="loading">Đang tải photos...</div>';
  
  try {
    const response = await fetch(`/api/albums/${albumId}/photos`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const photos = data.data || [];
    
    if (photos.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có photos</div>';
      return;
    }
    
    let html = '<div class="photos-grid">';
    html += `<button onclick="loadAlbums()" class="btn btn-secondary">← Quay lại</button>`;
    
    photos.forEach(photo => {
      const src = photo.source || (photo.images && photo.images[0]?.source) || '';
      const name = photo.name || '';
      
      html += `
        <div class="photo-card">
          <img src="${src}" alt="${name}" loading="lazy">
          <div class="photo-actions">
            <button onclick="deleteMediaItem('${photo.id}')" class="btn btn-danger btn-small">Xóa</button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function deleteMedia() {
  const mediaId = document.getElementById('deleteMediaId').value;
  const resultBox = document.getElementById('deleteMediaResult');
  
  if (!mediaId) {
    resultBox.innerHTML = '<div class="error-state">Vui lòng nhập Media ID</div>';
    return;
  }
  
  if (!confirm('Bạn có chắc muốn xóa media này?')) return;
  
  resultBox.innerHTML = '<div class="loading">Đang xóa...</div>';
  
  try {
    const response = await fetch(`/api/media/${mediaId}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.error) {
      resultBox.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    resultBox.innerHTML = '<div class="success-state">✓ Đã xóa media</div>';
    document.getElementById('deleteMediaId').value = '';
  } catch (error) {
    resultBox.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

// ========== INITIALIZATION ==========

// Populate page selectors for Phase 2
function populatePhase2Selectors(pages) {
  const selectors = [
    'inboxPageSelect',
    'sendMsgPageSelect',
    'notificationsPageSelect',
    'uploadPhotoPageSelect',
    'uploadVideoPageSelect',
    'albumsPageSelect'
  ];
  
  selectors.forEach(selectorId => {
    const select = document.getElementById(selectorId);
    if (select) {
      select.innerHTML = '<option value="">-- Chọn page --</option>';
      pages.forEach(page => {
        const option = document.createElement('option');
        option.value = page.id;
        option.textContent = page.name;
        select.appendChild(option);
      });
    }
  });

}

// Populate Phase 2 selectors when app is ready
function initPhase2Selectors() {
  const checkPages = setInterval(() => {
    if (window.app?.data?.pages?.length > 0) {
      clearInterval(checkPages);
      populatePhase2Selectors(window.app.data.pages);
      console.log('✅ Phase 2 selectors populated');
    }
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => {
    clearInterval(checkPages);
    console.warn('⚠️ Phase 2 selector population timed out');
  }, 10000);
}

// Initialize WebSocket and selectors
function initPhase2() {
  connectWebSocket();
  initPhase2Selectors();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhase2);
} else {
  initPhase2();
}

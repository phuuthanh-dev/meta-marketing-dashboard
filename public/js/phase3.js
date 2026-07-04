// Phase 3: Page Management, Advanced Analytics, Automation

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ========== PAGE MANAGEMENT ==========

async function loadPageDetails() {
  const pageId = document.getElementById('pageDetailsSelect').value;
  const container = document.getElementById('pageDetailsContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải thông tin page...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/details`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const details = data.data;
    
    let html = '<div class="page-details">';
    
    // Page header
    html += '<div class="page-header">';
    if (details.cover && details.cover.source) {
      html += `<img src="${details.cover.source}" alt="Cover" class="page-cover">`;
    }
    if (details.picture && details.picture.data && details.picture.data.url) {
      html += `<img src="${details.picture.data.url}" alt="Avatar" class="page-avatar">`;
    }
    html += `<div class="page-info">
      <h3>${details.name || 'N/A'}</h3>
      <p class="page-category">${details.category || 'N/A'}</p>
      <p class="page-id">ID: ${details.id}</p>
    </div>`;
    html += '</div>';
    
    // Stats grid
    html += '<div class="stats-grid">';
    html += `<div class="stat-card">
      <div class="stat-emoji">👥</div>
      <div class="stat-label">Fans</div>
      <div class="stat-value">${(details.fan_count || 0).toLocaleString()}</div>
    </div>`;
    html += `<div class="stat-card">
      <div class="stat-emoji">❤️</div>
      <div class="stat-label">Followers</div>
      <div class="stat-value">${(details.followers_count || 0).toLocaleString()}</div>
    </div>`;
    if (details.engagement) {
      html += `<div class="stat-card">
        <div class="stat-emoji">📊</div>
        <div class="stat-label">Engagement</div>
        <div class="stat-value">${(details.engagement.count || 0).toLocaleString()}</div>
      </div>`;
    }
    html += '</div>';
    
    // Details section
    html += '<div class="details-section">';
    
    if (details.about) {
      html += `<div class="detail-item">
        <strong>About:</strong>
        <p>${details.about}</p>
      </div>`;
    }
    
    if (details.description) {
      html += `<div class="detail-item">
        <strong>Description:</strong>
        <p>${details.description}</p>
      </div>`;
    }
    
    if (details.location) {
      const loc = details.location;
      html += `<div class="detail-item">
        <strong>Location:</strong>
        <p>${loc.street || ''} ${loc.city || ''} ${loc.country || ''}</p>
      </div>`;
    }
    
    if (details.phone) {
      html += `<div class="detail-item">
        <strong>Phone:</strong>
        <p>${details.phone}</p>
      </div>`;
    }
    
    if (details.website) {
      html += `<div class="detail-item">
        <strong>Website:</strong>
        <p><a href="${details.website}" target="_blank">${details.website}</a></p>
      </div>`;
    }
    
    if (details.emails && details.emails.length > 0) {
      html += `<div class="detail-item">
        <strong>Emails:</strong>
        <p>${details.emails.join(', ')}</p>
      </div>`;
    }
    
    if (details.link) {
      html += `<div class="detail-item">
        <strong>Facebook Link:</strong>
        <p><a href="${details.link}" target="_blank">${details.link}</a></p>
      </div>`;
    }
    
    html += '</div>';
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadPageRoles() {
  const pageId = document.getElementById('pageRolesSelect').value;
  const container = document.getElementById('pageRolesContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải roles...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/roles`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const roles = data.data || [];
    
    if (roles.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có roles</div>';
      return;
    }
    
    let html = '<table class="data-table">';
    html += '<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th></tr></thead>';
    html += '<tbody>';
    
    roles.forEach(role => {
      const created = role.created_time ? new Date(role.created_time * 1000).toLocaleDateString('vi-VN') : 'N/A';
      html += `<tr>
        <td>${role.name || 'N/A'}</td>
        <td>${role.email || 'N/A'}</td>
        <td><span class="role-badge">${role.role || 'N/A'}</span></td>
        <td>${created}</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadPageSettings() {
  const pageId = document.getElementById('pageSettingsSelect').value;
  const container = document.getElementById('pageSettingsContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải settings...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/settings`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const settings = data.data || [];
    
    if (settings.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có settings</div>';
      return;
    }
    
    let html = '<div class="settings-list">';
    settings.forEach(setting => {
      html += `<div class="setting-item">
        <strong>${setting.setting || 'N/A'}:</strong>
        <span class="setting-value">${JSON.stringify(setting.value)}</span>
      </div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

// ========== ADVANCED ANALYTICS ==========

async function loadVideoInsights() {
  const pageId = document.getElementById('videoInsightsSelect').value;
  const days = document.getElementById('videoInsightsDays').value || 30;
  const container = document.getElementById('videoInsightsContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải video insights...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/video-insights?days=${days}`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    if (data.meta && data.meta.supported === false) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(data.meta.reason || 'Video insights are unavailable in the current Facebook Page API flow.')}</div>`;
      return;
    }

    const insights = data.data || [];
    
    if (insights.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có video insights</div>';
      return;
    }
    
    let html = '<div class="insights-list">';
    insights.forEach(insight => {
      html += `<div class="insight-card">
        <h4>${insight.title || insight.name || 'N/A'}</h4>`;
      
      if (insight.values && insight.values.length > 0) {
        const value = insight.values[0].value;
        html += `<div class="insight-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>`;
      }
      
      html += '</div>';
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadLifetimeStats() {
  const pageId = document.getElementById('lifetimeStatsSelect').value;
  const container = document.getElementById('lifetimeStatsContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải lifetime stats...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/lifetime`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const stats = data.data || [];
    
    if (stats.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có lifetime stats</div>';
      return;
    }
    
    let html = '<div class="stats-grid">';
    stats.forEach(stat => {
      const value = stat.values && stat.values[0] ? stat.values[0].value : 0;
      html += `<div class="stat-card">
        <div class="stat-label">${stat.title || stat.name || 'N/A'}</div>
        <div class="stat-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>
      </div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadContentPerformance() {
  const pageId = document.getElementById('contentPerformanceSelect').value;
  const days = document.getElementById('contentPerformanceDays').value || 30;
  const container = document.getElementById('contentPerformanceContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải content performance...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/content-performance?days=${days}`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    if (data.meta && data.meta.supported === false) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(data.meta.reason || 'Content performance metrics are unavailable in the current Facebook Page API flow.')}</div>`;
      return;
    }

    const performance = data.data || [];
    
    if (performance.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có content performance data</div>';
      return;
    }
    
    let html = '<div class="insights-list">';
    performance.forEach(item => {
      html += `<div class="insight-card">
        <h4>${item.title || item.name || 'N/A'}</h4>`;
      
      if (item.values && item.values.length > 0) {
        const value = item.values[0].value;
        html += `<div class="insight-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>`;
      }
      
      html += '</div>';
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadEngagementByType() {
  const pageId = document.getElementById('engagementByTypeSelect').value;
  const days = document.getElementById('engagementByTypeDays').value || 30;
  const container = document.getElementById('engagementByTypeContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải engagement by type...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/engagement-by-type?days=${days}`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    if (data.meta && data.meta.supported === false) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(data.meta.reason || 'Engagement by type metrics are unavailable in the current Facebook Page API flow.')}</div>`;
      return;
    }

    const engagement = data.data || [];
    
    if (engagement.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có engagement data</div>';
      return;
    }
    
    let html = '<div class="insights-list">';
    engagement.forEach(item => {
      html += `<div class="insight-card">
        <h4>${item.title || item.name || 'N/A'}</h4>`;
      
      if (item.values && item.values.length > 0) {
        const value = item.values[0].value;
        html += `<div class="insight-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>`;
      }
      
      html += '</div>';
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

// ========== AUTOMATION ==========

async function loadMilestones() {
  const pageId = document.getElementById('milestonesSelect').value;
  const container = document.getElementById('milestonesContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải milestones...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/milestones`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const milestones = data.data || [];
    
    if (milestones.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có milestones</div>';
      return;
    }
    
    let html = '<div class="milestones-list">';
    milestones.forEach(milestone => {
      const created = milestone.created_time ? new Date(milestone.created_time * 1000).toLocaleDateString('vi-VN') : 'N/A';
      html += `<div class="milestone-card">
        <h4>${milestone.title || 'N/A'}</h4>
        <p>${milestone.description || 'No description'}</p>
        <div class="milestone-time">Created: ${created}</div>
      </div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function createMilestone() {
  const pageId = document.getElementById('createMilestoneSelect').value;
  const title = document.getElementById('milestoneTitle').value;
  const description = document.getElementById('milestoneDescription').value;
  const time = document.getElementById('milestoneTime').value;
  const resultBox = document.getElementById('createMilestoneResult');
  
  if (!pageId || !title || !time) {
    resultBox.innerHTML = '<div class="error-state">Vui lòng điền đầy đủ thông tin</div>';
    return;
  }
  
  resultBox.innerHTML = '<div class="loading">Đang tạo milestone...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, time })
    });
    
    const data = await response.json();
    
    if (data.error) {
      resultBox.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    resultBox.innerHTML = '<div class="success-state">✓ Đã tạo milestone thành công!</div>';
    document.getElementById('milestoneTitle').value = '';
    document.getElementById('milestoneDescription').value = '';
    document.getElementById('milestoneTime').value = '';
    
    // Reload milestones
    loadMilestones();
  } catch (error) {
    resultBox.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadOffers() {
  const pageId = document.getElementById('offersSelect').value;
  const container = document.getElementById('offersContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải offers...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/offers`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const offers = data.data || [];
    
    if (offers.length === 0) {
      container.innerHTML = '<div class="empty-state">Không có offers</div>';
      return;
    }
    
    let html = '<div class="offers-list">';
    offers.forEach(offer => {
      const expiration = offer.expiration_time ? new Date(offer.expiration_time * 1000).toLocaleDateString('vi-VN') : 'N/A';
      html += `<div class="offer-card">
        <h4>${offer.title || 'N/A'}</h4>
        <p>${offer.description || 'No description'}</p>
        <div class="offer-expiration">Expires: ${expiration}</div>
        ${offer.redemption_code ? `<div class="offer-code">Code: ${offer.redemption_code}</div>` : ''}
        ${offer.redemption_link ? `<a href="${offer.redemption_link}" target="_blank" class="offer-link">Redeem</a>` : ''}
      </div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function createOffer() {
  const pageId = document.getElementById('createOfferSelect').value;
  const title = document.getElementById('offerTitle').value;
  const description = document.getElementById('offerDescription').value;
  const expirationTime = document.getElementById('offerExpiration').value;
  const resultBox = document.getElementById('createOfferResult');
  
  if (!pageId || !title || !expirationTime) {
    resultBox.innerHTML = '<div class="error-state">Vui lòng điền đầy đủ thông tin</div>';
    return;
  }
  
  resultBox.innerHTML = '<div class="loading">Đang tạo offer...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, expirationTime })
    });
    
    const data = await response.json();
    
    if (data.error) {
      resultBox.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    resultBox.innerHTML = '<div class="success-state">✓ Đã tạo offer thành công!</div>';
    document.getElementById('offerTitle').value = '';
    document.getElementById('offerDescription').value = '';
    document.getElementById('offerExpiration').value = '';
    
    // Reload offers
    loadOffers();
  } catch (error) {
    resultBox.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function loadAutoReply() {
  const pageId = document.getElementById('autoReplySelect').value;
  const container = document.getElementById('autoReplyContainer');
  
  if (!pageId) {
    container.innerHTML = '<div class="empty-state">Vui lòng chọn page</div>';
    return;
  }
  
  container.innerHTML = '<div class="loading">Đang tải auto-reply settings...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/auto-reply`);
    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    const rules = data.data;
    
    if (!rules) {
      container.innerHTML = '<div class="empty-state">Không có auto-reply settings</div>';
      return;
    }
    
    let html = '<div class="auto-reply-settings">';
    html += `<pre>${JSON.stringify(rules, null, 2)}</pre>`;
    html += '</div>';
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

async function setInstantReply() {
  const pageId = document.getElementById('instantReplySelect').value;
  const message = document.getElementById('instantReplyMessage').value;
  const resultBox = document.getElementById('setInstantReplyResult');
  
  if (!pageId || !message) {
    resultBox.innerHTML = '<div class="error-state">Vui lòng điền đầy đủ thông tin</div>';
    return;
  }
  
  resultBox.innerHTML = '<div class="loading">Đang cài đặt instant reply...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/auto-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    
    const data = await response.json();
    
    if (data.error) {
      resultBox.innerHTML = `<div class="error-state">Lỗi: ${data.error}</div>`;
      return;
    }
    
    resultBox.innerHTML = '<div class="success-state">✓ Đã cài đặt instant reply thành công!</div>';
    document.getElementById('instantReplyMessage').value = '';
  } catch (error) {
    resultBox.innerHTML = `<div class="error-state">Lỗi: ${error.message}</div>`;
  }
}

// ========== INITIALIZATION ==========

// Populate Phase 3 selectors
function populatePhase3Selectors(pages) {
  const selectors = [
    'pageDetailsSelect',
    'pageRolesSelect',
    'pageSettingsSelect',
    'videoInsightsSelect',
    'lifetimeStatsSelect',
    'contentPerformanceSelect',
    'engagementByTypeSelect',
    'milestonesSelect',
    'createMilestoneSelect',
    'offersSelect',
    'createOfferSelect',
    'autoReplySelect',
    'instantReplySelect'
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

// Initialize Phase 3 selectors
function initPhase3Selectors() {
  const checkPages = setInterval(() => {
    if (window.app?.data?.pages?.length > 0) {
      clearInterval(checkPages);
      populatePhase3Selectors(window.app.data.pages);
      console.log('✅ Phase 3 selectors populated');
    }
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => {
    clearInterval(checkPages);
    console.warn('⚠️ Phase 3 selector population timed out');
  }, 10000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhase3Selectors);
} else {
  initPhase3Selectors();
}

// Phase 1: Post Management, Comments, Audience Insights

// Populate page selectors when pages are loaded
function populatePageSelectors(pages) {
  const selectors = ['postPageSelect', 'scheduledPageSelect', 'audiencePageSelect', 'reachPageSelect'];
  
  selectors.forEach(selectorId => {
    const select = document.getElementById(selectorId);
    if (!select) return;
    
    // Keep first option
    select.innerHTML = '<option value="">-- Chọn page --</option>';
    
    pages.forEach(page => {
      const option = document.createElement('option');
      option.value = page.id;
      option.textContent = `${page.name} (${page.fan_count || 0} fans)`;
      select.appendChild(option);
    });
  });
}

// ========== POST MANAGEMENT ==========

// Create Post Form Handler
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('createPostForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const pageId = document.getElementById('postPageSelect').value;
      const message = document.getElementById('postMessage').value;
      const schedule = document.getElementById('schedulePost').checked;
      const scheduleTime = document.getElementById('scheduleTime').value;
      const resultBox = document.getElementById('createPostResult');
      
      if (!pageId || !message) {
        resultBox.innerHTML = '<div class="error">Vui lòng chọn page và nhập nội dung</div>';
        return;
      }
      
      resultBox.innerHTML = '<div class="loading">Đang đăng bài...</div>';
      
      try {
        let response;
        if (schedule && scheduleTime) {
          // Schedule post
          response = await fetch(`/api/pages/${pageId}/posts/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, scheduledTime: new Date(scheduleTime).toISOString() })
          });
        } else {
          // Create post immediately
          response = await fetch(`/api/pages/${pageId}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
          });
        }
        
        const result = await response.json();
        
        if (result.error) {
          resultBox.innerHTML = `<div class="error">Lỗi: ${result.error}</div>`;
        } else {
          resultBox.innerHTML = `<div class="success">✅ Đăng bài thành công! Post ID: ${result.data.id}</div>`;
          form.reset();
        }
      } catch (error) {
        resultBox.innerHTML = `<div class="error">Lỗi: ${error.message}</div>`;
      }
    });
  }
  
  // Schedule checkbox toggle
  const scheduleCheckbox = document.getElementById('schedulePost');
  const scheduleTimeGroup = document.getElementById('scheduleTimeGroup');
  if (scheduleCheckbox && scheduleTimeGroup) {
    scheduleCheckbox.addEventListener('change', (e) => {
      scheduleTimeGroup.style.display = e.target.checked ? 'block' : 'none';
    });
  }
});

// Load Scheduled Posts
async function loadScheduledPosts() {
  const pageId = document.getElementById('scheduledPageSelect').value;
  const listBox = document.getElementById('scheduledPostsList');
  
  if (!pageId) {
    listBox.innerHTML = '<div class="error">Vui lòng chọn page</div>';
    return;
  }
  
  listBox.innerHTML = '<div class="loading">Đang tải...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/posts/scheduled`);
    const result = await response.json();
    
    if (result.error) {
      listBox.innerHTML = `<div class="error">Lỗi: ${result.error}</div>`;
      return;
    }
    
    const posts = result.data || [];
    
    if (posts.length === 0) {
      listBox.innerHTML = '<div class="empty">Không có scheduled posts</div>';
      return;
    }
    
    let html = '<table class="data-table"><thead><tr><th>Post ID</th><th>Nội dung</th><th>Thời gian đăng</th></tr></thead><tbody>';
    
    posts.forEach(post => {
      const scheduledTime = post.scheduled_publish_time 
        ? new Date(post.scheduled_publish_time * 1000).toLocaleString('vi-VN')
        : 'N/A';
      const message = (post.message || '').substring(0, 100) + (post.message?.length > 100 ? '...' : '');
      
      html += `<tr>
        <td>${post.id}</td>
        <td>${escapeHtml(message)}</td>
        <td>${scheduledTime}</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
    listBox.innerHTML = html;
  } catch (error) {
    listBox.innerHTML = `<div class="error">Lỗi: ${error.message}</div>`;
  }
}

// Delete Post
async function deletePost() {
  const postId = document.getElementById('deletePostId').value;
  const resultBox = document.getElementById('deletePostResult');
  
  if (!postId) {
    resultBox.innerHTML = '<div class="error">Vui lòng nhập Post ID</div>';
    return;
  }
  
  if (!confirm('Bạn có chắc muốn xóa post này?')) return;
  
  resultBox.innerHTML = '<div class="loading">Đang xóa...</div>';
  
  try {
    const response = await fetch(`/api/posts/${postId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.error) {
      resultBox.innerHTML = `<div class="error">Lỗi: ${result.error}</div>`;
    } else {
      resultBox.innerHTML = '<div class="success">✅ Đã xóa post thành công!</div>';
      document.getElementById('deletePostId').value = '';
    }
  } catch (error) {
    resultBox.innerHTML = `<div class="error">Lỗi: ${error.message}</div>`;
  }
}

// ========== COMMENTS MANAGEMENT ==========

// Load Comments
async function loadComments() {
  const postId = document.getElementById('commentsPostId').value;
  const listBox = document.getElementById('commentsList');
  
  if (!postId) {
    listBox.innerHTML = '<div class="error">Vui lòng nhập Post ID</div>';
    return;
  }
  
  listBox.innerHTML = '<div class="loading">Đang tải comments...</div>';
  
  try {
    const response = await fetch(`/api/posts/${postId}/comments?limit=50`);
    const result = await response.json();
    
    if (result.error) {
      listBox.innerHTML = `<div class="error">Lỗi: ${result.error}</div>`;
      return;
    }
    
    const comments = result.data || [];
    
    if (comments.length === 0) {
      listBox.innerHTML = '<div class="empty">Không có comments</div>';
      return;
    }
    
    let html = '<div class="comments-list">';
    
    comments.forEach(comment => {
      const time = comment.created_time 
        ? new Date(comment.created_time).toLocaleString('vi-VN')
        : 'N/A';
      const from = comment.from?.name || 'Anonymous';
      const message = comment.message || '';
      
      html += `<div class="comment-item">
        <div class="comment-header">
          <strong>${escapeHtml(from)}</strong>
          <span class="comment-time">${time}</span>
        </div>
        <div class="comment-body">${escapeHtml(message)}</div>
        <div class="comment-actions">
          <span>ID: ${comment.id}</span>
          <span>👍 ${comment.like_count || 0}</span>
          <button onclick="document.getElementById('replyCommentId').value='${comment.id}'" class="btn-small">Reply</button>
        </div>
      </div>`;
    });
    
    html += '</div>';
    listBox.innerHTML = html;
  } catch (error) {
    listBox.innerHTML = `<div class="error">Lỗi: ${error.message}</div>`;
  }
}

// Reply to Comment
async function replyToComment() {
  const commentId = document.getElementById('replyCommentId').value;
  const message = document.getElementById('replyMessage').value;
  const resultBox = document.getElementById('replyResult');
  
  if (!commentId || !message) {
    resultBox.innerHTML = '<div class="error">Vui lòng nhập Comment ID và nội dung reply</div>';
    return;
  }
  
  resultBox.innerHTML = '<div class="loading">Đang reply...</div>';
  
  try {
    const response = await fetch(`/api/comments/${commentId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    
    const result = await response.json();
    
    if (result.error) {
      resultBox.innerHTML = `<div class="error">Lỗi: ${result.error}</div>`;
    } else {
      resultBox.innerHTML = `<div class="success">✅ Reply thành công! Reply ID: ${result.data.id}</div>`;
      document.getElementById('replyCommentId').value = '';
      document.getElementById('replyMessage').value = '';
    }
  } catch (error) {
    resultBox.innerHTML = `<div class="error">Lỗi: ${error.message}</div>`;
  }
}

// Hide Comment
async function hideComment() {
  const commentId = document.getElementById('moderateCommentId').value;
  const resultBox = document.getElementById('moderateResult');
  
  if (!commentId) {
    resultBox.innerHTML = '<div class="error">Vui lòng nhập Comment ID</div>';
    return;
  }
  
  resultBox.innerHTML = '<div class="loading">Đang ẩn comment...</div>';
  
  try {
    const response = await fetch(`/api/comments/${commentId}/hide`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.error) {
      resultBox.innerHTML = `<div class="error">Lỗi: ${result.error}</div>`;
    } else {
      resultBox.innerHTML = '<div class="success">✅ Đã ẩn comment!</div>';
      document.getElementById('moderateCommentId').value = '';
    }
  } catch (error) {
    resultBox.innerHTML = `<div class="error">Lỗi: ${error.message}</div>`;
  }
}

// Delete Comment
async function deleteComment() {
  const commentId = document.getElementById('moderateCommentId').value;
  const resultBox = document.getElementById('moderateResult');
  
  if (!commentId) {
    resultBox.innerHTML = '<div class="error">Vui lòng nhập Comment ID</div>';
    return;
  }
  
  if (!confirm('Bạn có chắc muốn xóa comment này?')) return;
  
  resultBox.innerHTML = '<div class="loading">Đang xóa comment...</div>';
  
  try {
    const response = await fetch(`/api/comments/${commentId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.error) {
      resultBox.innerHTML = `<div class="error">Lỗi: ${result.error}</div>`;
    } else {
      resultBox.innerHTML = '<div class="success">✅ Đã xóa comment!</div>';
      document.getElementById('moderateCommentId').value = '';
    }
  } catch (error) {
    resultBox.innerHTML = `<div class="error">Lỗi: ${error.message}</div>`;
  }
}

// ========== AUDIENCE INSIGHTS ==========

function renderStaticMessage(canvasId, title, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#94a3b8';
  context.textAlign = 'center';
  context.font = '600 16px Roboto';
  context.fillText(title, canvas.width / 2, canvas.height / 2 - 10);
  context.font = '14px Roboto';
  context.fillText((message || '').slice(0, 140), canvas.width / 2, canvas.height / 2 + 18);
}

function renderAudienceInfoBox(title, message, recommendation = '') {
  return `
    <div class="info-box">
      <strong>${escapeHtml(title)}</strong><br>
      ${escapeHtml(message || '')}
      ${recommendation ? `<br><br><em>${escapeHtml(recommendation)}</em>` : ''}
    </div>
  `;
}

// Load Audience Demographics
async function loadAudience() {
  const pageId = document.getElementById('audiencePageSelect').value;
  const dataBox = document.getElementById('audienceData');
  
  if (!pageId) {
    dataBox.innerHTML = '<div class="error">Vui lòng chọn page</div>';
    return;
  }
  
  dataBox.innerHTML = '<div class="loading">Đang tải dữ liệu audience...</div>';
  
  try {
    const response = await fetch(`/api/pages/${pageId}/audience`);
    const result = await response.json();
    
    if (result.error) {
      dataBox.innerHTML = `<div class="error">Lỗi: ${result.error}</div>`;
      return;
    }
    
    if (result.meta && result.meta.supported === false) {
      dataBox.innerHTML = renderAudienceInfoBox(
        'Audience demographics unavailable',
        result.meta.reason || 'This audience view is not supported for the current Facebook Page API flow.',
        result.meta.recommendation || ''
      );
      return;
    }

    const insights = result.data || [];
    
    if (insights.length === 0) {
      dataBox.innerHTML = '<div class="empty">Không có dữ liệu audience</div>';
      return;
    }
    
    let html = '<div class="audience-insights">';
    
    insights.forEach(insight => {
      html += `<div class="insight-card">
        <h4>${insight.title || insight.name}</h4>
        <div class="insight-values">`;
      
      if (insight.values && insight.values.length > 0) {
        const value = insight.values[0].value;
        
        if (typeof value === 'object') {
          // Demographics data
          Object.entries(value).forEach(([key, val]) => {
            html += `<div class="demographic-item">
              <span class="demo-label">${key}</span>
              <span class="demo-value">${typeof val === 'number' ? val.toLocaleString() : val}</span>
            </div>`;
          });
        } else {
          html += `<div class="simple-value">${value}</div>`;
        }
      }
      
      html += '</div></div>';
    });
    
    html += '</div>';
    dataBox.innerHTML = html;
  } catch (error) {
    dataBox.innerHTML = `<div class="error">Lỗi: ${error.message}</div>`;
  }
}

// Load Reach & Engagement Data
async function loadReachData() {
  renderStaticMessage(
    'reachChart',
    'Reach unavailable',
    'Facebook Page reach/impressions metrics used by the legacy dashboard are unsupported in the current API flow.'
  );
  renderStaticMessage(
    'engagementRateChart',
    'Engagement rate unavailable',
    'Reach-based engagement rate is locked because the required Page metrics are deprecated or invalid in the tested Meta flow.'
  );
  return;

  const pageId = document.getElementById('reachPageSelect').value;
  const days = document.getElementById('reachDays').value || 30;
  
  if (!pageId) {
    alert('Vui lòng chọn page');
    return;
  }
  
  try {
    // Load reach data
    const reachResponse = await fetch(`/api/pages/${pageId}/reach?days=${days}`);
    const reachResult = await reachResponse.json();
    
    if (reachResult.error) {
      alert('Lỗi: ' + reachResult.error);
      return;
    }
    
    if (reachResult.meta && reachResult.meta.supported === false) {
      alert(reachResult.meta.reason || 'Reach metrics are unavailable in the current Facebook Page API flow.');
      return;
    }

    const reachData = reachResult.data || [];
    
    // Load engagement rate data
    const engResponse = await fetch(`/api/pages/${pageId}/engagement-rate?days=${days}`);
    const engResult = await engResponse.json();
    
    if (engResult.error) {
      alert('Lỗi: ' + engResult.error);
      return;
    }
    
    if (engResult.meta && engResult.meta.supported === false) {
      alert(engResult.meta.reason || 'Engagement rate metrics are unavailable in the current Facebook Page API flow.');
      return;
    }

    const engData = engResult.data || [];
    
    // Render reach chart
    if (reachData.length > 0) {
      const labels = [];
      const impressions = [];
      const organic = [];
      const paid = [];
      
      reachData.forEach(insight => {
        if (insight.name === 'page_impressions' && insight.values) {
          insight.values.forEach(v => {
            labels.push(new Date(v.end_time).toLocaleDateString('vi-VN'));
            impressions.push(v.value);
          });
        } else if (insight.name === 'page_impressions_organic' && insight.values) {
          insight.values.forEach(v => organic.push(v.value));
        } else if (insight.name === 'page_impressions_paid' && insight.values) {
          insight.values.forEach(v => paid.push(v.value));
        }
      });
      
      charts.createLineChart('reachChart', labels, [
        { label: 'Total Impressions', data: impressions, borderColor: '#1877f2', tension: 0.3 },
        { label: 'Organic', data: organic, borderColor: '#42b72a', tension: 0.3 },
        { label: 'Paid', data: paid, borderColor: '#f57c00', tension: 0.3 }
      ]);
    }
    
    // Render engagement rate chart
    if (engData.length > 0) {
      const labels = [];
      const engagedUsers = [];
      const impressions = [];
      const rates = [];
      
      let engagedMap = {};
      let impressionsMap = {};
      
      engData.forEach(insight => {
        if (insight.name === 'page_engaged_users' && insight.values) {
          insight.values.forEach(v => {
            const date = new Date(v.end_time).toLocaleDateString('vi-VN');
            engagedMap[date] = v.value;
          });
        } else if (insight.name === 'page_impressions' && insight.values) {
          insight.values.forEach(v => {
            const date = new Date(v.end_time).toLocaleDateString('vi-VN');
            impressionsMap[date] = v.value;
          });
        }
      });
      
      Object.keys(engagedMap).forEach(date => {
        labels.push(date);
        const engaged = engagedMap[date] || 0;
        const impressions = impressionsMap[date] || 1;
        engagedUsers.push(engaged);
        rates.push(((engaged / impressions) * 100).toFixed(2));
      });
      
      charts.createLineChart('engagementRateChart', labels, [
        { label: 'Engaged Users', data: engagedUsers, borderColor: '#1877f2', yAxisID: 'y', tension: 0.3 },
        { label: 'Engagement Rate (%)', data: rates, borderColor: '#e91e63', yAxisID: 'y1', tension: 0.3 }
      ], {
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: 'Users' } },
          y1: { type: 'linear', position: 'right', title: { display: true, text: 'Rate (%)' }, grid: { drawOnChartArea: false } }
        }
      });
    }
  } catch (error) {
    alert('Lỗi: ' + error.message);
  }
}

// Utility: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Populate selectors when app is ready
function initPhase1Selectors() {
  const checkPages = setInterval(() => {
    if (window.app?.data?.pages?.length > 0) {
      clearInterval(checkPages);
      populatePageSelectors(window.app.data.pages);
      console.log('✅ Phase 1 selectors populated');
    }
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => {
    clearInterval(checkPages);
    console.warn('⚠️ Phase 1 selector population timed out');
  }, 10000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhase1Selectors);
} else {
  initPhase1Selectors();
}

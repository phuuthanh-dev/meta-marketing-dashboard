(function () {
  const state = {
    accounts: [],
    selectedAccountId: '',
    insights: [],
    insightTrend: [],
    media: [],
    mediaRanking: [],
    demographicsSummary: [],
    demographicsMeta: null,
    selectedMediaType: 'ALL',
    selectedRankingMetric: 'total_interactions'
  };

  function formatNumber(value) {
    const numeric = Number(value) || 0;
    return numeric.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  }

  function formatPct(value) {
    return Number(value || 0).toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function setStatus(html, cssClass = '') {
    const box = document.getElementById('instagramStatusBox');
    if (!box) return;
    box.className = `result-box ${cssClass}`.trim();
    box.innerHTML = html;
  }

  function getSelectedDays() {
    return document.getElementById('instagramDaysSelect')?.value || '30';
  }

  function getSelectedAccountId() {
    return document.getElementById('instagramAccountSelect')?.value || '';
  }

  function normalizeInstagramReason(reason = '') {
    const text = String(reason || '');
    const lower = text.toLowerCase();

    if (!text) {
      return 'Meta chưa trả đủ follower demographics khả dụng cho account này.';
    }

    if (lower.includes('not enough followers') || lower.includes('insufficient followers')) {
      return 'Account này chưa đủ follower để Meta mở demographics.';
    }

    if (lower.includes('permission') || lower.includes('access token')) {
      return 'Token hiện tại chưa đủ quyền để đọc demographics cho account này.';
    }

    if (lower.includes('unsupported')) {
      return 'Meta hiện chưa hỗ trợ demographics cho account này hoặc loại account này.';
    }

    return text;
  }

  function updateContextBar(account, days) {
    const box = document.getElementById('instagramContextBar');
    const supportBox = document.getElementById('instagramSupportBox');
    const coverageBox = document.getElementById('instagramCoverageBox');
    if (!box) return;

    if (!account) {
      box.innerHTML = '<span class="ads-context-empty">Chưa chọn Instagram account.</span>';
      if (supportBox) {
        supportBox.innerHTML = 'Instagram account-level, media insights và demographics sẽ được hiện theo khả năng Meta trả dữ liệu cho từng account.';
      }
      if (coverageBox) {
        coverageBox.innerHTML = 'Coverage sẽ hiện sau khi tải dữ liệu Instagram.';
      }
      return;
    }

    box.innerHTML = `
      <span class="ads-context-pill"><strong>IG:</strong> ${escapeHtml(account.username || account.id)}</span>
      <span class="ads-context-pill"><strong>Page:</strong> ${escapeHtml(account.page_name || '-')}</span>
      <span class="ads-context-pill"><strong>Portfolio:</strong> ${escapeHtml(account.portfolio || '-')}</span>
      <span class="ads-context-pill"><strong>Followers:</strong> ${formatNumber(account.followers_count || 0)}</span>
      <span class="ads-context-pill scope"><strong>Scope:</strong> ${escapeHtml(String(days))} ngay</span>
    `;

    if (supportBox) {
      supportBox.innerHTML = `
        <strong>Account-level:</strong> Reach trend là day-series Meta trả về từ snapshot mới nhất.<br>
        <strong>Media-level:</strong> Ranking và format mix được tính trên local media inventory và media insight snapshots hiện có.
      `;
    }
  }

  function renderCoverage(account, trend, media, demographicsMeta) {
    const box = document.getElementById('instagramCoverageBox');
    if (!box) return;

    if (!account) {
      box.innerHTML = 'Coverage sẽ hiện sau khi tải dữ liệu Instagram.';
      return;
    }

    const profileMediaCount = Number(account.media_count || 0);
    const loadedMediaCount = Array.isArray(media) ? media.length : 0;
    const mediaWithInsights = (media || []).filter(item => item.insights_snapshot?.supported === true).length;
    const trendDays = Array.isArray(trend) ? trend.length : 0;
    const demographicsState = demographicsMeta?.supported
      ? 'usable'
      : (demographicsMeta?.reason ? normalizeInstagramReason(demographicsMeta.reason) : 'Meta-limited');

    box.innerHTML = `
      <strong>Coverage:</strong>
      Trend ${formatNumber(trendDays)} ngay;
      Media inventory ${formatNumber(loadedMediaCount)}/${formatNumber(profileMediaCount)} item;
      Media insights ${formatNumber(mediaWithInsights)}/${formatNumber(loadedMediaCount)} item;
      Demographics ${escapeHtml(String(demographicsState))}.
    `;
  }

  function setSummaryCards(account, latestInsight) {
    document.getElementById('instagramFollowersValue').textContent = account ? formatNumber(account.followers_count) : '-';
    document.getElementById('instagramFollowsValue').textContent = account ? formatNumber(account.follows_count) : '-';
    document.getElementById('instagramMediaCountValue').textContent = account ? formatNumber(account.media_count) : '-';
    document.getElementById('instagramReachValue').textContent = latestInsight ? formatNumber(latestInsight.reach) : '-';
    document.getElementById('instagramProfileViewsValue').textContent = latestInsight ? formatNumber(latestInsight.profile_views) : '-';
    document.getElementById('instagramAccountsEngagedValue').textContent = latestInsight ? formatNumber(latestInsight.accounts_engaged) : '-';
    document.getElementById('instagramInteractionsValue').textContent = latestInsight ? formatNumber(latestInsight.total_interactions) : '-';
  }

  function buildMediaFormatRows(media) {
    const rows = (media || []).reduce((acc, item) => {
      const key = item.media_product_type || item.media_type || 'UNKNOWN';
      if (!acc.has(key)) {
        acc.set(key, { key, count: 0 });
      }
      acc.get(key).count += 1;
      return acc;
    }, new Map());

    return Array.from(rows.values()).sort((a, b) => b.count - a.count);
  }

  function setChartCardState(cardId, badgeId, options = {}) {
    const card = document.getElementById(cardId);
    const badge = document.getElementById(badgeId);
    if (!card || !badge) return;

    const hidden = Boolean(options.hidden);
    card.classList.toggle('chart-card-hidden', hidden);

    badge.textContent = options.label || 'Local DB';
    badge.className = `chart-badge ${options.badgeClass || 'chart-badge-local'}`;
  }

  function renderInsightsCharts(trend, snapshots, mediaRanking, media) {
    if (!trend || trend.length === 0) {
      charts.destroyChart('instagramReachTrendChart');
      setChartCardState('instagramReachTrendCard', 'instagramReachTrendBadge', {
        hidden: true,
        label: 'No trend',
        badgeClass: 'chart-badge-unsupported'
      });
    } else {
      setChartCardState('instagramReachTrendCard', 'instagramReachTrendBadge', {
        hidden: false,
        label: 'Day-series',
        badgeClass: 'chart-badge-local'
      });
      const labels = trend.map(item => charts.formatDate(item.date));
      charts.createLineChart('instagramReachTrendChart', labels, [
        {
          label: 'Reach',
          data: trend.map(item => Number(item.reach || 0)),
          borderColor: charts.colors.orange,
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Follower Count',
          data: trend.map(item => Number(item.follower_count || 0)),
          borderColor: charts.colors.purple,
          tension: 0.3
        }
      ]);
    }

    if (!snapshots || snapshots.length === 0) {
      charts.destroyChart('instagramAccountTrendChart');
      setChartCardState('instagramAccountTrendCard', 'instagramAccountTrendBadge', {
        hidden: true,
        label: 'No snapshot',
        badgeClass: 'chart-badge-unsupported'
      });
    } else if (snapshots.length === 1) {
      setChartCardState('instagramAccountTrendCard', 'instagramAccountTrendBadge', {
        hidden: false,
        label: '1 snapshot',
        badgeClass: 'chart-badge-cross'
      });
      const point = snapshots[0];
      charts.createBarChart('instagramAccountTrendChart', ['Current Snapshot'], [
        {
          label: 'Profile Views',
          data: [Number(point.profile_views || 0)],
          backgroundColor: charts.colors.blue,
          borderRadius: 6
        },
        {
          label: 'Accounts Engaged',
          data: [Number(point.accounts_engaged || 0)],
          backgroundColor: charts.colors.green,
          borderRadius: 6
        },
        {
          label: 'Total Interactions',
          data: [Number(point.total_interactions || 0)],
          backgroundColor: charts.colors.pink,
          borderRadius: 6
        }
      ]);
    } else {
      setChartCardState('instagramAccountTrendCard', 'instagramAccountTrendBadge', {
        hidden: false,
        label: 'Snapshot trend',
        badgeClass: 'chart-badge-local'
      });
      const labels = snapshots.map(item => charts.formatDate(item.snapshot_date || item.date));
      charts.createLineChart('instagramAccountTrendChart', labels, [
        {
          label: 'Profile Views',
          data: snapshots.map(item => Number(item.profile_views || 0)),
          borderColor: charts.colors.blue,
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          tension: 0.3
        },
        {
          label: 'Accounts Engaged',
          data: snapshots.map(item => Number(item.accounts_engaged || 0)),
          borderColor: charts.colors.green,
          tension: 0.3
        },
        {
          label: 'Total Interactions',
          data: snapshots.map(item => Number(item.total_interactions || 0)),
          borderColor: charts.colors.pink,
          tension: 0.3
        }
      ]);
    }

    if (!mediaRanking || mediaRanking.length === 0) {
      charts.destroyChart('instagramTopMediaChart');
      setChartCardState('instagramTopMediaCard', 'instagramTopMediaBadge', {
        hidden: true,
        label: 'No media',
        badgeClass: 'chart-badge-unsupported'
      });
    } else {
      setChartCardState('instagramTopMediaCard', 'instagramTopMediaBadge', {
        hidden: false,
        label: state.selectedRankingMetric === 'total_interactions' ? 'Interactions' : state.selectedRankingMetric,
        badgeClass: 'chart-badge-local'
      });
      charts.createBarChart('instagramTopMediaChart', mediaRanking.map(item => {
        const label = item.caption || item.id;
        return label.length > 18 ? `${label.slice(0, 18)}...` : label;
      }), [
        {
          label: 'Ranking Score',
          data: mediaRanking.map(item => Number(item.ranking_score || 0)),
          backgroundColor: charts.colors.pink,
          borderRadius: 4
        }
      ], {
        indexAxis: 'y'
      });
    }

    const formatRows = buildMediaFormatRows(media);
    if (formatRows.length === 0) {
      charts.destroyChart('instagramMediaFormatChart');
      setChartCardState('instagramMediaFormatCard', 'instagramMediaFormatBadge', {
        hidden: true,
        label: 'No media',
        badgeClass: 'chart-badge-unsupported'
      });
      return;
    }

    setChartCardState('instagramMediaFormatCard', 'instagramMediaFormatBadge', {
      hidden: false,
      label: `${formatRows.length} formats`,
      badgeClass: 'chart-badge-local'
    });

    charts.createPieChart(
      'instagramMediaFormatChart',
      formatRows.map(item => item.key),
      formatRows.map(item => item.count)
    );
  }

  function renderDemographics(meta, groups) {
    const box = document.getElementById('instagramDemographicsBox');
    if (!box) return;

    if (!meta || meta.supported === false || !Array.isArray(groups) || groups.length === 0) {
      setChartCardState('instagramDemographicsCard', 'instagramDemographicsBadge', {
        hidden: false,
        label: 'Meta-limited',
        badgeClass: 'chart-badge-unsupported'
      });
      box.innerHTML = `
        <div class="info-box">
          <strong>Demographics snapshot unavailable</strong><br>
          ${escapeHtml(normalizeInstagramReason(meta?.reason || ''))}
          ${meta?.snapshot_date ? `<br><span class="ig-note">Latest snapshot: ${escapeHtml(meta.snapshot_date)}</span>` : ''}
        </div>
      `;
      return;
    }

    setChartCardState('instagramDemographicsCard', 'instagramDemographicsBadge', {
      hidden: false,
      label: `${groups.length} groups`,
      badgeClass: 'chart-badge-live'
    });

    const rows = groups.map(group => {
      const preview = (group.items || []).slice(0, 10).map(item => `
        <div class="demographic-item">
          <span class="demo-label">${escapeHtml(item.label || '-')}</span>
          <span class="demo-value">${formatNumber(item.value || 0)} (${formatPct(item.pct)}%)</span>
        </div>
      `).join('');

      return `
        <div class="insight-card">
          <h4>${escapeHtml((group.dimensions || []).join(' + ') || group.key || 'unknown')}</h4>
          <div class="insight-value">${formatNumber(group.total || 0)}</div>
          <div class="insight-values">${preview || '<div class="empty">Không có kết quả breakdown</div>'}</div>
        </div>
      `;
    }).join('');

    box.innerHTML = `
      <div class="info-box" style="margin-top:0;margin-bottom:0.75rem;">
        <strong>Snapshot:</strong> ${escapeHtml(meta?.snapshot_date || '-')}<br>
        <strong>Groups:</strong> ${formatNumber(groups.length)}
      </div>
      <div class="audience-insights">${rows}</div>
    `;
  }

  function renderMediaTable(media) {
    const tbody = document.querySelector('#instagramMediaTable tbody');
    if (!tbody) return;

    const filteredMedia = (media || []).filter(item => {
      if (state.selectedMediaType === 'ALL') return true;
      return item.media_product_type === state.selectedMediaType || item.media_type === state.selectedMediaType;
    });

    if (!filteredMedia || filteredMedia.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="empty-state">Chưa có media inventory cho Instagram account này.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredMedia.map(item => {
      const insights = item.insights_snapshot;
      const metrics = insights?.metrics || {};
      const insightLabel = insights?.supported ? 'Supported' : (insights?.reason || 'Khong co media insights');
      const interactions = Number(metrics.total_interactions || 0)
        || ((Number(item.like_count) || 0) + (Number(item.comments_count) || 0));

      return `
        <tr>
          <td>
            <strong>${escapeHtml(item.caption ? item.caption.slice(0, 48) : item.id)}</strong><br>
            <a class="instagram-media-link" href="${escapeHtml(item.permalink || '#')}" target="_blank" rel="noreferrer">${escapeHtml(item.permalink || '')}</a>
          </td>
          <td>${escapeHtml(item.media_product_type || item.media_type || '-')}</td>
          <td>${item.timestamp ? new Date(item.timestamp).toLocaleDateString('vi-VN') : '-'}</td>
          <td>${formatNumber(metrics.likes || item.like_count || 0)}</td>
          <td>${formatNumber(metrics.comments || item.comments_count || 0)}</td>
          <td>${formatNumber(metrics.reach || 0)}</td>
          <td>${formatNumber(metrics.views || 0)}</td>
          <td>${formatNumber(metrics.saved || 0)}</td>
          <td>${formatNumber(metrics.shares || 0)}</td>
          <td>${formatNumber(interactions)}</td>
          <td>${formatPct(item.engagement_rate || 0)}%</td>
          <td>${escapeHtml(insightLabel)}</td>
        </tr>
      `;
    }).join('');
  }

  async function loadAccounts() {
    const select = document.getElementById('instagramAccountSelect');
    if (!select) return;

    const response = await fetch('/api/instagram/accounts');
    const payload = await response.json();
    state.accounts = payload.data || [];

    select.innerHTML = '<option value="">-- Chọn Instagram account --</option>' + state.accounts.map(account => {
      const label = `${account.username || account.id} - ${formatNumber(account.followers_count || 0)} followers (${account.portfolio || '-'})`;
      return `<option value="${account.id}">${escapeHtml(label)}</option>`;
    }).join('');

    if (state.accounts.length > 0 && !state.selectedAccountId) {
      state.selectedAccountId = state.accounts[0].id;
      select.value = state.selectedAccountId;
    }
  }

  async function loadSelectedAccountData() {
    const accountId = state.selectedAccountId;
    const days = getSelectedDays();

    if (!accountId) {
      updateContextBar(null, days);
      setSummaryCards(null, null);
      renderInsightsCharts([], [], [], []);
      renderMediaTable([]);
      renderDemographics(null, []);
      renderCoverage(null, [], [], null);
      setStatus('Chọn Instagram account để xem dữ liệu.', 'empty');
      return;
    }

    const account = state.accounts.find(item => item.id === accountId);
    updateContextBar(account, days);

    const [insightsRes, trendRes, mediaRes, rankingRes, demographicsSummaryRes] = await Promise.all([
      fetch(`/api/instagram/accounts/${accountId}/insights?days=${days}`),
      fetch(`/api/instagram/accounts/${accountId}/insights-trend?days=${days}`),
      fetch(`/api/instagram/accounts/${accountId}/media?limit=50`),
      fetch(`/api/instagram/accounts/${accountId}/media-ranking?limit=10&sort_by=${encodeURIComponent(state.selectedRankingMetric)}`),
      fetch(`/api/instagram/accounts/${accountId}/demographics-summary`)
    ]);

    const insightsPayload = await insightsRes.json();
    const trendPayload = await trendRes.json();
    const mediaPayload = await mediaRes.json();
    const rankingPayload = await rankingRes.json();
    const demographicsSummaryPayload = await demographicsSummaryRes.json();

    state.insights = insightsPayload.data || [];
    state.insightTrend = trendPayload.data || [];
    state.media = mediaPayload.data || [];
    state.mediaRanking = rankingPayload.data || [];
    state.demographicsSummary = demographicsSummaryPayload.data || [];
    state.demographicsMeta = demographicsSummaryPayload.meta || null;

    const latestInsight = state.insights.length > 0 ? state.insights[state.insights.length - 1] : null;
    setSummaryCards(account, latestInsight);
    renderInsightsCharts(state.insightTrend, state.insights, state.mediaRanking, state.media);
    renderMediaTable(state.media);
    renderDemographics(state.demographicsMeta, state.demographicsSummary);
    renderCoverage(account, state.insightTrend, state.media, state.demographicsMeta);

    if (insightsPayload.meta?.supported === false) {
      setStatus(`
        <strong>${escapeHtml(account?.username || accountId)}</strong><br>
        ${escapeHtml(insightsPayload.meta.reason || 'Chưa có Instagram snapshots cho account này.')}<br>
        Gợi ý: bấm <strong>Sync Instagram</strong> để đồng bộ account đang chọn.
      `, 'info');
      return;
    }

    setStatus(`
      <span class="success">Đã tải dữ liệu Instagram cho ${escapeHtml(account?.username || accountId)}.</span><br>
      ${state.insights.length} snapshot insight, ${state.media.length} media item và ${state.demographicsSummary.length} demographics group.
      ${state.demographicsMeta?.supported === false ? `<br><strong>Lưu ý:</strong> ${escapeHtml(normalizeInstagramReason(state.demographicsMeta?.reason || ''))}` : ''}
    `);
  }

  function exportInstagramAccounts() {
    window.open('/api/export/instagram/accounts.csv', '_blank');
  }

  function exportInstagramScoped(pathBuilder) {
    const accountId = state.selectedAccountId;
    const days = getSelectedDays();

    if (!accountId) {
      setStatus('<span class="error">Chọn Instagram account trước khi export.</span>');
      return;
    }

    window.open(pathBuilder(accountId, days), '_blank');
  }

  async function refreshInstagramView() {
    try {
      setStatus('<div class="loading">Đang tải Instagram...</div>');
      state.selectedAccountId = getSelectedAccountId();
      await loadSelectedAccountData();
    } catch (error) {
      setStatus(`<span class="error">Loi Instagram: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function refreshInstagramWhenVisible() {
    const tab = document.getElementById('instagram-tab');
    if (!tab || !tab.classList.contains('active')) {
      return;
    }

    await new Promise(resolve => requestAnimationFrame(resolve));
    await refreshInstagramView();
  }

  async function syncInstagram() {
    const accountId = state.selectedAccountId;
    const days = getSelectedDays();

    try {
      if (!accountId) {
        throw new Error('Chọn Instagram account trước khi sync');
      }

      setStatus('<div class="loading">Đang sync Instagram từ Meta...</div>');
      const response = await fetch(`/api/instagram/accounts/${accountId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(days) })
      });
      const payload = await response.json();

      if (!response.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      await loadAccounts();
      state.selectedAccountId = accountId;
      document.getElementById('instagramAccountSelect').value = accountId;
      await refreshInstagramView();
    } catch (error) {
      setStatus(`<span class="error">Sync Instagram that bai: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function syncAllInstagram() {
    const days = getSelectedDays();

    try {
      setStatus('<div class="loading">Đang sync tất cả Instagram accounts từ Meta...</div>');
      const response = await fetch('/api/instagram/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(days) })
      });
      const payload = await response.json();

      if (!response.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const previousAccountId = state.selectedAccountId;
      await loadAccounts();
      if (previousAccountId && state.accounts.some(item => item.id === previousAccountId)) {
        state.selectedAccountId = previousAccountId;
        document.getElementById('instagramAccountSelect').value = previousAccountId;
      }
      await refreshInstagramView();
    } catch (error) {
      setStatus(`<span class="error">Sync all Instagram that bai: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function initInstagramTab() {
    const refreshBtn = document.getElementById('instagramRefreshBtn');
    const syncBtn = document.getElementById('instagramSyncBtn');
    const syncAllBtn = document.getElementById('instagramSyncAllBtn');
    const exportAccountsBtn = document.getElementById('instagramExportAccountsBtn');
    const exportInsightsBtn = document.getElementById('instagramExportInsightsBtn');
    const exportMediaBtn = document.getElementById('instagramExportMediaBtn');
    const exportDemographicsBtn = document.getElementById('instagramExportDemographicsBtn');
    const accountSelect = document.getElementById('instagramAccountSelect');
    const daysSelect = document.getElementById('instagramDaysSelect');
    const mediaTypeSelect = document.getElementById('instagramMediaTypeSelect');
    const rankingMetricSelect = document.getElementById('instagramRankingMetricSelect');

    if (
      !refreshBtn ||
      !syncBtn ||
      !syncAllBtn ||
      !exportAccountsBtn ||
      !exportInsightsBtn ||
      !exportMediaBtn ||
      !exportDemographicsBtn ||
      !accountSelect ||
      !daysSelect ||
      !mediaTypeSelect ||
      !rankingMetricSelect
    ) {
      return;
    }

    refreshBtn.addEventListener('click', refreshInstagramView);
    syncBtn.addEventListener('click', syncInstagram);
    syncAllBtn.addEventListener('click', syncAllInstagram);
    exportAccountsBtn.addEventListener('click', exportInstagramAccounts);
    exportInsightsBtn.addEventListener('click', () => exportInstagramScoped((accountId, days) => `/api/export/instagram/accounts/${accountId}/insights.csv?days=${days}`));
    exportMediaBtn.addEventListener('click', () => exportInstagramScoped(accountId => `/api/export/instagram/accounts/${accountId}/media.csv?limit=100`));
    exportDemographicsBtn.addEventListener('click', () => exportInstagramScoped(accountId => `/api/export/instagram/accounts/${accountId}/demographics.csv`));
    accountSelect.addEventListener('change', async () => {
      state.selectedAccountId = accountSelect.value;
      await refreshInstagramView();
    });
    daysSelect.addEventListener('change', refreshInstagramView);
    mediaTypeSelect.addEventListener('change', () => {
      state.selectedMediaType = mediaTypeSelect.value;
      renderMediaTable(state.media);
    });
    rankingMetricSelect.addEventListener('change', async () => {
      state.selectedRankingMetric = rankingMetricSelect.value;
      await refreshInstagramView();
    });

    await loadAccounts();
    if (state.selectedAccountId) {
      accountSelect.value = state.selectedAccountId;
    }
    mediaTypeSelect.value = state.selectedMediaType;
    rankingMetricSelect.value = state.selectedRankingMetric;
    await refreshInstagramView();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initInstagramTab().catch(error => {
      setStatus(`<span class="error">Khoi tao Instagram tab that bai: ${escapeHtml(error.message)}</span>`);
    });
  });

  document.addEventListener('app:tab-changed', event => {
    if (event.detail?.tab === 'instagram') {
      refreshInstagramWhenVisible().catch(error => {
        setStatus(`<span class="error">Instagram tab refresh error: ${escapeHtml(error.message)}</span>`);
      });
    }
  });
})();

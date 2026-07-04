(function () {
  const state = {
    accounts: [],
    selectedAccountId: '',
    insights: [],
    insightTrend: [],
    media: [],
    mediaRanking: [],
    demographics: null,
    demographicsSummary: [],
    selectedMediaType: 'ALL'
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

  function updateContextBar(account, days) {
    const box = document.getElementById('instagramContextBar');
    if (!box) return;

    if (!account) {
      box.innerHTML = '<span class="ads-context-empty">Chua chon Instagram account.</span>';
      return;
    }

    box.innerHTML = `
      <span class="ads-context-pill"><strong>IG:</strong> ${escapeHtml(account.username || account.id)}</span>
      <span class="ads-context-pill"><strong>Page:</strong> ${escapeHtml(account.page_name || '-')}</span>
      <span class="ads-context-pill"><strong>Portfolio:</strong> ${escapeHtml(account.portfolio || '-')}</span>
      <span class="ads-context-pill"><strong>Followers:</strong> ${formatNumber(account.followers_count || 0)}</span>
      <span class="ads-context-pill scope"><strong>Scope:</strong> ${escapeHtml(String(days))} ngay</span>
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

  function renderInsightsCharts(trend, mediaRanking) {
    if (!trend || trend.length === 0) {
      charts.destroyChart('instagramReachTrendChart');
    } else {
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

    if (!mediaRanking || mediaRanking.length === 0) {
      charts.destroyChart('instagramTopMediaChart');
      return;
    }

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

  function renderDemographics(meta, groups) {
    const box = document.getElementById('instagramDemographicsBox');
    if (!box) return;

    if (!meta || meta.supported === false || !Array.isArray(groups) || groups.length === 0) {
      box.innerHTML = `
        <div class="info-box">
          <strong>Demographics snapshot unavailable</strong><br>
          ${escapeHtml(meta?.reason || 'Meta did not return usable follower demographics for this Instagram account yet.')}
        </div>
      `;
      return;
    }

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
          <div class="insight-values">${preview || '<div class="empty">Khong co ket qua breakdown</div>'}</div>
        </div>
      `;
    }).join('');

    box.innerHTML = `<div class="audience-insights">${rows}</div>`;
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
          <td colspan="11" class="empty-state">Chua co media inventory cho Instagram account nay.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredMedia.map(item => {
      const insights = item.insights_snapshot;
      const metrics = insights?.metrics || {};
      const insightLabel = insights?.supported ? 'Supported' : (insights?.reason || 'Khong co media insights');

      return `
        <tr>
          <td>
            <strong>${escapeHtml(item.caption ? item.caption.slice(0, 48) : item.id)}</strong><br>
            <a class="instagram-media-link" href="${escapeHtml(item.permalink || '#')}" target="_blank" rel="noreferrer">${escapeHtml(item.permalink || '')}</a>
          </td>
          <td>${escapeHtml(item.media_product_type || item.media_type || '-')}</td>
          <td>${item.timestamp ? new Date(item.timestamp).toLocaleDateString('vi-VN') : '-'}</td>
          <td>${formatNumber(item.like_count)}</td>
          <td>${formatNumber(item.comments_count)}</td>
          <td>${formatNumber(metrics.reach || 0)}</td>
          <td>${formatNumber(metrics.views || 0)}</td>
          <td>${formatNumber(metrics.saved || 0)}</td>
          <td>${formatNumber(metrics.shares || 0)}</td>
          <td>${formatNumber(metrics.total_interactions || 0)}</td>
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

    select.innerHTML = '<option value="">-- Chon Instagram account --</option>' + state.accounts.map(account => {
      const label = `${account.username || account.id} - ${formatNumber(account.followers_count || 0)} followers (${account.portfolio || '-'})`;
      return `<option value="${account.id}">${escapeHtml(label)}</option>`;
    }).join('');

    if (state.accounts.length > 0) {
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
      renderInsightsCharts([]);
      renderMediaTable([]);
      renderDemographics(null, []);
      setStatus('Chon Instagram account de xem du lieu.', 'empty');
      return;
    }

    const account = state.accounts.find(item => item.id === accountId);
    updateContextBar(account, days);

    const [insightsRes, trendRes, mediaRes, rankingRes, demographicsRes, demographicsSummaryRes] = await Promise.all([
      fetch(`/api/instagram/accounts/${accountId}/insights?days=${days}`),
      fetch(`/api/instagram/accounts/${accountId}/insights-trend?days=${days}`),
      fetch(`/api/instagram/accounts/${accountId}/media?limit=15`),
      fetch(`/api/instagram/accounts/${accountId}/media-ranking?limit=8`),
      fetch(`/api/instagram/accounts/${accountId}/demographics`),
      fetch(`/api/instagram/accounts/${accountId}/demographics-summary`)
    ]);

    const insightsPayload = await insightsRes.json();
    const trendPayload = await trendRes.json();
    const mediaPayload = await mediaRes.json();
    const rankingPayload = await rankingRes.json();
    const demographicsPayload = await demographicsRes.json();
    const demographicsSummaryPayload = await demographicsSummaryRes.json();

    state.insights = insightsPayload.data || [];
    state.insightTrend = trendPayload.data || [];
    state.media = mediaPayload.data || [];
    state.mediaRanking = rankingPayload.data || [];
    state.demographics = demographicsPayload;
    state.demographicsSummary = demographicsSummaryPayload.data || [];

    const latestInsight = state.insights.length > 0 ? state.insights[state.insights.length - 1] : null;
    setSummaryCards(account, latestInsight);
    renderInsightsCharts(state.insightTrend, state.mediaRanking);
    renderMediaTable(state.media);
    renderDemographics(demographicsSummaryPayload.meta, state.demographicsSummary);

    if (insightsPayload.meta?.supported === false) {
      setStatus(`
        <strong>${escapeHtml(account?.username || accountId)}</strong><br>
        ${escapeHtml(insightsPayload.meta.reason || 'Chua co Instagram snapshots cho account nay.')}<br>
        Goi y: bam <strong>Sync Instagram</strong> de dong bo account dang chon.
      `, 'info');
      return;
    }

    setStatus(`
      <span class="success">Da tai du lieu Instagram cho ${escapeHtml(account?.username || accountId)}.</span><br>
      ${state.insights.length} snapshot insight, ${state.media.length} media item va ${state.demographicsSummary.length} demographics group.
    `);
  }

  function exportInstagramAccounts() {
    window.open('/api/export/instagram/accounts.csv', '_blank');
  }

  function exportInstagramScoped(pathBuilder) {
    const accountId = state.selectedAccountId;
    const days = getSelectedDays();

    if (!accountId) {
      setStatus('<span class="error">Chon Instagram account truoc khi export.</span>');
      return;
    }

    window.open(pathBuilder(accountId, days), '_blank');
  }

  async function refreshInstagramView() {
    try {
      setStatus('<div class="loading">Dang tai Instagram...</div>');
      state.selectedAccountId = getSelectedAccountId();
      await loadSelectedAccountData();
    } catch (error) {
      setStatus(`<span class="error">Loi Instagram: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function syncInstagram() {
    const accountId = state.selectedAccountId;
    const days = getSelectedDays();

    try {
      if (!accountId) {
        throw new Error('Chon Instagram account truoc khi sync');
      }

      setStatus('<div class="loading">Dang sync Instagram tu Meta...</div>');
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
      setStatus('<div class="loading">Dang sync tat ca Instagram accounts tu Meta...</div>');
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
      !mediaTypeSelect
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

    await loadAccounts();
    if (state.selectedAccountId) {
      accountSelect.value = state.selectedAccountId;
    }
    mediaTypeSelect.value = state.selectedMediaType;
    await refreshInstagramView();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', () => {
    initInstagramTab().catch(error => {
      setStatus(`<span class="error">Khoi tao Instagram tab that bai: ${escapeHtml(error.message)}</span>`);
    });
  });
})();

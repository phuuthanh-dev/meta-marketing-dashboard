(function () {
  const state = {
    accounts: [],
    selectedAccountId: '',
    selectedLevel: 'campaign',
    accountInsights: [],
    campaigns: [],
    adSets: [],
    ads: [],
    performanceRows: []
  };

  function formatNumber(value) {
    const numeric = Number(value) || 0;
    return numeric.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  }

  function formatCurrency(value, currency = 'USD') {
    const numeric = Number(value) || 0;
    return `${formatNumber(numeric)} ${currency}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function getSelectedDays() {
    return document.getElementById('adsDaysSelect')?.value || '1095';
  }

  function getSelectedAccountId() {
    return document.getElementById('adsAccountSelect')?.value || '';
  }

  function getSelectedLevel() {
    return document.getElementById('adsLevelSelect')?.value || 'campaign';
  }

  function setStatus(html, cssClass = '') {
    const box = document.getElementById('adsStatusBox');
    if (!box) return;
    box.className = `result-box ${cssClass}`.trim();
    box.innerHTML = html;
  }

  function updateContextBar(account, level, days) {
    const box = document.getElementById('adsContextBar');
    const help = document.getElementById('adsLevelHelp');
    if (!box) return;

    if (!account) {
      box.innerHTML = '<span class="ads-context-empty">Chưa chọn ad account.</span>';
      if (help) {
        help.textContent = 'Summary cards và 2 trend chart phía trên luôn là account-level. Mức xem chỉ đổi phần breakdown bên dưới: inventory, performance table và export CSV.';
      }
      return;
    }

    box.innerHTML = `
      <span class="ads-context-pill"><strong>Account:</strong> ${escapeHtml(account.name || account.id)}</span>
      <span class="ads-context-pill"><strong>Portfolio:</strong> ${escapeHtml(account.portfolio || '-')}</span>
      <span class="ads-context-pill currency"><strong>Currency:</strong> ${escapeHtml(account.currency || 'USD')}</span>
      <span class="ads-context-pill"><strong>Timezone:</strong> ${escapeHtml(account.timezone_name || '-')}</span>
      <span class="ads-context-pill scope"><strong>Scope:</strong> ${escapeHtml(level)} | ${escapeHtml(String(days))} ngày</span>
      ${Number(account.breakdown_rows || 0) === 0 && Number(account.account_daily_rows || 0) > 0
        ? '<span class="ads-context-pill" style="background:#fff1f0;border-color:#ffc4b8;color:#b42318;"><strong>Needs resync</strong></span>'
        : ''}
    `;

    if (help) {
      help.innerHTML = `
        <strong>Account Summary:</strong> KPI cards và 2 trend chart phía trên luôn tổng hợp theo toàn ad account.<br>
        <strong>Breakdown Level:</strong> Bạn đang xem dữ liệu nhóm theo <strong>${escapeHtml(level)}</strong> ở inventory, performance table và export CSV.
      `;
    }
  }

  function setSummaryCards(totals, currency = 'USD') {
    document.getElementById('adsSpendValue').textContent = totals ? formatCurrency(totals.total_spend, currency) : '-';
    document.getElementById('adsImpressionsValue').textContent = totals ? formatNumber(totals.total_impressions) : '-';
    document.getElementById('adsReachValue').textContent = totals ? formatNumber(totals.total_reach) : '-';
    document.getElementById('adsClicksValue').textContent = totals ? formatNumber(totals.total_clicks) : '-';
    document.getElementById('adsCtrValue').textContent = totals ? `${formatNumber(totals.avg_ctr)}%` : '-';
    document.getElementById('adsCpcValue').textContent = totals ? formatCurrency(totals.avg_cpc, currency) : '-';
    document.getElementById('adsCpmValue').textContent = totals ? formatCurrency(totals.avg_cpm, currency) : '-';
    document.getElementById('adsFrequencyValue').textContent = totals ? formatNumber(totals.avg_frequency) : '-';
  }

  function summarizeInsights(insights) {
    return insights.reduce((acc, item) => {
      acc.total_spend += Number(item.spend || 0);
      acc.total_impressions += Number(item.impressions || 0);
      acc.total_reach += Number(item.reach || 0);
      acc.total_clicks += Number(item.clicks || 0);
      acc.frequency_sum += Number(item.frequency || 0);
      acc.rows += 1;
      return acc;
    }, {
      total_spend: 0,
      total_impressions: 0,
      total_reach: 0,
      total_clicks: 0,
      avg_ctr: 0,
      avg_cpc: 0,
      avg_cpm: 0,
      avg_frequency: 0,
      frequency_sum: 0,
      rows: 0
    });
  }

  function getInventoryConfig(level) {
    if (level === 'adset') {
      return {
        title: 'Ad Set Inventory',
        head: '<tr><th>Ad Set</th><th>Campaign ID</th><th>Status</th><th>Optimization</th><th>Billing Event</th><th>Budget</th></tr>',
        empty: 'Chưa có ad set trong local database cho ad account này.'
      };
    }

    if (level === 'ad') {
      return {
        title: 'Ad Inventory',
        head: '<tr><th>Ad</th><th>Campaign ID</th><th>Ad Set ID</th><th>Status</th><th>Creative ID</th><th>Account</th></tr>',
        empty: 'Chưa có ad trong local database cho ad account này.'
      };
    }

    return {
      title: 'Campaign Inventory',
      head: '<tr><th>Campaign</th><th>Objective</th><th>Status</th><th>Buying Type</th><th>Start</th><th>Stop</th></tr>',
      empty: 'Chưa có campaign trong local database cho ad account này.'
    };
  }

  function getInventoryRows(level) {
    if (level === 'ad') return state.ads;
    if (level === 'adset') return state.adSets;
    return state.campaigns;
  }

  function renderInventoryTable(level) {
    const tbody = document.querySelector('#adsCampaignsTable tbody');
    const head = document.getElementById('adsInventoryHead');
    const title = document.getElementById('adsInventoryTitle');
    if (!tbody) return;

    const config = getInventoryConfig(level);
    const rows = getInventoryRows(level);

    if (head) head.innerHTML = config.head;
    if (title) title.innerHTML = `&#x1F4CB; ${config.title} <span class="chart-badge chart-badge-local">Local DB</span>`;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">${config.empty}</td>
        </tr>
      `;
      return;
    }

    if (level === 'adset') {
      const bodyRows = rows.map(adSet => `
        <tr>
          <td><strong>${escapeHtml(adSet.name || '')}</strong></td>
          <td>${escapeHtml(adSet.campaign_id || '-')}</td>
          <td><span class="role-badge">${escapeHtml(adSet.effective_status || adSet.status || '-')}</span></td>
          <td>${escapeHtml(adSet.optimization_goal || '-')}</td>
          <td>${escapeHtml(adSet.billing_event || '-')}</td>
          <td>${formatNumber(adSet.daily_budget || adSet.lifetime_budget || 0)}</td>
        </tr>
      `).join('');
      tbody.innerHTML = `${bodyRows}
        <tr class="totals-row">
          <td><strong>Total Ad Sets</strong></td>
          <td colspan="5"><strong>${formatNumber(rows.length)}</strong></td>
        </tr>
      `;
      return;
    }

    if (level === 'ad') {
      const bodyRows = rows.map(ad => `
        <tr>
          <td><strong>${escapeHtml(ad.name || '')}</strong></td>
          <td>${escapeHtml(ad.campaign_id || '-')}</td>
          <td>${escapeHtml(ad.ad_set_id || '-')}</td>
          <td><span class="role-badge">${escapeHtml(ad.effective_status || ad.status || '-')}</span></td>
          <td>${escapeHtml(ad.creative_id || '-')}</td>
          <td>${escapeHtml(ad.ad_account_id || '-')}</td>
        </tr>
      `).join('');
      tbody.innerHTML = `${bodyRows}
        <tr class="totals-row">
          <td><strong>Total Ads</strong></td>
          <td colspan="5"><strong>${formatNumber(rows.length)}</strong></td>
        </tr>
      `;
      return;
    }

    const bodyRows = rows.map(campaign => `
      <tr>
        <td><strong>${escapeHtml(campaign.name || '')}</strong></td>
        <td>${escapeHtml(campaign.objective || '-')}</td>
        <td><span class="role-badge">${escapeHtml(campaign.effective_status || campaign.status || '-')}</span></td>
        <td>${escapeHtml(campaign.buying_type || '-')}</td>
        <td>${campaign.start_time ? new Date(campaign.start_time).toLocaleDateString('vi-VN') : '-'}</td>
        <td>${campaign.stop_time ? new Date(campaign.stop_time).toLocaleDateString('vi-VN') : '-'}</td>
      </tr>
    `).join('');
    tbody.innerHTML = `${bodyRows}
      <tr class="totals-row">
        <td><strong>Total Campaigns</strong></td>
        <td colspan="5"><strong>${formatNumber(rows.length)}</strong></td>
      </tr>
    `;
  }

  function renderPerformanceTable(rows, currency = 'USD') {
    const tbody = document.querySelector('#adsPerformanceTable tbody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-state">Chưa có dữ liệu performance cho level đang chọn.</td>
        </tr>
      `;
      return;
    }

    const totals = rows.reduce((acc, row) => {
      acc.spend += Number(row.spend || 0);
      acc.impressions += Number(row.impressions || 0);
      acc.reach += Number(row.reach || 0);
      acc.clicks += Number(row.clicks || 0);
      acc.frequencySum += Number(row.frequency || 0);
      return acc;
    }, {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      frequencySum: 0
    });

    const totalCtr = totals.impressions > 0 ? (totals.clicks * 100 / totals.impressions) : 0;
    const totalCpc = totals.clicks > 0 ? (totals.spend / totals.clicks) : 0;
    const totalCpm = totals.impressions > 0 ? (totals.spend * 1000 / totals.impressions) : 0;
    const totalFrequency = rows.length > 0 ? (totals.frequencySum / rows.length) : 0;

    const bodyRows = rows.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.entity_name || row.entity_id || '-')}</strong></td>
        <td>${formatCurrency(row.spend, currency)}</td>
        <td>${formatNumber(row.impressions)}</td>
        <td>${formatNumber(row.reach)}</td>
        <td>${formatNumber(row.clicks)}</td>
        <td>${formatNumber(row.ctr)}%</td>
        <td>${formatCurrency(row.cpc, currency)}</td>
        <td>${formatCurrency(row.cpm, currency)}</td>
        <td>${formatNumber(row.frequency)}</td>
      </tr>
    `).join('');

    tbody.innerHTML = `${bodyRows}
      <tr class="totals-row">
        <td><strong>Total</strong></td>
        <td><strong>${formatCurrency(totals.spend, currency)}</strong></td>
        <td><strong>${formatNumber(totals.impressions)}</strong></td>
        <td><strong>${formatNumber(totals.reach)}</strong></td>
        <td><strong>${formatNumber(totals.clicks)}</strong></td>
        <td><strong>${formatNumber(totalCtr)}%</strong></td>
        <td><strong>${formatCurrency(totalCpc, currency)}</strong></td>
        <td><strong>${formatCurrency(totalCpm, currency)}</strong></td>
        <td><strong>${formatNumber(totalFrequency)}</strong></td>
      </tr>
    `;
  }

  function renderInventoryChart(level) {
    const rows = getInventoryRows(level);
    const active = rows.filter(item => (item.effective_status || item.status || '').toUpperCase() === 'ACTIVE').length;
    const paused = rows.filter(item => (item.effective_status || item.status || '').toUpperCase() === 'PAUSED').length;
    const other = Math.max(0, rows.length - active - paused);

    charts.createPieChart('adsInventoryChart', ['Active', 'Paused', 'Other'], [active, paused, other]);
  }

  function renderTrends(insights) {
    if (!insights || insights.length === 0) {
      charts.destroyChart('adsSpendTrendChart');
      charts.destroyChart('adsClicksReachChart');
      charts.destroyChart('adsInventoryChart');
      return;
    }

    const labels = insights.map(item => charts.formatDate(item.date_start));

    charts.createLineChart('adsSpendTrendChart', labels, [{
      label: 'Spend',
      data: insights.map(item => Number(item.spend || 0)),
      borderColor: charts.colors.green,
      backgroundColor: 'rgba(0, 168, 86, 0.12)',
      fill: true,
      tension: 0.3,
      pointRadius: 3
    }]);

    charts.createBarChart('adsClicksReachChart', labels, [
      {
        label: 'Clicks',
        data: insights.map(item => Number(item.clicks || 0)),
        backgroundColor: charts.colors.blue,
        borderRadius: 4
      },
      {
        label: 'Reach',
        data: insights.map(item => Number(item.reach || 0)),
        backgroundColor: charts.colors.orange,
        borderRadius: 4
      }
    ]);
  }

  async function loadAccounts() {
    const select = document.getElementById('adsAccountSelect');
    if (!select) return;

    const response = await fetch('/api/ads/accounts');
    const payload = await response.json();
    const accounts = payload.data || [];

    state.accounts = accounts;
    select.innerHTML = '<option value="">-- Chọn ad account --</option>' + accounts.map(account => `
      <option value="${account.id}">${escapeHtml(account.name)} (${escapeHtml(account.portfolio || '-')})${Number(account.breakdown_rows || 0) === 0 && Number(account.account_daily_rows || 0) > 0 ? ' [Needs resync]' : ''}</option>
    `).join('');

    if (accounts.length > 0 && !state.selectedAccountId) {
      state.selectedAccountId = accounts[0].id;
      select.value = accounts[0].id;
    }
  }

  async function loadInventory() {
    const accountId = state.selectedAccountId;
    if (!accountId) {
      renderInventoryTable(state.selectedLevel);
      return;
    }

    const [campaignResponse, adSetsResponse, adsResponse] = await Promise.all([
      fetch(`/api/ads/accounts/${accountId}/campaigns`),
      fetch(`/api/ads/accounts/${accountId}/adsets`),
      fetch(`/api/ads/accounts/${accountId}/ads`)
    ]);

    const campaignsPayload = await campaignResponse.json();
    const adSetsPayload = await adSetsResponse.json();
    const adsPayload = await adsResponse.json();

    state.campaigns = campaignsPayload.data || [];
    state.adSets = adSetsPayload.data || [];
    state.ads = adsPayload.data || [];

    renderInventoryTable(state.selectedLevel);
    renderInventoryChart(state.selectedLevel);
  }

  async function loadInsights() {
    const accountId = state.selectedAccountId;
    const days = getSelectedDays();
    const level = state.selectedLevel;

    if (!accountId) {
      updateContextBar(null, level, days);
      setSummaryCards(null);
      renderTrends([]);
      renderPerformanceTable([]);
      setStatus('Chọn ad account để xem dữ liệu Ads.', 'empty');
      return;
    }

    const selectedAccount = state.accounts.find(item => item.id === accountId);
    updateContextBar(selectedAccount, level, days);

    const accountResponse = await fetch(`/api/ads/accounts/${accountId}/insights?level=account&days=${days}`);
    const accountPayload = await accountResponse.json();
    state.accountInsights = accountPayload.data || [];

    const totals = summarizeInsights(state.accountInsights);
    totals.avg_ctr = totals.total_impressions > 0 ? (totals.total_clicks * 100 / totals.total_impressions) : 0;
    totals.avg_cpc = totals.total_clicks > 0 ? (totals.total_spend / totals.total_clicks) : 0;
    totals.avg_cpm = totals.total_impressions > 0 ? (totals.total_spend * 1000 / totals.total_impressions) : 0;
    totals.avg_frequency = totals.rows > 0 ? (totals.frequency_sum / totals.rows) : 0;
    setSummaryCards(totals, selectedAccount?.currency || 'USD');
    renderTrends(state.accountInsights);

    const summaryResponse = await fetch(`/api/ads/accounts/${accountId}/insights-summary?level=${level}&days=${days}`);
    const summaryPayload = await summaryResponse.json();
    state.performanceRows = summaryPayload.data || [];
    renderPerformanceTable(state.performanceRows, selectedAccount?.currency || 'USD');

    const inventoryCount = getInventoryRows(level).length;
    const needsDeepSync = (level === 'adset' || level === 'ad') && state.performanceRows.length === 0;

    if (accountPayload.meta?.supported === false && summaryPayload.meta?.supported === false) {
      setStatus(`
        <strong>${escapeHtml(selectedAccount?.name || accountId)}</strong><br>
        ${escapeHtml(summaryPayload.meta?.reason || accountPayload.meta?.reason || 'Không có dữ liệu Ads.')}<br>
        Gợi ý: thử <strong>Sync Ads</strong> với mốc 1095 ngày nếu account có delivery cũ.
      `, 'info');
      return;
    }

    setStatus(`
      <span class="success">Đã tải dữ liệu Ads cho ${escapeHtml(selectedAccount?.name || accountId)}.</span><br>
      ${state.accountInsights.length} dòng daily account insight, ${state.performanceRows.length} dòng tổng hợp theo ${escapeHtml(level)}, ${inventoryCount} row inventory.
      ${Number(selectedAccount?.breakdown_rows || 0) === 0 && Number(selectedAccount?.account_daily_rows || 0) > 0 ? '<br><strong>Lưu ý:</strong> Account này đang có account-level data nhưng chưa có breakdown mới. Cần bấm <strong>Sync Ads</strong> để nạp lại campaign/ad set/ad.' : ''}
      ${needsDeepSync ? '<br>Level này cần deep sync. Bấm <strong>Sync Ads</strong> khi đang ở mức xem này để nạp thêm ad set / ad insights.' : ''}
    `);
  }

  async function refreshAdsView() {
    try {
      setStatus('<div class="loading">Đang tải Ads...</div>');
      state.selectedAccountId = getSelectedAccountId();
      state.selectedLevel = getSelectedLevel();
      await loadInventory();
      await loadInsights();
    } catch (error) {
      setStatus(`<span class="error">Loi Ads: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function syncAds() {
    const days = getSelectedDays();
    const accountId = state.selectedAccountId;
    const includeDeepLevels = state.selectedLevel === 'adset' || state.selectedLevel === 'ad';

    try {
      setStatus('<div class="loading">Đang sync Ads từ Meta...</div>');
      if (!accountId) {
        throw new Error('Chọn ad account trước khi sync Ads');
      }

      const response = await fetch(`/api/ads/accounts/${accountId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(days), deep: includeDeepLevels })
      });
      const payload = await response.json();

      if (!response.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setStatus(`
        <span class="success">Đã sync Ads xong.</span><br>
        Ad account đã được đồng bộ cho cửa sổ ${days} ngày${includeDeepLevels ? ' và có nạp deep levels' : ''}.
      `);

      const syncedAccountId = accountId;
      await loadAccounts();
      state.selectedAccountId = syncedAccountId;
      if (syncedAccountId) {
        document.getElementById('adsAccountSelect').value = syncedAccountId;
      }
      await refreshAdsView();
    } catch (error) {
      setStatus(`<span class="error">Sync Ads that bai: ${escapeHtml(error.message)}</span>`);
    }
  }

  function exportAdsCsv() {
    const accountId = state.selectedAccountId;
    const days = getSelectedDays();
    const level = state.selectedLevel;

    if (!accountId) {
      setStatus('<span class="error">Chọn ad account trước khi export CSV.</span>');
      return;
    }

    window.location.href = `/api/export/ads/accounts/${accountId}/insights.csv?level=${encodeURIComponent(level)}&days=${encodeURIComponent(days)}`;
  }

  async function initAdsTab() {
    const refreshBtn = document.getElementById('adsRefreshBtn');
    const syncBtn = document.getElementById('adsSyncBtn');
    const exportBtn = document.getElementById('adsExportBtn');
    const accountSelect = document.getElementById('adsAccountSelect');
    const daysSelect = document.getElementById('adsDaysSelect');
    const levelSelect = document.getElementById('adsLevelSelect');

    if (!refreshBtn || !syncBtn || !exportBtn || !accountSelect || !daysSelect || !levelSelect) return;

    refreshBtn.addEventListener('click', refreshAdsView);
    syncBtn.addEventListener('click', syncAds);
    exportBtn.addEventListener('click', exportAdsCsv);
    accountSelect.addEventListener('change', async () => {
      state.selectedAccountId = accountSelect.value;
      await refreshAdsView();
    });
    daysSelect.addEventListener('change', refreshAdsView);
    levelSelect.addEventListener('change', async () => {
      state.selectedLevel = levelSelect.value;
      await refreshAdsView();
    });

    await loadAccounts();
    state.selectedAccountId = getSelectedAccountId() || state.selectedAccountId;
    state.selectedLevel = getSelectedLevel();
    if (state.selectedAccountId) {
      accountSelect.value = state.selectedAccountId;
    }
    levelSelect.value = state.selectedLevel;
    await refreshAdsView();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAdsTab().catch(error => {
      setStatus(`<span class="error">Khoi tao Ads tab that bai: ${escapeHtml(error.message)}</span>`);
    });
  });
})();

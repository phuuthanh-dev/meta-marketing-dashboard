(function () {
  const state = {
    accounts: [],
    selectedAccountId: '',
    selectedLevel: 'campaign',
    summary: null,
    accountInsights: [],
    campaigns: [],
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
    if (!box) return;

    if (!account) {
      box.innerHTML = '<span class="ads-context-empty">Chua chon ad account.</span>';
      return;
    }

    box.innerHTML = `
      <span class="ads-context-pill"><strong>Account:</strong> ${escapeHtml(account.name || account.id)}</span>
      <span class="ads-context-pill"><strong>Portfolio:</strong> ${escapeHtml(account.portfolio || '-')}</span>
      <span class="ads-context-pill currency"><strong>Currency:</strong> ${escapeHtml(account.currency || 'USD')}</span>
      <span class="ads-context-pill"><strong>Timezone:</strong> ${escapeHtml(account.timezone_name || '-')}</span>
      <span class="ads-context-pill scope"><strong>Scope:</strong> ${escapeHtml(level)} | ${escapeHtml(String(days))} ngay</span>
    `;
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

  function renderCampaignTable(campaigns) {
    const tbody = document.querySelector('#adsCampaignsTable tbody');
    if (!tbody) return;

    if (!campaigns || campaigns.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">Chua co campaign trong local database cho ad account nay.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = campaigns.map(campaign => `
      <tr>
        <td><strong>${escapeHtml(campaign.name || '')}</strong></td>
        <td>${escapeHtml(campaign.objective || '-')}</td>
        <td><span class="role-badge">${escapeHtml(campaign.effective_status || campaign.status || '-')}</span></td>
        <td>${escapeHtml(campaign.buying_type || '-')}</td>
        <td>${campaign.start_time ? new Date(campaign.start_time).toLocaleDateString('vi-VN') : '-'}</td>
        <td>${campaign.stop_time ? new Date(campaign.stop_time).toLocaleDateString('vi-VN') : '-'}</td>
      </tr>
    `).join('');
  }

  function renderPerformanceTable(rows, currency = 'USD') {
    const tbody = document.querySelector('#adsPerformanceTable tbody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-state">Chua co du lieu performance cho level dang chon.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map(row => `
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
  }

  function renderInventoryChart(campaigns) {
    const active = campaigns.filter(item => (item.effective_status || item.status || '').toUpperCase() === 'ACTIVE').length;
    const paused = campaigns.filter(item => (item.effective_status || item.status || '').toUpperCase() === 'PAUSED').length;
    const other = Math.max(0, campaigns.length - active - paused);

    charts.createPieChart(
      'adsInventoryChart',
      ['Active', 'Paused', 'Other'],
      [active, paused, other]
    );
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
    select.innerHTML = '<option value="">-- Chon ad account --</option>' + accounts.map(account => `
      <option value="${account.id}">${escapeHtml(account.name)} (${escapeHtml(account.portfolio || '-')})</option>
    `).join('');

    if (accounts.length > 0) {
      state.selectedAccountId = accounts[0].id;
      select.value = accounts[0].id;
    }
  }

  async function loadCampaigns() {
    const accountId = state.selectedAccountId;
    if (!accountId) {
      renderCampaignTable([]);
      return;
    }

    const response = await fetch(`/api/ads/accounts/${accountId}/campaigns`);
    const payload = await response.json();
    state.campaigns = payload.data || [];
    renderCampaignTable(state.campaigns);
    renderInventoryChart(state.campaigns);
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
      setStatus('Chon ad account de xem du lieu Ads.', 'empty');
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

    if (accountPayload.meta?.supported === false && summaryPayload.meta?.supported === false) {
      setStatus(`
        <strong>${escapeHtml(selectedAccount?.name || accountId)}</strong><br>
        ${escapeHtml(summaryPayload.meta?.reason || accountPayload.meta?.reason || 'Khong co du lieu Ads.')}<br>
        Goi y: thu <strong>Sync Ads</strong> voi moc 1095 ngay neu account co delivery cu.
      `, 'info');
    } else {
      setStatus(`
        <span class="success">Da tai du lieu Ads cho ${escapeHtml(selectedAccount?.name || accountId)}.</span><br>
        ${state.accountInsights.length} dong daily account insight va ${state.performanceRows.length} dong tong hop theo ${escapeHtml(level)}.
      `);
    }
  }

  async function refreshAdsView() {
    try {
      setStatus('<div class="loading">Dang tai Ads...</div>');
      state.selectedAccountId = getSelectedAccountId();
      await loadCampaigns();
      await loadInsights();
    } catch (error) {
      setStatus(`<span class="error">Loi Ads: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function syncAds() {
    const days = getSelectedDays();
    const accountId = state.selectedAccountId;
    try {
      setStatus('<div class="loading">Dang sync Ads tu Meta...</div>');
      if (!accountId) {
        throw new Error('Chon ad account truoc khi sync Ads');
      }

      const response = await fetch(`/api/ads/accounts/${accountId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(days) })
      });
      const payload = await response.json();

      if (!response.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setStatus(`
        <span class="success">Da sync Ads xong.</span><br>
        Ad account da duoc dong bo cho cua so ${days} ngay.
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
      setStatus('<span class="error">Chon ad account truoc khi export CSV.</span>');
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

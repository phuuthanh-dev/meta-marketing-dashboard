(function () {
  const state = {
    accounts: [],
    selectedAccountId: '',
    selectedLevel: 'campaign',
    accountInsights: [],
    campaigns: [],
    adSets: [],
    ads: [],
    performanceRows: [],
    drafts: {
      campaigns: [],
      adSets: [],
      ads: []
    },
    budgetReport: null,
    performanceReport: null
  };
  const BUDGET_ACTION_LABELS = {
    inspect: 'Cần kiểm tra',
    reduce: 'Giảm ngân sách',
    increase: 'Tăng ngân sách',
    hold: 'Giữ nguyên'
  };
  const META_DELIVERY_STATUS_LABELS = {
    PAUSED: 'Paused',
    ACTIVE: 'Active'
  };
  const PRIORITY_LABELS = {
    high: 'Cao',
    medium: 'Trung bình',
    low: 'Thấp',
    info: 'Thông tin'
  };
  const REPORT_TYPE_LABELS = {
    top_spend: 'Chi tiêu cao nhất',
    best_ctr: 'CTR tốt nhất',
    best_cpc: 'CPC tốt nhất',
    best_results: 'Kết quả tốt nhất',
    best_roas: 'ROAS tốt nhất',
    spend_no_clicks: 'Chi tiêu không có click',
    low_ctr_spenders: 'Chi tiêu nhưng CTR thấp',
    high_cpc: 'CPC cao',
    high_frequency: 'Tần suất cao',
    low_roas: 'ROAS thấp'
  };

  function formatNumber(value) {
    const numeric = Number(value) || 0;
    return numeric.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  }

  function formatCurrency(value, currency = 'USD') {
    const numeric = Number(value) || 0;
    return `${formatNumber(numeric)} ${currency}`;
  }

  function formatPercent(value) {
    return `${formatNumber(value)}%`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function renderMetaStatusOptions(value) {
    const current = String(value || 'PAUSED').toUpperCase();
    return Object.entries(META_DELIVERY_STATUS_LABELS).map(([status, label]) => `
      <option value="${status}" ${status === current ? 'selected' : ''}>${label}</option>
    `).join('');
  }

  function labelMetaStatus(value) {
    return META_DELIVERY_STATUS_LABELS[String(value || '').toUpperCase()] || value || '-';
  }

  function labelBudgetAction(value) {
    return BUDGET_ACTION_LABELS[String(value || '').toLowerCase()] || value || '-';
  }

  function labelPriority(value) {
    return PRIORITY_LABELS[String(value || '').toLowerCase()] || value || '-';
  }

  function labelReportType(value) {
    return REPORT_TYPE_LABELS[value] || value || '-';
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

  function getBudgetAlertFilter() {
    return document.getElementById('adsBudgetAlertFilter')?.value || 'all';
  }

  function getBudgetRowLimit() {
    return document.getElementById('adsBudgetRowLimit')?.value || '25';
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
        help.textContent = 'Các thẻ tổng quan và 2 biểu đồ xu hướng phía trên luôn ở mức toàn account. Mức xem chỉ đổi phần phân tích bên dưới: danh sách, bảng hiệu suất và file CSV xuất ra.';
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
        ? '<span class="ads-context-pill" style="background:#fff1f0;border-color:#ffc4b8;color:#b42318;"><strong>Cần đồng bộ lại</strong></span>'
        : ''}
    `;

    if (help) {
      help.innerHTML = `
        <strong>Tổng quan account:</strong> Các thẻ KPI và 2 biểu đồ xu hướng phía trên luôn tổng hợp theo toàn ad account.<br>
        <strong>Mức phân tích:</strong> Bạn đang xem dữ liệu nhóm theo <strong>${escapeHtml(level)}</strong> ở danh sách, bảng hiệu suất và file CSV xuất ra.
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
        title: 'Danh sách nhóm quảng cáo',
        head: '<tr><th>Nhóm quảng cáo</th><th>Campaign ID</th><th>Trạng thái</th><th>Tối ưu</th><th>Sự kiện tính phí</th><th>Ngân sách</th></tr>',
        empty: 'Chưa có ad set trong local database cho ad account này.'
      };
    }

    if (level === 'ad') {
      return {
        title: 'Danh sách quảng cáo',
        head: '<tr><th>Quảng cáo</th><th>Campaign ID</th><th>Ad Set ID</th><th>Trạng thái</th><th>Creative ID</th><th>Account</th></tr>',
        empty: 'Chưa có ad trong local database cho ad account này.'
      };
    }

    return {
      title: 'Danh sách campaign',
      head: '<tr><th>Campaign</th><th>Mục tiêu</th><th>Trạng thái</th><th>Kiểu mua</th><th>Bắt đầu</th><th>Kết thúc</th></tr>',
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
    if (title) title.innerHTML = `&#x1F4CB; ${config.title} <span class="chart-badge chart-badge-local">Dữ liệu local</span>`;

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
          <td><strong>Tổng nhóm quảng cáo</strong></td>
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
          <td><strong>Tổng quảng cáo</strong></td>
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
        <td><strong>Tổng campaign</strong></td>
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
          <td colspan="14" class="empty-state">Chưa có dữ liệu hiệu suất cho mức xem đang chọn.</td>
        </tr>
      `;
      return;
    }

    const totals = rows.reduce((acc, row) => {
      acc.spend += Number(row.spend || 0);
      acc.impressions += Number(row.impressions || 0);
      acc.reach += Number(row.reach || 0);
      acc.clicks += Number(row.clicks || 0);
      acc.results += Number(row.results || 0);
      acc.outboundClicks += Number(row.outbound_clicks || 0);
      acc.linkClicks += Number(row.inline_link_clicks || 0);
      acc.frequencySum += Number(row.frequency || 0);
      return acc;
    }, {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      results: 0,
      outboundClicks: 0,
      linkClicks: 0,
      frequencySum: 0
    });

    const totalCtr = totals.impressions > 0 ? (totals.clicks * 100 / totals.impressions) : 0;
    const totalCpc = totals.clicks > 0 ? (totals.spend / totals.clicks) : 0;
    const totalCpm = totals.impressions > 0 ? (totals.spend * 1000 / totals.impressions) : 0;
    const totalCostPerResult = totals.results > 0 ? (totals.spend / totals.results) : 0;
    const totalFrequency = rows.length > 0 ? (totals.frequencySum / rows.length) : 0;

    const bodyRows = rows.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.entity_name || row.entity_id || '-')}</strong></td>
        <td>${formatCurrency(row.spend, currency)}</td>
        <td>${formatNumber(row.impressions)}</td>
        <td>${formatNumber(row.reach)}</td>
        <td>${formatNumber(row.clicks)}</td>
        <td>${formatNumber(row.results || 0)}</td>
        <td>${formatCurrency(row.cost_per_result || 0, currency)}</td>
        <td>${formatPercent(row.ctr)}</td>
        <td>${formatCurrency(row.cpc, currency)}</td>
        <td>${formatCurrency(row.cpm, currency)}</td>
        <td>${formatNumber(row.frequency)}</td>
        <td>${formatNumber(row.outbound_clicks || 0)}</td>
        <td>${formatNumber(row.inline_link_clicks || 0)}</td>
        <td>${formatNumber(row.purchase_roas || 0)}</td>
      </tr>
    `).join('');

    tbody.innerHTML = `${bodyRows}
      <tr class="totals-row">
        <td><strong>Tổng</strong></td>
        <td><strong>${formatCurrency(totals.spend, currency)}</strong></td>
        <td><strong>${formatNumber(totals.impressions)}</strong></td>
        <td><strong>${formatNumber(totals.reach)}</strong></td>
        <td><strong>${formatNumber(totals.clicks)}</strong></td>
        <td><strong>${formatNumber(totals.results)}</strong></td>
        <td><strong>${formatCurrency(totalCostPerResult, currency)}</strong></td>
        <td><strong>${formatPercent(totalCtr)}</strong></td>
        <td><strong>${formatCurrency(totalCpc, currency)}</strong></td>
        <td><strong>${formatCurrency(totalCpm, currency)}</strong></td>
        <td><strong>${formatNumber(totalFrequency)}</strong></td>
        <td><strong>${formatNumber(totals.outboundClicks)}</strong></td>
        <td><strong>${formatNumber(totals.linkClicks)}</strong></td>
        <td>-</td>
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
      label: 'Chi tiêu',
      data: insights.map(item => Number(item.spend || 0)),
      borderColor: charts.colors.green,
      backgroundColor: 'rgba(0, 168, 86, 0.12)',
      fill: true,
      tension: 0.3,
      pointRadius: 3
    }]);

    charts.createBarChart('adsClicksReachChart', labels, [
      {
        label: 'Click',
        data: insights.map(item => Number(item.clicks || 0)),
        backgroundColor: charts.colors.blue,
        borderRadius: 4
      },
      {
        label: 'Tiếp cận',
        data: insights.map(item => Number(item.reach || 0)),
        backgroundColor: charts.colors.orange,
        borderRadius: 4
      }
    ]);
  }

  function setDraftStatus(html, cssClass = '') {
    const box = document.getElementById('adsDraftStatusBox');
    if (!box) return;
    box.className = `result-box ${cssClass}`.trim();
    box.innerHTML = html;
  }

  function renderDraftSelectors() {
    const campaignSelect = document.getElementById('adSetDraftCampaignSelect');
    const adSetSelect = document.getElementById('adDraftAdSetSelect');
    const pageSelect = document.getElementById('adDraftPageSelect');

    if (campaignSelect) {
      campaignSelect.innerHTML = '<option value="">-- Chọn campaign draft --</option>' + state.drafts.campaigns.map(campaign => `
        <option value="${campaign.id}">${escapeHtml(campaign.name || campaign.id)}</option>
      `).join('');
    }

    if (adSetSelect) {
      adSetSelect.innerHTML = '<option value="">-- Chọn ad set draft --</option>' + state.drafts.adSets.map(adSet => `
        <option value="${adSet.id}">${escapeHtml(adSet.name || adSet.id)}</option>
      `).join('');
    }

    if (pageSelect) {
      const pages = window.app?.data?.pages || [];
      pageSelect.innerHTML = '<option value="">-- Chọn page --</option>' + pages.map(page => `
        <option value="${page.id}">${escapeHtml(page.name || page.id)}</option>
      `).join('');
    }
  }

  function renderDraftsTable() {
    const thead = document.querySelector('#adsDraftsTable thead');
    const tbody = document.querySelector('#adsDraftsTable tbody');
    if (!tbody) return;
    const isReadOnly = window.app?.data?.appState?.readOnly === true;

    const rows = [
      ...state.drafts.campaigns.map(item => ({
        id: item.id,
        kind: 'campaigns',
        type: 'Campaign',
        name: item.name,
        parent: item.ad_account_name || item.ad_account_id || '-',
        goal: item.objective || '-',
        budget: Number(item.daily_budget || item.lifetime_budget || 0),
        metaStatus: item.meta_status || 'PAUSED',
        metaId: item.meta_campaign_id || '',
        created: item.created_at
      })),
      ...state.drafts.adSets.map(item => ({
        id: item.id,
        kind: 'adsets',
        type: 'Nhóm quảng cáo',
        name: item.name,
        parent: item.campaign_name || item.campaign_draft_id || '-',
        goal: item.optimization_goal || '-',
        budget: Number(item.daily_budget || item.lifetime_budget || 0),
        metaStatus: item.meta_status || 'PAUSED',
        metaId: item.meta_ad_set_id || '',
        created: item.created_at
      })),
      ...state.drafts.ads.map(item => ({
        id: item.id,
        kind: 'ads',
        type: 'Quảng cáo',
        name: item.name,
        parent: item.ad_set_name || item.ad_set_draft_id || '-',
        goal: item.call_to_action || '-',
        budget: 0,
        metaStatus: item.meta_status || 'PAUSED',
        metaId: item.meta_ad_id || '',
        created: item.created_at
      }))
    ];
    const hasMetaId = rows.some(row => row.metaId);
    const columnCount = hasMetaId ? 9 : 8;

    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Loại</th>
          <th>Tên</th>
          <th>Cha</th>
          <th>Mục tiêu</th>
          <th>Ngân sách</th>
          <th>Trạng thái khi publish</th>
          <th>Ngày tạo</th>
          ${hasMetaId ? '<th>ID sau publish</th>' : ''}
          <th>Thao tác</th>
        </tr>
      `;
    }

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-state">Chưa có kế hoạch publish nào cho ad account này.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => `
      <tr>
        <td><span class="role-badge">${escapeHtml(row.type)}</span></td>
        <td><strong>${escapeHtml(row.name || '-')}</strong></td>
        <td>${escapeHtml(row.parent || '-')}</td>
        <td>${escapeHtml(row.goal || '-')}</td>
        <td>${row.budget ? formatNumber(row.budget) : '-'}</td>
        <td>
          <select class="inline-select draft-meta-status-select" data-kind="${row.kind}" data-id="${row.id}">
            ${renderMetaStatusOptions(row.metaStatus)}
          </select>
        </td>
        <td>${row.created ? new Date(row.created).toLocaleString('vi-VN') : '-'}</td>
        ${hasMetaId ? `<td>${row.metaId ? `<code>${escapeHtml(row.metaId)}</code>` : '-'}</td>` : ''}
        <td>
          ${row.metaId
            ? '<button class="btn btn-secondary" disabled>Đã publish</button>'
            : isReadOnly
              ? '<button class="btn btn-secondary" disabled>READ ONLY</button>'
              : `<button class="btn btn-primary draft-action-btn" data-action="publish" data-kind="${row.kind}" data-id="${row.id}">Publish Meta</button>`}
          <button class="btn btn-secondary draft-action-btn" data-action="edit" data-kind="${row.kind}" data-id="${row.id}">Sửa</button>
          <button class="btn btn-secondary draft-action-btn" data-action="duplicate" data-kind="${row.kind}" data-id="${row.id}">Nhân bản</button>
          <button class="btn btn-danger draft-action-btn" data-action="delete" data-kind="${row.kind}" data-id="${row.id}">Xóa</button>
        </td>
      </tr>
    `).join('');
  }

  async function loadDrafts() {
    const accountId = state.selectedAccountId;
    const params = accountId ? `?ad_account_id=${encodeURIComponent(accountId)}` : '';
    const response = await fetch(`/api/ads/drafts${params}`);
    const payload = await response.json();
    state.drafts = payload.data || { campaigns: [], adSets: [], ads: [] };
    renderDraftSelectors();
    renderDraftsTable();
  }

  function renderBudgetReport(report) {
    const summaryBox = document.getElementById('adsBudgetSummaryBox');
    const recommendationsBox = document.getElementById('adsBudgetRecommendationsBox');
    const tbody = document.querySelector('#adsBudgetTable tbody');
    const budgetDraftsBody = document.querySelector('#adsBudgetDraftsTable tbody');
    if (!summaryBox || !tbody) return;

    if (!report) {
      summaryBox.innerHTML = 'Chọn ad account để xem báo cáo ngân sách.';
      if (recommendationsBox) recommendationsBox.innerHTML = '';
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Chưa có báo cáo ngân sách.</td></tr>';
      if (budgetDraftsBody) budgetDraftsBody.innerHTML = '<tr><td colspan="6" class="empty-state">Chưa có bản nháp thay đổi ngân sách.</td></tr>';
      return;
    }

    const currency = report.account?.currency || 'USD';
    const totals = report.totals || {};
    const recommendations = report.recommendations || [];
    const recByAdSet = recommendations.reduce((acc, rec) => {
      if (rec.ad_set_id) acc[rec.ad_set_id] = rec;
      return acc;
    }, {});
    const checklistHtml = (report.checklist || []).map(item => `
      <div class="audit-check ${escapeHtml(item.severity || 'info')}">
        <strong>${escapeHtml(item.title || '')}</strong>
        <span>${escapeHtml(item.detail || '')}</span>
        <span>${escapeHtml(item.action || '')}</span>
      </div>
    `).join('');
    const alerts = report.alerts || [];
    const alertsPreview = alerts.slice(0, 8).map(item => `
      <div class="audit-check ${escapeHtml(item.severity || 'info')}">
        <strong>${escapeHtml(item.title || '')}</strong>
        <span>${escapeHtml(item.entity_name || '')}: ${escapeHtml(item.detail || '')}</span>
        <span>${escapeHtml(item.action || '')}</span>
      </div>
    `).join('');
    const alertsByEntity = alerts.reduce((acc, alert) => {
      if (!alert.entity_id) return acc;
      if (!acc[alert.entity_id]) acc[alert.entity_id] = [];
      acc[alert.entity_id].push(alert);
      return acc;
    }, {});
    const severityScore = { high: 3, medium: 2, low: 1, info: 0 };
    const alertFilter = getBudgetAlertFilter();
    const rowLimit = getBudgetRowLimit();
    const filteredRows = (report.rows || []).filter(row => {
      const entityAlerts = alertsByEntity[row.id] || [];
      if (alertFilter === 'none') return entityAlerts.length === 0;
      if (alertFilter === 'high') return entityAlerts.some(item => item.severity === 'high');
      if (alertFilter === 'medium') return entityAlerts.some(item => ['high', 'medium'].includes(item.severity));
      return true;
    }).sort((a, b) => {
      const aScore = Math.max(...(alertsByEntity[a.id] || []).map(item => severityScore[item.severity] ?? 0), -1);
      const bScore = Math.max(...(alertsByEntity[b.id] || []).map(item => severityScore[item.severity] ?? 0), -1);
      if (bScore !== aScore) return bScore - aScore;
      if ((b.spend || 0) !== (a.spend || 0)) return (b.spend || 0) - (a.spend || 0);
      return (b.utilization || 0) - (a.utilization || 0);
    });
    const visibleRows = rowLimit === 'all' ? filteredRows : filteredRows.slice(0, Number(rowLimit) || 25);

    summaryBox.innerHTML = `
      <div class="ads-context-bar">
        <span class="ads-context-pill"><strong>Nhóm đang chạy:</strong> ${formatNumber(totals.active_ad_sets || 0)}</span>
        <span class="ads-context-pill currency"><strong>Ngân sách ngày:</strong> ${formatCurrency(totals.daily_budget || 0, currency)}</span>
        <span class="ads-context-pill"><strong>Chi tiêu:</strong> ${formatCurrency(totals.spend || 0, currency)}</span>
        <span class="ads-context-pill scope"><strong>Mức dùng:</strong> ${formatPercent(totals.utilization || 0)}</span>
        <span class="ads-context-pill"><strong>Cảnh báo:</strong> ${formatNumber(alerts.length)}</span>
        <span class="ads-context-pill"><strong>Dòng hiển thị:</strong> ${formatNumber(visibleRows.length)}/${formatNumber(filteredRows.length)}</span>
      </div>
      <div class="audit-checklist" style="margin-top: 0.875rem;">${checklistHtml}</div>
      ${alertsPreview ? `<div class="audit-section"><h4>Cảnh báo ngân sách</h4><div class="audit-checklist">${alertsPreview}</div></div>` : ''}
    `;

    if (recommendationsBox) {
      const topRecommendations = recommendations.slice(0, 8);
      recommendationsBox.innerHTML = topRecommendations.length === 0 ? `
        <div class="audit-section">
          <h4>Khuyến nghị ngân sách</h4>
          <div class="audit-check ok">
            <strong>Không có khuyến nghị mới</strong>
            <span>Dữ liệu local hiện tại chưa phát hiện ad set cần tạo draft thay đổi budget.</span>
          </div>
        </div>
      ` : `
        <div class="audit-section">
          <h4>Khuyến nghị ngân sách</h4>
          <div class="budget-recommendation-grid">
            ${topRecommendations.map((item, index) => `
              <div class="audit-action budget-recommendation-card">
                <strong>${escapeHtml(item.ad_set_name || item.ad_set_id)} <span class="role-badge">${escapeHtml(labelPriority(item.priority))}</span></strong>
                <span>${escapeHtml(item.rationale || '')}</span>
                <span>${escapeHtml(item.next_step || '')}</span>
                <span>Hiện tại: ${formatCurrency(item.current_daily_budget || item.current_lifetime_budget || 0, currency)} | Đề xuất: ${formatCurrency(item.proposed_daily_budget || item.proposed_lifetime_budget || 0, currency)}</span>
                <button class="btn btn-secondary budget-rec-draft-btn" data-index="${index}">Tạo bản nháp ngân sách</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (budgetDraftsBody) {
      const budgetDrafts = report.budget_change_drafts || [];
      budgetDraftsBody.innerHTML = budgetDrafts.length === 0
        ? '<tr><td colspan="6" class="empty-state">Chưa có bản nháp thay đổi ngân sách.</td></tr>'
        : budgetDrafts.map(item => `
          <tr>
            <td><strong>${escapeHtml(item.ad_set_name || item.ad_set_id || '-')}</strong></td>
            <td><span class="role-badge">${escapeHtml(labelBudgetAction(item.recommended_action || 'inspect'))}</span></td>
            <td>${formatCurrency(item.current_daily_budget || item.current_lifetime_budget || 0, item.currency || currency)}</td>
            <td>${formatCurrency(item.proposed_daily_budget || item.proposed_lifetime_budget || 0, item.currency || currency)}</td>
            <td>${item.updated_at ? new Date(item.updated_at).toLocaleString('vi-VN') : '-'}</td>
            <td><button class="btn btn-danger budget-draft-delete-btn" data-id="${item.id}">Xóa</button></td>
          </tr>
        `).join('');
    }

    if (!report.rows || report.rows.length === 0 || visibleRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Không có dòng budget phù hợp filter hiện tại.</td></tr>';
      return;
    }

    tbody.innerHTML = visibleRows.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.name || row.id)}</strong></td>
        <td><span class="role-badge">${escapeHtml(row.effective_status || row.status || '-')}</span></td>
        <td>${row.budget_type === 'none' ? '-' : formatCurrency(row.estimated_period_budget || 0, currency)}</td>
        <td>${formatCurrency(row.spend || 0, currency)}</td>
        <td>${formatPercent(row.utilization || 0)}</td>
        <td>${formatPercent(row.ctr || 0)}</td>
        <td>${formatNumber(row.frequency || 0)}</td>
        <td>${(alertsByEntity[row.id] || []).map(item => `<span class="role-badge">${escapeHtml(labelPriority(item.severity))}</span>`).join(' ') || '-'}</td>
        <td>${recByAdSet[row.id] ? `<span class="role-badge">${escapeHtml(labelBudgetAction(recByAdSet[row.id].recommended_action))}</span><br><small>${escapeHtml(labelPriority(recByAdSet[row.id].priority || ''))}</small>` : '-'}</td>
      </tr>
    `).join('');
  }

  async function loadBudgetReport() {
    const accountId = state.selectedAccountId;
    if (!accountId) {
      renderBudgetReport(null);
      return;
    }

    const days = getSelectedDays();
    const response = await fetch(`/api/ads/accounts/${accountId}/budget-report?days=${encodeURIComponent(days)}`);
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    state.budgetReport = payload.data || null;
    renderBudgetReport(state.budgetReport);
  }

  function flattenReportGroups(groups = {}, labelPrefix = '') {
    return Object.entries(groups).flatMap(([type, rows]) => (rows || []).map(row => ({
      type: labelPrefix ? `${labelPrefix}: ${type}` : type,
      row
    })));
  }

  function renderPerformanceReport(report) {
    const box = document.getElementById('adsPerformanceReportBox');
    const winnersBody = document.querySelector('#adsWinnersTable tbody');
    const losersBody = document.querySelector('#adsLosersTable tbody');
    if (!box || !winnersBody || !losersBody) return;

    if (!report) {
      box.innerHTML = 'Chọn ad account để xem nhóm thắng / rủi ro.';
      winnersBody.innerHTML = '<tr><td colspan="7" class="empty-state">Chưa có nhóm thắng.</td></tr>';
      losersBody.innerHTML = '<tr><td colspan="7" class="empty-state">Chưa có nhóm rủi ro.</td></tr>';
      return;
    }

    const account = state.accounts.find(item => item.id === report.adAccountId);
    const currency = account?.currency || 'USD';
    const totals = report.totals || {};
    box.innerHTML = `
      <div class="ads-context-bar">
        <span class="ads-context-pill"><strong>Mức xem:</strong> ${escapeHtml(report.level || '-')}</span>
        <span class="ads-context-pill"><strong>Số dòng:</strong> ${formatNumber(report.rows?.length || 0)}</span>
        <span class="ads-context-pill currency"><strong>Chi tiêu:</strong> ${formatCurrency(totals.spend || 0, currency)}</span>
        <span class="ads-context-pill scope"><strong>CTR:</strong> ${formatPercent(totals.ctr || 0)}</span>
        <span class="ads-context-pill"><strong>CPC:</strong> ${formatCurrency(totals.cpc || 0, currency)}</span>
      </div>
    `;

    const winners = flattenReportGroups(report.winners);
    winnersBody.innerHTML = winners.length === 0
      ? '<tr><td colspan="7" class="empty-state">Chưa có nhóm thắng đủ dữ liệu.</td></tr>'
      : winners.map(item => {
        const row = item.row;
        return `
          <tr>
            <td>${escapeHtml(labelReportType(item.type))}</td>
            <td><strong>${escapeHtml(row.entity_name || row.entity_id || '-')}</strong></td>
            <td>${formatCurrency(row.spend || 0, currency)}</td>
            <td>${formatPercent(row.ctr || 0)}</td>
            <td>${formatCurrency(row.cpc || 0, currency)}</td>
            <td>${formatNumber(row.results || 0)}</td>
            <td>${formatNumber(row.purchase_roas || 0)}</td>
          </tr>
        `;
      }).join('');

    const loserActions = {
      spend_no_clicks: 'Kiểm tra creative, objective và placement trước khi tăng chi tiêu.',
      low_ctr_spenders: 'Test hook mạnh hơn và khớp thông điệp với audience rõ hơn.',
      high_cpc: 'So với CPC trung bình rồi tinh chỉnh targeting hoặc creative.',
      high_frequency: 'Làm mới creative hoặc mở rộng audience.',
      low_roas: 'Kiểm tra offer, landing page và tracking chuyển đổi.'
    };
    const losers = flattenReportGroups(report.losers);
    losersBody.innerHTML = losers.length === 0
      ? '<tr><td colspan="7" class="empty-state">Chưa có mục rủi ro rõ ràng.</td></tr>'
      : losers.map(item => {
        const row = item.row;
        return `
          <tr>
            <td>${escapeHtml(labelReportType(item.type))}</td>
            <td><strong>${escapeHtml(row.entity_name || row.entity_id || '-')}</strong></td>
            <td>${formatCurrency(row.spend || 0, currency)}</td>
            <td>${formatPercent(row.ctr || 0)}</td>
            <td>${formatCurrency(row.cpc || 0, currency)}</td>
            <td>${formatNumber(row.frequency || 0)}</td>
            <td>${escapeHtml(loserActions[item.type] || 'Kiểm tra mục này trước khi scale.')}</td>
          </tr>
        `;
      }).join('');
  }

  async function loadPerformanceReport() {
    const accountId = state.selectedAccountId;
    if (!accountId) {
      renderPerformanceReport(null);
      return;
    }
    const days = getSelectedDays();
    const level = getSelectedLevel();
    const response = await fetch(`/api/ads/accounts/${accountId}/performance-report?level=${encodeURIComponent(level)}&days=${encodeURIComponent(days)}`);
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    state.performanceReport = payload.data || null;
    renderPerformanceReport(state.performanceReport);
  }

  async function postJson(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    return result.data;
  }

  async function sendJson(endpoint, method, payload = null) {
    const options = { method };
    if (payload) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(payload);
    }
    const response = await fetch(endpoint, options);
    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    return result.data;
  }

  function getDraftList(kind) {
    if (kind === 'campaigns') return state.drafts.campaigns;
    if (kind === 'adsets') return state.drafts.adSets;
    return state.drafts.ads;
  }

  function buildDraftEditPayload(kind, draft) {
    const nextName = prompt('Tên draft:', draft.name || '');
    if (nextName === null) return null;

    if (kind === 'campaigns') {
      const nextObjective = prompt('Mục tiêu:', draft.objective || 'OUTCOME_ENGAGEMENT');
      if (nextObjective === null) return null;
      const nextBudget = prompt('Ngân sách ngày:', draft.daily_budget || 0);
      if (nextBudget === null) return null;
      return {
        name: nextName.trim(),
        objective: nextObjective.trim(),
        daily_budget: Number(nextBudget || 0),
        meta_status: draft.meta_status || 'PAUSED'
      };
    }

    if (kind === 'adsets') {
      const nextGoal = prompt('Mục tiêu tối ưu:', draft.optimization_goal || 'POST_ENGAGEMENT');
      if (nextGoal === null) return null;
      const nextBudget = prompt('Ngân sách ngày:', draft.daily_budget || 0);
      if (nextBudget === null) return null;
      return {
        name: nextName.trim(),
        optimization_goal: nextGoal.trim(),
        daily_budget: Number(nextBudget || 0),
        meta_status: draft.meta_status || 'PAUSED'
      };
    }

    const nextHeadline = prompt('Tiêu đề:', draft.headline || '');
    if (nextHeadline === null) return null;
    const nextMessage = prompt('Nội dung chính:', draft.message || '');
    if (nextMessage === null) return null;
    const nextUrl = prompt('URL đích:', draft.destination_url || '');
    if (nextUrl === null) return null;
    const nextAsset = prompt('Asset URL:', draft.asset_url || '');
    if (nextAsset === null) return null;
    return {
      name: nextName.trim(),
      headline: nextHeadline.trim(),
      message: nextMessage.trim(),
      destination_url: nextUrl.trim(),
      asset_url: nextAsset.trim(),
      meta_status: draft.meta_status || 'PAUSED'
    };
  }

  function confirmDraftPublish(draft) {
    const metaStatus = String(draft.meta_status || 'PAUSED').toUpperCase();
    if (metaStatus === 'ACTIVE') {
      const typed = prompt('Draft này sẽ publish lên Meta với trạng thái ACTIVE và có thể chạy/spend ngay. Gõ ACTIVE để xác nhận:');
      return typed === 'ACTIVE';
    }

    return confirm('Publish draft này lên Meta với trạng thái PAUSED? Ad sẽ được tạo thật nhưng chưa chạy.');
  }

  async function handleDraftAction(event) {
    const button = event.target.closest('.draft-action-btn');
    if (!button) return;

    const { action, kind, id } = button.dataset;
    const draft = getDraftList(kind).find(item => item.id === id);
    if (!draft) {
      setDraftStatus('<span class="error">Không tìm thấy draft.</span>');
      return;
    }

    try {
      if (action === 'edit') {
        const payload = buildDraftEditPayload(kind, draft);
        if (!payload) return;
        await sendJson(`/api/ads/drafts/${kind}/${encodeURIComponent(id)}`, 'PUT', payload);
        setDraftStatus('<span class="success">Đã cập nhật draft.</span>');
      } else if (action === 'duplicate') {
        await postJson(`/api/ads/drafts/${kind}/${encodeURIComponent(id)}/duplicate`, {});
        setDraftStatus('<span class="success">Đã nhân bản draft.</span>');
      } else if (action === 'delete') {
        if (!confirm('Xóa draft này? Các draft con cũng có thể bị xóa.')) return;
        await sendJson(`/api/ads/drafts/${kind}/${encodeURIComponent(id)}`, 'DELETE');
        setDraftStatus('<span class="success">Đã xóa draft.</span>');
      } else if (action === 'publish') {
        if (!confirmDraftPublish(draft)) return;
        await postJson(`/api/ads/drafts/${kind}/${encodeURIComponent(id)}/publish`, {
          meta_status: draft.meta_status || 'PAUSED'
        });
        setDraftStatus(`<span class="success">Đã publish lên Meta với trạng thái ${escapeHtml(labelMetaStatus(draft.meta_status || 'PAUSED'))}.</span>`);
      }
      await loadDrafts();
      await loadInventory();
    } catch (error) {
      setDraftStatus(`<span class="error">Thao tác với draft thất bại: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function handleDraftMetaStatusChange(event) {
    const select = event.target.closest('.draft-meta-status-select');
    if (!select) return;

    const { kind, id } = select.dataset;
    try {
      await sendJson(`/api/ads/drafts/${kind}/${encodeURIComponent(id)}`, 'PUT', {
        meta_status: select.value
      });
      setDraftStatus(`<span class="success">Đã đổi trạng thái tạo qua API sang ${escapeHtml(labelMetaStatus(select.value))}.</span>`);
      await loadDrafts();
    } catch (error) {
      setDraftStatus(`<span class="error">Không đổi được trạng thái tạo qua API: ${escapeHtml(error.message)}</span>`);
      await loadDrafts();
    }
  }

  async function createBudgetChangeDraft(event) {
    const button = event.target.closest('.budget-rec-draft-btn');
    if (!button) return;

    const index = Number(button.dataset.index);
    const recommendation = state.budgetReport?.recommendations?.[index];
    if (!recommendation || !state.selectedAccountId) {
      setStatus('<span class="error">Không tìm thấy khuyến nghị ngân sách.</span>');
      return;
    }

    try {
      await postJson('/api/ads/budget-change-drafts', {
        ...recommendation,
        ad_account_id: state.selectedAccountId
      });
      setStatus('<span class="success">Đã tạo bản nháp thay đổi ngân sách nội bộ.</span>');
      await loadBudgetReport();
    } catch (error) {
      setStatus(`<span class="error">Không tạo được bản nháp ngân sách: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function handleBudgetDraftDelete(event) {
    const button = event.target.closest('.budget-draft-delete-btn');
    if (!button) return;
    if (!confirm('Xóa bản nháp thay đổi ngân sách này?')) return;

    try {
      await sendJson(`/api/ads/budget-change-drafts/${encodeURIComponent(button.dataset.id)}`, 'DELETE');
      setStatus('<span class="success">Đã xóa bản nháp thay đổi ngân sách.</span>');
      await loadBudgetReport();
    } catch (error) {
      setStatus(`<span class="error">Không xóa được bản nháp ngân sách: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function saveBudgetSnapshot() {
    const accountId = state.selectedAccountId;
    if (!accountId) {
      setStatus('<span class="error">Chọn ad account trước khi lưu snapshot.</span>');
      return;
    }

    try {
      const days = Number(getSelectedDays() || 30);
      await postJson(`/api/ads/accounts/${encodeURIComponent(accountId)}/budget-snapshot`, { days });
      setStatus('<span class="success">Đã lưu budget snapshot nội bộ.</span>');
      await loadBudgetReport();
    } catch (error) {
      setStatus(`<span class="error">Không lưu được budget snapshot: ${escapeHtml(error.message)}</span>`);
    }
  }

  function exportBudgetAudit(format) {
    const accountId = state.selectedAccountId;
    if (!accountId) {
      setStatus('<span class="error">Chọn ad account trước khi xuất audit ngân sách.</span>');
      return;
    }

    const days = getSelectedDays();
    window.location.href = `/api/export/ads/accounts/${encodeURIComponent(accountId)}/budget-audit.${format}?days=${encodeURIComponent(days)}`;
  }

  async function uploadDraftAssetIfNeeded() {
    const fileInput = document.getElementById('adDraftAssetFile');
    const manualUrl = document.getElementById('adDraftAssetUrl')?.value.trim() || '';

    if (!fileInput?.files?.length) {
      return {
        asset_url: manualUrl,
        asset_type: manualUrl.toLowerCase().match(/\.(mp4|mov|webm)(\?|$)/) ? 'video' : manualUrl ? 'image' : ''
      };
    }

    const formData = new FormData();
    formData.append('assetFile', fileInput.files[0]);
    const response = await fetch('/api/ads/drafts/assets', {
      method: 'POST',
      body: formData
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload.data || {};
  }

  async function createCampaignDraft(event) {
    event.preventDefault();
    const accountId = state.selectedAccountId;
    const name = document.getElementById('campaignDraftName')?.value.trim() || '';
    if (!accountId || !name) {
      setDraftStatus('<span class="error">Chọn ad account và nhập tên campaign.</span>');
      return;
    }

    try {
      setDraftStatus('<div class="loading">Đang lưu campaign draft...</div>');
      await postJson('/api/ads/drafts/campaigns', {
        ad_account_id: accountId,
        name,
        objective: document.getElementById('campaignDraftObjective')?.value || 'OUTCOME_ENGAGEMENT',
        daily_budget: Number(document.getElementById('campaignDraftDailyBudget')?.value || 0),
        meta_status: document.getElementById('campaignDraftMetaStatus')?.value || 'PAUSED'
      });
      document.getElementById('campaignDraftName').value = '';
      await loadDrafts();
      setDraftStatus('<span class="success">Đã lưu campaign draft.</span>');
    } catch (error) {
      setDraftStatus(`<span class="error">Không lưu được campaign draft: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function createAdSetDraft(event) {
    event.preventDefault();
    const campaignDraftId = document.getElementById('adSetDraftCampaignSelect')?.value || '';
    const name = document.getElementById('adSetDraftName')?.value.trim() || '';
    if (!campaignDraftId || !name) {
      setDraftStatus('<span class="error">Chọn campaign draft và nhập tên ad set.</span>');
      return;
    }

    try {
      const countries = (document.getElementById('adSetDraftCountries')?.value || 'VN')
        .split(',')
        .map(item => item.trim().toUpperCase())
        .filter(Boolean);
      const ageMin = Number(document.getElementById('adSetDraftAgeMin')?.value || 18);
      const ageMax = Number(document.getElementById('adSetDraftAgeMax')?.value || 65);
      setDraftStatus('<div class="loading">Đang lưu ad set draft...</div>');
      await postJson('/api/ads/drafts/adsets', {
        campaign_draft_id: campaignDraftId,
        name,
        optimization_goal: document.getElementById('adSetDraftOptimization')?.value || 'POST_ENGAGEMENT',
        billing_event: 'IMPRESSIONS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        daily_budget: Number(document.getElementById('adSetDraftDailyBudget')?.value || 0),
        targeting: {
          geo_locations: { countries: countries.length > 0 ? countries : ['VN'] },
          age_min: Math.min(ageMin, ageMax),
          age_max: Math.max(ageMin, ageMax)
        },
        meta_status: document.getElementById('adSetDraftMetaStatus')?.value || 'PAUSED'
      });
      document.getElementById('adSetDraftName').value = '';
      await loadDrafts();
      setDraftStatus('<span class="success">Đã lưu ad set draft.</span>');
    } catch (error) {
      setDraftStatus(`<span class="error">Không lưu được ad set draft: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function createAdDraft(event) {
    event.preventDefault();
    const adSetDraftId = document.getElementById('adDraftAdSetSelect')?.value || '';
    const name = document.getElementById('adDraftName')?.value.trim() || '';
    if (!adSetDraftId || !name) {
      setDraftStatus('<span class="error">Chọn ad set draft và nhập tên ad.</span>');
      return;
    }

    try {
      setDraftStatus('<div class="loading">Đang lưu ad draft...</div>');
      const asset = await uploadDraftAssetIfNeeded();
      await postJson('/api/ads/drafts/ads', {
        ad_set_draft_id: adSetDraftId,
        page_id: document.getElementById('adDraftPageSelect')?.value || '',
        name,
        message: document.getElementById('adDraftMessage')?.value || '',
        headline: document.getElementById('adDraftHeadline')?.value || '',
        asset_url: asset.asset_url || '',
        asset_type: asset.asset_type || '',
        destination_url: document.getElementById('adDraftDestinationUrl')?.value || '',
        meta_status: document.getElementById('adDraftMetaStatus')?.value || 'PAUSED',
        call_to_action: 'LEARN_MORE'
      });
      ['adDraftName', 'adDraftMessage', 'adDraftHeadline', 'adDraftAssetUrl', 'adDraftDestinationUrl'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const fileInput = document.getElementById('adDraftAssetFile');
      if (fileInput) fileInput.value = '';
      await loadDrafts();
      setDraftStatus('<span class="success">Đã lưu ad draft.</span>');
    } catch (error) {
      setDraftStatus(`<span class="error">Không lưu được ad draft: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function loadAccounts() {
    const select = document.getElementById('adsAccountSelect');
    if (!select) return;

    const response = await fetch('/api/ads/accounts');
    const payload = await response.json();
    const accounts = payload.data || [];

    state.accounts = accounts;
    select.innerHTML = '<option value="">-- Chọn ad account --</option>' + accounts.map(account => `
      <option value="${account.id}">${escapeHtml(account.name)} (${escapeHtml(account.portfolio || '-')})${Number(account.breakdown_rows || 0) === 0 && Number(account.account_daily_rows || 0) > 0 ? ' [Cần đồng bộ lại]' : ''}</option>
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
        Gợi ý: thử <strong>Đồng bộ Ads</strong> với mốc 1095 ngày nếu account có delivery cũ.
      `, 'info');
      return;
    }

    setStatus(`
      <span class="success">Đã tải dữ liệu Ads cho ${escapeHtml(selectedAccount?.name || accountId)}.</span><br>
      ${state.accountInsights.length} dòng insight ngày của account, ${state.performanceRows.length} dòng tổng hợp theo ${escapeHtml(level)}, ${inventoryCount} dòng danh sách.
      ${Number(selectedAccount?.breakdown_rows || 0) === 0 && Number(selectedAccount?.account_daily_rows || 0) > 0 ? '<br><strong>Lưu ý:</strong> Account này đang có dữ liệu account-level nhưng chưa có breakdown mới. Cần bấm <strong>Đồng bộ Ads</strong> để nạp lại campaign/ad set/ad.' : ''}
      ${needsDeepSync ? '<br>Mức xem này cần đồng bộ sâu. Bấm <strong>Đồng bộ Ads</strong> khi đang ở mức xem này để nạp thêm ad set / ad insights.' : ''}
    `);
  }

  async function refreshAdsView() {
    try {
      setStatus('<div class="loading">Đang tải Ads...</div>');
      state.selectedAccountId = getSelectedAccountId();
      state.selectedLevel = getSelectedLevel();
      await loadInventory();
      await loadInsights();
      await loadBudgetReport();
      await loadPerformanceReport();
      await loadDrafts();
    } catch (error) {
      setStatus(`<span class="error">Lỗi Ads: ${escapeHtml(error.message)}</span>`);
    }
  }

  async function syncAds() {
    const days = getSelectedDays();
    const accountId = state.selectedAccountId;
    const includeDeepLevels = state.selectedLevel === 'adset' || state.selectedLevel === 'ad';

    try {
      setStatus('<div class="loading">Đang đồng bộ Ads từ Meta...</div>');
      if (!accountId) {
        throw new Error('Chọn ad account trước khi đồng bộ Ads');
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
        <span class="success">Đã đồng bộ Ads xong.</span><br>
        Ad account đã được đồng bộ cho cửa sổ ${days} ngày${includeDeepLevels ? ' và có nạp dữ liệu sâu' : ''}.
      `);

      const syncedAccountId = accountId;
      await loadAccounts();
      state.selectedAccountId = syncedAccountId;
      if (syncedAccountId) {
        document.getElementById('adsAccountSelect').value = syncedAccountId;
      }
      await refreshAdsView();
    } catch (error) {
      setStatus(`<span class="error">Đồng bộ Ads thất bại: ${escapeHtml(error.message)}</span>`);
    }
  }

  function exportAdsCsv() {
    const accountId = state.selectedAccountId;
    const days = getSelectedDays();
    const level = state.selectedLevel;

    if (!accountId) {
      setStatus('<span class="error">Chọn ad account trước khi xuất CSV.</span>');
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
    const budgetRefreshBtn = document.getElementById('adsBudgetRefreshBtn');
    const budgetSnapshotBtn = document.getElementById('adsBudgetSnapshotBtn');
    const budgetExportCsvBtn = document.getElementById('adsBudgetExportCsvBtn');
    const budgetExportMdBtn = document.getElementById('adsBudgetExportMdBtn');
    const budgetAlertFilter = document.getElementById('adsBudgetAlertFilter');
    const budgetRowLimit = document.getElementById('adsBudgetRowLimit');
    const budgetRecommendationsBox = document.getElementById('adsBudgetRecommendationsBox');
    const budgetDraftsTable = document.getElementById('adsBudgetDraftsTable');
    const performanceReportBtn = document.getElementById('adsPerformanceReportBtn');
    const draftsTable = document.getElementById('adsDraftsTable');
    const campaignDraftForm = document.getElementById('campaignDraftForm');
    const adSetDraftForm = document.getElementById('adSetDraftForm');
    const adDraftForm = document.getElementById('adDraftForm');

    if (!refreshBtn || !syncBtn || !exportBtn || !accountSelect || !daysSelect || !levelSelect) return;

    refreshBtn.addEventListener('click', refreshAdsView);
    syncBtn.addEventListener('click', syncAds);
    exportBtn.addEventListener('click', exportAdsCsv);
    if (budgetRefreshBtn) budgetRefreshBtn.addEventListener('click', loadBudgetReport);
    if (budgetSnapshotBtn) budgetSnapshotBtn.addEventListener('click', saveBudgetSnapshot);
    if (budgetExportCsvBtn) budgetExportCsvBtn.addEventListener('click', () => exportBudgetAudit('csv'));
    if (budgetExportMdBtn) budgetExportMdBtn.addEventListener('click', () => exportBudgetAudit('md'));
    if (budgetAlertFilter) budgetAlertFilter.addEventListener('change', () => renderBudgetReport(state.budgetReport));
    if (budgetRowLimit) budgetRowLimit.addEventListener('change', () => renderBudgetReport(state.budgetReport));
    if (budgetRecommendationsBox) budgetRecommendationsBox.addEventListener('click', createBudgetChangeDraft);
    if (budgetDraftsTable) {
      budgetDraftsTable.addEventListener('click', handleBudgetDraftDelete);
    }
    if (performanceReportBtn) performanceReportBtn.addEventListener('click', loadPerformanceReport);
    if (draftsTable) {
      draftsTable.addEventListener('click', handleDraftAction);
      draftsTable.addEventListener('change', handleDraftMetaStatusChange);
    }
    if (campaignDraftForm) campaignDraftForm.addEventListener('submit', createCampaignDraft);
    if (adSetDraftForm) adSetDraftForm.addEventListener('submit', createAdSetDraft);
    if (adDraftForm) adDraftForm.addEventListener('submit', createAdDraft);
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
    renderDraftSelectors();
    await refreshAdsView();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAdsTab().catch(error => {
      setStatus(`<span class="error">Khởi tạo tab Ads thất bại: ${escapeHtml(error.message)}</span>`);
    });
  });
})();

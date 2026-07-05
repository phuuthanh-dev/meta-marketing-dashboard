// Main application logic
class App {
  constructor() {
    this.data = {
      appState: null,
      summary: null,
      pages: [],
      aggregated: null
    };
    this.init();
  }

  async init() {
    this.setupTabs();
    await this.loadAppState();
    this.setupLogout();
    await this.loadData();
    this.render();
  }

  async loadAppState() {
    try {
      const response = await fetch('/api/app-state');
      const payload = await response.json();
      this.data.appState = payload.data || null;
      this.renderAppState();
    } catch (error) {
      console.error('Error loading app state:', error);
    }
  }

  setupTabs() {
    // Main Tabs (Level 1)
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active main tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active main content
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        const targetContent = document.getElementById(`${targetTab}-tab`);
        if (targetContent) targetContent.classList.add('active');

        document.dispatchEvent(new CustomEvent('app:tab-changed', {
          detail: { tab: targetTab }
        }));
      });
    });

    // Sub Tabs (Level 2)
    const subTabs = document.querySelectorAll('.sub-tab');
    subTabs.forEach(subTab => {
      subTab.addEventListener('click', () => {
        const targetSubTab = subTab.dataset.subtab;
        
        // Update active sub-tab buttons within the same nav
        const parentNav = subTab.closest('.sub-tabs');
        if (parentNav) {
          parentNav.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
          subTab.classList.add('active');
        }
        
        // Update active sub-content within the same parent tab-content
        const parentContent = subTab.closest('.tab-content');
        if (parentContent) {
          parentContent.querySelectorAll('.sub-tab-content').forEach(content => {
            content.classList.remove('active');
          });
          const targetContent = document.getElementById(`${targetSubTab}-tab`);
          if (targetContent) targetContent.classList.add('active');

          document.dispatchEvent(new CustomEvent('app:subtab-changed', {
            detail: { subtab: targetSubTab }
          }));
        }
      });
    });
  }

  async loadData() {
    // Load summary
    try {
      const summaryResponse = await api.getSummary();
      this.data.summary = summaryResponse;
    } catch (error) {
      console.error('Error loading summary:', error);
    }
    
    // Load pages
    try {
      const pagesResponse = await api.getPages();
      this.data.pages = pagesResponse.data || [];
    } catch (error) {
      console.error('Error loading pages:', error);
    }
    
    // Load aggregated metrics
    try {
      this.data.aggregated = await api.getAggregatedMetrics(30);
    } catch (error) {
      console.error('Error loading aggregated metrics:', error);
      this.data.aggregated = null;
    }
    
    // Không có data thì để null, không generate mock
    
    // Update last updated time
    const el = document.getElementById('lastUpdated');
    if (el) el.textContent = `Cập nhật: ${new Date().toLocaleString('vi-VN')}`;
  }

  generateDemoData() {
    // Generate 30 days of demo data
    const metrics = [];
    const today = new Date();
    
    for (let i = 30; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      metrics.push({
        date: dateStr,
        engagements: Math.floor(Math.random() * 5000) + 1000,
        video_views: Math.floor(Math.random() * 2000) + 500,
        total_actions: Math.floor(Math.random() * 3000) + 800,
        like_count: Math.floor(Math.random() * 2000) + 500,
        love_count: Math.floor(Math.random() * 800) + 200,
        wow_count: Math.floor(Math.random() * 300) + 50,
        haha_count: Math.floor(Math.random() * 500) + 100,
        sorry_count: Math.floor(Math.random() * 100) + 10,
        anger_count: Math.floor(Math.random() * 50) + 5
      });
    }
    
    const totals = {
      total_engagements: metrics.reduce((sum, m) => sum + m.engagements, 0),
      total_video_views: metrics.reduce((sum, m) => sum + m.video_views, 0),
      total_actions: metrics.reduce((sum, m) => sum + m.total_actions, 0),
      total_like: metrics.reduce((sum, m) => sum + m.like_count, 0),
      total_love: metrics.reduce((sum, m) => sum + m.love_count, 0),
      total_wow: metrics.reduce((sum, m) => sum + m.wow_count, 0),
      total_haha: metrics.reduce((sum, m) => sum + m.haha_count, 0),
      total_sorry: metrics.reduce((sum, m) => sum + m.sorry_count, 0),
      total_anger: metrics.reduce((sum, m) => sum + m.anger_count, 0)
    };
    
    return { metrics, totals };
  }

  render() {
    this.renderAppState();
    this.renderSummary();
    this.renderPagesTable();
    this.renderCharts();
    this.renderReactionsStats();
  }

  renderAppState() {
    const appState = this.data.appState || {};
    const modeBadge = document.getElementById('appModeBadge');
    const logoutBtn = document.getElementById('logoutBtn');

    if (modeBadge) {
      const username = appState.username ? ` | ${appState.username}` : '';
      modeBadge.textContent = appState.readOnly ? `READ ONLY${username}` : `OPERATOR${username}`;
    }

    if (logoutBtn) {
      logoutBtn.style.display = 'inline-flex';
    }

    if (appState.readOnly) {
      ['posts', 'comments', 'messages', 'media', 'page-management', 'automation'].forEach(tabName => {
        const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        const content = document.getElementById(`${tabName}-tab`);
        if (tab) tab.style.display = 'none';
        if (content) content.style.display = 'none';
      });
    }
  }

  setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Logout failed:', error);
      }

      window.location.href = '/login';
    });
  }

  renderSummary() {
    if (!this.data.summary) return;
    
    const { total_pages, total_fans, total_followers, portfolios } = this.data.summary;
    
    document.getElementById('totalPages').textContent = charts.formatNumber(total_pages);
    document.getElementById('totalFans').textContent = charts.formatNumber(total_fans);
    document.getElementById('totalFollowers').textContent = charts.formatNumber(total_followers);
    document.getElementById('totalPortfolios').textContent = portfolios ? portfolios.length : 0;
  }

  renderPagesTable() {
    const tbody = document.querySelector('#pagesTable tbody');
    if (!tbody) return;
    
    if (this.data.pages.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <div class="empty-state-icon">📄</div>
            <div>Chưa có dữ liệu pages</div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = this.data.pages.map(page => `
      <tr>
        <td><strong>${this.escapeHtml(page.name)}</strong></td>
        <td>${this.escapeHtml(page.portfolio || '-')}</td>
        <td>${this.escapeHtml(page.category || '-')}</td>
        <td>${charts.formatNumber(page.fan_count || 0)}</td>
        <td>${charts.formatNumber(page.followers_count || 0)}</td>
        <td>${page.updated_at ? new Date(page.updated_at).toLocaleDateString('vi-VN') : '-'}</td>
      </tr>
    `).join('');
  }

  renderCharts() {
    if (!this.data.aggregated) return;
    
    const { metrics, totals } = this.data.aggregated;
    
    if (!metrics || metrics.length === 0) {
      this.showEmptyCharts();
      return;
    }
    
    const labels = metrics.map(m => charts.formatDate(m.date));
    
    // Engagements Chart
    charts.createLineChart('engagementsChart', labels, [{
      label: 'Post Engagements',
      data: metrics.map(m => m.engagements || 0),
      borderColor: this.colors.blue,
      backgroundColor: this.hexToRgba(this.colors.blue, 0.1),
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6
    }]);
    
    // Video Views Chart
    charts.createBarChart('videoViewsChart', labels, [{
      label: 'Video Views',
      data: metrics.map(m => m.video_views || 0),
      backgroundColor: this.colors.green,
      borderRadius: 4
    }]);
    
    // Total Actions Chart
    charts.createLineChart('totalActionsChart', labels, [{
      label: 'Total Actions',
      data: metrics.map(m => m.total_actions || 0),
      borderColor: this.colors.purple,
      backgroundColor: this.hexToRgba(this.colors.purple, 0.1),
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6
    }]);
    
    // Reactions Pie Chart
    charts.createPieChart('pageReactionsPie', 
      ['Like', 'Love', 'Wow', 'Haha', 'Sorry', 'Angry'],
      [totals.total_like || 0, totals.total_love || 0, totals.total_wow || 0, 
       totals.total_haha || 0, totals.total_sorry || 0, totals.total_anger || 0]
    );
    
    // Reactions Timeline Chart
    charts.createLineChart('reactionsTimelineChart', labels, [
      {
        label: 'Like',
        data: metrics.map(m => m.like_count || 0),
        borderColor: this.colors.blue,
        backgroundColor: 'transparent',
        tension: 0.4
      },
      {
        label: 'Love',
        data: metrics.map(m => m.love_count || 0),
        borderColor: this.colors.red,
        backgroundColor: 'transparent',
        tension: 0.4
      },
      {
        label: 'Wow',
        data: metrics.map(m => m.wow_count || 0),
        borderColor: this.colors.orange,
        backgroundColor: 'transparent',
        tension: 0.4
      }
    ]);
    
    // Post Reactions Pie
    charts.createPieChart('postReactionsPie',
      ['Like', 'Love', 'Wow', 'Haha'],
      [totals.total_like || 0, totals.total_love || 0, totals.total_wow || 0, totals.total_haha || 0]
    );
    
    // Post Clicks Chart
    charts.createBarChart('postClicksChart', labels, [
      {
        label: 'Video Views',
        data: metrics.map(m => m.video_views || 0),
        backgroundColor: this.colors.cyan,
        borderRadius: 4
      }
    ]);
  }

  renderReactionsStats() {
    if (!this.data.aggregated || !this.data.aggregated.totals) return;
    
    const t = this.data.aggregated.totals;
    
    document.getElementById('statLike').textContent = charts.formatNumber(t.total_like || 0);
    document.getElementById('statLove').textContent = charts.formatNumber(t.total_love || 0);
    document.getElementById('statWow').textContent = charts.formatNumber(t.total_wow || 0);
    document.getElementById('statHaha').textContent = charts.formatNumber(t.total_haha || 0);
    document.getElementById('statSorry').textContent = charts.formatNumber(t.total_sorry || 0);
    document.getElementById('statAngry').textContent = charts.formatNumber(t.total_anger || 0);
  }

  showEmptyCharts() {
    const emptyMessage = 'Chưa có dữ liệu';
    
    ['engagementsChart', 'videoViewsChart', 'totalActionsChart', 
     'pageReactionsPie', 'reactionsTimelineChart', 'postReactionsPie', 'postClicksChart'].forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '14px Roboto';
        ctx.fillStyle = '#67788A';
        ctx.textAlign = 'center';
        ctx.fillText(emptyMessage, canvas.width / 2, canvas.height / 2);
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  get colors() {
    return {
      blue: '#0082FB',
      green: '#00A856',
      purple: '#8B5CF6',
      orange: '#F59E0B',
      pink: '#EC4899',
      red: '#EF4444',
      cyan: '#06B6D4',
      indigo: '#6366F1'
    };
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

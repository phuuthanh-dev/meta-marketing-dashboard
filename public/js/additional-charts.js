// Additional Charts - Real data from Facebook API

class AdditionalCharts {
  constructor() {
    this.charts = {};
    this.currentPageId = null;
  }

  async init(pageId) {
    this.currentPageId = pageId;
    await this.loadAllCharts();
  }

  async loadAllCharts() {
    if (!this.currentPageId) return;

    await Promise.all([
      this.loadPageComparison(),
      this.loadEngagementRateChart(),
      this.loadVideoViewsBreakdownChart(),
      this.loadTotalActionsTrendChart(),
      this.loadPostFrequencyChart(),
      this.loadReactionRatioChart(),
      this.loadCommentsVsLikesChart(),
      this.loadCommentActivityChart(),
      this.loadGrowthRateChart(),
      this.loadPostLengthEngagementChart(),
      this.loadPeriodComparisonChart()
    ]);
  }

  async loadPageComparison() {
    try {
      const response = await fetch(`/api/reporting/page-comparison?days=${getAnalyticsDays()}`);
      const result = await response.json();

      if (result.error) {
        console.error('Page comparison error:', result.error);
        return;
      }

      const data = result.data || [];
      const chartRows = data.slice(0, 10);
      const labels = chartRows.map(item => item.pageName.length > 18 ? `${item.pageName.slice(0, 18)}...` : item.pageName);
      const engagements = chartRows.map(item => item.totalEngagements);

      charts.createBarChart('pageComparisonChart', labels, [{
        label: `Top Pages by Engagement (${result.days} days)`,
        data: engagements,
        backgroundColor: '#0082FB',
        borderRadius: 4
      }], {
        indexAxis: 'y',
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return value.toLocaleString();
              }
            }
          },
          y: {
            ticks: {
              autoSkip: false
            }
          }
        }
      });

      const tbody = document.querySelector('#pageComparisonTable tbody');
      if (!tbody) return;

      tbody.innerHTML = data.map(item => `
        <tr${item.pageId === this.currentPageId ? ' class="is-selected-page"' : ''}>
          <td><strong>${escapeHtml(item.pageName)}</strong></td>
          <td>${escapeHtml(item.portfolio || '-')}</td>
          <td>${item.postCount.toLocaleString('vi-VN')}</td>
          <td>${item.totalEngagements.toLocaleString('vi-VN')}</td>
          <td>${item.totalReactions.toLocaleString('vi-VN')}</td>
          <td>${item.totalVideoViews.toLocaleString('vi-VN')}</td>
          <td>${item.engagementRate.toLocaleString('vi-VN')}</td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Error loading page comparison:', error);
    }
  }

  // 1. Engagement Rate Trend - Line chart
  async loadEngagementRateChart() {
    try {
      let result;
      const days = getAnalyticsDays();

      const trendResponse = await fetch(`/api/pages/${this.currentPageId}/engagement-rate-trend?days=${days}`);
      if (trendResponse.ok) {
        result = await trendResponse.json();
      } else if (trendResponse.status === 404) {
        const fallbackResponse = await fetch(`/api/pages/${this.currentPageId}/engagement-rate?days=${days}`);
        const fallbackResult = await fallbackResponse.json();

        if (fallbackResult.error) {
          console.error('Engagement rate fallback error:', fallbackResult.error);
          return;
        }

        result = { data: this.transformLegacyEngagementRateData(fallbackResult.data || []) };
      } else {
        throw new Error(`HTTP ${trendResponse.status}: ${trendResponse.statusText}`);
      }
      
      if (result.error) {
        console.error('Engagement rate error:', result.error);
        return;
      }

      if (this.charts.engagementRate) {
        this.charts.engagementRate.destroy();
        this.charts.engagementRate = null;
      }

      if (!Array.isArray(result.data) || result.data.length === 0) {
        this.renderUnavailableState(
          'engagementRateTrendChart',
          'Engagement rate unavailable',
          result.meta?.reason || 'No historical engagement rate data is available yet.'
        );
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('engagementRateTrendChart');
      if (!ctx) return;

      if (this.charts.engagementRate) {
        this.charts.engagementRate.destroy();
      }

      this.charts.engagementRate = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => this.formatDate(d.date)),
          datasets: [{
            label: 'Engagement Rate (%)',
            data: data.map(d => d.engagementRate),
            borderColor: '#1877f2',
            backgroundColor: 'rgba(24, 119, 242, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                afterLabel: function(context) {
                  const d = data[context.dataIndex];
                  return [
                    `Engaged Users: ${d.engagedUsers ?? d.engagements ?? 0}`,
                    `Impressions: ${d.impressions ?? d.fans ?? 0}`
                  ];
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: function(value) { return value + '%'; } }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading engagement rate chart:', error);
    }
  }

  // 2. Post Frequency Analysis - Bar chart
  async loadPostFrequencyChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/post-frequency?days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Post frequency error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('postFrequencyChart');
      if (!ctx) return;

      if (this.charts.postFrequency) {
        this.charts.postFrequency.destroy();
      }

      this.charts.postFrequency = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => this.formatDate(d.date)),
          datasets: [{
            label: 'Posts',
            data: data.map(d => d.postCount),
            backgroundColor: '#42b72a',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                afterLabel: function(context) {
                  return `${context.raw} post(s)`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1 }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading post frequency chart:', error);
    }
  }

  async loadVideoViewsBreakdownChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/video-views-breakdown?days=${getAnalyticsDays()}`);
      const result = await response.json();

      if (result.error) {
        console.error('Video views breakdown error:', result.error);
        return;
      }

      const data = result.data || [];
      const ctx = document.getElementById('videoViewsBreakdownChart');
      if (!ctx) return;

      if (this.charts.videoViewsBreakdown) {
        this.charts.videoViewsBreakdown.destroy();
      }

      if (data.length === 0) {
        this.renderUnavailableState(
          'videoViewsBreakdownChart',
          'Video views breakdown unavailable',
          'No supported video view breakdown data is available for the selected period.'
        );
        return;
      }

      this.charts.videoViewsBreakdown = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => this.formatDate(d.date)),
          datasets: [
            {
              label: 'Total Views',
              data: data.map(d => d.totalViews),
              borderColor: '#1877f2',
              backgroundColor: 'rgba(24, 119, 242, 0.08)',
              tension: 0.35,
              fill: true
            },
            {
              label: 'Organic Views',
              data: data.map(d => d.organicViews),
              borderColor: '#42b72a',
              tension: 0.35
            },
            {
              label: 'Paid Views',
              data: data.map(d => d.paidViews),
              borderColor: '#f59e0b',
              tension: 0.35
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                afterLabel: function(context) {
                  const d = data[context.dataIndex];
                  return [
                    `Autoplayed: ${d.autoplayedViews.toLocaleString('vi-VN')}`,
                    `Click-to-play: ${d.clickToPlayViews.toLocaleString('vi-VN')}`
                  ];
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: function(value) { return value.toLocaleString(); } }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading video views breakdown chart:', error);
    }
  }

  async loadTotalActionsTrendChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/total-actions-trend?days=${getAnalyticsDays()}`);
      const result = await response.json();

      if (result.error) {
        console.error('Total actions trend error:', result.error);
        return;
      }

      const data = result.data || [];
      const ctx = document.getElementById('totalActionsTrendChart');
      if (!ctx) return;

      if (this.charts.totalActionsTrend) {
        this.charts.totalActionsTrend.destroy();
      }

      this.charts.totalActionsTrend = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => this.formatDate(d.date)),
          datasets: [
            {
              label: 'Total Actions',
              data: data.map(d => d.totalActions),
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.10)',
              tension: 0.35,
              fill: true
            },
            {
              label: 'Post Engagements',
              data: data.map(d => d.postEngagements),
              borderColor: '#1877f2',
              tension: 0.35
            },
            {
              label: 'Total Reactions',
              data: data.map(d => d.totalReactions),
              borderColor: '#ec4899',
              tension: 0.35
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: function(value) { return value.toLocaleString(); } }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading total actions trend chart:', error);
    }
  }

  // 3. Reaction Ratio Pie Chart - Doughnut chart
  async loadReactionRatioChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/reaction-ratio?days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Reaction ratio error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('reactionRatioChart');
      if (!ctx) return;

      if (this.charts.reactionRatio) {
        this.charts.reactionRatio.destroy();
      }

      const colors = {
        like: '#1877f2',
        love: '#f33e58',
        wow: '#f7b928',
        haha: '#f7b928',
        sorry: '#e97196',
        angry: '#e97196'
      };

      const labels = data.map(d => d.type.charAt(0).toUpperCase() + d.type.slice(1));
      const counts = data.map(d => d.count);
      const bgColors = data.map(d => colors[d.type] || '#ccc');

      this.charts.reactionRatio = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: counts,
            backgroundColor: bgColors,
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'right' },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const d = data[context.dataIndex];
                  return `${d.type}: ${d.count} (${d.percentage}%)`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading reaction ratio chart:', error);
    }
  }

  // 4. Comments vs Likes Comparison - Grouped bar chart
  async loadCommentsVsLikesChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/comments-vs-likes?limit=20&days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Comments vs likes error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('commentsVsLikesChart');
      if (!ctx) return;

      if (this.charts.commentsVsLikes) {
        this.charts.commentsVsLikes.destroy();
      }

      this.charts.commentsVsLikes = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => d.message || 'No text'),
          datasets: [
            {
              label: 'Likes',
              data: data.map(d => d.likes),
              backgroundColor: '#1877f2'
            },
            {
              label: 'Comments',
              data: data.map(d => d.comments),
              backgroundColor: '#42b72a'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                title: function(context) {
                  const idx = context[0].dataIndex;
                  return data[idx].message || 'No text';
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 45,
                callback: function(value, index) {
                  const label = this.getLabelForValue(value);
                  return label.length > 20 ? label.substring(0, 20) + '...' : label;
                }
              }
            },
            y: {
              beginAtZero: true,
              ticks: { callback: function(value) { return value.toLocaleString(); } }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading comments vs likes chart:', error);
    }
  }

  async loadCommentActivityChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/comment-activity?days=${getAnalyticsDays()}`);
      const result = await response.json();

      if (result.error) {
        console.error('Comment activity error:', result.error);
        return;
      }

      const data = result.data || [];
      const ctx = document.getElementById('commentActivityChart');
      if (!ctx) return;

      if (this.charts.commentActivity) {
        this.charts.commentActivity.destroy();
      }

      this.charts.commentActivity = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => this.formatDate(d.date)),
          datasets: [{
            label: 'Comments',
            data: data.map(d => d.comments),
            backgroundColor: '#06b6d4',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
                callback: function(value) { return value.toLocaleString(); }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading comment activity chart:', error);
    }
  }

  // 5. Growth Rate Chart - Line chart with positive/negative coloring
  async loadGrowthRateChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/growth-rate?days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Growth rate error:', result.error);
        return;
      }

      if (this.charts.growthRate) {
        this.charts.growthRate.destroy();
        this.charts.growthRate = null;
      }

      if (!Array.isArray(result.data) || result.data.length === 0) {
        this.renderUnavailableState(
          'growthRateChart',
          'Growth rate unavailable',
          result.meta?.reason || 'Historical growth data is unavailable.'
        );
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('growthRateChart');
      if (!ctx) return;

      if (this.charts.growthRate) {
        this.charts.growthRate.destroy();
      }

      this.charts.growthRate = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => this.formatDate(d.date)),
          datasets: [{
            label: 'Growth Rate (%)',
            data: data.map(d => d.growthRate),
            borderColor: '#1877f2',
            backgroundColor: function(context) {
              const chart = context.chart;
              const {ctx, chartArea} = chart;
              if (!chartArea) return 'rgba(24, 119, 242, 0.1)';
              const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, 'rgba(66, 183, 42, 0.3)');
              gradient.addColorStop(0.5, 'rgba(24, 119, 242, 0.1)');
              gradient.addColorStop(1, 'rgba(243, 62, 88, 0.3)');
              return gradient;
            },
            tension: 0.4,
            fill: true,
            pointBackgroundColor: data.map(d => d.growthRate >= 0 ? '#42b72a' : '#f33e58'),
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                afterLabel: function(context) {
                  const d = data[context.dataIndex];
                  return `Fans change: ${d.fansChange >= 0 ? '+' : ''}${d.fansChange}\nCurrent fans: ${d.currentFans}`;
                }
              }
            }
          },
          scales: {
            y: {
              ticks: { callback: function(value) { return value + '%'; } }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading growth rate chart:', error);
    }
  }

  // 6. Post Length vs Engagement - Scatter chart
  async loadPostLengthEngagementChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/post-length-engagement?limit=50&days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Post length engagement error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('postLengthEngagementChart');
      if (!ctx) return;

      if (this.charts.postLengthEngagement) {
        this.charts.postLengthEngagement.destroy();
      }

      this.charts.postLengthEngagement = new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Posts',
            data: data.map(d => ({ x: d.length, y: d.engagement })),
            backgroundColor: '#1877f2',
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const d = data[context.dataIndex];
                  return [
                    `Length: ${d.length} chars`,
                    `Engagement: ${d.engagement}`,
                    `Text: ${d.message}`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: 'Post Length (characters)' },
              beginAtZero: true
            },
            y: {
              title: { display: true, text: 'Engagement' },
              beginAtZero: true,
              ticks: { callback: function(value) { return value.toLocaleString(); } }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading post length engagement chart:', error);
    }
  }

  // 7. Weekly/Monthly Comparison - Grouped bar chart
  async loadPeriodComparisonChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/period-comparison?period=${getAnalyticsPeriod()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Period comparison error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('periodComparisonChart');
      if (!ctx) return;

      if (this.charts.periodComparison) {
        this.charts.periodComparison.destroy();
      }

      this.charts.periodComparison = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => {
            const date = new Date(d.week || d.month);
            return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          }),
          datasets: [
            {
              label: 'Engagements',
              data: data.map(d => d.totalEngagements),
              backgroundColor: '#1877f2',
              yAxisID: 'y'
            },
            {
              label: 'Reactions',
              data: data.map(d => d.totalReactions),
              backgroundColor: '#42b72a',
              yAxisID: 'y'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                afterLabel: function(context) {
                  const d = data[context.dataIndex];
                  return `Days: ${d.days}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: function(value) { return value.toLocaleString(); } }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading period comparison chart:', error);
    }
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }

  renderUnavailableState(canvasId, title, message) {
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

  transformLegacyEngagementRateData(insights) {
    const engagedMap = new Map();
    const impressionsMap = new Map();

    insights.forEach(insight => {
      if (!Array.isArray(insight.values)) return;

      if (insight.name === 'page_engaged_users') {
        insight.values.forEach(value => {
          if (!value.end_time) return;
          engagedMap.set(value.end_time, value.value || 0);
        });
      }

      if (insight.name === 'page_impressions') {
        insight.values.forEach(value => {
          if (!value.end_time) return;
          impressionsMap.set(value.end_time, value.value || 0);
        });
      }
    });

    return Array.from(engagedMap.keys()).sort().map(date => {
      const engagements = engagedMap.get(date) || 0;
      const impressions = impressionsMap.get(date) || 0;
      const denominator = impressions || 1;

      return {
        date: date.split('T')[0],
        engagementRate: Number(((engagements / denominator) * 100).toFixed(2)),
        engagements,
        fans: null
      };
    });
  }

  destroy() {
    Object.values(this.charts).forEach(chart => {
      if (chart) chart.destroy();
    });
    this.charts = {};
  }
}

// Initialize when page is selected
let additionalCharts = null;

function getAnalyticsDays() {
  return document.getElementById('analyticsDaysSelect')?.value || 30;
}

function getAnalyticsPeriod() {
  return document.getElementById('analyticsPeriodSelect')?.value || 'weekly';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function initAdditionalCharts(pageId) {
  if (!additionalCharts) {
    additionalCharts = new AdditionalCharts();
  }
  additionalCharts.init(pageId);
}

// Auto-initialize when page selector changes
document.addEventListener('DOMContentLoaded', () => {
  // Wait for pages to load
  const checkPages = setInterval(() => {
    if (window.app?.data?.pages?.length > 0) {
      clearInterval(checkPages);
      
      const pageSelect = document.getElementById('pageSelect');
      if (pageSelect) {
        // Auto-select first page
        if (window.app.data.pages.length > 0) {
          initAdditionalCharts(window.app.data.pages[0].id);
        }
        
        // Listen for changes
        pageSelect.addEventListener('change', (e) => {
          const pageId = e.target.value;
          if (pageId) {
            initAdditionalCharts(pageId);
          }
        });

        const daysSelect = document.getElementById('analyticsDaysSelect');
        if (daysSelect) {
          daysSelect.addEventListener('change', () => {
            if (pageSelect.value) {
              initAdditionalCharts(pageSelect.value);
            }
          });
        }

        const periodSelect = document.getElementById('analyticsPeriodSelect');
        if (periodSelect) {
          periodSelect.addEventListener('change', () => {
            if (pageSelect.value) {
              initAdditionalCharts(pageSelect.value);
            }
          });
        }
      }
    }
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => clearInterval(checkPages), 10000);
});

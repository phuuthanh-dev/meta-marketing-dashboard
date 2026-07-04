// Phase 3 Charts - Quick Wins Visualizations

class Phase3Charts {
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
      this.loadFanGrowthChart(),
      this.loadReactionsTimelineChart(),
      this.loadBestPostingTimesChart(),
      this.loadTopPostsChart(),
      this.loadDemographicsChart()
    ]);
  }

  // 1. Fan Growth Trend - Line Chart
  async loadFanGrowthChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/fan-growth?days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Fan growth error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('fanGrowthChart');
      if (!ctx) return;

      if (this.charts.fanGrowth) {
        this.charts.fanGrowth.destroy();
        this.charts.fanGrowth = null;
      }

      if (!Array.isArray(data) || data.length === 0) {
        const note = result.meta?.reason || 'Historical fan and follower trend is unavailable.';
        this.renderUnavailableState(ctx, 'Fan growth unavailable', note);
        return;
      }

      this.charts.fanGrowth = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => this.formatDate(d.date)),
          datasets: [
            {
              label: 'Fans',
              data: data.map(d => d.fans),
              borderColor: '#1877f2',
              backgroundColor: 'rgba(24, 119, 242, 0.1)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Followers',
              data: data.map(d => d.followers),
              borderColor: '#42b72a',
              backgroundColor: 'rgba(66, 183, 42, 0.1)',
              tension: 0.4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            y: {
              beginAtZero: false,
              ticks: {
                callback: function(value) {
                  return value.toLocaleString();
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading fan growth chart:', error);
    }
  }

  // 2. Reactions Breakdown Timeline - Stacked Area Chart
  async loadReactionsTimelineChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/reactions-timeline?days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Reactions timeline error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('advancedReactionsTimelineChart');
      if (!ctx) return;

      if (this.charts.reactionsTimeline) {
        this.charts.reactionsTimeline.destroy();
      }

      this.charts.reactionsTimeline = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => this.formatDate(d.date)),
          datasets: [
            {
              label: 'Like',
              data: data.map(d => d.like),
              borderColor: '#1877f2',
              backgroundColor: 'rgba(24, 119, 242, 0.5)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Love',
              data: data.map(d => d.love),
              borderColor: '#f33e58',
              backgroundColor: 'rgba(243, 62, 88, 0.5)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Wow',
              data: data.map(d => d.wow),
              borderColor: '#f7b928',
              backgroundColor: 'rgba(247, 185, 40, 0.5)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Haha',
              data: data.map(d => d.haha),
              borderColor: '#f7b928',
              backgroundColor: 'rgba(247, 185, 40, 0.3)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Sorry',
              data: data.map(d => d.sorry),
              borderColor: '#f7b928',
              backgroundColor: 'rgba(247, 185, 40, 0.2)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Angry',
              data: data.map(d => d.angry),
              borderColor: '#f33e58',
              backgroundColor: 'rgba(243, 62, 88, 0.3)',
              tension: 0.4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return value.toLocaleString();
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading reactions timeline chart:', error);
    }
  }

  // 3. Best Posting Times - Heatmap/Scatter
  async loadBestPostingTimesChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/best-posting-times?days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Best posting times error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('bestPostingTimesChart');
      if (!ctx) return;

      if (this.charts.bestPostingTimes) {
        this.charts.bestPostingTimes.destroy();
      }

      // Group by hour for each day of week
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const hours = Array.from({length: 24}, (_, i) => i);
      
      // Create matrix data
      const matrixData = [];
      data.forEach(item => {
        matrixData.push({
          x: item.hour,
          y: item.day,
          v: item.avgEngagement,
          count: item.postCount
        });
      });

      // Find max for color scaling
      const maxEngagement = Math.max(...matrixData.map(d => d.v), 1);

      this.charts.bestPostingTimes = new Chart(ctx, {
        type: 'bubble',
        data: {
          datasets: [{
            label: 'Engagement',
            data: matrixData.map(d => ({
              x: d.x,
              y: d.y,
              r: Math.max(3, (d.v / maxEngagement) * 15)
            })),
            backgroundColor: matrixData.map(d => {
              const intensity = d.v / maxEngagement;
              return `rgba(24, 119, 242, ${0.2 + intensity * 0.8})`;
            }),
            borderColor: '#1877f2'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const dataPoint = matrixData[context.dataIndex];
                  return [
                    `Day: ${days[dataPoint.y]}`,
                    `Hour: ${dataPoint.x}:00`,
                    `Avg Engagement: ${dataPoint.v.toFixed(1)}`,
                    `Posts: ${dataPoint.count}`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Hour of Day'
              },
              min: 0,
              max: 23,
              ticks: {
                stepSize: 3
              }
            },
            y: {
              title: {
                display: true,
                text: 'Day of Week'
              },
              min: 0,
              max: 6,
              ticks: {
                callback: function(value) {
                  return days[value];
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading best posting times chart:', error);
    }
  }

  // 4. Top Performing Posts - Horizontal Bar Chart
  async loadTopPostsChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/top-posts?limit=10&days=${getAnalyticsDays()}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Top posts error:', result.error);
        return;
      }

      const data = result.data;
      const ctx = document.getElementById('topPostsChart');
      if (!ctx) return;

      if (this.charts.topPosts) {
        this.charts.topPosts.destroy();
      }

      this.charts.topPosts = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => {
            const msg = d.message || 'No message';
            return msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
          }),
          datasets: [
            {
              label: 'Likes',
              data: data.map(d => d.likes),
              backgroundColor: '#1877f2'
            },
            {
              label: 'Loves',
              data: data.map(d => d.loves),
              backgroundColor: '#f33e58'
            },
            {
              label: 'Clicks',
              data: data.map(d => d.clicks),
              backgroundColor: '#42b72a'
            },
            {
              label: 'Video Views',
              data: data.map(d => d.video_views),
              backgroundColor: '#f7b928'
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                title: function(context) {
                  const index = context[0].dataIndex;
                  return data[index].message || 'No message';
                }
              }
            }
          },
          scales: {
            x: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return value.toLocaleString();
                }
              }
            },
            y: {
              stacked: true
            }
          }
        }
      });
    } catch (error) {
      console.error('Error loading top posts chart:', error);
    }
  }

  // 5. Age & Gender Distribution - Stacked Bar Chart
  async loadDemographicsChart() {
    try {
      const response = await fetch(`/api/pages/${this.currentPageId}/demographics`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Demographics error:', result.error);
        return;
      }

      const ctx = document.getElementById('demographicsChart');
      if (!ctx) return;

      if (this.charts.demographics) {
        this.charts.demographics.destroy();
        this.charts.demographics = null;
      }

      const note = result.data?.note || 'Facebook Page Insights API khong con cung cap demographics age/gender cho chart nay.';
      this.renderUnavailableState(ctx, 'Demographics unavailable', note);
    } catch (error) {
      console.error('Error loading demographics chart:', error);
    }
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }

  renderUnavailableState(canvas, title, message) {
    const context = canvas.getContext('2d');
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#94a3b8';
    context.textAlign = 'center';
    context.font = '600 16px Roboto';
    context.fillText(title, width / 2, height / 2 - 10);
    context.font = '14px Roboto';
    const safeMessage = (message || '').slice(0, 140);
    context.fillText(safeMessage, width / 2, height / 2 + 18);
  }

  destroy() {
    Object.values(this.charts).forEach(chart => {
      if (chart) chart.destroy();
    });
    this.charts = {};
  }
}

// Initialize when page is selected
let phase3Charts = null;

function getAnalyticsDays() {
  return document.getElementById('analyticsDaysSelect')?.value || 30;
}

function initPhase3Charts(pageId) {
  if (!phase3Charts) {
    phase3Charts = new Phase3Charts();
  }
  phase3Charts.init(pageId);
}

// Populate page selector and auto-initialize charts
document.addEventListener('DOMContentLoaded', () => {
  // Wait for pages to load
  const checkPages = setInterval(() => {
    if (window.app?.data?.pages?.length > 0) {
      clearInterval(checkPages);
      
      const pageSelect = document.getElementById('pageSelect');
      if (pageSelect) {
        // Populate selector
        pageSelect.innerHTML = '<option value="">-- Chọn page --</option>';
        window.app.data.pages.forEach(page => {
          const option = document.createElement('option');
          option.value = page.id;
          option.textContent = `${page.name} (${page.fan_count || 0} fans)`;
          pageSelect.appendChild(option);
        });
        
        // Auto-select first page
        if (window.app.data.pages.length > 0) {
          pageSelect.value = window.app.data.pages[0].id;
          initPhase3Charts(window.app.data.pages[0].id);
        }
        
        // Listen for changes
        pageSelect.addEventListener('change', (e) => {
          const pageId = e.target.value;
          if (pageId) {
            initPhase3Charts(pageId);
          }
        });

        const daysSelect = document.getElementById('analyticsDaysSelect');
        if (daysSelect) {
          daysSelect.addEventListener('change', () => {
            if (pageSelect.value) {
              initPhase3Charts(pageSelect.value);
            }
          });
        }

        const exportPagesBtn = document.getElementById('exportPagesCsvBtn');
        if (exportPagesBtn) {
          exportPagesBtn.addEventListener('click', () => {
            window.location.href = '/api/export/pages.csv';
          });
        }

        const exportTopPostsBtn = document.getElementById('exportTopPostsCsvBtn');
        if (exportTopPostsBtn) {
          exportTopPostsBtn.addEventListener('click', () => {
            if (!pageSelect.value) return;
            const params = new URLSearchParams({
              limit: '20',
              days: String(getAnalyticsDays())
            });
            window.location.href = `/api/export/pages/${pageSelect.value}/top-posts.csv?${params.toString()}`;
          });
        }
      }
    }
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => clearInterval(checkPages), 10000);
});

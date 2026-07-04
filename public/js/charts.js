// Chart rendering utilities
class Charts {
  constructor() {
    this.chartInstances = {};
    this.colors = {
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

  // Destroy existing chart instance
  destroyChart(canvasId) {
    if (this.chartInstances[canvasId]) {
      this.chartInstances[canvasId].destroy();
      delete this.chartInstances[canvasId];
    }
  }

  // Create line chart
  createLineChart(canvasId, labels, datasets, options = {}) {
    this.destroyChart(canvasId);
    
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
              family: 'Roboto'
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(28, 43, 51, 0.95)',
          titleFont: { size: 13, family: 'Roboto' },
          bodyFont: { size: 12, family: 'Roboto' },
          padding: 12,
          cornerRadius: 6,
          displayColors: true
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: { size: 11, family: 'Roboto' },
            color: '#67788A'
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(203, 210, 217, 0.3)'
          },
          ticks: {
            font: { size: 11, family: 'Roboto' },
            color: '#67788A'
          }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    };

    const chartOptions = { ...defaultOptions, ...options };

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets
      },
      options: chartOptions
    });
  }

  // Create bar chart
  createBarChart(canvasId, labels, datasets, options = {}) {
    this.destroyChart(canvasId);
    
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
              family: 'Roboto'
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(28, 43, 51, 0.95)',
          titleFont: { size: 13, family: 'Roboto' },
          bodyFont: { size: 12, family: 'Roboto' },
          padding: 12,
          cornerRadius: 6
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: { size: 11, family: 'Roboto' },
            color: '#67788A'
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(203, 210, 217, 0.3)'
          },
          ticks: {
            font: { size: 11, family: 'Roboto' },
            color: '#67788A'
          }
        }
      }
    };

    const chartOptions = { ...defaultOptions, ...options };

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets
      },
      options: chartOptions
    });
  }

  // Create pie/doughnut chart
  createPieChart(canvasId, labels, data, options = {}) {
    this.destroyChart(canvasId);
    
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const colors = Object.values(this.colors).slice(0, data.length);

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
              family: 'Roboto'
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(28, 43, 51, 0.95)',
          titleFont: { size: 13, family: 'Roboto' },
          bodyFont: { size: 12, family: 'Roboto' },
          padding: 12,
          cornerRadius: 6
        }
      }
    };

    const chartOptions = { ...defaultOptions, ...options };

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: options.type || 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 0
        }]
      },
      options: chartOptions
    });
  }

  // Format number with commas
  formatNumber(num) {
    return num.toLocaleString('vi-VN');
  }

  // Format date for chart labels
  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }

  // Generate color array for pie charts
  generateColorArray(count) {
    const colorKeys = Object.keys(this.colors);
    const colors = [];
    for (let i = 0; i < count; i++) {
      colors.push(this.colors[colorKeys[i % colorKeys.length]]);
    }
    return colors;
  }
}

// Export singleton
window.charts = new Charts();

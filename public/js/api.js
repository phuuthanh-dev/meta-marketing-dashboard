// API Client for Facebook Metrics Dashboard
class API {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Get summary stats
  async getSummary() {
    return this.request('/api/summary');
  }

  // Get all pages
  async getPages() {
    return this.request('/api/pages');
  }

  // Get page metrics
  async getPageMetrics(pageId, days = 30) {
    return this.request(`/api/pages/${pageId}/metrics?days=${days}`);
  }

  // Get post metrics
  async getPostMetrics(postId) {
    return this.request(`/api/posts/${postId}/metrics`);
  }

  // Get all pages with aggregated metrics
  async getAllPagesMetrics(days = 30) {
    const pagesResponse = await this.getPages();
    const pages = pagesResponse.data || [];
    
    const allMetrics = [];
    for (const page of pages) {
      const metricsResponse = await this.getPageMetrics(page.id, days);
      allMetrics.push({
        page,
        metrics: metricsResponse.data || []
      });
    }
    
    return allMetrics;
  }

  // Get aggregated metrics across all pages
  async getAggregatedMetrics(days = 30) {
    const resp = await this.request(`/api/metrics/aggregated?days=${days}`);
    return resp.data;
  }
}

// Export singleton
window.api = new API();

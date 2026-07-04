const FacebookAPI = require('./api');
const Database = require('../database');
const config = require('../config');

class MetricsFetcher {
  constructor(portfolio, pageFilter = null) {
    this.portfolio = portfolio;
    this.pageFilter = pageFilter; // Filter by page name (partial match)
    this.api = new FacebookAPI(portfolio.token);
    this.db = Database.getInstance();
  }

  async fetchAllMetrics() {
    console.log(`\n📊 Fetching metrics for portfolio: ${this.portfolio.name}`);
    if (this.pageFilter) {
      console.log(`   Filter: only page matching "${this.pageFilter}"`);
    }
    
    // Get all pages
    let pages = await this.api.getPages();
    console.log(`Found ${pages.length} pages total`);

    // Filter pages if specified
    if (this.pageFilter) {
      pages = pages.filter(p => p.name.toLowerCase().includes(this.pageFilter.toLowerCase()));
      console.log(`Filtered to ${pages.length} page(s) matching "${this.pageFilter}"`);
    }

    if (pages.length === 0) {
      console.log('⚠️  No pages to process');
      return;
    }

    // Save pages to database
    for (const page of pages) {
      this.db.savePage({
        id: page.id,
        name: page.name,
        category: page.category,
        fan_count: page.fan_count || 0,
        followers_count: page.followers_count || 0,
        portfolio: this.portfolio.name
      });
    }

    // Fetch metrics for each page - lấy data 30 ngày gần đây
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = Math.floor(thirtyDaysAgo.getTime() / 1000);
    const until = Math.floor(now.getTime() / 1000);
    
    console.log(`📅 Fetching data: ${thirtyDaysAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`);

    for (const page of pages) {
      console.log(`\n📄 Processing page: ${page.name}`);
      
      // Fetch page insights
      try {
        const insights = await this.api.getPageInsights(
          page.id,
          config.pageMetrics.join(','),
          since,
          until
        );
        
        // Insights API returns data per day in values array
        const dailyMetrics = this.parsePageInsightsByDate(insights);
        for (const [date, metrics] of Object.entries(dailyMetrics)) {
          // Add fan_count and followers_count from page object
          metrics.fan_count = page.fan_count || 0;
          metrics.followers_count = page.followers_count || 0;
          this.db.savePageMetrics({
            page_id: page.id,
            date: date,
            ...metrics
          });
        }
        console.log(`✅ Page metrics saved (${Object.keys(dailyMetrics).length} days)`);
      } catch (err) {
        console.log(`❌ Page insights error:`, err.message);
      }

      // Fetch posts and their insights
      try {
        // Check for incremental fetching
        const latestPostDate = this.db.getLatestPostDate(page.id);
        const shouldFetchAll = !latestPostDate;
        
        console.log(`  📝 Fetching posts (limit: 50)...`);
        const posts = await this.api.getPagePosts(page.id, 50);
        console.log(`  Found ${posts.length} recent posts`);

        let newPostsCount = 0;

        for (const post of posts) {
          // Skip if post is older than latest in DB (incremental)
          if (!shouldFetchAll && latestPostDate && post.created_time <= latestPostDate) {
            continue;
          }

          // Validate post data
          if (!post.id || !post.created_time) {
            console.log(`  ⚠️  Skipping invalid post: missing id or created_time`);
            continue;
          }

          this.db.savePost({
            id: post.id,
            page_id: page.id,
            message: post.message || '',
            created_time: post.created_time
          });

          // Fetch comments for this post
          try {
            const comments = await this.api.getPostComments(post.id, 100);
            console.log(`    💬 Found ${comments.length} comments`);
            
            for (const comment of comments) {
              if (!comment.id) continue;
              
              this.db.saveComment({
                id: comment.id,
                post_id: post.id,
                from_id: comment.from?.id || '',
                from_name: comment.from?.name || '',
                message: comment.message || '',
                created_time: comment.created_time,
                like_count: comment.like_count || 0,
                comment_count: comment.comment_count || 0,
                is_hidden: comment.is_hidden || false
              });
            }
          } catch (err) {
            console.log(`    ❌ Comments error:`, err.message);
          }

          try {
            const postInsights = await this.api.getPostInsights(
              post.id,
              config.postMetrics
            );
            
            // Post insights - use latest value
            const metrics = this.parsePostInsights(postInsights);
            const postDate = post.created_time.split('T')[0];
            
            // Validate metrics
            if (Object.keys(metrics).length === 0) {
              console.log(`    ⚠️  No metrics available for post ${post.id}`);
            }
            
            this.db.savePostMetrics({
              post_id: post.id,
              date: postDate,
              ...metrics
            });
            
            newPostsCount++;
          } catch (err) {
            console.log(`    ❌ Post ${post.id} insights error:`, err.message);
          }

          // Rate limiting
          await new Promise(r => setTimeout(r, 1000));
        }
        
        console.log(`  ✅ Processed ${newPostsCount} new posts`);
      } catch (err) {
        console.log(`❌ Posts error:`, err.message);
      }

      // Rate limiting between pages
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n✅ Finished fetching metrics for ${this.portfolio.name}`);
  }

  parsePageInsightsByDate(insights) {
    const dailyMetrics = {};
    
    for (const insight of insights) {
      // Each insight has values array with {value, end_time} per day
      for (const val of insight.values) {
        if (!val.end_time) continue;
        
        const endDate = new Date(val.end_time);
        const dateStr = endDate.toISOString().split('T')[0];
        
        if (!dailyMetrics[dateStr]) {
          dailyMetrics[dateStr] = {
            post_engagements: 0,
            video_views: 0,
            total_actions: 0,
            reactions_like: 0,
            reactions_love: 0,
            reactions_wow: 0,
            reactions_haha: 0,
            reactions_sorry: 0,
            reactions_anger: 0,
            impressions: 0,
            impressions_paid: 0,
            impressions_organic: 0,
            engaged_users: 0,
            consumptions: 0
          };
        }
        
        const value = val.value;
        switch (insight.name) {
          case 'page_post_engagements':
            dailyMetrics[dateStr].post_engagements = value || 0;
            break;
          case 'page_video_views':
            dailyMetrics[dateStr].video_views = value || 0;
            break;
          case 'page_total_actions':
            dailyMetrics[dateStr].total_actions = value || 0;
            break;
          case 'page_actions_post_reactions_like_total':
            dailyMetrics[dateStr].reactions_like = value || 0;
            break;
          case 'page_actions_post_reactions_love_total':
            dailyMetrics[dateStr].reactions_love = value || 0;
            break;
          case 'page_actions_post_reactions_wow_total':
            dailyMetrics[dateStr].reactions_wow = value || 0;
            break;
          case 'page_actions_post_reactions_haha_total':
            dailyMetrics[dateStr].reactions_haha = value || 0;
            break;
          case 'page_actions_post_reactions_sorry_total':
            dailyMetrics[dateStr].reactions_sorry = value || 0;
            break;
          case 'page_actions_post_reactions_anger_total':
            dailyMetrics[dateStr].reactions_anger = value || 0;
            break;
          case 'page_fans':
            dailyMetrics[dateStr].fan_count = value || 0;
            break;
          case 'page_followers':
            dailyMetrics[dateStr].followers_count = value || 0;
            break;
          case 'page_impressions':
            dailyMetrics[dateStr].impressions = value || 0;
            break;
          case 'page_impressions_paid':
            dailyMetrics[dateStr].impressions_paid = value || 0;
            break;
          case 'page_impressions_organic':
            dailyMetrics[dateStr].impressions_organic = value || 0;
            break;
          case 'page_engaged_users':
            dailyMetrics[dateStr].engaged_users = value || 0;
            break;
          case 'page_consumptions':
            dailyMetrics[dateStr].consumptions = value || 0;
            break;
        }
      }
    }
    
    return dailyMetrics;
  }

  parsePageInsights(insights) {
    const metrics = {};
    for (const insight of insights) {
      const value = insight.values[0]?.value;
      switch (insight.name) {
        case 'page_post_engagements':
          metrics.post_engagements = value || 0;
          break;
        case 'page_video_views':
          metrics.video_views = value || 0;
          break;
        case 'page_total_actions':
          metrics.total_actions = value || 0;
          break;
        case 'page_actions_post_reactions_like_total':
          metrics.reactions_like = value || 0;
          break;
        case 'page_actions_post_reactions_love_total':
          metrics.reactions_love = value || 0;
          break;
        case 'page_actions_post_reactions_wow_total':
          metrics.reactions_wow = value || 0;
          break;
        case 'page_actions_post_reactions_haha_total':
          metrics.reactions_haha = value || 0;
          break;
        case 'page_actions_post_reactions_sorry_total':
          metrics.reactions_sorry = value || 0;
          break;
        case 'page_actions_post_reactions_anger_total':
          metrics.reactions_anger = value || 0;
          break;
      }
    }
    return metrics;
  }

  parsePostInsights(insights) {
    const metrics = {};
    for (const insight of insights) {
      const value = insight.values[0]?.value;
      switch (insight.name) {
        case 'post_reactions_like_total':
          metrics.reactions_like = value || 0;
          break;
        case 'post_reactions_love_total':
          metrics.reactions_love = value || 0;
          break;
        case 'post_reactions_wow_total':
          metrics.reactions_wow = value || 0;
          break;
        case 'post_reactions_haha_total':
          metrics.reactions_haha = value || 0;
          break;
        case 'post_clicks':
          metrics.clicks = value || 0;
          break;
        case 'post_video_views':
          metrics.video_views = value || 0;
          break;
      }
    }
    return metrics;
  }
}

module.exports = MetricsFetcher;

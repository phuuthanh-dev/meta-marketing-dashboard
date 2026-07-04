const Database = require('../database');
const InstagramAPI = require('./api');
const config = require('../config');

class InstagramFetcher {
  constructor(portfolio) {
    this.portfolio = portfolio;
    this.api = new InstagramAPI(portfolio.token);
    this.db = new Database();
  }

  async fetchAllInstagramMetrics(days = config.instagram.defaultDays, options = {}) {
    const targetAccountIds = Array.isArray(options.instagramAccountIds) && options.instagramAccountIds.length > 0
      ? new Set(options.instagramAccountIds)
      : null;

    console.log(`\n📸 Fetching Instagram data for portfolio: ${this.portfolio.name}`);

    let linkedAccounts = [];
    try {
      linkedAccounts = await this.api.getLinkedInstagramAccounts();
    } catch (error) {
      console.log(`  ⚠️ Instagram discovery unavailable for ${this.portfolio.name}: ${error.message}`);
      return {
        success: false,
        portfolio: this.portfolio.name,
        error: error.message,
        instagramAccounts: 0
      };
    }

    if (targetAccountIds) {
      linkedAccounts = linkedAccounts.filter(account => targetAccountIds.has(account.instagram_account_id));
    }

    if (linkedAccounts.length === 0) {
      console.log('  ℹ️ No linked Instagram business accounts found');
      return {
        success: true,
        portfolio: this.portfolio.name,
        instagramAccounts: 0
      };
    }

    console.log(`  Found ${linkedAccounts.length} linked Instagram account(s)`);

    for (const linked of linkedAccounts) {
      const instagramAccountId = linked.instagram_account_id;
      console.log(`\n  📷 Instagram account: ${linked.username || instagramAccountId} (${instagramAccountId})`);

      try {
        const profile = await this.api.getInstagramAccountProfile(instagramAccountId);
        this.db.saveInstagramAccount({
          id: instagramAccountId,
          page_id: linked.page_id,
          page_name: linked.page_name,
          username: profile.username || linked.username || '',
          name: profile.name || linked.name || '',
          biography: profile.biography || '',
          followers_count: profile.followers_count || 0,
          follows_count: profile.follows_count || 0,
          media_count: profile.media_count || 0,
          profile_picture_url: profile.profile_picture_url || '',
          portfolio: this.portfolio.name
        });
        console.log('    ✅ Saved Instagram account profile');
      } catch (error) {
        console.log(`    ⚠️ Profile sync error: ${error.message}`);
        continue;
      }

      try {
        const dayInsights = await this.api.getAccountDayInsights(instagramAccountId, days);
        const totals = await this.api.getAccountTotalValueInsights(instagramAccountId);
        this.db.saveInstagramAccountInsightSnapshot({
          instagram_account_id: instagramAccountId,
          snapshot_date: new Date().toISOString().split('T')[0],
          day_metrics: dayInsights,
          total_metrics: totals
        });
        console.log(`    ✅ Saved Instagram account insights (${dayInsights.length} day metrics, ${totals.length} total metrics)`);
      } catch (error) {
        console.log(`    ⚠️ Account insights sync error: ${error.message}`);
      }

      try {
        const demographics = await this.api.getFollowerDemographics(instagramAccountId);
        this.db.replaceInstagramDemographicsSnapshot({
          instagram_account_id: instagramAccountId,
          snapshot_date: new Date().toISOString().split('T')[0],
          payload: demographics
        });
        console.log(`    ✅ Saved demographics snapshot (supported=${demographics.supported})`);
      } catch (error) {
        console.log(`    ⚠️ Demographics sync error: ${error.message}`);
      }

      try {
        const mediaItems = await this.api.getInstagramMedia(instagramAccountId, config.instagram.mediaFetchLimit);
        const insightMediaItems = mediaItems.slice(0, config.instagram.mediaInsightsLimit);

        for (const media of mediaItems) {
          this.db.saveInstagramMedia({
            id: media.id,
            instagram_account_id: instagramAccountId,
            caption: media.caption || '',
            media_type: media.media_type || '',
            media_product_type: media.media_product_type || '',
            media_url: media.media_url || '',
            thumbnail_url: media.thumbnail_url || '',
            permalink: media.permalink || '',
            timestamp: media.timestamp || null,
            like_count: media.like_count || 0,
            comments_count: media.comments_count || 0
          });

          if (insightMediaItems.some(item => item.id === media.id)) {
            const mediaInsights = await this.api.getMediaInsights(media.id);
            this.db.replaceInstagramMediaInsightsSnapshot({
              media_id: media.id,
              snapshot_date: new Date().toISOString().split('T')[0],
              payload: mediaInsights
            });
          }
        }
        console.log(`    ✅ Saved ${mediaItems.length} Instagram media item(s), insights for ${insightMediaItems.length}`);
      } catch (error) {
        console.log(`    ⚠️ Media sync error: ${error.message}`);
      }
    }

    return {
      success: true,
      portfolio: this.portfolio.name,
      instagramAccounts: linkedAccounts.length
    };
  }
}

module.exports = InstagramFetcher;

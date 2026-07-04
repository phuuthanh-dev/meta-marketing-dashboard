#!/usr/bin/env node
/**
 * Spike Test - Xác nhận Meta API capabilities
 * 
 * Mục tiêu: Test từng metric group riêng biệt để biết cái nào Meta hỗ trợ thật
 * 
 * Cách chạy:
 *   node spike-test.js                    # Test tất cả
 *   node spike-test.js --group=ads        # Chỉ test Ads
 *   node spike-test.js --group=instagram  # Chỉ test Instagram
 *   node spike-test.js --group=facebook   # Chỉ test Facebook Organic
 *   node spike-test.js --account=act_123  # Test 1 account cụ thể
 * 
 * Output: spike-test-results.json + console summary
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const config = require('../src/config');

// ========== UTILITIES ==========

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = {
  timestamp: new Date().toISOString(),
  facebook: {},
  ads: {},
  instagram: {},
  summary: {
    total: 0,
    supported: 0,
    unsupported: 0,
    partial: 0,
    errors: 0
  }
};

function log(group, name, status, details = {}) {
  const icon = {
    supported: '✅',
    unsupported: '❌',
    partial: '⚠️',
    error: '🔥'
  }[status] || '❓';

  console.log(`  ${icon} ${name}: ${status}`);
  if (details.reason) console.log(`     → ${details.reason}`);
  if (details.sample) console.log(`     → Sample: ${JSON.stringify(details.sample).substring(0, 100)}...`);

  results[group][name] = { status, ...details };
  results.summary.total++;
  results.summary[status === 'error' ? 'errors' : status]++;
}

async function safeCall(fn, context = '') {
  try {
    const result = await fn();
    return { success: true, data: result };
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    return { success: false, error: msg, context };
  }
}

// ========== FACEBOOK ORGANIC TESTS ==========

async function testFacebookOrganic(token, pageId) {
  console.log('\n📘 FACEBOOK ORGANIC METRICS');
  console.log('─'.repeat(50));

  const client = axios.create({
    baseURL: `https://graph.facebook.com/${config.fb.version}`,
    timeout: 30000
  });

  // Get page token
  const pageTokenResult = await safeCall(async () => {
    const resp = await client.get(`/${pageId}`, {
      params: { fields: 'access_token', access_token: token }
    });
    return resp.data.access_token;
  });

  if (!pageTokenResult.success) {
    log('facebook', 'Page Token', 'error', { reason: pageTokenResult.error });
    return;
  }

  const pageToken = pageTokenResult.data;
  log('facebook', 'Page Token', 'supported');

  // Test basic page fields
  const basicFields = await safeCall(async () => {
    const resp = await client.get(`/${pageId}`, {
      params: {
        fields: 'id,name,fan_count,followers_count,engagement',
        access_token: pageToken
      }
    });
    return resp.data;
  });

  if (basicFields.success) {
    log('facebook', 'Basic Fields (fan_count, followers_count)', 'supported', {
      sample: {
        fan_count: basicFields.data.fan_count,
        followers_count: basicFields.data.followers_count
      }
    });
  } else {
    log('facebook', 'Basic Fields', 'error', { reason: basicFields.error });
  }

  // Test page insights metrics - batch by expected status
  const metricsToTest = [
    // Expected supported
    { name: 'page_post_engagements', expected: 'supported' },
    { name: 'page_total_actions', expected: 'supported' },
    { name: 'page_video_views', expected: 'supported' },
    { name: 'page_actions_post_reactions_like_total', expected: 'supported' },
    
    // Expected deprecated
    { name: 'page_impressions', expected: 'unsupported' },
    { name: 'page_impressions_organic', expected: 'unsupported' },
    { name: 'page_impressions_paid', expected: 'unsupported' },
    { name: 'page_engaged_users', expected: 'unsupported' },
    { name: 'page_consumptions', expected: 'unsupported' },
    { name: 'page_fans', expected: 'unsupported' },
    { name: 'page_fans_locale', expected: 'unsupported' },
    { name: 'page_fans_city', expected: 'unsupported' },
    { name: 'page_fans_country', expected: 'unsupported' },
  ];

  const until = Math.floor(Date.now() / 1000);
  const since = until - (30 * 86400);

  for (const metric of metricsToTest) {
    await sleep(500); // Rate limit
    
    const result = await safeCall(async () => {
      const resp = await client.get(`/${pageId}/insights`, {
        params: {
          metric: metric.name,
          period: 'day',
          since,
          until,
          access_token: pageToken
        }
      });
      return resp.data;
    });

    if (result.success && result.data.data?.length > 0) {
      const hasValues = result.data.data[0].values?.some(v => v.value !== undefined && v.value !== null);
      if (hasValues) {
        log('facebook', metric.name, 'supported', {
          sample: result.data.data[0].values?.slice(0, 2)
        });
      } else {
        log('facebook', metric.name, 'partial', { reason: 'Metric exists but no values returned' });
      }
    } else if (result.success) {
      log('facebook', metric.name, 'partial', { reason: 'Empty response' });
    } else {
      const isInvalidMetric = result.error.includes('Invalid metric') || result.error.includes('unknown field');
      log('facebook', metric.name, isInvalidMetric ? 'unsupported' : 'error', {
        reason: result.error.substring(0, 150)
      });
    }
  }

  // Test posts edge
  const postsResult = await safeCall(async () => {
    const resp = await client.get(`/${pageId}/posts`, {
      params: {
        fields: 'id,message,created_time',
        limit: 5,
        access_token: pageToken
      }
    });
    return resp.data;
  });

  if (postsResult.success && postsResult.data.data?.length > 0) {
    log('facebook', 'Posts Edge', 'supported', {
      sample: { count: postsResult.data.data.length }
    });

    // Test post insights on first post
    const firstPostId = postsResult.data.data[0].id;
    const postInsightsResult = await safeCall(async () => {
      const resp = await client.get(`/${firstPostId}/insights`, {
        params: {
          metric: 'post_reactions_like_total,post_clicks',
          access_token: pageToken
        }
      });
      return resp.data;
    });

    if (postInsightsResult.success) {
      log('facebook', 'Post Insights', 'supported');
    } else {
      log('facebook', 'Post Insights', 'error', { reason: postInsightsResult.error });
    }
  } else {
    log('facebook', 'Posts Edge', postsResult.success ? 'partial' : 'error', {
      reason: postsResult.error || 'No posts returned'
    });
  }
}

// ========== ADS TESTS ==========

async function testAds(token, specificAccount = null) {
  console.log('\n💰 ADS METRICS');
  console.log('─'.repeat(50));

  const client = axios.create({
    baseURL: `https://graph.facebook.com/${config.fb.version}`,
    timeout: 30000
  });

  // Get ad accounts
  const accountsResult = await safeCall(async () => {
    const resp = await client.get('/me/adaccounts', {
      params: {
        fields: config.ads.accountFields.join(','),
        limit: 100,
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (!accountsResult.success) {
    log('ads', 'Ad Accounts Discovery', 'error', { reason: accountsResult.error });
    return;
  }

  const accounts = accountsResult.data;
  log('ads', 'Ad Accounts Discovery', 'supported', {
    sample: { count: accounts.length, first: accounts[0]?.name }
  });

  // Pick account to test
  const testAccount = specificAccount || accounts[0]?.id;
  if (!testAccount) {
    log('ads', 'Account Selection', 'error', { reason: 'No accounts available' });
    return;
  }

  console.log(`\n  Testing account: ${testAccount}`);

  // Test account insights
  const insightsResult = await safeCall(async () => {
    const resp = await client.get(`/act_${testAccount.replace('act_', '')}/insights`, {
      params: {
        fields: config.ads.insightFields.join(','),
        level: 'account',
        time_increment: 1,
        date_preset: 'last_30d',
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (insightsResult.success && insightsResult.data.length > 0) {
    log('ads', 'Account Insights', 'supported', {
      sample: {
        rows: insightsResult.data.length,
        spend: insightsResult.data[0]?.spend,
        impressions: insightsResult.data[0]?.impressions
      }
    });

    // Check which fields have data
    const firstRow = insightsResult.data[0];
    const fieldsWith = Object.keys(firstRow).filter(k => firstRow[k] !== null && firstRow[k] !== undefined && firstRow[k] !== '0');
    log('ads', 'Insight Fields Available', 'supported', {
      sample: { fields: fieldsWith.slice(0, 10).join(', ') }
    });
  } else if (insightsResult.success) {
    log('ads', 'Account Insights', 'partial', { reason: 'Empty - no delivery in period?' });
  } else {
    log('ads', 'Account Insights', 'error', { reason: insightsResult.error });
  }

  // Test campaigns edge
  const campaignsResult = await safeCall(async () => {
    const resp = await client.get(`/act_${testAccount.replace('act_', '')}/campaigns`, {
      params: {
        fields: config.ads.campaignFields.join(','),
        limit: 10,
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (campaignsResult.success) {
    log('ads', 'Campaigns Edge', 'supported', {
      sample: { count: campaignsResult.data.length }
    });
  } else {
    log('ads', 'Campaigns Edge', 'error', { reason: campaignsResult.error });
  }

  // Test campaign-level insights
  const campaignInsightsResult = await safeCall(async () => {
    const resp = await client.get(`/act_${testAccount.replace('act_', '')}/insights`, {
      params: {
        fields: config.ads.insightFields.join(','),
        level: 'campaign',
        time_increment: 1,
        date_preset: 'last_7d',
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (campaignInsightsResult.success) {
    log('ads', 'Campaign-Level Insights', 'supported', {
      sample: { rows: campaignInsightsResult.data.length }
    });
  } else {
    log('ads', 'Campaign-Level Insights', 'error', { reason: campaignInsightsResult.error });
  }

  // Test action metrics (outbound clicks, link clicks, actions)
  const actionMetricsResult = await safeCall(async () => {
    const resp = await client.get(`/act_${testAccount.replace('act_', '')}/insights`, {
      params: {
        fields: 'account_id,spend,actions,action_values,outbound_clicks,link_clicks',
        level: 'account',
        date_preset: 'last_7d',
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (actionMetricsResult.success && actionMetricsResult.data.length > 0) {
    const firstRow = actionMetricsResult.data[0];
    const hasActions = firstRow.actions && firstRow.actions.length > 0;
    const hasOutbound = firstRow.outbound_clicks && firstRow.outbound_clicks.length > 0;
    
    log('ads', 'Action Metrics', hasActions || hasOutbound ? 'supported' : 'partial', {
      sample: {
        has_actions: hasActions,
        has_outbound_clicks: hasOutbound,
        actions_count: firstRow.actions?.length || 0
      }
    });
  } else {
    log('ads', 'Action Metrics', 'partial', { reason: 'No action data in period' });
  }
}

// ========== INSTAGRAM TESTS ==========

async function testInstagram(token) {
  console.log('\n📷 INSTAGRAM METRICS');
  console.log('─'.repeat(50));

  const client = axios.create({
    baseURL: `https://graph.facebook.com/${config.fb.version}`,
    timeout: 30000
  });

  // Discover IG accounts via connected pages
  const pagesResult = await safeCall(async () => {
    const resp = await client.get('/me/accounts', {
      params: {
        fields: 'id,name,instagram_business_account{id,username,followers_count}',
        limit: 100,
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (!pagesResult.success) {
    log('instagram', 'IG Discovery', 'error', { reason: pagesResult.error });
    return;
  }

  const igAccounts = pagesResult.data
    .filter(p => p.instagram_business_account)
    .map(p => ({
      page_id: p.id,
      page_name: p.name,
      ig_id: p.instagram_business_account.id,
      ig_username: p.instagram_business_account.username,
      ig_followers: p.instagram_business_account.followers_count
    }));

  if (igAccounts.length === 0) {
    log('instagram', 'IG Discovery', 'partial', { reason: 'No linked IG accounts found' });
    return;
  }

  log('instagram', 'IG Discovery', 'supported', {
    sample: { count: igAccounts.length, first: igAccounts[0].ig_username }
  });

  // Test first IG account
  const igAccount = igAccounts[0];
  console.log(`\n  Testing IG account: @${igAccount.ig_username} (${igAccount.ig_id})`);

  // Test profile fields
  const profileResult = await safeCall(async () => {
    const resp = await client.get(`/${igAccount.ig_id}`, {
      params: {
        fields: config.instagram.profileFields.join(','),
        access_token: token
      }
    });
    return resp.data;
  });

  if (profileResult.success) {
    log('instagram', 'Profile Fields', 'supported', {
      sample: {
        username: profileResult.data.username,
        followers: profileResult.data.followers_count
      }
    });
  } else {
    log('instagram', 'Profile Fields', 'error', { reason: profileResult.error });
  }

  // Test account insights (day metrics)
  const until = Math.floor(Date.now() / 1000);
  const since = until - (30 * 86400);

  const insightsResult = await safeCall(async () => {
    const resp = await client.get(`/${igAccount.ig_id}/insights`, {
      params: {
        metric: config.instagram.accountDayMetrics.join(','),
        period: 'day',
        since,
        until,
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (insightsResult.success && insightsResult.data.length > 0) {
    log('instagram', 'Account Day Metrics (reach, follower_count)', 'supported', {
      sample: { metrics: insightsResult.data.map(m => m.name).join(', ') }
    });
  } else {
    log('instagram', 'Account Day Metrics', 'partial', { reason: 'Empty or error' });
  }

  // Test total value metrics
  const totalValueResult = await safeCall(async () => {
    const resp = await client.get(`/${igAccount.ig_id}/insights`, {
      params: {
        metric: config.instagram.accountTotalValueMetrics.join(','),
        period: 'day',
        since,
        until,
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (totalValueResult.success && totalValueResult.data.length > 0) {
    log('instagram', 'Total Value Metrics (profile_views, accounts_engaged, total_interactions)', 'supported');
  } else {
    log('instagram', 'Total Value Metrics', 'partial', { reason: 'Empty or error' });
  }

  // Test demographics
  const demoResult = await safeCall(async () => {
    const resp = await client.get(`/${igAccount.ig_id}/insights`, {
      params: {
        metric: 'follower_demographics',
        period: 'lifetime',
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (demoResult.success && demoResult.data.length > 0 && demoResult.data[0].values?.length > 0) {
    log('instagram', 'Demographics (follower_demographics)', 'supported', {
      sample: { breakdowns: Object.keys(demoResult.data[0].values[0]?.value || {}).join(', ') }
    });
  } else {
    log('instagram', 'Demographics', 'partial', { reason: 'Not available for this account or permission missing' });
  }

  // Test media edge
  const mediaResult = await safeCall(async () => {
    const resp = await client.get(`/${igAccount.ig_id}/media`, {
      params: {
        fields: config.instagram.mediaFields.join(','),
        limit: 5,
        access_token: token
      }
    });
    return resp.data.data || [];
  });

  if (mediaResult.success && mediaResult.data.length > 0) {
    log('instagram', 'Media Edge', 'supported', {
      sample: { count: mediaResult.data.length, first_type: mediaResult.data[0].media_type }
    });

    // Test media insights on first media
    const firstMediaId = mediaResult.data[0].id;
    const mediaInsightsResult = await safeCall(async () => {
      const resp = await client.get(`/${firstMediaId}/insights`, {
        params: {
          metric: config.instagram.mediaInsightMetrics.join(','),
          access_token: token
        }
      });
      return resp.data.data || [];
    });

    if (mediaInsightsResult.success && mediaInsightsResult.data.length > 0) {
      const metricsAvailable = mediaInsightsResult.data.map(m => m.name);
      log('instagram', 'Media Insights', 'supported', {
        sample: { metrics: metricsAvailable.join(', ') }
      });
    } else {
      log('instagram', 'Media Insights', 'partial', { reason: 'Empty - may be unsupported for this media type' });
    }
  } else {
    log('instagram', 'Media Edge', mediaResult.success ? 'partial' : 'error', {
      reason: mediaResult.error || 'No media returned'
    });
  }
}

// ========== MAIN ==========

async function main() {
  console.log('🚀 META API SPIKE TEST');
  console.log('═'.repeat(50));
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`API Version: ${config.fb.version}`);

  const args = process.argv.slice(2);
  const groupArg = args.find(a => a.startsWith('--group='));
  const accountArg = args.find(a => a.startsWith('--account='));
  const group = groupArg ? groupArg.split('=')[1] : 'all';
  const specificAccount = accountArg ? accountArg.split('=')[1] : null;

  const tokens = config.portfolios.map(p => p.token).filter(Boolean);
  
  if (tokens.length === 0) {
    console.error('\n❌ No tokens found in .env');
    process.exit(1);
  }

  console.log(`\nUsing ${tokens.length} portfolio token(s)`);

  const token = tokens[0]; // Use first token for all tests

  try {
    if (group === 'all' || group === 'facebook') {
      // Get first page ID for Facebook tests
      const client = axios.create({
        baseURL: `https://graph.facebook.com/${config.fb.version}`,
        timeout: 30000
      });
      
      const pagesResp = await client.get('/me/accounts', {
        params: { fields: 'id,name', limit: 1, access_token: token }
      });
      
      const pageId = pagesResp.data.data?.[0]?.id;
      
      if (pageId) {
        await testFacebookOrganic(token, pageId);
      } else {
        console.log('\n⚠️  No pages found, skipping Facebook Organic tests');
      }
    }

    if (group === 'all' || group === 'ads') {
      await testAds(token, specificAccount);
    }

    if (group === 'all' || group === 'instagram') {
      await testInstagram(token);
    }

    // Save results
    const outputPath = path.join(__dirname, 'spike-test-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Total tests: ${results.summary.total}`);
    console.log(`✅ Supported: ${results.summary.supported}`);
    console.log(`⚠️  Partial: ${results.summary.partial}`);
    console.log(`❌ Unsupported: ${results.summary.unsupported}`);
    console.log(`🔥 Errors: ${results.summary.errors}`);

    console.log('\n📋 RECOMMENDATIONS');
    console.log('─'.repeat(50));
    
    const unsupportedFb = Object.entries(results.facebook)
      .filter(([_, v]) => v.status === 'unsupported')
      .map(([k, _]) => k);
    
    if (unsupportedFb.length > 0) {
      console.log(`Facebook Organic - Hide/Remove: ${unsupportedFb.join(', ')}`);
    }

    const supportedAds = Object.entries(results.ads)
      .filter(([_, v]) => v.status === 'supported')
      .map(([k, _]) => k);
    
    if (supportedAds.length > 0) {
      console.log(`Ads - Safe to use: ${supportedAds.join(', ')}`);
    }

    const partialIg = Object.entries(results.instagram)
      .filter(([_, v]) => v.status === 'partial')
      .map(([k, _]) => k);
    
    if (partialIg.length > 0) {
      console.log(`Instagram - Needs fallback: ${partialIg.join(', ')}`);
    }

    console.log('\n✅ Spike test complete');

  } catch (error) {
    console.error('\n🔥 Fatal error:', error.message);
    process.exit(1);
  }
}

main();

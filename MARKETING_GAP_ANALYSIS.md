# Marketing Gap Analysis

Date: 2026-07-04

## 1. Executive summary

This project is currently a Facebook Page organic reporting dashboard with some Page operations.
It is not yet a complete Meta marketing workspace.

Today the product is strongest at:

- multi-page aggregation across two portfolios
- page-level reporting from supported Page Insights metrics
- post/comment collection into SQLite
- lightweight Page operations such as posting, comment moderation, media, and some page settings

Today the product is missing the most important surfaces a marketing team usually expects:

- Ads reporting from Meta Marketing API
- ad account, campaign, ad set, and ad breakdown views
- Instagram account reporting
- reliable audience demographics for Facebook Pages
- business ownership and asset mapping beyond "page discovered by token"
- realtime ingestion via webhooks
- lead or conversion reporting

## 2. Current Meta API coverage

### Implemented and actively used

#### Pages API / Graph API

Used in the current codebase:

- `/me/accounts`
- `/{page-id}`
- `/{page-id}/insights`
- `/{page-id}/posts`
- `/{post-id}/insights`
- `/{post-id}/comments`
- `/{page-id}/conversations`
- `/{conversation-id}/messages`
- `/{page-id}/messages`
- `/{page-id}/notifications`
- `/{page-id}/photos`
- `/{page-id}/videos`
- `/{page-id}/albums`
- `/{album-id}/photos`
- `/{page-id}/roles`
- `/{page-id}/settings`
- `/{page-id}/milestones`
- `/{page-id}/offers`
- `/{page-id}/message_configuration`

Confirmed useful Page Insights metrics in the current tested flow:

- `page_actions_post_reactions_like_total`
- `page_actions_post_reactions_love_total`
- `page_actions_post_reactions_wow_total`
- `page_actions_post_reactions_haha_total`
- `page_actions_post_reactions_sorry_total`
- `page_actions_post_reactions_anger_total`
- `page_post_engagements`
- `page_video_views`
- `page_total_actions`
- `page_video_views_paid`
- `page_video_views_organic`
- `page_video_views_autoplayed`
- `page_video_views_click_to_play`

### Implemented but intentionally downgraded

These product areas exist in the UI or backend, but are treated as unavailable because the current Page API flow does not support them safely:

- Facebook Page demographics
- Facebook Page reach trend
- Page engagement-rate trend based on reach/impressions
- video insights edge
- content-performance Page Insights metrics
- historical fan-growth and growth-rate charts

### Not implemented

#### Meta Marketing API / Ads Insights API

Not present in the codebase today:

- ad account discovery
- ad account insights
- campaign list
- ad set list
- ad list
- daily ads fact table
- spend, CPM, CPC, CTR, frequency, reach, conversions, ROAS
- ads breakdowns by age, gender, placement, country, publisher_platform, device_platform

#### Instagram Graph API

Not present today:

- linked Instagram business account discovery
- Instagram account insights
- media insights
- audience demographic metrics from Instagram

#### Business Management API

Not present today:

- business portfolio asset mapping
- systematic ownership relationships between business, page, ad account, and Instagram asset

#### Webhooks

Not present today:

- page feed update webhooks
- comments/messages webhook ingestion
- lead webhook ingestion

#### Conversions / lead workflows

Not present today:

- Conversions API
- lead ads ingestion
- form metadata and CRM handoff

## 3. What the project means today for a marketing team

### Good fit today

- internal page performance dashboard
- editorial monitoring across multiple pages
- post-level and comment-level review
- basic content benchmarking between pages

### Not good fit today

- paid media reporting
- full-funnel marketing performance
- attribution or ROAS analysis
- audience planning and segmentation
- unified Facebook + Instagram + Ads command center

## 4. Ads status today

Ads are effectively absent from the project.

There is no current support for:

- `act_<ad_account_id>/insights`
- campaign/ad set/ad objects
- ads data storage
- ads charts
- ads permissions audit in the UI

This means the dashboard cannot yet answer standard marketing questions such as:

- How much did we spend yesterday?
- Which campaign has the best CTR?
- Which ad set has the lowest CPA?
- Which placement is wasting budget?
- What is ROAS by campaign or by page?

## 5. Audience Distribution doc relevance

The `audience-distribution` reference is relevant as a Meta data shape and concept, but it does not by itself solve the current Facebook Page demographics gap in this project.

For this project, the practical meaning is:

- it is more relevant when a supported API surface returns audience distribution objects
- it does not override the fact that the legacy Facebook Page demographics metrics used by the current project are deprecated or unsupported in the tested flow
- it becomes more useful if we add Instagram audience reporting or another supported audience endpoint later

## 6. Recommended target product for marketing teams

If the goal is "complete enough for a marketing team", the most realistic target product is:

### A. Facebook Page Organic Reporting

- page health
- post performance
- reactions and actions trends
- comment activity
- content cadence
- page comparison

### B. Ads Reporting

- spend, impressions, reach, clicks, CTR, CPC, CPM
- results, cost per result, conversions if available
- campaign, ad set, and ad drilldown
- breakdowns by placement, age, gender, country, publisher platform
- daily and period comparison views

### C. Cross-channel Reporting

- page and Instagram side by side
- unified content calendar and post inventory
- normalized engagement summaries

### D. Operations

- post publishing
- moderation queue
- media library
- page info and limited settings

## 7. Safe implementation roadmap

### Phase 1 - Stabilize current Facebook Page organic reporting

Goals:

- keep only charts backed by reliable metrics
- improve snapshot integrity
- keep unsupported areas hidden

Tasks:

- store true daily fan/follower snapshots only on fetch day
- add data freshness metadata per page
- label every chart by source: live Meta, local DB, cross-page
- clean remaining placeholder charts and UI copy

Success criteria:

- no chart renders misleading metrics
- dashboard explains unavailable data clearly

### Phase 2 - Add Meta Ads reporting

Goals:

- make the dashboard useful for paid media teams

Backend tasks:

- add `src/meta-ads/` module
- discover accessible ad accounts for each token
- fetch ad accounts, campaigns, ad sets, ads
- fetch daily insights from Ads Insights API
- store into new SQLite tables:
  - `ad_accounts`
  - `campaigns`
  - `ad_sets`
  - `ads`
  - `ad_insights_daily`

Minimum metrics:

- `spend`
- `impressions`
- `reach`
- `clicks`
- `ctr`
- `cpc`
- `cpm`
- `frequency`

Optional metrics when available:

- `actions`
- `conversions`
- `cost_per_action_type`
- `purchase_roas`
- `outbound_clicks`

Minimum breakdown support:

- none for baseline fetch
- then `age`
- `gender`
- `publisher_platform`
- `platform_position`

Frontend tasks:

- add `Ads` tab
- summary cards for spend, reach, clicks, CTR, CPC
- charts for daily spend, CTR trend, CPC trend
- tables for campaigns, ad sets, ads

Success criteria:

- marketing team can read paid performance without leaving the tool

### Phase 3 - Add Instagram reporting

Goals:

- fill the audience and channel reporting gap

Tasks:

- discover Instagram business accounts linked to pages
- fetch Instagram account insights
- fetch media inventory and media insights
- use Instagram audience metrics where supported for demographics

Suggested outputs:

- account growth summary
- media performance table
- audience demographic cards/charts
- story/reel/post mix analysis

Success criteria:

- audience reporting moves to a supported surface instead of deprecated Page metrics

### Phase 4 - Business and asset mapping

Goals:

- make portfolio ownership and asset relationships explicit

Tasks:

- map page -> token source -> business label
- add optional business asset tables
- handle duplicate page discovery intentionally
- show which token/business unlocks which data surface

Success criteria:

- users understand why an asset appears and which permissions power it

### Phase 5 - Realtime and workflow improvements

Goals:

- reduce manual fetch friction

Tasks:

- webhook ingestion where feasible
- job status UI
- fetch logs and partial failure reporting
- notification center for token expiry, permission gaps, and stale data

Success criteria:

- team trusts the freshness and operational status of the dashboard

## 8. Priority order for this repository

Recommended order:

1. finish Facebook Page organic reporting cleanup
2. add Ads reporting
3. add Instagram reporting
4. add business mapping
5. add realtime/workflow hardening

This order matters because Ads is the highest-value gap for most marketing teams, while Instagram is the cleanest path to supported audience insights.

## 9. Immediate next build items

The next practical implementation batch should be:

1. create Ads schema and fetcher scaffolding
2. add ad account discovery endpoint
3. add baseline ads insights daily fetch
4. add first Ads dashboard tab
5. add fetch status and permission diagnostics panel

## 10. Bottom line

The project is already a solid Facebook Page organic reporting base.
It is not yet a full marketing workspace because the paid media layer is missing.

The fastest path to "complete enough for the marketing team" is:

- keep Facebook Page organic reporting narrow and reliable
- add Ads reporting as the next major module
- add Instagram later for audience and cross-channel depth

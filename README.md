# Facebook Metrics Dashboard

Internal marketing analytics tool for Facebook Organic, Ads, and Instagram reporting.

## Features

- **Facebook Organic Reporting**: Page metrics, post engagements, reactions, video views
- **Ads Reporting**: Account-level insights, campaign performance, KPIs
- **Instagram Reporting**: Account insights, media analytics, demographics
- **Export**: CSV exports for all data types
- **Real-time**: WebSocket support for live updates

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Copy environment file and add your tokens
cp .env.example .env
# Edit .env with your Facebook tokens

# Run initial data fetch
npm run fetch

# Start server
npm start
```

### Docker

```bash
# Copy environment file
cp .env.example .env
# Edit .env with your Facebook tokens

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

Access dashboard at `http://localhost:3000`

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TOKEN_PORTFOLIO_1` | Facebook token for portfolio 1 |
| `TOKEN_PORTFOLIO_2` | Facebook token for portfolio 2 |
| `PORT` | Server port (default: 3000) |
| `HOST` | Server host (default: localhost) |

### Facebook Token Requirements

Tokens need these permissions:
- `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
- `ads_read` (for Ads reporting)
- `instagram_basic`, `instagram_manage_insights` (for Instagram)

## API Endpoints

### Facebook Organic
- `GET /api/pages` - List all pages
- `GET /api/summary` - Summary stats
- `GET /api/pages/:id/metrics` - Page metrics
- `GET /api/pages/:id/top-posts` - Top posts

### Ads
- `GET /api/ads/accounts` - List ad accounts
- `GET /api/ads/accounts/:id/insights` - Account insights
- `GET /api/ads/accounts/:id/campaigns` - Campaigns list

### Instagram
- `GET /api/instagram/accounts` - List IG accounts
- `GET /api/instagram/accounts/:id/insights` - Account insights
- `GET /api/instagram/accounts/:id/media` - Media list

### Export
- `GET /api/export/pages.csv`
- `GET /api/export/ads/accounts/:id/insights.csv`
- `GET /api/export/instagram/accounts/:id/media.csv`

## Scripts

```bash
npm run fetch    # Fetch all metrics from Meta API
npm run smoke    # Run smoke test
npm run spike    # Run API spike test
npm run dev      # Start with auto-reload
```

## Project Structure

```
fb-metrics/
├── src/
│   ├── index.js          # Entry point
│   ├── server.js         # Express server + routes
│   ├── database.js       # SQLite database layer
│   ├── config.js         # Configuration
│   ├── scheduler.js      # Cron scheduler
│   ├── facebook/         # Facebook Organic API
│   ├── meta-ads/         # Ads API
│   └── instagram/        # Instagram API
├── public/               # Frontend (HTML/CSS/JS)
├── scripts/              # Utility scripts
├── test/                 # Test scripts
├── data/                 # SQLite database (gitignored)
└── docker-compose.yml
```

## Deployment

### Railway / Render / Fly.io

1. Push to GitHub
2. Connect repo to platform
3. Set environment variables
4. Deploy

### VPS / VM

```bash
git clone <repo-url>
cd fb-metrics
cp .env.example .env
# Edit .env
docker-compose up -d
```

## Known Limitations

- Facebook Page demographics metrics are deprecated by Meta
- Ads summary may mix currencies across accounts
- Instagram demographics require accounts with sufficient followers

## License

ISC

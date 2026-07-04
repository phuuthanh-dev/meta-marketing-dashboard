# Meta Marketing Dashboard

Dashboard nội bộ để tổng hợp và hiển thị dữ liệu marketing từ Meta (Facebook, Instagram, Ads).

## Tính năng

- **Facebook Organic**: Theo dõi page metrics, post engagements, reactions, video views
- **Facebook Ads**: Đồng bộ dữ liệu ads theo account, campaign, adset, ad
- **Instagram**: Account insights, media ranking, demographics
- **Export CSV**: Xuất dữ liệu để báo cáo offline
- **Real-time Updates**: WebSocket để cập nhật dữ liệu thời gian thực

## Bảo mật

### Authentication (Bắt buộc)

Dashboard có hệ thống đăng nhập để bảo vệ dữ liệu:

```bash
APP_USERNAME=admin
APP_PASSWORD=your-strong-password
SESSION_SECRET=random-secret-string
```

- Session được lưu trong memory, tự động expire khi restart server
- Cookie được đánh dấu HttpOnly để chống XSS
- Tất cả API endpoint đều yêu cầu authentication

### Read-Only Mode (Khuyến nghị)

Mặc định bật read-only để ngăn chặn thao tác ghi lên Facebook/Instagram:

```bash
READ_ONLY=true  # Chỉ đọc, không cho đăng bài/sửa/xóa
```

Khi `READ_ONLY=true`, các endpoint sau bị chặn:
- Đăng bài, sửa bài, xóa bài
- Quản lý comment (reply, hide, delete)
- Gửi tin nhắn, đánh dấu đã đọc
- Upload ảnh/video/album
- Quản lý milestones, offers, auto-reply

Set `READ_ONLY=false` nếu bạn thực sự cần tính năng quản lý.

### Scheduler Control

Mặc định tắt scheduler để tránh tự động gọi Meta API:

```bash
ENABLE_SCHEDULER=false      # Tắt cron job hàng ngày
ENABLE_STARTUP_FETCH=false  # Tắt fetch khi khởi động
```

Khi cần tự động đồng bộ:
```bash
ENABLE_SCHEDULER=true
ENABLE_STARTUP_FETCH=true
```

## Cài đặt

### 1. Clone và install

```bash
git clone https://github.com/phuuthanh-dev/meta-marketing-dashboard.git
cd meta-marketing-dashboard
npm install
```

### 2. Cấu hình environment

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```bash
# Facebook Portfolio Tokens (Bắt buộc)
TOKEN_PORTFOLIO_1=your_token_here
TOKEN_PORTFOLIO_2=your_token_here

# Security (Bắt buộc)
APP_USERNAME=admin
APP_PASSWORD=change-this-to-strong-password
SESSION_SECRET=generate-a-random-secret-here

# Read-only mode (Khuyến nghị: true)
READ_ONLY=true

# Scheduler (Mặc định: false)
ENABLE_SCHEDULER=false
ENABLE_STARTUP_FETCH=false
```

### 3. Khởi chạy

```bash
# Fetch dữ liệu lần đầu
npm run fetch

# Start server
npm start
```

Truy cập: `http://localhost:3000`

## API Endpoints

### Authentication

- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/logout` - Đăng xuất
- `GET /api/auth/session` - Kiểm tra session

### Facebook Organic

- `GET /api/pages` - Danh sách pages
- `GET /api/pages/:id/metrics` - Metrics của page
- `GET /api/pages/:id/posts` - Danh sách posts
- `GET /api/pages/:id/top-posts` - Top posts
- `GET /api/pages/:id/reactions-timeline` - Timeline reactions
- `GET /api/pages/:id/post-frequency` - Tần suất đăng bài
- `GET /api/pages/:id/comments-trend` - Trend comment
- `GET /api/pages/:id/video-views` - Video views breakdown

### Facebook Ads

- `GET /api/ads/accounts` - Danh sách ad accounts
- `GET /api/ads/accounts/:id` - Chi tiết ad account
- `GET /api/ads/accounts/:id/insights` - Insights theo ngày
- `GET /api/ads/accounts/:id/campaigns` - Danh sách campaigns
- `GET /api/ads/accounts/:id/adsets` - Danh sách adsets
- `GET /api/ads/accounts/:id/ads` - Danh sách ads

### Instagram

- `GET /api/instagram/accounts` - Danh sách IG accounts
- `GET /api/instagram/accounts/:id` - Chi tiết IG account
- `GET /api/instagram/accounts/:id/insights` - Insights theo ngày
- `GET /api/instagram/accounts/:id/media` - Danh sách media
- `GET /api/instagram/accounts/:id/media-ranking` - Media ranking
- `GET /api/instagram/accounts/:id/demographics` - Demographics

### Export

- `GET /api/export/pages.csv` - Export pages
- `GET /api/export/ads/accounts/:id/insights.csv` - Export ads insights
- `GET /api/export/instagram/accounts/:id/insights.csv` - Export IG insights
- `GET /api/export/instagram/accounts/:id/media.csv` - Export IG media
- `GET /api/export/instagram/accounts/:id/demographics.csv` - Export IG demographics

## Scripts

```bash
npm start          # Start server
npm run fetch      # Fetch dữ liệu từ Meta API
npm run smoke      # Smoke test
npm run spike      # Spike test API capabilities
```

## Cấu trúc dự án

```
meta-marketing-dashboard/
├── src/
│   ├── index.js           # Entry point
│   ├── server.js          # Express server + routes
│   ├── database.js        # SQLite database layer
│   ├── config.js          # Configuration
│   ├── scheduler.js       # Cron scheduler
│   ├── facebook/          # Facebook Organic API
│   │   ├── api.js
│   │   └── metrics.js
│   ├── meta-ads/          # Ads API
│   │   ├── api.js
│   │   └── fetcher.js
│   └── instagram/         # Instagram API
│       ├── api.js
│       └── fetcher.js
├── public/                # Frontend
│   ├── index.html
│   ├── login.html
│   ├── css/
│   └── js/
├── data/                  # SQLite database
├── test/                  # Test scripts
├── .env.example           # Environment template
├── Dockerfile
└── docker-compose.yml
```

## Deployment

### Docker

```bash
docker-compose up -d
```

### Manual

```bash
npm install
npm run fetch
npm start
```

## Lưu ý

### Facebook Organic Metrics

Một số metric Facebook Page Insights đã bị Meta deprecate:
- `page_impressions`, `page_impressions_organic`, `page_impressions_paid`
- `page_engaged_users`, `page_consumptions`
- `page_fans`, `page_fans_locale`, `page_fans_city`, `page_fans_country`

Dashboard chỉ hiển thị các metric còn hoạt động.

### Ads Reporting

- Dữ liệu ads được đồng bộ theo account riêng biệt
- Summary có thể mix nhiều currency nếu có nhiều account
- Khuyến nghị xem theo từng account để tránh nhầm lẫn

### Instagram

- Demographics chỉ available cho một số account
- Media insights có thể không có cho một số loại media
- Discovery tự động tìm IG account linked với Pages

## License

ISC

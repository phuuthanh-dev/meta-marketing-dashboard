# 📊 Meta Marketing Dashboard

> Công cụ phân tích marketing nội bộ cho Meta platforms — **Facebook Organic**, **Ads**, và **Instagram** reporting trong một nơi duy nhất.

---

## ✨ Tính năng

| Module | Khả năng |
|--------|-------------|
| 📘 **Facebook Organic** | Page metrics, post engagements, reactions, video views, top posts |
| 💰 **Ads Reporting** | Account-level insights, campaign performance, KPIs (CTR, CPC, CPM) |
| 📷 **Instagram** | Account insights, media analytics, demographics, reach trends |
| 📤 **Export** | CSV exports cho tất cả loại dữ liệu |
| 🔌 **Real-time** | WebSocket support cho live updates |

---

## 🔒 Bảo mật

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

---

## 🚀 Quick Start

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

Truy cập dashboard tại **http://localhost:3000**

---

## ⚙️ Configuration

### Environment Variables

| Variable | Mô tả |
|----------|-------------|
| `TOKEN_PORTFOLIO_1` | Facebook token for portfolio 1 |
| `TOKEN_PORTFOLIO_2` | Facebook token for portfolio 2 |
| `PORT` | Server port (default: 3000) |
| `HOST` | Server host (default: localhost) |
| `APP_USERNAME` | Username đăng nhập |
| `APP_PASSWORD` | Password đăng nhập |
| `SESSION_SECRET` | Secret key cho session |
| `READ_ONLY` | Read-only mode (default: true) |
| `ENABLE_SCHEDULER` | Bật scheduler tự động (default: false) |
| `ENABLE_STARTUP_FETCH` | Fetch khi khởi động (default: false) |

### 🔑 Facebook Token Requirements

Tokens cần các permissions sau:
- `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
- `ads_read` (for Ads reporting)
- `instagram_basic`, `instagram_manage_insights` (for Instagram)

---

## 📡 API Endpoints

### 🔐 Authentication
| Method | Endpoint | Mô tả |
|--------|----------|-------------|
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/session` | Kiểm tra session |

### 📘 Facebook Organic
| Method | Endpoint | Mô tả |
|--------|----------|-------------|
| GET | `/api/pages` | Danh sách pages |
| GET | `/api/summary` | Summary stats |
| GET | `/api/pages/:id/metrics` | Page metrics |
| GET | `/api/pages/:id/top-posts` | Top posts |

### 💰 Ads
| Method | Endpoint | Mô tả |
|--------|----------|-------------|
| GET | `/api/ads/accounts` | Danh sách ad accounts |
| GET | `/api/ads/accounts/:id/insights` | Account insights |
| GET | `/api/ads/accounts/:id/campaigns` | Danh sách campaigns |

### 📷 Instagram
| Method | Endpoint | Mô tả |
|--------|----------|-------------|
| GET | `/api/instagram/accounts` | Danh sách IG accounts |
| GET | `/api/instagram/accounts/:id/insights` | Account insights |
| GET | `/api/instagram/accounts/:id/media` | Danh sách media |

### 📤 Export
| Method | Endpoint | Mô tả |
|--------|----------|-------------|
| GET | `/api/export/pages.csv` | Export pages |
| GET | `/api/export/ads/accounts/:id/insights.csv` | Export ads insights |
| GET | `/api/export/instagram/accounts/:id/media.csv` | Export IG media |

---

## 🛠️ Scripts

```bash
npm run fetch    # Fetch tất cả metrics từ Meta API
npm run smoke    # Chạy smoke test
npm run spike    # Chạy API spike test
npm run dev      # Start với auto-reload
```

---

## 📁 Project Structure

```
meta-marketing-dashboard/
├── src/
│   ├── index.js          # Entry point
│   ├── server.js         # Express server + routes
│   ├── database.js       # SQLite database layer
│   ├── config.js         # Configuration
│   ├── scheduler.js      # Cron scheduler
│   ├── facebook/         # 📘 Facebook Organic API
│   ├── meta-ads/         # 💰 Ads API
│   └── instagram/        # 📷 Instagram API
├── public/               # Frontend (HTML/CSS/JS)
├── test/                 # Test scripts
├── data/                 # SQLite database (gitignored)
└── docker-compose.yml
```

---

## 🚢 Deployment

### Railway / Render / Fly.io

1. Push to GitHub
2. Connect repo to platform
3. Set environment variables
4. Deploy

### VPS / VM

```bash
git clone https://github.com/phuuthanh-dev/meta-marketing-dashboard.git
cd meta-marketing-dashboard
cp .env.example .env
# Edit .env
docker-compose up -d
```

---

## ⚠️ Known Limitations

- ❌ Facebook Page demographics metrics đã bị Meta deprecate
- ⚠️ Ads summary có thể mix nhiều currencies nếu có nhiều accounts
- ℹ️ Instagram demographics yêu cầu accounts có đủ followers

---

## 📄 License

ISC

---

<div align="center">
  <sub>Built with ❤️ for internal marketing analytics</sub>
</div>

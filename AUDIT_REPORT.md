# Audit Report - Facebook Metrics Dashboard

## 1. Tổng quan dự án

### Cấu trúc hiện tại
```
fb-metrics/
├── src/
│   ├── index.js              # Entry point
│   ├── server.js             # Express server + API endpoints
│   ├── database.js           # SQLite database layer
│   ├── config.js             # Configuration
│   ├── facebook/
│   │   ├── api.js           # Facebook Graph API client
│   │   └── metrics.js       # Metrics fetcher
│   └── scheduler.js         # Cron job scheduler
├── public/
│   ├── index.html           # Main dashboard UI
│   ├── css/style.css        # Styling
│   └── js/
│       ├── api.js           # Frontend API client
│       ├── charts.js        # Chart.js utilities
│       ├── app.js           # Main app logic
│       ├── phase1.js        # Posts/Comments/Audience
│       ├── phase2.js        # Messages/Media/Real-time
│       ├── phase3.js        # Page Management/Analytics/Automation
│       └── phase3-charts.js # 5 Quick Win charts
├── data/
│   └── metrics.db           # SQLite database
└── .env                     # Environment variables
```

## 2. Vấn đề phát hiện

### 2.1. Database Schema
**Vấn đề:**
- Thiếu migration tự động cho các cột mới
- Không có index cho các trường query thường xuyên (page_id, date)
- Thiếu foreign key constraints

**Giải pháp:**
- Thêm migration system
- Tạo indexes cho page_metrics và post_metrics
- Thêm foreign key constraints

### 2.2. Facebook API Integration
**Vấn đề:**
- Không có retry mechanism cho failed requests
- Thiếu error handling chi tiết cho từng loại lỗi
- Không có caching cho page tokens (mỗi request đều gọi getPageToken)
- Rate limiting chưa tối ưu (hardcoded 1000ms)

**Giải pháp:**
- Implement exponential backoff
- Chi tiết hóa error handling
- Cache page tokens với TTL
- Dynamic rate limiting dựa trên API response headers

### 2.3. Data Fetching
**Vấn đề:**
- Chỉ fetch 10 posts gần nhất (thiếu dữ liệu lịch sử)
- Không fetch comments cho các posts
- Không có cơ chế fetch incremental (chỉ fetch data mới)
- Thiếu validation cho dữ liệu từ Facebook API

**Giải pháp:**
- Tăng số lượng posts fetch (50-100)
- Thêm fetch comments
- Implement incremental fetching
- Thêm data validation layer

### 2.4. Frontend
**Vấn đề:**
- Không có loading states cho charts
- Thiếu error handling UI
- Không có auto-refresh cho real-time data
- Charts không responsive trên mobile

**Giải pháp:**
- Thêm loading skeletons
- Implement error boundaries
- Auto-refresh với WebSocket
- Responsive design improvements

### 2.5. Followers vs Non-Followers Data
**Vấn đề:**
- Hiện tại chỉ có tổng fan_count và followers_count
- Không phân biệt được engagement từ followers vs non-followers
- Thiếu dữ liệu về reach/impressions theo đối tượng

**Khả thi:**
Facebook Graph API cung cấp các metrics sau để phân tích:
- `page_fans_by_like_source`: Phân loại fans theo nguồn (organic, paid, etc.)
- `page_impressions_by_paid_non_paid`: Impressions từ paid vs organic
- `page_engaged_users`: Số người tương tác (có thể filter)
- `page_fans_locale`, `page_fans_city`, `page_fans_country`: Phân loại theo địa lý

**Hạn chế:**
- Facebook không cung cấp trực tiếp "followers" vs "non-followers" trong Page Insights
- Cần App Review để truy cập một số advanced metrics
- Một số metrics chỉ available với Page Token có permissions đặc biệt

## 3. Phương án thi công tiếp theo

### Phase 4: Advanced Features & Optimization

#### 4.1. Database Optimization (Priority: HIGH)
- [ ] Thêm migration system
- [ ] Tạo indexes cho page_id, date
- [ ] Thêm foreign key constraints
- [ ] Implement database backup/restore

#### 4.2. Enhanced Data Fetching (Priority: HIGH)
- [ ] Fetch 50-100 posts thay vì 10
- [ ] Fetch comments cho mỗi post
- [ ] Implement incremental fetching
- [ ] Thêm data validation

#### 4.3. Followers/Non-Followers Analysis (Priority: MEDIUM)
- [ ] Thêm method `getFollowersAnalysis()` trong api.js
- [ ] Fetch metrics: `page_fans_by_like_source`, `page_impressions_by_paid_non_paid`
- [ ] Lưu vào database với schema mới
- [ ] Tạo chart hiển thị phân tích followers vs non-followers

#### 4.4. Real-time Improvements (Priority: MEDIUM)
- [ ] Auto-refresh charts mỗi 30s
- [ ] Thêm WebSocket notifications cho new data
- [ ] Implement offline mode với localStorage

#### 4.5. UI/UX Enhancements (Priority: LOW)
- [ ] Loading skeletons cho charts
- [ ] Error boundaries
- [ ] Mobile responsive improvements
- [ ] Dark mode support

## 4. Kế hoạch triển khai

### Sprint 1: Database & Data Fetching (1-2 ngày)
1. Implement migration system
2. Add indexes và foreign keys
3. Tăng số lượng posts fetch
4. Thêm fetch comments

### Sprint 2: Followers Analysis (2-3 ngày)
1. Thêm API methods cho followers analysis
2. Update database schema
3. Implement data fetching
4. Tạo charts và UI

### Sprint 3: Real-time & UI (1-2 ngày)
1. Auto-refresh charts
2. Loading states
3. Error handling UI
4. Mobile responsive

## 5. Kết luận

Dự án đã hoàn thành 3 phase cơ bản với đầy đủ tính năng. Để nâng cao chất lượng, cần tập trung vào:
1. **Database optimization** để cải thiện performance
2. **Enhanced data fetching** để có dữ liệu đầy đủ hơn
3. **Followers analysis** để phân tích sâu hơn về đối tượng

Về câu hỏi "có thể lấy From followers và From non-followers không?":
- **Có thể** nhưng với hạn chế
- Facebook không cung cấp trực tiếp "followers" vs "non-followers"
- Cần sử dụng các metrics gián tiếp như `page_fans_by_like_source`, `page_impressions_by_paid_non_paid`
- Một số metrics có thể cần App Review

## 6. Reporting Integrity Update (2026-07-04)

### Findings
- `fan_count` và `followers_count` trong `page_metrics` chưa phải historical snapshot thật. Luồng fetch cũ gán giá trị hiện tại của page cho toàn bộ chuỗi ngày.
- Vì vậy `Fan Growth Trend` và `Growth Rate` có nguy cơ tạo insight sai nếu tiếp tục render như dữ liệu tăng trưởng lịch sử.
- Database đã có cột `impressions`, `impressions_paid`, `impressions_organic`, `engaged_users`, `consumptions`, nhưng trước đây fetch pipeline chưa nạp các metric này.

### Actions Taken
- Tạm khóa `Fan Growth Trend` và `Growth Rate` bằng trạng thái `unavailable` thay vì hiển thị số liệu gây hiểu nhầm.
- Chuyển logic `Engagement Rate Trend` sang trạng thái `unavailable` khi local history không có reach data và khi Page Insights flow hiện tại không xác nhận được metric hợp lệ.
- Audit live Meta API cho thấy các metric `page_impressions`, `page_impressions_paid`, `page_impressions_organic`, `page_engaged_users`, `page_consumptions` đều trả `(#100) invalid insights metric` trong flow Page Insights đang test, nên thay đổi fetch đã được rollback để giữ pipeline ổn định.
- Cập nhật Audience UI để hiển thị rõ trạng thái `unsupported` thay vì chỉ báo trống dữ liệu.

### Audit Conclusion
- Dự án vẫn phù hợp để tiếp tục theo hướng `Facebook Page organic reporting`.
- Tuy nhiên bước làm giàu reach snapshot đang bị chặn bởi giới hạn/độ thay đổi của Meta Page Insights. Cần xác nhận nguồn metric hỗ trợ khác trước khi triển khai các chart mới như `Reach Mix Trend` và `Engagement Funnel`.

### Verified Metric Map (tested on 2026-07-04)

**Confirmed working Page Insights metrics in current flow**
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

**Confirmed invalid or unsupported in current flow**
- `page_impressions`
- `page_impressions_paid`
- `page_impressions_organic`
- `page_engaged_users`
- `page_consumptions`
- `page_content_posts_impressions`
- `page_content_posts_engagement`
- `page_places_checkin_total`
- `/{page-id}/video_insights` edge

### Safe Step-3 Direction
- Tiếp tục phát triển chart dựa trên local post data và các metric Page Insights đã xác nhận còn sống.
- Không triển khai chart reach funnel hoặc reach mix cho Facebook Page flow hiện tại.
- Ưu tiên các chart khả thi: reaction trend, video views split, total actions trend, top posts, posting cadence, comment activity, cross-page benchmarking.

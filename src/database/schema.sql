-- Pages table
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Page metrics (daily snapshots)
CREATE TABLE IF NOT EXISTS page_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id TEXT NOT NULL,
  date DATE NOT NULL,
  reactions_like INTEGER DEFAULT 0,
  reactions_love INTEGER DEFAULT 0,
  reactions_wow INTEGER DEFAULT 0,
  reactions_haha INTEGER DEFAULT 0,
  reactions_sorry INTEGER DEFAULT 0,
  reactions_anger INTEGER DEFAULT 0,
  post_engagements INTEGER DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  total_actions INTEGER DEFAULT 0,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES pages(id),
  UNIQUE(page_id, date)
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  message TEXT,
  created_time DATETIME,
  type TEXT,
  permalink_url TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES pages(id)
);

-- Post metrics (daily snapshots)
CREATE TABLE IF NOT EXISTS post_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  date DATE NOT NULL,
  reactions_like INTEGER DEFAULT 0,
  reactions_love INTEGER DEFAULT 0,
  reactions_wow INTEGER DEFAULT 0,
  reactions_haha INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  UNIQUE(post_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_page_metrics_date ON page_metrics(date);
CREATE INDEX IF NOT EXISTS idx_page_metrics_page_date ON page_metrics(page_id, date);
CREATE INDEX IF NOT EXISTS idx_post_metrics_date ON post_metrics(date);
CREATE INDEX IF NOT EXISTS idx_post_metrics_post_date ON post_metrics(post_id, date);
CREATE INDEX IF NOT EXISTS idx_posts_page ON posts(page_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_time);

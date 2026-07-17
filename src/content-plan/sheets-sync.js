/**
 * Content Plan - Google Sheets Sync
 * Đọc dữ liệu từ Google Sheet và lưu vào SQLite
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const Database = require('../database');

const CONTENT_PLAN_ROW_COUNT = 11;

function quoteSheetName(name) {
  return `'${String(name || 'Trang tính1').replace(/'/g, "''")}'`;
}

function buildSheetRange() {
  if (config.contentPlan?.range) return config.contentPlan.range;

  const sheetName = config.contentPlan?.sheetName || 'Trang tính1';
  const startRow = parseInt(config.contentPlan?.startRow, 10) || 3;
  const endRow = startRow + CONTENT_PLAN_ROW_COUNT - 1;
  const endColumn = config.contentPlan?.endColumn || 'ZZ';

  return `${quoteSheetName(sheetName)}!A${startRow}:${endColumn}${endRow}`;
}

function getMaxColumnCount(rows) {
  return rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
}

function isLabelColumn(column) {
  const contentCode = String(column[0] || '').trim().toLowerCase();
  const dateLabel = String(column[1] || '').trim().toLowerCase();
  return contentCode.includes('content code') || dateLabel.includes('ngày đăng');
}

/**
 * Parse ngày giờ từ sheet sang ISO string
 * @param {string} dateStr - Ngày dạng DD/MM/YYYY
 * @param {string} timeStr - Giờ dạng HH:MM AM/PM
 * @returns {string|null} - ISO string hoặc null nếu không parse được
 */
function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !dateStr.trim()) return null;

  // Parse ngày DD/MM/YYYY
  const dateParts = dateStr.trim().split('/');
  if (dateParts.length !== 3) return null;

  const day = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // JS months are 0-indexed
  const year = parseInt(dateParts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  // Parse giờ HH:MM AM/PM
  let hours = 0;
  let minutes = 0;

  if (timeStr && timeStr.trim()) {
    const timeMatch = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      const period = (timeMatch[3] || '').toUpperCase();

      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
    }
  }

  // Tạo Date object với timezone Asia/Ho_Chi_Minh (GMT+7)
  const date = new Date(Date.UTC(year, month, day, hours - 7, minutes)); // Trừ 7 giờ cho GMT+7

  return date.toISOString();
}

function normalizeStatus(status, postUrl = '') {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'DONE') return 'done';
  if (normalized === 'SCHEDULED') return 'scheduled';
  if (normalized === 'ERROR') return 'error';
  if (normalized === 'SKIP' || normalized === 'SKIPPED') return 'skipped';
  if (postUrl) return 'done';
  return 'pending';
}

/**
 * Parse một cột từ sheet thành content plan item
 * @param {Array} column - Mảng 11 phần tử (row 1-11)
 * @param {number} colIndex - Index cột (0-4 tương ứng B-F)
 * @returns {Object|null} - Content plan item hoặc null nếu ngày trống
 */
function parseColumn(column, colIndex) {
  if (isLabelColumn(column)) return null;

  // Row 1: Content Code
  const contentCode = (column[0] || '').toString().trim();
  if (!contentCode) return null;

  // Row 2: Ngày đăng (trống → skip)
  const dateStr = (column[1] || '').toString().trim();
  if (!dateStr) return null;

  // Row 3: Giờ đăng
  const timeStr = (column[2] || '').toString().trim();

  // Row 4: Kênh (Facebook / Instagram)
  const channel = (column[3] || '').toString().trim().toLowerCase();

  // Row 5: Link drive hình ảnh (tên file)
  const imageFilename = (column[4] || '').toString().trim();

  // Row 6: Link drive post (tiêu đề đầy đủ)
  const drivePostLink = (column[5] || '').toString().trim();

  // Row 7: Tiêu Đề / Hook
  const title = (column[6] || '').toString().trim();

  // Row 8: Kịch Bản / Caption (nhiều dòng)
  const caption = (column[7] || '').toString().trim();

  // Row 9: Định Dạng (Image/Video)
  const format = (column[8] || '').toString().trim().toLowerCase();

  // Row 10: Link post (URL sau khi đăng)
  const postUrl = (column[9] || '').toString().trim();

  // Row 11: Trạng Thái (DONE / trống)
  const status = normalizeStatus(column[10], postUrl);

  // Parse ngày giờ
  const scheduledAt = parseDateTime(dateStr, timeStr);
  if (!scheduledAt) {
    console.warn(`[Content Plan] Skip ${contentCode}: không parse được ngày giờ`);
    return null;
  }

  return {
    content_code: contentCode,
    scheduled_at: scheduledAt,
    channel: channel || 'facebook',
    image_filename: imageFilename,
    drive_post_link: drivePostLink,
    title: title,
    caption: caption,
    format: format || 'image',
    post_url: postUrl,
    status: status || 'pending'
  };
}

/**
 * Sync content plan từ Google Sheet vào database
 * @returns {Promise<Object>} - Kết quả sync
 */
async function syncContentPlan(options = {}) {
  const full = Boolean(options.full);
  const sheetId = config.contentPlan?.sheetId;
  const serviceAccountPath = config.contentPlan?.serviceAccountPath;

  if (!sheetId) {
    throw new Error('CONTENT_PLAN_SHEET_ID chưa được cấu hình');
  }

  if (!serviceAccountPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_PATH chưa được cấu hình');
  }

  // Kiểm tra file service account
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`File service account không tồn tại: ${serviceAccountPath}`);
  }

  // Initialize Google Sheets API
  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const range = buildSheetRange();

  // Đọc dữ liệu từ sheet
  console.log(`[Content Plan] Đang đọc sheet ${sheetId} range ${range}...`);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range
  });

  const rows = response.data.values || [];

  if (rows.length === 0) {
    console.log('[Content Plan] Sheet trống hoặc không có dữ liệu');
    return { synced: 0, skipped: 0, errors: [] };
  }

  // Transpose: mỗi cột (B→F) là 1 bài
  // rows[0] = row 1 (content codes), rows[1] = row 2 (dates), etc.
  const columns = [];
  const numCols = getMaxColumnCount(rows);

  for (let col = 0; col < numCols; col++) {
    const column = [];
    for (let row = 0; row < rows.length; row++) {
      column.push(rows[row]?.[col] || '');
    }
    columns.push(column);
  }

  console.log(`[Content Plan] Tìm thấy ${columns.length} cột dữ liệu`);

  const parsedItems = [];
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < columns.length; i++) {
    try {
      const item = parseColumn(columns[i], i);

      if (!item) {
        skipped++;
        continue;
      }

      parsedItems.push(item);
    } catch (err) {
      errors.push({ column: i, error: err.message });
      console.error(`[Content Plan] ✗ Lỗi cột ${i}:`, err.message);
    }
  }

  const db = Database.getInstance();
  let cleared = 0;
  if (full && parsedItems.length > 0) {
    cleared = db.clearContentPlanItems();
    console.log(`[Content Plan] Full sync: cleared ${cleared} local items before import`);
  }

  let synced = 0;
  for (const item of parsedItems) {
    db.upsertContentPlanItem(item);
    synced++;
    console.log(`[Content Plan] ✓ Synced: ${item.content_code}`);
  }

  console.log(`[Content Plan] Sync hoàn tất: ${synced} synced, ${skipped} skipped, ${errors.length} errors`);

  return { synced, skipped, errors, full, cleared, range };
}

module.exports = { syncContentPlan };

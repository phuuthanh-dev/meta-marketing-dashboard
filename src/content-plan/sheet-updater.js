/**
 * Content Plan - Sheet Updater
 * Cập nhật trạng thái bài viết sau khi publish thành công
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const Database = require('../database');

function quoteSheetName(name) {
  return `'${String(name || 'Trang tính1').replace(/'/g, "''")}'`;
}

function columnNumberToLetter(columnNumber) {
  let number = columnNumber;
  let letters = '';

  while (number > 0) {
    const remainder = (number - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    number = Math.floor((number - 1) / 26);
  }

  return letters;
}

/**
 * Tìm cột (column index) của content code trong sheet
 * @param {string} contentCode - Content code cần tìm (vd: DE.BLOG.22)
 * @returns {Promise<number|null>} - Column number 1-based hoặc null
 */
async function findColumnByContentCode(contentCode) {
  const sheetId = config.contentPlan?.sheetId;
  const serviceAccountPath = config.contentPlan?.serviceAccountPath;
  const sheetName = config.contentPlan?.sheetName || 'Trang tính1';
  const startRow = parseInt(config.contentPlan?.startRow, 10) || 3;
  const endColumn = config.contentPlan?.endColumn || 'ZZ';

  if (!sheetId || !serviceAccountPath) {
    throw new Error('Thiếu cấu hình Google Sheets');
  }

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`File service account không tồn tại: ${serviceAccountPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Đọc row content code theo layout Content Plan hiện tại.
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${quoteSheetName(sheetName)}!A${startRow}:${endColumn}${startRow}`
  });

  const row = response.data.values?.[0] || [];

  for (let i = 0; i < row.length; i++) {
    if ((row[i] || '').toString().trim() === contentCode) {
      return i + 1; // 1-based column number (A = 1, B = 2, ...)
    }
  }

  return null;
}

/**
 * Cập nhật sheet sau khi publish thành công
 * - Row 10 (index 9): Link post
 * - Row 11 (index 10): Trạng thái "DONE"
 * @param {string} contentCode - Content code (vd: DE.BLOG.22)
 * @param {string} postUrl - URL bài viết sau khi publish
 * @returns {Promise<Object>} - Kết quả update
 */
async function updateSheetStatus(contentCode, postUrl, status = 'DONE') {
  const sheetId = config.contentPlan?.sheetId;
  const serviceAccountPath = config.contentPlan?.serviceAccountPath;

  if (!sheetId) {
    throw new Error('CONTENT_PLAN_SHEET_ID chưa được cấu hình');
  }

  if (!serviceAccountPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_PATH chưa được cấu hình');
  }

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`File service account không tồn tại: ${serviceAccountPath}`);
  }

  // Tìm cột của content code
  const colIndex = await findColumnByContentCode(contentCode);
  if (colIndex === null) {
    throw new Error(`Không tìm thấy content code "${contentCode}" trong sheet`);
  }

  const sheetName = config.contentPlan?.sheetName || 'Trang tính1';
  const startRow = parseInt(config.contentPlan?.startRow, 10) || 3;
  const linkRow = startRow + 9;
  const statusRow = startRow + 10;
  const colLetter = columnNumberToLetter(colIndex);

  console.log(`[Sheet Updater] Updating ${contentCode} at column ${colLetter}`);

  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Prepare update data
  const updates = {
    spreadsheetId: sheetId,
    range: `${quoteSheetName(sheetName)}!${colLetter}${linkRow}:${colLetter}${statusRow}`,
    valueInputOption: 'RAW',
    resource: {
      values: [
        [postUrl],
        [status]
      ]
    }
  };

  const response = await sheets.spreadsheets.values.update(updates);

  console.log(`[Sheet Updater] ✓ Updated ${contentCode}: ${postUrl}`);

  return {
    contentCode,
    postUrl,
    status,
    updatedCells: response.data.updatedCells
  };
}

module.exports = { updateSheetStatus };

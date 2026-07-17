/**
 * Content Plan - Google Drive Download & Cloudinary Upload
 * Tìm file trong Drive folder, download và upload lên Cloudinary
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config');
const CloudinaryService = require('../cloudinary');

function createDriveClient() {
  const folderId = config.contentPlan?.driveFolderId;
  const serviceAccountPath = config.contentPlan?.serviceAccountPath;

  if (!folderId) {
    throw new Error('CONTENT_PLAN_DRIVE_FOLDER_ID chưa được cấu hình');
  }

  if (!serviceAccountPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_PATH chưa được cấu hình');
  }

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`File service account không tồn tại: ${serviceAccountPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  return {
    folderId,
    drive: google.drive({ version: 'v3', auth })
  };
}

/**
 * Tìm file trong Google Drive folder theo tên
 * @param {string} filename - Tên file cần tìm
 * @returns {Promise<Object|null>} - File resource hoặc null
 */
async function findFileInDrive(filename) {
  const { folderId, drive } = createDriveClient();

  // Tìm file theo tên trong folder
  const query = `name = '${filename.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;

  console.log(`[Drive] Tìm file: ${filename} trong folder ${folderId}`);

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType, size, driveId)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  const files = response.data.files || [];

  if (files.length === 0) {
    console.warn(`[Drive] Không tìm thấy file: ${filename}`);
    return null;
  }

  return files[0];
}

async function getDriveFileStream(filename) {
  if (!filename || !filename.trim()) {
    throw new Error('Filename không được để trống');
  }

  const file = await findFileInDrive(filename);
  if (!file) {
    throw new Error(`Không tìm thấy file "${filename}" trong Drive folder`);
  }

  const { drive } = createDriveClient();
  const response = await drive.files.get(
    { fileId: file.id, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  return {
    file,
    stream: response.data
  };
}

/**
 * Download file từ Google Drive về temp file
 * @param {string} fileId - ID của file
 * @param {string} filename - Tên file (để tạo temp path)
 * @returns {Promise<string>} - Đường dẫn temp file
 */
async function downloadFile(fileId, filename) {
  const { drive } = createDriveClient();

  // Tạo temp file
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `drive_${Date.now()}_${filename}`);

  console.log(`[Drive] Downloading file ${fileId} to ${tempPath}`);

  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  // Write stream to temp file
  const dest = fs.createWriteStream(tempPath);
  const downloadPromise = new Promise((resolve, reject) => {
    response.data
      .on('end', () => {
        console.log(`[Drive] Download complete: ${tempPath}`);
        resolve(tempPath);
      })
      .on('error', (err) => {
        console.error('[Drive] Download error:', err);
        reject(err);
      })
      .pipe(dest);
  });

  return downloadPromise;
}

/**
 * Upload file lên Cloudinary
 * @param {string} filePath - Đường dẫn file local
 * @param {string} filename - Tên file gốc
 * @returns {Promise<Object>} - Cloudinary upload result
 */
async function uploadToCloudinary(filePath, filename) {
  if (!CloudinaryService.isConfigured()) {
    throw new Error('Cloudinary chưa được cấu hình');
  }

  console.log(`[Cloudinary] Uploading ${filename}...`);

  // Đọc file thành buffer
  const fileBuffer = fs.readFileSync(filePath);

  // Tạo fake multer file object
  const fakeFile = {
    buffer: fileBuffer,
    originalname: filename,
    mimetype: getMimeType(filename)
  };

  // Upload lên Cloudinary
  const result = await CloudinaryService.uploadLocalFile(fakeFile, {
    resourceType: 'auto',
    folder: config.cloudinary.folder
  });

  console.log(`[Cloudinary] Upload success: ${result.secure_url}`);

  return result;
}

/**
 * Get MIME type từ filename
 * @param {string} filename - Tên file
 * @returns {string} - MIME type
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Lấy URL công khai của ảnh từ Drive filename
 * Download từ Drive → Upload Cloudinary → Trả URL
 * @param {string} filename - Tên file trong Drive
 * @returns {Promise<string>} - URL công khai của ảnh
 */
async function getImageUrl(filename) {
  if (!filename || !filename.trim()) {
    throw new Error('Filename không được để trống');
  }

  // Tìm file trong Drive
  const file = await findFileInDrive(filename);
  if (!file) {
    throw new Error(`Không tìm thấy file "${filename}" trong Drive folder`);
  }

  // Download file về temp
  const tempPath = await downloadFile(file.id, filename);

  try {
    // Upload lên Cloudinary
    const uploadResult = await uploadToCloudinary(tempPath, filename);

    // Xóa temp file
    fs.unlinkSync(tempPath);

    return uploadResult.secure_url;
  } catch (err) {
    // Cleanup temp file nếu upload lỗi
    try {
      fs.unlinkSync(tempPath);
    } catch (_) {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * List tất cả files trong Drive folder
 * @returns {Promise<Array>} - Danh sách files
 */
async function listDriveFiles() {
  const { folderId, drive } = createDriveClient();

  const query = `'${folderId}' in parents and trashed = false`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType, size, createdTime, driveId)',
    pageSize: 100,
    orderBy: 'createdTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  return response.data.files || [];
}

module.exports = { getImageUrl, getDriveFileStream, listDriveFiles };

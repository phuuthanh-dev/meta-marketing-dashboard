const { v2: cloudinary } = require('cloudinary');
const path = require('path');
const config = require('./config');

function normalizeResourceType(value = '') {
  const type = String(value || '').trim().toLowerCase();

  if (type === 'photo' || type === 'image') {
    return 'image';
  }

  if (type === 'video') {
    return 'video';
  }

  return 'auto';
}

function isConfigured() {
  return Boolean(
    config.cloudinary.cloudName
    && config.cloudinary.apiKey
    && config.cloudinary.apiSecret
  );
}

function configure() {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret
  });
}

function uploadBuffer(buffer, options = {}) {
  configure();

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    upload.end(buffer);
  });
}

async function uploadLocalFile(file, options = {}) {
  if (!file?.buffer) {
    throw new Error('No file buffer received for Cloudinary upload.');
  }

  const originalName = file.originalname || 'upload';
  const fileExt = path.extname(originalName);
  const publicIdBase = path.basename(originalName, fileExt)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'upload';

  const uploadOptions = {
    folder: config.cloudinary.folder || 'social-commerce',
    resource_type: normalizeResourceType(options.resourceType),
    public_id: `${Date.now()}-${publicIdBase}`,
    use_filename: false,
    unique_filename: false,
    overwrite: false,
    ...options
  };

  return uploadBuffer(file.buffer, uploadOptions);
}

module.exports = {
  isConfigured,
  uploadLocalFile
};

import { Config } from '../constants/Config';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system';

/**
 * Uploads a file (URI or Base64 data URL) to Cloudinary using an unsigned upload preset.
 * Cloudinary permanently stores files — no extra "store" API call needed.
 * @param {string} fileSource - local file URI or base64 data URL.
 * @returns {Promise<string|null>} - Secure Cloudinary CDN URL.
 */
export async function uploadToCloudinary(fileSource) {
  if (!fileSource) return null;

  // Already a remote URL — return as-is (e.g. re-saving without changing image)
  if (fileSource.startsWith('http')) return fileSource;

  let tempFile = null;
  try {
    const cloudName = Config.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = Config.CLOUDINARY_UPLOAD_PRESET;
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    const formData = new FormData();
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'ymobooks');

    let uploadUri = fileSource;

    // If it's a base64 data URL, write it to a temp file first
    if (fileSource.startsWith('data:')) {
      const base64Data = fileSource.split(',')[1];
      const extension = fileSource.split(';')[0].split('/')[1] || 'png';
      let cacheDir = FileSystem.cacheDirectory || FileSystemLegacy.cacheDirectory || '';
      if (!cacheDir) cacheDir = `${FileSystem.documentDirectory}cache/`;
      tempFile = `${cacheDir}cloudinary_temp_${Date.now()}.${extension}`;
      await FileSystemLegacy.writeAsStringAsync(tempFile, base64Data, {
        encoding: 'base64',
      });
      uploadUri = tempFile;
    }

    const filename = uploadUri.split('/').pop() || 'image.png';
    const ext = (filename.split('.').pop() || 'png').toLowerCase();
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'webp' ? 'image/webp'
      : 'image/png';

    formData.append('file', {
      uri: uploadUri,
      name: filename,
      type: mimeType,
    });

    console.log('[Cloudinary] Uploading to:', uploadUrl);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[Cloudinary] Non-JSON response:', responseText.substring(0, 200));
      return null;
    }

    if (data && data.secure_url) {
      console.log('[Cloudinary] Upload success:', data.secure_url);
      return data.secure_url;
    }

    console.warn('[Cloudinary] Upload failed. Response:', JSON.stringify(data));
    return null;

  } catch (error) {
    console.error('[Cloudinary] Upload error:', error.message);
    return null;
  } finally {
    if (tempFile) {
      try {
        await FileSystemLegacy.deleteAsync(tempFile, { idempotent: true });
      } catch (_) {}
    }
  }
}

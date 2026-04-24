import { Config } from '../constants/Config';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

const UC_PUBLIC_KEY = Config.UPLOADCARE_PUBLIC_KEY;
const UC_SECRET_KEY = Config.UPLOADCARE_SECRET_KEY;

/**
 * Calls Uploadcare's REST API to permanently store a file by UUID.
 * Without this, uploaded files are auto-deleted after ~24h.
 */
async function storeUploadcareFile(fileId) {
  try {
    const resp = await fetch(`https://api.uploadcare.com/files/${fileId}/storage/`, {
      method: 'PUT',
      headers: {
        'Authorization': `Uploadcare.Simple ${UC_PUBLIC_KEY}:${UC_SECRET_KEY}`,
        'Accept': 'application/vnd.uploadcare-v0.7+json',
      },
    });
    const json = await resp.json().catch(() => ({}));
    if (resp.ok) {
      console.log('[Uploadcare] File stored permanently:', fileId);
    } else {
      console.warn('[Uploadcare] Store API failed:', resp.status, JSON.stringify(json));
    }
  } catch (e) {
    console.warn('[Uploadcare] Store API error:', e.message);
  }
}

/**
 * Uploads a file (URI or Base64) to Uploadcare and returns the CDN URL.
 * @param {string} fileSource - URI of the file or Base64 string.
 * @returns {Promise<string|null>} - CDN URL of the uploaded file.
 */
export async function uploadToUploadcare(fileSource) {
    if (!fileSource) return null;
    if (fileSource.startsWith('http')) return fileSource; // Already an external URL

    let tempFile = null;
    try {
        const formData = new FormData();
        formData.append('UPLOADCARE_PUB_KEY', UC_PUBLIC_KEY);
        formData.append('UPLOADCARE_STORE', 'auto');

        let uploadUri = fileSource;

        if (fileSource.startsWith('data:')) {
            // Save base64 to a temp file to send as a real file
            const base64Data = fileSource.split(',')[1];
            const extension = fileSource.split(';')[0].split('/')[1] || 'png';
            let cacheDir = FileSystem.cacheDirectory || FileSystemLegacy.cacheDirectory || '';
            if (!cacheDir) cacheDir = `${FileSystem.documentDirectory}cache/`;
            tempFile = `${cacheDir}uploadcare_temp_${Date.now()}.${extension}`;
            await FileSystemLegacy.writeAsStringAsync(tempFile, base64Data, {
                encoding: 'base64',
            });
            uploadUri = tempFile;
        }

        const filename = uploadUri.split('/').pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/png`;

        formData.append('file', {
            uri: uploadUri,
            name: filename || 'image.png',
            type: type,
        });

        const response = await fetch('https://upload.uploadcare.com/base/', {
            method: 'POST',
            body: formData,
        });

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('[Uploadcare] Non-JSON response:', responseText);
            throw new Error(`Invalid JSON from Uploadcare: ${responseText.substring(0, 100)}`);
        }

        if (data && data.file) {
            const fileId = data.file;
            // Explicitly store the file permanently via REST API
            await storeUploadcareFile(fileId);
            const cdnUrl = `https://ucarecdn.com/${fileId}/`;
            console.log('[Uploadcare] Upload success. URL:', cdnUrl);
            return cdnUrl;
        }
        console.warn('[Uploadcare] No file ID in response:', JSON.stringify(data));
        return null;
    } catch (error) {
        console.error('[Uploadcare] Upload error:', error.message);
        return null;
    } finally {
        if (tempFile) {
            try {
                await FileSystemLegacy.deleteAsync(tempFile, { idempotent: true });
            } catch (e) {
                console.warn('[Uploadcare] Failed to delete temp file:', e.message);
            }
        }
    }
}

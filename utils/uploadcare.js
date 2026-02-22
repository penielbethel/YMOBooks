import { Config } from '../constants/Config';
import * as FileSystem from 'expo-file-system';

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
        const publicKey = Config.UPLOADCARE_PUBLIC_KEY;
        const formData = new FormData();
        formData.append('UPLOADCARE_PUB_KEY', publicKey);
        formData.append('UPLOADCARE_STORE', '1');

        let uploadUri = fileSource;

        if (fileSource.startsWith('data:')) {
            // Save base64 to a temp file to send as a real file
            const base64Data = fileSource.split(',')[1];
            const extension = fileSource.split(';')[0].split('/')[1] || 'png';
            tempFile = `${FileSystem.cacheDirectory}uploadcare_temp_${Date.now()}.${extension}`;
            await FileSystem.writeAsStringAsync(tempFile, base64Data, {
                encoding: FileSystem.EncodingType.Base64,
            });
            uploadUri = tempFile;
        }

        const filename = uploadUri.split('/').pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/png`;

        formData.append('file', {
            uri: uploadUri,
            name: filename,
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
            console.error('Uploadcare non-JSON response:', responseText);
            throw new Error(`Invalid JSON response from Uploadcare: ${responseText.substring(0, 100)}`);
        }

        if (data && data.file) {
            const fileId = data.file;
            return `https://ucarecdn.com/${fileId}/`;
        }
        return null;
    } catch (error) {
        console.error('Uploadcare upload error detalhes:', error.message);
        return null;
    } finally {
        if (tempFile) {
            try {
                await FileSystem.deleteAsync(tempFile, { idempotent: true });
            } catch (e) {
                console.warn('Failed to delete temp file:', e.message);
            }
        }
    }
}

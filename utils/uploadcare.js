import { Config } from '../constants/Config';

/**
 * Uploads a file (URI or Base64) to Uploadcare and returns the CDN URL.
 * @param {string} fileSource - URI of the file or Base64 string.
 * @returns {Promise<string|null>} - CDN URL of the uploaded file.
 */
export async function uploadToUploadcare(fileSource) {
    if (!fileSource) return null;
    if (fileSource.startsWith('http')) return fileSource; // Already an external URL

    try {
        const publicKey = Config.UPLOADCARE_PUBLIC_KEY;
        const formData = new FormData();
        formData.append('UPLOADCARE_PUB_KEY', publicKey);
        formData.append('UPLOADCARE_STORE', '1');

        if (fileSource.startsWith('data:')) {
            formData.append('file', fileSource);
        } else {
            // Local URI (React Native)
            const filename = fileSource.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : `image`;

            formData.append('file', {
                uri: fileSource,
                name: filename,
                type: type,
            });
        }

        const response = await fetch('https://upload.uploadcare.com/base/', {
            method: 'POST',
            body: formData,
            // Note: Do not set Content-Type header when using FormData with fetch
        });

        const data = await response.json();

        if (data && data.file) {
            const fileId = data.file;
            return `https://ucarecdn.com/${fileId}/`;
        }
        return null;
    } catch (error) {
        console.error('Uploadcare upload error:', error.message);
        return null;
    }
}

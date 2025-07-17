const config = require('../../config');

class MediaProcessor {
    constructor() {
        this.constants = config.getConstants();
    }

    isMediaSupported(mimetype) {
        return this.constants.SUPPORTED_MEDIA_TYPES.includes(mimetype);
    }

    async downloadAndProcessMedia(quotedMessage) {
        try {
            if (!quotedMessage.hasMedia) {
                return null;
            }

            console.log(`🖼️ Processing quoted media: ${quotedMessage.type}`);
            
            const media = await quotedMessage.downloadMedia();
            
            if (!media || !media.mimetype) {
                console.log('❌ No media data or mimetype found');
                return null;
            }

            if (!this.isMediaSupported(media.mimetype)) {
                console.log(`❌ Unsupported media type: ${media.mimetype}`);
                return { error: 'unsupported', mimetype: media.mimetype };
            }

            // Check file size limits
            const dataSize = media.data.length * 0.75; // Approximate size from base64
            const maxSize = media.mimetype === 'application/pdf' ? 
                this.constants.PDF_MAX_SIZE : this.constants.IMAGE_MAX_SIZE;
            
            if (dataSize > maxSize) {
                const sizeMB = Math.round(dataSize / 1024 / 1024);
                const maxMB = Math.round(maxSize / 1024 / 1024);
                console.log(`❌ File too large: ${sizeMB}MB (max: ${maxMB}MB)`);
                return { error: 'too_large', size: sizeMB, maxSize: maxMB };
            }

            console.log(`✅ Media processed: ${media.mimetype} (${Math.round(dataSize / 1024)}KB)`);
            
            return {
                data: media.data,
                mimetype: media.mimetype,
                filename: media.filename || 'media_file',
                size: Math.round(dataSize / 1024)
            };
            
        } catch (error) {
            console.error('❌ Error processing media:', error);
            return { error: 'processing_failed', details: error.message };
        }
    }
}

module.exports = MediaProcessor; 
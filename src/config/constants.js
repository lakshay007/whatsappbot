// Application constants
const CONSTANTS = {
    // Owner ID
    OWNER_ID: '917428233446@c.us',
    
    // File types
    ALLOWED_FILE_TYPES: ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.zip', '.rar', '.xlsx', '.xls', '.ppt', '.pptx'],
    
    // Media types
    SUPPORTED_MEDIA_TYPES: [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf'
    ],
    
    // File size limits
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    PDF_MAX_SIZE: 10 * 1024 * 1024,  // 10MB for PDF
    IMAGE_MAX_SIZE: 4 * 1024 * 1024, // 4MB for images
    
    // Health monitoring
    HEALTH_CHECK_INTERVAL: 2 * 60 * 1000, // 2 minutes
    KEEP_ALIVE_INTERVAL: 30 * 1000,       // 30 seconds
    HEALTH_TIMEOUT: 5 * 60 * 1000,        // 5 minutes
    MAX_RECONNECT_ATTEMPTS: 5,
    
    // Master search
    MASTER_SEARCH_TIMEOUT: 10 * 60 * 1000, // 10 minutes
    
    // Poll limits
    MAX_POLL_OPTIONS: 12,
    
    // Message purge limits
    MAX_PURGE_COUNT: 100,
    
    // Directories
    DOCUMENTS_DIR: 'documents',
    
    // Command prefixes
    COMMAND_PREFIX: '?',
    SYSTEM_PREFIX: '!',
    
    // Bot mentions
    BOT_MENTIONS: ['@chotu', 'chotu'],
    
    // Gemini models
    GEMINI_MODELS: [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash'
    ]
};

module.exports = CONSTANTS; 
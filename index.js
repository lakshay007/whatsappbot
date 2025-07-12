const { Client, LocalAuth, MessageMedia, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

// ComPDFKit API Configuration
const COMPDFKIT_API_BASE = 'https://api-server.compdf.com';
const COMPDFKIT_PUBLIC_KEY = process.env.COMPDFKIT_PUBLIC_KEY;
const COMPDFKIT_SECRET_KEY = process.env.COMPDFKIT_SECRET_KEY;

// ComPDFKit conversion type mappings - format: source/target
const CONVERSION_TYPES = {
    // Office to PDF
    'pdf': {
        'docx': 'docx/pdf',
        'doc': 'doc/pdf',
        'xlsx': 'xlsx/pdf',
        'xls': 'xls/pdf',
        'pptx': 'pptx/pdf',
        'ppt': 'ppt/pdf',
        'rtf': 'rtf/pdf',
        'txt': 'txt/pdf',
        'html': 'html/pdf',
        'htm': 'html/pdf',
        'csv': 'csv/pdf',
        'jpg': 'jpg/pdf',
        'jpeg': 'jpg/pdf',
        'png': 'png/pdf',
        'gif': 'png/pdf',
        'bmp': 'png/pdf',
        'tiff': 'png/pdf'
    },
    // PDF to Office
    'docx': {
        'pdf': 'pdf/docx'
    },
    'doc': {
        'pdf': 'pdf/doc'
    },
    'xlsx': {
        'pdf': 'pdf/xlsx'
    },
    'xls': {
        'pdf': 'pdf/xls'
    },
    'pptx': {
        'pdf': 'pdf/pptx'
    },
    'ppt': {
        'pdf': 'pdf/ppt'
    },
    'rtf': {
        'pdf': 'pdf/rtf'
    },
    'txt': {
        'pdf': 'pdf/txt'
    },
    'html': {
        'pdf': 'pdf/html'
    },
    'htm': {
        'pdf': 'pdf/html'
    },
    'csv': {
        'pdf': 'pdf/csv'
    },
    'jpg': {
        'pdf': 'pdf/jpg'
    },
    'jpeg': {
        'pdf': 'pdf/jpg'
    },
    'png': {
        'pdf': 'pdf/png'
    }
};

// ComPDFKit API Client
class ComPDFKitAPI {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    async authenticate() {
        try {
            const response = await axios.post(`${COMPDFKIT_API_BASE}/server/v1/oauth/token`, {
                publicKey: COMPDFKIT_PUBLIC_KEY,
                secretKey: COMPDFKIT_SECRET_KEY
            });

            this.accessToken = response.data.data.accessToken;
            this.tokenExpiry = Date.now() + (response.data.data.expiresIn * 1000);
            
            console.log('✅ ComPDFKit authenticated successfully');
            return true;
        } catch (error) {
            console.error('❌ ComPDFKit authentication failed:', error.response?.data || error.message);
            return false;
        }
    }

    async ensureAuthenticated() {
        if (!this.accessToken || Date.now() >= this.tokenExpiry) {
            return await this.authenticate();
        }
        return true;
    }

    async createTask(conversionType) {
        if (!await this.ensureAuthenticated()) {
            throw new Error('Authentication failed');
        }

        try {
            const response = await axios.post(`${COMPDFKIT_API_BASE}/server/v1/task/${conversionType}`, {}, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            return response.data.data.taskId;
        } catch (error) {
            console.error('❌ Create task failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async uploadFile(taskId, filePath, parameters = {}) {
        if (!await this.ensureAuthenticated()) {
            throw new Error('Authentication failed');
        }

        try {
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));
            formData.append('taskId', taskId);
            formData.append('parameter', JSON.stringify(parameters));

            const response = await axios.post(`${COMPDFKIT_API_BASE}/server/v1/file/upload`, formData, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    ...formData.getHeaders()
                }
            });

            return response.data.data.fileKey;
        } catch (error) {
            console.error('❌ Upload file failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async executeTask(taskId) {
        if (!await this.ensureAuthenticated()) {
            throw new Error('Authentication failed');
        }

        try {
            const response = await axios.get(`${COMPDFKIT_API_BASE}/server/v1/execute/start`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                params: { taskId }
            });

            return response.data;
        } catch (error) {
            console.error('❌ Execute task failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async getTaskInfo(taskId) {
        if (!await this.ensureAuthenticated()) {
            throw new Error('Authentication failed');
        }

        try {
            const response = await axios.get(`${COMPDFKIT_API_BASE}/server/v1/task/taskInfo`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                params: { taskId }
            });

            return response.data.data;
        } catch (error) {
            console.error('❌ Get task info failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async downloadFile(fileKey, outputPath) {
        if (!await this.ensureAuthenticated()) {
            throw new Error('Authentication failed');
        }

        try {
            // First get file info to get download URL
            const fileInfoResponse = await axios.get(`${COMPDFKIT_API_BASE}/server/v1/file/fileInfo`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                params: { fileKey }
            });

            const downloadUrl = fileInfoResponse.data.data.downloadUrl;
            
            // Download from the returned URL
            const response = await axios.get(downloadUrl, {
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(outputPath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        } catch (error) {
            console.error('❌ Download file failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSupportedTools() {
        if (!await this.ensureAuthenticated()) {
            throw new Error('Authentication failed');
        }

        try {
            const response = await axios.get(`${COMPDFKIT_API_BASE}/server/v1/tool/support`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            return response.data.data;
        } catch (error) {
            console.error('❌ Get supported tools failed:', error.response?.data || error.message);
            throw error;
        }
    }
}

// Initialize ComPDFKit API client
const compdfkitAPI = new ComPDFKitAPI();

// Helper function to get supported conversion types
function getSupportedConversions(sourceFormat) {
    const conversions = [];
    const sourceExt = sourceFormat.toLowerCase();
    
    if (CONVERSION_TYPES[sourceExt]) {
        Object.keys(CONVERSION_TYPES[sourceExt]).forEach(targetExt => {
            conversions.push(targetExt);
        });
    }
    
    // Also check if this format can be converted TO from other formats
    Object.keys(CONVERSION_TYPES).forEach(targetExt => {
        if (CONVERSION_TYPES[targetExt] && CONVERSION_TYPES[targetExt][sourceExt]) {
            if (!conversions.includes(targetExt)) {
                conversions.push(targetExt);
            }
        }
    });
    
    return conversions;
}

// Helper function to get conversion type from source and target formats
function getConversionType(sourceFormat, targetFormat) {
    const sourceExt = sourceFormat.toLowerCase();
    const targetExt = targetFormat.toLowerCase();
    
    if (CONVERSION_TYPES[targetExt] && CONVERSION_TYPES[targetExt][sourceExt]) {
        return CONVERSION_TYPES[targetExt][sourceExt];
    }
    
    return null;
}

// Helper function to detect file format from filename
function getFileExtension(filename) {
    return path.extname(filename).toLowerCase().substring(1);
}

// Document conversion function
async function convertDocument(sourceFilePath, targetFormat, originalFilename) {
    try {
        const sourceFormat = getFileExtension(originalFilename);
        const conversionType = getConversionType(sourceFormat, targetFormat);
        
        if (!conversionType) {
            throw new Error(`Conversion from ${sourceFormat} to ${targetFormat} is not supported`);
        }
        
        console.log(`🔄 Starting conversion: ${sourceFormat} → ${targetFormat} (${conversionType})`);
        
        // Create task
        const taskId = await compdfkitAPI.createTask(conversionType);
        console.log(`📋 Created task: ${taskId}`);
        
        // Upload file
        const fileKey = await compdfkitAPI.uploadFile(taskId, sourceFilePath);
        console.log(`📤 Uploaded file: ${fileKey}`);
        
        // Execute task
        await compdfkitAPI.executeTask(taskId);
        console.log(`▶️ Task executed, processing...`);
        
        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30; // 5 minutes max
        
        while (attempts < maxAttempts) {
            const taskInfo = await compdfkitAPI.getTaskInfo(taskId);
            
            if (taskInfo.taskStatus === 'TaskFinish') {
                console.log(`✅ Conversion completed successfully`);
                
                // Download result
                const outputFilename = `${path.basename(originalFilename, '.' + sourceFormat)}_converted.${targetFormat}`;
                const outputPath = path.join(__dirname, 'temp', outputFilename);
                
                // Ensure temp directory exists
                if (!fs.existsSync(path.join(__dirname, 'temp'))) {
                    fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
                }
                
                await compdfkitAPI.downloadFile(taskInfo.fileInfos[0].fileKey, outputPath);
                console.log(`📥 Downloaded result: ${outputPath}`);
                
                return {
                    success: true,
                    outputPath,
                    outputFilename,
                    conversionType,
                    sourceFormat,
                    targetFormat
                };
            } else if (taskInfo.taskStatus === 'TaskError') {
                throw new Error(`Conversion failed: ${taskInfo.errorMessage || 'Unknown error'}`);
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
            attempts++;
        }
        
        throw new Error('Conversion timeout - task did not complete within 5 minutes');
        
    } catch (error) {
        console.error('❌ Conversion failed:', error.message);
        throw error;
    }
}

// Initialize Gemini AI with model switching using multiple API keys
const genAI1 = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const genAI2 = process.env.GEMINI_API_KEY2 ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY2) : null;
const genAI3 = process.env.GEMINI_API_KEY3 ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY3) : null;

// Model and API key rotation setup (only 2.0-flash and 2.0-flash-lite)
const MODEL_ROTATION = [
    { model: 'gemini-2.0-flash', client: genAI1, keyName: 'KEY1' },
    { model: 'gemini-2.0-flash-lite', client: genAI1, keyName: 'KEY1' }
];

// Add second API key models if available
if (genAI2) {
    MODEL_ROTATION.push(
        { model: 'gemini-2.0-flash', client: genAI2, keyName: 'KEY2' },
        { model: 'gemini-2.0-flash-lite', client: genAI2, keyName: 'KEY2' }
    );
}

// Add third API key models if available
if (genAI3) {
    MODEL_ROTATION.push(
        { model: 'gemini-2.0-flash', client: genAI3, keyName: 'KEY3' },
        { model: 'gemini-2.0-flash-lite', client: genAI3, keyName: 'KEY3' }
    );
}

// Log the configuration
const keyCount = 1 + (genAI2 ? 1 : 0) + (genAI3 ? 1 : 0);
const totalCombinations = MODEL_ROTATION.length;
console.log(`🔑 API key rotation enabled - ${keyCount} keys, ${totalCombinations} model combinations available`);
console.log(`📋 Models: gemini-2.0-flash, gemini-2.0-flash-lite (1.5-flash removed)`);

if (genAI2 && genAI3) {
    console.log('🚀 Triple API key mode activated!');
} else if (genAI2) {
    console.log('🔄 Dual API key mode activated');
} else {
    console.log('⚡ Single API key mode');
}

let currentModelIndex = 0; // Start with first combination

// Enhanced model getter
function getCurrentModel() {
    const current = MODEL_ROTATION[currentModelIndex];
    return current.client.getGenerativeModel({ model: current.model });
}

// Enhanced switching logic
function switchToNextModel() {
    currentModelIndex = (currentModelIndex + 1) % MODEL_ROTATION.length;
    const current = MODEL_ROTATION[currentModelIndex];
    console.log(`🔄 Switched to: ${current.model} (${current.keyName})`);
}

// Bot health monitoring variables
let isReady = false;
let lastHeartbeat = Date.now();
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let healthCheckInterval;
let keepAliveInterval;
let isRestarting = false;

// Native WhatsApp polls - no storage needed!

// Owner's last master search results storage
let ownerLastMasterSearch = null;

// Document management functions
function sanitizeGroupName(groupName) {
    // Remove special characters and replace spaces with underscores
    return groupName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

function getGroupDocumentsFolder(chat) {
    let folderName;
    if (chat.isGroup) {
        folderName = sanitizeGroupName(chat.name || chat.id.user);
    } else {
        folderName = 'private_' + sanitizeGroupName(chat.id.user);
    }
    
    const documentsPath = path.join(__dirname, 'documents', folderName);
    
    // Create folder if it doesn't exist
    if (!fs.existsSync(path.join(__dirname, 'documents'))) {
        fs.mkdirSync(path.join(__dirname, 'documents'));
    }
    if (!fs.existsSync(documentsPath)) {
        fs.mkdirSync(documentsPath, { recursive: true });
    }
    
    return documentsPath;
}

function fuzzySearch(query, filename) {
    const queryLower = query.toLowerCase();
    const filenameLower = filename.toLowerCase();
    
    // Exact match gets highest score
    if (filenameLower === queryLower) return 100;
    
    // Starts with query gets high score
    if (filenameLower.startsWith(queryLower)) return 90;
    
    // Contains query gets medium score
    if (filenameLower.includes(queryLower)) return 70;
    
    // Check if all query characters exist in filename (order doesn't matter)
    const queryChars = queryLower.split('');
    const filenameChars = filenameLower.split('');
    let queryIndex = 0;
    
    for (let i = 0; i < filenameChars.length && queryIndex < queryChars.length; i++) {
        if (filenameChars[i] === queryChars[queryIndex]) {
            queryIndex++;
        }
    }
    
    if (queryIndex === queryChars.length) return 50; // All characters found in order
    
    // Simple character overlap scoring
    const commonChars = queryChars.filter(char => filenameChars.includes(char)).length;
    return (commonChars / queryChars.length) * 30;
}

function searchDocuments(documentsPath, query) {
    try {
        if (!fs.existsSync(documentsPath)) {
            return [];
        }
        
        const files = fs.readdirSync(documentsPath);
        const results = [];
        
        for (const file of files) {
            const filePath = path.join(documentsPath, file);
            const stats = fs.statSync(filePath);
            
            if (stats.isFile()) {
                const score = fuzzySearch(query, file);
                if (score > 0) {
                    results.push({
                        filename: file,
                        path: filePath,
                        score: score,
                        size: stats.size
                    });
                }
            }
        }
        
        // Sort by score (highest first)
        return results.sort((a, b) => b.score - a.score);
    } catch (error) {
        console.error('❌ Error searching documents:', error);
        return [];
    }
}

function getOrderedDocuments(documentsPath) {
    try {
        if (!fs.existsSync(documentsPath)) {
            return [];
        }
        
        const files = fs.readdirSync(documentsPath);
        const documents = [];
        
        for (const file of files) {
            const filePath = path.join(documentsPath, file);
            const stats = fs.statSync(filePath);
            
            if (stats.isFile()) {
                documents.push({
                    name: file,
                    path: filePath,
                    size: stats.size,
                    modified: stats.mtime
                });
            }
        }
        
        // Sort by most recently modified (same as ?list command)
        return documents.sort((a, b) => b.modified - a.modified);
    } catch (error) {
        console.error('❌ Error getting ordered documents:', error);
        return [];
    }
}

// Master search functions for owner-only global search
function getAllGroupFolders() {
    try {
        const documentsPath = path.join(__dirname, 'documents');
        
        if (!fs.existsSync(documentsPath)) {
            return [];
        }
        
        const folders = fs.readdirSync(documentsPath);
        const groupFolders = [];
        
        for (const folder of folders) {
            const folderPath = path.join(documentsPath, folder);
            const stats = fs.statSync(folderPath);
            
            if (stats.isDirectory()) {
                groupFolders.push({
                    name: folder,
                    path: folderPath,
                    displayName: folder.replace(/_/g, ' ') // Convert underscores back to spaces for display
                });
            }
        }
        
        return groupFolders;
    } catch (error) {
        console.error('❌ Error getting group folders:', error);
        return [];
    }
}

function masterSearchDocuments(query) {
    try {
        const groupFolders = getAllGroupFolders();
        const allResults = [];
        
        for (const groupFolder of groupFolders) {
            const searchResults = searchDocuments(groupFolder.path, query);
            
            // Add group information to each result
            for (const result of searchResults) {
                allResults.push({
                    ...result,
                    groupName: groupFolder.name,
                    groupDisplayName: groupFolder.displayName,
                    groupPath: groupFolder.path
                });
            }
        }
        
        // Sort all results by score (highest first), then by group name
        return allResults.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.groupDisplayName.localeCompare(b.groupDisplayName);
        });
        
    } catch (error) {
        console.error('❌ Error in master search:', error);
        return [];
    }
}

// Create client with optimized settings
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ],
        headless: true
    }
});

// Graceful shutdown function
function gracefulShutdown() {
    console.log('🔄 Initiating graceful shutdown...');
    isRestarting = true;
    
    // Clear intervals
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    
    // Destroy client
    if (client) {
        try {
            client.destroy();
        } catch (error) {
            console.error('❌ Error destroying client:', error);
        }
    }
    
    // Exit process
    setTimeout(() => {
        console.log('🔄 Restarting process...');
        process.exit(1);
    }, 3000);
}

// Restart function with exponential backoff
function restartBot() {
    if (isRestarting) return;
    
    console.log('🔄 Bot restart triggered...');
    
    if (reconnectAttempts >= maxReconnectAttempts) {
        console.error(`❌ Maximum reconnect attempts (${maxReconnectAttempts}) reached. Exiting...`);
        process.exit(1);
    }
    
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Cap at 30 seconds
    
    console.log(`⏰ Restarting in ${delay/1000} seconds (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
    
    setTimeout(() => {
        gracefulShutdown();
    }, delay);
}

// Health check function
function performHealthCheck() {
    const now = Date.now();
    const timeSinceLastHeartbeat = now - lastHeartbeat;
    const healthTimeout = 5 * 60 * 1000; // 5 minutes
    
    console.log(`💗 Health check - Last heartbeat: ${Math.floor(timeSinceLastHeartbeat/1000)}s ago`);
    
    // Check if client is healthy
    if (!isReady || timeSinceLastHeartbeat > healthTimeout) {
        console.error(`❌ Health check failed - Bot appears stuck or disconnected`);
        restartBot();
        return;
    }
    
    // Additional checks
    try {
        if (client && client.info) {
            console.log(`✅ Health check passed - Bot ID: ${client.info.wid?._serialized || 'unknown'}`);
        } else {
            console.warn('⚠️ Client info not available, but connection seems active');
        }
    } catch (error) {
        console.error('❌ Health check error:', error);
        restartBot();
    }
}

// Keep-alive function
async function sendKeepAlive() {
    try {
        if (isReady && client && client.info) {
            // Send presence to maintain connection
            await client.sendPresenceAvailable();
            lastHeartbeat = Date.now();
            console.log('💓 Keep-alive sent');
        }
    } catch (error) {
        console.error('❌ Keep-alive failed:', error);
        // Don't restart immediately on keep-alive failure, let health check handle it
    }
}

// Start monitoring intervals
function startMonitoring() {
    // Health check every 2 minutes
    healthCheckInterval = setInterval(performHealthCheck, 2 * 60 * 1000);
    
    // Keep-alive every 30 seconds
    keepAliveInterval = setInterval(sendKeepAlive, 30 * 1000);
    
    console.log('🔍 Monitoring started - Health checks every 2 minutes, keep-alive every 30 seconds');
}

client.on('ready', () => {
    console.log('🤖 WhatsApp AI Bot is ready!');
    console.log('✅ Listening for mentions @chotu...');
    
    isReady = true;
    lastHeartbeat = Date.now();
    reconnectAttempts = 0; // Reset on successful connection
    
    // Start monitoring
    startMonitoring();
});

client.on('qr', qr => {
    console.log('📱 Scan the QR code below to authenticate:');
    qrcode.generate(qr, {small: true});
    lastHeartbeat = Date.now(); // Update heartbeat on QR generation
});

client.on('authenticated', () => {
    console.log('✅ Authentication successful!');
    lastHeartbeat = Date.now();
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    isReady = false;
    restartBot();
});

client.on('disconnected', (reason) => {
    console.log('📱 Client disconnected:', reason);
    isReady = false;
    
    // Don't restart on logout (user initiated)
    if (reason === 'LOGOUT' || reason === 'NAVIGATION') {
        console.log('🛑 Manual logout detected - not restarting');
        process.exit(0);
    } else {
        console.log('🔄 Unexpected disconnection - initiating restart');
        restartBot();
    }
});

client.on('change_state', (state) => {
    console.log('🔄 State changed:', state);
    lastHeartbeat = Date.now();
    
    if (state === 'CONNECTED') {
        isReady = true;
    } else if (state === 'TIMEOUT' || state === 'CONFLICT') {
        console.error('❌ Connection issue detected:', state);
        isReady = false;
        restartBot();
    }
});

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT - shutting down gracefully...');
    gracefulShutdown();
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM - shutting down gracefully...');
    gracefulShutdown();
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    restartBot();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    restartBot();
});

// Function to check if message mentions the user
async function isMentioned(message) {
    try {
        // Update heartbeat on message activity
        lastHeartbeat = Date.now();
        
        // Check for actual WhatsApp mentions first
        if (message.mentionedIds && message.mentionedIds.length > 0) {
            // Get your own WhatsApp ID (format: number@c.us)
            const myId = client.info.wid._serialized;
            console.log(`🔍 Checking if ${myId} is in mentions: ${JSON.stringify(message.mentionedIds)}`);
            
            // Check if your ID is in the mentioned IDs
            const isMentioned = message.mentionedIds.includes(myId);
            if (isMentioned) {
                console.log(`✅ Found mention match!`);
                return true;
            }
        }
        
        // Fallback: check for text mentions (in case it's a private chat or different format)
        const mentionText = message.body.toLowerCase();
        const textMention = mentionText.includes('@chotu') || 
                           mentionText.includes('@chotu') ||
                           mentionText.includes('chotu');
        
        if (textMention) {
            console.log(`✅ Found text mention match!`);
        }
        
        return textMention;
    } catch (error) {
        console.error('❌ Error checking mentions:', error);
        // Fallback to text-based detection
        const mentionText = message.body.toLowerCase();
        return mentionText.includes('@chotu') || 
               mentionText.includes('@chotu') ||
               mentionText.includes('chotu');
    }
}

// Function to check if message is a reply to the bot
async function isReplyToBot(message) {
    try {
        // Check if message has a quoted message (reply)
        if (message.hasQuotedMsg) {
            const quotedMsg = await message.getQuotedMessage();
            const botId = client.info.wid._serialized;
            
            // Check if the quoted message is from the bot
            if (quotedMsg.fromMe || quotedMsg.author === botId || quotedMsg.from === botId) {
                console.log(`✅ Found reply to bot's message!`);
                return { isReply: true, quotedMessage: quotedMsg };
            }
        }
        return { isReply: false, quotedMessage: null };
    } catch (error) {
        console.error('❌ Error checking reply:', error);
        return { isReply: false, quotedMessage: null };
    }
}

// Google grounding configuration
const groundingTool = {
    googleSearch: {},
};

// Media processing functions for multimodal AI
function isMediaSupported(mimetype) {
    const supportedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf'
    ];
    return supportedTypes.includes(mimetype);
}

async function downloadAndProcessMedia(quotedMessage) {
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

        if (!isMediaSupported(media.mimetype)) {
            console.log(`❌ Unsupported media type: ${media.mimetype}`);
            return { error: 'unsupported', mimetype: media.mimetype };
        }

        // Check file size limits
        const dataSize = media.data.length * 0.75; // Approximate size from base64
        const maxSize = media.mimetype === 'application/pdf' ? 10 * 1024 * 1024 : 4 * 1024 * 1024; // 10MB for PDF, 4MB for images
        
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

function buildMultimodalPrompt(userMessage, senderName, mediaType, contextType = 'reply') {
    let prompt = `You are chotu - a quick-witted, clever person who responds naturally on WhatsApp. ${senderName} `;

    if (mediaType === 'application/pdf') {
        prompt += `replied to a PDF document with: "${userMessage}"

Analyze the PDF document and respond to their question/comment. You can:
- Summarize the content
- Answer specific questions about the document
- Extract key information
- Explain concepts from the document
- Be critical or analytical if they're asking for review`;
    } else if (mediaType.startsWith('image/')) {
        prompt += `replied to an image with: "${userMessage}"

Look at the image and respond to their question/comment. You can:
- Describe what you see
- Answer questions about the image content
- Explain visual elements, text, charts, diagrams
- Read text from the image if present
- Analyze, critique, or comment on what's shown
- Be humorous about memes or funny images`;
    }

    prompt += `

YOUR PERSONALITY:
- Quick-witted and clever with sharp responses
- Direct and to the point, no unnecessary fluff
- Can be playfully sarcastic when appropriate
- Don't use emojis, keep it text-based
- Reference specific visual/document elements when relevant
- For Lakshay Chauhan/Lakshya/Lakshay: Always be respectful (he's the boss)

RESPONSE RULES:
- Focus on what they're specifically asking about the media
- Be specific about what you see/read in the content
- Keep responses conversational and WhatsApp-appropriate length
- Don't just describe - engage with their actual question

Now analyze the ${mediaType.startsWith('image/') ? 'image' : 'document'} and respond to: ${userMessage}`;

    return prompt;
}

// Function to get AI response from Gemini
async function executeNaturalCommand(message, aiResponse, chat, senderName) {
    try {
        const [_, command, params] = aiResponse.split(':');
        
        switch(command) {
            case 'KICK':
                await executeKickCommand(message, params, chat);
                break;
            case 'PURGE':
                await executePurgeCommand(message, params, chat);
                break;
            case 'POLL':
                await executePollCommand(message, params, chat);
                break;
            case 'WELCOME':
                await executeWelcomeCommand(message, params);
                break;
            case 'AVATAR':
                await executeAvatarCommand(message, params);
                break;
            default:
                await message.reply("I understood you want to do something but I'm not sure what. Try using the direct commands!");
        }
    } catch (error) {
        console.error('❌ Error executing natural command:', error);
        await message.reply("I understood what you want but had trouble executing it. Try the direct command instead!");
    }
}

async function executeKickCommand(message, username, chat) {
    if (!chat.isGroup) {
        return message.reply('This command can only be used in a group.');
    }

    // Check admin permissions
    const authorId = message.author;
    const senderIsAdmin = chat.participants.find(p => p.id._serialized === authorId)?.isAdmin;
    const senderIsOwner = authorId === '917428233446@c.us';

    if (!senderIsAdmin && !senderIsOwner) {
        return message.reply('You need to be a group admin to kick users.');
    }

    const botId = client.info.wid._serialized;
    const botIsAdmin = chat.participants.find(p => p.id._serialized === botId)?.isAdmin;

    if (!botIsAdmin) {
        return message.reply('I need to be an admin to do that.');
    }

    // For safety, require mentions for natural language kicks
    if (!message.mentionedIds || message.mentionedIds.length === 0) {
        return message.reply('For safety, please mention the user you want to kick when using natural language. Example: "kick @username"');
    }

    const userToKickId = message.mentionedIds[0];

    if (userToKickId === '917428233446@c.us') {
        return message.reply("I'm not allowed to do that.");
    }

    const participantToKick = chat.participants.find(p => p.id._serialized === userToKickId);

    if (!participantToKick) {
        return message.reply("That user isn't in this group.");
    }

    if (participantToKick.isAdmin || participantToKick.isSuperAdmin) {
        return message.reply("I can't remove another admin.");
    }

    try {
        await chat.removeParticipants([userToKickId]);
        await message.reply('Done.');
    } catch (err) {
        console.error('Failed to kick user:', err);
        await message.reply('Failed to remove the user. Please check my permissions.');
    }
}

async function executePurgeCommand(message, countStr, chat) {
    if (!chat.isGroup) {
        return message.reply('This command can only be used in a group.');
    }

    const authorId = message.author;
    const senderIsAdmin = chat.participants.find(p => p.id._serialized === authorId)?.isAdmin;
    const senderIsOwner = authorId === '917428233446@c.us';

    if (!senderIsAdmin && !senderIsOwner) {
        return message.reply('You need to be a group admin to delete messages.');
    }

    const botId = client.info.wid._serialized;
    const botIsAdmin = chat.participants.find(p => p.id._serialized === botId)?.isAdmin;

    if (!botIsAdmin) {
        return message.reply('I need to be an admin to delete messages.');
    }

    const deleteCount = parseInt(countStr);
    if (isNaN(deleteCount) || deleteCount < 1 || deleteCount > 100) {
        return message.reply('Please provide a valid number between 1 and 100.');
    }

    try {
        const messages = await chat.fetchMessages({ limit: deleteCount + 10 });
        
        if (messages.length <= 1) {
            return message.reply('No messages to delete.');
        }

        const purgeCommandIndex = messages.findIndex(msg => msg.id._serialized === message.id._serialized);
        let messagesToDelete;
        
        if (purgeCommandIndex !== -1) {
            const startIndex = Math.max(0, purgeCommandIndex - deleteCount);
            messagesToDelete = messages.slice(startIndex, purgeCommandIndex);
        } else {
            messagesToDelete = messages.slice(1, deleteCount + 1);
        }
        
        let deletedCount = 0;
        let failedCount = 0;
        
        for (let i = 0; i < messagesToDelete.length; i++) {
            const msg = messagesToDelete[i];
            try {
                await msg.delete(true);
                deletedCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (deleteError) {
                failedCount++;
            }
        }

        try {
            await message.delete(true);
        } catch (deleteError) {
            console.error('Failed to delete command message:', deleteError);
        }

        if (deletedCount > 0) {
            let confirmText = `Deleted ${deletedCount} messages.`;
            if (failedCount > 0) {
                confirmText += ` (${failedCount} couldn't be deleted)`;
            }
            
            const confirmMsg = await chat.sendMessage(confirmText);
            
            setTimeout(async () => {
                try {
                    await confirmMsg.delete(true);
                } catch (error) {
                    console.error('Failed to delete confirmation message:', error);
                }
            }, 5000);
        } else {
            await message.reply('No messages could be deleted.');
        }

    } catch (err) {
        console.error('Failed to purge messages:', err);
        await message.reply('Failed to delete messages. Make sure I have the necessary permissions.');
    }
}

async function executePollCommand(message, pollData, chat) {
    try {
        const parts = pollData.split('|');
        
        if (parts.length < 3) {
            return message.reply('Need at least a question and 2 options for a poll.');
        }

        const isMultiSelect = parts[0] === '-m';
        const question = isMultiSelect ? parts[1] : parts[0];
        const options = isMultiSelect ? parts.slice(2) : parts.slice(1);

        if (options.length > 12) {
            return message.reply('Maximum 12 options allowed per poll.');
        }

        const pollOptions = {
            allowMultipleAnswers: isMultiSelect
        };
        
        const poll = new Poll(question, options, pollOptions);
        await chat.sendMessage(poll);
        
        const pollType = isMultiSelect ? 'multi-select' : 'single-select';
        console.log(`📊 Created ${pollType} WhatsApp poll via natural language: "${question}"`);
        
    } catch (error) {
        console.error('❌ Error creating poll via natural language:', error);
        await message.reply('Sorry, there was an error creating the poll. Try the direct ?poll command.');
    }
}

async function executeWelcomeCommand(message, username) {
    const welcomeMessage = `Welcome ${username}! I'm chotu your helper. Try out ?help to see a list of commands and you can talk to me in natural language as well.`;
    await message.reply(welcomeMessage);
    console.log(`👋 Welcomed user via natural language: ${username}`);
}

async function executeAvatarCommand(message, username) {
    // For safety, require mentions for natural language avatar requests
    if (!message.mentionedIds || message.mentionedIds.length === 0) {
        return message.reply('For safety, please mention the user whose avatar you want when using natural language. Example: "show @username avatar"');
    }

    const targetUserId = message.mentionedIds[0];
    
    try {
        const contact = await client.getContactById(targetUserId);
        const contactName = contact.pushname || contact.name || contact.number || 'User';
        
        console.log(`🖼️ Fetching avatar for ${contactName} via natural language`);
        
        const profilePicUrl = await contact.getProfilePicUrl();
        
        if (!profilePicUrl) {
            return message.reply(`${contactName} doesn't have a profile picture or it's not visible to me.`);
        }
        
        const media = await MessageMedia.fromUrl(profilePicUrl);
        const chat = await message.getChat();
        
        await chat.sendMessage(media, {
            caption: `${contactName}'s profile picture`
        });
        
        console.log(`📸 Sent avatar for ${contactName} via natural language`);
        
    } catch (error) {
        console.error('❌ Error fetching avatar via natural language:', error);
        
        if (error.message.includes('contact not found')) {
            await message.reply("I couldn't find that user. Make sure they're in this group.");
        } else if (error.message.includes('profile pic')) {
            await message.reply("This user's profile picture is not accessible or they don't have one.");
        } else {
            await message.reply("Failed to get the avatar. The user might have privacy settings enabled.");
        }
    }
}

async function getAIResponse(userMessage, senderName, context = null, contextType = 'reply', mediaData = null) {
    // Update heartbeat on AI activity
    lastHeartbeat = Date.now();
    
    let prompt;
    let isMultimodal = false;
    let contentParts = [];
    
    // Check if this is a multimodal request (image/PDF analysis)
    if (mediaData && !mediaData.error) {
        prompt = buildMultimodalPrompt(userMessage, senderName, mediaData.mimetype, contextType);
        isMultimodal = true;
        console.log(`🎨 Building multimodal request for ${mediaData.mimetype} (${mediaData.size}KB)`);
        
        // Build multimodal content parts
        contentParts = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: mediaData.mimetype,
                    data: mediaData.data
                }
            }
        ];
    } else {
        // Standard text-only prompt
        prompt = `You are chotu - a quick-witted, clever person who responds naturally on WhatsApp. ${senderName} `;

        if (context && contextType === 'quoted_context') {
            prompt += `mentioned you while replying to someone else's message.

CONTEXT: ${context}
${senderName}'s message mentioning you: "${userMessage}"

Respond to ${senderName}, considering what the other person said. You can comment on, react to, or build off the quoted message.`;
        } else if (context) {
            prompt += `replied to your message "${context}" with: "${userMessage}"

Respond to their reply, considering the conversation flow.`;
        } else {
            prompt += `mentioned you with: "${userMessage}"

This is a new interaction.`;
        }

        prompt += `

YOUR PERSONALITY:
- Quick-witted and clever with sharp responses
- Direct and to the point, no unnecessary fluff
- Can be playfully sarcastic when appropriate
- Don't use emojis, keep it text-based
- you speak less for example if someone asks your age you just reply with 21 or something like old enough

RESPONSE RULES:
- For coding questions: Provide C++ code solutions
- For roasting requests: Deliver clever, witty burns and sarcastic commentary
- For general questions: Give brief, smart answers
- For Lakshay Chauhan/Lakshya/Lakshay: Always be respectful (he's the boss)
- Keep responses conversational and WhatsApp-appropriate length
- You need not mention their name in the response everytime, just use it whenever its' relevant

COMMAND DETECTION:
If user wants to execute bot commands naturally, respond with EXECUTE format:
- "kick/remove someone" → EXECUTE:KICK:username (need @mention for safety)
- "delete/clear/purge X messages" → EXECUTE:PURGE:number
- "create/make poll about X with options A,B,C" → EXECUTE:POLL:question|option1|option2|option3
- "multi/multiple choice poll" → EXECUTE:POLL:-m question|option1|option2
- "welcome someone" → EXECUTE:WELCOME:username
- "show avatar/profile pic of someone" → EXECUTE:AVATAR:username (need @mention)
- Otherwise respond naturally with your personality

Now respond to: ${userMessage}`;

        // Build text-only content parts
        contentParts = [{ text: prompt }];
    }

    // Try all available models before giving up
    const startingIndex = currentModelIndex;
    let attemptCount = 0;
    
    while (attemptCount < MODEL_ROTATION.length) {
        try {
            const model = getCurrentModel();
            const current = MODEL_ROTATION[currentModelIndex];
            console.log(`🔍 Attempt ${attemptCount + 1}/${MODEL_ROTATION.length}: ${current.model} (${current.keyName})`);
            
            const requestConfig = {
                contents: [{ parts: contentParts }],
                tools: [groundingTool]  // Always include grounding for both text and multimodal requests
            };
            
            const result = await model.generateContent(requestConfig);
            const response = await result.response;
            
            // Check if Google Search was used
            const candidates = response.candidates;
            if (candidates && candidates[0] && candidates[0].groundingMetadata) {
                const groundingData = candidates[0].groundingMetadata;
                
                if (groundingData.webSearchQueries && groundingData.webSearchQueries.length > 0) {
                    console.log('🌐 Google Search was used!');
                    console.log(`📋 Search queries: ${JSON.stringify(groundingData.webSearchQueries)}`);
                    
                    if (groundingData.groundingChunks && groundingData.groundingChunks.length > 0) {
                        console.log(`📚 Sources found: ${groundingData.groundingChunks.length}`);
                        groundingData.groundingChunks.forEach((chunk, index) => {
                            if (chunk.web) {
                                console.log(`   ${index + 1}. ${chunk.web.title || 'Unknown source'}`);
                            }
                        });
                    }
                } else {
                    console.log('💭 Response generated without Google Search (used existing knowledge)');
                }
            } else {
                console.log('💭 Response generated without Google Search (used existing knowledge)');
            }
            
            console.log(`✅ Success with ${current.model} (${current.keyName})`);
            return response.text().trim();
            
        } catch (error) {
            const current = MODEL_ROTATION[currentModelIndex];
            console.error(`❌ ${current.model} (${current.keyName}) failed:`, error.message);
            
            // Check for quota violations and log details
            if (error.errorDetails && Array.isArray(error.errorDetails)) {
                console.log('🔍 Error details found, checking for quota violations...');
                
                error.errorDetails.forEach((detail, index) => {
                    console.log(`📋 Error detail ${index + 1}:`, detail);
                    
                    if (detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure' && detail.violations) {
                        console.log('⚠️ Quota violation details:');
                        detail.violations.forEach((violation, violationIndex) => {
                            console.log(`  📊 Violation ${violationIndex + 1}:`, JSON.stringify(violation, null, 2));
                        });
                    }
                });
            }
            
            // Switch to next model and try again
            switchToNextModel();
            attemptCount++;
            
            // If we've tried all models, break out
            if (attemptCount >= MODEL_ROTATION.length) {
                console.error(`❌ All ${MODEL_ROTATION.length} model combinations failed!`);
                return "Hey! I'm having trouble thinking right now. All my AI models are having issues. Try again in a bit?";
            }
            
            console.log(`🔄 Switching to next model (attempt ${attemptCount + 1}/${MODEL_ROTATION.length})...`);
        }
    }
    
    // This should never be reached, but just in case
    return "Hey! I'm having trouble thinking right now. Try again?";
}

client.on('message_create', async message => {
    try {
        // Update heartbeat on message activity
        lastHeartbeat = Date.now();
        
        // AUTO-STORE DOCUMENTS (only from users, not from bot itself)
        if (message.hasMedia && !message.fromMe && message.type !== 'sticker'  ) {
            const chat = await message.getChat();
            const media = await message.downloadMedia();
            
            if (media) {
                let filename = media.filename;
                let fileExt = '';
                
                // Handle media without filename (copy/paste images, camera photos, etc.)
                if (!filename) {
                    // Generate filename based on mimetype
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    
                    if (media.mimetype) {
                        if (media.mimetype.startsWith('image/')) {
                            if (media.mimetype.includes('jpeg') || media.mimetype.includes('jpg')) {
                                filename = `image_${timestamp}.jpg`;
                            } else if (media.mimetype.includes('png')) {
                                filename = `image_${timestamp}.png`;
                            } else {
                                filename = `image_${timestamp}.jpg`; // Default to jpg for other image types
                            }
                        } else if (media.mimetype.includes('pdf')) {
                            filename = `document_${timestamp}.pdf`;
                        } else {
                            // Don't generate filename for videos, audio, gifs, webp - they won't be stored
                            filename = null;
                        }
                    } else {
                        filename = null; // No mimetype, don't store
                    }
                }
                
                // Skip if no filename (videos, audio, gifs, webp, etc.)
                if (!filename) {
                    return;
                }
                
                fileExt = path.extname(filename).toLowerCase();
                
                // Only store certain file types
                const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.zip', '.rar', '.xlsx', '.xls', '.ppt', '.pptx'];
                
                if (allowedTypes.includes(fileExt)) {
                    try {
                        const documentsPath = getGroupDocumentsFolder(chat);
                        const filePath = path.join(documentsPath, filename);
                        
                        // Check if file already exists - skip if duplicate
                        if (fs.existsSync(filePath)) {
                            const sizeKB = Math.round(media.data.length * 0.75 / 1024);
                            console.log(`⏭️ Skipped duplicate file: ${filename} (${sizeKB}KB) in ${chat.isGroup ? chat.name : 'private chat'}`);
                            return; // Skip storing this duplicate file
                        }
                        
                        // Save the file (only if it doesn't exist)
                        fs.writeFileSync(filePath, media.data, 'base64');
                        
                        const sizeKB = Math.round(media.data.length * 0.75 / 1024); // Approximate size from base64
                        
                        console.log(`💾 Stored document: ${filename} (${sizeKB}KB) in ${chat.isGroup ? chat.name : 'private chat'}`);
                        
                    } catch (error) {
                        console.error('❌ Error storing document:', error);
                    }
                }
            }
        }
        
        // KICK COMMAND
        if (message.body.startsWith('?kick')) {
            const chat = await message.getChat();
            if (!chat.isGroup) {
                return message.reply('This command can only be used in a group.');
            }

            if (!message.mentionedIds || message.mentionedIds.length === 0) {
                return message.reply('You need to mention a user to kick.');
            }

            const authorId = message.author;
            const senderIsAdmin = chat.participants.find(p => p.id._serialized === authorId)?.isAdmin;
            const senderIsOwner = authorId === '917428233446@c.us';

            if (!senderIsAdmin && !senderIsOwner) {
                return message.reply('You need to be a group admin to use this command.');
            }

            const botId = client.info.wid._serialized;
            const botIsAdmin = chat.participants.find(p => p.id._serialized === botId)?.isAdmin;

            if (!botIsAdmin) {
                return message.reply('I need to be an admin to do that.');
            }

            const userToKickId = message.mentionedIds[0];

            if (userToKickId === '917428233446@c.us') {
                return message.reply("I'm not allowed to do that.");
            }

            const participantToKick = chat.participants.find(p => p.id._serialized === userToKickId);

            if (!participantToKick) {
                return message.reply("That user isn't in this group.");
            }

            if (participantToKick.isAdmin || participantToKick.isSuperAdmin) {
                return message.reply("I can't remove another admin.");
            }

            try {
                await chat.removeParticipants([userToKickId]);
                await message.reply('Done.');
            } catch (err) {
                console.error('Failed to kick user:', err);
                await message.reply('Failed to remove the user. Please check my permissions.');
            }
        }
        
        // PURGE COMMAND
        else if (message.body.startsWith('?purge')) {
            const chat = await message.getChat();
            if (!chat.isGroup) {
                return message.reply('This command can only be used in a group.');
            }

            const authorId = message.author;
            const senderIsAdmin = chat.participants.find(p => p.id._serialized === authorId)?.isAdmin;
            const senderIsOwner = authorId === '917428233446@c.us';

            if (!senderIsAdmin && !senderIsOwner) {
                return message.reply('You need to be a group admin to use this command.');
            }

            const botId = client.info.wid._serialized;
            const botIsAdmin = chat.participants.find(p => p.id._serialized === botId)?.isAdmin;

            if (!botIsAdmin) {
                return message.reply('I need to be an admin to delete messages.');
            }

            // Parse the number of messages to delete
            const args = message.body.split(' ');
            if (args.length !== 2) {
                return message.reply('Usage: ?purge <number>\nExample: ?purge 10');
            }

            const deleteCount = parseInt(args[1]);
            if (isNaN(deleteCount) || deleteCount < 1 || deleteCount > 100) {
                return message.reply('Please provide a valid number between 1 and 100.');
            }

            try {
                // Fetch recent messages (get extra to account for the purge command)
                const messages = await chat.fetchMessages({ limit: deleteCount + 10 }); // Get more to ensure we have enough
                
                if (messages.length <= 1) {
                    return message.reply('No messages to delete.');
                }

                console.log(`📊 Fetched ${messages.length} messages. Order check:`);
                console.log(`First message ID: ${messages[0].id._serialized}`);
                console.log(`Last message ID: ${messages[messages.length-1].id._serialized}`);
                console.log(`Purge command ID: ${message.id._serialized}`);

                // Find the purge command message using proper ID comparison
                const purgeCommandIndex = messages.findIndex(msg => msg.id._serialized === message.id._serialized);
                console.log(`🎯 Purge command found at index: ${purgeCommandIndex}`);
                
                let messagesToDelete;
                
                if (purgeCommandIndex !== -1) {
                    // Get the N messages that came immediately before the purge command
                    const startIndex = Math.max(0, purgeCommandIndex - deleteCount);
                    messagesToDelete = messages.slice(startIndex, purgeCommandIndex);
                    console.log(`✂️ Using messages from index ${startIndex} to ${purgeCommandIndex - 1} (messages right before purge command)`);
                } else {
                    // Fallback: exclude the first message (likely the purge command) and take next N
                    messagesToDelete = messages.slice(1, deleteCount + 1);
                    console.log(`🔄 Fallback: Using messages from index 1 to ${deleteCount}`);
                }
                
                console.log(`🗑️ Attempting to delete ${messagesToDelete.length} messages in ${chat.name}`);
                console.log(`📋 Message IDs to delete: ${messagesToDelete.map(m => m.id._serialized.substring(m.id._serialized.length-8)).join(', ')}`);
                
                let deletedCount = 0;
                let failedCount = 0;
                
                for (let i = 0; i < messagesToDelete.length; i++) {
                    const msg = messagesToDelete[i];
                    try {
                        // Try to delete the message
                        await msg.delete(true); // true = delete for everyone
                        deletedCount++;
                        console.log(`✅ Deleted message ${i+1}/${messagesToDelete.length} from ${msg.author || msg.from} (ID: ${msg.id._serialized.substring(msg.id._serialized.length-8)})`);
                        
                        // Longer delay between deletions to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (deleteError) {
                        failedCount++;
                        console.error(`❌ Failed to delete message ${i+1}/${messagesToDelete.length} from ${msg.author || msg.from}:`, deleteError.message);
                        // Continue with other messages
                    }
                }

                // Delete the purge command message itself
                try {
                    await message.delete(true);
                } catch (deleteError) {
                    console.error('Failed to delete purge command message:', deleteError);
                }

                if (deletedCount > 0) {
                    console.log(`✅ Successfully deleted ${deletedCount} messages, ${failedCount} failed`);
                    
                    let confirmText = `Deleted ${deletedCount} messages.`;
                    if (failedCount > 0) {
                        confirmText += ` (${failedCount} couldn't be deleted - likely too old or permission restrictions)`;
                    }
                    
                    // Send a temporary confirmation that will auto-delete
                    const confirmMsg = await chat.sendMessage(confirmText);
                    
                    // Auto-delete the confirmation message after 5 seconds (longer to read the details)
                    setTimeout(async () => {
                        try {
                            await confirmMsg.delete(true);
                        } catch (error) {
                            console.error('Failed to delete confirmation message:', error);
                        }
                    }, 5000);
                } else {
                    await message.reply('No messages could be deleted. This usually means messages are too old or there are permission restrictions.');
                }

            } catch (err) {
                console.error('Failed to purge messages:', err);
                await message.reply('Failed to delete messages. Make sure I have the necessary permissions.');
            }
        }
        
        // AVATAR COMMAND
        else if (message.body.startsWith('?avatar')) {
            const chat = await message.getChat();
            
            // Check if someone was mentioned
            if (!message.mentionedIds || message.mentionedIds.length === 0) {
                return message.reply('You need to mention a user to get their avatar.\nUsage: ?avatar @username');
            }

            const targetUserId = message.mentionedIds[0];
            
            try {
                // Get the contact
                const contact = await client.getContactById(targetUserId);
                const contactName = contact.pushname || contact.name || contact.number || 'User';
                
                console.log(`🖼️ Fetching avatar for ${contactName} (${targetUserId})`);
                
                // Get profile picture URL
                const profilePicUrl = await contact.getProfilePicUrl();
                
                if (!profilePicUrl) {
                    return message.reply(`${contactName} doesn't have a profile picture or it's not visible to me.`);
                }
                
                console.log(`✅ Found profile picture URL for ${contactName}`);
                
                // Download and send the image
                const media = await MessageMedia.fromUrl(profilePicUrl);
                
                // Send the avatar with caption
                await chat.sendMessage(media, {
                    caption: `${contactName}'s profile picture`
                });
                
                console.log(`📸 Sent avatar for ${contactName}`);
                
            } catch (error) {
                console.error('❌ Error fetching avatar:', error);
                
                if (error.message.includes('contact not found')) {
                    await message.reply("I couldn't find that user. Make sure they're in this group.");
                } else if (error.message.includes('profile pic')) {
                    await message.reply("This user's profile picture is not accessible or they don't have one.");
                } else {
                    await message.reply("Failed to get the avatar. The user might have privacy settings enabled.");
                }
            }
        } 
        
        // POLL COMMAND - Native WhatsApp Polls
        else if (message.body.startsWith('?poll ')) {
            const chat = await message.getChat();
            
            // Parse poll command: ?poll [-m] question, option1, option2, option3
            let pollText = message.body.substring(6); // Remove "?poll "
            
            // Check for -m flag (multi-select)
            const isMultiSelect = pollText.startsWith('-m ');
            if (isMultiSelect) {
                pollText = pollText.substring(3); // Remove "-m " flag
            }
            
            // Split by commas and trim whitespace
            const parts = pollText.split(',').map(part => part.trim());
            
            if (parts.length < 3) {
                return message.reply('Usage: ?poll [-m] question, option1, option2, option3\n\nExample: ?poll what should we eat, pizza, burger, sushi\nMulti-select: ?poll -m fav food, pizza, sushi');
            }
            
            if (parts.length > 13) { // 1 question + 12 options max (WhatsApp limit)
                return message.reply('Maximum 12 options allowed per poll.');
            }
            
            // First part is question, rest are options
            const question = parts[0];
            const options = parts.slice(1);
            
            try {
                // Create poll options with allowMultipleAnswers
                const pollOptions = {
                    allowMultipleAnswers: isMultiSelect
                };
                
                // Create native WhatsApp poll
                const poll = new Poll(question, options, pollOptions);
                
                // Send the poll
                await chat.sendMessage(poll);
                
                const pollType = isMultiSelect ? 'multi-select' : 'single-select';
                console.log(`📊 Created ${pollType} WhatsApp poll: "${question}" with ${options.length} options`);
                
            } catch (error) {
                console.error('❌ Error creating poll:', error);
                await message.reply('Sorry, there was an error creating the poll. Make sure your WhatsApp supports polls.');
            }
        }
        
        // WELCOME COMMAND
        else if (message.body.startsWith('?welcome ')) {
            const chat = await message.getChat();
            const welcomeText = message.body.substring(9); // Remove "?welcome "
            
            let userName = '';
            let welcomeMessage = '';
            
            // Check if someone was mentioned
            if (message.mentionedIds && message.mentionedIds.length > 0) {
                try {
                    const targetUserId = message.mentionedIds[0];
                    const contact = await client.getContactById(targetUserId);
                    userName = contact.pushname || contact.name || 'there';
                    
                    welcomeMessage = `Welcome ${userName}! I'm chotu your helper. Try out ?help to see a list of commands and you can talk to me in natural language as well.`;
                    
                    await message.reply(welcomeMessage);
                    console.log(`👋 Welcomed mentioned user: ${userName}`);
                    
                } catch (error) {
                    console.error('❌ Error getting mentioned user:', error);
                    await message.reply("Couldn't get that user's info, but welcome to the group!");
                }
            } else if (welcomeText.trim()) {
                // Welcome by name (no mention)
                userName = welcomeText.trim();
                welcomeMessage = `Welcome ${userName}! I'm chotu your helper. Try out ?help to see a list of commands and you can talk to me in natural language as well.`;
                
                await message.reply(welcomeMessage);
                console.log(`👋 Welcomed user by name: ${userName}`);
            } else {
                await message.reply('Usage: ?welcome @user or ?welcome username\n\nExample: ?welcome @john or ?welcome john');
            }
        }
        
        // LIST DOCUMENTS COMMAND
        else if (message.body === '?list') {
            const chat = await message.getChat();
            
            try {
                const documentsPath = getGroupDocumentsFolder(chat);
                
                if (!fs.existsSync(documentsPath)) {
                    const groupName = chat.isGroup ? chat.name : 'this chat';
                    await message.reply(`📄 No documents stored yet for ${groupName}.\n\nSend files to this group and I'll automatically store them for fetching.`);
                    return;
                }
                
                const files = fs.readdirSync(documentsPath);
                const documents = [];
                
                for (const file of files) {
                    const filePath = path.join(documentsPath, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.isFile()) {
                        documents.push({
                            name: file,
                            size: stats.size,
                            modified: stats.mtime
                        });
                    }
                }
                
                if (documents.length === 0) {
                    const groupName = chat.isGroup ? chat.name : 'this chat';
                    await message.reply(`📄 No documents stored yet for ${groupName}.\n\nSend files to this group and I'll automatically store them for fetching.`);
                    return;
                }
                
                // Sort by most recently modified
                documents.sort((a, b) => b.modified - a.modified);
                
                let listText = `📄 Documents in ${chat.isGroup ? chat.name : 'this chat'} (${documents.length} files):\n\n`;
                
                documents.slice(0, 10).forEach((doc, index) => {
                    const sizeKB = Math.round(doc.size / 1024);
                    const date = doc.modified.toLocaleDateString();
                    listText += `${index + 1}. ${doc.name} (${sizeKB}KB) - ${date}\n`;
                });
                
                if (documents.length > 10) {
                    listText += `... and ${documents.length - 10} more files\n`;
                }
                
                listText += `\nUse ?fetch <name> to retrieve any document.`;
                await message.reply(listText);
                
            } catch (error) {
                console.error('❌ Error listing documents:', error);
                await message.reply('Sorry, there was an error listing documents. Please try again.');
            }
        }
        
        // RENAME COMMAND
        else if (message.body.startsWith('?rename ')) {
            const chat = await message.getChat();
            const renameText = message.body.substring(8).trim(); // Remove "?rename "
            
            if (!renameText.includes(':')) {
                return message.reply('Usage: ?rename oldname:newname or ?rename number:newname\nExample: ?rename old_document.pdf:new_document.pdf or ?rename 1:new_document.pdf');
            }
            
            const [oldIdentifier, newNameInput] = renameText.split(':').map(name => name.trim());
            
            if (!oldIdentifier || !newNameInput) {
                return message.reply('Usage: ?rename oldname:newname or ?rename number:newname\nBoth old identifier and new name are required.');
            }
            
            try {
                const documentsPath = getGroupDocumentsFolder(chat);
                let fileToRename = null;
                
                // Check if oldIdentifier is a number (index)
                const indexNumber = parseInt(oldIdentifier);
                if (!isNaN(indexNumber) && indexNumber > 0) {
                    // Rename by index number
                    const orderedDocs = getOrderedDocuments(documentsPath);
                    
                    if (orderedDocs.length === 0) {
                        await message.reply(`📄 No documents stored yet for this group.`);
                        return;
                    }
                    
                    if (indexNumber > orderedDocs.length) {
                        await message.reply(`📄 Invalid number. There are only ${orderedDocs.length} documents. Use ?list to see all files.`);
                        return;
                    }
                    
                    fileToRename = {
                        filename: orderedDocs[indexNumber - 1].name,
                        path: orderedDocs[indexNumber - 1].path,
                        score: 100 // Perfect match for index
                    };
                    
                    console.log(`📝 Renaming by index ${indexNumber}: ${fileToRename.filename}`);
                } else {
                    // Fallback to fuzzy search by name
                    const searchResults = searchDocuments(documentsPath, oldIdentifier);
                    
                    if (searchResults.length === 0) {
                        await message.reply(`📄 No document found matching "${oldIdentifier}". Use ?list to see all files or ?rename <number>:newname.`);
                        return;
                    }
                    
                    // Get the best match
                    fileToRename = searchResults[0];
                    
                    // Check if multiple matches and score is low
                    if (searchResults.length > 1 && fileToRename.score < 90) {
                        let resultText = `📄 Multiple files match "${oldIdentifier}":\n\n`;
                        searchResults.slice(0, 5).forEach((doc, index) => {
                            resultText += `${index + 1}. ${doc.filename}\n`;
                        });
                        resultText += `\nPlease be more specific with the filename or use ?rename <number>:newname.`;
                        await message.reply(resultText);
                        return;
                    }
                }
                
                // Preserve file extension if not provided in new name
                const originalExt = path.extname(fileToRename.filename);
                let newName = newNameInput;
                
                // If new name doesn't have an extension, add the original extension
                if (!path.extname(newName) && originalExt) {
                    newName = newName + originalExt;
                }
                
                // Check if new name already exists
                const newFilePath = path.join(documentsPath, newName);
                if (fs.existsSync(newFilePath)) {
                    await message.reply(`📄 A file named "${newName}" already exists. Choose a different name.`);
                    return;
                }
                
                // Perform the rename
                const oldFilePath = fileToRename.path;
                fs.renameSync(oldFilePath, newFilePath);
                
                console.log(`📝 Renamed: ${fileToRename.filename} → ${newName}`);
                await message.reply(`📝 Successfully renamed "${fileToRename.filename}" to "${newName}"`);
                
            } catch (error) {
                console.error('❌ Error renaming file:', error);
                await message.reply('Sorry, there was an error renaming the file. Please try again.');
            }
        }
        
        // FETCH COMMAND
        else if (message.body.startsWith('?fetch ')) {
            const chat = await message.getChat();
            const query = message.body.substring(7).trim(); // Remove "?fetch "
            
            if (!query) {
                return message.reply('Usage: ?fetch <document name or number>\nExample: ?fetch meeting notes or ?fetch 1');
            }
            
            try {
                const documentsPath = getGroupDocumentsFolder(chat);
                
                // Check if query is a number (index)
                const indexNumber = parseInt(query);
                if (!isNaN(indexNumber) && indexNumber > 0) {
                    // Fetch by index number
                    const orderedDocs = getOrderedDocuments(documentsPath);
                    
                    if (orderedDocs.length === 0) {
                        const groupName = chat.isGroup ? chat.name : 'this chat';
                        await message.reply(`📄 No documents stored yet for ${groupName}.`);
                        return;
                    }
                    
                    if (indexNumber > orderedDocs.length) {
                        await message.reply(`📄 Invalid number. There are only ${orderedDocs.length} documents. Use ?list to see all files.`);
                        return;
                    }
                    
                    const doc = orderedDocs[indexNumber - 1]; // Convert to 0-based index
                    
                    // Check file size
                    const maxSize = 50 * 1024 * 1024; // 50MB
                    if (doc.size > maxSize) {
                        await message.reply(`📄 Found "${doc.name}" but it's too large to send (${Math.round(doc.size / 1024 / 1024)}MB). WhatsApp has file size limits.`);
                        return;
                    }
                    
                    console.log(`📤 Sending document by index ${indexNumber}: ${doc.name} (${Math.round(doc.size / 1024)}KB)`);
                    
                    // Send the document
                    const media = MessageMedia.fromFilePath(doc.path);
                    await chat.sendMessage(media, {
                        caption: `📄 ${doc.name}`
                    });
                    
                    console.log(`✅ Document sent by index: ${doc.name}`);
                    return;
                }
                
                // Fallback to fuzzy search by name
                const searchResults = searchDocuments(documentsPath, query);
                
                if (searchResults.length === 0) {
                    const groupName = chat.isGroup ? chat.name : 'this chat';
                    await message.reply(`📄 No documents found for "${query}" in ${groupName}.\n\nTo add documents, simply send them as files to this group and I'll store them for future fetching.\n\nYou can also use ?list to see all files and ?fetch <number> to get by index.`);
                    return;
                }
                
                // If perfect match or only one result, send it directly
                if (searchResults.length === 1 || searchResults[0].score >= 90) {
                    const doc = searchResults[0];
                    
                    // Check file size (WhatsApp limit is ~100MB, but let's be conservative)
                    const maxSize = 50 * 1024 * 1024; // 50MB
                    if (doc.size > maxSize) {
                        await message.reply(`📄 Found "${doc.filename}" but it's too large to send (${Math.round(doc.size / 1024 / 1024)}MB). WhatsApp has file size limits.`);
                        return;
                    }
                    
                    console.log(`📤 Sending document: ${doc.filename} (${Math.round(doc.size / 1024)}KB)`);
                    
                    // Send the document
                    const media = MessageMedia.fromFilePath(doc.path);
                    await chat.sendMessage(media, {
                        caption: `📄 ${doc.filename}`
                    });
                    
                    console.log(`✅ Document sent: ${doc.filename}`);
                } else {
                    // Multiple results - show list with index numbers
                    let resultText = `📄 Found multiple documents for "${query}":\n\n`;
                    
                    searchResults.slice(0, 5).forEach((doc, index) => {
                        const sizeKB = Math.round(doc.size / 1024);
                        resultText += `${index + 1}. ${doc.filename} (${sizeKB}KB)\n`;
                    });
                    
                    if (searchResults.length > 5) {
                        resultText += `... and ${searchResults.length - 5} more\n`;
                    }
                    
                    resultText += `\nUse ?fetch with a more specific name or ?fetch <number> to get the exact document.`;
                    await message.reply(resultText);
                }
                
            } catch (error) {
                console.error('❌ Error in fetch command:', error);
                await message.reply('Sorry, there was an error searching for documents. Please try again.');
            }
        }
        
        // DELETE COMMAND (Owner only - hidden from help)
        else if (message.body.startsWith('?delete ')) {
            const chat = await message.getChat();
            const deleteQuery = message.body.substring(8).trim(); // Remove "?delete "
            
            // Check if sender is the owner
            const senderId = message.author || message.from;
            if (senderId !== '917428233446@c.us') {
                // Silently ignore - don't reveal the command exists
                return;
            }
            
            if (!deleteQuery) {
                return message.reply('Usage: ?delete <document name or number>\nExample: ?delete meeting notes or ?delete 1');
            }
            
            try {
                const documentsPath = getGroupDocumentsFolder(chat);
                let fileToDelete = null;
                
                // Check if deleteQuery is a number (index)
                const indexNumber = parseInt(deleteQuery);
                if (!isNaN(indexNumber) && indexNumber > 0) {
                    // Delete by index number
                    const orderedDocs = getOrderedDocuments(documentsPath);
                    
                    if (orderedDocs.length === 0) {
                        await message.reply(`📄 No documents stored yet for this group.`);
                        return;
                    }
                    
                    if (indexNumber > orderedDocs.length) {
                        await message.reply(`📄 Invalid number. There are only ${orderedDocs.length} documents. Use ?list to see all files.`);
                        return;
                    }
                    
                    fileToDelete = {
                        filename: orderedDocs[indexNumber - 1].name,
                        path: orderedDocs[indexNumber - 1].path,
                        score: 100 // Perfect match for index
                    };
                    
                    console.log(`🗑️ Deleting by index ${indexNumber}: ${fileToDelete.filename}`);
                } else {
                    // Fallback to fuzzy search by name
                    const searchResults = searchDocuments(documentsPath, deleteQuery);
                    
                    if (searchResults.length === 0) {
                        await message.reply(`📄 No document found matching "${deleteQuery}". Use ?list to see all files or ?delete <number>.`);
                        return;
                    }
                    
                    // Get the best match
                    fileToDelete = searchResults[0];
                    
                    // Check if multiple matches and score is low
                    if (searchResults.length > 1 && fileToDelete.score < 90) {
                        let resultText = `📄 Multiple files match "${deleteQuery}":\n\n`;
                        searchResults.slice(0, 5).forEach((doc, index) => {
                            resultText += `${index + 1}. ${doc.filename}\n`;
                        });
                        resultText += `\nPlease be more specific with the filename or use ?delete <number>.`;
                        await message.reply(resultText);
                        return;
                    }
                }
                
                // Perform the deletion
                const fileToDeletePath = fileToDelete.path;
                const fileToDeleteName = fileToDelete.filename;
                
                // Double-check file exists before deletion
                if (!fs.existsSync(fileToDeletePath)) {
                    await message.reply(`📄 File "${fileToDeleteName}" not found on disk.`);
                    return;
                }
                
                // Delete the file
                fs.unlinkSync(fileToDeletePath);
                
                console.log(`🗑️ Deleted: ${fileToDeleteName} by owner`);
                await message.reply(`🗑️ Successfully deleted "${fileToDeleteName}"`);
                
            } catch (error) {
                console.error('❌ Error deleting file:', error);
                await message.reply('Sorry, there was an error deleting the file. Please try again.');
            }
        }
        
        // MASTER SEARCH COMMAND (Owner only - hidden from help)
        else if (message.body.startsWith('?mastersearch ')) {
            const chat = await message.getChat();
            const searchQuery = message.body.substring(14).trim(); // Remove "?mastersearch "
            
            // Check if sender is the owner
            const senderId = message.author || message.from;
            if (senderId !== '917428233446@c.us') {
                // Silently ignore - don't reveal the command exists
                return;
            }
            
            if (!searchQuery) {
                return message.reply('Usage: ?mastersearch <document name>\nExample: ?mastersearch meeting notes\n\nThis searches across ALL group folders for the file.');
            }
            
            try {
                console.log(`🔍 Master search initiated by owner for: "${searchQuery}"`);
                
                const searchResults = masterSearchDocuments(searchQuery);
                
                if (searchResults.length === 0) {
                    await message.reply(`🔍 No documents found for "${searchQuery}" across all groups.\n\nSearched across all group folders.`);
                    return;
                }
                
                // If perfect match and only one result, send it directly
                if (searchResults.length === 1 || (searchResults[0].score >= 90 && searchResults.filter(r => r.score >= 90).length === 1)) {
                    const doc = searchResults[0];
                    
                    // Check file size (WhatsApp limit)
                    const maxSize = 50 * 1024 * 1024; // 50MB
                    if (doc.size > maxSize) {
                        await message.reply(`🔍 Found "${doc.filename}" in group "${doc.groupDisplayName}" but it's too large to send (${Math.round(doc.size / 1024 / 1024)}MB). WhatsApp has file size limits.`);
                        return;
                    }
                    
                    console.log(`📤 Sending document from master search: ${doc.filename} from ${doc.groupDisplayName} (${Math.round(doc.size / 1024)}KB)`);
                    
                    // Send the document
                    const media = MessageMedia.fromFilePath(doc.path);
                    await chat.sendMessage(media, {
                        caption: `🔍 ${doc.filename}\n📁 From: ${doc.groupDisplayName}`
                    });
                    
                    console.log(`✅ Master search document sent: ${doc.filename} from ${doc.groupDisplayName}`);
                                 } else {
                     // Multiple results - show list with group information and store for number selection
                     ownerLastMasterSearch = {
                         query: searchQuery,
                         results: searchResults,
                         timestamp: Date.now()
                     };
                     
                     let resultText = `🔍 Found ${searchResults.length} documents for "${searchQuery}" across all groups:\n\n`;
                     
                     searchResults.slice(0, 10).forEach((doc, index) => {
                         const sizeKB = Math.round(doc.size / 1024);
                         resultText += `${index + 1}. ${doc.filename} (${sizeKB}KB)\n   📁 ${doc.groupDisplayName}\n\n`;
                     });
                     
                     if (searchResults.length > 10) {
                         resultText += `... and ${searchResults.length - 10} more results\n\n`;
                     }
                     
                     resultText += `Reply with the number (1-${Math.min(searchResults.length, 10)}) to get the document.`;
                     await message.reply(resultText);
                 }
                
            } catch (error) {
                console.error('❌ Error in master search command:', error);
                await message.reply('Sorry, there was an error performing the master search. Please try again.');
            }
        }
        
        // MASTER RENAME COMMAND (Owner only - rename files from master search results)
        else if (message.body.startsWith('?masterrename ') && ownerLastMasterSearch) {
            const chat = await message.getChat();
            const renameText = message.body.substring(14).trim(); // Remove "?masterrename "
            
            // Check if sender is the owner
            const senderId = message.author || message.from;
            if (senderId !== '917428233446@c.us') {
                // Silently ignore - don't reveal the command exists
                return;
            }
            
            if (!renameText.includes(':')) {
                return message.reply('Usage: ?masterrename number:newname\nExample: ?masterrename 1:new_document.pdf\n\nRenames a file from the last master search results.');
            }
            
            const [numberStr, newNameInput] = renameText.split(':').map(part => part.trim());
            
            if (!numberStr || !newNameInput) {
                return message.reply('Usage: ?masterrename number:newname\nBoth number and new name are required.');
            }
            
            // Check if the search results are still valid (within 10 minutes)
            const searchAge = Date.now() - ownerLastMasterSearch.timestamp;
            if (searchAge > 10 * 60 * 1000) { // 10 minutes
                ownerLastMasterSearch = null;
                await message.reply('🔍 Previous master search results have expired. Please search again with ?mastersearch.');
                return;
            }
            
            const selectedNumber = parseInt(numberStr);
            const maxDisplayed = Math.min(ownerLastMasterSearch.results.length, 10);
            
            if (isNaN(selectedNumber) || selectedNumber < 1 || selectedNumber > maxDisplayed) {
                await message.reply(`🔍 Please select a valid number between 1 and ${maxDisplayed}.`);
                return;
            }
            
            try {
                const selectedDoc = ownerLastMasterSearch.results[selectedNumber - 1];
                
                // Preserve file extension if not provided in new name
                const originalExt = path.extname(selectedDoc.filename);
                let newName = newNameInput;
                
                // If new name doesn't have an extension, add the original extension
                if (!path.extname(newName) && originalExt) {
                    newName = newName + originalExt;
                }
                
                // Check if new name already exists in the same group folder
                const newFilePath = path.join(selectedDoc.groupPath, newName);
                if (fs.existsSync(newFilePath)) {
                    await message.reply(`📝 A file named "${newName}" already exists in group "${selectedDoc.groupDisplayName}". Choose a different name.`);
                    return;
                }
                
                // Perform the rename
                const oldFilePath = selectedDoc.path;
                fs.renameSync(oldFilePath, newFilePath);
                
                console.log(`📝 Master renamed: ${selectedDoc.filename} → ${newName} in ${selectedDoc.groupDisplayName} by owner`);
                await message.reply(`📝 Successfully renamed "${selectedDoc.filename}" to "${newName}" in group "${selectedDoc.groupDisplayName}"`);
                
                // Update the search results with the new filename
                ownerLastMasterSearch.results[selectedNumber - 1].filename = newName;
                ownerLastMasterSearch.results[selectedNumber - 1].path = newFilePath;
                
            } catch (error) {
                console.error('❌ Error in master rename command:', error);
                await message.reply('Sorry, there was an error renaming the file. Please try again.');
            }
        }
        
        // CONVERT COMMAND
        else if (message.body.startsWith('?convert ')) {
            const chat = await message.getChat();
            const targetFormat = message.body.substring(9).trim().toLowerCase(); // Remove "?convert "
            
            if (!targetFormat) {
                return message.reply('Usage: ?convert <format>\n\nReply to a document with ?convert pdf or ?convert docx to convert it.\n\nSupported formats: pdf, docx, doc, xlsx, xls, pptx, ppt, rtf, txt, html, csv, jpg, jpeg, png');
            }
            
            // Check if this is a reply to a message
            if (!message.hasQuotedMsg) {
                return message.reply('Please reply to a document with ?convert <format>.\n\nExample: Reply to a PDF with "?convert docx" to convert it to Word format.');
            }
            
            try {
                const quotedMessage = await message.getQuotedMessage();
                
                if (!quotedMessage.hasMedia) {
                    return message.reply('The message you replied to doesn\'t contain a document. Please reply to a document.');
                }
                
                await chat.sendStateTyping();
                
                // Download the quoted media
                console.log(`🔄 Processing conversion request to ${targetFormat}`);
                const media = await quotedMessage.downloadMedia();
                
                if (!media || !media.filename) {
                    return message.reply('Could not download the document. Please try again.');
                }
                
                const sourceFormat = getFileExtension(media.filename);
                const conversionType = getConversionType(sourceFormat, targetFormat);
                
                if (!conversionType) {
                    const supportedFormats = getSupportedConversions(sourceFormat);
                    if (supportedFormats.length === 0) {
                        return message.reply(`Files with .${sourceFormat} extension are not supported for conversion.`);
                    }
                    return message.reply(`Cannot convert .${sourceFormat} to .${targetFormat}.\n\nSupported conversions for .${sourceFormat}: ${supportedFormats.join(', ')}`);
                }
                
                // Save the original file temporarily
                const tempDir = path.join(__dirname, 'temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                
                const tempInputPath = path.join(tempDir, `input_${Date.now()}_${media.filename}`);
                fs.writeFileSync(tempInputPath, media.data, 'base64');
                
                console.log(`📁 Saved temp file: ${tempInputPath}`);
                
                // Check if ComPDFKit is configured
                if (!COMPDFKIT_PUBLIC_KEY || !COMPDFKIT_SECRET_KEY) {
                    // Clean up temp file
                    fs.unlinkSync(tempInputPath);
                    return message.reply('Document conversion is not configured. Please contact the administrator.');
                }
                
                await message.reply(`🔄 Converting ${media.filename} from ${sourceFormat.toUpperCase()} to ${targetFormat.toUpperCase()}...\n\nThis may take a few minutes. Please wait.`);
                
                // Convert the document
                const result = await convertDocument(tempInputPath, targetFormat, media.filename);
                
                if (result.success) {
                    // Send the converted file
                    const convertedMedia = MessageMedia.fromFilePath(result.outputPath);
                    await chat.sendMessage(convertedMedia, {
                        caption: `✅ Converted: ${media.filename}\n📄 ${result.sourceFormat.toUpperCase()} → ${result.targetFormat.toUpperCase()}\n🔧 Using ComPDFKit API`
                    });
                    
                    console.log(`✅ Conversion completed: ${media.filename} → ${result.outputFilename}`);
                    
                    // Clean up temp files
                    fs.unlinkSync(tempInputPath);
                    fs.unlinkSync(result.outputPath);
                    
                } else {
                    await message.reply('❌ Conversion failed. Please try again or contact support.');
                }
                
            } catch (error) {
                console.error('❌ Error in convert command:', error);
                await message.reply(`❌ Conversion failed: ${error.message}\n\nPlease try again or contact support.`);
            }
        }
        
        // MASTER SEARCH NUMBER SELECTION (Owner only - handle replies with numbers)
        else if (message.body.match(/^\d+$/) && ownerLastMasterSearch) {
            const chat = await message.getChat();
            
            // Check if sender is the owner
            const senderId = message.author || message.from;
            if (senderId !== '917428233446@c.us') {
                // Not owner, silently ignore to prevent access to master search results
                return;
            }
            
            // Check if the search results are still valid (within 10 minutes)
            const searchAge = Date.now() - ownerLastMasterSearch.timestamp;
            if (searchAge > 10 * 60 * 1000) { // 10 minutes
                ownerLastMasterSearch = null;
                await message.reply('🔍 Previous master search results have expired. Please search again with ?mastersearch.');
                return;
            }
            
            const selectedNumber = parseInt(message.body);
            const maxDisplayed = Math.min(ownerLastMasterSearch.results.length, 10);
            
            if (selectedNumber < 1 || selectedNumber > maxDisplayed) {
                await message.reply(`🔍 Please select a number between 1 and ${maxDisplayed}.`);
                return;
            }
            
            try {
                const selectedDoc = ownerLastMasterSearch.results[selectedNumber - 1];
                
                // Check file size (WhatsApp limit)
                const maxSize = 50 * 1024 * 1024; // 50MB
                if (selectedDoc.size > maxSize) {
                    await message.reply(`🔍 "${selectedDoc.filename}" from group "${selectedDoc.groupDisplayName}" is too large to send (${Math.round(selectedDoc.size / 1024 / 1024)}MB). WhatsApp has file size limits.`);
                    return;
                }
                
                console.log(`📤 Sending selected document from master search: ${selectedDoc.filename} from ${selectedDoc.groupDisplayName} (${Math.round(selectedDoc.size / 1024)}KB)`);
                
                // Send the document
                const media = MessageMedia.fromFilePath(selectedDoc.path);
                await chat.sendMessage(media, {
                    caption: `🔍 ${selectedDoc.filename}\n📁 From: ${selectedDoc.groupDisplayName}\n🔢 Selection ${selectedNumber} from "${ownerLastMasterSearch.query}"`
                });
                
                console.log(`✅ Selected master search document sent: ${selectedDoc.filename} from ${selectedDoc.groupDisplayName}`);
                
                // Clear the search results after successful selection
                ownerLastMasterSearch = null;
                
            } catch (error) {
                console.error('❌ Error sending selected master search document:', error);
                await message.reply('Sorry, there was an error sending the selected document. Please try again.');
            }
        }
        
        // HELP COMMAND
        else if (message.body === '?help') {
            const helpMessage = `Chotu helper commands\n\n` +
                `👥 GROUP MANAGEMENT:\n` +
                `   ?kick @user - Remove user from group (Admin only)\n` +
                `   ?purge <number> - Delete recent messages (Admin only)\n` +
                `   ?welcome @user or ?welcome username - Welcome someone\n` +
                `   Example: ?purge 10, ?welcome @john\n\n` +
                `🖼️ USER INFO:\n` +
                `   ?avatar @user - Get user's profile picture\n` +
                `   Example: ?avatar @john\n\n` +
                `📊 POLLS:\n` +
                `   ?poll question, option1, option2, option3\n` +
                `   ?poll -m question, option1, option2, option3 (multi-select)\n` +
                `   Example: ?poll what should we eat, pizza, burger, sushi\n` +
                `   Example: ?poll -m fav food, pizza, burger, sushi\n` +
                `   • Creates native WhatsApp poll with tap-to-vote\n` +
                `   • Up to 12 options allowed\n\n` +
                `🔄 DOCUMENT CONVERSION:\n` +
                `   ?convert <format> - Convert documents between formats\n` +
                `   Reply to any document with ?convert pdf, ?convert docx, etc.\n` +
                `   Example: Reply to a Word doc with "?convert pdf"\n` +
                `   • Supported formats: PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT, RTF, TXT, HTML, CSV, JPG, PNG\n` +
                `   • Office ↔ PDF conversions (Word, Excel, PowerPoint)\n` +
                `   • Images to PDF and PDF to images\n` +
                `   • Powered by ComPDFKit API\n\n` +
                `🎨 MULTIMODAL AI:\n` +
                `   Reply to any image or PDF while mentioning chotu to analyze it!\n` +
                `   • Ask questions: "chotu what's in this image?", "@chotu explain this meme"\n` +
                `   • Analyze PDFs: "chotu summarize this document", "@chotu what's the main point?"\n` +
                `   • Read text: "chotu what does this say?"\n` +
                `   • Supports: JPG, PNG, WebP, GIF images and PDF documents\n` +
                `   • Works with both "chotu" and "@chotu" in your reply to the media!\n\n` +
                `📄 DOCUMENTS:\n` +
                `   ?list - Show all stored documents in this group\n` +
                `   ?fetch <name or number> - Find and send document from group folder\n` +
                `   ?rename oldname:newname or ?rename number:newname - Rename a stored document\n` +
                `   Example: ?fetch meeting notes, ?fetch 1, ?rename old.pdf:new.pdf, ?rename 1:new.pdf\n` +
                `   • Automatically stores documents and images (no videos/audio/gifs)\n` +
                `   • Searches with fuzzy matching (handles typos)\n` +
                `   • Each group has its own document storage\n` +
                `   • Use numbers from ?list for quick access\n`;
            
            await message.reply(helpMessage);
        }
        
        // BOT STATUS COMMAND
        else if (message.body === '!status' || message.body === '!health') {
            const uptime = Math.floor((Date.now() - lastHeartbeat) / 1000);
            const current = MODEL_ROTATION[currentModelIndex];
            const status = `🤖 Bot Status:
✅ Active and healthy
⏰ Last activity: ${uptime}s ago
🔄 Reconnect attempts: ${reconnectAttempts}
📱 Ready: ${isReady ? 'Yes' : 'No'}
🧠 Current AI: ${current.model} (${current.keyName})
🔑 Total models: ${MODEL_ROTATION.length}`;
            await message.reply(status);
        }
        
        // CHECK FOR REPLIES TO BOT OR MENTIONS (including media analysis when mentioned)
        else {
            const replyCheck = await isReplyToBot(message);
            // Skip mention check for bot's own messages to prevent infinite loops
            const mentionCheck = message.fromMe ? false : await isMentioned(message);
            
            if (replyCheck.isReply || mentionCheck) {
                const responseType = replyCheck.isReply ? 'reply' : 'mention';
                console.log(`🔔 ${responseType} by: ${message.author || message.from}`);
                console.log(`📝 Message: ${message.body}`);
                
                const chat = await message.getChat();
                await chat.sendStateTyping();
                
                const contact = await message.getContact();
                const senderName = contact.pushname || contact.name || 'Someone';
                
                let aiResponse;
                let mediaData = null;
                
                if (replyCheck.isReply) {
                    // Get the context from the bot's original message
                    const originalMessage = replyCheck.quotedMessage.body || replyCheck.quotedMessage.caption || 'previous message';
                    console.log(`🔄 Replying with context from: "${originalMessage}"`);
                    console.log(`🤔 Generating AI response for ${senderName}...`);
                    aiResponse = await getAIResponse(message.body, senderName, originalMessage);
                    
                } else if (mentionCheck) {
                    // Check if this mention is a reply to someone else's message (not the bot's)
                    let contextMessage = null;
                    let isMediaMention = false;
                    
                    if (message.hasQuotedMsg) {
                        try {
                            const quotedMsg = await message.getQuotedMessage();
                            const botId = client.info.wid._serialized;
                            
                            // If it's NOT a reply to the bot's message, check if it has media or is text context
                            if (!quotedMsg.fromMe && quotedMsg.author !== botId && quotedMsg.from !== botId) {
                                
                                // Check if quoted message has media for analysis
                                if (quotedMsg.hasMedia) {
                                    console.log(`🖼️ Processing mention with media analysis from ${senderName}...`);
                                    isMediaMention = true;
                                    
                                    mediaData = await downloadAndProcessMedia(quotedMsg);
                                    
                                    if (mediaData && mediaData.error) {
                                        // Handle media processing errors
                                        switch (mediaData.error) {
                                            case 'unsupported':
                                                await message.reply(`I can only analyze images (JPG, PNG, WebP, GIF) and PDF files. This file type (${mediaData.mimetype}) isn't supported yet.`);
                                                return;
                                            case 'too_large':
                                                await message.reply(`This file is too large for me to analyze (${mediaData.size}MB). Max size is ${mediaData.maxSize}MB.`);
                                                return;
                                            case 'processing_failed':
                                                await message.reply(`Sorry, I had trouble processing that file. Try again or use a different format.`);
                                                return;
                                            default:
                                                await message.reply(`I couldn't process that media. Please try again.`);
                                                return;
                                        }
                                    }
                                    
                                    if (!mediaData) {
                                        await message.reply(`I couldn't find any media to analyze in that message.`);
                                        return;
                                    }
                                    
                                } else {
                                    // Regular text context
                                    const quotedContact = await quotedMsg.getContact();
                                    const quotedSenderName = quotedContact.pushname || quotedContact.name || 'Someone';
                                    contextMessage = `${quotedSenderName} said: "${quotedMsg.body || quotedMsg.caption || 'media message'}"`;
                                    console.log(`🔗 Got context from quoted message: ${contextMessage}`);
                                }
                            }
                        } catch (error) {
                            console.error('❌ Error getting quoted message context:', error);
                        }
                    }
                    
                    if (isMediaMention) {
                        // Mention with media analysis
                        console.log(`🤔 Generating multimodal AI response for ${senderName}...`);
                        aiResponse = await getAIResponse(message.body, senderName, null, 'media_reply', mediaData);
                    } else if (contextMessage) {
                        // Mention with context from another person's message
                        console.log(`🤔 Generating AI response for ${senderName} with quoted context...`);
                        aiResponse = await getAIResponse(message.body, senderName, contextMessage, 'quoted_context');
                    } else {
                        // Regular mention response
                        console.log(`🤔 Generating AI response for ${senderName}...`);
                        aiResponse = await getAIResponse(message.body, senderName);
                    }
                }
                
                // Check if AI wants to execute a command
                const executeMatch = aiResponse.match(/EXECUTE:([A-Z]+):(.+)/);
                if (executeMatch) {
                    const [fullMatch, command, params] = executeMatch;
                    const executeCommand = `EXECUTE:${command}:${params}`;
                    console.log(`🎯 Detected natural command: ${executeCommand}`);
                    await executeNaturalCommand(message, executeCommand, chat, senderName);
                } else {
                    await message.reply(aiResponse);
                }
                console.log(`✅ Replied to ${senderName}`);
            }
        }
        
        // PING COMMAND
        if (message.body === '!ping') {
            await message.reply('🏓 Pong! Bot is working!');
        }
        
    } catch (error) {
        console.error('❌ Error handling message:', error);
        try {
            await message.reply("Sorry, something went wrong! 😅 Try mentioning me again.".trim());
        } catch (replyError) {
            console.error('❌ Error sending error message:', replyError);
        }
    }
});

// Initialize the client
console.log('🚀 Starting WhatsApp AI Bot...');
console.log('📋 Make sure to set your GEMINI_API_KEY in the .env file');
console.log('🔧 Enhanced with auto-restart and keep-alive mechanisms');

// Timeout for initial connection
setTimeout(() => {
    if (!isReady) {
        console.error('❌ Bot failed to initialize within 2 minutes - restarting...');
        restartBot();
    }
}, 2 * 60 * 1000);

client.initialize();

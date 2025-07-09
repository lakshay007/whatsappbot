const { Client, LocalAuth, MessageMedia, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

async function getAIResponse(userMessage, senderName, context = null, contextType = 'reply') {
    // Update heartbeat on AI activity
    lastHeartbeat = Date.now();
    
    let prompt = `You are chotu - a quick-witted, clever person who responds naturally on WhatsApp. ${senderName} `;

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

    // Try all available models before giving up
    const startingIndex = currentModelIndex;
    let attemptCount = 0;
    
    while (attemptCount < MODEL_ROTATION.length) {
        try {
            const model = getCurrentModel();
            const current = MODEL_ROTATION[currentModelIndex];
            console.log(`🔍 Attempt ${attemptCount + 1}/${MODEL_ROTATION.length}: ${current.model} (${current.keyName})`);
            
            const result = await model.generateContent({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [groundingTool]
            });
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
        
        // CHECK FOR REPLIES TO BOT OR MENTIONS
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
                
                if (replyCheck.isReply) {
                    // Get the context from the bot's original message
                    const originalMessage = replyCheck.quotedMessage.body || replyCheck.quotedMessage.caption || 'previous message';
                    console.log(`🔄 Replying with context from: "${originalMessage}"`);
                    console.log(`🤔 Generating AI response for ${senderName}...`);
                    aiResponse = await getAIResponse(message.body, senderName, originalMessage);
                } else if (mentionCheck) {
                    // Check if this mention is a reply to someone else's message (not the bot's)
                    let contextMessage = null;
                    if (message.hasQuotedMsg) {
                        try {
                            const quotedMsg = await message.getQuotedMessage();
                            const botId = client.info.wid._serialized;
                            
                            // If it's NOT a reply to the bot's message, use it as context
                            if (!quotedMsg.fromMe && quotedMsg.author !== botId && quotedMsg.from !== botId) {
                                const quotedContact = await quotedMsg.getContact();
                                const quotedSenderName = quotedContact.pushname || quotedContact.name || 'Someone';
                                contextMessage = `${quotedSenderName} said: "${quotedMsg.body || quotedMsg.caption || 'media message'}"`;
                                console.log(`🔗 Got context from quoted message: ${contextMessage}`);
                            }
                        } catch (error) {
                            console.error('❌ Error getting quoted message context:', error);
                        }
                    }
                    
                    if (contextMessage) {
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

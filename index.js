const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

// Bot health monitoring variables
let isReady = false;
let lastHeartbeat = Date.now();
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let healthCheckInterval;
let keepAliveInterval;
let isRestarting = false;

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

// Function to get AI response from Gemini
async function getAIResponse(userMessage, senderName, context = null) {
    try {
        // Update heartbeat on AI activity
        lastHeartbeat = Date.now();
        
        let prompt = `You are chotu - a quick-witted, clever person who responds naturally on WhatsApp. ${senderName} `;

        if (context) {
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

RESPONSE RULES:
- For coding questions: Provide C++ code solutions
- For roasting requests: Deliver clever, witty burns and sarcastic commentary
- For general questions: Give brief, smart answers
- For Lakshay Chauhan/Lakshya/Lakshay: Always be respectful (he's the boss)
- Keep responses conversational and WhatsApp-appropriate length

Now respond to: ${userMessage}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('❌ Error getting AI response:', error);
        return "Hey! I saw your message but I'm having trouble processing it right now. Can you try again?".trim();
    }
}

client.on('message_create', async message => {
    try {
        // Update heartbeat on message activity
        lastHeartbeat = Date.now();
        
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
        
        // BOT STATUS COMMAND
        else if (message.body === '!status' || message.body === '!health') {
            const uptime = Math.floor((Date.now() - lastHeartbeat) / 1000);
            const status = `🤖 Bot Status:
✅ Active and healthy
⏰ Last activity: ${uptime}s ago
🔄 Reconnect attempts: ${reconnectAttempts}
📱 Ready: ${isReady ? 'Yes' : 'No'}`;
            await message.reply(status);
        }
        
        // CHECK FOR REPLIES TO BOT OR MENTIONS
        else {
            const replyCheck = await isReplyToBot(message);
            const mentionCheck = await isMentioned(message);
            
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
                } else {
                    // Regular mention response
                    console.log(`🤔 Generating AI response for ${senderName}...`);
                    aiResponse = await getAIResponse(message.body, senderName);
                }
                
                await message.reply(aiResponse);
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

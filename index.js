const { Client, LocalAuth, MessageMedia, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Bot health monitoring variables
let isReady = false;
let lastHeartbeat = Date.now();
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let healthCheckInterval;
let keepAliveInterval;
let isRestarting = false;

// Native WhatsApp polls - no storage needed!

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
async function getAIResponse(userMessage, senderName, context = null, contextType = 'reply') {
    try {
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

Now respond to: ${userMessage}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('❌ Error getting AI response:', error);
        
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
            
            // Parse poll command: ?poll what should we eat, pizza, burger, sushi
            const pollText = message.body.substring(6); // Remove "?poll "
            
            // Split by commas and trim whitespace
            const parts = pollText.split(',').map(part => part.trim());
            
            if (parts.length < 3) {
                return message.reply('Usage: ?poll question, option1, option2, option3\n\nExample: ?poll what should we eat, pizza, burger, sushi');
            }
            
            if (parts.length > 13) { // 1 question + 12 options max (WhatsApp limit)
                return message.reply('Maximum 12 options allowed per poll.');
            }
            
            // First part is question, rest are options
            const question = parts[0];
            const options = parts.slice(1);
            
            try {
                // Create poll options array with required format
                const pollOptions = options.map((option, index) => ({
                    name: option,
                    localId: index
                }));
                
                // Create native WhatsApp poll
                const poll = new Poll(question, pollOptions);
                
                // Send the poll
                await chat.sendMessage(poll);
                
                console.log(`📊 Created native WhatsApp poll: "${question}" with ${options.length} options`);
                
            } catch (error) {
                console.error('❌ Error creating poll:', error);
                await message.reply('Sorry, there was an error creating the poll. Make sure your WhatsApp supports polls.');
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

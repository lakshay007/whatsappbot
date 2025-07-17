const config = require('../config');
const MediaProcessor = require('../services/whatsapp/media-processor');

class MessageHandler {
    constructor(context) {
        this.context = context;
        this.constants = config.getConstants();
        this.mediaProcessor = new MediaProcessor();
        
        // Owner's last master search results storage
        this.ownerLastMasterSearch = null;
    }

    async handleMessage(message) {
        try {
            // Skip processing bot's own messages to prevent infinite loops
            if (message.fromMe) {
                return;
            }

            // AUTO-STORE DOCUMENTS (only from users, not from bot itself)
            await this.handleAutoStorage(message);

            // Check if it's a command
            if (this.context.commandRegistry.isCommand(message.body)) {
                await this.handleCommand(message);
                return;
            }

            // Check if it's a system command (starts with !)
            if (message.body.startsWith(this.constants.SYSTEM_PREFIX)) {
                await this.handleSystemCommand(message);
                return;
            }

            // Check for replies to bot or mentions
            const replyCheck = await this.context.whatsappService.isReplyToBot(message);
            const mentionCheck = await this.context.whatsappService.isMentioned(message);

            if (replyCheck.isReply || mentionCheck) {
                await this.handleBotInteraction(message, replyCheck, mentionCheck);
                return;
            }

            // Handle owner-specific functionality (master search number selection)
            if (this.isOwnerNumberSelection(message)) {
                await this.handleOwnerNumberSelection(message);
                return;
            }

        } catch (error) {
            console.error('❌ Error handling message:', error);
            try {
                await message.reply("Sorry, something went wrong! 😅 Try mentioning me again.".trim());
            } catch (replyError) {
                console.error('❌ Error sending error message:', replyError);
            }
        }
    }

    async handleAutoStorage(message) {
        if (message.hasMedia && !message.fromMe && message.type !== 'sticker') {
            const chat = await message.getChat();
            const result = await this.context.documentService.autoStoreDocument(message, chat);
            
            if (result) {
                console.log(`💾 Auto-stored document: ${result.filename}`);
            }
        }
    }

    async handleCommand(message) {
        const result = await this.context.commandRegistry.executeCommand(message, this.context);
        
        if (!result.success && result.error === 'Unknown command') {
            // Don't reply for unknown commands to avoid spam
            console.log(`❓ Unknown command: ${message.body}`);
        }
    }

    async handleSystemCommand(message) {
        const commandName = message.body.substring(1); // Remove ! prefix
        
        if (commandName === 'ping') {
            await message.reply('🏓 Pong! Bot is working!');
        } else if (commandName === 'status' || commandName === 'health') {
            const statusCommand = new (require('../commands/general/status-command'))();
            await statusCommand.execute(message, [], this.context);
        }
    }

    async handleBotInteraction(message, replyCheck, mentionCheck) {
        const responseType = replyCheck.isReply ? 'reply' : 'mention';
        console.log(`🔔 ${responseType} by: ${message.author || message.from}`);
        console.log(`📝 Message: ${message.body}`);
        
        const chat = await message.getChat();
        await this.context.sendTyping(chat);
        
        const contact = await message.getContact();
        const senderName = contact.pushname || contact.name || 'Someone';
        
        let aiResponse;
        let mediaData = null;
        
        if (replyCheck.isReply) {
            // Handle reply to bot
            const originalMessage = replyCheck.quotedMessage.body || replyCheck.quotedMessage.caption || 'previous message';
            console.log(`🔄 Replying with context from: "${originalMessage}"`);
            console.log(`🤔 Generating AI response for ${senderName}...`);
            
            aiResponse = await this.context.aiService.generateResponse(
                message.body, 
                senderName, 
                originalMessage
            );
            
        } else if (mentionCheck) {
            // Handle mention
            let contextMessage = null;
            let isMediaMention = false;
            
            if (message.hasQuotedMsg) {
                try {
                    const quotedMsg = await message.getQuotedMessage();
                    const botId = this.context.whatsappService.getClient().info.wid._serialized;
                    
                    // If it's NOT a reply to the bot's message, check if it has media or is text context
                    if (!quotedMsg.fromMe && quotedMsg.author !== botId && quotedMsg.from !== botId) {
                        
                        // Check if quoted message has media for analysis
                        if (quotedMsg.hasMedia) {
                            console.log(`🖼️ Processing mention with media analysis from ${senderName}...`);
                            isMediaMention = true;
                            
                            mediaData = await this.mediaProcessor.downloadAndProcessMedia(quotedMsg);
                            
                            if (mediaData && mediaData.error) {
                                await this.handleMediaError(message, mediaData);
                                return;
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
                aiResponse = await this.context.aiService.generateResponse(
                    message.body, 
                    senderName, 
                    null, 
                    'media_reply', 
                    mediaData
                );
            } else if (contextMessage) {
                // Mention with context from another person's message
                console.log(`🤔 Generating AI response for ${senderName} with quoted context...`);
                aiResponse = await this.context.aiService.generateResponse(
                    message.body, 
                    senderName, 
                    contextMessage, 
                    'quoted_context'
                );
            } else {
                // Regular mention response
                console.log(`🤔 Generating AI response for ${senderName}...`);
                aiResponse = await this.context.aiService.generateResponse(
                    message.body, 
                    senderName
                );
            }
        }
        
        // Check if AI wants to execute a command
        const executeMatch = aiResponse.match(/EXECUTE:([A-Z]+):(.+)/);
        if (executeMatch) {
            const [fullMatch, command, params] = executeMatch;
            const executeCommand = `EXECUTE:${command}:${params}`;
            console.log(`🎯 Detected natural command: ${executeCommand}`);
            await this.executeNaturalCommand(message, executeCommand, chat, senderName);
        } else {
            await message.reply(aiResponse);
        }
        
        console.log(`✅ Replied to ${senderName}`);
    }

    async handleMediaError(message, mediaData) {
        switch (mediaData.error) {
            case 'unsupported':
                await message.reply(`I can only analyze images (JPG, PNG, WebP, GIF) and PDF files. This file type (${mediaData.mimetype}) isn't supported yet.`);
                break;
            case 'too_large':
                await message.reply(`This file is too large for me to analyze (${mediaData.size}MB). Max size is ${mediaData.maxSize}MB.`);
                break;
            case 'processing_failed':
                await message.reply(`Sorry, I had trouble processing that file. Try again or use a different format.`);
                break;
            default:
                await message.reply(`I couldn't process that media. Please try again.`);
        }
    }

    async executeNaturalCommand(message, aiResponse, chat, senderName) {
        try {
            const [_, command, params] = aiResponse.split(':');
            
            switch(command) {
                case 'KICK':
                    await this.executeKickCommand(message, params, chat);
                    break;
                case 'PURGE':
                    await this.executePurgeCommand(message, params, chat);
                    break;
                case 'POLL':
                    await this.executePollCommand(message, params, chat);
                    break;
                case 'WELCOME':
                    await this.executeWelcomeCommand(message, params);
                    break;
                case 'AVATAR':
                    await this.executeAvatarCommand(message, params);
                    break;
                default:
                    await message.reply("I understood you want to do something but I'm not sure what. Try using the direct commands!");
            }
        } catch (error) {
            console.error('❌ Error executing natural command:', error);
            await message.reply("I understood what you want but had trouble executing it. Try the direct command instead!");
        }
    }

    // Natural command execution methods (simplified versions)
    async executeKickCommand(message, username, chat) {
        await message.reply('For safety, please use the direct ?kick command with @mention.');
    }

    async executePurgeCommand(message, countStr, chat) {
        await message.reply('For safety, please use the direct ?purge command.');
    }

    async executePollCommand(message, pollData, chat) {
        await message.reply('For safety, please use the direct ?poll command.');
    }

    async executeWelcomeCommand(message, username) {
        const welcomeMessage = `Welcome ${username}! I'm chotu your helper. Try out ?help to see a list of commands and you can talk to me in natural language as well.`;
        await message.reply(welcomeMessage);
        console.log(`👋 Welcomed user via natural language: ${username}`);
    }

    async executeAvatarCommand(message, username) {
        await message.reply('For safety, please use the direct ?avatar command with @mention.');
    }

    // Check if message is owner number selection for master search
    isOwnerNumberSelection(message) {
        const senderId = message.author || message.from;
        return (
            senderId === this.constants.OWNER_ID &&
            message.body.match(/^\d+$/) &&
            this.ownerLastMasterSearch
        );
    }

    async handleOwnerNumberSelection(message) {
        const chat = await message.getChat();
        
        // Check if the search results are still valid (within timeout)
        const searchAge = Date.now() - this.ownerLastMasterSearch.timestamp;
        if (searchAge > this.constants.MASTER_SEARCH_TIMEOUT) {
            this.ownerLastMasterSearch = null;
            await message.reply('🔍 Previous master search results have expired. Please search again with ?mastersearch.');
            return;
        }
        
        const selectedNumber = parseInt(message.body);
        const maxDisplayed = Math.min(this.ownerLastMasterSearch.results.length, 10);
        
        if (selectedNumber < 1 || selectedNumber > maxDisplayed) {
            await message.reply(`🔍 Please select a number between 1 and ${maxDisplayed}.`);
            return;
        }
        
        try {
            const selectedDoc = this.ownerLastMasterSearch.results[selectedNumber - 1];
            
            // Check file size (WhatsApp limit)
            if (selectedDoc.size > this.constants.MAX_FILE_SIZE) {
                await message.reply(`🔍 "${selectedDoc.filename}" from group "${selectedDoc.groupDisplayName}" is too large to send (${Math.round(selectedDoc.size / 1024 / 1024)}MB). WhatsApp has file size limits.`);
                return;
            }
            
            console.log(`📤 Sending selected document from master search: ${selectedDoc.filename} from ${selectedDoc.groupDisplayName}`);
            
            // Send the document
            const { MessageMedia } = require('whatsapp-web.js');
            const media = MessageMedia.fromFilePath(selectedDoc.path);
            
            await chat.sendMessage(media, {
                caption: `🔍 ${selectedDoc.filename}\n📁 From: ${selectedDoc.groupDisplayName}\n🔢 Selection ${selectedNumber} from "${this.ownerLastMasterSearch.query}"`
            });
            
            console.log(`✅ Selected master search document sent: ${selectedDoc.filename} from ${selectedDoc.groupDisplayName}`);
            
            // Clear the search results after successful selection
            this.ownerLastMasterSearch = null;
            
        } catch (error) {
            console.error('❌ Error sending selected master search document:', error);
            await message.reply('Sorry, there was an error sending the selected document. Please try again.');
        }
    }

    // Set owner master search results
    setOwnerMasterSearchResults(results) {
        this.ownerLastMasterSearch = results;
    }

    // Get owner master search results
    getOwnerMasterSearchResults() {
        return this.ownerLastMasterSearch;
    }
}

module.exports = MessageHandler; 
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
        await chat.sendStateTyping();
        
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

    // Natural command execution methods (full implementations)
    async executeKickCommand(message, params, chat) {
        if (!chat.isGroup) {
            return message.reply('This command can only be used in a group.');
        }

        // Check admin permissions
        const permissions = require('../utils/permissions');
        const authorId = message.author;
        
        if (!permissions.canKickUser(authorId, chat)) {
            return message.reply('You need to be a group admin to kick users.');
        }

        const botId = this.context.whatsappService.getClient().info.wid._serialized;
        if (!permissions.botHasAdminPermissions(botId, chat)) {
            return message.reply('I need to be an admin to do that.');
        }

        // For safety, require mentions for natural language kicks
        if (!message.mentionedIds || message.mentionedIds.length === 0) {
            return message.reply('For safety, please mention the user you want to kick when using natural language. Example: "kick @username"');
        }

        const userToKickId = message.mentionedIds[0];

        if (userToKickId === this.constants.OWNER_ID) {
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
            console.log(`👢 User kicked via natural language: ${userToKickId} from ${chat.name}`);
        } catch (err) {
            console.error('Failed to kick user via natural language:', err);
            await message.reply('Failed to remove the user. Please check my permissions.');
        }
    }

    async executePurgeCommand(message, countStr, chat) {
        if (!chat.isGroup) {
            return message.reply('This command can only be used in a group.');
        }

        const permissions = require('../utils/permissions');
        const authorId = message.author;

        if (!permissions.canPurgeMessages(authorId, chat)) {
            return message.reply('You need to be a group admin to delete messages.');
        }

        const botId = this.context.whatsappService.getClient().info.wid._serialized;
        if (!permissions.botHasAdminPermissions(botId, chat)) {
            return message.reply('I need to be an admin to delete messages.');
        }

        const deleteCount = parseInt(countStr);
        if (isNaN(deleteCount) || deleteCount < 1 || deleteCount > this.constants.MAX_PURGE_COUNT) {
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
                let confirmText = `Deleted ${deletedCount} messages via natural language.`;
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
                
                console.log(`🗑️ Purged ${deletedCount} messages via natural language in ${chat.name}`);
            } else {
                await message.reply('No messages could be deleted.');
            }

        } catch (err) {
            console.error('Failed to purge messages via natural language:', err);
            await message.reply('Failed to delete messages. Make sure I have the necessary permissions.');
        }
    }

    async executePollCommand(message, pollData, chat) {
        try {
            const parts = pollData.split('|');
            
            if (parts.length < 3) {
                return message.reply('Need at least a question and 2 options for a poll.');
            }

            const isMultiSelect = parts[0] === '-m';
            const question = isMultiSelect ? parts[1] : parts[0];
            const options = isMultiSelect ? parts.slice(2) : parts.slice(1);

            if (options.length > this.constants.MAX_POLL_OPTIONS) {
                return message.reply('Maximum 12 options allowed per poll.');
            }

            const { Poll } = require('whatsapp-web.js');
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

    async executeWelcomeCommand(message, username) {
        const welcomeMessage = `Welcome ${username}! I'm chotu your helper. Try out ?help to see a list of commands and you can talk to me in natural language as well.`;
        await message.reply(welcomeMessage);
        console.log(`👋 Welcomed user via natural language: ${username}`);
    }

    async executeAvatarCommand(message, params) {
        // For safety, require mentions for natural language avatar requests
        if (!message.mentionedIds || message.mentionedIds.length === 0) {
            return message.reply('For safety, please mention the user whose avatar you want when using natural language. Example: "show @username avatar"');
        }

        const targetUserId = message.mentionedIds[0];
        
        try {
            const contact = await this.context.whatsappService.getClient().getContactById(targetUserId);
            const contactName = contact.pushname || contact.name || contact.number || 'User';
            
            console.log(`🖼️ Fetching avatar for ${contactName} via natural language`);
            
            const profilePicUrl = await contact.getProfilePicUrl();
            
            if (!profilePicUrl) {
                return message.reply(`${contactName} doesn't have a profile picture or it's not visible to me.`);
            }
            
            const { MessageMedia } = require('whatsapp-web.js');
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
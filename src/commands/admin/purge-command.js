const Command = require('../base/command');

class PurgeCommand extends Command {
    constructor() {
        super('purge', 'Delete recent messages (Admin only)', {
            category: 'Admin',
            groupOnly: true,
            adminOnly: true,
            requiresBotAdmin: true
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (args.length !== 1) {
                return message.reply('Usage: ?purge <number>\nExample: ?purge 10');
            }

            const deleteCount = parseInt(args[0]);
            if (isNaN(deleteCount) || deleteCount < 1 || deleteCount > this.constants.MAX_PURGE_COUNT) {
                return message.reply(`Please provide a valid number between 1 and ${this.constants.MAX_PURGE_COUNT}.`);
            }

            // Fetch recent messages (get extra to account for the purge command)
            const messages = await chat.fetchMessages({ limit: deleteCount + 10 });
            
            if (messages.length <= 1) {
                return message.reply('No messages to delete.');
            }

            console.log(`📊 Fetched ${messages.length} messages for purge in ${chat.name}`);

            // Find the purge command message using proper ID comparison
            const purgeCommandIndex = messages.findIndex(msg => msg.id._serialized === message.id._serialized);
            console.log(`🎯 Purge command found at index: ${purgeCommandIndex}`);
            
            let messagesToDelete;
            
            if (purgeCommandIndex !== -1) {
                // Get the N messages that came immediately before the purge command
                const startIndex = Math.max(0, purgeCommandIndex - deleteCount);
                messagesToDelete = messages.slice(startIndex, purgeCommandIndex);
                console.log(`✂️ Using messages from index ${startIndex} to ${purgeCommandIndex - 1}`);
            } else {
                // Fallback: exclude the first message (likely the purge command) and take next N
                messagesToDelete = messages.slice(1, deleteCount + 1);
                console.log(`🔄 Fallback: Using messages from index 1 to ${deleteCount}`);
            }
            
            console.log(`🗑️ Attempting to delete ${messagesToDelete.length} messages`);
            
            let deletedCount = 0;
            let failedCount = 0;
            
            for (let i = 0; i < messagesToDelete.length; i++) {
                const msg = messagesToDelete[i];
                try {
                    await msg.delete(true); // true = delete for everyone
                    deletedCount++;
                    console.log(`✅ Deleted message ${i+1}/${messagesToDelete.length} from ${msg.author || msg.from}`);
                    
                    // Delay between deletions to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (deleteError) {
                    failedCount++;
                    console.error(`❌ Failed to delete message ${i+1}/${messagesToDelete.length}:`, deleteError.message);
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
                
                // Auto-delete the confirmation message after 5 seconds
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
            
        } catch (error) {
            console.error('Failed to purge messages:', error);
            await message.reply('Failed to delete messages. Make sure I have the necessary permissions.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} <number> - Delete recent messages (Admin only)`;
    }
}

module.exports = PurgeCommand; 
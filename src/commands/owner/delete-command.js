const Command = require('../base/command');

class DeleteCommand extends Command {
    constructor() {
        super('delete', 'Delete bot message or stored document (Owner only)', {
            category: 'Owner',
            ownerOnly: true,
            hidden: true
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            // Check if this is a reply to a bot message
            if (message.hasQuotedMsg) {
                const quotedMessage = await message.getQuotedMessage();
                const botId = context.whatsappService.getClient().info.wid._serialized;
                
                // Check if the quoted message is from the bot
                if (quotedMessage.fromMe || quotedMessage.from === botId || quotedMessage.author === botId) {
                    try {
                        await quotedMessage.delete(true); // true = delete for everyone
                        console.log(`🗑️ Bot message deleted by owner in ${chat.isGroup ? chat.name : 'private chat'}`);
                        // Don't reply - just silently delete
                        return;
                    } catch (deleteError) {
                        console.error('❌ Error deleting bot message:', deleteError);
                        return message.reply('Sorry, I couldn\'t delete that message. It might be too old or already deleted.');
                    }
                }
            }
            
            // If not a reply to bot message, proceed with document deletion
            if (args.length === 0) {
                return message.reply('Usage:\n1. Reply to a bot message with ?delete to remove it\n2. ?delete <document name or number> to delete a stored document\n\nExample: ?delete meeting notes or ?delete 1');
            }
            
            const deleteQuery = args.join(' ');
            const documentsPath = context.documentService.getGroupDocumentsFolder(chat);
            
            const result = context.documentService.deleteDocument(documentsPath, deleteQuery);
            
            await message.reply(result.message);
            
            if (result.success) {
                console.log(`🗑️ Document deleted by owner in ${chat.isGroup ? chat.name : 'private chat'}`);
            }
            
        } catch (error) {
            console.error('❌ Error in delete command:', error);
            await message.reply('Sorry, there was an error. Please try again.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} - Reply to bot message to delete it, or delete a stored document (Owner only)`;
    }
}

module.exports = DeleteCommand; 
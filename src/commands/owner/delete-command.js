const Command = require('../base/command');

class DeleteCommand extends Command {
    constructor() {
        super('delete', 'Delete a stored document (Owner only)', {
            category: 'Owner',
            ownerOnly: true,
            hidden: true
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (args.length === 0) {
                return message.reply('Usage: ?delete <document name or number>\nExample: ?delete meeting notes or ?delete 1');
            }
            
            const deleteQuery = args.join(' ');
            const documentsPath = context.documentService.getGroupDocumentsFolder(chat);
            
            const result = context.documentService.deleteDocument(documentsPath, deleteQuery);
            
            await message.reply(result.message);
            
            if (result.success) {
                console.log(`🗑️ Document deleted by owner in ${chat.isGroup ? chat.name : 'private chat'}`);
            }
            
        } catch (error) {
            console.error('❌ Error deleting document:', error);
            await message.reply('Sorry, there was an error deleting the file. Please try again.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} <name or number> - Delete a stored document (Owner only)`;
    }
}

module.exports = DeleteCommand; 
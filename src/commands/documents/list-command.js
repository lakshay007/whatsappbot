const Command = require('../base/command');

class ListCommand extends Command {
    constructor() {
        super('list', 'Show all stored documents in this group', {
            category: 'Documents'
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            const documentsPath = context.documentService.getGroupDocumentsFolder(chat);
            
            const documents = context.documentService.getOrderedDocuments(documentsPath);
            
            if (documents.length === 0) {
                const groupName = chat.isGroup ? chat.name : 'this chat';
                await message.reply(`📄 No documents stored yet for ${groupName}.\n\nSend files to this group and I'll automatically store them for fetching.`);
                return;
            }
            
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
            
            console.log(`📋 Listed ${documents.length} documents for ${chat.isGroup ? chat.name : 'private chat'}`);
            
        } catch (error) {
            console.error('❌ Error listing documents:', error);
            await message.reply('Sorry, there was an error listing documents. Please try again.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} - Show all stored documents in this group`;
    }
}

module.exports = ListCommand; 
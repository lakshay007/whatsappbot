const Command = require('../base/command');
const { MessageMedia } = require('whatsapp-web.js');

class FetchCommand extends Command {
    constructor() {
        super('fetch', 'Find and send document from group folder', {
            category: 'Documents'
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (args.length === 0) {
                return message.reply('Usage: ?fetch <document name or number>\nExample: ?fetch meeting notes or ?fetch 1');
            }
            
            const query = args.join(' ');
            const documentsPath = context.documentService.getGroupDocumentsFolder(chat);
            
            // Check if query is a number (index)
            const indexNumber = parseInt(query);
            if (!isNaN(indexNumber) && indexNumber > 0) {
                await this.fetchByIndex(message, chat, context, indexNumber, documentsPath);
            } else {
                await this.fetchByName(message, chat, context, query, documentsPath);
            }
            
        } catch (error) {
            console.error('❌ Error in fetch command:', error);
            await message.reply('Sorry, there was an error searching for documents. Please try again.');
        }
    }

    async fetchByIndex(message, chat, context, indexNumber, documentsPath) {
        const orderedDocs = context.documentService.getOrderedDocuments(documentsPath);
        
        if (orderedDocs.length === 0) {
            const groupName = chat.isGroup ? chat.name : 'this chat';
            await message.reply(`📄 No documents stored yet for ${groupName}.`);
            return;
        }
        
        if (indexNumber > orderedDocs.length) {
            await message.reply(`📄 Invalid number. There are only ${orderedDocs.length} documents. Use ?list to see all files.`);
            return;
        }
        
        const doc = orderedDocs[indexNumber - 1];
        
        // Check file size
        if (doc.size > this.constants.MAX_FILE_SIZE) {
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
    }

    async fetchByName(message, chat, context, query, documentsPath) {
        const searchResults = context.documentService.searchDocuments(documentsPath, query);
        
        if (searchResults.length === 0) {
            const groupName = chat.isGroup ? chat.name : 'this chat';
            await message.reply(`📄 No documents found for "${query}" in ${groupName}.\n\nTo add documents, simply send them as files to this group and I'll store them for future fetching.\n\nYou can also use ?list to see all files and ?fetch <number> to get by index.`);
            return;
        }
        
        // If perfect match or only one result, send it directly
        if (searchResults.length === 1 || searchResults[0].score >= 90) {
            const doc = searchResults[0];
            
            // Check file size
            if (doc.size > this.constants.MAX_FILE_SIZE) {
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
    }

    getHelpText() {
        return `${this.getUsage()} <name or number> - Find and send document from group folder`;
    }
}

module.exports = FetchCommand; 
const Command = require('../base/command');
const { MessageMedia } = require('whatsapp-web.js');

class MasterSearchCommand extends Command {
    constructor() {
        super('mastersearch', 'Search across all group folders (Owner only)', {
            category: 'Owner',
            ownerOnly: true,
            hidden: true
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (args.length === 0) {
                return message.reply('Usage: ?mastersearch <document name>\nExample: ?mastersearch meeting notes\n\nThis searches across ALL group folders for the file.');
            }
            
            const searchQuery = args.join(' ');
            console.log(`🔍 Master search initiated by owner for: "${searchQuery}"`);
            
            const searchResults = context.documentService.masterSearchDocuments(searchQuery);
            
            if (searchResults.length === 0) {
                await message.reply(`🔍 No documents found for "${searchQuery}" across all groups.\n\nSearched across all group folders.`);
                return;
            }
            
            // If perfect match and only one result, send it directly
            if (searchResults.length === 1 || (searchResults[0].score >= 90 && searchResults.filter(r => r.score >= 90).length === 1)) {
                const doc = searchResults[0];
                
                // Check file size (WhatsApp limit)
                if (doc.size > this.constants.MAX_FILE_SIZE) {
                    await message.reply(`🔍 Found "${doc.filename}" in group "${doc.groupDisplayName}" but it's too large to send (${Math.round(doc.size / 1024 / 1024)}MB). WhatsApp has file size limits.`);
                    return;
                }
                
                console.log(`📤 Sending document from master search: ${doc.filename} from ${doc.groupDisplayName} (${Math.round(doc.size / 1024)}KB)`);
                
                // Send the document
                const media = MessageMedia.fromFilePath(doc.path);
                await chat.sendMessage(media, {
                    caption: `🔍 ${doc.filename}\n📁 From: ${doc.groupDisplayName}`
                });
                
                console.log(`✅ Master search document sent: ${doc.filename} from ${doc.groupDisplayName}`);
                
            } else {
                // Multiple results - show list with group information and store for number selection
                const masterSearchResults = {
                    query: searchQuery,
                    results: searchResults,
                    timestamp: Date.now()
                };
                
                context.messageHandler.setOwnerMasterSearchResults(masterSearchResults);
                
                let resultText = `🔍 Found ${searchResults.length} documents for "${searchQuery}" across all groups:\n\n`;
                
                searchResults.slice(0, 10).forEach((doc, index) => {
                    const sizeKB = Math.round(doc.size / 1024);
                    resultText += `${index + 1}. ${doc.filename} (${sizeKB}KB)\n   📁 ${doc.groupDisplayName}\n\n`;
                });
                
                if (searchResults.length > 10) {
                    resultText += `... and ${searchResults.length - 10} more results\n\n`;
                }
                
                resultText += `Reply with the number (1-${Math.min(searchResults.length, 10)}) to get the document.`;
                await message.reply(resultText);
            }
            
        } catch (error) {
            console.error('❌ Error in master search command:', error);
            await message.reply('Sorry, there was an error performing the master search. Please try again.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} <name> - Search across all group folders (Owner only)`;
    }
}

module.exports = MasterSearchCommand; 
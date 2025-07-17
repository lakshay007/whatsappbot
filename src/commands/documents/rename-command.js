const Command = require('../base/command');

class RenameCommand extends Command {
    constructor() {
        super('rename', 'Rename a stored document', {
            category: 'Documents'
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (args.length === 0) {
                return message.reply('Usage: ?rename oldname:newname or ?rename number:newname\nExample: ?rename old_document.pdf:new_document.pdf or ?rename 1:new_document.pdf');
            }
            
            const renameText = args.join(' ');
            
            if (!renameText.includes(':')) {
                return message.reply('Usage: ?rename oldname:newname or ?rename number:newname\nExample: ?rename old_document.pdf:new_document.pdf or ?rename 1:new_document.pdf');
            }
            
            const [oldIdentifier, newNameInput] = renameText.split(':').map(name => name.trim());
            
            if (!oldIdentifier || !newNameInput) {
                return message.reply('Usage: ?rename oldname:newname or ?rename number:newname\nBoth old identifier and new name are required.');
            }
            
            const documentsPath = context.documentService.getGroupDocumentsFolder(chat);
            const result = context.documentService.renameDocument(documentsPath, oldIdentifier, newNameInput);
            
            await message.reply(result.message);
            
            if (result.success) {
                console.log(`📝 Document renamed in ${chat.isGroup ? chat.name : 'private chat'}`);
            }
            
        } catch (error) {
            console.error('❌ Error renaming file:', error);
            await message.reply('Sorry, there was an error renaming the file. Please try again.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} oldname:newname - Rename a stored document`;
    }
}

module.exports = RenameCommand; 
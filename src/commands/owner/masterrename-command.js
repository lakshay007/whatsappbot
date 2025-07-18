const Command = require('../base/command');
const path = require('path');
const FileUtils = require('../../utils/file-utils');

class MasterRenameCommand extends Command {
    constructor() {
        super('masterrename', 'Rename files from master search results (Owner only)', {
            category: 'Owner',
            ownerOnly: true,
            hidden: true
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (args.length === 0) {
                return message.reply('Usage: ?masterrename number:newname\nExample: ?masterrename 1:new_document.pdf\n\nRenames a file from the last master search results.');
            }
            
            const renameText = args.join(' ');
            
            if (!renameText.includes(':')) {
                return message.reply('Usage: ?masterrename number:newname\nExample: ?masterrename 1:new_document.pdf\n\nRenames a file from the last master search results.');
            }
            
            const [numberStr, newNameInput] = renameText.split(':').map(part => part.trim());
            
            if (!numberStr || !newNameInput) {
                return message.reply('Usage: ?masterrename number:newname\nBoth number and new name are required.');
            }
            
            const ownerLastMasterSearch = context.messageHandler.getOwnerMasterSearchResults();
            
            if (!ownerLastMasterSearch) {
                return message.reply('🔍 No recent master search results found. Please use ?mastersearch first.');
            }
            
            // Check if the search results are still valid (within timeout)
            const searchAge = Date.now() - ownerLastMasterSearch.timestamp;
            if (searchAge > this.constants.MASTER_SEARCH_TIMEOUT) {
                context.messageHandler.setOwnerMasterSearchResults(null);
                await message.reply('🔍 Previous master search results have expired. Please search again with ?mastersearch.');
                return;
            }
            
            const selectedNumber = parseInt(numberStr);
            const maxDisplayed = Math.min(ownerLastMasterSearch.results.length, 10);
            
            if (isNaN(selectedNumber) || selectedNumber < 1 || selectedNumber > maxDisplayed) {
                await message.reply(`🔍 Please select a valid number between 1 and ${maxDisplayed}.`);
                return;
            }
            
            const selectedDoc = ownerLastMasterSearch.results[selectedNumber - 1];
            
            // Preserve file extension if not provided in new name
            const originalExt = FileUtils.getFileExtension(selectedDoc.filename);
            let newName = newNameInput;
            
            // If new name doesn't have an extension, add the original extension
            if (!FileUtils.getFileExtension(newName) && originalExt) {
                newName = newName + originalExt;
            }
            
            // Check if new name already exists in the same group folder
            const newFilePath = path.join(selectedDoc.groupPath, newName);
            if (FileUtils.fileExists(newFilePath)) {
                await message.reply(`📝 A file named "${newName}" already exists. Choose a different name.`);
                return;
            }
            
            // Perform the rename
            const success = FileUtils.renameFile(selectedDoc.path, newFilePath);
            
            if (success) {
                console.log(`📝 Master renamed: ${selectedDoc.filename} → ${newName} by owner`);
                await message.reply(`📝 Successfully renamed "${selectedDoc.filename}" to "${newName}"`);
                
                // Update the search results with the new filename
                ownerLastMasterSearch.results[selectedNumber - 1].filename = newName;
                ownerLastMasterSearch.results[selectedNumber - 1].path = newFilePath;
                context.messageHandler.setOwnerMasterSearchResults(ownerLastMasterSearch);
                
            } else {
                await message.reply('Sorry, there was an error renaming the file. Please try again.');
            }
            
        } catch (error) {
            console.error('❌ Error in master rename command:', error);
            await message.reply('Sorry, there was an error renaming the file. Please try again.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} number:newname - Rename files from master search results (Owner only)`;
    }
}

module.exports = MasterRenameCommand; 
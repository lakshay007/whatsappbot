const path = require('path');
const config = require('../../config');
const FileUtils = require('../../utils/file-utils');
const Sanitize = require('../../utils/sanitize');

class DocumentStorageService {
    constructor() {
        this.constants = config.getConstants();
        this.documentsRoot = path.join(__dirname, '../../../', this.constants.DOCUMENTS_DIR);
        
        // Ensure root documents directory exists
        FileUtils.ensureDirectoryExists(this.documentsRoot);
    }

    getGroupDocumentsFolder(chat) {
        let folderName;
        if (chat.isGroup) {
            folderName = Sanitize.sanitizeGroupName(chat.name || chat.id.user);
        } else {
            folderName = 'private_' + Sanitize.sanitizeGroupName(chat.id.user);
        }
        
        const documentsPath = path.join(this.documentsRoot, folderName);
        
        // Create folder if it doesn't exist
        FileUtils.ensureDirectoryExists(documentsPath);
        
        return documentsPath;
    }

    async autoStoreDocument(message, chat) {
        if (!message.hasMedia || message.fromMe || message.type === 'sticker') {
            return null;
        }

        try {
            const media = await message.downloadMedia();
            
            if (!media) {
                return null;
            }

            let filename = this.generateFilename(media);
            
            // Skip if no filename generated (unsupported type)
            if (!filename) {
                return null;
            }

            const fileExt = FileUtils.getFileExtension(filename);
            
            // Only store certain file types
            if (!this.constants.ALLOWED_FILE_TYPES.includes(fileExt)) {
                return null;
            }

            const documentsPath = this.getGroupDocumentsFolder(chat);
            const filePath = path.join(documentsPath, filename);
            
            // Check if file already exists - skip if duplicate
            if (FileUtils.fileExists(filePath)) {
                const sizeKB = FileUtils.getFileSizeInKB(media.data.length * 0.75);
                console.log(`⏭️ Skipped duplicate file: ${filename} (${sizeKB}KB) in ${chat.isGroup ? chat.name : 'private chat'}`);
                return null;
            }
            
            // Save the file
            const success = FileUtils.writeFile(filePath, media.data, 'base64');
            
            if (success) {
                const sizeKB = FileUtils.getFileSizeInKB(media.data.length * 0.75);
                console.log(`💾 Stored document: ${filename} (${sizeKB}KB) in ${chat.isGroup ? chat.name : 'private chat'}`);
                return {
                    filename,
                    filePath,
                    size: sizeKB,
                    groupPath: documentsPath
                };
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ Error in auto-store document:', error);
            return null;
        }
    }

    generateFilename(media) {
        let filename = media.filename;
        
        // Handle media without filename (copy/paste images, camera photos, etc.)
        if (!filename) {
            // Generate filename based on mimetype
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            if (media.mimetype) {
                if (media.mimetype.startsWith('image/')) {
                    if (media.mimetype.includes('jpeg') || media.mimetype.includes('jpg')) {
                        filename = `image_${timestamp}.jpg`;
                    } else if (media.mimetype.includes('png')) {
                        filename = `image_${timestamp}.png`;
                    } else {
                        filename = `image_${timestamp}.jpg`; // Default to jpg for other image types
                    }
                } else if (media.mimetype.includes('pdf')) {
                    filename = `document_${timestamp}.pdf`;
                } else {
                    // Don't generate filename for videos, audio, gifs, webp - they won't be stored
                    filename = null;
                }
            } else {
                filename = null; // No mimetype, don't store
            }
        }

        return filename;
    }

    deleteDocument(documentsPath, identifier) {
        try {
            let fileToDelete = null;
            
            // Check if identifier is a number (index)
            const indexNumber = parseInt(identifier);
            if (!isNaN(indexNumber) && indexNumber > 0) {
                const orderedDocs = this.getOrderedDocuments(documentsPath);
                
                if (orderedDocs.length === 0) {
                    return { success: false, message: 'No documents stored yet for this group.' };
                }
                
                if (indexNumber > orderedDocs.length) {
                    return { success: false, message: `Invalid number. There are only ${orderedDocs.length} documents.` };
                }
                
                fileToDelete = {
                    filename: orderedDocs[indexNumber - 1].name,
                    path: orderedDocs[indexNumber - 1].path
                };
            } else {
                // Search by name
                const searchResults = this.searchDocuments(documentsPath, identifier);
                
                if (searchResults.length === 0) {
                    return { success: false, message: `No document found matching "${identifier}".` };
                }
                
                fileToDelete = searchResults[0];
            }
            
            // Perform the deletion
            const success = FileUtils.deleteFile(fileToDelete.path);
            
            if (success) {
                console.log(`🗑️ Deleted: ${fileToDelete.filename} by owner`);
                return { success: true, message: `Successfully deleted "${fileToDelete.filename}"` };
            } else {
                return { success: false, message: 'Failed to delete the file.' };
            }
            
        } catch (error) {
            console.error('❌ Error deleting document:', error);
            return { success: false, message: 'Error deleting the file.' };
        }
    }

    renameDocument(documentsPath, oldIdentifier, newNameInput) {
        try {
            let fileToRename = null;
            
            // Check if oldIdentifier is a number (index)
            const indexNumber = parseInt(oldIdentifier);
            if (!isNaN(indexNumber) && indexNumber > 0) {
                const orderedDocs = this.getOrderedDocuments(documentsPath);
                
                if (orderedDocs.length === 0) {
                    return { success: false, message: 'No documents stored yet for this group.' };
                }
                
                if (indexNumber > orderedDocs.length) {
                    return { success: false, message: `Invalid number. There are only ${orderedDocs.length} documents.` };
                }
                
                fileToRename = {
                    filename: orderedDocs[indexNumber - 1].name,
                    path: orderedDocs[indexNumber - 1].path
                };
            } else {
                // Search by name
                const searchResults = this.searchDocuments(documentsPath, oldIdentifier);
                
                if (searchResults.length === 0) {
                    return { success: false, message: `No document found matching "${oldIdentifier}".` };
                }
                
                fileToRename = searchResults[0];
            }
            
            // Preserve file extension if not provided in new name
            const originalExt = FileUtils.getFileExtension(fileToRename.filename);
            let newName = newNameInput;
            
            // If new name doesn't have an extension, add the original extension
            if (!FileUtils.getFileExtension(newName) && originalExt) {
                newName = newName + originalExt;
            }
            
            // Check if new name already exists
            const newFilePath = path.join(documentsPath, newName);
            if (FileUtils.fileExists(newFilePath)) {
                return { success: false, message: `A file named "${newName}" already exists.` };
            }
            
            // Perform the rename
            const success = FileUtils.renameFile(fileToRename.path, newFilePath);
            
            if (success) {
                console.log(`📝 Renamed: ${fileToRename.filename} → ${newName}`);
                return { success: true, message: `Successfully renamed "${fileToRename.filename}" to "${newName}"` };
            } else {
                return { success: false, message: 'Failed to rename the file.' };
            }
            
        } catch (error) {
            console.error('❌ Error renaming document:', error);
            return { success: false, message: 'Error renaming the file.' };
        }
    }

    getOrderedDocuments(documentsPath) {
        try {
            if (!FileUtils.fileExists(documentsPath)) {
                return [];
            }
            
            const files = FileUtils.readDirectory(documentsPath);
            const documents = [];
            
            for (const file of files) {
                const filePath = path.join(documentsPath, file);
                const stats = FileUtils.getFileStats(filePath);
                
                if (stats && stats.isFile()) {
                    documents.push({
                        name: file,
                        path: filePath,
                        size: stats.size,
                        modified: stats.mtime
                    });
                }
            }
            
            // Sort by most recently modified
            return documents.sort((a, b) => b.modified - a.modified);
        } catch (error) {
            console.error('❌ Error getting ordered documents:', error);
            return [];
        }
    }

    searchDocuments(documentsPath, query) {
        try {
            if (!FileUtils.fileExists(documentsPath)) {
                return [];
            }
            
            const files = FileUtils.readDirectory(documentsPath);
            const results = [];
            
            for (const file of files) {
                const filePath = path.join(documentsPath, file);
                const stats = FileUtils.getFileStats(filePath);
                
                if (stats && stats.isFile()) {
                    const FuzzySearch = require('../../utils/fuzzy-search');
                    const score = FuzzySearch.search(query, file);
                    if (score > 0) {
                        results.push({
                            filename: file,
                            path: filePath,
                            score: score,
                            size: stats.size
                        });
                    }
                }
            }
            
            // Sort by score (highest first)
            return results.sort((a, b) => b.score - a.score);
        } catch (error) {
            console.error('❌ Error searching documents:', error);
            return [];
        }
    }

    getAllGroupFolders() {
        try {
            if (!FileUtils.fileExists(this.documentsRoot)) {
                return [];
            }
            
            const folders = FileUtils.readDirectory(this.documentsRoot);
            const groupFolders = [];
            
            for (const folder of folders) {
                const folderPath = path.join(this.documentsRoot, folder);
                const stats = FileUtils.getFileStats(folderPath);
                
                if (stats && stats.isDirectory()) {
                    groupFolders.push({
                        name: folder,
                        path: folderPath,
                        displayName: folder.replace(/_/g, ' ') // Convert underscores back to spaces for display
                    });
                }
            }
            
            return groupFolders;
        } catch (error) {
            console.error('❌ Error getting group folders:', error);
            return [];
        }
    }

    masterSearchDocuments(query) {
        try {
            const groupFolders = this.getAllGroupFolders();
            const allResults = [];
            
            for (const groupFolder of groupFolders) {
                const searchResults = this.searchDocuments(groupFolder.path, query);
                
                // Add group information to each result
                for (const result of searchResults) {
                    allResults.push({
                        ...result,
                        groupName: groupFolder.name,
                        groupDisplayName: groupFolder.displayName,
                        groupPath: groupFolder.path
                    });
                }
            }
            
            // Sort all results by score (highest first), then by group name
            return allResults.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return a.groupDisplayName.localeCompare(b.groupDisplayName);
            });
            
        } catch (error) {
            console.error('❌ Error in master search:', error);
            return [];
        }
    }
}

module.exports = DocumentStorageService; 
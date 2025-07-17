const fs = require('fs');
const path = require('path');

class FileUtils {
    static ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    static getFileStats(filePath) {
        try {
            return fs.statSync(filePath);
        } catch (error) {
            return null;
        }
    }

    static fileExists(filePath) {
        return fs.existsSync(filePath);
    }

    static readDirectory(dirPath) {
        try {
            return fs.readdirSync(dirPath);
        } catch (error) {
            return [];
        }
    }

    static writeFile(filePath, data, encoding = 'base64') {
        try {
            fs.writeFileSync(filePath, data, encoding);
            return true;
        } catch (error) {
            console.error('❌ Error writing file:', error);
            return false;
        }
    }

    static deleteFile(filePath) {
        try {
            fs.unlinkSync(filePath);
            return true;
        } catch (error) {
            console.error('❌ Error deleting file:', error);
            return false;
        }
    }

    static renameFile(oldPath, newPath) {
        try {
            fs.renameSync(oldPath, newPath);
            return true;
        } catch (error) {
            console.error('❌ Error renaming file:', error);
            return false;
        }
    }

    static getFileExtension(filename) {
        return path.extname(filename).toLowerCase();
    }

    static getFileSizeInKB(size) {
        return Math.round(size / 1024);
    }

    static getFileSizeInMB(size) {
        return Math.round(size / 1024 / 1024);
    }

    static formatFileSize(size) {
        const kb = this.getFileSizeInKB(size);
        const mb = this.getFileSizeInMB(size);
        
        if (mb > 0) {
            return `${mb}MB`;
        } else {
            return `${kb}KB`;
        }
    }
}

module.exports = FileUtils; 
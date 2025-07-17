class Sanitize {
    static sanitizeGroupName(groupName) {
        // Remove special characters and replace spaces with underscores
        return groupName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }

    static sanitizeFilename(filename) {
        // Remove or replace characters that are problematic in filenames
        return filename.replace(/[<>:"/\\|?*]/g, '_');
    }

    static sanitizeUserInput(input) {
        // Basic sanitization for user input
        return input.trim().replace(/[<>]/g, '');
    }
}

module.exports = Sanitize; 
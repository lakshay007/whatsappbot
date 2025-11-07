const config = require('../../config');
const permissions = require('../../utils/permissions');

class Command {
    constructor(name, description, options = {}) {
        this.name = name;
        this.description = description;
        this.constants = config.getConstants();
        
        // Command options
        this.options = {
            groupOnly: options.groupOnly || false,
            adminOnly: options.adminOnly || false,
            ownerOnly: options.ownerOnly || false,
            requiresMention: options.requiresMention || false,
            requiresBotAdmin: options.requiresBotAdmin || false,
            hidden: options.hidden || false,
            ...options
        };
    }

    // To be implemented by subclasses
    async execute(message, args, context) {
        throw new Error(`Execute method must be implemented by ${this.constructor.name}`);
    }

    // Permission checking
    async checkPermissions(message, chat, context) {
        const senderId = message.author || message.from;
        const botId = context.whatsappService.getClient().info.wid._serialized;

        // 🔍 TEMPORARY DEBUG - Remove after fixing owner ID issue
        console.log('🔍 DEBUG - Sender ID:', senderId);
        console.log('🔍 DEBUG - Owner ID from config:', this.constants.OWNER_ID);
        console.log('🔍 DEBUG - IDs match:', senderId === this.constants.OWNER_ID);
        console.log('🔍 DEBUG - Is group chat:', chat.isGroup);
        console.log('🔍 DEBUG - Command:', this.name);
        console.log('---');

        // Check if command is group-only
        if (this.options.groupOnly && !chat.isGroup) {
            return { allowed: false, message: permissions.getPermissionErrorMessage('group_only') };
        }

        // Check if user is owner (owner can do anything)
        if (permissions.isOwner(senderId)) {
            return { allowed: true };
        }

        // Check if command is owner-only
        if (this.options.ownerOnly) {
            return { allowed: false, message: permissions.getPermissionErrorMessage('owner') };
        }

        // Check if command requires admin permissions
        if (this.options.adminOnly && !permissions.canExecuteAdminCommand(senderId, chat)) {
            return { allowed: false, message: permissions.getPermissionErrorMessage('admin') };
        }

        // Check if bot needs admin permissions
        if (this.options.requiresBotAdmin && !permissions.botHasAdminPermissions(botId, chat)) {
            return { allowed: false, message: permissions.getPermissionErrorMessage('bot_admin') };
        }

        return { allowed: true };
    }

    // Parse command arguments
    parseArgs(messageBody) {
        // Remove command prefix and command name
        const commandText = messageBody.substring(this.constants.COMMAND_PREFIX.length + this.name.length).trim();
        
        if (!commandText) {
            return [];
        }

        // Split by spaces, but preserve quoted strings
        const args = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < commandText.length; i++) {
            const char = commandText[i];

            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = '';
            } else if (char === ' ' && !inQuotes) {
                if (current.trim()) {
                    args.push(current.trim());
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            args.push(current.trim());
        }

        return args;
    }

    // Get command usage string
    getUsage() {
        return `${this.constants.COMMAND_PREFIX}${this.name}`;
    }

    // Get command help text
    getHelpText() {
        return `${this.getUsage()} - ${this.description}`;
    }

    // Check if command should be shown in help
    shouldShowInHelp() {
        return !this.options.hidden;
    }

    // Get command category for help organization
    getCategory() {
        return this.options.category || 'General';
    }

    // Utility method to get contact info
    async getContactInfo(message) {
        try {
            const contact = await message.getContact();
            return {
                name: contact.pushname || contact.name || 'Someone',
                id: contact.id._serialized
            };
        } catch (error) {
            return {
                name: 'Someone',
                id: message.author || message.from
            };
        }
    }

    // Utility method to send typing indicator
    async sendTyping(chat) {
        try {
            await chat.sendStateTyping();
        } catch (error) {
            // Ignore typing errors
        }
    }

    // Utility method to handle errors
    async handleError(message, error, context = 'command execution') {
        console.error(`❌ Error in ${this.name} command (${context}):`, error);
        
        try {
            await message.reply("Sorry, something went wrong! 😅 Try again later.");
        } catch (replyError) {
            console.error('❌ Error sending error message:', replyError);
        }
    }
}

module.exports = Command; 
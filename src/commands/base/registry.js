const config = require('../../config');

class CommandRegistry {
    constructor() {
        this.commands = new Map();
        this.constants = config.getConstants();
    }

    // Register a command
    register(command) {
        if (!command.name) {
            throw new Error('Command must have a name');
        }
        
        this.commands.set(command.name.toLowerCase(), command);
        console.log(`📝 Registered command: ${command.name}`);
    }

    // Register multiple commands
    registerMultiple(commands) {
        commands.forEach(command => this.register(command));
    }

    // Get a command by name
    getCommand(name) {
        return this.commands.get(name.toLowerCase());
    }

    // Check if command exists
    hasCommand(name) {
        return this.commands.has(name.toLowerCase());
    }

    // Get all commands
    getAllCommands() {
        return Array.from(this.commands.values());
    }

    // Get commands by category
    getCommandsByCategory() {
        const categories = {};
        
        this.commands.forEach(command => {
            const category = command.getCategory();
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(command);
        });

        return categories;
    }

    // Get visible commands (not hidden)
    getVisibleCommands() {
        return this.getAllCommands().filter(command => command.shouldShowInHelp());
    }

    // Check if message is a command
    isCommand(messageBody) {
        if (!messageBody || typeof messageBody !== 'string') {
            return false;
        }

        return messageBody.startsWith(this.constants.COMMAND_PREFIX);
    }

    // Extract command name from message
    extractCommandName(messageBody) {
        if (!this.isCommand(messageBody)) {
            return null;
        }

        // Remove the prefix
        const withoutPrefix = messageBody.substring(this.constants.COMMAND_PREFIX.length);
        
        // Get the first word (command name)
        const firstSpace = withoutPrefix.indexOf(' ');
        const commandName = firstSpace === -1 ? withoutPrefix : withoutPrefix.substring(0, firstSpace);
        
        return commandName.toLowerCase();
    }

    // Execute a command
    async executeCommand(message, context) {
        try {
            const commandName = this.extractCommandName(message.body);
            
            if (!commandName) {
                return { success: false, error: 'No command found' };
            }

            const command = this.getCommand(commandName);
            
            if (!command) {
                return { success: false, error: 'Unknown command' };
            }

            const chat = await message.getChat();
            
            // Check permissions
            const permissionCheck = await command.checkPermissions(message, chat, context);
            
            if (!permissionCheck.allowed) {
                await message.reply(permissionCheck.message);
                return { success: false, error: 'Permission denied' };
            }

            // Parse arguments
            const args = command.parseArgs(message.body);
            
            // Execute the command
            console.log(`🎯 Executing command: ${commandName} with args: ${JSON.stringify(args)}`);
            
            const result = await command.execute(message, args, context);
            
            console.log(`✅ Command executed successfully: ${commandName}`);
            
            return { success: true, result };
            
        } catch (error) {
            console.error(`❌ Error executing command:`, error);
            
            try {
                await message.reply("Sorry, something went wrong! 😅 Try again later.");
            } catch (replyError) {
                console.error('❌ Error sending error message:', replyError);
            }
            
            return { success: false, error: error.message };
        }
    }

    // Generate help text for all commands
    generateHelpText(userLevel = 'user') {
        const categories = this.getCommandsByCategory();
        let helpText = 'Chotu helper commands\n\n';
        
        // Define category order and emojis
        const categoryOrder = [
            { name: 'Admin', emoji: '👥', title: 'GROUP MANAGEMENT' },
            { name: 'General', emoji: '🖼️', title: 'USER INFO' },
            { name: 'Polls', emoji: '📊', title: 'POLLS' },
            { name: 'Multimodal', emoji: '🎨', title: 'MULTIMODAL AI' },
            { name: 'Documents', emoji: '📄', title: 'DOCUMENTS' }
        ];

        categoryOrder.forEach(({ name, emoji, title }) => {
            const commands = categories[name];
            if (commands && commands.length > 0) {
                const visibleCommands = commands.filter(cmd => cmd.shouldShowInHelp());
                
                if (visibleCommands.length > 0) {
                    helpText += `${emoji} ${title}:\n`;
                    
                    visibleCommands.forEach(command => {
                        helpText += `   ${command.getHelpText()}\n`;
                    });
                    
                    helpText += '\n';
                }
            }
        });

        return helpText.trim();
    }

    // Get command statistics
    getStats() {
        const stats = {
            totalCommands: this.commands.size,
            visibleCommands: this.getVisibleCommands().length,
            hiddenCommands: this.commands.size - this.getVisibleCommands().length,
            categories: {}
        };

        const categories = this.getCommandsByCategory();
        Object.keys(categories).forEach(category => {
            stats.categories[category] = categories[category].length;
        });

        return stats;
    }
}

module.exports = CommandRegistry; 
const Command = require('../base/command');

class HelpCommand extends Command {
    constructor() {
        super('help', 'Show all available commands', {
            category: 'General'
        });
    }

    async execute(message, args, context) {
        try {
            const helpText = context.commandRegistry.generateHelpText();
            await message.reply(helpText);
            
            console.log(`📖 Help command executed for user: ${message.author || message.from}`);
            
        } catch (error) {
            await this.handleError(message, error, 'generating help text');
        }
    }

    getHelpText() {
        return `${this.getUsage()} - ${this.description}`;
    }
}

module.exports = HelpCommand; 
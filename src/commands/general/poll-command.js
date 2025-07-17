const Command = require('../base/command');
const { Poll } = require('whatsapp-web.js');

class PollCommand extends Command {
    constructor() {
        super('poll', 'Create a WhatsApp poll', {
            category: 'Polls'
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (args.length === 0) {
                return message.reply('Usage: ?poll [-m] question, option1, option2, option3\n\nExample: ?poll what should we eat, pizza, burger, sushi\nMulti-select: ?poll -m fav food, pizza, sushi');
            }
            
            // Join all args back into a single string
            let pollText = args.join(' ');
            
            // Check for -m flag (multi-select)
            const isMultiSelect = pollText.startsWith('-m ');
            if (isMultiSelect) {
                pollText = pollText.substring(3); // Remove "-m " flag
            }
            
            // Split by commas and trim whitespace
            const parts = pollText.split(',').map(part => part.trim());
            
            if (parts.length < 3) {
                return message.reply('Usage: ?poll [-m] question, option1, option2, option3\n\nExample: ?poll what should we eat, pizza, burger, sushi\nMulti-select: ?poll -m fav food, pizza, sushi');
            }
            
            if (parts.length > 13) { // 1 question + 12 options max (WhatsApp limit)
                return message.reply('Maximum 12 options allowed per poll.');
            }
            
            // First part is question, rest are options
            const question = parts[0];
            const options = parts.slice(1);
            
            // Create poll options with allowMultipleAnswers
            const pollOptions = {
                allowMultipleAnswers: isMultiSelect
            };
            
            // Create native WhatsApp poll
            const poll = new Poll(question, options, pollOptions);
            
            // Send the poll
            await chat.sendMessage(poll);
            
            const pollType = isMultiSelect ? 'multi-select' : 'single-select';
            console.log(`📊 Created ${pollType} WhatsApp poll: "${question}" with ${options.length} options`);
            
        } catch (error) {
            console.error('❌ Error creating poll:', error);
            await message.reply('Sorry, there was an error creating the poll. Make sure your WhatsApp supports polls.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} [-m] question, option1, option2, option3 - Create a WhatsApp poll`;
    }
}

module.exports = PollCommand; 
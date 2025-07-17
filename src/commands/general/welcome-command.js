const Command = require('../base/command');

class WelcomeCommand extends Command {
    constructor() {
        super('welcome', 'Welcome someone to the group', {
            category: 'General'
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (args.length === 0) {
                return message.reply('Usage: ?welcome @user or ?welcome username\n\nExample: ?welcome @john or ?welcome john');
            }
            
            const welcomeText = args.join(' ');
            let userName = '';
            let welcomeMessage = '';
            
            // Check if someone was mentioned
            if (message.mentionedIds && message.mentionedIds.length > 0) {
                try {
                    const targetUserId = message.mentionedIds[0];
                    const contact = await context.whatsappService.getClient().getContactById(targetUserId);
                    userName = contact.pushname || contact.name || 'there';
                    
                    welcomeMessage = `Welcome ${userName}! I'm chotu your helper. Try out ?help to see a list of commands and you can talk to me in natural language as well.`;
                    
                    await message.reply(welcomeMessage);
                    console.log(`👋 Welcomed mentioned user: ${userName}`);
                    
                } catch (error) {
                    console.error('❌ Error getting mentioned user:', error);
                    await message.reply("Couldn't get that user's info, but welcome to the group!");
                }
            } else if (welcomeText.trim()) {
                // Welcome by name (no mention)
                userName = welcomeText.trim();
                welcomeMessage = `Welcome ${userName}! I'm chotu your helper. Try out ?help to see a list of commands and you can talk to me in natural language as well.`;
                
                await message.reply(welcomeMessage);
                console.log(`👋 Welcomed user by name: ${userName}`);
            } else {
                await message.reply('Usage: ?welcome @user or ?welcome username\n\nExample: ?welcome @john or ?welcome john');
            }
            
        } catch (error) {
            console.error('❌ Error in welcome command:', error);
            await message.reply('Sorry, there was an error with the welcome command. Please try again.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} @user or username - Welcome someone to the group`;
    }
}

module.exports = WelcomeCommand; 
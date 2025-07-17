const Command = require('../base/command');
const { MessageMedia } = require('whatsapp-web.js');

class AvatarCommand extends Command {
    constructor() {
        super('avatar', 'Get user\'s profile picture', {
            category: 'General'
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            // Check if someone was mentioned
            if (!message.mentionedIds || message.mentionedIds.length === 0) {
                return message.reply('You need to mention a user to get their avatar.\nUsage: ?avatar @username');
            }

            const targetUserId = message.mentionedIds[0];
            
            // Get the contact
            const contact = await context.whatsappService.getClient().getContactById(targetUserId);
            const contactName = contact.pushname || contact.name || contact.number || 'User';
            
            console.log(`🖼️ Fetching avatar for ${contactName} (${targetUserId})`);
            
            // Get profile picture URL
            const profilePicUrl = await contact.getProfilePicUrl();
            
            if (!profilePicUrl) {
                return message.reply(`${contactName} doesn't have a profile picture or it's not visible to me.`);
            }
            
            console.log(`✅ Found profile picture URL for ${contactName}`);
            
            // Download and send the image
            const media = await MessageMedia.fromUrl(profilePicUrl);
            
            // Send the avatar with caption
            await chat.sendMessage(media, {
                caption: `${contactName}'s profile picture`
            });
            
            console.log(`📸 Sent avatar for ${contactName}`);
            
        } catch (error) {
            console.error('❌ Error fetching avatar:', error);
            
            if (error.message.includes('contact not found')) {
                await message.reply("I couldn't find that user. Make sure they're in this group.");
            } else if (error.message.includes('profile pic')) {
                await message.reply("This user's profile picture is not accessible or they don't have one.");
            } else {
                await message.reply("Failed to get the avatar. The user might have privacy settings enabled.");
            }
        }
    }

    getHelpText() {
        return `${this.getUsage()} @user - Get user's profile picture`;
    }
}

module.exports = AvatarCommand; 
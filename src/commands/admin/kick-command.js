const Command = require('../base/command');

class KickCommand extends Command {
    constructor() {
        super('kick', 'Remove user from group (Admin only)', {
            category: 'Admin',
            groupOnly: true,
            adminOnly: true,
            requiresBotAdmin: true
        });
    }

    async execute(message, args, context) {
        try {
            const chat = await message.getChat();
            
            if (!message.mentionedIds || message.mentionedIds.length === 0) {
                return message.reply('You need to mention a user to kick.');
            }

            const userToKickId = message.mentionedIds[0];

            // Check if trying to kick owner
            if (userToKickId === this.constants.OWNER_ID) {
                return message.reply("I'm not allowed to do that.");
            }

            const participantToKick = chat.participants.find(p => p.id._serialized === userToKickId);

            if (!participantToKick) {
                return message.reply("That user isn't in this group.");
            }

            if (participantToKick.isAdmin || participantToKick.isSuperAdmin) {
                return message.reply("I can't remove another admin.");
            }

            // Execute the kick
            await chat.removeParticipants([userToKickId]);
            await message.reply('Done.');
            
            console.log(`👢 User kicked: ${userToKickId} from ${chat.name}`);
            
        } catch (error) {
            console.error('Failed to kick user:', error);
            await message.reply('Failed to remove the user. Please check my permissions.');
        }
    }

    getHelpText() {
        return `${this.getUsage()} @user - Remove user from group (Admin only)`;
    }
}

module.exports = KickCommand; 
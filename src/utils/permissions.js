const config = require('../config');

class Permissions {
    constructor() {
        this.constants = config.getConstants();
    }

    // Check if user is the owner
    isOwner(userId) {
        return userId === this.constants.OWNER_ID;
    }

    // Check if user is admin in a group
    isAdmin(userId, chat) {
        if (!chat.isGroup) {
            return false;
        }

        const participant = chat.participants.find(p => p.id._serialized === userId);
        return participant && participant.isAdmin;
    }

    // Check if user is super admin in a group
    isSuperAdmin(userId, chat) {
        if (!chat.isGroup) {
            return false;
        }

        const participant = chat.participants.find(p => p.id._serialized === userId);
        return participant && participant.isSuperAdmin;
    }

    // Check if user can execute admin commands
    canExecuteAdminCommand(userId, chat) {
        return this.isOwner(userId) || this.isAdmin(userId, chat) || this.isSuperAdmin(userId, chat);
    }

    // Check if user can kick others
    canKickUser(userId, chat) {
        return this.canExecuteAdminCommand(userId, chat);
    }

    // Check if user can purge messages
    canPurgeMessages(userId, chat) {
        return this.canExecuteAdminCommand(userId, chat);
    }

    // Check if bot has admin permissions
    botHasAdminPermissions(botId, chat) {
        if (!chat.isGroup) {
            return false;
        }

        const botParticipant = chat.participants.find(p => p.id._serialized === botId);
        return botParticipant && botParticipant.isAdmin;
    }

    // Check if target user can be kicked
    canKickTargetUser(targetUserId, chat) {
        // Cannot kick owner
        if (this.isOwner(targetUserId)) {
            return false;
        }

        // Cannot kick admins or super admins
        if (this.isAdmin(targetUserId, chat) || this.isSuperAdmin(targetUserId, chat)) {
            return false;
        }

        return true;
    }

    // Check if user can use owner-only commands
    canUseOwnerCommand(userId) {
        return this.isOwner(userId);
    }

    // Check if user can delete documents
    canDeleteDocuments(userId) {
        return this.isOwner(userId);
    }

    // Check if user can use master search
    canUseMasterSearch(userId) {
        return this.isOwner(userId);
    }

    // Check if user can rename documents via master search
    canUseMasterRename(userId) {
        return this.isOwner(userId);
    }

    // Get permission level for user
    getPermissionLevel(userId, chat) {
        if (this.isOwner(userId)) {
            return 'owner';
        }

        if (chat.isGroup) {
            if (this.isSuperAdmin(userId, chat)) {
                return 'super_admin';
            }
            if (this.isAdmin(userId, chat)) {
                return 'admin';
            }
        }

        return 'user';
    }

    // Generate permission error message
    getPermissionErrorMessage(requiredPermission, currentPermission) {
        const messages = {
            admin: 'You need to be a group admin to use this command.',
            owner: 'This command is restricted to the bot owner.',
            bot_admin: 'I need to be an admin to do that.',
            cannot_kick_admin: "I can't remove another admin.",
            cannot_kick_owner: "I'm not allowed to do that.",
            group_only: 'This command can only be used in a group.'
        };

        return messages[requiredPermission] || 'You do not have permission to use this command.';
    }
}

module.exports = new Permissions(); 
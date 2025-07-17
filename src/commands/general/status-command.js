const Command = require('../base/command');

class StatusCommand extends Command {
    constructor() {
        super('status', 'Show bot status and health information', {
            category: 'General'
        });
    }

    async execute(message, args, context) {
        try {
            const healthReport = context.healthMonitor.getStatusReport();
            const recoveryReport = context.recoveryService.getStatusReport();
            const aiModel = context.aiService.modelRotation.getCurrentModelInfo();
            
            const statusText = `🤖 Bot Status:
✅ ${healthReport.isHealthy ? 'Active and healthy' : 'Health issues detected'}
⏰ Last activity: ${healthReport.lastActivity}
🔄 Reconnect attempts: ${recoveryReport.reconnectAttempts}
📱 Ready: ${context.whatsappService.getIsReady() ? 'Yes' : 'No'}
🧠 Current AI: ${aiModel.model} (${aiModel.keyName})
🔑 Total models: ${context.aiService.modelRotation.getTotalModelCount()}`;

            await message.reply(statusText);
            
            console.log(`📊 Status command executed for user: ${message.author || message.from}`);
            
        } catch (error) {
            await this.handleError(message, error, 'getting status information');
        }
    }

    getHelpText() {
        return `${this.constants.SYSTEM_PREFIX}status - ${this.description}`;
    }
}

module.exports = StatusCommand; 
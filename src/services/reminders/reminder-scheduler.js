const ReminderStorage = require('./reminder-storage');

class ReminderScheduler {
    constructor(whatsappClient) {
        this.storage = new ReminderStorage();
        this.whatsappClient = whatsappClient;
        this.intervalId = null;
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) {
            console.log('⏰ Reminder scheduler already running');
            return;
        }

        console.log('⏰ Starting reminder scheduler...');
        this.isRunning = true;

        // Check every minute
        this.intervalId = setInterval(() => {
            this.checkAndSendReminders();
        }, 60000); // 60 seconds

        // Also do an immediate check
        this.checkAndSendReminders();

        // Clean up old reminders once a day
        setInterval(() => {
            this.storage.cleanupOldReminders();
        }, 24 * 60 * 60 * 1000); // 24 hours

        console.log('✅ Reminder scheduler started');
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isRunning = false;
            console.log('⏰ Reminder scheduler stopped');
        }
    }

    async checkAndSendReminders() {
        try {
            const dueReminders = this.storage.getDueReminders();

            if (dueReminders.length === 0) {
                return;
            }

            console.log(`⏰ Found ${dueReminders.length} due reminder(s)`);

            for (const reminder of dueReminders) {
                await this.sendReminder(reminder);
            }

        } catch (error) {
            console.error('❌ Error checking reminders:', error);
        }
    }

    async sendReminder(reminder) {
        try {
            const chat = await this.whatsappClient.getChatById(reminder.chatId);
            
            if (!chat) {
                console.error(`❌ Chat not found: ${reminder.chatId}`);
                this.storage.removeReminder(reminder.chatId, reminder.id);
                return;
            }

            // Send the reminder message
            let message = reminder.message;
            
            // If there's a target user, prepend it
            if (reminder.targetUser) {
                message = `${reminder.targetUser} ${reminder.message}`;
            }

            await chat.sendMessage(message);
            console.log(`✅ Reminder sent to ${chat.name || reminder.chatId}: "${message}"`);

            // Remove the reminder after sending
            this.storage.removeReminder(reminder.chatId, reminder.id);

        } catch (error) {
            console.error('❌ Error sending reminder:', error);
            // Remove the reminder anyway to avoid repeated failures
            this.storage.removeReminder(reminder.chatId, reminder.id);
        }
    }
}

module.exports = ReminderScheduler;


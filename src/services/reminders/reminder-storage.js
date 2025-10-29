const fs = require('fs');
const path = require('path');

class ReminderStorage {
    constructor() {
        this.remindersDir = path.join(__dirname, '../../../reminders');
        this.remindersFile = path.join(this.remindersDir, 'reminders.json');
        this.ensureStorageExists();
    }

    ensureStorageExists() {
        if (!fs.existsSync(this.remindersDir)) {
            fs.mkdirSync(this.remindersDir, { recursive: true });
            console.log('📁 Created reminders directory');
        }

        if (!fs.existsSync(this.remindersFile)) {
            fs.writeFileSync(this.remindersFile, JSON.stringify({}, null, 2));
            console.log('📄 Created reminders.json file');
        }
    }

    loadReminders() {
        try {
            const data = fs.readFileSync(this.remindersFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('❌ Error loading reminders:', error);
            return {};
        }
    }

    saveReminders(reminders) {
        try {
            fs.writeFileSync(this.remindersFile, JSON.stringify(reminders, null, 2));
            return true;
        } catch (error) {
            console.error('❌ Error saving reminders:', error);
            return false;
        }
    }

    addReminder(chatId, reminderData) {
        const reminders = this.loadReminders();
        
        if (!reminders[chatId]) {
            reminders[chatId] = [];
        }

        const reminder = {
            id: this.generateId(),
            ...reminderData,
            createdAt: Date.now()
        };

        reminders[chatId].push(reminder);
        this.saveReminders(reminders);
        
        console.log(`⏰ Reminder added: ${reminder.id} for ${chatId}`);
        return reminder;
    }

    getDueReminders() {
        const reminders = this.loadReminders();
        
        // Get current time in IST (UTC+5:30)
        const nowUTC = new Date();
        const nowIST = new Date(nowUTC.getTime() + (5.5 * 60 * 60 * 1000));
        
        const currentTime = `${nowIST.getUTCHours().toString().padStart(2, '0')}:${nowIST.getUTCMinutes().toString().padStart(2, '0')}`;
        const currentDate = this.formatDate(nowIST);
        
        console.log(`⏰ Checking reminders at IST: ${currentDate} ${currentTime}`);
        
        const dueReminders = [];

        for (const chatId in reminders) {
            const chatReminders = reminders[chatId];
            
            for (const reminder of chatReminders) {
                console.log(`   Comparing: ${reminder.date} ${reminder.time} vs ${currentDate} ${currentTime}`);
                // Check if time and date match
                if (reminder.time === currentTime && reminder.date === currentDate) {
                    dueReminders.push({
                        ...reminder,
                        chatId
                    });
                }
            }
        }

        return dueReminders;
    }

    removeReminder(chatId, reminderId) {
        const reminders = this.loadReminders();
        
        if (!reminders[chatId]) {
            return false;
        }

        const initialLength = reminders[chatId].length;
        reminders[chatId] = reminders[chatId].filter(r => r.id !== reminderId);
        
        // Check if something was removed BEFORE deleting the key
        const removed = reminders[chatId].length < initialLength;
        
        if (reminders[chatId].length === 0) {
            delete reminders[chatId];
        }

        if (removed) {
            this.saveReminders(reminders);
            console.log(`🗑️ Reminder removed: ${reminderId} from ${chatId}`);
        }

        return removed;
    }

    cleanupOldReminders() {
        const reminders = this.loadReminders();
        
        // Get current time in IST (UTC+5:30)
        const nowUTC = new Date();
        const nowIST = new Date(nowUTC.getTime() + (5.5 * 60 * 60 * 1000));
        
        const currentDate = this.formatDate(nowIST);
        const currentTime = `${nowIST.getUTCHours().toString().padStart(2, '0')}:${nowIST.getUTCMinutes().toString().padStart(2, '0')}`;
        
        let cleaned = 0;

        for (const chatId in reminders) {
            const initialLength = reminders[chatId].length;
            
            // Remove reminders that are in the past
            reminders[chatId] = reminders[chatId].filter(reminder => {
                // If date is in the past, remove
                if (reminder.date < currentDate) {
                    return false;
                }
                // If date is today but time has passed, remove
                if (reminder.date === currentDate && reminder.time < currentTime) {
                    return false;
                }
                return true;
            });

            cleaned += initialLength - reminders[chatId].length;

            if (reminders[chatId].length === 0) {
                delete reminders[chatId];
            }
        }

        if (cleaned > 0) {
            this.saveReminders(reminders);
            console.log(`🧹 Cleaned up ${cleaned} old reminders`);
        }

        return cleaned;
    }

    generateId() {
        return `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    formatDate(date) {
        // Use UTC methods since we're already passing an IST-adjusted date
        const year = date.getUTCFullYear();
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = date.getUTCDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

module.exports = ReminderStorage;


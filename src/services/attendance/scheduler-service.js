const { Poll } = require('whatsapp-web.js');
const AttendanceService = require('./attendance-service');

class AttendanceSchedulerService {
    constructor(whatsappService) {
        this.whatsappService = whatsappService;
        this.attendanceService = new AttendanceService();
        this.schedulerInterval = null;
        this.ownerNumber = '917428233446@c.us'; // Owner's WhatsApp ID
        this.isRunning = false;
        
        // Poll tracking for responses
        this.activePollData = new Map(); // pollId -> { date, subjects, messageId }
    }

    start() {
        if (this.isRunning) {
            console.log('📅 Attendance scheduler already running');
            return;
        }

        console.log('📅 Starting attendance scheduler...');
        this.isRunning = true;

        // Check every minute for the 6pm IST trigger
        this.schedulerInterval = setInterval(() => {
            this.checkAndSendDailyPoll();
        }, 60000); // Check every minute

        // Also check immediately on startup (in case bot was restarted near 6pm)
        setTimeout(() => {
            this.checkAndSendDailyPoll();
        }, 5000);

        console.log('✅ Attendance scheduler started');
    }

    stop() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 Attendance scheduler stopped');
    }

    async checkAndSendDailyPoll() {
        try {
            const now = new Date();
            const istTime = this.convertToIST(now);
            
            // Check if it's 6pm IST (within a 1-minute window)
            const hour = istTime.getHours();
            const minute = istTime.getMinutes();
            
            if (hour === 18 && minute === 0) {
                await this.sendDailyAttendancePoll(istTime);
            }
        } catch (error) {
            console.error('❌ Error in attendance scheduler:', error);
        }
    }

    convertToIST(date) {
        // Convert to IST (UTC+5:30)
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const ist = new Date(utc + (5.5 * 3600000));
        return ist;
    }

    async sendDailyAttendancePoll(istDate = null) {
        const date = istDate || this.convertToIST(new Date());
        
        console.log(`📊 Checking if attendance poll should be sent for ${date.toDateString()}`);

        // Check if we should send poll today
        if (!this.attendanceService.shouldSendPollToday(date)) {
            console.log('📅 No classes today or it\'s Friday/Sunday - skipping poll');
            return;
        }

        // Check if poll was already sent today
        if (this.attendanceService.wasPollSentToday(date)) {
            console.log('📅 Poll already sent today - skipping');
            return;
        }

        try {
            // Get today's classes
            const todaysClasses = this.attendanceService.getTodaysClasses(date);
            
            if (todaysClasses.length === 0) {
                console.log('📅 No classes scheduled for today');
                return;
            }

            console.log(`📊 Sending attendance poll for ${todaysClasses.length} classes`);

            // Get the owner's chat
            const ownerContact = await this.whatsappService.getClient().getContactById(this.ownerNumber);
            const ownerChat = await ownerContact.getChat();

            // Send polls for each subject
            for (const classInfo of todaysClasses) {
                await this.sendAttendancePoll(ownerChat, classInfo, date);
                // Small delay between polls
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Mark that poll was sent today
            this.attendanceService.markPollSent(date);
            
            console.log('✅ Daily attendance polls sent successfully');

        } catch (error) {
            console.error('❌ Error sending daily attendance poll:', error);
        }
    }

    async sendAttendancePoll(chat, classInfo, date) {
        try {
            const question = `${classInfo.subject} (${classInfo.time}) attended?`;
            const options = ['Yes', 'No', 'Cancelled'];
            
            // Create the poll
            const poll = new Poll(question, options, { allowMultipleAnswers: false });
            
            // Send the poll
            const sentMessage = await chat.sendMessage(poll);
            
            // Store poll data for response tracking
            this.activePollData.set(sentMessage.id.id, {
                date: date.toISOString().split('T')[0],
                subject: classInfo.subject,
                time: classInfo.time,
                messageId: sentMessage.id.id,
                timestamp: Date.now()
            });

            console.log(`📊 Sent attendance poll: ${classInfo.subject} (${classInfo.time})`);

        } catch (error) {
            console.error(`❌ Error sending poll for ${classInfo.subject}:`, error);
        }
    }

    // Handle poll responses
    async handlePollResponse(message) {
        try {
            // Check if this is a response to our attendance poll
            if (!message.pollUpdatedMessage) {
                return false;
            }

            const pollId = message.pollUpdatedMessage.pollCreationMessageKey.id;
            const pollData = this.activePollData.get(pollId);
            
            if (!pollData) {
                return false; // Not our attendance poll
            }

            // Check if this response is from the owner
            const responderId = message.author || message.from;
            if (responderId !== this.ownerNumber) {
                return false; // Not from owner
            }

            // Get the selected option
            const selectedOptions = message.pollUpdatedMessage.votes;
            let selectedAnswer = null;
            
            // Find the owner's vote
            for (const vote of selectedOptions) {
                if (vote.selectedOptions && vote.selectedOptions.length > 0) {
                    const optionIndex = vote.selectedOptions[0];
                    const options = ['Yes', 'No', 'Cancelled'];
                    selectedAnswer = options[optionIndex];
                    break;
                }
            }

            if (!selectedAnswer) {
                return false;
            }

            // Map poll answer to attendance status
            let attendanceStatus;
            switch (selectedAnswer.toLowerCase()) {
                case 'yes':
                    attendanceStatus = 'attended';
                    break;
                case 'no':
                    attendanceStatus = 'absent';
                    break;
                case 'cancelled':
                    attendanceStatus = 'cancelled';
                    break;
                default:
                    return false;
            }

            // Record the attendance
            const recordDate = new Date(pollData.date);
            this.attendanceService.recordAttendance(pollData.subject, attendanceStatus, recordDate);

            // Send confirmation to owner
            const chat = await message.getChat();
            const confirmMessage = `✅ Recorded: ${pollData.subject} (${pollData.time}) - ${attendanceStatus.toUpperCase()}`;
            await chat.sendMessage(confirmMessage);

            // Remove from active polls (poll completed)
            this.activePollData.delete(pollId);

            console.log(`✅ Processed attendance response: ${pollData.subject} - ${attendanceStatus}`);
            return true;

        } catch (error) {
            console.error('❌ Error handling poll response:', error);
            return false;
        }
    }

    // Manual trigger for testing (only for owner)
    async triggerManualPoll(message) {
        const senderId = message.author || message.from;
        if (senderId !== this.ownerNumber) {
            await message.reply('❌ Only the owner can trigger manual attendance polls.');
            return;
        }

        try {
            const now = new Date();
            const istTime = this.convertToIST(now);
            await this.sendDailyAttendancePoll(istTime);
            await message.reply('✅ Manual attendance poll triggered!');
        } catch (error) {
            console.error('❌ Error in manual poll trigger:', error);
            await message.reply('❌ Error triggering manual poll.');
        }
    }

    // Get status info
    getStatus() {
        return {
            isRunning: this.isRunning,
            activePolls: this.activePollData.size,
            nextCheck: this.isRunning ? 'Every minute at 6:00 PM IST' : 'Stopped'
        };
    }
}

module.exports = AttendanceSchedulerService; 
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

    async sendDailyAttendancePoll(istDate = null, forceManual = false) {
        const date = istDate || this.convertToIST(new Date());
        
        console.log(`📊 Checking if attendance poll should be sent for ${date.toDateString()}`);

        // Check if we should send poll today
        if (!this.attendanceService.shouldSendPollToday(date)) {
            console.log('📅 No classes today or it\'s Friday/Sunday - skipping poll');
            return;
        }

        // Check if poll was already sent today (skip this check for manual triggers)
        if (!forceManual && this.attendanceService.wasPollSentToday(date)) {
            console.log('📅 Poll already sent today - skipping');
            return;
        }

        if (forceManual) {
            console.log('📅 Manual poll trigger - bypassing duplicate check');
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

            // Mark that poll was sent today (only for automatic polls, not manual testing)
            if (!forceManual) {
                this.attendanceService.markPollSent(date);
            }
            
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
            
            // Debug: Log message ID details
            console.log(`📊 Sent poll message ID: ${sentMessage.id.id}`);
            console.log(`📊 Sent poll message object:`, JSON.stringify(sentMessage.id, null, 2));
            
            // Store poll data for response tracking with multiple ID formats
            const pollData = {
                date: date.toISOString().split('T')[0],
                subject: classInfo.subject,
                time: classInfo.time,
                messageId: sentMessage.id.id,
                fullMessageId: sentMessage.id,
                timestamp: Date.now()
            };
            
            // Store with different possible ID formats
            this.activePollData.set(sentMessage.id.id, pollData);
            this.activePollData.set(sentMessage.id._serialized, pollData);
            
            console.log(`📊 Stored poll data with IDs: ${sentMessage.id.id} and ${sentMessage.id._serialized}`);
            console.log(`📊 Active polls count: ${this.activePollData.size}`);

        } catch (error) {
            console.error(`❌ Error sending poll for ${classInfo.subject}:`, error);
        }
    }

    // Handle poll responses
    async handlePollResponse(message) {
        try {
            // Add debugging to see what kind of message we're getting
            console.log(`🔍 Checking message type: ${message.type}`);
            console.log(`🔍 Message from: ${message.author || message.from}`);
            console.log(`🔍 Has pollUpdatedMessage: ${!!message.pollUpdatedMessage}`);
            
            // Check different possible poll response formats
            if (message.type === 'poll_vote') {
                console.log(`📊 Poll vote detected!`);
                return await this.handlePollVote(message);
            }
            
            // Check if this is a response to our attendance poll (legacy method)
            if (!message.pollUpdatedMessage) {
                return false;
            }

            console.log(`📊 Poll updated message detected!`);
            console.log(`📊 Poll data:`, JSON.stringify(message.pollUpdatedMessage, null, 2));

            const pollId = message.pollUpdatedMessage.pollCreationMessageKey.id;
            const pollData = this.activePollData.get(pollId);
            
            console.log(`🔍 Looking for poll ID: ${pollId}`);
            console.log(`🔍 Active polls:`, Array.from(this.activePollData.keys()));
            
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
            console.log('🔧 Manual poll trigger - forcing poll send for testing');
            await this.sendDailyAttendancePoll(istTime, true); // Pass true to force manual send
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

    // Handle poll_vote type messages (might be the correct format)
    async handlePollVote(message) {
        try {
            console.log(`📊 Processing poll vote message`);
            
            // Check if this response is from the owner
            const responderId = message.author || message.from;
            if (responderId !== this.ownerNumber) {
                console.log(`❌ Poll vote not from owner: ${responderId}`);
                return false;
            }
            
            // Try to find matching poll data
            // The poll ID might be in different places
            let pollData = null;
            let pollId = null;
            
            // Try different ways to get the poll ID
            if (message.pollUpdatedMessage?.pollCreationMessageKey?.id) {
                pollId = message.pollUpdatedMessage.pollCreationMessageKey.id;
            } else if (message.quotedMsgId) {
                pollId = message.quotedMsgId;
            } else if (message._data?.quotedStanzaID) {
                pollId = message._data.quotedStanzaID;
            }
            
            if (pollId) {
                pollData = this.activePollData.get(pollId);
                console.log(`🔍 Found poll ID: ${pollId}, data exists: ${!!pollData}`);
            }
            
            // If we can't find by ID, try to match by timing (last few minutes)
            if (!pollData) {
                const now = Date.now();
                for (const [id, data] of this.activePollData.entries()) {
                    if (now - data.timestamp < 10 * 60 * 1000) { // Within 10 minutes
                        pollData = data;
                        pollId = id;
                        console.log(`🔍 Found poll by timing: ${id}`);
                        break;
                    }
                }
            }
            
            if (!pollData) {
                console.log(`❌ No matching poll data found for response`);
                return false;
            }
            
            // Extract the vote
            let selectedAnswer = null;
            
            // Try different ways to get the selected option
            if (message.selectedButtonId) {
                selectedAnswer = message.selectedButtonId;
            } else if (message.body) {
                // Sometimes the answer is in the body
                const bodyLower = message.body.toLowerCase();
                if (bodyLower.includes('yes') || bodyLower.includes('✓')) {
                    selectedAnswer = 'Yes';
                } else if (bodyLower.includes('no') || bodyLower.includes('✗')) {
                    selectedAnswer = 'No';
                } else if (bodyLower.includes('cancel')) {
                    selectedAnswer = 'Cancelled';
                }
            }
            
            console.log(`📊 Extracted answer: ${selectedAnswer}`);
            
            if (!selectedAnswer) {
                console.log(`❌ Could not extract poll answer from response`);
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
                    console.log(`❌ Unknown poll answer: ${selectedAnswer}`);
                    return false;
            }
            
            // Record the attendance
            const recordDate = new Date(pollData.date);
            this.attendanceService.recordAttendance(pollData.subject, attendanceStatus, recordDate);
            
            // Send confirmation to owner
            const chat = await message.getChat();
            const confirmMessage = `✅ Recorded: ${pollData.subject} (${pollData.time}) - ${attendanceStatus.toUpperCase()}`;
            await chat.sendMessage(confirmMessage);
            
            // Remove from active polls
            this.activePollData.delete(pollId);
            
            console.log(`✅ Successfully processed attendance: ${pollData.subject} - ${attendanceStatus}`);
            return true;
            
        } catch (error) {
            console.error('❌ Error handling poll vote:', error);
            return false;
        }
    }

    // Get active poll IDs for debugging
    getActivePolls() {
        return Array.from(this.activePollData.keys());
    }
}

module.exports = AttendanceSchedulerService; 
const Command = require('../base/command');
const AttendanceService = require('../../services/attendance/attendance-service');

class AttendanceCommand extends Command {
    constructor() {
        super('attendance', 'View and manage your attendance statistics', {
            ownerOnly: true,
            category: 'Owner'
        });
        this.attendanceService = new AttendanceService();
    }

    async execute(message, args, context) {
        try {
            const subcommand = args[0]?.toLowerCase();

            switch (subcommand) {
                case 'stats':
                case undefined: // Default action
                    await this.showStats(message);
                    break;
                
                case 'add':
                    await this.addAttendance(message, args.slice(1));
                    break;
                
                case 'history':
                    await this.showHistory(message, args[1]);
                    break;
                
                case 'timetable':
                    await this.showTimetable(message);
                    break;
                
                case 'manual':
                    // Trigger manual attendance poll for today
                    if (context.attendanceScheduler) {
                        await context.attendanceScheduler.triggerManualPoll(message);
                    } else {
                        await message.reply('❌ Attendance scheduler not available.');
                    }
                    break;
                
                default:
                    await this.showHelp(message);
                    break;
            }

        } catch (error) {
            console.error('❌ Error in attendance command:', error);
            await message.reply('❌ Error processing attendance command. Please try again.');
        }
    }

    async showStats(message) {
        try {
            const statsMessage = this.attendanceService.getFormattedStatsMessage();
            await message.reply(statsMessage);
        } catch (error) {
            console.error('❌ Error showing attendance stats:', error);
            await message.reply('❌ Error retrieving attendance statistics.');
        }
    }

    async addAttendance(message, args) {
        if (args.length < 2) {
            await message.reply('Usage: ?attendance add <subject> <status>\nExample: ?attendance add OE attended\nStatus options: attended, absent, cancelled');
            return;
        }

        const subject = args[0].toUpperCase();
        const status = args[1].toLowerCase();

        // Validate subject
        const validSubjects = ['OE', 'DL', 'HCI', 'CC'];
        if (!validSubjects.includes(subject)) {
            await message.reply(`❌ Invalid subject. Valid subjects: ${validSubjects.join(', ')}`);
            return;
        }

        // Validate status
        const validStatuses = ['attended', 'absent', 'cancelled'];
        if (!validStatuses.includes(status)) {
            await message.reply(`❌ Invalid status. Valid statuses: ${validStatuses.join(', ')}`);
            return;
        }

        // Record attendance
        const success = this.attendanceService.recordAttendance(subject, status);
        
        if (success) {
            await message.reply(`✅ Recorded: ${subject} - ${status.toUpperCase()}`);
        } else {
            await message.reply('❌ Failed to record attendance.');
        }
    }

    async showHistory(message, subjectFilter) {
        try {
            const attendanceData = this.attendanceService.getAttendanceData();
            let history = [...attendanceData.history];

            // Filter out poll sent markers
            history = history.filter(entry => entry.subject !== '_POLL_SENT_');

            // Filter by subject if provided
            if (subjectFilter) {
                const subject = subjectFilter.toUpperCase();
                history = history.filter(entry => entry.subject === subject);
            }

            // Sort by date (most recent first)
            history.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Take last 15 entries to avoid huge messages
            const recentHistory = history.slice(0, 15);

            if (recentHistory.length === 0) {
                await message.reply('📝 No attendance history found.');
                return;
            }

            let historyMessage = `📝 *Attendance History* ${subjectFilter ? `(${subjectFilter.toUpperCase()})` : ''}\n\n`;

            recentHistory.forEach((entry, index) => {
                const statusEmoji = this.getStatusEmoji(entry.status);
                const date = new Date(entry.date).toLocaleDateString('en-GB');
                historyMessage += `${index + 1}. ${date} - ${entry.subject} ${statusEmoji} ${entry.status.toUpperCase()}\n`;
            });

            if (history.length > 15) {
                historyMessage += `\n... and ${history.length - 15} more entries`;
            }

            await message.reply(historyMessage);

        } catch (error) {
            console.error('❌ Error showing attendance history:', error);
            await message.reply('❌ Error retrieving attendance history.');
        }
    }

    async showTimetable(message) {
        try {
            const timetable = this.attendanceService.getTimetable();
            let timetableMessage = '📅 *Weekly Timetable*\n\n';

            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

            days.forEach(day => {
                timetableMessage += `*${day}*\n`;
                const classes = timetable[day] || [];
                
                if (classes.length === 0) {
                    timetableMessage += '   No classes\n\n';
                } else {
                    classes.forEach(classInfo => {
                        timetableMessage += `   ${classInfo.time}: ${classInfo.subject}\n`;
                    });
                    timetableMessage += '\n';
                }
            });

            await message.reply(timetableMessage);

        } catch (error) {
            console.error('❌ Error showing timetable:', error);
            await message.reply('❌ Error retrieving timetable.');
        }
    }

    async showHelp(message) {
        const helpMessage = `📊 *Attendance Command Help*

*Usage:*
\`?attendance\` or \`?attendance stats\` - Show attendance statistics
\`?attendance add <subject> <status>\` - Manually add attendance
\`?attendance history [subject]\` - Show attendance history
\`?attendance timetable\` - Show weekly timetable
\`?attendance manual\` - Trigger manual attendance poll

*Subjects:* OE, DL, HCI, CC
*Status options:* attended, absent, cancelled

*Examples:*
\`?attendance\` - View current stats
\`?attendance add OE attended\` - Mark OE class as attended
\`?attendance history CC\` - Show CC attendance history
\`?attendance manual\` - Send today's attendance polls now`;

        await message.reply(helpMessage);
    }

    getStatusEmoji(status) {
        switch (status) {
            case 'attended': return '✅';
            case 'absent': return '❌';
            case 'cancelled': return '⚠️';
            default: return '📝';
        }
    }

    getHelpText() {
        return `${this.getUsage()} [stats|add|history|timetable|manual] - Manage attendance tracking (Owner only)`;
    }
}

module.exports = AttendanceCommand; 
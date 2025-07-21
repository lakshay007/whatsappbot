const path = require('path');
const fs = require('fs');
const FileUtils = require('../../utils/file-utils');

class AttendanceService {
    constructor() {
        this.attendanceDir = path.join(__dirname, '../../../documents/attendance');
        this.timetableFile = path.join(this.attendanceDir, 'timetable.json');
        this.attendanceFile = path.join(this.attendanceDir, 'attendance.json');
        
        // Ensure attendance directory exists
        FileUtils.ensureDirectoryExists(this.attendanceDir);
        
        // Initialize data files
        this.initializeDataFiles();
    }

    initializeDataFiles() {
        // Initialize timetable if it doesn't exist
        if (!FileUtils.fileExists(this.timetableFile)) {
            const timetable = {
                Monday: [
                    { time: '13:00-14:00', subject: 'OE' },
                    { time: '14:00-15:00', subject: 'DL' },
                    { time: '15:30-16:30', subject: 'HCI' }
                ],
                Tuesday: [
                    { time: '08:00-09:00', subject: 'CC' },
                    { time: '11:30-12:30', subject: 'OE' }
                ],
                Wednesday: [
                    { time: '13:00-14:00', subject: 'CC' },
                    { time: '14:00-15:00', subject: 'HCI' },
                    { time: '15:30-16:30', subject: 'DL' }
                ],
                Thursday: [
                    { time: '09:00-10:00', subject: 'OE' },
                    { time: '11:30-12:30', subject: 'HCI' }
                ],
                Friday: [], // No classes
                Saturday: [
                    { time: '09:00-10:00', subject: 'DL' },
                    { time: '10:30-11:30', subject: 'CC' }
                ],
                Sunday: [] // No classes
            };
            
            fs.writeFileSync(this.timetableFile, JSON.stringify(timetable, null, 2));
            console.log('✅ Created timetable.json');
        }
        
        // Initialize attendance data if it doesn't exist
        if (!FileUtils.fileExists(this.attendanceFile)) {
            const attendanceData = {
                subjects: {
                    'OE': { attended: 0, total: 0, maxClasses: 36 },
                    'DL': { attended: 0, total: 0, maxClasses: 36 },
                    'HCI': { attended: 0, total: 0, maxClasses: 36 },
                    'CC': { attended: 0, total: 0, maxClasses: 36 }
                },
                history: [] // Array of { date, subject, time, status: 'attended'|'absent'|'cancelled' }
            };
            
            fs.writeFileSync(this.attendanceFile, JSON.stringify(attendanceData, null, 2));
            console.log('✅ Created attendance.json');
        }
    }

    getTimetable() {
        try {
            const data = fs.readFileSync(this.timetableFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('❌ Error reading timetable:', error);
            return {};
        }
    }

    getAttendanceData() {
        try {
            const data = fs.readFileSync(this.attendanceFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('❌ Error reading attendance data:', error);
            return { subjects: {}, history: [] };
        }
    }

    saveAttendanceData(data) {
        try {
            fs.writeFileSync(this.attendanceFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('❌ Error saving attendance data:', error);
            return false;
        }
    }

    getClassesForDay(dayName) {
        const timetable = this.getTimetable();
        return timetable[dayName] || [];
    }

    getDayName(date = new Date()) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[date.getDay()];
    }

    shouldSendPollToday(date = new Date()) {
        const dayName = this.getDayName(date);
        // Don't send on Friday or Sunday
        if (dayName === 'Friday' || dayName === 'Sunday') {
            return false;
        }
        
        // Check if there are classes today
        const classes = this.getClassesForDay(dayName);
        return classes.length > 0;
    }

    getTodaysClasses(date = new Date()) {
        const dayName = this.getDayName(date);
        return this.getClassesForDay(dayName);
    }

    recordAttendance(subject, status, date = new Date()) {
        const attendanceData = this.getAttendanceData();
        
        // Initialize subject if it doesn't exist
        if (!attendanceData.subjects[subject]) {
            attendanceData.subjects[subject] = { attended: 0, total: 0, maxClasses: 36 };
        }
        
        // Update totals
        attendanceData.subjects[subject].total += 1;
        if (status === 'attended') {
            attendanceData.subjects[subject].attended += 1;
        }
        
        // Add to history
        attendanceData.history.push({
            date: date.toISOString().split('T')[0], // YYYY-MM-DD format
            subject: subject,
            status: status,
            timestamp: Date.now()
        });
        
        // Save data
        this.saveAttendanceData(attendanceData);
        
        console.log(`📊 Recorded attendance: ${subject} - ${status}`);
        return true;
    }

    getAttendanceStats() {
        const attendanceData = this.getAttendanceData();
        const stats = {};
        
        for (const [subject, data] of Object.entries(attendanceData.subjects)) {
            const percentage = data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0;
            const remaining = Math.max(0, data.maxClasses - data.total);
            
            stats[subject] = {
                attended: data.attended,
                total: data.total,
                maxClasses: data.maxClasses,
                percentage: percentage,
                remaining: remaining
            };
        }
        
        return stats;
    }

    getFormattedStatsMessage() {
        const stats = this.getAttendanceStats();
        let message = '📊 *Attendance Statistics*\n\n';
        
        for (const [subject, data] of Object.entries(stats)) {
            const progressBar = this.createProgressBar(data.percentage);
            message += `🔹 *${subject}*\n`;
            message += `   ${data.attended}/${data.total} classes (${data.percentage}%) ${progressBar}\n`;
            message += `   Remaining: ${data.remaining} classes\n\n`;
        }
        
        // Overall statistics
        let totalAttended = 0;
        let totalClasses = 0;
        Object.values(stats).forEach(data => {
            totalAttended += data.attended;
            totalClasses += data.total;
        });
        
        const overallPercentage = totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 100) : 0;
        message += `📈 *Overall: ${totalAttended}/${totalClasses} classes (${overallPercentage}%)*`;
        
        return message;
    }

    createProgressBar(percentage) {
        const filledBars = Math.round(percentage / 10);
        const emptyBars = 10 - filledBars;
        return '▓'.repeat(filledBars) + '░'.repeat(emptyBars);
    }

    // Check if poll was already sent today
    wasPollSentToday(date = new Date()) {
        const today = date.toISOString().split('T')[0];
        const attendanceData = this.getAttendanceData();
        
        // Check if there's any poll activity today
        return attendanceData.history.some(entry => 
            entry.date === today && entry.timestamp
        );
    }

    // Mark that poll was sent today (to avoid duplicate sends)
    markPollSent(date = new Date()) {
        const attendanceData = this.getAttendanceData();
        const today = date.toISOString().split('T')[0];
        
        // Add a marker entry
        attendanceData.history.push({
            date: today,
            subject: '_POLL_SENT_',
            status: 'sent',
            timestamp: Date.now()
        });
        
        this.saveAttendanceData(attendanceData);
    }
}

module.exports = AttendanceService; 
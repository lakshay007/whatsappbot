const fs = require('fs');
const path = require('path');

class SindhiMenuService {
    constructor() {
        this.menus = this.loadMenus();
        this.mealTimes = {
            lunch: { start: '11:30', end: '14:15' },
            dinner: { start: '19:00', end: '21:30' }
        };
        
        // Reference date when menu1 starts (update this when the cycle changes)
        // Format: YYYY-MM-DD (Monday of the week when menu1 is active)
        this.menu1StartDate = '2025-11-11'; // Nov 11, 2025 is a Tuesday - this week is menu1
    }

    /**
     * Load all menu JSON files
     */
    loadMenus() {
        const menuDir = __dirname;
        const menus = {};
        
        try {
            for (let i = 1; i <= 4; i++) {
                const menuPath = path.join(menuDir, `menu${i}.json`);
                const menuData = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
                menus[i] = menuData;
                console.log(`✅ Loaded menu${i}.json`);
            }
        } catch (error) {
            console.error('❌ Error loading menu files:', error);
            throw new Error('Failed to load menu files');
        }
        
        return menus;
    }

    /**
     * Calculate which menu to use based on weeks elapsed from menu1 start date
     * Cycles through menu1 -> menu2 -> menu3 -> menu4 -> menu1...
     */
    getCurrentMenuNumber(date = null) {
        if (!date) {
            date = this.getTodayIST();
        }
        
        // Calculate number of weeks elapsed from the reference date
        const referenceDate = new Date(this.menu1StartDate);
        const currentDate = new Date(date);
        
        // Get the start of the week (Monday) for both dates
        const refMonday = this.getMondayOfWeek(referenceDate);
        const currentMonday = this.getMondayOfWeek(currentDate);
        
        // Calculate weeks difference
        const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksDiff = Math.floor((currentMonday - refMonday) / millisecondsPerWeek);
        
        // Cycle through menus 1-4
        const menuNumber = ((weeksDiff % 4) + 4) % 4 + 1; // Handle negative numbers
        
        console.log(`📅 ${weeksDiff} weeks from reference → Using menu${menuNumber}`);
        return menuNumber;
    }

    /**
     * Get the Monday of the week for a given date
     */
    getMondayOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        return new Date(d.setDate(diff));
    }

    /**
     * Get menu for a specific date and meal
     * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to today IST)
     * @param {string} meal - "lunch" or "dinner" (optional, returns both if not specified)
     */
    async getMenu(date = null, meal = null) {
        try {
            // If no date specified, use today's date in IST
            if (!date) {
                date = this.getTodayIST();
            }
            
            // Check if it's Sunday (Sindhi is closed on Sundays)
            const dateObj = new Date(date);
            const dayOfWeek = dateObj.getDay();
            
            if (dayOfWeek === 0) {
                return {
                    success: false,
                    error: 'closed',
                    message: 'Sindhi Mess is closed on Sundays'
                };
            }
            
            // Get day name
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayName = dayNames[dayOfWeek];
            
            // Get current menu number based on week
            const menuNumber = this.getCurrentMenuNumber(date);
            const menuData = this.menus[menuNumber];
            
            if (!menuData || !menuData.menu[dayName]) {
                return {
                    success: false,
                    error: 'no_menu',
                    message: `No menu found for ${dayName}`
                };
            }
            
            const dayMenu = menuData.menu[dayName];
            
            // If meal specified, return only that meal
            if (meal) {
                const mealLower = meal.toLowerCase();
                const mealData = dayMenu[mealLower];
                
                if (!mealData) {
                    return {
                        success: false,
                        error: 'invalid_meal',
                        message: `Invalid meal type: ${meal}. Available: lunch, dinner`
                    };
                }
                
                return {
                    success: true,
                    date: date,
                    day: dayName,
                    menuNumber: menuNumber,
                    meal: mealLower,
                    mealData: mealData
                };
            }
            
            // Return full day menu
            return {
                success: true,
                date: date,
                day: dayName,
                menuNumber: menuNumber,
                meals: {
                    lunch: dayMenu.lunch,
                    dinner: dayMenu.dinner
                }
            };
            
        } catch (error) {
            console.error('❌ Error getting menu:', error);
            return {
                success: false,
                error: 'fetch_failed',
                message: 'Failed to load menu data'
            };
        }
    }

    /**
     * Get today's date in IST timezone (YYYY-MM-DD format)
     */
    getTodayIST() {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istDate = new Date(now.getTime() + istOffset);
        
        const year = istDate.getUTCFullYear();
        const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(istDate.getUTCDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }

    /**
     * Format menu data for WhatsApp message
     */
    formatMenuForMessage(menuResult) {
        if (!menuResult.success) {
            return menuResult.message || 'Could not fetch menu';
        }
        
        // Format the actual requested date nicely (e.g., "Nov 12")
        const requestedDate = new Date(menuResult.date);
        const dateOptions = { month: 'short', day: 'numeric' };
        const formattedDate = requestedDate.toLocaleDateString('en-US', dateOptions);
        
        let message = `*Sindhi Mess Menu*\n`;
        message += `${menuResult.day}, ${formattedDate}\n\n`;
        
        // If single meal
        if (menuResult.meal && menuResult.mealData) {
            message += this.formatMeal(menuResult.meal, menuResult.mealData);
        } 
        // If full day
        else if (menuResult.meals) {
            message += this.formatMeal('lunch', menuResult.meals.lunch);
            message += '\n\n';
            message += this.formatMeal('dinner', menuResult.meals.dinner);
        }
        
        return message.trim();
    }

    /**
     * Format a single meal section
     */
    formatMeal(mealName, mealData) {
        const times = this.mealTimes[mealName.toLowerCase()];
        let text = `*${mealName.toUpperCase()}* (${times.start} - ${times.end})\n`;
        
        // Add veg
        if (mealData.veg) {
            text += `*Veg:* ${mealData.veg}\n`;
        }
        
        // Add veg sides
        if (mealData.vegSides && mealData.vegSides.length > 0) {
            text += `*Veg Sides:* ${mealData.vegSides.join(', ')}\n`;
        }
        
        // Add non-veg if available
        if (mealData.nonVeg) {
            text += `*Non-Veg:* ${mealData.nonVeg}\n`;
        }
        
        return text;
    }

    /**
     * Parse natural language date (today, tomorrow, monday, etc.)
     */
    parseNaturalDate(dateStr) {
        const lowerDate = dateStr.toLowerCase().trim();
        const today = this.getTodayIST();
        const todayDate = new Date(today);
        
        if (lowerDate === 'today') {
            return today;
        }
        
        if (lowerDate === 'tomorrow') {
            const tomorrow = new Date(todayDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return this.formatDateISO(tomorrow);
        }
        
        // Day names
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayIndex = days.indexOf(lowerDate);
        
        if (dayIndex !== -1) {
            const currentDay = todayDate.getDay();
            let daysToAdd = dayIndex - currentDay;
            
            // If the day has passed this week, get next week's date
            if (daysToAdd <= 0) {
                daysToAdd += 7;
            }
            
            const targetDate = new Date(todayDate);
            targetDate.setDate(targetDate.getDate() + daysToAdd);
            return this.formatDateISO(targetDate);
        }
        
        // If it's already in YYYY-MM-DD format, return as is
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return dateStr;
        }
        
        // Default to today
        return today;
    }

    /**
     * Format Date object to YYYY-MM-DD
     */
    formatDateISO(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Reload menus (useful if JSON files are updated)
     */
    reloadMenus() {
        this.menus = this.loadMenus();
        console.log('🔄 Menus reloaded');
    }
}

module.exports = SindhiMenuService;

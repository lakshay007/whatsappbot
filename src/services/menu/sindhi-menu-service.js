const https = require('https');

class SindhiMenuService {
    constructor() {
        this.apiUrl = 'https://sindhi.coolstuff.work/api/menu';
        this.cache = null;
        this.cacheTimestamp = null;
        this.cacheDuration = 60 * 60 * 1000; // 1 hour cache
    }

    /**
     * Fetch menu from API with caching
     */
    async fetchMenu() {
        // Return cached data if still valid
        if (this.cache && this.cacheTimestamp && (Date.now() - this.cacheTimestamp < this.cacheDuration)) {
            console.log('📋 Using cached Sindhi menu data');
            return this.cache;
        }

        try {
            console.log('🌐 Fetching fresh Sindhi menu data...');
            const data = await this.makeHttpRequest(this.apiUrl);
            const menuData = JSON.parse(data);
            
            // Cache the data
            this.cache = menuData;
            this.cacheTimestamp = Date.now();
            
            console.log(`✅ Sindhi menu fetched successfully (Week: ${menuData.week})`);
            return menuData;
        } catch (error) {
            console.error('❌ Error fetching Sindhi menu:', error);
            
            // Return cached data if available, even if expired
            if (this.cache) {
                console.log('⚠️ Using expired cache due to fetch error');
                return this.cache;
            }
            
            throw new Error('Failed to fetch Sindhi menu and no cache available');
        }
    }

    /**
     * Make HTTPS request
     */
    makeHttpRequest(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    }
                });
            }).on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Get menu for a specific date and meal
     * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to today IST)
     * @param {string} meal - "lunch" or "dinner" (optional, returns both if not specified)
     */
    async getMenu(date = null, meal = null) {
        try {
            const menuData = await this.fetchMenu();
            
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
            
            // Sindhi has a fixed weekly menu, so we need to find the menu by day of week
            // Get the day name for the requested date
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const requestedDay = dayNames[dayOfWeek];
            
            // Find any menu entry that matches this day of the week
            let dayMenu = null;
            for (const [menuDate, menuEntry] of Object.entries(menuData.menu)) {
                if (menuEntry.day === requestedDay) {
                    dayMenu = menuEntry;
                    break;
                }
            }
            
            if (!dayMenu) {
                return {
                    success: false,
                    error: 'no_menu',
                    message: `No menu found for ${requestedDay}. The menu might only be available for weekdays.`
                };
            }
            
            // If meal specified, return only that meal
            if (meal) {
                const mealLower = meal.toLowerCase();
                const mealData = dayMenu.meals[mealLower];
                
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
                    day: dayMenu.day,
                    displayDate: dayMenu.displayDate,
                    meal: mealLower,
                    mealData: mealData
                };
            }
            
            // Return full day menu
            return {
                success: true,
                date: date,
                day: dayMenu.day,
                displayDate: dayMenu.displayDate,
                meals: dayMenu.meals
            };
            
        } catch (error) {
            console.error('❌ Error getting menu:', error);
            return {
                success: false,
                error: 'fetch_failed',
                message: 'Failed to fetch menu from Sindhi Mess API'
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
        
        let message = `*Sindhi Mess Menu*\n`;
        message += `${menuResult.day}, ${menuResult.displayDate}\n\n`;
        
        // If single meal
        if (menuResult.meal && menuResult.mealData) {
            message += this.formatMeal(menuResult.mealData);
        } 
        // If full day
        else if (menuResult.meals) {
            message += this.formatMeal(menuResult.meals.lunch);
            message += '\n\n';
            message += this.formatMeal(menuResult.meals.dinner);
        }
        
        return message.trim();
    }

    /**
     * Format a single meal section
     */
    formatMeal(mealData) {
        let text = `*${mealData.name.toUpperCase()}* (${mealData.startTime} - ${mealData.endTime})\n`;
        
        // Group by sections
        if (mealData.sections && mealData.sections.length > 0) {
            mealData.sections.forEach(section => {
                if (section.items.length > 0) {
                    text += `*${section.title}:* `;
                    text += section.items.join(', ') + '\n';
                }
            });
        } else {
            // Fallback to items list if no sections
            text += mealData.items.join(', ');
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
     * Clear cache (useful for testing)
     */
    clearCache() {
        this.cache = null;
        this.cacheTimestamp = null;
        console.log('🗑️ Sindhi menu cache cleared');
    }
}

module.exports = SindhiMenuService;


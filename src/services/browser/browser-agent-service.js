const config = require('../../config');
const path = require('path');

class BrowserAgentService {
    constructor() {
        this.constants = config.getConstants();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('🌐 Initializing browser agent service...');
            
            // Validate required environment variables (use same as bbheadless)
            if (!process.env.GOOGLE_API_KEY) {
                throw new Error('GOOGLE_API_KEY is required for browser agent');
            }
            
            if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
                throw new Error('BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required for browser agent');
            }

            this.isInitialized = true;
            console.log('✅ Browser agent service initialized');
            
        } catch (error) {
            console.error('❌ Error initializing browser agent service:', error);
            throw error;
        }
    }

    async browse(instruction, maxSteps = 20) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🔍 Executing browse instruction: "${instruction}"`);
            
            // Use dynamic import to load the ES module executor
            const executorPath = path.join(__dirname, 'browser-executor.mjs');
            const { executeBrowseInstruction } = await import(executorPath);
            
            const result = await executeBrowseInstruction(instruction, maxSteps);
            
            return result;
            
        } catch (error) {
            console.error('❌ Error executing browse instruction:', error);
            
            return {
                success: false,
                message: `Sorry, I encountered an error while browsing: ${error.message}`,
                error: error.message
            };
        }
    }

    async close() {
        // Each browse execution handles its own cleanup
        this.isInitialized = false;
        console.log('🔒 Browser agent service closed');
    }

    getStatus() {
        return {
            isInitialized: this.isInitialized,
            hasValidConfig: !!(process.env.GOOGLE_API_KEY && process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID)
        };
    }
}

module.exports = BrowserAgentService; 
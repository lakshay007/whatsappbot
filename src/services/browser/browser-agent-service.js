const config = require('../../config');
const path = require('path');

class BrowserAgentService {
    constructor() {
        this.constants = config.getConstants();
        this.browserWrapper = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('🌐 Initializing browser agent service...');
            
            // Validate required environment variables
            if (!process.env.GEMINI_API_KEY) {
                throw new Error('GEMINI_API_KEY is required for browser agent');
            }
            
            if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
                throw new Error('BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required for browser agent');
            }

            // Use dynamic import to load the ES module wrapper
            const wrapperPath = path.join(__dirname, 'browser-wrapper.mjs');
            const { default: BrowserWrapper } = await import(wrapperPath);
            
            this.browserWrapper = new BrowserWrapper();
            await this.browserWrapper.initialize();
            
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
            
            const result = await this.browserWrapper.browse(instruction, maxSteps);
            
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
        if (this.browserWrapper) {
            try {
                await this.browserWrapper.close();
                console.log('🔒 Browser agent service closed');
            } catch (error) {
                console.error('❌ Error closing browser agent service:', error);
            }
        }
        this.isInitialized = false;
    }

    getStatus() {
        if (this.browserWrapper) {
            return this.browserWrapper.getStatus();
        }
        return {
            isInitialized: this.isInitialized,
            hasValidConfig: !!(process.env.GEMINI_API_KEY && process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID)
        };
    }
}

module.exports = BrowserAgentService; 
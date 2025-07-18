const { Stagehand } = require("@browserbasehq/stagehand");
const config = require('../../config');

class BrowserAgentService {
    constructor() {
        this.constants = config.getConstants();
        this.stagehand = null;
        this.isInitialized = false;
        
        // Stagehand configuration
        this.stagehandConfig = {
            verbose: 1,
            domSettleTimeoutMs: 30000,
            modelName: "google/gemini-2.5-flash-lite-preview-06-17",
            modelClientOptions: {
                apiKey: process.env.GEMINI_API_KEY,
            },
            env: "BROWSERBASE",
            apiKey: process.env.BROWSERBASE_API_KEY,
            projectId: process.env.BROWSERBASE_PROJECT_ID,
            browserbaseSessionID: undefined,
            browserbaseSessionCreateParams: {
                projectId: process.env.BROWSERBASE_PROJECT_ID,
                browserSettings: {
                    blockAds: true,
                    viewport: {
                        width: 1024,
                        height: 768,
                    },
                },
            },
            localBrowserLaunchOptions: {
                viewport: {
                    width: 1024,
                    height: 768,
                },
            },
        };
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('🌐 Initializing browser agent service...');
            
            // Validate required environment variables
            if (!process.env.GEMINI_API_KEY) {
                throw new Error('GOOGLE_API_KEY is required for browser agent');
            }
            
            if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
                throw new Error('BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required for browser agent');
            }

            this.stagehand = new Stagehand(this.stagehandConfig);
            await this.stagehand.init();
            
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
            
            const agent = this.stagehand.agent();
            
            const result = await agent.execute({
                instruction: instruction,
                maxSteps: maxSteps,
            });

            console.log('✅ Browse instruction completed');
            console.log('📋 Result:', result.message);
            
            return {
                success: true,
                message: result.message,
                data: result
            };
            
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
        if (this.stagehand) {
            try {
                await this.stagehand.close();
                console.log('🔒 Browser agent service closed');
            } catch (error) {
                console.error('❌ Error closing browser agent service:', error);
            }
        }
        this.isInitialized = false;
    }

    getStatus() {
        return {
            isInitialized: this.isInitialized,
            hasValidConfig: !!(process.env.GEMINI_API_KEY && process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID)
        };
    }
}

module.exports = BrowserAgentService; 
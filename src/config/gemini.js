const { GoogleGenerativeAI } = require('@google/generative-ai');
const CONSTANTS = require('./constants');

class GeminiConfig {
    constructor() {
        this.initializeClients();
        this.setupModelRotation();
    }

    initializeClients() {
        // Initialize Gemini AI with multiple API keys
        this.genAI1 = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.genAI2 = process.env.GEMINI_API_KEY2 ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY2) : null;
        this.genAI3 = process.env.GEMINI_API_KEY3 ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY3) : null;
        
        // Count available keys
        this.keyCount = 1 + (this.genAI2 ? 1 : 0) + (this.genAI3 ? 1 : 0);
    }

    setupModelRotation() {
        // Model and API key rotation setup
        this.modelRotation = [
            { model: CONSTANTS.GEMINI_MODELS[0], client: this.genAI1, keyName: 'KEY1' },
            { model: CONSTANTS.GEMINI_MODELS[1], client: this.genAI1, keyName: 'KEY1' }
        ];

        // Add second API key models if available
        if (this.genAI2) {
            this.modelRotation.push(
                { model: CONSTANTS.GEMINI_MODELS[0], client: this.genAI2, keyName: 'KEY2' },
                { model: CONSTANTS.GEMINI_MODELS[1], client: this.genAI2, keyName: 'KEY2' }
            );
        }

        // Add third API key models if available
        if (this.genAI3) {
            this.modelRotation.push(
                { model: CONSTANTS.GEMINI_MODELS[0], client: this.genAI3, keyName: 'KEY3' },
                { model: CONSTANTS.GEMINI_MODELS[1], client: this.genAI3, keyName: 'KEY3' }
            );
        }

        this.totalCombinations = this.modelRotation.length;
        this.currentModelIndex = 0;
    }

    logConfiguration() {
        console.log(`🔑 API key rotation enabled - ${this.keyCount} keys, ${this.totalCombinations} model combinations available`);
        console.log(`📋 Models: ${CONSTANTS.GEMINI_MODELS.join(', ')} (1.5-flash removed)`);

        if (this.genAI2 && this.genAI3) {
            console.log('🚀 Triple API key mode activated!');
        } else if (this.genAI2) {
            console.log('🔄 Dual API key mode activated');
        } else {
            console.log('⚡ Single API key mode');
        }
    }

    getModelRotation() {
        return this.modelRotation;
    }

    getKeyCount() {
        return this.keyCount;
    }

    getTotalCombinations() {
        return this.totalCombinations;
    }

    // Google grounding configuration
    getGroundingTool() {
        return {
            googleSearch: {},
            urlContext: {}
        };
    }
}

module.exports = GeminiConfig; 
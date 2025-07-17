require('dotenv').config();

const CONSTANTS = require('./constants');
const GeminiConfig = require('./gemini');
const WhatsAppConfig = require('./whatsapp');

class Config {
    constructor() {
        this.constants = CONSTANTS;
        this.geminiConfig = new GeminiConfig();
        this.whatsappConfig = new WhatsAppConfig();
        
        // Initialize and log configuration
        this.geminiConfig.logConfiguration();
    }

    getConstants() {
        return this.constants;
    }

    getGeminiConfig() {
        return this.geminiConfig;
    }

    getWhatsAppConfig() {
        return this.whatsappConfig;
    }
}

module.exports = new Config(); 
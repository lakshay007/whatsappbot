const { Client, LocalAuth } = require('whatsapp-web.js');

class WhatsAppConfig {
    constructor() {
        this.clientConfig = this.getClientConfig();
    }

    getClientConfig() {
        return {
            authStrategy: new LocalAuth(),
            puppeteer: {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-blink-features=AutomationControlled'
                ],
                headless: true,
                timeout: 0 // Disable timeout
            },
            // Add a longer timeout for the client itself
            authTimeoutMs: 600000 // 10 minutes
        };
    }

    createClient() {
        return new Client(this.clientConfig);
    }
}

module.exports = WhatsAppConfig; 
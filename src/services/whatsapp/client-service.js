const qrcode = require('qrcode-terminal');
const config = require('../../config');

class WhatsAppClientService {
    constructor() {
        this.constants = config.getConstants();
        this.whatsappConfig = config.getWhatsAppConfig();
        this.client = null;
        this.isReady = false;
        this.reconnectAttempts = 0;
        this.isRestarting = false;
        
        // Health monitoring callbacks
        this.heartbeatCallback = null;
        this.restartCallback = null;
        
        // Event handlers
        this.eventHandlers = {
            ready: null,
            qr: null,
            authenticated: null,
            auth_failure: null,
            disconnected: null,
            change_state: null,
            message_create: null,
            vote_update: null
        };
    }

    createClient() {
        this.client = this.whatsappConfig.createClient();
        this.setupEventHandlers();
        return this.client;
    }

    setupEventHandlers() {
        this.client.on('ready', () => {
            console.log('🤖 WhatsApp AI Bot is ready!');
            console.log('✅ Listening for mentions @chotu...');
            
            this.isReady = true;
            this.updateHeartbeat();
            this.reconnectAttempts = 0; // Reset on successful connection
            
            if (this.eventHandlers.ready) {
                this.eventHandlers.ready();
            }
        });

        this.client.on('qr', qr => {
            console.log('📱 Scan the QR code below to authenticate:');
            qrcode.generate(qr, {small: true});
            this.updateHeartbeat();
            
            if (this.eventHandlers.qr) {
                this.eventHandlers.qr(qr);
            }
        });

        this.client.on('authenticated', () => {
            console.log('✅ Authentication successful!');
            this.updateHeartbeat();
            
            if (this.eventHandlers.authenticated) {
                this.eventHandlers.authenticated();
            }
        });

        this.client.on('auth_failure', (msg) => {
            console.error('❌ Authentication failed:', msg);
            this.isReady = false;
            
            if (this.eventHandlers.auth_failure) {
                this.eventHandlers.auth_failure(msg);
            }
            
            this.triggerRestart();
        });

        this.client.on('disconnected', (reason) => {
            console.log('📱 Client disconnected:', reason);
            this.isReady = false;
            
            if (this.eventHandlers.disconnected) {
                this.eventHandlers.disconnected(reason);
            }
            
            // Don't restart on logout (user initiated)
            if (reason === 'LOGOUT' || reason === 'NAVIGATION') {
                console.log('🛑 Manual logout detected - not restarting');
                process.exit(0);
            } else {
                console.log('🔄 Unexpected disconnection - initiating restart');
                this.triggerRestart();
            }
        });

        this.client.on('change_state', (state) => {
            console.log('🔄 State changed:', state);
            this.updateHeartbeat();
            
            if (state === 'CONNECTED') {
                this.isReady = true;
            } else if (state === 'TIMEOUT' || state === 'CONFLICT') {
                console.error('❌ Connection issue detected:', state);
                this.isReady = false;
                this.triggerRestart();
            }
            
            if (this.eventHandlers.change_state) {
                this.eventHandlers.change_state(state);
            }
        });

        this.client.on('message_create', async (message) => {
            this.updateHeartbeat();
            
            if (this.eventHandlers.message_create) {
                await this.eventHandlers.message_create(message);
            }
        });

        this.client.on('vote_update', async (pollVote) => {
            this.updateHeartbeat();
            console.log('📊 Vote update received:', JSON.stringify(pollVote, null, 2));
            
            if (this.eventHandlers.vote_update) {
                await this.eventHandlers.vote_update(pollVote);
            }
        });
    }

    // Event handler registration
    onReady(callback) {
        this.eventHandlers.ready = callback;
    }

    onQR(callback) {
        this.eventHandlers.qr = callback;
    }

    onAuthenticated(callback) {
        this.eventHandlers.authenticated = callback;
    }

    onAuthFailure(callback) {
        this.eventHandlers.auth_failure = callback;
    }

    onDisconnected(callback) {
        this.eventHandlers.disconnected = callback;
    }

    onStateChange(callback) {
        this.eventHandlers.change_state = callback;
    }

    onMessageCreate(callback) {
        this.eventHandlers.message_create = callback;
    }

    onVoteUpdate(callback) {
        this.eventHandlers.vote_update = callback;
    }

    // Health monitoring integration
    setHeartbeatCallback(callback) {
        this.heartbeatCallback = callback;
    }

    setRestartCallback(callback) {
        this.restartCallback = callback;
    }

    updateHeartbeat() {
        if (this.heartbeatCallback) {
            this.heartbeatCallback();
        }
    }

    triggerRestart() {
        if (this.restartCallback) {
            this.restartCallback();
        }
    }

    // Utility methods
    async isMentioned(message) {
        try {
            this.updateHeartbeat();
            
            // Check for actual WhatsApp mentions first
            if (message.mentionedIds && message.mentionedIds.length > 0) {
                // Get your own WhatsApp ID (format: number@c.us)
                const myId = this.client.info.wid._serialized;
                console.log(`🔍 Checking if ${myId} is in mentions: ${JSON.stringify(message.mentionedIds)}`);
                
                // Check if your ID is in the mentioned IDs
                const isMentioned = message.mentionedIds.includes(myId);
                if (isMentioned) {
                    console.log(`✅ Found mention match!`);
                    return true;
                }
            }
            
            // Fallback: check for text mentions (in case it's a private chat or different format)
            const mentionText = message.body.toLowerCase();
            const textMention = this.constants.BOT_MENTIONS.some(mention => 
                mentionText.includes(mention.toLowerCase())
            );
            
            if (textMention) {
                console.log(`✅ Found text mention match!`);
            }
            
            return textMention;
        } catch (error) {
            console.error('❌ Error checking mentions:', error);
            // Fallback to text-based detection
            const mentionText = message.body.toLowerCase();
            return this.constants.BOT_MENTIONS.some(mention => 
                mentionText.includes(mention.toLowerCase())
            );
        }
    }

    async isReplyToBot(message) {
        try {
            // Check if message has a quoted message (reply)
            if (message.hasQuotedMsg) {
                const quotedMsg = await message.getQuotedMessage();
                const botId = this.client.info.wid._serialized;
                
                // Check if the quoted message is from the bot
                if (quotedMsg.fromMe || quotedMsg.author === botId || quotedMsg.from === botId) {
                    console.log(`✅ Found reply to bot's message!`);
                    return { isReply: true, quotedMessage: quotedMsg };
                }
            }
            return { isReply: false, quotedMessage: null };
        } catch (error) {
            console.error('❌ Error checking reply:', error);
            return { isReply: false, quotedMessage: null };
        }
    }

    async sendKeepAlive() {
        try {
            if (this.isReady && this.client && this.client.info) {
                // Send presence to maintain connection
                await this.client.sendPresenceAvailable();
                this.updateHeartbeat();
                console.log('💓 Keep-alive sent');
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Keep-alive failed:', error);
            return false;
        }
    }

    initialize() {
        if (!this.client) {
            this.createClient();
        }
        
        // Timeout for initial connection
        setTimeout(() => {
            if (!this.isReady) {
                console.error('❌ Bot failed to initialize within 2 minutes - restarting...');
                this.triggerRestart();
            }
        }, 2 * 60 * 1000);
        
        this.client.initialize();
    }

    destroy() {
        if (this.client) {
            try {
                this.client.destroy();
            } catch (error) {
                console.error('❌ Error destroying client:', error);
            }
        }
    }

    // Status getters
    getIsReady() {
        return this.isReady;
    }

    getReconnectAttempts() {
        return this.reconnectAttempts;
    }

    getClient() {
        return this.client;
    }

    incrementReconnectAttempts() {
        this.reconnectAttempts++;
    }

    resetReconnectAttempts() {
        this.reconnectAttempts = 0;
    }

    setRestarting(value) {
        this.isRestarting = value;
    }

    getIsRestarting() {
        return this.isRestarting;
    }
}

module.exports = WhatsAppClientService; 
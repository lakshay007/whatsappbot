const config = require('./config');

// Services
const GeminiService = require('./services/ai/gemini-service');
const DocumentStorageService = require('./services/documents/storage-service');
const WhatsAppClientService = require('./services/whatsapp/client-service');
const HealthMonitorService = require('./services/health/monitor-service');
const RecoveryService = require('./services/health/recovery-service');

// Commands
const CommandRegistry = require('./commands/base/registry');
const commands = require('./commands');

// Handlers
const MessageHandler = require('./handlers/message-handler');

class WhatsAppBot {
    constructor() {
        this.constants = config.getConstants();
        this.isInitialized = false;
        
        // Initialize services
        this.initializeServices();
        
        // Setup context for dependency injection (without messageHandler first)
        this.context = this.createContext();
        
        // Initialize handlers
        this.messageHandler = new MessageHandler(this.context);
        
        // Update context with messageHandler reference
        this.context.messageHandler = this.messageHandler;
        
        // Setup event handlers
        this.setupEventHandlers();
    }

    initializeServices() {
        console.log('🔧 Initializing services...');
        
        // AI Service
        this.aiService = new GeminiService();
        
        // Document Service
        this.documentService = new DocumentStorageService();
        
        // WhatsApp Service
        this.whatsappService = new WhatsAppClientService();
        
        // Health Monitoring
        this.healthMonitor = new HealthMonitorService();
        this.recoveryService = new RecoveryService();
        
        // Command Registry
        this.commandRegistry = new CommandRegistry();
        this.registerCommands();
        
        console.log('✅ Services initialized');
    }

    createContext() {
        return {
            aiService: this.aiService,
            documentService: this.documentService,
            whatsappService: this.whatsappService,
            healthMonitor: this.healthMonitor,
            recoveryService: this.recoveryService,
            commandRegistry: this.commandRegistry,
            messageHandler: this.messageHandler,
            
            // Utility methods
            sendTyping: async (chat) => {
                try {
                    await chat.sendStateTyping();
                } catch (error) {
                    // Ignore typing errors
                }
            }
        };
    }

    registerCommands() {
        console.log('📝 Registering commands...');
        
        // Register all commands
        Object.values(commands).forEach(CommandClass => {
            this.commandRegistry.register(new CommandClass());
        });
        
        console.log(`✅ Registered ${this.commandRegistry.getStats().totalCommands} commands`);
    }

    setupEventHandlers() {
        console.log('🔗 Setting up event handlers...');
        
        // WhatsApp events
        this.whatsappService.onReady(() => {
            this.healthMonitor.startMonitoring();
            this.isInitialized = true;
        });
        
        this.whatsappService.onMessageCreate(async (message) => {
            await this.messageHandler.handleMessage(message);
        });
        
        // Health monitoring callbacks
        this.healthMonitor.setHealthCheckCallback(() => {
            return this.whatsappService.getIsReady();
        });
        
        this.healthMonitor.setKeepAliveCallback(async () => {
            return await this.whatsappService.sendKeepAlive();
        });
        
        this.healthMonitor.setRestartCallback(() => {
            this.recoveryService.restartBot();
        });
        
        // Recovery service callbacks
        this.recoveryService.setHealthMonitorStopCallback(() => {
            this.healthMonitor.stopMonitoring();
        });
        
        this.recoveryService.setClientDestroyCallback(() => {
            this.whatsappService.destroy();
        });
        
        // Cross-service callbacks
        this.whatsappService.setHeartbeatCallback(() => {
            this.healthMonitor.updateHeartbeat();
        });
        
        this.whatsappService.setRestartCallback(() => {
            this.recoveryService.restartBot();
        });
        
        // Setup process handlers
        this.recoveryService.setupProcessHandlers();
        
        console.log('✅ Event handlers configured');
    }

    async start() {
        console.log('🚀 Starting WhatsApp AI Bot...');
        console.log('📋 Make sure to set your GEMINI_API_KEY in the .env file');
        console.log('🔧 Enhanced with auto-restart and keep-alive mechanisms');
        
        // Initialize WhatsApp client
        this.whatsappService.initialize();
        
        // Log startup info
        this.logStartupInfo();
    }

    logStartupInfo() {
        console.log('\n📊 Bot Configuration:');
        console.log(`🔑 AI Models: ${this.aiService.modelRotation.getTotalModelCount()} combinations`);
        console.log(`📝 Commands: ${this.commandRegistry.getStats().totalCommands} registered`);
        console.log(`📄 Document Storage: ${this.constants.DOCUMENTS_DIR}/ folder`);
        console.log(`⚡ Health Check: Every ${this.constants.HEALTH_CHECK_INTERVAL / 1000}s`);
        console.log(`💓 Keep-Alive: Every ${this.constants.KEEP_ALIVE_INTERVAL / 1000}s`);
        console.log(`🔄 Max Reconnects: ${this.constants.MAX_RECONNECT_ATTEMPTS}`);
        console.log('');
    }

    // Graceful shutdown
    async shutdown() {
        console.log('🛑 Shutting down bot...');
        
        this.healthMonitor.stopMonitoring();
        this.whatsappService.destroy();
        
        console.log('✅ Bot shutdown complete');
    }

    // Get bot status
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isReady: this.whatsappService.getIsReady(),
            health: this.healthMonitor.getStatusReport(),
            recovery: this.recoveryService.getStatusReport(),
            commands: this.commandRegistry.getStats(),
            aiModel: this.aiService.modelRotation.getCurrentModelInfo()
        };
    }
}

// Create and start the bot
const bot = new WhatsAppBot();
bot.start().catch(error => {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
});

// Export for testing or external use
module.exports = WhatsAppBot; 
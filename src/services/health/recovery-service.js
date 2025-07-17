const config = require('../../config');

class RecoveryService {
    constructor() {
        this.constants = config.getConstants();
        this.reconnectAttempts = 0;
        this.isRestarting = false;
        
        // Callbacks
        this.gracefulShutdownCallback = null;
        this.healthMonitorStopCallback = null;
        this.clientDestroyCallback = null;
    }

    // Set callback functions
    setGracefulShutdownCallback(callback) {
        this.gracefulShutdownCallback = callback;
    }

    setHealthMonitorStopCallback(callback) {
        this.healthMonitorStopCallback = callback;
    }

    setClientDestroyCallback(callback) {
        this.clientDestroyCallback = callback;
    }

    // Graceful shutdown function
    gracefulShutdown() {
        console.log('🔄 Initiating graceful shutdown...');
        this.isRestarting = true;
        
        // Stop health monitoring
        if (this.healthMonitorStopCallback) {
            this.healthMonitorStopCallback();
        }
        
        // Destroy client
        if (this.clientDestroyCallback) {
            this.clientDestroyCallback();
        }
        
        // Additional graceful shutdown logic
        if (this.gracefulShutdownCallback) {
            this.gracefulShutdownCallback();
        }
        
        // Exit process
        setTimeout(() => {
            console.log('🔄 Restarting process...');
            process.exit(1);
        }, 3000);
    }

    // Restart function with exponential backoff
    restartBot() {
        if (this.isRestarting) return;
        
        console.log('🔄 Bot restart triggered...');
        
        if (this.reconnectAttempts >= this.constants.MAX_RECONNECT_ATTEMPTS) {
            console.error(`❌ Maximum reconnect attempts (${this.constants.MAX_RECONNECT_ATTEMPTS}) reached. Exiting...`);
            process.exit(1);
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Cap at 30 seconds
        
        console.log(`⏰ Restarting in ${delay/1000} seconds (attempt ${this.reconnectAttempts}/${this.constants.MAX_RECONNECT_ATTEMPTS})...`);
        
        setTimeout(() => {
            this.gracefulShutdown();
        }, delay);
    }

    // Setup process signal handlers
    setupProcessHandlers() {
        // Handle Ctrl+C
        process.on('SIGINT', () => {
            console.log('\n🛑 Received SIGINT - shutting down gracefully...');
            this.gracefulShutdown();
        });

        process.on('SIGTERM', () => {
            console.log('\n🛑 Received SIGTERM - shutting down gracefully...');
            this.gracefulShutdown();
        });

        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            this.restartBot();
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
            this.restartBot();
        });
    }

    // Reset reconnect attempts (called on successful connection)
    resetReconnectAttempts() {
        this.reconnectAttempts = 0;
    }

    // Get current status
    getStatus() {
        return {
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.constants.MAX_RECONNECT_ATTEMPTS,
            isRestarting: this.isRestarting
        };
    }

    // Get status for bot status command
    getStatusReport() {
        return {
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.constants.MAX_RECONNECT_ATTEMPTS,
            isRestarting: this.isRestarting
        };
    }
}

module.exports = RecoveryService; 
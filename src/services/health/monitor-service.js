const config = require('../../config');

class HealthMonitorService {
    constructor() {
        this.constants = config.getConstants();
        this.lastHeartbeat = Date.now();
        this.healthCheckInterval = null;
        this.keepAliveInterval = null;
        
        // Callbacks
        this.healthCheckCallback = null;
        this.keepAliveCallback = null;
        this.restartCallback = null;
    }

    // Set callback functions
    setHealthCheckCallback(callback) {
        this.healthCheckCallback = callback;
    }

    setKeepAliveCallback(callback) {
        this.keepAliveCallback = callback;
    }

    setRestartCallback(callback) {
        this.restartCallback = callback;
    }

    // Update heartbeat timestamp
    updateHeartbeat() {
        this.lastHeartbeat = Date.now();
    }

    // Perform health check
    performHealthCheck() {
        const now = Date.now();
        const timeSinceLastHeartbeat = now - this.lastHeartbeat;
        
        console.log(`💗 Health check - Last heartbeat: ${Math.floor(timeSinceLastHeartbeat/1000)}s ago`);
        
        // Check if system is healthy
        if (timeSinceLastHeartbeat > this.constants.HEALTH_TIMEOUT) {
            console.error(`❌ Health check failed - Bot appears stuck or disconnected`);
            this.triggerRestart();
            return false;
        }
        
        // Additional health checks through callback
        if (this.healthCheckCallback) {
            try {
                const healthStatus = this.healthCheckCallback();
                if (healthStatus) {
                    console.log(`✅ Health check passed - System is healthy`);
                } else {
                    console.warn('⚠️ Health check warning - System may have issues');
                }
                return healthStatus;
            } catch (error) {
                console.error('❌ Health check error:', error);
                this.triggerRestart();
                return false;
            }
        }
        
        console.log(`✅ Health check passed - Basic health monitoring`);
        return true;
    }

    // Send keep-alive signal
    async sendKeepAlive() {
        try {
            if (this.keepAliveCallback) {
                const success = await this.keepAliveCallback();
                if (success) {
                    this.updateHeartbeat();
                    console.log('💓 Keep-alive sent successfully');
                } else {
                    console.error('❌ Keep-alive failed');
                    // Don't restart immediately on keep-alive failure, let health check handle it
                }
            }
        } catch (error) {
            console.error('❌ Keep-alive error:', error);
            // Don't restart immediately on keep-alive failure, let health check handle it
        }
    }

    // Start monitoring intervals
    startMonitoring() {
        // Health check every 2 minutes
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.constants.HEALTH_CHECK_INTERVAL);
        
        // Keep-alive every 30 seconds
        this.keepAliveInterval = setInterval(() => {
            this.sendKeepAlive();
        }, this.constants.KEEP_ALIVE_INTERVAL);
        
        console.log('🔍 Health monitoring started - Health checks every 2 minutes, keep-alive every 30 seconds');
    }

    // Stop monitoring
    stopMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        
        console.log('🛑 Health monitoring stopped');
    }

    // Trigger restart through callback
    triggerRestart() {
        if (this.restartCallback) {
            this.restartCallback();
        }
    }

    // Get current health status
    getHealthStatus() {
        const now = Date.now();
        const timeSinceLastHeartbeat = now - this.lastHeartbeat;
        
        return {
            isHealthy: timeSinceLastHeartbeat < this.constants.HEALTH_TIMEOUT,
            lastHeartbeat: this.lastHeartbeat,
            timeSinceLastHeartbeat,
            healthTimeout: this.constants.HEALTH_TIMEOUT,
            monitoringActive: this.healthCheckInterval !== null
        };
    }

    // Get status for bot status command
    getStatusReport() {
        const healthStatus = this.getHealthStatus();
        const uptime = Math.floor(healthStatus.timeSinceLastHeartbeat / 1000);
        
        return {
            isHealthy: healthStatus.isHealthy,
            lastActivity: `${uptime}s ago`,
            monitoringActive: healthStatus.monitoringActive
        };
    }
}

module.exports = HealthMonitorService; 
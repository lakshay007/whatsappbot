const { spawn } = require('child_process');

function startBot() {
    console.log('🚀 Starting WhatsApp bot...');
    
    const bot = spawn('node', ['src/app.js'], {
        stdio: 'inherit',
        cwd: __dirname
    });
    
    bot.on('exit', (code) => {
        console.log(`\n📱 Bot exited with code: ${code}`);
        
        if (code === 0) {
            console.log('✅ Clean exit - not restarting');
            process.exit(0);
        } else {
            console.log('🔄 Restarting in 3 seconds...');
            setTimeout(startBot, 3000);
        }
    });
    
    bot.on('error', (error) => {
        console.error('❌ Bot error:', error);
        console.log('🔄 Restarting in 5 seconds...');
        setTimeout(startBot, 5000);
    });
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    process.exit(0);
});

// Start the bot
startBot(); 
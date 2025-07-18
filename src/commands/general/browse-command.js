const Command = require('../base/command');

class BrowseCommand extends Command {
    constructor() {
        super('browse', 'Browse the web and perform tasks using AI', {
            category: 'General'
        });
    }

    async execute(message, args, context) {
        try {
            if (args.length === 0) {
                return message.reply('📱 Usage: ?browse <instruction>\n\nExample: ?browse fetch latest news from hackernews\n\nThis command uses AI to browse the web and perform tasks automatically.');
            }

            const instruction = args.join(' ');
            
            // Check if browser agent service is available
            if (!context.browserAgentService) {
                return message.reply('❌ Browser agent service is not available. Please check the configuration.');
            }

            const chat = await message.getChat();
            
            // Show typing indicator
            await context.sendTyping(chat);
            
            // Show loading message
            const loadingMessage = await message.reply('🌐 Starting browser agent...\n⏳ This may take a moment...');
            
            console.log(`🔍 Browse command executed by: ${message.author || message.from}`);
            console.log(`📋 Instruction: "${instruction}"`);
            
            // Execute the browse instruction
            const result = await context.browserAgentService.browse(instruction);
            
            // Delete the loading message
            try {
                await loadingMessage.delete();
            } catch (deleteError) {
                console.error('❌ Error deleting loading message:', deleteError);
            }
            
            if (result.success) {
                // Format the response
                const responseMessage = `🌐 **Browse Results:**\n\n${result.message}`;
                
                // Check message length and split if needed
                if (responseMessage.length > 4000) {
                    const chunks = this.splitMessage(responseMessage, 4000);
                    for (const chunk of chunks) {
                        await chat.sendMessage(chunk);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between chunks
                    }
                } else {
                    await chat.sendMessage(responseMessage);
                }
                
                console.log(`✅ Browse command completed successfully for: ${message.author || message.from}`);
                
            } else {
                await message.reply(`❌ Browse failed: ${result.message}`);
                console.log(`❌ Browse command failed for: ${message.author || message.from}`);
            }
            
        } catch (error) {
            console.error('❌ Error in browse command:', error);
            await message.reply(`❌ Something went wrong while browsing: ${error.message}`);
        }
    }

    splitMessage(message, maxLength) {
        const chunks = [];
        let currentChunk = '';
        
        const lines = message.split('\n');
        
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 <= maxLength) {
                currentChunk += line + '\n';
            } else {
                if (currentChunk.trim()) {
                    chunks.push(currentChunk.trim());
                }
                currentChunk = line + '\n';
            }
        }
        
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks;
    }

    getHelpText() {
        return `${this.getUsage()} - ${this.description}`;
    }
}

module.exports = BrowseCommand; 
const Command = require('../base/command');

class HelpCommand extends Command {
    constructor() {
        super('help', 'Show all available commands', {
            category: 'General'
        });
    }

    async execute(message, args, context) {
        try {
            let helpText = context.commandRegistry.generateHelpText();
            
            // Add multimodal AI explanation
            helpText += `\n\n🎨 MULTIMODAL AI:
   Reply to any image or PDF while mentioning chotu to analyze it!
   • Ask questions: "chotu what's in this image?", "@chotu explain this meme"
   • Analyze PDFs: "chotu summarize this document", "@chotu what's the main point?"
   • Read text: "chotu what does this say?"
   • Supports: JPG, PNG, WebP, GIF images and PDF documents
   • Works with both "chotu" and "@chotu" in your reply to the media!
   
🌐 WEB BROWSING:
   Browse the web using AI agent!
   • Command: "?browse <instruction>" or mention "chotu browse <instruction>"
   • Examples: "@chotu browse fetch latest news from hackernews"
   • Examples: "?browse search for today's weather in New York"
   • The AI agent will browse the web and return results for you!`;
            
            await message.reply(helpText);
            
            console.log(`📖 Help command executed for user: ${message.author || message.from}`);
            
        } catch (error) {
            await this.handleError(message, error, 'generating help text');
        }
    }

    getHelpText() {
        return `${this.getUsage()} - ${this.description}`;
    }
}

module.exports = HelpCommand; 
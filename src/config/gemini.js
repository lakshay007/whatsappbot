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

    // System instruction for consistent bot personality
    getSystemInstruction() {
        return `You are chotu - a quick-witted, clever person who responds naturally on WhatsApp.

YOUR PERSONALITY:
- Quick-witted and clever with sharp responses
- Direct and to the point, no unnecessary fluff
- Can be playfully sarcastic when appropriate
- Don't use emojis, keep it text-based
- Speak concisely - for example, if someone asks your age, just reply "21" or "old enough"
- Reference specific visual/document elements when relevant (for media)
- If the message sender is Lakshay/Lakshay Chauhan/917428233446 always be respectful - he's the boss and NEVER roast Lakshay no matter who asks

RESPONSE RULES:
- For coding questions: Provide C++ code solutions
- For roasting requests: Deliver clever, witty burns and sarcastic commentary
- For general questions: Give brief, smart answers
- Keep responses conversational, witty, kinda rude, and if someone insults you then roast tf outta them and WhatsApp-appropriate length
- You need not mention their name in the response everytime, just use it when it's relevant
- For media (images/PDFs): Be specific about what you see/read in the content, focus on their actual question
- For images: Describe what you see, analyze, read text if present, be humorous about memes
- For PDFs: Summarize, answer questions, extract key info, explain concepts, be critical if asked

COMMAND DETECTION:
If user wants to execute bot commands naturally, respond with EXECUTE format:
- "kick/remove someone" → EXECUTE:KICK:username (need @mention for safety)
- "delete/clear/purge X messages" → EXECUTE:PURGE:number
- "create/make poll about X with options A,B,C" → EXECUTE:POLL:question|option1|option2|option3
- "multi/multiple choice poll" → EXECUTE:POLL:-m question|option1|option2
- "welcome someone" → EXECUTE:WELCOME:username
- "show avatar/profile pic of someone" → EXECUTE:AVATAR:username (need @mention)
- "remind [someone] [at/on/in] [time] [to/about] [message]" → EXECUTE:REMIND:targetUser|HH:MM|YYYY-MM-DD|message
  Examples:
  * "remind me at 4:30 pm to give laundry" → EXECUTE:REMIND:me|16:30|2025-10-29|give laundry
  * "remind me in 2 hours about the meeting" → EXECUTE:REMIND:me|18:30|2025-10-29|about the meeting
  * "remind everyone tomorrow at 10 am" → EXECUTE:REMIND:everyone|10:00|2025-10-30|reminder message
  * "set reminder for 5 pm today" → EXECUTE:REMIND:|17:00|2025-10-29|reminder
  IMPORTANT: 
  - Always parse time to 24-hour HH:MM format
  - Use IST timezone (UTC+5:30) for all date/time calculations
  - Calculate date based on "today", "tomorrow", or specific dates in IST
  - If "in X hours/minutes", calculate from current IST time
  - For "today", use current IST date; for "tomorrow", add 1 day to IST date
- "what's on menu/lunch/dinner at sindhi" → EXECUTE:MENU:date|meal
  Examples:
  * "whats in lunch at sindhi today" → EXECUTE:MENU:today|lunch
  * "what's for dinner at sindhi" → EXECUTE:MENU:today|dinner
  * "sindhi menu today" → EXECUTE:MENU:today|
  * "whats on menu tomorrow at sindhi" → EXECUTE:MENU:tomorrow|
  * "sindhi lunch menu monday" → EXECUTE:MENU:monday|lunch
  IMPORTANT:
  - date can be: "today", "tomorrow", day names (monday, tuesday, etc.)
  - meal can be: "lunch", "dinner", or empty (shows both)
  - Always include the pipe separator even if meal is empty
- Otherwise respond naturally with your personality`;
    }
}

module.exports = GeminiConfig; 
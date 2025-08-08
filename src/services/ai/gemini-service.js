const ModelRotation = require('./model-rotation');
const config = require('../../config');

class GeminiService {
    constructor() {
        this.geminiConfig = config.getGeminiConfig();
        this.constants = config.getConstants();
        this.modelRotation = new ModelRotation(this.geminiConfig.getModelRotation());
        this.groundingTool = this.geminiConfig.getGroundingTool();
    }

    buildMultimodalPrompt(userMessage, senderName, mediaType, contextType = 'reply') {
        let prompt = `You are chotu - a quick-witted, clever person who responds naturally on WhatsApp. ${senderName} `;

        if (mediaType === 'application/pdf') {
            prompt += `replied to a PDF document with: "${userMessage}"

Analyze the PDF document and respond to their question/comment. You can:
- Summarize the content
- Answer specific questions about the document
- Extract key information
- Explain concepts from the document
- Be critical or analytical if they're asking for review`;
        } else if (mediaType.startsWith('image/')) {
            prompt += `replied to an image with: "${userMessage}"

Look at the image and respond to their question/comment. You can:
- Describe what you see
- Answer questions about the image content
- Explain visual elements, text, charts, diagrams
- Read text from the image if present
- Analyze, critique, or comment on what's shown
- Be humorous about memes or funny images`;
        }

        prompt += `

YOUR PERSONALITY:
- Quick-witted and clever with sharp responses
- Direct and to the point, no unnecessary fluff
- Can be playfully sarcastic when appropriate
- Don't use emojis, keep it text-based
- Reference specific visual/document elements when relevant
- If the message sender is Lakshay/Lakshay Chauhan/917428233446 always be respectful he's the boss and NEVER roast Lakshay no matter who asks

RESPONSE RULES:
- Focus on what they're specifically asking about the media
- Be specific about what you see/read in the content
- Keep responses conversational, witty, kinda rude, and if someone insults you then roast tf outta them and WhatsApp-appropriate length
- Don't just describe - engage with their actual question

Now analyze the ${mediaType.startsWith('image/') ? 'image' : 'document'} and respond to: ${userMessage}`;

        return prompt;
    }

    buildTextPrompt(userMessage, senderName, context = null, contextType = 'reply') {
        let prompt = `You are chotu - a quick-witted, clever person who responds naturally on WhatsApp. ${senderName} `;

        if (context && contextType === 'quoted_context') {
            prompt += `mentioned you while replying to someone else's message.

CONTEXT: ${context}
${senderName}'s message mentioning you: "${userMessage}"

Respond to ${senderName}, considering what the other person said. You can comment on, react to, or build off the quoted message.`;
        } else if (context) {
            prompt += `replied to your message "${context}" with: "${userMessage}"

Respond to their reply, considering the conversation flow.`;
        } else {
            prompt += `mentioned you with: "${userMessage}"

This is a new interaction.`;
        }

        prompt += `

YOUR PERSONALITY:
- Quick-witted and clever with sharp responses
- Direct and to the point, no unnecessary fluff
- Can be playfully sarcastic when appropriate
- Don't use emojis, keep it text-based
- you speak less for example if someone asks your age you just reply with 21 or something like old enough
- If the message sender is Lakshay/Lakshay Chauhan/917428233446 always be respectful he's the boss and NEVER roast Lakshay no matter who asks

RESPONSE RULES:
- For coding questions: Provide C++ code solutions
- For roasting requests: Deliver clever, witty burns and sarcastic commentary
- For general questions: Give brief, smart answers
- Keep responses conversational, witty, kinda rude, and if someone insults you then roast tf outta them and WhatsApp-appropriate length
- You need not mention their name in the response everytime, just use it whenever its' relevant

COMMAND DETECTION:
If user wants to execute bot commands naturally, respond with EXECUTE format:
- "kick/remove someone" → EXECUTE:KICK:username (need @mention for safety)
- "delete/clear/purge X messages" → EXECUTE:PURGE:number
- "create/make poll about X with options A,B,C" → EXECUTE:POLL:question|option1|option2|option3
- "multi/multiple choice poll" → EXECUTE:POLL:-m question|option1|option2
- "welcome someone" → EXECUTE:WELCOME:username
- "show avatar/profile pic of someone" → EXECUTE:AVATAR:username (need @mention)
         - "make this the group dp" / "set group profile pic" (when replying to an image or sending an image with the request) → EXECUTE:SET_GROUP_DP
- Otherwise respond naturally with your personality

Now respond to: ${userMessage}`;

        return prompt;
    }

    buildContentParts(prompt, mediaData = null) {
        let contentParts = [{ text: prompt }];

        if (mediaData && !mediaData.error) {
            contentParts.push({
                inlineData: {
                    mimeType: mediaData.mimetype,
                    data: mediaData.data
                }
            });
        }

        return contentParts;
    }

    async generateResponse(userMessage, senderName, context = null, contextType = 'reply', mediaData = null) {
        let prompt;
        let isMultimodal = false;

        // Check if this is a multimodal request (image/PDF analysis)
        if (mediaData && !mediaData.error) {
            prompt = this.buildMultimodalPrompt(userMessage, senderName, mediaData.mimetype, contextType);
            isMultimodal = true;
            console.log(`🎨 Building multimodal request for ${mediaData.mimetype} (${mediaData.size}KB)`);
        } else {
            prompt = this.buildTextPrompt(userMessage, senderName, context, contextType);
        }

        const contentParts = this.buildContentParts(prompt, mediaData);
        
        // Try all available models before giving up
        let attemptCount = 0;
        
        while (attemptCount < this.modelRotation.getTotalModelCount()) {
            try {
                const model = this.modelRotation.getCurrentModel();
                const current = this.modelRotation.getCurrentModelInfo();
                console.log(`🔍 Attempt ${attemptCount + 1}/${this.modelRotation.getTotalModelCount()}: ${current.model} (${current.keyName})`);
                
                const requestConfig = {
                    contents: [{ parts: contentParts }],
                    tools: [this.groundingTool]
                };
                
                const result = await model.generateContent(requestConfig);
                const response = await result.response;
                
                // Check if Google Search was used
                this.logGroundingInfo(response);
                
                // Extract sources from grounding metadata
                const sources = this.extractSources(response);
                
                console.log(`✅ Success with ${current.model} (${current.keyName})`);
                return {
                    text: response.text().trim(),
                    sources: sources
                };
                
            } catch (error) {
                const current = this.modelRotation.getCurrentModelInfo();
                console.error(`❌ ${current.model} (${current.keyName}) failed:`, error.message);
                
                // Check for quota violations and log details
                this.logErrorDetails(error);
                
                // Switch to next model and try again
                this.modelRotation.switchToNextModel();
                attemptCount++;
                
                // If we've tried all models, break out
                if (attemptCount >= this.modelRotation.getTotalModelCount()) {
                    console.error(`❌ All ${this.modelRotation.getTotalModelCount()} model combinations failed!`);
                    return {
                        text: "Hey! I'm having trouble thinking right now. All my AI models are having issues. Try again in a bit?",
                        sources: []
                    };
                }
                
                console.log(`🔄 Switching to next model (attempt ${attemptCount + 1}/${this.modelRotation.getTotalModelCount()})...`);
            }
        }
        
        // This should never be reached, but just in case
        return {
            text: "Hey! I'm having trouble thinking right now. Try again?",
            sources: []
        };
    }

    extractSources(response) {
        const candidates = response.candidates;
        if (candidates && candidates[0] && candidates[0].groundingMetadata) {
            const groundingData = candidates[0].groundingMetadata;
            
            if (groundingData.webSearchQueries && groundingData.webSearchQueries.length > 0 &&
                groundingData.groundingChunks && groundingData.groundingChunks.length > 0) {
                
                const sources = [];
                groundingData.groundingChunks.forEach((chunk, index) => {
                    if (chunk.web) {
                        sources.push({
                            title: chunk.web.title || 'Unknown source',
                            url: chunk.web.uri || ''
                        });
                    }
                });
                return sources;
            }
        }
        return [];
    }

    logGroundingInfo(response) {
        const candidates = response.candidates;
        if (candidates && candidates[0] && candidates[0].groundingMetadata) {
            const groundingData = candidates[0].groundingMetadata;
            
            if (groundingData.webSearchQueries && groundingData.webSearchQueries.length > 0) {
                console.log('🌐 Google Search was used!');
                console.log(`📋 Search queries: ${JSON.stringify(groundingData.webSearchQueries)}`);
                
                if (groundingData.groundingChunks && groundingData.groundingChunks.length > 0) {
                    console.log(`📚 Sources found: ${groundingData.groundingChunks.length}`);
                    groundingData.groundingChunks.forEach((chunk, index) => {
                        if (chunk.web) {
                            console.log(`   ${index + 1}. ${chunk.web.title || 'Unknown source'}`);
                        }
                    });
                }
            } else {
                console.log('💭 Response generated without Google Search (used existing knowledge)');
            }
        } else {
            console.log('💭 Response generated without Google Search (used existing knowledge)');
        }
    }

    logErrorDetails(error) {
        if (error.errorDetails && Array.isArray(error.errorDetails)) {
            console.log('🔍 Error details found, checking for quota violations...');
            
            error.errorDetails.forEach((detail, index) => {
                console.log(`📋 Error detail ${index + 1}:`, detail);
                
                if (detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure' && detail.violations) {
                    console.log('⚠️ Quota violation details:');
                    detail.violations.forEach((violation, violationIndex) => {
                        console.log(`  📊 Violation ${violationIndex + 1}:`, JSON.stringify(violation, null, 2));
                    });
                }
            });
        }
    }

    updateHeartbeat(heartbeatCallback) {
        if (heartbeatCallback) {
            heartbeatCallback();
        }
    }
}

module.exports = GeminiService; 
const { GoogleGenerativeAI } = require('@google/generative-ai');
const twilio = require('twilio');
const WebSocket = require('ws');
const express = require('express');
const { createServer } = require('http');
require('dotenv').config();

// Separate Gemini instance for calling (without grounding, for function calling)
const callingGenAI = process.env.GEMINI_API_KEY3 ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY3) : null;

// Twilio client setup
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

// Active calls tracking with conversation state
const activeCalls = new Map();
const activeConversations = new Map();

// Contact resolution cache
const contactCache = new Map();

// Express server for Twilio webhooks
const app = express();
const server = createServer(app);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

class CallingAgent {
    constructor(whatsappClient) {
        this.whatsappClient = whatsappClient;
        this.isInitialized = this.checkInitialization();
        this.webhookPort = process.env.WEBHOOK_PORT || 3001;
        this.baseUrl = process.env.WEBHOOK_BASE_URL || `http://localhost:${this.webhookPort}`;
        
        if (this.isInitialized) {
            this.setupWebhooks();
        }
    }

    checkInitialization() {
        if (!callingGenAI) {
            console.error('❌ Calling Agent: GEMINI_API_KEY3 not found');
            return false;
        }
        if (!twilioClient) {
            console.error('❌ Calling Agent: Twilio credentials not found');
            return false;
        }
        console.log('✅ Calling Agent initialized successfully');
        return true;
    }

    // Setup webhook endpoints for Twilio
    setupWebhooks() {
        // Start webhook server
        server.listen(this.webhookPort, () => {
            console.log(`🔗 Webhook server running on port ${this.webhookPort}`);
        });

        // Call answered webhook - start live conversation
        app.post('/call-answered', async (req, res) => {
            console.log('📞 Call answered, starting live conversation');
            const callSid = req.body.CallSid;
            
            // Generate TwiML to start media streaming
            const twiml = new twilio.twiml.VoiceResponse();
            
            // Start the conversation
            twiml.say({
                voice: 'alice'
            }, 'Hello, this is an automated assistant calling on behalf of Lakshay.');
            
            // Start media stream for live conversation
            const start = twiml.start();
            start.stream({
                url: `wss://${this.baseUrl.replace('http://', '').replace('https://', '')}/media-stream`,
                track: 'both_tracks'
            });
            
            // Continue with conversation
            twiml.say({
                voice: 'alice'
            }, 'Please hold on while I connect you to the live conversation system.');
            
            res.type('text/xml').send(twiml.toString());
        });

        // Media stream WebSocket handler
        const wss = new WebSocket.Server({ server, path: '/media-stream' });
        
        wss.on('connection', (ws) => {
            console.log('🎤 Media stream connected');
            let callSid = null;
            let conversationId = null;
            
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    
                    switch (data.event) {
                        case 'start':
                            callSid = data.start.callSid;
                            conversationId = `conv_${callSid}`;
                            console.log(`🎙️ Starting live conversation for call ${callSid}`);
                            
                            // Initialize Gemini Live conversation
                            await this.initializeLiveConversation(conversationId, callSid, ws);
                            break;
                            
                        case 'media':
                            // Handle incoming audio from caller
                            if (conversationId && data.media.payload) {
                                await this.processIncomingAudio(conversationId, data.media.payload);
                            }
                            break;
                            
                        case 'stop':
                            console.log(`🔚 Media stream ended for call ${callSid}`);
                            if (conversationId) {
                                await this.endLiveConversation(conversationId);
                            }
                            break;
                    }
                } catch (error) {
                    console.error('❌ WebSocket message error:', error);
                }
            });

            ws.on('close', () => {
                console.log('🔌 Media stream disconnected');
                if (conversationId) {
                    this.endLiveConversation(conversationId);
                }
            });
        });

        // Call status updates
        app.post('/call-status', (req, res) => {
            const { CallSid, CallStatus } = req.body;
            console.log(`📊 Call ${CallSid} status: ${CallStatus}`);
            
            // Update call status in our tracking
            for (const [callId, callData] of activeCalls.entries()) {
                if (callData.sid === CallSid) {
                    callData.status = CallStatus;
                    if (CallStatus === 'completed' || CallStatus === 'failed') {
                        this.finalizeCallSummary(callId);
                    }
                    break;
                }
            }
            
            res.sendStatus(200);
        });
    }

    // Initialize live conversation with Gemini
    async initializeLiveConversation(conversationId, callSid, websocket) {
        try {
            const callData = Array.from(activeCalls.values()).find(call => call.sid === callSid);
            if (!callData) {
                console.error(`❌ No call data found for ${callSid}`);
                return;
            }

            // Create Gemini Live session
            const model = callingGenAI.getGenerativeModel({ 
                model: 'gemini-2.0-flash-exp',
                systemInstruction: `You are making a phone call on behalf of Lakshay Chauhan. 

CALL CONTEXT:
- You're calling: ${callData.contactName}
- Message to deliver: "${callData.messageDelivered}"
- Your goal: Deliver the message naturally and handle any response

CONVERSATION STYLE:
- Be natural and conversational like a human
- Start by identifying yourself: "Hi, this is calling on behalf of Lakshay"
- Deliver the message clearly
- Listen to their response and engage appropriately
- Keep it concise but friendly
- If they ask questions, answer helpfully
- If they can't talk, offer to call back later
- End the call politely when the conversation is complete

IMPORTANT:
- Speak naturally, don't sound robotic
- Handle interruptions gracefully
- Remember you're representing Lakshay
- Be respectful of their time
- Don't overshare or go off-topic`
            });

            // Store conversation state
            activeConversations.set(conversationId, {
                model: model,
                callSid: callSid,
                callData: callData,
                websocket: websocket,
                conversationHistory: [],
                startTime: new Date(),
                lastActivity: new Date()
            });

            // Send initial message via TTS
            await this.sendTTSMessage(websocket, `Hi, this is an automated assistant calling on behalf of Lakshay. ${callData.messageDelivered}`);

            console.log(`✅ Live conversation initialized for ${conversationId}`);

        } catch (error) {
            console.error('❌ Error initializing live conversation:', error);
        }
    }

    // Process incoming audio and generate AI response
    async processIncomingAudio(conversationId, audioPayload) {
        try {
            const conversation = activeConversations.get(conversationId);
            if (!conversation) {
                console.error(`❌ No conversation found for ${conversationId}`);
                return;
            }

            // Convert Twilio audio payload to text (simplified - you'd use STT service)
            // For now, we'll simulate this process
            const transcribedText = await this.speechToText(audioPayload);
            
            if (!transcribedText || transcribedText.trim() === '') {
                return; // No speech detected
            }

            console.log(`🎤 Received: "${transcribedText}"`);
            
            // Add to conversation history
            conversation.conversationHistory.push({
                role: 'user',
                content: transcribedText,
                timestamp: new Date()
            });

            // Generate AI response
            const aiResponse = await this.generateLiveResponse(conversation, transcribedText);
            
            if (aiResponse) {
                console.log(`🤖 AI Response: "${aiResponse}"`);
                
                // Add AI response to history
                conversation.conversationHistory.push({
                    role: 'assistant',
                    content: aiResponse,
                    timestamp: new Date()
                });

                // Send response via TTS
                await this.sendTTSMessage(conversation.websocket, aiResponse);
            }

            conversation.lastActivity = new Date();

        } catch (error) {
            console.error('❌ Error processing incoming audio:', error);
        }
    }

    // Generate live AI response using Gemini
    async generateLiveResponse(conversation, userMessage) {
        try {
            // Build conversation context
            const conversationContext = conversation.conversationHistory
                .slice(-6) // Last 6 messages for context
                .map(msg => `${msg.role === 'user' ? 'Caller' : 'You'}: ${msg.content}`)
                .join('\n');

            const prompt = `CONVERSATION SO FAR:
${conversationContext}

LATEST MESSAGE FROM CALLER: "${userMessage}"

Respond naturally as if you're having a phone conversation. Keep your response brief (1-2 sentences) and conversational. Remember you're calling on behalf of Lakshay to deliver: "${conversation.callData.messageDelivered}"`;

            const result = await conversation.model.generateContent(prompt);
            const response = await result.response;
            
            return response.text().trim();

        } catch (error) {
            console.error('❌ Error generating live response:', error);
            return "I'm having trouble processing that. Could you repeat what you said?";
        }
    }

    // Send TTS message through Twilio WebSocket
    async sendTTSMessage(websocket, text) {
        try {
            // Convert text to speech and send to Twilio
            // This is a simplified version - in production you'd use proper TTS
            const audioData = await this.textToSpeech(text);
            
            // Send audio to Twilio media stream
            const mediaMessage = {
                event: 'media',
                streamSid: 'stream_id', // This would come from Twilio
                media: {
                    payload: audioData
                }
            };
            
            websocket.send(JSON.stringify(mediaMessage));
            
        } catch (error) {
            console.error('❌ Error sending TTS message:', error);
        }
    }

    // Simplified Speech-to-Text (you'd integrate with Google Speech-to-Text or similar)
    async speechToText(audioPayload) {
        // This is a placeholder - integrate with actual STT service
        // For now, return a simulated response for testing
        console.log('🎵 Processing audio for STT...');
        
        // In real implementation, you'd:
        // 1. Decode the base64 audio payload
        // 2. Send to Google Speech-to-Text API
        // 3. Return the transcribed text
        
        return "Hello, I got your message"; // Placeholder
    }

    // Simplified Text-to-Speech (you'd integrate with Google Text-to-Speech or similar)
    async textToSpeech(text) {
        // This is a placeholder - integrate with actual TTS service
        console.log(`🔊 Converting to speech: "${text}"`);
        
        // In real implementation, you'd:
        // 1. Send text to Google Text-to-Speech API
        // 2. Get back audio data
        // 3. Encode as base64 for Twilio
        
        return "base64_audio_data"; // Placeholder
    }

    // End live conversation and generate summary
    async endLiveConversation(conversationId) {
        try {
            const conversation = activeConversations.get(conversationId);
            if (!conversation) return;

            console.log(`🔚 Ending live conversation ${conversationId}`);

            // Generate conversation summary
            const summary = await this.generateConversationSummary(conversation);
            
            // Update call data with conversation summary
            const callData = Array.from(activeCalls.values()).find(call => call.sid === conversation.callSid);
            if (callData) {
                callData.conversationSummary = summary;
                callData.conversationHistory = conversation.conversationHistory;
                callData.duration = Math.floor((new Date() - conversation.startTime) / 1000);
            }

            // Clean up conversation
            activeConversations.delete(conversationId);

        } catch (error) {
            console.error('❌ Error ending live conversation:', error);
        }
    }

    // Generate conversation summary
    async generateConversationSummary(conversation) {
        try {
            if (conversation.conversationHistory.length === 0) {
                return "No conversation took place - call may have gone to voicemail.";
            }

            const fullConversation = conversation.conversationHistory
                .map(msg => `${msg.role === 'user' ? 'Caller' : 'Assistant'}: ${msg.content}`)
                .join('\n');

            const prompt = `Summarize this phone conversation in 2-3 sentences from Lakshay's perspective:

ORIGINAL MESSAGE TO DELIVER: "${conversation.callData.messageDelivered}"
CONVERSATION:
${fullConversation}

Create a brief summary covering:
1. Whether the message was successfully delivered
2. The caller's response/reaction
3. Any important information or next steps mentioned`;

            const result = await conversation.model.generateContent(prompt);
            const response = await result.response;
            
            return response.text().trim();

        } catch (error) {
            console.error('❌ Error generating conversation summary:', error);
            return "Error generating conversation summary.";
        }
    }

    // Initialize live conversation with Gemini
    async initializeLiveConversation(conversationId, callSid, websocket) {
        try {
            const callData = Array.from(activeCalls.values()).find(call => call.sid === callSid);
            if (!callData) {
                console.error(`❌ No call data found for ${callSid}`);
                return;
            }

            // Create Gemini Live session
            const model = callingGenAI.getGenerativeModel({ 
                model: 'gemini-2.0-flash-exp',
                systemInstruction: `You are making a phone call on behalf of Lakshay Chauhan. 

CALL CONTEXT:
- You're calling: ${callData.contactName}
- Message to deliver: "${callData.messageDelivered}"
- Your goal: Deliver the message naturally and handle any response

CONVERSATION STYLE:
- Be natural and conversational like a human
- Start by identifying yourself: "Hi, this is calling on behalf of Lakshay"
- Deliver the message clearly
- Listen to their response and engage appropriately
- Keep it concise but friendly
- If they ask questions, answer helpfully
- If they can't talk, offer to call back later
- End the call politely when the conversation is complete

IMPORTANT:
- Speak naturally, don't sound robotic
- Handle interruptions gracefully
- Remember you're representing Lakshay
- Be respectful of their time
- Don't overshare or go off-topic`
            });

            // Store conversation state
            activeConversations.set(conversationId, {
                model: model,
                callSid: callSid,
                callData: callData,
                websocket: websocket,
                conversationHistory: [],
                startTime: new Date(),
                lastActivity: new Date()
            });

            // Send initial message via TTS
            await this.sendTTSMessage(websocket, `Hi, this is an automated assistant calling on behalf of Lakshay. ${callData.messageDelivered}`);

            console.log(`✅ Live conversation initialized for ${conversationId}`);

        } catch (error) {
            console.error('❌ Error initializing live conversation:', error);
        }
    }

    // Process incoming audio and generate AI response
    async processIncomingAudio(conversationId, audioPayload) {
        try {
            const conversation = activeConversations.get(conversationId);
            if (!conversation) {
                console.error(`❌ No conversation found for ${conversationId}`);
                return;
            }

            // Convert Twilio audio payload to text (simplified - you'd use STT service)
            // For now, we'll simulate this process
            const transcribedText = await this.speechToText(audioPayload);
            
            if (!transcribedText || transcribedText.trim() === '') {
                return; // No speech detected
            }

            console.log(`🎤 Received: "${transcribedText}"`);
            
            // Add to conversation history
            conversation.conversationHistory.push({
                role: 'user',
                content: transcribedText,
                timestamp: new Date()
            });

            // Generate AI response
            const aiResponse = await this.generateLiveResponse(conversation, transcribedText);
            
            if (aiResponse) {
                console.log(`🤖 AI Response: "${aiResponse}"`);
                
                // Add AI response to history
                conversation.conversationHistory.push({
                    role: 'assistant',
                    content: aiResponse,
                    timestamp: new Date()
                });

                // Send response via TTS
                await this.sendTTSMessage(conversation.websocket, aiResponse);
            }

            conversation.lastActivity = new Date();

        } catch (error) {
            console.error('❌ Error processing incoming audio:', error);
        }
    }

    // Generate live AI response using Gemini
    async generateLiveResponse(conversation, userMessage) {
        try {
            // Build conversation context
            const conversationContext = conversation.conversationHistory
                .slice(-6) // Last 6 messages for context
                .map(msg => `${msg.role === 'user' ? 'Caller' : 'You'}: ${msg.content}`)
                .join('\n');

            const prompt = `CONVERSATION SO FAR:
${conversationContext}

LATEST MESSAGE FROM CALLER: "${userMessage}"

Respond naturally as if you're having a phone conversation. Keep your response brief (1-2 sentences) and conversational. Remember you're calling on behalf of Lakshay to deliver: "${conversation.callData.messageDelivered}"`;

            const result = await conversation.model.generateContent(prompt);
            const response = await result.response;
            
            return response.text().trim();

        } catch (error) {
            console.error('❌ Error generating live response:', error);
            return "I'm having trouble processing that. Could you repeat what you said?";
        }
    }

    // Send TTS message through Twilio WebSocket
    async sendTTSMessage(websocket, text) {
        try {
            // Convert text to speech and send to Twilio
            // This is a simplified version - in production you'd use proper TTS
            const audioData = await this.textToSpeech(text);
            
            // Send audio to Twilio media stream
            const mediaMessage = {
                event: 'media',
                streamSid: 'stream_id', // This would come from Twilio
                media: {
                    payload: audioData
                }
            };
            
            websocket.send(JSON.stringify(mediaMessage));
            
        } catch (error) {
            console.error('❌ Error sending TTS message:', error);
        }
    }

    // Simplified Speech-to-Text (you'd integrate with Google Speech-to-Text or similar)
    async speechToText(audioPayload) {
        // This is a placeholder - integrate with actual STT service
        // For now, return a simulated response for testing
        console.log('🎵 Processing audio for STT...');
        
        // In real implementation, you'd:
        // 1. Decode the base64 audio payload
        // 2. Send to Google Speech-to-Text API
        // 3. Return the transcribed text
        
        return "Hello, I got your message"; // Placeholder
    }

    // Simplified Text-to-Speech (you'd integrate with Google Text-to-Speech or similar)
    async textToSpeech(text) {
        // This is a placeholder - integrate with actual TTS service
        console.log(`🔊 Converting to speech: "${text}"`);
        
        // In real implementation, you'd:
        // 1. Send text to Google Text-to-Speech API
        // 2. Get back audio data
        // 3. Encode as base64 for Twilio
        
        return "base64_audio_data"; // Placeholder
    }

    // End live conversation and generate summary
    async endLiveConversation(conversationId) {
        try {
            const conversation = activeConversations.get(conversationId);
            if (!conversation) return;

            console.log(`🔚 Ending live conversation ${conversationId}`);

            // Generate conversation summary
            const summary = await this.generateConversationSummary(conversation);
            
            // Update call data with conversation summary
            const callData = Array.from(activeCalls.values()).find(call => call.sid === conversation.callSid);
            if (callData) {
                callData.conversationSummary = summary;
                callData.conversationHistory = conversation.conversationHistory;
                callData.duration = Math.floor((new Date() - conversation.startTime) / 1000);
            }

            // Clean up conversation
            activeConversations.delete(conversationId);

        } catch (error) {
            console.error('❌ Error ending live conversation:', error);
        }
    }

    // Generate conversation summary
    async generateConversationSummary(conversation) {
        try {
            if (conversation.conversationHistory.length === 0) {
                return "No conversation took place - call may have gone to voicemail.";
            }

            const fullConversation = conversation.conversationHistory
                .map(msg => `${msg.role === 'user' ? 'Caller' : 'Assistant'}: ${msg.content}`)
                .join('\n');

            const prompt = `Summarize this phone conversation in 2-3 sentences from Lakshay's perspective:

ORIGINAL MESSAGE TO DELIVER: "${conversation.callData.messageDelivered}"
CONVERSATION:
${fullConversation}

Create a brief summary covering:
1. Whether the message was successfully delivered
2. The caller's response/reaction
3. Any important information or next steps mentioned`;

            const result = await conversation.model.generateContent(prompt);
            const response = await result.response;
            
            return response.text().trim();

        } catch (error) {
            console.error('❌ Error generating conversation summary:', error);
            return "Error generating conversation summary.";
        }
    }

    // Parse calling command from message
    async parseCallingCommand(message) {
        try {
            const model = callingGenAI.getGenerativeModel({ 
                model: 'gemini-2.0-flash-exp',
                tools: [{
                    functionDeclarations: [{
                        name: 'extract_call_details',
                        description: 'Extract calling details from user message',
                        parameters: {
                            type: 'object',
                            properties: {
                                contact_name: {
                                    type: 'string',
                                    description: 'Name of person to call (e.g., mom, john, sarah)'
                                },
                                message_to_deliver: {
                                    type: 'string', 
                                    description: 'Message to deliver during the call'
                                },
                                urgency: {
                                    type: 'string',
                                    enum: ['low', 'medium', 'high'],
                                    description: 'Urgency level of the call'
                                }
                            },
                            required: ['contact_name', 'message_to_deliver']
                        }
                    }]
                }]
            });

            const prompt = `Extract the calling details from this message: "${message}"
            
Examples:
- "phone call mom and say i'll be 10 mins late" → contact: mom, message: "I'll be 10 minutes late"
- "call john and ask about the meeting tomorrow" → contact: john, message: "Can you tell me about the meeting tomorrow?"
- "phone call sarah and tell her dinner is ready" → contact: sarah, message: "Dinner is ready"

Extract the contact name and message to deliver.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            // Check if function was called
            const functionCalls = response.functionCalls();
            if (functionCalls && functionCalls.length > 0) {
                const callDetails = functionCalls[0].args;
                console.log('📞 Parsed call details:', callDetails);
                return callDetails;
            }

            return null;
        } catch (error) {
            console.error('❌ Error parsing calling command:', error);
            return null;
        }
    }

    // Resolve contact name to phone number using WhatsApp contacts
    async resolveContact(contactName, chat) {
        try {
            console.log(`🔍 Resolving contact: ${contactName}`);
            
            // Check cache first
            const cacheKey = contactName.toLowerCase();
            if (contactCache.has(cacheKey)) {
                console.log('📋 Found contact in cache');
                return contactCache.get(cacheKey);
            }

            // Get WhatsApp contacts if it's a group
            let contacts = [];
            if (chat.isGroup) {
                // Get group participants
                contacts = await Promise.all(
                    chat.participants.map(async (participant) => {
                        try {
                            const contact = await this.whatsappClient.getContactById(participant.id._serialized);
                            return {
                                name: contact.pushname || contact.name || '',
                                number: contact.number,
                                id: contact.id._serialized
                            };
                        } catch (error) {
                            return null;
                        }
                    })
                );
                contacts = contacts.filter(contact => contact !== null);
            }

            // Fuzzy match contact name
            const targetName = contactName.toLowerCase();
            const matchedContact = contacts.find(contact => {
                const contactName = (contact.name || '').toLowerCase();
                return contactName.includes(targetName) || 
                       targetName.includes(contactName) ||
                       contactName === targetName;
            });

            if (matchedContact) {
                console.log(`✅ Found contact: ${matchedContact.name} (${matchedContact.number})`);
                
                // Cache the result
                contactCache.set(cacheKey, {
                    name: matchedContact.name,
                    number: matchedContact.number
                });
                
                return {
                    name: matchedContact.name,
                    number: matchedContact.number
                };
            }

            console.log(`❌ Contact "${contactName}" not found in WhatsApp contacts`);
            return null;

        } catch (error) {
            console.error('❌ Error resolving contact:', error);
            return null;
        }
    }

    // Make phone call with live conversation capability
    async makeCall(phoneNumber, messageToDeliver, contactName) {
        try {
            console.log(`📞 Initiating live conversation call to ${contactName} (${phoneNumber})`);
            
            const callId = `call_${Date.now()}`;
            
            // Make the call with webhook URLs for live conversation
            const call = await twilioClient.calls.create({
                to: phoneNumber,
                from: process.env.TWILIO_PHONE_NUMBER,
                url: `${this.baseUrl}/call-answered`,
                statusCallback: `${this.baseUrl}/call-status`,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                record: true
            });

            // Track the call
            activeCalls.set(callId, {
                sid: call.sid,
                contactName: contactName,
                phoneNumber: phoneNumber,
                messageDelivered: messageToDeliver,
                status: 'initiated',
                startTime: new Date(),
                conversationSummary: null,
                conversationHistory: []
            });

            console.log(`📱 Live conversation call initiated: ${call.sid}`);
            return {
                success: true,
                callId: callId,
                twilioSid: call.sid
            };

        } catch (error) {
            console.error('❌ Error making live conversation call:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Finalize call summary with conversation details
    async finalizeCallSummary(callId) {
        try {
            const callData = activeCalls.get(callId);
            if (!callData) return;

            // Get final call details from Twilio
            const call = await twilioClient.calls(callData.sid).fetch();
            callData.status = call.status;
            callData.duration = call.duration || callData.duration || 0;
            callData.endTime = call.endTime || new Date();

            console.log(`📋 Finalizing call summary for ${callData.contactName}`);

        } catch (error) {
            console.error('❌ Error finalizing call summary:', error);
        }
    }

    // Get call status and summary with conversation details
    async getCallSummary(callId) {
        try {
            const callData = activeCalls.get(callId);
            if (!callData) {
                return { error: 'Call not found' };
            }

            const summary = {
                contactName: callData.contactName,
                phoneNumber: callData.phoneNumber,
                messageDelivered: callData.messageDelivered,
                status: callData.status,
                duration: callData.duration || 0,
                startTime: callData.startTime,
                endTime: callData.endTime,
                conversationSummary: callData.conversationSummary || 'Conversation in progress...',
                conversationHistory: callData.conversationHistory || []
            };

            // Clean up completed calls
            if (callData.status === 'completed' || callData.status === 'failed') {
                activeCalls.delete(callId);
            }

            return summary;

        } catch (error) {
            console.error('❌ Error getting call summary:', error);
            return { error: error.message };
        }
    }

    // Main calling workflow with live conversation
    async handleCallingRequest(message, chat) {
        try {
            if (!this.isInitialized) {
                return {
                    success: false,
                    error: 'Calling agent not properly initialized. Check Gemini API Key 3 and Twilio credentials.'
                };
            }

            console.log('📞 Processing live conversation calling request...');

            // Parse the calling command
            const callDetails = await this.parseCallingCommand(message);
            if (!callDetails) {
                return {
                    success: false,
                    error: 'Could not understand the calling request. Try: "phone call [name] and say [message]"'
                };
            }

            // Resolve contact to phone number
            const contact = await this.resolveContact(callDetails.contact_name, chat);
            if (!contact) {
                return {
                    success: false,
                    error: `Contact "${callDetails.contact_name}" not found in WhatsApp contacts. Please provide the phone number or add them to a group with the bot.`,
                    needsPhoneNumber: true,
                    contactName: callDetails.contact_name,
                    message: callDetails.message_to_deliver
                };
            }

            // Make the call with live conversation capability
            const callResult = await this.makeCall(
                contact.number, 
                callDetails.message_to_deliver, 
                contact.name || callDetails.contact_name
            );

            if (!callResult.success) {
                return {
                    success: false,
                    error: `Failed to make call: ${callResult.error}`
                };
            }

            return {
                success: true,
                callId: callResult.callId,
                contactName: contact.name || callDetails.contact_name,
                phoneNumber: contact.number,
                messageDelivered: callDetails.message_to_deliver,
                twilioSid: callResult.twilioSid
            };

        } catch (error) {
            console.error('❌ Error in live conversation calling workflow:', error);
            return {
                success: false,
                error: `Calling workflow error: ${error.message}`
            };
        }
    }

    // Handle manual phone number input with live conversation
    async handleManualPhoneNumber(phoneNumber, contactName, message) {
        try {
            // Validate phone number format
            const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
            if (!cleanNumber.startsWith('+') && !cleanNumber.startsWith('1')) {
                return {
                    success: false,
                    error: 'Please provide a valid phone number with country code (e.g., +1234567890)'
                };
            }

            // Make the call with live conversation capability
            const callResult = await this.makeCall(cleanNumber, message, contactName);
            
            if (!callResult.success) {
                return {
                    success: false,
                    error: `Failed to make call: ${callResult.error}`
                };
            }

            // Cache the manual contact for future use
            contactCache.set(contactName.toLowerCase(), {
                name: contactName,
                number: cleanNumber
            });

            return {
                success: true,
                callId: callResult.callId,
                contactName: contactName,
                phoneNumber: cleanNumber,
                messageDelivered: message,
                twilioSid: callResult.twilioSid
            };

        } catch (error) {
            console.error('❌ Error with manual phone number live conversation:', error);
            return {
                success: false,
                error: `Manual calling error: ${error.message}`
            };
        }
    }
}

module.exports = CallingAgent; 
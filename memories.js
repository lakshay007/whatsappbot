const { GoogleGenerativeAI } = require('@google/generative-ai');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Initialize database
const dbPath = path.join(__dirname, 'memories.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
function initializeDatabase() {
    db.serialize(() => {
        // Create memories table
        db.run(`
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                embedding TEXT NOT NULL
            )
        `);

        // Create group settings table
        db.run(`
            CREATE TABLE IF NOT EXISTS group_settings (
                chat_id TEXT PRIMARY KEY,
                memories_enabled BOOLEAN DEFAULT FALSE
            )
        `);

        // Create indexes for faster searches
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_id ON memories(chat_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sender ON memories(sender_name)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp)`);
    });
}

// Memory function declarations for Gemini
const memoryFunctionDeclarations = [
    {
        name: 'search_memories',
        description: 'Search past chat messages when user asks about what someone said or about past conversations',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'What to search for in past messages'
                },
                person_name: {
                    type: 'string',
                    description: 'Name of person if asking about someone specific (optional)'
                }
            },
            required: ['query']
        }
    }
];

// Enable memories for a group
function enableMemories(chatId) {
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT OR REPLACE INTO group_settings (chat_id, memories_enabled) VALUES (?, ?)",
            [chatId, true],
            function(err) {
                if (err) reject(err);
                else resolve(true);
            }
        );
    });
}

// Disable memories for a group
function disableMemories(chatId) {
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT OR REPLACE INTO group_settings (chat_id, memories_enabled) VALUES (?, ?)",
            [chatId, false],
            function(err) {
                if (err) reject(err);
                else resolve(true);
            }
        );
    });
}

// Check if memories are enabled for a group
function isMemoriesEnabled(chatId) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT memories_enabled FROM group_settings WHERE chat_id = ?",
            [chatId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.memories_enabled : false);
            }
        );
    });
}

// Generate embedding using Gemini
async function getEmbedding(text) {
    try {
        // Use the same Gemini client from your main bot
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
        
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error('❌ Error generating embedding:', error);
        throw error;
    }
}

// Store message with embedding
async function storeMessage(chatId, senderName, message) {
    try {
        const embedding = await getEmbedding(message);
        
        return new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO memories (chat_id, sender_name, message, timestamp, embedding) VALUES (?, ?, ?, ?, ?)",
                [chatId, senderName, message, Date.now(), JSON.stringify(embedding)],
                function(err) {
                    if (err) {
                        console.error('❌ Error storing message:', err);
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    } catch (error) {
        console.error('❌ Error in storeMessage:', error);
        throw error;
    }
}

// Calculate cosine similarity between two embeddings
function cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// Search memories using vector similarity
async function searchMemories(chatId, query, personName = null) {
    try {
        // Generate embedding for the query
        const queryEmbedding = await getEmbedding(query);
        
        return new Promise((resolve, reject) => {
            let sql = "SELECT * FROM memories WHERE chat_id = ?";
            let params = [chatId];
            
            if (personName) {
                sql += " AND sender_name LIKE ?";
                params.push(`%${personName}%`);
            }
            
            sql += " ORDER BY timestamp DESC LIMIT 100"; // Get recent messages for similarity comparison
            
            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Calculate similarity for each message
                const results = rows.map(row => {
                    const messageEmbedding = JSON.parse(row.embedding);
                    const similarity = cosineSimilarity(queryEmbedding, messageEmbedding);
                    return {
                        ...row,
                        similarity: similarity
                    };
                });
                
                // Sort by similarity and return top 5
                const topResults = results
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, 5)
                    .filter(result => result.similarity > 0.5); // Only return results with good similarity
                
                resolve(topResults);
            });
        });
    } catch (error) {
        console.error('❌ Error searching memories:', error);
        throw error;
    }
}

// Format memory results for display
function formatMemoryResults(results) {
    if (!results || results.length === 0) {
        return "🤔 I don't have any memories about that topic.";
    }
    
    if (results.length === 1) {
        const result = results[0];
        const date = new Date(result.timestamp).toLocaleDateString();
        return `🧠 I remember: ${result.sender_name} said on ${date}: "${result.message}"`;
    }
    
    let response = `🧠 I found ${results.length} memories:\n\n`;
    results.forEach((result, index) => {
        const date = new Date(result.timestamp).toLocaleDateString();
        response += `${index + 1}. ${result.sender_name} (${date}): "${result.message}"\n`;
    });
    
    return response;
}

// Main memory handler - integrates with your existing bot
async function handleMemorySearch(userMessage, chatId, model) {
    try {
        // Configure the AI client for function calling
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            tools: [{
                functionDeclarations: memoryFunctionDeclarations
            }],
        });

        const response = result.response;
        const functionCalls = response.functionCalls();

        // Check for function calls in the response
        if (functionCalls && functionCalls.length > 0) {
            const functionCall = functionCalls[0];
            
            if (functionCall.name === 'search_memories') {
                console.log(`🧠 Searching memories for: ${functionCall.args.query}`);
                
                const results = await searchMemories(
                    chatId,
                    functionCall.args.query,
                    functionCall.args.person_name
                );
                
                if (results.length > 0) {
                    // Send results back to Gemini to formulate a natural response
                    const memoryContext = results.map(r => 
                        `${r.sender_name} said: "${r.message}" (${new Date(r.timestamp).toLocaleDateString()})`
                    ).join('\n');
                    
                    const contextResult = await model.generateContent({
                        contents: [{ role: "user", parts: [{ text: `User asked: "${userMessage}"\n\nRelevant memories:\n${memoryContext}\n\nPlease provide a natural response based on this information.` }] }],
                    });
                    
                    return contextResult.response.text();
                } else {
                    return "🤔 I don't have any memories about that topic.";
                }
            }
        }
        
        // If no function call, return regular response
        return response.text();
        
    } catch (error) {
        console.error('❌ Error in memory search:', error);
        return "❌ Sorry, I couldn't search my memories right now.";
    }
}

// Initialize database when module is loaded
initializeDatabase();

module.exports = {
    enableMemories,
    disableMemories,
    isMemoriesEnabled,
    storeMessage,
    searchMemories,
    handleMemorySearch,
    formatMemoryResults,
    memoryFunctionDeclarations
}; 
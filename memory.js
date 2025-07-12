const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Memory database setup
const DB_PATH = path.join(__dirname, 'memories', 'memories.db');

// Initialize Gemini for embeddings
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class MemoryManager {
    constructor() {
        this.db = null;
        this.init();
    }

    init() {
        // Create memories folder if it doesn't exist
        const memoriesDir = path.join(__dirname, 'memories');
        if (!fs.existsSync(memoriesDir)) {
            fs.mkdirSync(memoriesDir, { recursive: true });
        }

        // Initialize database
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ Error opening memories database:', err);
            } else {
                console.log('✅ Memories database connected');
                this.createTables();
            }
        });
    }

    createTables() {
        const createMemoriesTable = `
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                embedding TEXT
            )
        `;

        const createSettingsTable = `
            CREATE TABLE IF NOT EXISTS memory_settings (
                chat_id TEXT PRIMARY KEY,
                enabled BOOLEAN DEFAULT FALSE,
                enabled_at INTEGER,
                enabled_by TEXT
            )
        `;

        const createIndexes = `
            CREATE INDEX IF NOT EXISTS idx_chat_id ON memories(chat_id);
            CREATE INDEX IF NOT EXISTS idx_sender_name ON memories(sender_name);
            CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp);
        `;

        this.db.exec(createMemoriesTable, (err) => {
            if (err) console.error('❌ Error creating memories table:', err);
        });

        this.db.exec(createSettingsTable, (err) => {
            if (err) console.error('❌ Error creating settings table:', err);
        });

        this.db.exec(createIndexes, (err) => {
            if (err) console.error('❌ Error creating indexes:', err);
        });
    }

    // Settings Management
    async enableMemories(chatId, enabledBy) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO memory_settings (chat_id, enabled, enabled_at, enabled_by)
                VALUES (?, TRUE, ?, ?)
            `;
            
            this.db.run(sql, [chatId, Date.now(), enabledBy], function(err) {
                if (err) {
                    console.error('❌ Error enabling memories:', err);
                    reject(err);
                } else {
                    console.log(`✅ Memories enabled for chat: ${chatId}`);
                    resolve(true);
                }
            });
        });
    }

    async disableMemories(chatId) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE memory_settings 
                SET enabled = FALSE 
                WHERE chat_id = ?
            `;
            
            this.db.run(sql, [chatId], function(err) {
                if (err) {
                    console.error('❌ Error disabling memories:', err);
                    reject(err);
                } else {
                    console.log(`✅ Memories disabled for chat: ${chatId}`);
                    resolve(true);
                }
            });
        });
    }

    async isMemoryEnabled(chatId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT enabled FROM memory_settings 
                WHERE chat_id = ?
            `;
            
            this.db.get(sql, [chatId], (err, row) => {
                if (err) {
                    console.error('❌ Error checking memory settings:', err);
                    reject(err);
                } else {
                    resolve(row ? row.enabled : false);
                }
            });
        });
    }

    // Generate embedding for text
    async generateEmbedding(text) {
        try {
            const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
            const result = await model.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            console.error('❌ Error generating embedding:', error);
            return null;
        }
    }

    // Memory Storage
    async storeMessage(chatId, senderName, message, embedding = null) {
        try {
            // Generate embedding if not provided
            if (!embedding) {
                embedding = await this.generateEmbedding(message);
            }
            
            return new Promise((resolve, reject) => {
                const sql = `
                    INSERT INTO memories (chat_id, sender_name, message, timestamp, embedding)
                    VALUES (?, ?, ?, ?, ?)
                `;
                
                const embeddingStr = embedding ? JSON.stringify(embedding) : null;
                
                this.db.run(sql, [chatId, senderName, message, Date.now(), embeddingStr], function(err) {
                    if (err) {
                        console.error('❌ Error storing message:', err);
                        reject(err);
                    } else {
                        console.log(`💾 Stored memory: ${senderName} - ${message.substring(0, 50)}...`);
                        resolve(this.lastID);
                    }
                });
            });
        } catch (error) {
            console.error('❌ Error in storeMessage:', error);
            throw error;
        }
    }

    // Memory Search (Vector Similarity Search)
    async searchMemories(chatId, query, personName = null) {
        try {
            // Generate embedding for the search query
            const queryEmbedding = await this.generateEmbedding(query);
            
            if (!queryEmbedding) {
                // Fall back to text search if embedding fails
                return await this.searchMemoriesText(chatId, query, personName);
            }
            
            // Use vector similarity search
            return await this.searchMemoriesWithEmbedding(chatId, queryEmbedding, personName);
            
        } catch (error) {
            console.error('❌ Error in vector search, falling back to text search:', error);
            return await this.searchMemoriesText(chatId, query, personName);
        }
    }

    // Fallback text search method
    async searchMemoriesText(chatId, query, personName = null) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT sender_name, message, timestamp, 
                       datetime(timestamp/1000, 'unixepoch') as readable_time
                FROM memories 
                WHERE chat_id = ?
            `;
            
            let params = [chatId];
            
            // Add person filter if specified
            if (personName && personName.trim()) {
                sql += ` AND sender_name LIKE ?`;
                params.push(`%${personName.trim()}%`);
            }
            
            // Add query filter if specified
            if (query && query.trim()) {
                const keywords = query.trim().split(' ').filter(word => word.length > 2);
                if (keywords.length > 0) {
                    sql += ` AND (`;
                    keywords.forEach((keyword, index) => {
                        if (index > 0) sql += ` OR `;
                        sql += `message LIKE ?`;
                        params.push(`%${keyword}%`);
                    });
                    sql += `)`;
                }
            }
            
            sql += ` ORDER BY timestamp DESC LIMIT 10`;
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ Error searching memories:', err);
                    reject(err);
                } else {
                    console.log(`🔍 Found ${rows.length} memories (text search) for query: "${query}" by "${personName}"`);
                    resolve(rows);
                }
            });
        });
    }

    // Vector Search with embeddings
    async searchMemoriesWithEmbedding(chatId, queryEmbedding, personName = null) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT sender_name, message, timestamp, embedding,
                       datetime(timestamp/1000, 'unixepoch') as readable_time
                FROM memories 
                WHERE chat_id = ? AND embedding IS NOT NULL
            `;
            
            let params = [chatId];
            
            if (personName && personName.trim()) {
                sql += ` AND sender_name LIKE ?`;
                params.push(`%${personName.trim()}%`);
            }
            
            sql += ` ORDER BY timestamp DESC LIMIT 100`;
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ Error searching memories with embeddings:', err);
                    reject(err);
                } else {
                    try {
                        // Calculate similarity scores
                        const results = rows.map(row => {
                            try {
                                const embedding = JSON.parse(row.embedding);
                                const similarity = this.cosineSimilarity(queryEmbedding, embedding);
                                return {
                                    sender_name: row.sender_name,
                                    message: row.message,
                                    timestamp: row.timestamp,
                                    readable_time: row.readable_time,
                                    similarity
                                };
                            } catch (parseError) {
                                console.error('❌ Error parsing embedding:', parseError);
                                return null;
                            }
                        }).filter(result => result !== null);
                        
                        // Sort by similarity and return top results
                        results.sort((a, b) => b.similarity - a.similarity);
                        
                        // Filter by minimum similarity threshold (0.5 = decent match)
                        const goodMatches = results.filter(r => r.similarity > 0.5);
                        
                        console.log(`🔍 Found ${goodMatches.length} vector matches for query: "${queryEmbedding.length} dims" by "${personName}"`);
                        console.log(`📊 Top similarity: ${goodMatches[0]?.similarity.toFixed(3) || 'none'}`);
                        
                        resolve(goodMatches.slice(0, 10));
                    } catch (error) {
                        console.error('❌ Error processing similarity results:', error);
                        reject(error);
                    }
                }
            });
        });
    }

    // Cosine similarity calculation
    cosineSimilarity(a, b) {
        if (a.length !== b.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // Memory Statistics
    async getMemoryStats(chatId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as total_messages,
                    COUNT(DISTINCT sender_name) as unique_senders,
                    MIN(timestamp) as first_message,
                    MAX(timestamp) as last_message
                FROM memories 
                WHERE chat_id = ?
            `;
            
            this.db.get(sql, [chatId], (err, row) => {
                if (err) {
                    console.error('❌ Error getting memory stats:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Clear memories for a chat
    async clearMemories(chatId) {
        return new Promise((resolve, reject) => {
            const sql = `DELETE FROM memories WHERE chat_id = ?`;
            
            this.db.run(sql, [chatId], function(err) {
                if (err) {
                    console.error('❌ Error clearing memories:', err);
                    reject(err);
                } else {
                    console.log(`🗑️ Cleared ${this.changes} memories for chat: ${chatId}`);
                    resolve(this.changes);
                }
            });
        });
    }

    // Close database connection
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('❌ Error closing memories database:', err);
                } else {
                    console.log('✅ Memories database closed');
                }
            });
        }
    }
}

// Create singleton instance
const memoryManager = new MemoryManager();

module.exports = memoryManager; 
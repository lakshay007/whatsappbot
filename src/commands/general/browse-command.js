const Command = require('../base/command');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

class BrowseCommand extends Command {
    constructor() {
        super('browse', 'Browse the web using AI agent', {
            category: 'General'
        });
    }

    async execute(message, args, context) {
        try {
            const instruction = args.join(' ').trim();
            
            if (!instruction) {
                await message.reply('🌐 Please provide instructions for browsing.\n\nExample: `?browse fetch latest news from hackernews`');
                return;
            }

            await message.reply('🤖 Starting browser agent... This may take a moment.');
            
            const result = await this.executeBrowserAgent(instruction);
            
            if (result.success) {
                await message.reply(`🌐 **Browser Agent Result:**\n\n${result.message}`);
            } else {
                await message.reply(`❌ **Browser Agent Error:**\n\n${result.error}`);
            }
            
            console.log(`🌐 Browse command executed for user: ${message.author || message.from}`);
            
        } catch (error) {
            await this.handleError(message, error, 'executing browse command');
        }
    }

    async executeBrowserAgent(instruction) {
        return new Promise((resolve) => {
            try {
                const homeDir = os.homedir();
                const browserAgentPath = path.join(homeDir, 'browseragent');
                const indexPath = path.join(browserAgentPath, 'index.ts');

                console.log(`🚀 Executing browser agent with instruction: "${instruction}"`);
                console.log(`📂 Browser agent path: ${browserAgentPath}`);

                // Check if the browser agent directory exists
                const fs = require('fs');
                if (!fs.existsSync(browserAgentPath)) {
                    resolve({
                        success: false,
                        error: `Browser agent directory not found at ${browserAgentPath}`
                    });
                    return;
                }

                if (!fs.existsSync(indexPath)) {
                    resolve({
                        success: false,
                        error: `Browser agent index.ts not found at ${indexPath}`
                    });
                    return;
                }

                // Modify the instruction in the index.ts file temporarily
                const originalContent = fs.readFileSync(indexPath, 'utf8');
                const modifiedContent = originalContent.replace(
                    /const INSTRUCTION\s*=\s*["`'].*["`'];/,
                    `const INSTRUCTION = "${instruction.replace(/"/g, '\\"')}";`
                );

                fs.writeFileSync(indexPath, modifiedContent);

                // Execute the browser agent using npx tsx
                const child = spawn('npx', ['tsx', 'index.ts'], {
                    cwd: browserAgentPath,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let stdout = '';
                let stderr = '';

                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                // Set timeout for browser agent execution
                const timeout = setTimeout(() => {
                    child.kill('SIGTERM');
                    resolve({
                        success: false,
                        error: 'Browser agent execution timed out (120 seconds)'
                    });
                }, 120000); // 120 seconds timeout

                child.on('close', (code) => {
                    clearTimeout(timeout);
                    
                    // Restore original content
                    try {
                        fs.writeFileSync(indexPath, originalContent);
                    } catch (restoreError) {
                        console.error('❌ Error restoring original content:', restoreError);
                    }

                    if (code === 0) {
                        // Parse the result from stdout
                        try {
                            console.log('🔍 Browser agent raw output:', stdout);
                            
                            let resultMessage = 'Browser agent completed successfully';
                            
                            // Look for everything after the JSON ends (after "completed": true })
                            const jsonEndPattern = /"completed":\s*true\s*}\s*\n/;
                            const match = stdout.match(jsonEndPattern);
                            
                            if (match) {
                                // Get everything after the JSON ends
                                const afterJson = stdout.substring(match.index + match[0].length);
                                
                                // Clean up the text by removing log messages and keeping only the actual content
                                const cleanLines = afterJson
                                    .split('\n')
                                    .filter(line => {
                                        const trimmed = line.trim();
                                        return trimmed && 
                                               !trimmed.includes('✅ Found clean message:') &&
                                               !trimmed.includes('✅ Browse request completed') &&
                                               !trimmed.includes('💓 Keep-alive') &&
                                               !trimmed.includes('INFO') &&
                                               !trimmed.includes('ERROR') &&
                                               !trimmed.includes('[32m') &&
                                               !trimmed.match(/^\[\d{4}-\d{2}-\d{2}/);
                                    })
                                    .map(line => line.trim())
                                    .filter(line => line.length > 0);
                                
                                                                 if (cleanLines.length > 0) {
                                     resultMessage = cleanLines.join('\n');
                                     console.log('✅ Found clean message after JSON:', resultMessage);
                                 } else {
                                     console.log('❌ No clean content found after JSON');
                                 }
                             } else {
                                 // Fallback: try to extract from JSON
                                 const resultMatch = stdout.match(/⤷ Result:\s*\n([\s\S]*?)(?:\n[A-Za-z]|$)/);
                                 if (resultMatch) {
                                     const jsonStr = resultMatch[1].trim();
                                     try {
                                         const result = JSON.parse(jsonStr);
                                         resultMessage = result.message || resultMessage;
                                         console.log('✅ Extracted from JSON:', resultMessage);
                                     } catch (parseError) {
                                         console.log('❌ JSON parse failed, using raw text');
                                         resultMessage = resultMatch[1].trim();
                                     }
                                 }
                             }

                            resolve({
                                success: true,
                                message: resultMessage
                            });
                        } catch (parseError) {
                            console.error('❌ Error parsing browser agent result:', parseError);
                            resolve({
                                success: true,
                                message: 'Browser agent completed but result parsing failed. Check console for details.'
                            });
                        }
                    } else {
                        console.error('❌ Browser agent error output:', stderr);
                        resolve({
                            success: false,
                            error: stderr || 'Browser agent execution failed'
                        });
                    }
                });

                child.on('error', (error) => {
                    clearTimeout(timeout);
                    
                    // Restore original content
                    try {
                        fs.writeFileSync(indexPath, originalContent);
                    } catch (restoreError) {
                        console.error('❌ Error restoring original content:', restoreError);
                    }

                    resolve({
                        success: false,
                        error: `Failed to execute browser agent: ${error.message}`
                    });
                });

            } catch (error) {
                console.error('❌ Browser agent execution error:', error);
                resolve({
                    success: false,
                    error: `Browser agent error: ${error.message}`
                });
            }
        });
    }

    getHelpText() {
        return `${this.getUsage()} <instruction> - ${this.description}. Example: ?browse fetch latest news from hackernews`;
    }
}

module.exports = BrowseCommand; 
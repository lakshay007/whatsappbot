const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

class BrowserAgent {
    constructor(options = {}) {
        this.pythonScript = options.pythonScript || path.join(__dirname, 'browser_agent.py');
        this.pythonPath = options.pythonPath || 'python';
        this.timeout = options.timeout || 120000; // 2 minutes default timeout
        
        console.log('🔗 Browser Agent Client initialized');
        console.log(`📜 Python script: ${this.pythonScript}`);
        console.log(`🐍 Python path: ${this.pythonPath}`);
    }

    async runTask(task, options = {}) {
        const { url, headless = true } = options;
        
        return new Promise((resolve, reject) => {
            console.log(`🚀 Starting browser task: ${task}`);
            if (url) console.log(`🔗 Starting URL: ${url}`);
            
            // Prepare the input data
            const inputData = {
                task: task,
                url: url,
                headless: headless
            };
            
            // Spawn Python process
            const pythonProcess = spawn(this.pythonPath, [this.pythonScript], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            // Set up timeout
            const timeoutId = setTimeout(() => {
                pythonProcess.kill('SIGTERM');
                reject(new Error(`Task timed out after ${this.timeout}ms`));
            }, this.timeout);
            
            // Handle stdout (JSON result)
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            // Handle stderr (logs)
            pythonProcess.stderr.on('data', (data) => {
                const message = data.toString().trim();
                if (message) {
                    console.log(`🐍 Python: ${message}`);
                }
                stderr += message;
            });
            
            // Handle process completion
            pythonProcess.on('close', (code) => {
                clearTimeout(timeoutId);
                
                if (code === 0) {
                    console.log('✅ Browser task completed successfully');
                    console.log('\n📊 Python Output:');
                    console.log(stdout);
                    resolve({ success: true, output: stdout });
                } else {
                    console.error(`❌ Python process exited with code ${code}`);
                    console.log('\n📊 Python Output:');
                    console.log(stdout);
                    console.log('\n🔥 Error Output:');
                    console.log(stderr);
                    resolve({ success: false, error: `Process failed with code ${code}`, output: stdout, stderr: stderr });
                }
            });
            
            // Handle process errors
            pythonProcess.on('error', (error) => {
                clearTimeout(timeoutId);
                console.error('❌ Python process error:', error);
                reject(new Error(`Failed to start Python process: ${error.message}`));
            });
            
            // Send input data to Python
            pythonProcess.stdin.write(JSON.stringify(inputData));
            pythonProcess.stdin.end();
        });
    }

    async search(query) {
        const task = `Search for "${query}" on Google and provide a summary of the top results`;
        return await this.runTask(task);
    }

    async extractData(url, what) {
        const task = `Extract the following information: ${what}`;
        return await this.runTask(task, { url });
    }

    async screenshot(url) {
        const task = `Take a screenshot and describe what you see on the page`;
        return await this.runTask(task, { url });
    }

    async fillForm(url, formData) {
        const task = `Fill out the form with the following data: ${JSON.stringify(formData)}`;
        return await this.runTask(task, { url });
    }

    async navigate(url, action) {
        const task = `Navigate to the page and ${action}`;
        return await this.runTask(task, { url });
    }

    async customTask(task, url = null, headless = true) {
        return await this.runTask(task, { url, headless });
    }
}

// Demo functions
async function runDemo() {
    console.log('🎯 Starting Simple Browser Agent Demo');
    console.log('=====================================');
    
    const agent = new BrowserAgent();
    
    console.log('\n🔄 Running demo tasks...\n');
    
    // Demo 1: Simple web search
    console.log('📋 Demo 1: Web Search');
    console.log('---------------------');
    try {
        const searchResult = await agent.search('latest AI news');
        console.log('🎉 Search Result:', searchResult.result);
    } catch (error) {
        console.log('❌ Search failed:', error.message);
    }
    
    await delay(2000);
    
    // Demo 2: Extract data from a website
    console.log('\n📋 Demo 2: Data Extraction');
    console.log('---------------------------');
    try {
        const extractResult = await agent.extractData('https://news.ycombinator.com', 'top 3 story titles');
        console.log('🎉 Extraction Result:', extractResult.result);
    } catch (error) {
        console.log('❌ Extraction failed:', error.message);
    }
    
    await delay(2000);
    
    // Demo 3: Screenshot and describe
    console.log('\n📋 Demo 3: Screenshot Analysis');
    console.log('------------------------------');
    try {
        const screenshotResult = await agent.screenshot('https://example.com');
        console.log('🎉 Screenshot Result:', screenshotResult.result);
    } catch (error) {
        console.log('❌ Screenshot failed:', error.message);
    }
    
    await delay(2000);
    
    // Demo 4: Custom task
    console.log('\n📋 Demo 4: Custom Task');
    console.log('----------------------');
    try {
        const customResult = await agent.customTask(
            'Find the weather for New York City',
            'https://weather.com'
        );
        console.log('🎉 Custom Task Result:', customResult.result);
    } catch (error) {
        console.log('❌ Custom task failed:', error.message);
    }
    
    console.log('\n🎯 Demo completed!');
    console.log('==================');
}

// Interactive demo
async function runInteractiveDemo() {
    console.log('🎯 Interactive Browser Agent Demo');
    console.log('==================================');
    
    const agent = new BrowserAgent();
    
    console.log('\n💡 Available commands:');
    console.log('  - search <query> - Search for information');
    console.log('  - extract <url> <what> - Extract data from URL');
    console.log('  - screenshot <url> - Take screenshot and describe');
    console.log('  - task <task> [url] - Run custom task');
    console.log('  - exit - Exit the demo');
    
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const askQuestion = (question) => {
        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                resolve(answer);
            });
        });
    };
    
    while (true) {
        try {
            const input = await askQuestion('\n🤖 Enter command: ');
            const [command, ...args] = input.trim().split(' ');
            
            if (command === 'exit') {
                break;
            }
            
            switch (command) {
                case 'search':
                    const query = args.join(' ');
                    if (query) {
                        const result = await agent.search(query);
                        console.log('📊 Result:', result);
                    } else {
                        console.log('❌ Please provide a search query');
                    }
                    break;
                    
                case 'extract':
                    const url = args[0];
                    const what = args.slice(1).join(' ');
                    if (url && what) {
                        const result = await agent.extractData(url, what);
                        console.log('📊 Result:', result);
                    } else {
                        console.log('❌ Please provide URL and what to extract');
                    }
                    break;
                    
                case 'screenshot':
                    const screenshotUrl = args[0];
                    if (screenshotUrl) {
                        const result = await agent.screenshot(screenshotUrl);
                        console.log('📊 Result:', result);
                    } else {
                        console.log('❌ Please provide a URL');
                    }
                    break;
                    
                case 'task':
                    const taskDescription = args.join(' ');
                    if (taskDescription) {
                        const result = await agent.customTask(taskDescription);
                        console.log('📊 Result:', result);
                    } else {
                        console.log('❌ Please provide a task description');
                    }
                    break;
                    
                default:
                    console.log('❌ Unknown command. Available: search, extract, screenshot, task, exit');
            }
        } catch (error) {
            console.error('❌ Error:', error.message);
        }
    }
    
    rl.close();
    console.log('👋 Goodbye!');
}

// Utility function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for use in other modules
module.exports = BrowserAgent;

// Run demo if this file is executed directly
if (require.main === module) {
    const mode = process.argv[2] || 'demo';
    
    if (mode === 'interactive') {
        runInteractiveDemo().catch(console.error);
    } else {
        runDemo().catch(console.error);
    }
} 
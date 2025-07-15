const BrowserAgent = require('./browser_client');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to ask user a question
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function main() {
    console.log('🚀 Browser Agent Demo');
    console.log('====================');
    console.log('Enter a task and watch the AI browse the web!\n');
    
    // Initialize browser agent
    const agent = new BrowserAgent();
    
    try {
        // Get task from user
        const task = await askQuestion('Enter your browsing task: ');
        
        if (!task.trim()) {
            console.log('❌ No task provided. Exiting...');
            process.exit(1);
        }
        
        // Ask if they want to specify a URL
        const needUrl = await askQuestion('Do you want to specify a starting URL? (y/n): ');
        let url = null;
        
        if (needUrl.toLowerCase() === 'y' || needUrl.toLowerCase() === 'yes') {
            url = await askQuestion('Enter starting URL: ');
        }
        
        // Ask about headless mode
        const headlessChoice = await askQuestion('Run in headless mode? (y/n): ');
        const headless = headlessChoice.toLowerCase() !== 'n' && headlessChoice.toLowerCase() !== 'no';
        
        console.log('\n🔄 Processing your request...');
        console.log(`📋 Task: ${task}`);
        if (url) console.log(`🔗 URL: ${url}`);
        console.log(`👀 Headless: ${headless ? 'Yes' : 'No'}`);
        console.log('\n⏳ Please wait while the AI browses the web...\n');
        
        // Run the task
        const result = await agent.runTask(task, { url, headless });
        
        // Print results
        console.log('\n' + '='.repeat(50));
        console.log('📊 RESULTS');
        console.log('='.repeat(50));
        
        if (result.success) {
            console.log('✅ Status: Success');
            console.log(`📝 Task: ${task}`);
            console.log('\n📋 Full Output:');
            console.log(result.output);
        } else {
            console.log('❌ Status: Failed');
            console.log(`📝 Task: ${task}`);
            console.log(`🔥 Error: ${result.error}`);
            if (result.output) {
                console.log('\n📋 Output:');
                console.log(result.output);
            }
            if (result.stderr) {
                console.log('\n🔥 Error Details:');
                console.log(result.stderr);
            }
        }
        
        console.log('\n' + '='.repeat(50));
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        rl.close();
        console.log('\n👋 Demo completed!');
    }
}

// Run the demo
main().catch(console.error); 
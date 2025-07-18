import { Stagehand } from "@browserbasehq/stagehand";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Simple function to execute browse instruction
export async function executeBrowseInstruction(instruction, maxSteps = 20) {
    console.log(`\n🤘 Starting Stagehand browser execution\n`);

    // Initialize Stagehand with the exact same config as bbheadless
    const stagehand = new Stagehand({
        verbose: 1,
        domSettleTimeoutMs: 30000,
        modelName: "google/gemini-2.5-flash-lite-preview-06-17",
        modelClientOptions: {
            apiKey: process.env.GOOGLE_API_KEY,
        },
        env: "BROWSERBASE",
        apiKey: process.env.BROWSERBASE_API_KEY,
        projectId: process.env.BROWSERBASE_PROJECT_ID,
        browserbaseSessionID: undefined,
        browserbaseSessionCreateParams: {
            projectId: process.env.BROWSERBASE_PROJECT_ID,
            browserSettings: {
                blockAds: true,
                viewport: {
                    width: 1024,
                    height: 768,
                },
            },
        },
        localBrowserLaunchOptions: {
            viewport: {
                width: 1024,
                height: 768,
            },
        },
    });

    await stagehand.init();

    try {
        const agent = stagehand.agent();

        // Execute the agent - exactly like bbheadless
        console.log(`↳ Instruction: ${instruction}`);
        const result = await agent.execute({
            instruction: instruction,
            maxSteps: maxSteps,
        });

        console.log(`✓ Execution complete`);
        console.log(`⤷ Result:`);
        console.log(JSON.stringify(result, null, 2));
        console.log(result.message);
        
        return {
            success: true,
            message: result.message,
            data: result
        };
    } catch (error) {
        console.log(`✗ Error: ${error}`);
        return {
            success: false,
            message: `Error: ${error.message}`,
            error: error.message
        };
    } finally {
        await stagehand.close();
    }
} 
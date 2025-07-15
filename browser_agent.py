#!/usr/bin/env python3
"""
Simple Browser Agent using browser-use with Gemini 2.0-flash-exp
Accepts task via command line arguments or JSON input from stdin
"""

import asyncio
import sys
import json
import os
from dotenv import load_dotenv
from browser_use.llm import ChatGoogle
from browser_use import Agent

# Load environment variables
load_dotenv()



def setup_llm():
    """Setup Gemini 2.0-flash-exp model"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")
    
    return ChatGoogle(model='gemini-2.0-flash')

async def run_browser_task(task, start_url=None, headless=True):
    """Run a browser automation task"""
    try:
        # Setup LLM
        llm = setup_llm()
        
        # Create full task with URL if provided
        if start_url:
            full_task = f"Go to {start_url} and then: {task}"
        else:
            full_task = task
            
        print(f"🔄 Executing task: {full_task}", file=sys.stderr)
        
        # Create and run agent with simple API
        agent = Agent(
            task=full_task,
            llm=llm,
        )
        
        result = await agent.run()
        
        print(f"✅ Task completed successfully", file=sys.stderr)
        return {
            'success': True,
            'result': str(result),
            'task': full_task
        }
        
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e),
            'task': task
        }

def main():
    """Main function to handle different input methods"""
    try:
        # Check if input is coming from stdin (JSON)
        if not sys.stdin.isatty():
            # Read JSON from stdin
            input_data = sys.stdin.read().strip()
            if input_data:
                try:
                    data = json.loads(input_data)
                    task = data.get('task', '')
                    start_url = data.get('url', None)
                    headless = data.get('headless', True)
                except json.JSONDecodeError:
                    # If not valid JSON, treat as plain text task
                    task = input_data
                    start_url = None
                    headless = True
            else:
                print("Error: No input provided", file=sys.stderr)
                sys.exit(1)
        else:
            # Use command line arguments
            if len(sys.argv) < 2:
                print("Usage: python browser_agent.py '<task>' [url] [--no-headless]", file=sys.stderr)
                print("   or: echo '<task>' | python browser_agent.py", file=sys.stderr)
                print("   or: echo '{\"task\": \"<task>\", \"url\": \"<url>\"}' | python browser_agent.py", file=sys.stderr)
                sys.exit(1)
            
            task = sys.argv[1]
            start_url = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else None
            headless = '--no-headless' not in sys.argv

        # Run the browser task
        result = asyncio.run(run_browser_task(task, start_url, headless))
        
        # Output result as JSON
        print(json.dumps(result, indent=2))
        
        # Exit with appropriate code
        sys.exit(0 if result['success'] else 1)
        
    except KeyboardInterrupt:
        print("\n❌ Task interrupted by user", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 
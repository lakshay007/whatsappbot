/**
 * Function declarations for Gemini function calling
 * These define the functions available to the AI
 */

const functionDeclarations = [
    {
        name: 'getCurrentTime',
        description: 'Get the current time in a specific timezone. Useful when user asks what time it is.',
        parameters: {
            type: 'object',
            properties: {
                timezone: {
                    type: 'string',
                    description: 'The timezone to get time for (e.g., "Asia/Kolkata", "America/New_York", "UTC")',
                    enum: ['Asia/Kolkata', 'America/New_York', 'Europe/London', 'UTC', 'Asia/Tokyo']
                }
            },
            required: ['timezone']
        }
    },
    {
        name: 'calculateExpression',
        description: 'Calculate a mathematical expression. Use this when user asks to perform calculations.',
        parameters: {
            type: 'object',
            properties: {
                expression: {
                    type: 'string',
                    description: 'The mathematical expression to calculate (e.g., "2+2", "10*5", "sqrt(16)")'
                }
            },
            required: ['expression']
        }
    }
];

/**
 * Actual function implementations
 * These execute when AI calls the function
 */
const functionImplementations = {
    getCurrentTime: ({ timezone }) => {
        try {
            const now = new Date();
            const timeString = now.toLocaleString('en-US', { 
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            return {
                timezone: timezone,
                currentTime: timeString,
                timestamp: now.toISOString()
            };
        } catch (error) {
            return { error: `Failed to get time for timezone: ${timezone}` };
        }
    },

    calculateExpression: ({ expression }) => {
        try {
            // Safe eval using Function constructor (limited to math operations)
            // Replace common math functions
            const sanitized = expression
                .replace(/sqrt\(/g, 'Math.sqrt(')
                .replace(/pow\(/g, 'Math.pow(')
                .replace(/abs\(/g, 'Math.abs(')
                .replace(/round\(/g, 'Math.round(')
                .replace(/floor\(/g, 'Math.floor(')
                .replace(/ceil\(/g, 'Math.ceil(');
            
            // Basic validation - only allow numbers, operators, and Math functions
            if (!/^[0-9+\-*/(). Math.sqrt,pow,abs,round,floor,ceil]+$/.test(sanitized)) {
                throw new Error('Invalid expression');
            }
            
            const result = Function(`"use strict"; return (${sanitized})`)();
            return {
                expression: expression,
                result: result,
                formatted: `${expression} = ${result}`
            };
        } catch (error) {
            return { 
                error: `Failed to calculate expression: ${expression}`,
                message: error.message 
            };
        }
    }
};

module.exports = {
    functionDeclarations,
    functionImplementations
};


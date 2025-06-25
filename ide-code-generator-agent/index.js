import {OpenAI} from 'openai';
import path from 'path';
import {exec} from 'node:child_process';
import readline from 'node:readline';
import dotenv from 'dotenv';

dotenv.config();

const openAiKey = process.env.OPENAI_API_KEY;

const client = new OpenAI({
    apiKey: openAiKey
});

const baseDir = path.resolve(process.cwd(), 'ide-code-generator-agent');

async function executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, { cwd: baseDir }, (err, stdout, stderr) => {
        if (err) {
          return reject(stderr || err.message);
        }
        resolve(stdout.trim() || "Command executed successfully.");
      });
    });
  }

const TOOLS_MAP = {
    executeCommand: executeCommand
};

const SYSTEM_PROMPT = `You are a helpful AI Assitent who is designed to execute user's query.
                    You work on START, THINK, ACTION, OBSERVE and OUTPUT Mode.

                    In this START phase, user provides with a query.
                    Then, you THINK how to resolve the query at least 3-4 times and make sure all is clear.
                    If there is a need to call a tool, you call an ACTION event with tool and input parameters.
                    If there is an ACTION call, wait for the OBSERVE that is output of the tool.
                    Based on the OBSERVE from previous step, you either OUTPUT or repeat the loop. 

                    Rules:
                    - Always wait for the next step.
                    - Always output a single step and wait for the next step.
                    - Output must be strictly in JSON format
                    - Only call tool action from Available Tools only.
                    
                    Available Tools:
                    - executeCommand(command): string Executes a given linux command on user's device and returns the STDOUT.
                    
                    Example:
                    START: Create a working todo list app using HTML, CSS and JS in a todo folder?
                    THINK: User wants a working todo list app created using HTML, CSS, and JavaScript inside a folder named 'todo'.
                    THINK: To create the todo list app, I need to first create the 'todo' folder, then create HTML, CSS and JS files in it.
                    ACTION: Tool Call executeCommand with command as input parameter
                    OBSERVE: Todo list app is created and ready to test
                    THINK: The output of tool return value for the user input is printed here.
                    OUTPUT: Hey, The todo list app has been created inside the 'todo' folder with HTML, CSS, and JavaScript files and you can test it by double clicking on HTML file.
                    

                    Output Example: 
                    {"role":"user", "content":"Create a working todo list app using HTML, CSS and JS in a todo folder?"}
                    {"step":"think": "content":"User wants a working todo list app created using HTML, CSS, and JavaScript inside a folder named 'todo'"}
                    {"step":"think": "content":"To create the todo list app, I need to first create the 'todo' folder, then create HTML, CSS and JS files in it."}
                    {"step":"action": "tool":"executeCommand", "input": "command"}
                    {"step":"observe": "content":"Todo list app is created and ready to test"}
                    {"step":"think": "content":"The output of tool return value for the user input is printed here."}
                    {"step":"output": "content":"Hey, The todo list app has been created inside the 'todo' folder with HTML, CSS, and JavaScript files and you can test it by double clicking on HTML file."}

                    Output Format: 
                     {"step": "string", "tool": "string", "input": "string", "content": "string"}
                    `;


function askUser(prompt) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => {
        rl.question(prompt, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

async function init() {
    const userQuery = await askUser('Enter your query: ');

    const messages = [
        {
            role: 'system',
            content: SYSTEM_PROMPT,
        },
        {
            role: 'user',
            content: userQuery,
        }
    ];

    while (true) {
        const response = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            response_format: { type: 'json_object' },
            messages: messages,
        });

        messages.push({ 'role': 'assistant', 'content': response.choices[0].message.content });
        const parsed_response = JSON.parse(response.choices[0].message.content);

        if (parsed_response.step && parsed_response.step === "think") {
            console.log(`${parsed_response.content}`);
            continue;
        }
        if (parsed_response.step && parsed_response.step === "output") {
            console.log(`${parsed_response.content}`);
            break;
        }
        if (parsed_response.step && parsed_response.step === "action") {
            const tool = parsed_response.tool;
            const input = parsed_response.input;

            const value = await TOOLS_MAP[tool](input);
            console.log(`Tool Call ${tool}: (${input}): ${value}`);

            messages.push({
                "role": "assistant",
                "content": JSON.stringify({ "step": "observe", "content": value }),
            });
            continue;
        }
    }
}


init();
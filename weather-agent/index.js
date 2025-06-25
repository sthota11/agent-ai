import OpenAI from 'openai';
import dotenv from 'dotenv';
import readLineSync from 'readline-sync';
import axios from 'axios';

dotenv.config();

// This OPEN_API_KEY is coming from .env file in the parent module of this repo. Create your own OpenAI key and add it to
// .env file like this OPEN_API_KEY=sk-proj-yourAPIKey
const openAiKey = process.env.OPENAI_API_KEY;

const client = new OpenAI({
    apiKey: openAiKey
});

function describeWeather(tempC, weatherCode) {
    let condition;
  
    // Determine basic condition from weather code
    const rainyCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82];
    const snowyCodes = [71, 73, 75, 77, 85, 86];
    const foggyCodes = [45, 48];
  
    if (rainyCodes.includes(weatherCode)) {
      condition = "rainy";
    } else if (snowyCodes.includes(weatherCode)) {
      condition = "snowy";
    } else if (foggyCodes.includes(weatherCode)) {
      condition = "foggy";
    } else {
      if (tempC >= 35) condition = "extremely hot";
      else if (tempC >= 28) condition = "hot";
      else if (tempC >= 18) condition = "pleasant";
      else if (tempC >= 8) condition = "cool";
      else condition = "cold";
    }
  
    return condition;
  }

// Tools
async function getWeatherInfo(city) {
    console.log(`The Weather we are fetching for the city is ${city}`)
    try {
        // Step 1: Get lat/lon for the city
        const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search`, {
          params: {
            name: city,
            count: 1,
            language: 'en',
            format: 'json'
          }
        });
    
        const location = geoRes.data.results?.[0];
        if (!location) {
            console.log(`location not found for ${city}`);
          return `Could not find location for ${city}.`;
        }
    
        const { latitude, longitude } = location;
    
        // Step 2: Get current weather
        const weatherRes = await axios.get('https://api.open-meteo.com/v1/forecast', {
          params: {
            latitude,
            longitude,
            current_weather: true
          }
        });
    
        const weather = weatherRes.data.current_weather;
        if (!weather) return `Weather data not available for "${city}".`;
    
        const temperature = weather.temperature;
        const windspeed = weather.windspeed;
        const weatherCode = weather.weathercode;
        const condition = describeWeather(temperature, weatherCode);
    
        return `The current weather in ${city} is ${condition} (${temperature}°C, wind ${windspeed} km/h).`;
      } catch (err) {
        console.error(`Weather API error for ${city}:`, err.message);
        return `Error fetching weather info for "${city}".`;
      }
}

const tools = {
    'getWeatherInfo': getWeatherInfo
}


// This chunk gives us an error showcasing the LLM doesn't have an ability to access real-time data
// Which is where Agents Step-in
/* 
const user = "Hey, what is the weather of fremont?";
client.chat.completions.create({
    model: "gpt-4",
    messages: [{role: 'user', content:user}]
}).then((e) => {
    console.log(e.choices[0].message.content)
}) */

const SYSTEM_PROMPT = `
You are an AI assistent with START,PLAN,ACTION,OBSERVATION, and OUTPUT State.
Wait for the user prompt and first PLAN using available tools.
After Planning, Take an action with appropriate tools and wait for OBSERVATION based on ACTION.
Once you get the OBSERVATION, Return the AI response based on the START prompt and OBSERVATIONS.

Strictly follow the JSON output format as in examples.

Available Tools:
function getWeatherInfo(city: string): string
getWeatherInfo is a function that accepts city as a string and returns weather details.

Example: 
START
{"type": "user", "user": "Can you give me the weather details of Fremont and Boston and tell me if its hot or cold or pleasant?"}
{"type": "plan", "plan": "I will call the getWeatherInfo for Fremont"}
{"type": "action", "function": "getWeatherInfo", "input": "Fremont"}
{"type": "observation", "observation": "35 Degree C"}
{"type": "plan", "plan":"I will call the getWeatherInfo for Boston"}
{"type": "action", "function":"getWeatherInfo", "input":"Boston"}
{"type": "observation", "observation":"6 Degrees C"}
{"type":"output', "output": "Fremont is experiencing hot weather at 35°C, whereas Boston is much colder at 6°C"}

`;


const userContent = "Hey, What is the weather of Fremont and Boston and give me how it feels?"


/* async function chat() {
    const result = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {role: 'system', content: SYSTEM_PROMPT},
            {role: 'user', content:userContent}
        ]
    }).then((e) => {
        console.log(e.choices[0].message.content)
    })

}

chat(); */;

const messages = [{ role: 'system', content: SYSTEM_PROMPT}];

async function main() {
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  
    while (true) {
      const query = readLineSync.question('>> ');
      const q = { type: 'user', user: query };
      messages.push({ role: 'user', content: JSON.stringify(q) });
  
      while (true) {
        const chat = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: messages,
          response_format: { type: 'json_object' }
        });
  
        const result = chat.choices[0].message.content;
        messages.push({ role: 'assistant', content: result });
  
        console.log(`\n------------- Start AI --------------`);
        console.log(result);
        console.log(`------------- End AI --------------\n`);
  
        const call = JSON.parse(result);
  
        if (call.type === "output") {
          console.log(`Output: ${call.output}`);
          break;
        } else if (call.type === "action") {
          const fn = tools[call.function];
          const observation = await fn(call.input);
          const obs = { type: "observation", observation };
          messages.push({ role: 'developer', content: JSON.stringify(obs) });
        }
      }
    }
  }

  main();
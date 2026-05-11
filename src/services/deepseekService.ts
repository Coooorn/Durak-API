import { GameState, AiResponse } from "../types";

export async function getDeepSeekStrategy(state: GameState, apiKey: string, isTakeScenario: boolean = false): Promise<AiResponse> {
  if (!apiKey) throw new Error("DeepSeek API Key is required");

  const prompt = `
You are a WORLD-CLASS Durak master. Perform a Monte-Carlo style simulation to predict the outcome 10-15 turns ahead.

Game State: ${JSON.stringify(state)}
Scenario: ${isTakeScenario ? "The opponent is taking cards, I can add more cards to their hand." : "Standard turn."}

STRATEGIC DIRECTIVES:
1. Depth: Simluate the game tree 10-15 turns ahead for every card in hand.
2. Transfer (Perevod): In "Perevodnoy" mode, prioritize transfers if it forces high-value cards out.
3. Resource Management: Calculate if it's better to 'Take' (Vzyat) now to secure a Trump for the endgame.
4. Endgame Prep: If deck is <10 cards, switch to high-precision card counting.

Return ONLY a JSON object:
{
  "suggestion": "Detailed tactical move",
  "suggestedCards": [{"rank": "rank", "suit": "suit"}],
  "reasoning": "Detailed expert logic in Russian, explain 10-turn projection",
  "probabilityOfWinning": "XX%",
  "scenarios": [
    {"option": "Alternative option", "outcome": "Outcome projected 10 turns ahead"}
  ]
}
`;

  return deepseekRequest(prompt, apiKey);
}

export async function getDeepSeekDeckAnalysis(state: GameState, apiKey: string) {
  if (!apiKey) throw new Error("DeepSeek API Key is required");

  const prompt = `
Analyze the Durak game deck state:
Game State: ${JSON.stringify(state)}

Provide specific probabilities for unknown cards and strategic advice for the endgame or current stage.
Return ONLY a JSON object with this structure:
{
  "deckProbabilities": "string (Detailed numerical breakdown)",
  "opponentHands": [{"name": "string", "likelyCards": "string", "threatLevel": "string"}],
  "advice": "string"
}
`;

  return deepseekRequest(prompt, apiKey);
}

async function deepseekRequest(prompt: string, apiKey: string) {
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a tactical Durak game assistant. Always reply in JSON format. Language: Russian." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || errorData.message || `API Error: ${response.status}`;
      
      if (message.toLowerCase().includes("insufficient balance") || response.status === 402) {
        throw new Error("НЕДОСТАТОЧНО СРЕДСТВ: На вашем счету DeepSeek закончились деньги. Пожалуйста, пополните баланс в панели управления DeepSeek.");
      }
      
      if (response.status === 401) {
        throw new Error("НЕВЕРНЫЙ КЛЮЧ: Проверьте правильность API ключа в настройках.");
      }

      throw new Error(message);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error("DeepSeek Error:", error);
    throw error;
  }
}

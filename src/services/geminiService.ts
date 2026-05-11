import { GoogleGenAI, Type } from "@google/genai";
import { GameState, AiResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    suggestion: { type: Type.STRING },
    suggestedCards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rank: { type: Type.STRING },
          suit: { type: Type.STRING }
        },
        required: ["rank", "suit"]
      }
    },
    reasoning: { type: Type.STRING },
    probabilityOfWinning: { type: Type.STRING },
    scenarios: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          option: { type: Type.STRING },
          outcome: { type: Type.STRING }
        },
        required: ["option", "outcome"]
      }
    }
  },
  required: ["suggestion", "reasoning", "probabilityOfWinning", "scenarios"]
};

export async function getGeminiStrategy(state: GameState, isTakeScenario: boolean = false, model: string = "gemini-3-flash-preview"): Promise<AiResponse> {
  const isFlash = model.includes("flash");
  
  const prompt = isFlash ? `
Вы — быстрый ИИ-ассистент для игры в Дурака. Ваша цель: дать МГНОВЕННЫЙ тактический совет.
Проанализируйте ситуацию на 1-2 хода вперед.

Текущее состояние: ${JSON.stringify(state)}
Режим: ${isTakeScenario ? "ПРОТИВНИК ЗАБИРАЕТ (можно подкинуть)" : "АКТИВНЫЙ ХОД"}

БЫСТРЫЙ АНАЛИЗ:
1. Оцените текущие карты в руке. 
2. Просчитайте ближайшие 2 хода (текущий и ответ оппонента).
3. Дайте четкий совет, не углубляясь в сложные симуляции.

ОБЯЗАТЕЛЬНО: Если вы советуете сыграть карты, укажите их объекты в массиве 'suggestedCards' (rank: '2'-'10','J','Q','K','A','JOKER'; suit: 'hearts','diamonds','clubs','spades').

Формат ответа: ТОЛЬКО JSON. 
Язык: Русский.
` : `
Вы — совершенный игровой интеллект, использующий метод поиска по дереву Монте-Карло (MCTS) для игры в Дурака. 
Ваша задача: провести внутреннюю симуляцию минимум 10 000 игровых итераций (rollouts) для выбора хода с максимальным математическим ожиданием победы.

Текущее состояние: ${JSON.stringify(state)}
Режим: ${isTakeScenario ? "ПРОТИВНИК ЗАБИРАЕТ (можно подкинуть)" : "АКТИВНЫЙ ХОД"}

ПРОТОКОЛ АНАЛИЗА (MCTS):
1.Selection & Expansion: Оцените все доступные карты в руке как корневые узлы дерева решений. 
2.Deep Simulation: Для каждого возможного хода просчитайте дерево игры на 10-15 ходов вперед. Учитывайте вероятное распределение оставшихся карт в колоде и руках оппонентов.
3.Tactical Evaluation: 
   - ПЕРЕВОД (Transfer): Приоритетно оцените возможность перевода атаки, если это ломает темп противнику.
   - СТРАТЕГИЧЕСКИЙ ЗАБОР (Vzyat): Оцените выгоду намеренного забора карт, если это позволяет сохранить "тяжелые" козыри для финала.
   - КОНТРОЛЬ КОЗЫРЕЙ: Не отдавайте крупные козыри на ранних стадиях, если симуляция показывает риск поражения в эндшпиле.

ОБЯЗАТЕЛЬНО: Если вы советуете сыграть карты, укажите их объекты в массиве 'suggestedCards' (rank: '2'-'10','J','Q','K','A','JOKER'; suit: 'hearts','diamonds','clubs','spades').

Формат ответа: ТОЛЬКО JSON. 
Язык: Русский.
`;

  try {
    const result = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    return JSON.parse(result.text);
  } catch (error) {
    console.error("Gemini Strategy Error:", error);
    throw error;
  }
}

export async function getGeminiDeckAnalysis(state: GameState, model: string = "gemini-3-flash-preview") {
  const prompt = `
Проанализируйте колоду и руки противников в игре Дурак.
Состояние игры: ${JSON.stringify(state)}

Проанализируйте, сколько козырей могло остаться в колоде, какие карты могут быть у противников, и дайте стратегический совет на текущий этап игры (дебют, миттельшпиль, эндшпиль).

Верните JSON объект:
{
  "deckProbabilities": "строка с детальным разбором вероятностей",
  "opponentHands": [{"name": "имя", "likelyCards": "что у него может быть", "threatLevel": "критично/средне/низко"}],
  "advice": "общий совет"
}
`;

  try {
    const result = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            deckProbabilities: { type: Type.STRING },
            opponentHands: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  likelyCards: { type: Type.STRING },
                  threatLevel: { type: Type.STRING }
                }
              }
            },
            advice: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(result.text);
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}

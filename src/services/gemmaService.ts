import { GameState, AiResponse } from "../types";

/**
 * Сервис для работы с локальной моделью Gemma 4 E2B через Prompt API (window.ai).
 * В 2026 году эта технология позволяет выполнять вычисления прямо на устройстве.
 */

// Расширяем интерфейс Window для работы с Prompt API
declare global {
  interface Window {
    ai?: {
      canCreateTextSession: () => Promise<string>;
      createTextSession: (options?: any) => Promise<any>;
    };
  }
}

export async function getGemmaStrategy(state: GameState, isTakeScenario: boolean = false): Promise<AiResponse> {
  if (!window.ai) {
    throw new Error("Local AI (window.ai) не поддерживается вашим браузером. Убедитесь, что вы используете последнюю версию Chrome и активировали 'Prompt API' в chrome://flags.");
  }

  const canCreate = await window.ai.canCreateTextSession();
  if (canCreate === "no") {
    throw new Error("Gemma 4 E2B не готова к работе. Проверьте настройки устройства.");
  }

  const prompt = `
Вы — локальная модель Gemma 4 E2B, оптимизированная для работы на мобильных устройствах.
Ваша цель: тактический анализ игры в Дурака.

Текущее состояние игры: ${JSON.stringify(state)}
Режим: ${isTakeScenario ? "ПРОТИВНИК ЗАБИРАЕТ" : "АКТИВНЫЙ ХОД"}

Задание:
1. Оцените текущие карты.
2. Предложите оптимальный ход.
3. Верните результат СТРОГО в формате JSON с полями:
{
  "suggestion": "краткое описание хода на русском",
  "suggestedCards": [{"rank": "...", "suit": "..."}],
  "reasoning": "краткое обоснование",
  "probabilityOfWinning": "оценка шансов в %",
  "scenarios": [{"option": "если...", "outcome": "то..."}]
}

ОБЯЗАТЕЛЬНО: Верните ТОЛЬКО JSON, без лишнего текста.
`;

  try {
    const session = await window.ai.createTextSession({
      // Настройка температуры и других параметров для Gemma 4 E2B
      temperature: 0.7,
      topK: 40,
    });
    
    const rawResponse = await session.prompt(prompt);
    
    // Пытаемся извлечь JSON из ответа
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error("Не удалось разобрать JSON от локальной модели.");
  } catch (error) {
    console.error("Gemma 4 E2B Strategy Error:", error);
    throw error;
  }
}

export async function getGemmaDeckAnalysis(state: GameState) {
  if (!window.ai) {
    throw new Error("Local AI не поддерживается.");
  }

  const prompt = `
Вы — Gemma 4 E2B. Проанализируйте колоду игры Дурак.
Состояние: ${JSON.stringify(state)}

Верните JSON объект:
{
  "deckProbabilities": "детальный разбор",
  "opponentHands": [{"name": "имя", "likelyCards": "карты", "threatLevel": "критично/средне/низко"}],
  "advice": "совет"
}
`;

  try {
    const session = await window.ai.createTextSession();
    const rawResponse = await session.prompt(prompt);
    
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {
      deckProbabilities: "Анализ не удался",
      opponentHands: [],
      advice: "Локальная модель Gemma 4 не смогла сформировать корректный ответ."
    };
  } catch (error) {
    console.error("Gemma Analysis Error:", error);
    throw error;
  }
}

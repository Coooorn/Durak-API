/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Spade, Heart, Diamond, Club, 
  Trash2, Plus, Brain, RotateCcw, 
  ChevronRight, AlertCircle, Info, 
  History, Users, Layers, Search, Settings2,
  Eye, EyeOff
} from 'lucide-react';
import { Card, GameState, Rank, Suit } from './types';
import { getDeepSeekStrategy, getDeepSeekDeckAnalysis } from './services/deepseekService';
import { getGeminiStrategy, getGeminiDeckAnalysis } from './services/geminiService';
import { getGemmaStrategy, getGemmaDeckAnalysis } from './services/gemmaService';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'JOKER'];
const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    myHand: [],
    trumpSuit: null,
    trumpCard: null,
    deckCount: 52,
    discardPile: [],
    opponents: [],
    currentTurn: null,
    history: [],
    rules: {
      deckType: 52,
      withJokers: false,
      isPerevodnoy: true,
      isPodkidnoy: true,
      maxAttackCards: 6
    }
  });

  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [takeScenario, setTakeScenario] = useState<any>(null);
  const [deckAnalysis, setDeckAnalysis] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState<{ target: 'hand' | 'trump' | 'attack' | 'defense' | 'discard' | 'transfer', moveIndex?: number, sourceId?: string } | null>(null);
  const [mobileView, setMobileView] = useState<'board' | 'intel' | 'hand'>('board');
  const [sortOrder, setSortOrder] = useState<'none' | 'rank' | 'suit' | 'power'>('none');
  const [deepseekApiKey, setDeepseekApiKey] = useState(() => localStorage.getItem('deepseek_api_key') || '');
  const [useGeminiPro, setUseGeminiPro] = useState(() => localStorage.getItem('use_gemini_pro') === 'true');
  const [aiEngine, setAiEngine] = useState<'gemini' | 'deepseek' | 'gemma'>(() => (localStorage.getItem('ai_engine') as any) || 'gemini');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [arrowDrag, setArrowDrag] = useState<{ startX: number, startY: number, currentX: number, currentY: number, sourceId: string } | null>(null);
  const [dragHoverId, setDragHoverId] = useState<string | null>(null);
  const longPressTimer = React.useRef<any>(null);

  const handlePointerDown = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent, sourceId: string) => {
    // Only handle primary button for mouse
    if ('button' in e && e.button !== 0) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as any).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as any).clientY;

    longPressTimer.current = setTimeout(() => {
      setArrowDrag({
        startX: clientX,
        startY: clientY,
        currentX: clientX,
        currentY: clientY,
        sourceId
      });
      // Vibrating if supported
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!arrowDrag) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as any).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as any).clientY;

      setArrowDrag(prev => prev ? { ...prev, currentX: clientX, currentY: clientY } : null);

      // Check for targets
      const elements = document.elementsFromPoint(clientX, clientY);
      const targetElement = elements.find(el => el.hasAttribute('data-player-id'));
      const targetId = targetElement?.getAttribute('data-player-id');
      setDragHoverId(targetId || null);
    };

    const handleGlobalUp = () => {
      clearLongPress();
      if (arrowDrag) {
        if (dragHoverId && dragHoverId !== arrowDrag.sourceId) {
          updateGameState(prev => ({
            ...prev,
            currentTurn: {
              attackerId: arrowDrag.sourceId,
              defenderId: dragHoverId,
              moves: prev.currentTurn?.moves || []
            }
          }));
        }
        setArrowDrag(null);
        setDragHoverId(null);
      }
    };

    if (arrowDrag) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
      window.addEventListener('touchmove', handleGlobalMove);
      window.addEventListener('touchend', handleGlobalUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [arrowDrag, dragHoverId]);

  const rankValue: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, 'JOKER': 15
  };

  const suitOrder: Record<string, number> = {
    'hearts': 1, 'diamonds': 2, 'clubs': 3, 'spades': 4
  };

  const getSortedHand = () => {
    let cards = [...gameState.myHand];
    if (sortOrder === 'rank') {
      cards.sort((a, b) => rankValue[a.rank] - rankValue[b.rank]);
    } else if (sortOrder === 'suit') {
      cards.sort((a, b) => {
        if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
        return rankValue[a.rank] - rankValue[b.rank];
      });
    } else if (sortOrder === 'power') {
      cards.sort((a, b) => {
        const aTrump = a.suit === gameState.trumpSuit ? 1 : 0;
        const bTrump = b.suit === gameState.trumpSuit ? 1 : 0;
        if (aTrump !== bTrump) return aTrump - bTrump;
        return rankValue[a.rank] - rankValue[b.rank];
      });
    }
    return cards;
  };

  
  const POSITIONS: ('left' | 'top-left' | 'top' | 'top-right' | 'right')[] = ['left', 'top-left', 'top', 'top-right', 'right'];
  
  const getNextAvailablePosition = (opponents: any[]) => {
    const used = opponents.map(o => o.position);
    return POSITIONS.find(p => !used.includes(p)) || 'top';
  };

  const getClockwiseOrder = (opponents: any[]) => {
    const orderMap: Record<string, number> = {
      'left': 1, 'top-left': 2, 'top': 3, 'top-right': 4, 'right': 5
    };
    const sortedOpps = [...opponents].sort((a, b) => (orderMap[a.position || 'top'] || 0) - (orderMap[b.position || 'top'] || 0));
    return ['me', ...sortedOpps.map(o => o.id)];
  };

  const getNextPlayerId = (currentId: string, opponents: any[]) => {
    const order = getClockwiseOrder(opponents);
    let idx = order.indexOf(currentId);
    if (idx === -1) return 'me';
    return order[(idx + 1) % order.length];
  };

  const getNextActivePlayerId = (currentId: string, gameState: GameState) => {
    const order = getClockwiseOrder(gameState.opponents);
    let idx = order.indexOf(currentId);
    
    for (let i = 1; i <= order.length; i++) {
      const nextId = order[(idx + i) % order.length];
      if (nextId === 'me') {
        if (gameState.myHand.length > 0) return 'me';
      } else {
        const opp = gameState.opponents.find(o => o.id === nextId);
        if (opp && opp.cardCount > 0) return nextId;
      }
    }
    return order[(idx + 1) % order.length]; // Fallback
  };

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 1024;

  const getRankLabel = (rank: Rank) => {
    switch (rank) {
      case 'A': return 'Т';
      case 'K': return 'К';
      case 'Q': return 'Д';
      case 'J': return 'В';
      case 'JOKER': return '★';
      default: return rank;
    }
  };

  const getSuitLabel = (suit: Suit) => {
    switch (suit) {
      case 'spades': return 'Пики';
      case 'hearts': return 'Черви';
      case 'diamonds': return 'Бубны';
      case 'clubs': return 'Трефы';
    }
  };

  const getSuitIconAsString = (suit: Suit) => {
    switch (suit) {
      case 'spades': return '♠';
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
    }
  };

  const [pastStates, setPastStates] = useState<GameState[]>([]);

  const updateGameState = (updater: React.SetStateAction<GameState>) => {
    setGameState(prev => {
      const nextState = typeof updater === 'function' ? (updater as any)(prev) : updater;
      // Only keep actual changes, this also prevents React StrictMode double logging
      if (JSON.stringify(prev) !== JSON.stringify(nextState)) {
        setPastStates(past => [...past, prev]);
      }
      return nextState;
    });
  };

  const undoLastAction = () => {
    setPastStates(past => {
      if (past.length === 0) return past;
      const previousState = past[past.length - 1];
      setGameState(previousState);
      return past.slice(0, -1);
    });
  };

  const [deckDeltas, setDeckDeltas] = useState<{id: number, val: number}[]>([]);
  const idCounter = React.useRef(0);

  const showDeckDelta = (val: number) => {
    const id = idCounter.current++;
    setDeckDeltas(prev => [...prev, {id, val}]);
    setTimeout(() => {
        setDeckDeltas(prev => prev.filter(d => d.id !== id));
    }, 2000);
  };

  const updateHand = (card: Card) => {
    if (gameState.myHand.some(c => c.rank === card.rank && c.suit === card.suit)) return;
    updateGameState(prev => ({
      ...prev,
      myHand: [...prev.myHand, card],
      deckCount: Math.max(0, prev.deckCount - 1)
    }));
    showDeckDelta(-1);
  };

  const removeFromHand = (index: number) => {
    updateGameState(prev => ({
      ...prev,
      myHand: prev.myHand.filter((_, i) => i !== index)
    }));
  };

  const handleCardPick = (card: Card) => {
    if (!showCardPicker) return;

    const { target, moveIndex } = showCardPicker;

    if (target === 'hand') {
      updateHand(card);
    } else if (target === 'trump') {
      updateGameState(prev => ({ ...prev, trumpCard: card, trumpSuit: card.suit }));
    } else if (target === 'attack') {
      updateGameState(prev => {
        const moves = prev.currentTurn?.moves || [];
        if (moves.length >= prev.rules.maxAttackCards) return prev;
        
        let newHand = prev.myHand;
        let newOpponents = prev.opponents;
        
        const sourceId = showCardPicker.sourceId || (prev.currentTurn?.attackerId === 'me' ? prev.opponents[0]?.id : prev.currentTurn?.attackerId);
        
        if (sourceId === 'me') {
           newHand = prev.myHand.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        } else if (sourceId) {
           newOpponents = prev.opponents.map(o => o.id === sourceId ? { ...o, cardCount: Math.max(0, o.cardCount - 1) } : o);
        }

        return {
          ...prev,
          myHand: newHand,
          opponents: newOpponents,
          currentTurn: {
            attackerId: prev.currentTurn?.attackerId || sourceId || 'me', 
            defenderId: prev.currentTurn?.defenderId || prev.opponents[0]?.id || 'me',
            moves: [...moves, { attack: card, attackSourceId: sourceId }]
          }
        };
      });
    } else if (target === 'defense' && moveIndex !== undefined) {
      updateGameState(prev => {
        if (!prev.currentTurn) return prev;
        const newMoves = [...prev.currentTurn.moves];
        
        let newHand = prev.myHand;
        let newOpponents = prev.opponents;
        
        const sourceId = showCardPicker.sourceId || prev.currentTurn.defenderId;
        
        if (sourceId === 'me') {
           newHand = prev.myHand.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        } else if (sourceId) {
           newOpponents = prev.opponents.map(o => o.id === sourceId ? { ...o, cardCount: Math.max(0, o.cardCount - 1) } : o);
        }

        newMoves[moveIndex] = { ...newMoves[moveIndex], defense: card, defenseSourceId: sourceId };

        return { ...prev, myHand: newHand, opponents: newOpponents, currentTurn: { ...prev.currentTurn, moves: newMoves } };
      });
    } else if (target === 'transfer') {
      updateGameState(prev => {
        const moves = prev.currentTurn?.moves || [];
        if (moves.length >= prev.rules.maxAttackCards) return prev;
        
        let newHand = prev.myHand;
        let newOpponents = prev.opponents;
        
        const sourceId = showCardPicker.sourceId || prev.currentTurn?.defenderId;

        if (sourceId === 'me') {
           newHand = prev.myHand.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        } else if (sourceId) {
           newOpponents = prev.opponents.map(o => o.id === sourceId ? { ...o, cardCount: Math.max(0, o.cardCount - 1) } : o);
        }

        return {
          ...prev,
          myHand: newHand,
          opponents: newOpponents,
          currentTurn: { 
            moves: [...moves, { attack: card, attackSourceId: sourceId }], 
            attackerId: prev.currentTurn?.defenderId || 'me', defenderId: getNextPlayerId(prev.currentTurn?.defenderId || 'me', prev.opponents) 
          }
        };
      });
    } else if (target === 'discard') {
      updateGameState(prev => ({ ...prev, discardPile: [...prev.discardPile, card] }));
    }

    if (target !== 'hand') {
      setShowCardPicker(null);
    }
  };

  const askAi = async () => {
    if (aiEngine === 'deepseek' && !deepseekApiKey) {
      setShowSettings(true);
      return;
    }

    setIsLoading(true);
    try {
      let suggestion, takeSuggestion, analysis;
      if (aiEngine === 'gemini') {
        const model = useGeminiPro ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
        [suggestion, takeSuggestion, analysis] = await Promise.all([
          getGeminiStrategy(gameState, false, model),
          getGeminiStrategy(gameState, true, model),
          getGeminiDeckAnalysis(gameState, model)
        ]);
      } else if (aiEngine === 'gemma') {
        [suggestion, takeSuggestion, analysis] = await Promise.all([
          getGemmaStrategy(gameState, false),
          getGemmaStrategy(gameState, true),
          getGemmaDeckAnalysis(gameState)
        ]);
      } else {
        [suggestion, takeSuggestion, analysis] = await Promise.all([
          getDeepSeekStrategy(gameState, deepseekApiKey, false),
          getDeepSeekStrategy(gameState, deepseekApiKey, true),
          getDeepSeekDeckAnalysis(gameState, deepseekApiKey)
        ]);
      }
      setAiSuggestion(suggestion);
      setTakeScenario(takeSuggestion);
      setDeckAnalysis(analysis);
    } catch (e) {
      console.error(`${aiEngine} Error:`, e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setAiSuggestion({
        suggestion: "ОШИБКА АНАЛИЗА",
        reasoning: errorMessage,
        probabilityOfWinning: "N/A",
        scenarios: []
      });
      setDeckAnalysis({
        deckProbabilities: "Ошибка",
        opponentHands: [],
        advice: errorMessage
      });
      if (aiEngine === 'deepseek' && errorMessage.includes("НЕДОСТАТОЧНО СРЕДСТВ")) {
        setShowSettings(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const opponentDrewFromDeck = (count: number, oppId: string) => {
    updateGameState(prev => ({
      ...prev,
      deckCount: Math.max(0, prev.deckCount - count),
      opponents: prev.opponents.map(o => o.id === oppId ? { ...o, cardCount: o.cardCount + count } : o)
    }));
    showDeckDelta(-count);
  };

  const resetTurn = () => {
    if (gameState.currentTurn) {
      const { attackerId, defenderId, moves } = gameState.currentTurn;
      const tableCards = moves.flatMap(m => [m.attack, m.defense].filter(Boolean) as Card[]);
      
      updateGameState(prev => {
        // Person who beat is next attacker. If they left, person to their left.
        let nextAttacker = defenderId;
        const defenderStillIn = defenderId === 'me' ? prev.myHand.length > 0 : (prev.opponents.find(o => o.id === defenderId)?.cardCount || 0) > 0;
        
        if (!defenderStillIn) {
          nextAttacker = getNextActivePlayerId(defenderId, prev);
        }
        
        const nextDefender = getNextActivePlayerId(nextAttacker, prev);

        return {
          ...prev,
          discardPile: [...prev.discardPile, ...tableCards],
          history: [...prev.history, { 
            type: 'beaten', 
            moves: [...moves], 
            attackerId, 
            defenderId, 
            timestamp: Date.now() 
          }],
          currentTurn: { attackerId: nextAttacker, defenderId: nextDefender, moves: [] }
        };
      });
    }
  };

  const takeTurn = () => {
    if (gameState.currentTurn) {
      const { attackerId, defenderId, moves } = gameState.currentTurn;
      const tableCards = moves.flatMap(m => [m.attack, m.defense].filter(Boolean) as Card[]);
      
      updateGameState(prev => {
        // Person after taking defender is next attacker (clockwise).
        const nextAttacker = getNextActivePlayerId(defenderId, prev);
        const nextDefender = getNextActivePlayerId(nextAttacker, prev);

        if (defenderId === 'me') {
           const uniqueNewHand = [...prev.myHand];
           tableCards.forEach(newCard => {
             if (!uniqueNewHand.some(c => c.rank === newCard.rank && c.suit === newCard.suit)) {
               uniqueNewHand.push(newCard);
             }
           });
           return {
             ...prev,
             myHand: uniqueNewHand,
             history: [...prev.history, { 
               type: 'taken', 
               moves: [...moves], 
               attackerId, 
               defenderId, 
               timestamp: Date.now() 
             }],
             currentTurn: { attackerId: nextAttacker, defenderId: nextDefender, moves: [] }
           };
        } else {
           const newOpponents = prev.opponents.map(o => 
             o.id === defenderId ? { ...o, cardCount: o.cardCount + tableCards.length } : o
           );
           return {
             ...prev,
             opponents: newOpponents,
             history: [...prev.history, { 
               type: 'taken_by_opp', 
               moves: [...moves], 
               attackerId, 
               defenderId, 
               timestamp: Date.now() 
             }],
             currentTurn: { attackerId: nextAttacker, defenderId: nextDefender, moves: [] }
           };
        }
      });
    }
  };

  const handleTransferFromHand = (card: Card, handIdx: number) => {
    updateGameState(prev => {
      const newHand = [...prev.myHand];
      newHand.splice(handIdx, 1);
      
      return {
        ...prev,
        myHand: newHand,
        currentTurn: { 
          moves: [...(prev.currentTurn?.moves || []), { attack: card, attackSourceId: 'me' }], 
          attackerId: prev.currentTurn?.defenderId || 'me', defenderId: getNextPlayerId(prev.currentTurn?.defenderId || 'me', prev.opponents) 
        }
      };
    });
  };

  const playCardToTable = (card: Card, handIdx?: number) => {
    updateGameState(prev => {
      let newHand = prev.myHand;
      if (handIdx !== undefined) {
        newHand = [...prev.myHand];
        newHand.splice(handIdx, 1);
      }
      
      if (!prev.currentTurn) {
        return {
          ...prev,
          myHand: newHand,
          currentTurn: { ...prev.currentTurn, moves: [{ attack: card }], attackerId: 'me', defenderId: prev.opponents[0]?.id || 'me' }
        };
      }

      if (prev.currentTurn.defenderId === 'me') {
        const undefendedMoveIdx = prev.currentTurn.moves.findIndex(m => !m.defense);
        if (undefendedMoveIdx !== -1) {
          const newMoves = [...prev.currentTurn.moves];
          newMoves[undefendedMoveIdx].defense = card;
          return {
            ...prev,
            myHand: newHand,
            currentTurn: { ...prev.currentTurn, moves: newMoves }
          };
        } else {
           // Fallback, technically if all defended we probably shouldn't play unless it's a new turn, 
           // but maybe allow laying the card down for flexibility.
           if (prev.currentTurn.moves.length >= prev.rules.maxAttackCards) return prev;
           return {
             ...prev,
             myHand: newHand,
             currentTurn: { ...prev.currentTurn, moves: [...prev.currentTurn.moves, { attack: card }] }
           };
        }
      } else {
        // I am the attacker, playing a card means attacking
        return {
          ...prev,
          myHand: newHand,
          currentTurn: { ...prev.currentTurn, moves: [...prev.currentTurn.moves, { attack: card }] }
        };
      }
    });
  };

  const [showInfo, setShowInfo] = useState(false);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);

  const getSuitIcon = (suit: Suit, className = "w-5 h-5") => {
    const isRed = suit === 'hearts' || suit === 'diamonds';
    const colorClass = isRed ? "text-[#FF4C4C] fill-[#FF4C4C]" : "text-white fill-white";
    switch (suit) {
      case 'spades': return <Spade className={`${className} ${colorClass}`} />;
      case 'hearts': return <Heart className={`${className} ${colorClass}`} />;
      case 'diamonds': return <Diamond className={`${className} ${colorClass}`} />;
      case 'clubs': return <Club className={`${className} ${colorClass}`} />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0B0C0E] text-[#D1D1D1] font-mono overflow-hidden select-none">
      {/* Top Navigation Bar */}
      <header className="h-12 border-b border-[#2A2A2A] flex items-center px-4 lg:px-6 justify-between bg-[#111214] shrink-0">
        <div className="flex items-center gap-2 lg:gap-4 overflow-hidden">
          <div className="w-2 h-2 lg:w-3 lg:h-3 bg-[#FF004C] rounded-full shadow-[0_0_8px_#FF004C] shrink-0"></div>
          <h1 className="text-[10px] lg:text-xs font-bold tracking-widest text-white uppercase truncate">
            ТАКТИЧЕСКИЙ_ДВИЖОК // {gameState.myHand.length} КАРТ В РУКЕ
          </h1>
        </div>
        <div className="flex gap-4 lg:gap-6 text-[9px] lg:text-[10px] text-[#888] shrink-0">
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="hover:text-white transition-colors hidden sm:block"
          >
            ДОКИ: <span className={showInfo ? "text-[#00FF41]" : ""}>{showInfo ? "ОТКРЫТЫ" : "ЗАКРЫТЫ"}</span>
          </button>
          <span className="hidden xs:inline">СТАТУС: <span className="text-[#00FF41]">ОПТИМАЛЬНО</span></span>
          <button 
            onClick={() => window.location.reload()}
            className="hover:text-white transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> <span className="hidden sm:inline">ПЕРЕЗАГРУЗКА</span>
          </button>
        </div>
      </header>

      {/* Info Panel Overlay */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#111214] border-b border-[#2A2A2A] px-6 py-4 text-[11px] leading-relaxed shrink-0 overflow-hidden"
          >
            <div className="flex gap-2 font-bold mb-2 text-[#00FF41] items-center uppercase tracking-widest">
              <AlertCircle className="w-4 h-4" /> Оперативные инструкции
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[#888]">
              <ol className="list-decimal list-inside space-y-1">
                <li>Укажите <strong className="text-white">КОЗЫРНУЮ МАСТЬ</strong> через тактический селектор.</li>
                <li>Заполните <strong className="text-white">ВАШУ РУКУ</strong> используя интерфейс (+).</li>
                <li>Регистрируйте <strong className="text-white">СОБЫТИЯ НА СТОЛЕ</strong> (Атаки/Защиты).</li>
              </ol>
              <ul className="list-disc list-inside space-y-1">
                <li>Запустите <strong className="text-white">СТРАТЕГИЧЕСКИЙ АНАЛИЗ</strong> для получения оптимальных ходов.</li>
                <li>Архивируйте <strong className="text-white">ОТБОЙ</strong> для поддержания точности подсчета колоды.</li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Left Sidebar: Hand & Stats - HIDDEN ON MOBILE UNLESS 'intel' VIEW */}
        <aside className={`${mobileView === 'intel' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[320px] border-r border-[#2A2A2A] bg-[#111214] flex-col p-4 shrink-0 overflow-y-auto no-scrollbar`}>
          
          {/* Settings Section */}
          <div className="mb-4 space-y-4">
            <div className="bg-[#1A1C1F] border border-[#333] rounded p-3">
              <div className="text-[10px] text-white font-black uppercase tracking-wider mb-3">Конфигурация</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-[#555] uppercase font-bold">Колода</span>
                  <div className="flex bg-black rounded border border-[#333] p-0.5">
                    {[36, 52].map(type => (
                      <button 
                        key={type}
                        onClick={() => updateGameState(prev => ({ ...prev, rules: { ...prev.rules, deckType: type as 36 | 52 }, deckCount: type }))}
                        className={`px-2 py-0.5 text-[9px] rounded font-bold transition-colors ${gameState.rules.deckType === type ? 'bg-[#00FF41] text-black' : 'text-[#555] hover:text-white'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => updateGameState(prev => ({ ...prev, rules: { ...prev.rules, withJokers: !prev.rules.withJokers } }))}
                    className={`text-[8px] font-black py-1.5 rounded border transition-all ${gameState.rules.withJokers ? 'bg-[#00FF41]/10 border-[#00FF41] text-[#00FF41]' : 'border-[#222] text-[#333]'}`}
                  >
                    ДЖОКЕРЫ: {gameState.rules.withJokers ? 'ВКЛ' : 'ВЫКЛ'}
                  </button>
                  <button 
                    onClick={() => setShowSettings(true)}
                    className={`text-[8px] font-black py-1.5 rounded border transition-all ${aiEngine === 'gemini' ? 'bg-[#00FF41]/10 border-[#00FF41] text-[#00FF41]' : (aiEngine === 'gemma' ? 'bg-orange-500/10 border-orange-500 text-orange-500' : (deepseekApiKey ? 'bg-blue-500/10 border-blue-500 text-blue-500' : 'bg-red-500/10 border-red-500 text-red-500'))}`}
                  >
                    AI: {aiEngine === 'gemini' ? (useGeminiPro ? 'GEMINI PRO' : 'GEMINI FLASH') : (aiEngine === 'gemma' ? 'GEMMA 4 E2B' : (deepseekApiKey ? 'DEEPSEEK V3' : 'ОШИБКА КЛЮЧА'))}
                  </button>
                  <button 
                    onClick={() => updateGameState(prev => ({ ...prev, rules: { ...prev.rules, isPerevodnoy: !prev.rules.isPerevodnoy } }))}
                    className={`text-[8px] font-black py-1.5 rounded border transition-all ${gameState.rules.isPerevodnoy ? 'bg-[#ffb800]/10 border-[#ffb800] text-[#ffb800]' : 'border-[#222] text-[#333]'}`}
                  >
                    ПЕРЕВОД: {gameState.rules.isPerevodnoy ? 'ДА' : 'НЕТ'}
                  </button>
                  <button 
                    onClick={() => updateGameState(prev => ({ ...prev, rules: { ...prev.rules, isPodkidnoy: !prev.rules.isPodkidnoy } }))}
                    className={`text-[8px] font-black py-1.5 rounded border transition-all ${gameState.rules.isPodkidnoy ? 'bg-[#00FF41]/10 border-[#00FF41] text-[#00FF41]' : 'border-[#222] text-[#333]'}`}
                  >
                    ПОДКИДНОЙ: {gameState.rules.isPodkidnoy ? 'ДА' : 'НЕТ'}
                  </button>
                  <div className="flex items-center justify-between px-2 py-1 border border-[#222] rounded bg-black/20">
                    <span className="text-[7px] text-[#444] font-bold uppercase">БИТО ДО</span>
                    <input 
                      type="number" 
                      value={gameState.rules.maxAttackCards}
                      onChange={(e) => updateGameState(prev => ({ ...prev, rules: { ...prev.rules, maxAttackCards: parseInt(e.target.value) || 6 } }))}
                      className="bg-transparent border-none text-[9px] text-white w-6 p-0 focus:ring-0 text-right font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={askAi}
            disabled={isLoading}
            className="w-full py-4 bg-[#FF004C] hover:bg-[#FF004C]/90 text-black font-black text-xs rounded uppercase flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(255,0,76,0.1)] mb-6 shrink-0"
          >
            {isLoading ? (
              <>
                <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>ОБСЧЕТ...</span>
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                <span>ЗАПУСТИТЬ ТАКТИЧЕСКИЙ АНАЛИЗ</span>
              </>
            )}
          </button>

          <div className="flex justify-between items-center mb-6">
            <div className="flex gap-1">
              {(['none', 'rank', 'suit', 'power'] as const).map(o => (
                <button 
                  key={o}
                  onClick={() => setSortOrder(o)}
                  className={`text-[8px] px-2 py-0.5 rounded border transition-colors ${sortOrder === o ? 'border-[#00FF41] bg-[#00FF41]/10 text-[#00FF41]' : 'border-[#333] text-[#555] hover:border-[#444]'}`}
                >
                  {o === 'none' ? 'ОЧЕРЕДЬ' : o === 'rank' ? 'РАНГ' : o === 'suit' ? 'МАСТЬ' : 'СИЛА'}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setShowCardPicker({ target: 'hand' })}
              className="text-[10px] bg-[#00FF41] text-black px-2 py-0.5 rounded font-black uppercase tracking-tighter"
            >+ ДОБАВИТЬ</button>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 mb-8">
            {getSortedHand().map((card, sIdx) => {
              const originalIdx = gameState.myHand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
              return (
                <div 
                  key={`${card.rank}-${card.suit}-${sIdx}`} 
                  onClick={() => setSelectedCardIdx(selectedCardIdx === sIdx ? null : sIdx)}
                  className="aspect-[2/3] border border-[#333] rounded bg-[#1A1C1F] flex flex-col items-center justify-center relative group cursor-pointer"
                >
                  <span className={`text-[11px] lg:text-sm font-black ${card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-[#FF4C4C]' : 'text-white'}`}>
                    {getRankLabel(card.rank)}<br/>
                    {getSuitIcon(card.suit, "w-3 h-3 mx-auto")}
                  </span>
                  
                  <div className={`absolute inset-0 bg-black/95 flex flex-col items-center justify-center gap-1.5 rounded transition-opacity ${selectedCardIdx === sIdx ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    <button onClick={(e) => { e.stopPropagation(); playCardToTable(card, originalIdx); setSelectedCardIdx(null); }} className="bg-[#00FF41] text-black px-2 py-1 rounded text-[8px] font-black uppercase w-10/12">СТОЛ</button>
                    {gameState.rules.isPerevodnoy && gameState.currentTurn?.defenderId === 'me' && gameState.currentTurn?.moves.every(m => !m.defense) && gameState.currentTurn?.moves.some(m => m.attack.rank === card.rank) && (
                        <button onClick={(e) => { e.stopPropagation(); handleTransferFromHand(card, originalIdx); setSelectedCardIdx(null); }} className="bg-[#ffb800] text-black px-2 py-1 rounded text-[8px] font-black uppercase w-10/12">ПЕРЕВОД</button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); removeFromHand(originalIdx); setSelectedCardIdx(null); }} className="bg-red-600/20 text-red-500 py-1 rounded text-[8px] w-10/12 flex justify-center"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* History Panel - New */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-[#555] flex items-center gap-2">
                <History className="w-3 h-3" /> История ходов
              </h3>
              <span className="text-[8px] text-[#444]">{gameState.history.length} раундов</span>
            </div>
            <div className="bg-black/40 border border-[#222] rounded p-2 max-h-40 overflow-y-auto no-scrollbar space-y-2">
              {gameState.history.length === 0 ? (
                <p className="text-[9px] text-[#333] text-center py-4 uppercase font-bold italic">История пуста</p>
              ) : (
                gameState.history.slice().reverse().map((h, i) => (
                  <div key={h.timestamp} className="text-[9px] border-l-2 border-[#333] pl-2 py-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-bold uppercase ${h.type === 'beaten' ? 'text-[#00FF41]' : 'text-[#ffb800]'}`}>
                        {h.type === 'beaten' ? 'Бито' : h.type === 'taken' ? 'Вы взяли' : 'Оппонент взял'}
                      </span>
                      <span className="text-[#444] text-[8px]">{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="text-[#888] mb-1">
                      Атака: {h.attackerId === 'me' ? 'Вы' : (gameState.opponents.find(o => o.id === h.attackerId)?.name || 'Игрок')} 
                      {' -> '} 
                      Защита: {h.defenderId === 'me' ? 'Вы' : (gameState.opponents.find(o => o.id === h.defenderId)?.name || 'Игрок')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {h.moves.map((m, mi) => (
                        <div key={mi} className="bg-white/5 px-1 rounded flex items-center gap-0.5 border border-white/5">
                          <span className={`${m.attack.suit === 'hearts' || m.attack.suit === 'diamonds' ? 'text-red-500' : 'text-white'}`}>{m.attack.rank}{getSuitIcon(m.attack.suit)}</span>
                          {m.defense && (
                            <>
                              <span className="text-[#444]">/</span>
                              <span className={`${m.defense.suit === 'hearts' || m.defense.suit === 'diamonds' ? 'text-red-500' : 'text-white'}`}>{m.defense.rank}{getSuitIcon(m.defense.suit)}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div 
                onClick={() => setShowCardPicker({ target: 'trump' })}
                className="h-20 lg:h-24 border border-[#333] border-dashed rounded bg-[#1A1C1F] flex flex-col items-center justify-center cursor-pointer hover:bg-[#222] group"
              >
                {gameState.trumpCard ? (
                  <>
                    <span className={`text-xl font-bold ${gameState.trumpCard.suit === 'hearts' || gameState.trumpCard.suit === 'diamonds' ? 'text-[#FF4C4C]' : 'text-white'}`}>
                      {getRankLabel(gameState.trumpCard.rank)} {getSuitIcon(gameState.trumpCard.suit, "w-5 h-5 inline")}
                    </span>
                    <span className="text-[8px] text-[#00FF41] mt-1 tracking-widest text-center uppercase">Козырь</span>
                  </>
                ) : (
                  <span className="text-[9px] text-[#444] group-hover:text-[#666]">КОЗЫРЬ</span>
                )}
              </div>
              <div className="flex flex-col justify-center bg-[#1A1C1F] border border-[#333] rounded p-2 text-center relative">
                 <div className="absolute top-0 right-1 flex flex-col gap-1 pointer-events-none">
                    <AnimatePresence>
                      {deckDeltas.map(delta => (
                        <motion.div
                          key={delta.id}
                          initial={{ opacity: 0, y: 10, scale: 0.8 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10 }}
                          className={`text-xs font-black drop-shadow-md ${delta.val > 0 ? 'text-[#00FF41]' : 'text-red-500'}`}
                        >
                          {delta.val > 0 ? `+${delta.val}` : delta.val}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                 </div>
                 <label className="text-[8px] text-[#555] uppercase block mb-1">ОСТАТОК КОЛОДЫ</label>
                 <input 
                    type="number" 
                    value={gameState.deckCount} 
                    onChange={(e) => updateGameState(prev => ({ ...prev, deckCount: parseInt(e.target.value) || 0 }))}
                    className="bg-transparent text-lg font-bold text-white w-full border-none p-0 focus:ring-0 text-center"
                  />
              </div>
            </div>

            <div className="space-y-2 border-t border-[#222] pt-4">
              <div className="flex justify-between items-center">
                <label className="text-[9px] text-[#555] uppercase">Данные противников</label>
                {gameState.opponents.length < 5 && (
                  <button 
                    onClick={() => {
                      updateGameState(prev => ({ 
                        ...prev, 
                        opponents: [...prev.opponents, { id: Math.random().toString(36).substr(2, 9), name: `Игрок ${prev.opponents.length + 1}`, cardCount: 6, position: getNextAvailablePosition(prev.opponents) }],
                        deckCount: Math.max(0, prev.deckCount - 6)
                      }));
                      showDeckDelta(-6);
                    }}
                    className="text-[9px] bg-[#333] hover:bg-[#444] text-white px-2 py-1 rounded font-bold uppercase transition-colors"
                  >
                    + Добавить (до 6 игроков)
                  </button>
                )}
              </div>
              {gameState.opponents.map(opp => (
                <div key={opp.id} className="flex flex-col bg-black/20 p-2 border border-[#222] rounded group relative">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1">
                      <input 
                        type="text" 
                        value={opp.name}
                        onChange={(e) => updateGameState(prev => ({ ...prev, opponents: prev.opponents.map(o => o.id === opp.id ? { ...o, name: e.target.value } : o) }))}
                        className="text-[10px] uppercase font-bold tracking-tighter bg-transparent border-none p-0 focus:ring-0 text-white w-20"
                      />
                      <select 
                        value={opp.position || 'top'} 
                        onChange={(e) => updateGameState(prev => ({ ...prev, opponents: prev.opponents.map(o => o.id === opp.id ? { ...o, position: e.target.value as any } : o) }))}
                        className="bg-[#111214] text-[#888] text-[8px] border border-[#333] rounded px-1 py-0.5 focus:ring-0"
                      >
                        <option value="left">слева</option>
                        <option value="top-left">сверху-слева</option>
                        <option value="top">сверху</option>
                        <option value="top-right">сверху-справа</option>
                        <option value="right">справа</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateGameState(prev => ({ ...prev, opponents: prev.opponents.map(o => o.id === opp.id ? { ...o, cardCount: Math.max(0, o.cardCount - 1) } : o) }))} className="text-[#555] hover:text-white px-2 py-0.5 bg-white/5 rounded">-</button>
                      <input 
                        type="number"
                        value={opp.cardCount}
                        onChange={(e) => updateGameState(prev => ({ ...prev, opponents: prev.opponents.map(o => o.id === opp.id ? { ...o, cardCount: parseInt(e.target.value) || 0 } : o) }))}
                        className="text-[#00FF41] text-xs font-bold w-6 text-center bg-transparent border-none p-0 focus:ring-0 hide-arrows"
                      />
                      <button onClick={() => updateGameState(prev => ({ ...prev, opponents: prev.opponents.map(o => o.id === opp.id ? { ...o, cardCount: o.cardCount + 1 } : o) }))} className="text-[#555] hover:text-white px-2 py-0.5 bg-white/5 rounded">+</button>
                      <button 
                        onClick={() => {
                          updateGameState(prev => ({ 
                            ...prev, 
                            opponents: prev.opponents.filter(o => o.id !== opp.id),
                            deckCount: prev.deckCount + opp.cardCount
                          }));
                          showDeckDelta(opp.cardCount);
                        }}
                        className="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                        title="Удалить противника"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    <span className="text-[7px] text-[#555] tracking-widest uppercase mr-1">Взял:</span>
                    {[1, 2, 3, 4, 5, 6].map(num => (
                      <button 
                        key={num}
                        onClick={() => opponentDrewFromDeck(num, opp.id)}
                        className="bg-[#222] hover:bg-[#333] text-[8px] text-white font-bold w-5 h-5 flex items-center justify-center rounded"
                        title={`Оппонент взял ${num} карт(ы) из колоды`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-[#222] pt-4">
              <div>
                <label className="text-[9px] text-[#555] uppercase">Реестр отбоя</label>
                <div className="flex items-center justify-between bg-black/40 border border-[#222] p-2 rounded mt-1">
                  <div className="text-sm font-bold text-white">{gameState.discardPile.length} <span className="text-[8px] text-[#444] ml-1">КАРТ</span></div>
                  <button onClick={() => setShowCardPicker({ target: 'discard' })} className="text-[#00FF41] hover:text-white bg-[#00FF41]/10 px-2 py-0.5 rounded text-[10px]">+ СОБЫТИЕ</button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-4 pb-20 lg:pb-0">
            {aiSuggestion && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 bg-[#00FF41]/5 border border-[#00FF41]/20 rounded p-3 space-y-3"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-3 h-3 text-[#00FF41]" />
                    <span className="text-[8px] font-black text-[#00FF41] uppercase italic">Тактика: {aiSuggestion.probabilityOfWinning}</span>
                  </div>
                  <div className="text-[11px] text-white font-black mb-2">{aiSuggestion.suggestion}</div>
                  
                  {aiSuggestion.suggestedCards && aiSuggestion.suggestedCards.length > 0 && (
                    <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar pb-1">
                      {aiSuggestion.suggestedCards.map((card: any, idx: number) => (
                        <div key={idx} className="w-[40px] aspect-[2/3] border border-[#333] rounded bg-[#1A1C1F] flex flex-col items-center justify-center shrink-0">
                          <span className={`text-[10px] font-bold ${card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-[#FF4C4C]' : 'text-white'}`}>
                            {getRankLabel(card.rank)}
                          </span>
                          {getSuitIcon(card.suit, "w-3 h-3")}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[9px] text-[#555] leading-tight italic">{aiSuggestion.reasoning}</div>
                </div>

                {deckAnalysis && (
                  <div className="pt-3 border-t border-[#00FF41]/10">
                    <div className="flex items-center gap-2 mb-1">
                      <Search className="w-3 h-3 text-[#ffb800]" />
                      <span className="text-[8px] font-black text-[#ffb800] uppercase italic">Разведка колоды</span>
                    </div>
                    <div className="text-[9px] text-[#888] leading-relaxed line-clamp-3">
                      {deckAnalysis.advice}
                    </div>
                    {deckAnalysis.opponentHands?.length > 0 && (
                      <div className="mt-2 flex gap-1 overflow-x-auto no-scrollbar">
                        {deckAnalysis.opponentHands.map((opp: any, idx: number) => (
                          <div key={idx} className="bg-black/40 px-2 py-1 rounded border border-[#2A2A28] shrink-0">
                            <div className="text-[7px] text-[#555] uppercase font-black">{opp.name}</div>
                            <div className={`text-[8px] font-bold ${opp.threatLevel === 'Высокий' ? 'text-red-500' : 'text-[#ffb800]'}`}>{opp.threatLevel}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
            <button 
              onClick={askAi}
              disabled={isLoading}
              className={`w-full py-4 bg-[#FF004C] text-black font-black text-sm rounded hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest shadow-[0_0_20px_rgba(255,0,76,0.3)] ${isLoading ? 'animate-pulse grayscale' : ''}`}
            >
              {isLoading ? 'АНАЛИЗ...' : 'РАСЧИТАТЬ ХОД'}
            </button>
            <div className="mt-2 text-center">
               <span className="text-[7px] text-[#333] uppercase font-bold tracking-[0.2em]">Neural Engine Multi-Vector Analysis</span>
            </div>
          </div>
        </aside>

        {/* Center Section: Tactical View */}
        <main className={`${['board'].includes(mobileView) ? 'flex' : (mobileView === 'hand' ? 'flex' : 'hidden')} lg:flex flex-1 bg-[#0B0C0E] p-4 lg:p-6 flex-col overflow-y-auto no-scrollbar`}>
          
          {/* Top Tabs removed as they are now merged */}
          <div className="hidden lg:flex gap-4 mb-4 lg:mb-6 border-b border-[#222] pb-2">
            <button 
              className="text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded bg-[#00FF41]/10 text-[#00FF41]"
            >
              Командный центр
            </button>
          </div>

          {(mobileView === 'board' || !isMobile()) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6 min-h-0">
              {/* Table Analysis */}
              <div className="border border-[#222] rounded bg-[#111214] p-4 lg:p-5 flex flex-col">
                <div className="flex justify-between items-center border-b border-[#222] pb-2 mb-2">
                  <h2 className="text-[10px] font-bold text-[#888] uppercase tracking-widest">Текущий стол</h2>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {gameState.currentTurn && (
                      <button onClick={() => setShowCardPicker({ target: 'attack' })} className="text-[9px] bg-[#00FF41]/20 text-[#00FF41] px-2 lg:px-3 py-1 rounded hover:bg-[#00FF41]/40 uppercase font-bold text-center flex items-center justify-center">+ ХОД</button>
                    )}
                    {gameState.rules.isPerevodnoy && gameState.currentTurn && gameState.currentTurn.defenderId !== 'me' && (
                        <button onClick={() => setShowCardPicker({ target: 'transfer' })} className="text-[9px] bg-[#ffb800]/20 text-[#ffb800] px-2 lg:px-3 py-1 rounded hover:bg-[#ffb800]/40 uppercase font-bold">ОПП. ПЕРЕВОДИТ</button>
                    )}
                    <button onClick={undoLastAction} disabled={pastStates.length === 0} className="text-[9px] bg-[#333] px-2 lg:px-3 py-1 rounded hover:bg-[#444] uppercase font-bold disabled:opacity-50">ОТМЕНА</button>
                    {gameState.currentTurn && (
                      <>
                        <button onClick={resetTurn} className="text-[9px] bg-[#333] px-2 lg:px-3 py-1 rounded hover:bg-[#444] uppercase font-bold">БИТО</button>
                        <button onClick={takeTurn} className="text-[9px] bg-[#444] px-2 lg:px-3 py-1 rounded hover:bg-[#555] uppercase font-bold">{gameState.currentTurn?.attackerId === 'me' ? 'БЕРЕТ' : 'БЕРУ'}</button>
                      </>
                    )}
                  </div>
                </div>

                {!gameState.currentTurn && (
                  <div className="mb-2 p-2 bg-black/40 border border-[#333] rounded flex flex-col md:flex-row gap-2 md:items-center">
                    <span className="text-[9px] uppercase font-bold text-[#888]">Новый раунд:</span>
                    <select 
                      id="new-turn-attacker"
                      className="text-[10px] bg-[#111214] text-white border border-[#333] rounded p-1"
                    >
                      <option value="me">Я (Вы)</option>
                      {gameState.opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <span className="text-[10px] text-[#555] font-bold">➔</span>
                    <select 
                      id="new-turn-defender"
                      className="text-[10px] bg-[#111214] text-white border border-[#333] rounded p-1"
                    >
                      {gameState.opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      <option value="me">Я (Вы)</option>
                    </select>
                    <button 
                      onClick={() => {
                         const attackerId = (document.getElementById('new-turn-attacker') as HTMLSelectElement).value;
                         const defenderId = (document.getElementById('new-turn-defender') as HTMLSelectElement).value;
                         if (attackerId !== defenderId) {
                           updateGameState(prev => ({ ...prev, currentTurn: { attackerId, defenderId, moves: [] } }));
                         }
                      }}
                      className="text-[9px] bg-[#00FF41] text-black px-3 py-1 rounded font-bold uppercase transition-colors hover:bg-[#00cc33]"
                    >
                      Начать ход
                    </button>
                  </div>
                )}
                
                {gameState.currentTurn && (
                  <div className="mb-2 flex flex-col md:flex-row md:items-center justify-between border-b border-[#222] pb-2 gap-2">
                    <span className="text-[9px] text-[#555] uppercase tracking-widest">Текущий раунд:</span>
                    <div className="flex gap-2 text-[10px] font-bold uppercase">
                      <span className="text-[#00FF41]">
                        Атакует: {gameState.currentTurn.attackerId === 'me' ? 'Вы' : gameState.opponents.find(o => o.id === gameState.currentTurn?.attackerId)?.name || 'Игрок'}
                      </span>
                      <span className="text-[#FF004C]">
                        Отбивается: {gameState.currentTurn.defenderId === 'me' ? 'Вы' : gameState.opponents.find(o => o.id === gameState.currentTurn?.defenderId)?.name || 'Игрок'}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="flex-1 relative mt-4 rounded-[1.5rem] lg:rounded-[3.5rem] border-[3px] lg:border-[6px] border-[#222] bg-[#0c0d10] shadow-[inset_0_0_50px_rgba(0,0,0,0.8)] min-h-[300px] lg:min-h-[400px] flex flex-col items-center justify-center p-4 lg:p-8">
                  {/* AI Floating Suggestion Triggered/Visible on Table */}
                  {isLoading && (
                    <div className="absolute inset-4 lg:inset-8 z-40 bg-black/40 backdrop-blur-[1px] rounded-[1.2rem] lg:rounded-[3.2rem] flex flex-col items-center justify-center gap-4">
                      <div className="w-8 h-8 border-4 border-[#00FF41]/30 border-t-[#00FF41] rounded-full animate-spin" />
                      <span className="text-[10px] font-black text-[#00FF41] uppercase tracking-[0.3em]">Нейросеть думает...</span>
                    </div>
                  )}

                  {aiSuggestion && !isLoading && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute top-4 lg:top-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2"
                    >
                      <div className="bg-[#1D1E22] border border-[#00FF41]/30 rounded-full px-4 py-1.5 flex items-center gap-2 shadow-[0_0_20px_rgba(0,255,65,0.1)] backdrop-blur-md">
                        <Brain className="w-3 h-3 text-[#00FF41]" />
                        <span className="text-[9px] font-bold text-white uppercase tracking-tight">Ход:</span>
                        <span className="text-[10px] font-black text-[#00FF41] uppercase">{aiSuggestion.suggestion}</span>
                        {aiSuggestion.suggestedCards && (
                          <div className="flex gap-1 ml-2 border-l border-[#333] pl-2">
                            {aiSuggestion.suggestedCards.map((card: any, idx: number) => (
                              <div key={idx} className="w-[16px] aspect-[2/3] border border-[#333] rounded-[1px] bg-[#1A1C1F] flex flex-col items-center justify-center">
                                <span className={`text-[6px] font-bold ${card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-[#FF4C4C]' : 'text-white'}`}>
                                  {getRankLabel(card.rank)}
                                </span>
                                {getSuitIcon(card.suit, "w-1.5 h-1.5")}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {deckAnalysis && (
                        <div className="bg-[#1D1E22] border border-[#ffb800]/30 rounded-lg p-2 max-w-[200px] shadow-xl backdrop-blur-md">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Search className="w-2.5 h-2.5 text-[#ffb800]" />
                            <span className="text-[7px] font-black text-[#ffb800] uppercase">Инсайт колоды:</span>
                          </div>
                          <p className="text-[8px] text-[#888] leading-tight line-clamp-2">{deckAnalysis.advice}</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Mobile Quick AI Action Button */}
                  {isMobile() && !isLoading && (
                    <button 
                      onClick={askAi}
                      className="absolute bottom-4 right-4 z-30 w-12 h-12 bg-[#FF004C] text-black rounded-full shadow-[0_0_20px_rgba(255,0,76,0.4)] flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <Brain className="w-6 h-6" />
                    </button>
                  )}

                  {/* Opponent 'Seats' around the table */}
                  {gameState.opponents.map((opp, i) => {
                    let posClasses = '';
                    switch (opp.position) {
                      case 'left': posClasses = 'left-0 lg:-ml-6 top-1/2 -translate-y-1/2'; break;
                      case 'right': posClasses = 'right-0 lg:-mr-6 top-1/2 -translate-y-1/2'; break;
                      case 'top-left': posClasses = 'left-4 top-0 lg:-mt-4'; break;
                      case 'top-right': posClasses = 'right-4 top-0 lg:-mt-4'; break;
                      case 'top': 
                      default: posClasses = 'top-0 lg:-mt-4 left-1/2 -translate-x-1/2'; break;
                    }
                    return (
                       <div 
                         key={opp.id} 
                         data-player-id={opp.id}
                         onPointerDown={(e) => handlePointerDown(e, opp.id)}
                         onPointerUp={clearLongPress}
                         onPointerLeave={clearLongPress}
                         className={`absolute z-20 ${posClasses} bg-[#111214] border-2 ${dragHoverId === opp.id ? 'border-[#00FF41] scale-110 shadow-[0_0_20px_rgba(0,255,65,0.4)]' : gameState.currentTurn?.attackerId === opp.id ? 'border-[#00FF41]' : gameState.currentTurn?.defenderId === opp.id ? 'border-[#FF004C]' : 'border-[#333]'} rounded px-3 py-1 flex flex-col items-center min-w-[70px] max-w-[120px] shadow-lg shadow-black group transition-all duration-200 cursor-pointer touch-none`}
                       >
                         <span className="text-[8px] lg:text-[10px] uppercase font-bold text-white truncate w-full text-center">{opp.name}</span>
                         <span className="text-[9px] lg:text-[11px] text-[#00FF41] font-black tracking-tighter">{opp.cardCount} к</span>
                         <div className="flex flex-col gap-1 w-full mt-1 hidden group-hover:flex transition-all">
                            {!gameState.currentTurn && (
                              <button onClick={() => updateGameState(prev => ({ ...prev, currentTurn: { attackerId: opp.id, defenderId: 'me', moves: [] }}))} className="text-[7px] bg-[#333] hover:bg-[#00FF41]/20 hover:text-[#00FF41] rounded px-1 py-0.5 font-bold uppercase tracking-tighter text-white">Ход ко мне</button>
                            )}
                            {gameState.currentTurn && gameState.currentTurn.defenderId !== opp.id && (
                              <button onClick={() => setShowCardPicker({ target: 'attack', sourceId: opp.id })} className="text-[7px] bg-[#333] hover:bg-[#444] rounded px-1 py-0.5 font-bold uppercase tracking-tighter text-[#00FF41]">+ Подкинуть</button>
                            )}
                         </div>
                       </div>
                    );
                  })}

                  {/* My 'Seat' at the bottom */}
                  <div 
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 lg:translate-y-4 z-20 touch-none"
                    data-player-id="me"
                    onPointerDown={(e) => handlePointerDown(e, 'me')}
                    onPointerUp={clearLongPress}
                    onPointerLeave={clearLongPress}
                  >
                     <div className={`bg-[#111214] border-2 ${dragHoverId === 'me' ? 'border-[#00FF41] scale-105 shadow-[0_0_20px_rgba(0,255,65,0.4)]' : gameState.currentTurn?.attackerId === 'me' ? 'border-[#00FF41]' : gameState.currentTurn?.defenderId === 'me' ? 'border-[#FF004C]' : 'border-[#00FF41]/40'} rounded px-6 py-2 flex flex-col items-center shadow-[0_0_15px_rgba(0,255,65,0.15)] transition-all duration-200 cursor-pointer`}>
                         <span className="text-[9px] lg:text-[11px] uppercase font-bold text-[#00FF41]">Моя рука</span>
                         <span className="text-[10px] lg:text-[12px] text-white font-black">{gameState.myHand.length} к</span>
                     </div>
                  </div>

                  {/* Center Table Area */}
                  <div className="flex flex-wrap gap-4 lg:gap-8 justify-center content-center w-full h-full max-h-[350px] overflow-y-auto no-scrollbar relative z-10 py-6 lg:py-10">
                    {gameState.currentTurn?.moves.length === 0 && (
                       <div className="flex flex-col items-center justify-center text-[#444] opacity-50 absolute inset-0 pointer-events-none mt-4">
                         <span className="text-[10px] uppercase font-bold tracking-widest text-[#333]">Стол пуст</span>
                       </div>
                    )}
                    {gameState.currentTurn?.moves.map((move, idx) => (
                      <div key={idx} className="relative aspect-[2/3] w-[70px] lg:w-[90px] group mx-2 my-2">
                        {/* Attack Card */}
                        <div className={`absolute inset-0 bg-[#1D1E22] border-2 ${move.attack.suit === 'hearts' || move.attack.suit === 'diamonds' ? 'border-[#FF4C4C]' : 'border-[#444]'} rounded flex flex-col items-center justify-center z-10 card-shadow -translate-x-2 -translate-y-2`}>
                          <span className={`text-sm lg:text-lg font-bold ${move.attack.suit === 'hearts' || move.attack.suit === 'diamonds' ? 'text-[#FF4C4C]' : 'text-white'}`}>
                            {getRankLabel(move.attack.rank)}
                          </span>
                          {getSuitIcon(move.attack.suit, "w-4 h-4 lg:w-5 lg:h-5")}
                        </div>
                        
                        {/* Defending Card */}
                        {move.defense ? (
                          <div className={`absolute inset-0 bg-[#1D1E22] border-2 border-[#00FF41] rounded flex flex-col items-center justify-center z-20 card-shadow translate-x-2 translate-y-2`}>
                            <span className={`text-sm lg:text-lg font-bold ${move.defense.suit === 'hearts' || move.defense.suit === 'diamonds' ? 'text-[#FF4C4C]' : 'text-[#00FF41]'}`}>
                              {getRankLabel(move.defense.rank)}
                            </span>
                            {getSuitIcon(move.defense.suit, "w-4 h-4 lg:w-5 lg:h-5")}
                          </div>
                        ) : (
                          <div 
                            onClick={() => setShowCardPicker({ target: 'defense', moveIndex: idx })}
                            className="absolute inset-0 translate-x-2 translate-y-2 border-2 border-dashed border-[#333]/50 bg-black/40 rounded z-20 flex items-center justify-center cursor-pointer hover:bg-white/10 hover:border-[#00FF41]/50 text-[7px] lg:text-[8px] text-[#555] hover:text-[#00FF41] font-bold text-center px-1 transition-colors backdrop-blur-[2px]"
                          >
                            ОТБИТЬ
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {/* New Attack Trigger (now fits well on the table) */}
                    <div 
                      onClick={() => setShowCardPicker({ target: 'attack' })}
                      className="aspect-[2/3] w-[70px] lg:w-[90px] mx-2 my-2 border-2 border-dashed border-[#333]/50 rounded flex flex-col items-center justify-center cursor-pointer hover:border-[#00FF41]/50 group transition-colors backdrop-blur-[2px] bg-black/20"
                    >
                      <Plus className="w-5 h-5 text-[#444] group-hover:text-[#00FF41]" />
                      <span className="text-[7px] lg:text-[8px] text-[#444] mt-1 group-hover:text-[#00FF41] font-bold uppercase">Атака</span>
                    </div>
                  </div>
                </div>

                {/* Selection Arrow Overlay */}
                {arrowDrag && (
                  <div className="fixed inset-0 z-[100] pointer-events-none">
                    <svg className="w-full h-full">
                      <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                          <polygon points="0 0, 10 3.5, 0 7" fill="#00FF41" />
                        </marker>
                      </defs>
                      <motion.line
                        x1={arrowDrag.startX}
                        y1={arrowDrag.startY}
                        x2={arrowDrag.currentX}
                        y2={arrowDrag.currentY}
                        stroke="#00FF41"
                        strokeWidth="4"
                        strokeDasharray="8 4"
                        markerEnd="url(#arrowhead)"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      />
                      {/* Pulsing circle at cursor */}
                      <motion.circle 
                        cx={arrowDrag.currentX}
                        cy={arrowDrag.currentY}
                        r="12"
                        fill={dragHoverId && dragHoverId !== arrowDrag.sourceId ? "#00FF41" : "transparent"}
                        stroke="#00FF41"
                        strokeWidth="2"
                        initial={{ scale: 0 }}
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1 }}
                      />
                    </svg>
                    <div 
                      className="absolute bg-[#00FF41] text-black px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-lg"
                      style={{ left: arrowDrag.currentX + 20, top: arrowDrag.currentY - 20 }}
                    >
                      {dragHoverId === arrowDrag.sourceId ? 'ВЫБЕРИТЕ ЦЕЛЬ' : dragHoverId ? 'УСТАНОВИТЬ ЦЕЛЬ' : 'ТЯНИТЕ К ИГРОКУ'}
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Game Log or other table elements can go here if needed */}
            </div>
          )}

          {mobileView === 'hand' && isMobile() ? (
            <div className="flex flex-col flex-1 pb-20">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[10px] font-bold uppercase text-[#888]">Мои карты</h3>
                  <button onClick={() => setShowCardPicker({ target: 'hand' })} className="text-[#00FF41] bg-[#00FF41]/10 px-3 py-1 rounded text-[10px] font-bold">+ КАРТА</button>
               </div>
               <div className="grid grid-cols-3 gap-3 overflow-y-auto pr-2 no-scrollbar">
                  {gameState.myHand.map((card, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedCardIdx(selectedCardIdx === idx ? null : idx)}
                      className="aspect-[2/3] border border-[#333] rounded bg-[#1A1C1F] flex flex-col items-center justify-center relative group cursor-pointer lg:cursor-default"
                    >
                      <span className={`text-2xl font-bold ${card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-[#FF4C4C]' : 'text-white'}`}>
                        {getRankLabel(card.rank)}
                      </span>
                      {getSuitIcon(card.suit, "w-6 h-6")}
                      <div className={`absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-2 rounded transition-opacity ${selectedCardIdx === idx ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto'}`}>
                        <button onClick={(e) => { e.stopPropagation(); playCardToTable(card, idx); setSelectedCardIdx(null); }} className="bg-[#00FF41] text-black px-3 py-2 rounded text-[10px] font-bold uppercase w-10/12">На стол</button>
                        {gameState.currentTurn?.defenderId === 'me' && gameState.currentTurn?.moves.every(m => !m.defense) && gameState.currentTurn?.moves.some(m => m.attack.rank === card.rank) && (
                           <button onClick={(e) => { e.stopPropagation(); handleTransferFromHand(card, idx); setSelectedCardIdx(null); }} className="bg-[#ffb800] text-black px-3 py-2 rounded text-[10px] font-bold uppercase w-10/12 text-center">Перевод</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); removeFromHand(idx); setSelectedCardIdx(null); }} className="bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white py-2 rounded text-[10px] uppercase font-bold w-10/12 text-center flex justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          ) : null}

          {/* Bottom Game Logs - COMPACT ON MOBILE */}
          <div className={`${mobileView === 'board' ? 'flex' : 'hidden'} lg:flex mt-6 h-[120px] lg:h-[180px] border border-[#222] bg-[#111214] rounded p-3 flex-col overflow-hidden shrink-0`}>
            <div className="flex justify-between items-center mb-2 pb-1 border-b border-[#222]">
              <span className="text-[8px] font-bold text-[#555] uppercase tracking-widest">Система отслеживания карт</span>
              <span className="text-[7px] text-[#444] hidden sm:inline">RTX_7.0_СТАБИЛЬНО</span>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[8px] space-y-1 pr-1 no-scrollbar">
               {gameState.currentTurn && gameState.currentTurn.moves.map((m, i) => (
                 <div key={i} className="bg-[#0B0C0E] p-1.5 border border-[#222] border-l-[#FF004C] text-[#FF4C4C] opacity-70">
                   {getRankLabel(m.attack.rank)}{getSuitIconAsString(m.attack.suit)} ЗАФИКСИРОВАНА АТАКА
                 </div>
               ))}
               <div className="bg-[#0B0C0E] p-1.5 border border-[#222] border-l-[#00FF41] text-[#00FF41] animate-pulse">
                 СТАТУС: ОЖИДАНИЕ ВВОДА
               </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Navigation Bar */}
      <nav className="lg:hidden h-16 border-t border-[#2A2A2A] bg-[#111214] flex shrink-0 z-40">
        <button 
          onClick={() => setMobileView('intel')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${mobileView === 'intel' ? 'text-[#00FF41] bg-white/5' : 'text-[#555]'}`}
        >
          <Settings2 className="w-5 h-5" />
          <span className="text-[8px] font-bold uppercase">Опции</span>
        </button>
        <button 
          onClick={() => setMobileView('board')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${mobileView === 'board' ? 'text-[#00FF41] bg-white/5' : 'text-[#555]'}`}
        >
          <History className="w-5 h-5" />
          <span className="text-[8px] font-bold uppercase">Стол</span>
        </button>
        <button 
          onClick={() => setMobileView('hand')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${mobileView === 'hand' ? 'text-[#00FF41] bg-white/5' : 'text-[#555]'}`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[8px] font-bold uppercase">Рука</span>
        </button>
      </nav>

      {/* Desktop Bottom Status Bar */}
      <footer className="hidden lg:flex h-8 border-t border-[#2A2A2A] bg-[#111214] items-center px-6 justify-between text-[9px] text-[#555] shrink-0">
        <div className="flex gap-8">
          <span className="flex gap-2">ДВИЖОК: <span className={aiEngine === 'gemini' ? "text-[#00FF41]" : (aiEngine === 'gemma' ? "text-orange-400" : "text-blue-400")}>{aiEngine === 'gemini' ? (useGeminiPro ? "GEMINI-3.1-PRO" : "GEMINI-3-FLASH") : (aiEngine === 'gemma' ? "GEMMA-4-LOCAL" : "DEEPSEEK-V3 CLOUD")}</span></span>
          <span className="flex gap-2">КОЗЫРЬ: <span className="text-[#FFB800]">{gameState.trumpSuit?.toUpperCase() || "НЕ ОПРЕДЕЛЕН"}</span></span>
          <span className="flex gap-2">ИЗВЕСТНО КАРТ: <span className="text-[#00FF41]">{gameState.myHand.length + gameState.discardPile.length}/{gameState.rules.deckType + (gameState.rules.withJokers ? 4 : 0)}</span></span>
        </div>
        <div className="flex gap-6">
          <span className="text-[#00FF41] animate-pulse">● ГОТОВ К РАБОТЕ</span>
          <span>© 2026 ТАКТИЧЕСКИЙ ГЕЙМПЛЕЙ</span>
        </div>
      </footer>

      {/* Card Picker Modal - Updated for Theme */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111214] border border-[#2A2A2A] rounded p-8 max-w-md w-full shadow-[0_0_50px_rgba(0,0,0,0.8)]"
            >
              <div className="flex justify-between items-center mb-8 border-b border-[#222] pb-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">Конфигурация ИИ</h3>
                  <p className="text-[9px] text-[#555] uppercase mt-1">Выберите активный алгоритм анализа</p>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="text-[#FF004C] bg-[#FF004C]/10 hover:bg-[#FF004C]/20 transition-colors text-xs font-bold px-3 py-1 rounded"
                >_ЗАКРЫТЬ</button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] text-[#555] font-black uppercase tracking-wider mb-2">Активный Движок</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => {
                        setAiEngine('gemini');
                        localStorage.setItem('ai_engine', 'gemini');
                      }}
                      className={`py-3 rounded border font-black text-[10px] transition-all flex flex-col items-center justify-center gap-1 ${aiEngine === 'gemini' ? 'bg-[#00FF41]/10 border-[#00FF41] text-[#00FF41]' : 'border-[#222] text-[#444]'}`}
                    >
                      <span>GEMINI</span>
                      <span className="text-[7px] opacity-70">{useGeminiPro ? '3.1 PRO' : 'FLASH'}</span>
                    </button>
                    <button 
                      onClick={() => {
                        setAiEngine('gemma');
                        localStorage.setItem('ai_engine', 'gemma');
                      }}
                      className={`py-3 rounded border font-black text-[10px] transition-all flex flex-col items-center justify-center gap-1 ${aiEngine === 'gemma' ? 'bg-orange-500/10 border-orange-500 text-orange-500' : 'border-[#222] text-[#444]'}`}
                    >
                      <span>GEMMA</span>
                      <span className="text-[7px] opacity-70">4 E2B LOCAL</span>
                    </button>
                    <button 
                      onClick={() => {
                        setAiEngine('deepseek');
                        localStorage.setItem('ai_engine', 'deepseek');
                      }}
                      className={`py-3 rounded border font-black text-[10px] transition-all flex flex-col items-center justify-center gap-1 ${aiEngine === 'deepseek' ? 'bg-blue-500/10 border-blue-500 text-blue-500' : 'border-[#222] text-[#444]'}`}
                    >
                      <span>DEEPSEEK</span>
                      <span className="text-[7px] opacity-70">V3 CLOUD</span>
                    </button>
                  </div>
                </div>

                {aiEngine === 'gemini' && (
                  <div>
                    <label className="block text-[10px] text-[#555] font-black uppercase tracking-wider mb-2">Настройки Gemini</label>
                    <div 
                      onClick={() => {
                        const newVal = !useGeminiPro;
                        setUseGeminiPro(newVal);
                        localStorage.setItem('use_gemini_pro', String(newVal));
                      }}
                      className="flex items-center justify-between p-3 bg-black border border-[#222] rounded cursor-pointer hover:border-[#333] transition-colors"
                    >
                      <div>
                        <div className="text-[10px] text-white font-bold">GEMINI 3.1 PRO</div>
                        <div className="text-[8px] text-[#555]">МАКСИМАЛЬНАЯ МОЩНОСТЬ АНАЛИЗА</div>
                      </div>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${useGeminiPro ? 'bg-[#00FF41]' : 'bg-[#333]'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${useGeminiPro ? 'translate-x-4.5' : 'translate-x-0.5'}`}></div>
                      </div>
                    </div>
                    <p className="text-[8px] text-[#444] mt-2 uppercase tracking-tight italic">
                      Pro версия обеспечивает более глубокий поиск по дереву, но может работать медленнее.
                    </p>
                  </div>
                )}

                {aiEngine === 'deepseek' && (
                  <div>
                    <label className="block text-[10px] text-[#555] font-black uppercase tracking-wider mb-2">DeepSeek API Key</label>
                    <div className="relative">
                      <input 
                        type={showApiKey ? "text" : "password"} 
                        placeholder="sk-..."
                        value={deepseekApiKey}
                        onChange={(e) => {
                          setDeepseekApiKey(e.target.value);
                          localStorage.setItem('deepseek_api_key', e.target.value);
                        }}
                        className="w-full bg-black border border-[#333] rounded px-3 py-3 text-xs text-white focus:border-blue-500 outline-none pr-20 font-mono"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button 
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="p-1.5 text-[#555] hover:text-white transition-colors"
                        >
                          {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                          onClick={() => {
                            setDeepseekApiKey('');
                            localStorage.removeItem('deepseek_api_key');
                          }}
                          className="p-1.5 text-[#FF004C] hover:text-white transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[8px] text-[#444] mt-2 uppercase tracking-tight">
                      Ключ сохраняется локально и используется только для запросов к API DeepSeek.
                    </p>
                  </div>
                )}

                <div className="bg-[#1A1C1F] p-4 rounded border border-[#222] space-y-2">
                  <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="text-[9px] text-[#888] leading-relaxed uppercase font-bold tracking-tight">
                      {aiEngine === 'gemini' && 'Gemini Flash работает через сервер. Оптимален для быстрой и надежной работы.'}
                      {aiEngine === 'deepseek' && 'DeepSeek обеспечивает глубокий стратегический анализ, но требует API ключ.'}
                      {aiEngine === 'gemma' && (
                        <div className="space-y-1">
                          <p className="text-orange-400">GEMMA 4 E2B РАБОТАЕТ ЛОКАЛЬНО НА ВАШЕМ УСТРОЙСТВЕ.</p>
                          <p>КАК АКТИВИРОВАТЬ:</p>
                          <ol className="list-decimal list-inside space-y-0.5 text-[8px]">
                            <li>Используйте Chrome Canary или последнюю версию Chrome (v140+).</li>
                            <li>Перейдите в <span className="text-white">chrome://flags</span></li>
                            <li>Включите <span className="text-white">"Enables optimization guide on device"</span> и <span className="text-white">"Prompt API for Gemini Nano"</span>.</li>
                            <li>Перезагрузите браузер.</li>
                            <li>Браузер скачает модель (около 1.5 ГБ) — это займет время.</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] rounded uppercase transition-colors"
                >
                  Применить Конфигурацию
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showCardPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 lg:p-4 bg-black/95 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111214] border border-[#2A2A2A] rounded p-4 lg:p-8 max-w-2xl w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] max-h-[95vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex justify-between items-center mb-4 lg:mb-8 border-b border-[#222] pb-4">
                <div>
                  <h3 className="text-xs lg:text-sm font-black uppercase tracking-widest text-white">Выбор из реестра</h3>
                  <p className="text-[7px] lg:text-[9px] text-[#555] uppercase mt-1">Выберите карту для: {showCardPicker.target === 'transfer' ? 'ПЕРЕВОДА' : showCardPicker.target === 'defense' ? 'ЗАЩИТЫ' : showCardPicker.target === 'attack' ? 'АТАКИ' : showCardPicker.target === 'trump' ? 'КОЗЫРЯ' : showCardPicker.target === 'hand' ? 'РУКИ' : showCardPicker.target}</p>
                </div>
                <button 
                  onClick={() => setShowCardPicker(null)}
                  className={`${showCardPicker.target === 'hand' ? 'bg-[#00FF41] text-black' : 'text-[#FF004C] bg-[#FF004C]/10'} hover:opacity-80 transition-colors text-[10px] lg:text-xs font-bold px-3 py-1 rounded`}
                >{showCardPicker.target === 'hand' ? 'ГОТОВО (ЗАВЕРШИТЬ)' : '_ВЫХОД'}</button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 lg:gap-6">
                {SUITS.map(suit => (
                  <div key={suit} className="flex flex-col gap-2">
                    <div className="flex justify-center mb-1 lg:mb-2 items-center gap-1 border-b border-[#222] pb-1">
                      {getSuitIcon(suit, "w-3 h-3 lg:w-4 lg:h-4")}
                      <span className="text-[8px] text-[#444] uppercase font-bold">{getSuitLabel(suit)}</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-1 gap-1">
                      {RANKS.filter(r => (r !== 'JOKER' || gameState.rules.withJokers)).filter(r => {
                        if (gameState.rules.deckType === 52) return true;
                        return !['2', '3', '4', '5'].includes(r);
                      }).filter(r => {
                         if (showCardPicker.target === 'transfer' && gameState.currentTurn?.moves.length) {
                             return r === gameState.currentTurn.moves[0].attack.rank;
                         }
                         return true;
                      }).map(rank => (
                        <button 
                          key={`${rank}-${suit}`}
                          onClick={() => handleCardPick({ rank, suit })}
                          className={`py-2 rounded border transition-all text-[10px] lg:text-xs font-bold ${
                            gameState.myHand.some(c => c.rank === rank && c.suit === suit)
                              ? 'bg-[#00FF41]/20 border-[#00FF41] text-[#00FF41]'
                              : `border-[#333] hover:border-[#00FF41] hover:bg-[#00FF41] hover:text-black ${suit === 'hearts' || suit === 'diamonds' ? 'text-[#FF4C4C]' : 'text-white'}`
                          }`}
                        >
                          {getRankLabel(rank)} {gameState.myHand.some(c => c.rank === rank && c.suit === suit) && '✓'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

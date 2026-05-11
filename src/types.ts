
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | 'JOKER';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface GameState {
  myHand: Card[];
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  deckCount: number;
  discardPile: Card[];
  opponents: { id: string; name: string; cardCount: number; position?: 'left' | 'top-left' | 'top' | 'top-right' | 'right' }[];
  currentTurn: {
    moves: { attack: Card; attackSourceId?: string; defense?: Card; defenseSourceId?: string }[];
    attackerId: string;
    defenderId: string;
  } | null;
  history: { 
    type: 'beaten' | 'taken' | 'taken_by_opp'; 
    moves: { attack: Card; attackSourceId?: string; defense?: Card; defenseSourceId?: string }[];
    attackerId: string;
    defenderId: string;
    timestamp: number;
  }[];
  rules: {
    deckType: 36 | 52;
    withJokers: boolean;
    isPerevodnoy: boolean;
    isPodkidnoy: boolean;
    maxAttackCards: number;
  };
}

export interface AiResponse {
  suggestion: string;
  suggestedCards?: Card[];
  reasoning: string;
  probabilityOfWinning: string;
  scenarios: { option: string; outcome: string }[];
}

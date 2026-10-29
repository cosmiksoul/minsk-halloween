// Покер для руки часа: подписи и названия карт, ранг руки из пяти карт с множителями HAND_MULT.
// Без three и без DOM: модуль гоняется тестами в node.
import { HAND_MULT } from './rules.js';

export const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RANK_NAME = { 2: 'двойка', 3: 'тройка', 4: 'четвёрка', 5: 'пятёрка', 6: 'шестёрка', 7: 'семёрка', 8: 'восьмёрка', 9: 'девятка', 10: 'десятка', 11: 'валет', 12: 'дама', 13: 'король', 14: 'туз' };
const SUIT_NAME = { '♠': 'пик', '♥': 'червей', '♦': 'бубен', '♣': 'треф' };
const HAND_NAME = { high: 'старшая карта', pair: 'пара', twoPair: 'две пары', three: 'тройка', straight: 'стрит', flush: 'флеш', fullHouse: 'фулл-хаус', four: 'каре', straightFlush: 'стрит-флеш' };

export function cardLabel(rank, suit) { return (RANK_LABEL[rank] || String(rank)) + suit; }
export function isRed(suit) { return suit === '♥' || suit === '♦'; }
export function cardName(rank, suit) { return `${RANK_NAME[rank] || rank} ${SUIT_NAME[suit] || suit}`; }
// «бит» для карт мужского рода (валет, король, туз), «бита» для остальных (двойка… десятка, дама)
export function beaten(rank) { return rank === 11 || rank === 13 || rank === 14 ? 'бит' : 'бита'; }

// ранг руки из пяти карт { rank, suit }: стрит по отсортированным рангам без повторов, туз и как 14, и как 1
export function handRank(cards) {
  const counts = new Map(); for (const c of cards) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = cards.length === 5 && cards.every(c => c.suit === cards[0].suit);
  const uniq = [...counts.keys()].sort((a, b) => a - b); if (uniq.includes(14)) uniq.unshift(1);
  let straight = false; for (let i = 0; i + 4 < uniq.length; i++) if (uniq[i + 4] - uniq[i] === 4) straight = true;
  const key = straight && flush ? 'straightFlush' : groups[0] === 4 ? 'four' : groups[0] === 3 && groups[1] === 2 ? 'fullHouse' : flush ? 'flush' : straight ? 'straight'
    : groups[0] === 3 ? 'three' : groups[0] === 2 && groups[1] === 2 ? 'twoPair' : groups[0] === 2 ? 'pair' : 'high';
  return { key, name: HAND_NAME[key], mult: HAND_MULT[key] };
}

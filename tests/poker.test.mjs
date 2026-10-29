import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardLabel, cardName, beaten, isRed, handRank } from '../src/poker.js';
const c = (rank, suit) => ({ rank, suit });
test('cardLabel, cardName, beaten, isRed', () => {
  assert.equal(cardLabel(14, '♠'), 'A♠'); assert.equal(cardLabel(10, '♥'), '10♥'); assert.equal(cardLabel(11, '♦'), 'J♦'); assert.equal(cardLabel(13, '♣'), 'K♣');
  assert.equal(cardName(14, '♠'), 'туз пик'); assert.equal(cardName(7, '♦'), 'семёрка бубен'); assert.equal(cardName(12, '♥'), 'дама червей'); assert.equal(cardName(10, '♣'), 'десятка треф');
  assert.equal(beaten(14), 'бит'); assert.equal(beaten(12), 'бита'); assert.equal(beaten(7), 'бита'); assert.equal(isRed('♥'), true); assert.equal(isRed('♠'), false);
});
test('handRank: все ранги', () => {
  assert.deepEqual(handRank([c(2, '♠'), c(5, '♥'), c(9, '♦'), c(11, '♣'), c(13, '♠')]), { key: 'high', name: 'старшая карта', mult: 1 });
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(2, '♦'), c(5, '♣'), c(13, '♠')]).key, 'pair');
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(2, '♦'), c(2, '♣'), c(13, '♠')]).key, 'twoPair');
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(8, '♦'), c(2, '♣'), c(13, '♠')]).key, 'three');
  assert.equal(handRank([c(5, '♠'), c(6, '♥'), c(7, '♦'), c(8, '♣'), c(9, '♠')]).key, 'straight');
  assert.equal(handRank([c(14, '♠'), c(2, '♥'), c(3, '♦'), c(4, '♣'), c(5, '♠')]).key, 'straight');
  assert.equal(handRank([c(10, '♠'), c(11, '♥'), c(12, '♦'), c(13, '♣'), c(14, '♠')]).key, 'straight');
  assert.equal(handRank([c(2, '♠'), c(5, '♠'), c(9, '♠'), c(11, '♠'), c(13, '♠')]).key, 'flush');
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(8, '♦'), c(2, '♣'), c(2, '♠')]).key, 'fullHouse');
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(8, '♦'), c(8, '♣'), c(2, '♠')]).key, 'four');
  assert.deepEqual(handRank([c(5, '♥'), c(6, '♥'), c(7, '♥'), c(8, '♥'), c(9, '♥')]), { key: 'straightFlush', name: 'стрит-флеш', mult: 30 });
  assert.equal(handRank([c(14, '♥'), c(2, '♥'), c(3, '♥'), c(4, '♥'), c(5, '♥')]).mult, 30);
});

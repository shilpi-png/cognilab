/* CogniLab — store tests (node --test) */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/store.js');

// fake storage for deterministic tests
function memStorage() {
  let m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _raw: (k) => m[k]
  };
}

test('load: seeds demo deck when empty', () => {
  const st = memStorage();
  const s = S.load(st);
  assert.ok(Object.keys(s.cards).length >= 10);
  assert.ok(Object.values(s.cards).every(c => c.front && c.topic));
});

test('save + load round-trip preserves cards and reviews', () => {
  const st = memStorage();
  const s1 = S.seedDemo(S.emptyState());
  const card = S.upsertCard(s1, { topic: 'Test', front: 'Q?', back: 'A' });
  S.recordReview(s1, { cardId: card.id, mode: 'study', grade: 3, estimatePct: 80 });
  S.save(s1, st);
  const s2 = S.load(st);
  assert.equal(s2.reviews.length, 1);
  assert.equal(s2.cards[card.id].lastReview, s1.cards[card.id].lastReview);
});

test('recordReview updates the card schedule and flags recall', () => {
  const s = S.emptyState();
  const card = S.upsertCard(s, { topic: 'T', front: 'Q', back: 'A' });
  const r1 = S.recordReview(s, { cardId: card.id, mode: 'study', grade: 0, estimatePct: 90 });
  assert.equal(r1.recalled, false);
  assert.equal(s.cards[card.id].intervalDays, 0);
  const r2 = S.recordReview(s, { cardId: card.id, mode: 'study', grade: 3, estimatePct: 70 });
  assert.equal(r2.recalled, true);
  assert.equal(s.cards[card.id].intervalDays, 1);
  assert.equal(s.cards[card.id].repetitions, 1);
});

test('upsertCard: requires a front; edits existing card by id', () => {
  const s = S.emptyState();
  assert.throws(() => S.upsertCard(s, { front: '' }), /required/);
  const c = S.upsertCard(s, { topic: 'T', front: 'Q', back: 'A' });
  const c2 = S.upsertCard(s, { id: c.id, front: 'Q2', summary: 'one idea' });
  assert.equal(c2.id, c.id);
  assert.equal(s.cards[c.id].front, 'Q2');
  assert.equal(s.cards[c.id].summary, 'one idea');
});

test('deleteCard removes card and its review history', () => {
  const s = S.emptyState();
  const c = S.upsertCard(s, { topic: 'T', front: 'Q', back: 'A' });
  S.recordReview(s, { cardId: c.id, mode: 'study', grade: 2 });
  S.deleteCard(s, c.id);
  assert.equal(s.cards[c.id], undefined);
  assert.equal(s.reviews.length, 0);
});

test('export/import round-trip rejects foreign data', () => {
  const s = S.emptyState();
  S.upsertCard(s, { topic: 'T', front: 'Q', back: 'A' });
  const text = S.exportJSON(s);
  assert.equal(S.importJSON(text).cards[s.cards[Object.keys(s.cards)[0]].id].front, 'Q');
  assert.throws(() => S.importJSON('{"version":99,"cards":{},"reviews":[]}'), /version/);
  assert.throws(() => S.importJSON('not json'), /JSON|Unexpected/);
});

test('corrupted storage falls back to demo seed', () => {
  const st = memStorage();
  st.setItem(S.KEY, '{broken json');
  const s = S.load(st);
  assert.ok(Object.keys(s.cards).length >= 10);
});

/* CogniLab — engine tests (node --test) */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');

test('scheduleAfter: failed card resets to immediate relearn', () => {
  const card = { ease: 2.5, repetitions: 3, intervalDays: 12, lastReview: new Date().toISOString() };
  const s = E.scheduleAfter(card, 0);
  assert.equal(s.intervalDays, 0);
  assert.equal(s.repetitions, 0);
});

test('scheduleAfter: first successful recall lands tomorrow', () => {
  const s = E.scheduleAfter({ ease: null, repetitions: 0, intervalDays: 0 }, 2);
  assert.equal(s.intervalDays, 1);
  assert.equal(s.repetitions, 1);
});

test('scheduleAfter: intervals grow on good recall, ease is bounded', () => {
  let card = { ease: 2.5, repetitions: 2, intervalDays: 3 };
  for (let i = 0; i < 20; i++) card = E.scheduleAfter(card, 3);
  assert.ok(card.intervalDays > 100, 'intervals should grow well beyond a week');
  assert.ok(card.ease >= 1.3 && card.ease <= 3.0, 'ease must stay in bounds, got ' + card.ease);
});

test('scheduleAfter: hard recall grows the interval slower than easy', () => {
  let hard = { ease: 2.5, repetitions: 5, intervalDays: 10 };
  let easy = { ease: 2.5, repetitions: 5, intervalDays: 10 };
  hard = E.scheduleAfter(hard, 1);
  easy = E.scheduleAfter(easy, 3);
  assert.ok(easy.intervalDays > hard.intervalDays);
});

test('isDue: never-reviewed cards are due', () => {
  assert.equal(E.isDue({ lastReview: null, intervalDays: 0 }, new Date()), true);
});

test('isDue: reviewed card with future interval is not due', () => {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(E.isDue({ lastReview: yesterday.toISOString(), intervalDays: 7 }, new Date()), false);
});

test('isDue: reviewed card past its interval is due', () => {
  const d = new Date(); d.setDate(d.getDate() - 8);
  assert.equal(E.isDue({ lastReview: d.toISOString(), intervalDays: 7 }, new Date()), true);
});

test('buildQueue: interleaved queue alternates topics', () => {
  const now = new Date();
  const mk = (id, topic) => ({ id, topic, front: id, back: 'x', lastReview: now.toISOString(), intervalDays: 0 });
  const cards = [
    mk('a1', 'A'), mk('a2', 'A'), mk('a3', 'A'),
    mk('b1', 'B'), mk('b2', 'B'),
  ];
  const q = E.buildQueue(cards, { interleave: true, includeNotDue: true });
  assert.equal(q.length, 5);
  const topics = q.map(c => c.topic);
  assert.equal(topics[0], 'A');
  assert.equal(topics[1], 'B');
  // no adjacent same-topic
  for (let i = 1; i < topics.length; i++) assert.notEqual(topics[i], topics[i - 1]);
});

test('buildQueue: blocked queue groups by topic', () => {
  const now = new Date();
  const mk = (id, topic) => ({ id, topic, front: id, back: 'x', lastReview: now.toISOString(), intervalDays: 0 });
  const cards = [mk('a1', 'A'), mk('b1', 'B'), mk('a2', 'A'), mk('b2', 'B')];
  const q = E.buildQueue(cards, { interleave: false, includeNotDue: true });
  assert.deepEqual(q.map(c => c.topic), ['A', 'A', 'B', 'B']);
});

test('buildQueue: due filter excludes cards with future intervals', () => {
  const now = new Date();
  const due = { id: 'd', topic: 'A', front: 'f', back: 'b', lastReview: now.toISOString(), intervalDays: 0 };
  const notDue = new Date(); notDue.setDate(notDue.getDate() - 1);
  const nd = { id: 'n', topic: 'A', front: 'f', back: 'b', lastReview: notDue.toISOString(), intervalDays: 10 };
  const q = E.buildQueue([due, nd], { interleave: false });
  assert.deepEqual(q.map(c => c.id), ['d']);
});

test('calibration: detects overconfidence', () => {
  const reviews = [];
  for (let i = 0; i < 10; i++) reviews.push({ estimatePct: 90, recalled: i < 6 });
  const cal = E.calibration(reviews);
  assert.equal(cal.n, 10);
  assert.ok(cal.bias > 0.15, 'bias should be positive (overconfident), got ' + cal.bias);
  const topBin = cal.bins.find(b => b.from === 90);
  assert.equal(topBin.n, 10);
  assert.ok(Math.abs(topBin.avgRecall - 0.6) < 1e-9);
});

test('calibration: perfect prediction gives zero brier', () => {
  const reviews = [
    { estimatePct: 100, recalled: true },
    { estimatePct: 100, recalled: true },
    { estimatePct: 0, recalled: false }
  ];
  assert.equal(E.calibration(reviews).brier, 0);
});

test('streak: counts consecutive active days ending today', () => {
  const mk = (daysAgo) => {
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    return { ts: d.toISOString() };
  };
  assert.equal(E.streak([mk(0), mk(1), mk(2)]), 3);
  assert.equal(E.streak([mk(1), mk(2)]), 2); // today empty still counts
  assert.equal(E.streak([mk(2)]), 0);
  assert.equal(E.streak([]), 0);
});

test('reviewsPerDay: returns 14 day buckets', () => {
  const out = E.reviewsPerDay([], 14);
  assert.equal(out.length, 14);
  assert.equal(out[13].count, 0);
});

test('countWords: counts whitespace-separated words', () => {
  assert.equal(E.countWords('the cat sat'), 3);
  assert.equal(E.countWords('   '), 0);
  assert.equal(E.countWords(null), 0);
});

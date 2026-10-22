/* CogniLab — store.js
 * Persistence layer. One JSON blob in localStorage, versioned,
 * with export/import and a seeded demo deck.
 */
(function (global) {
  'use strict';

  var KEY = 'cognilab.state.v1';
  var VERSION = 1;

  var DEMO = [
    { topic: 'Retrieval practice', front: 'Why does testing yourself beat rereading for long-term memory?', back: 'Retrieval strengthens the memory trace each time a recall succeeds (the testing effect). The effort of pulling information out is exactly what makes it stick — passive rereading produces fluency, not durable memory.' },
    { topic: 'Retrieval practice', front: 'What is the "illusion of familiarity"?', back: 'The feeling that material is familiar because you have seen it many times, mistaken for having learned it. It is the classic trap of rereading: recognition is not recall.' },
    { topic: 'Spaced practice', front: 'Why does spacing out study sessions beat one long session?', back: 'Spacing lets some forgetting happen, and each relearning from partial forgetting strengthens the memory more than a repeat with nothing lost (desirable difficulty). A week of 10 minutes beats one 70-minute cram for what survives a month later.' },
    { topic: 'Spaced practice', front: 'Roughly how long should the first gap be after first learning a card?', back: 'About one day. Gaps then grow: a few days, then a week or more. The schedule should extend each interval while the card is still retrievable — that is what spaced repetition automates.' },
    { topic: 'Summarization', front: 'What makes a summary actually improve retention?', back: 'Generating it yourself in your own words forces you to organise and integrate the material. Copying or lightly rephrasing sentences does most of the work of reading without its benefit — aim to explain, not transcribe.' },
    { topic: 'Summarization', front: 'A good one-line summary should answer what question?', back: '"What is the one idea I would explain if I had to teach this?" If you cannot state it, you have not yet extracted the point — keep looking before writing.' },
    { topic: 'Interleaving', front: 'What is interleaved practice and why does it feel worse while it works better?', back: 'Mixing different problem types or topics in one session instead of blocking one topic at a time. It feels slower because you constantly re-derive the approach, but that comparison and re-selection is what trains you to choose the right strategy later.' },
    { topic: 'Interleaving', front: 'When is blocking (topic blocks) actually useful?', back: 'When first acquiring a topic — blocked practice builds the raw material. Interleaving pays off once each item is known reasonably well, because the gain is in discrimination and strategy selection.' },
    { topic: 'Metacognition', front: 'What does a calibration curve compare?', back: 'Your predicted confidence ("I am 80% sure") against your actual recall rate. People are usually overconfident at the top end: believing 90% and recalling 70% means the confidence, not the knowledge, is the leak.' },
    { topic: 'Metacognition', front: 'What is the Feynman technique?', back: 'Explain a concept in plain language, as if teaching a beginner, then find the gaps where your explanation stalls. The stall is the true edge of what you know — go back to the source and repair it.' }
  ];

  function emptyState() {
    return {
      version: VERSION,
      cards: {},
      reviews: [],
      settings: { interleave: true, dailyGoal: 20, sessionSize: 10 },
      created: new Date().toISOString()
    };
  }

  function nextId() {
    try {
      if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    } catch (e) { /* fall through */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function seedDemo(state) {
    var now = new Date();
    DEMO.forEach(function (d, i) {
      var id = nextId();
      state.cards[id] = {
        id: id,
        topic: d.topic,
        front: d.front,
        back: d.back,
        summary: '',
        createdAt: now.toISOString(),
        lastReview: null,
        ease: null,
        repetitions: 0,
        intervalDays: 0
      };
    });
    return state;
  }

  function load(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) return seedDemo(emptyState());
    var raw = storage.getItem(KEY);
    if (!raw) return seedDemo(emptyState());
    try {
      var s = JSON.parse(raw);
      if (!s || s.version !== VERSION || !s.cards) return seedDemo(emptyState());
      return s;
    } catch (e) {
      return seedDemo(emptyState());
    }
  }

  function save(state, storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (storage) storage.setItem(KEY, JSON.stringify(state));
    return state;
  }

  /** Create or update a card; returns the card. */
  function upsertCard(state, fields) {
    var id = fields.id && state.cards[fields.id] ? fields.id : nextId();
    if (!fields.front || !fields.front.trim()) throw new Error('front of card is required');
    var card = state.cards[id] || {
      id: id, createdAt: new Date().toISOString(), lastReview: null,
      ease: null, repetitions: 0, intervalDays: 0, summary: ''
    };
    ['topic', 'front', 'back'].forEach(function (k) {
      if (fields[k] != null) card[k] = String(fields[k]);
    });
    if (fields.summary != null) card.summary = String(fields.summary);
    if (!card.topic) card.topic = 'General';
    state.cards[id] = card;
    return card;
  }

  function deleteCard(state, id) {
    delete state.cards[id];
    state.reviews = state.reviews.filter(function (r) { return r.cardId !== id; });
  }

  /** Record one completed card review and update the card's schedule. */
  function recordReview(state, review) {
    var Engine = (global.CogniLab && global.CogniLab.Engine) || (typeof require !== 'undefined' ? require('./engine.js') : null);
    var card = state.cards[review.cardId];
    if (!card) throw new Error('unknown card ' + review.cardId);
    var sched = Engine ? Engine.scheduleAfter(card, review.grade) : { ease: 2.5, repetitions: 0, intervalDays: 0 };
    card.ease = sched.ease;
    card.repetitions = sched.repetitions;
    card.intervalDays = sched.intervalDays;
    card.lastReview = new Date().toISOString();
    var entry = {
      id: nextId(),
      cardId: review.cardId,
      topic: card.topic,
      ts: new Date().toISOString(),
      mode: review.mode || 'study',
      grade: review.grade,
      estimatePct: typeof review.estimatePct === 'number' ? review.estimatePct : null,
      recalled: review.grade > 0,
      feynman: review.feynman ? String(review.feynman) : ''
    };
    state.reviews.push(entry);
    return entry;
  }

  function exportJSON(state) {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    var s = JSON.parse(text);
    if (!s || s.version !== VERSION || typeof s.cards !== 'object' || !Array.isArray(s.reviews)) {
      throw new Error('not a CogniLab export (version mismatch or missing cards)');
    }
    return s;
  }

  var API = {
    KEY: KEY,
    load: load,
    save: save,
    emptyState: emptyState,
    seedDemo: seedDemo,
    upsertCard: upsertCard,
    deleteCard: deleteCard,
    recordReview: recordReview,
    exportJSON: exportJSON,
    importJSON: importJSON
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.CogniLab = global.CogniLab || {};
  global.CogniLab.Store = API;
})(typeof window !== 'undefined' ? window : this);

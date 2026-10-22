/* CogniLab — engine.js
 * Pure, dependency-free learning-engine logic: SM-2-style scheduling,
 * interleaved queue building, metacognition (calibration) statistics.
 * No DOM access here, so the whole file is unit-testable in Node.
 */
(function (global) {
  'use strict';

  var EASE_MIN = 1.3;
  var EASE_MAX = 3.0;
  var EASE_START = 2.5;

  function clampEase(e) {
    if (!(e >= 0)) e = EASE_START;
    return Math.min(EASE_MAX, Math.max(EASE_MIN, e));
  }

  /* Grades are self-assessment after a recall attempt:
   * 0 = failed   1 = hard (hesitated / partial)
   * 2 = good     3 = easy (fluent)
   */

  /**
   * Advance one card's schedule after a graded review.
   * @param {object} card {ease, repetitions, intervalDays, lastReview}
   * @param {number} grade 0..3
   * @returns {{ease, repetitions, intervalDays}}
   */
  function scheduleAfter(card, grade) {
    if (grade < 0 || grade > 3) throw new Error('grade must be 0..3');
    var ease = clampEase(card.ease == null ? EASE_START : card.ease);
    var reps = card.repetitions || 0;
    var interval = card.intervalDays || 0;

    var easeDelta = (grade - 2) * 0.1;          // classic SM-2 flavour
    if (grade === 0) easeDelta = -0.2;
    if (grade === 1) easeDelta = -0.1;
    if (grade === 3) easeDelta = 0.15;
    var newEase = clampEase(ease + easeDelta);

    var newInterval, newReps;
    if (grade === 0) {
      // Failed: relearn now; if the card had a long interval, halve it
      // so the next correct recall lands sooner than before.
      newReps = 0;
      newInterval = 0;
    } else if (reps === 0) {
      newReps = 1;
      newInterval = 1; // first successful recall -> tomorrow
    } else if (reps === 1) {
      newReps = 2;
      newInterval = grade === 3 ? 4 : 3;
    } else {
      newReps = reps + 1;
      if (grade === 1) {
        newInterval = Math.max(1, Math.round(interval * 0.7));
      } else if (grade === 3) {
        newInterval = Math.max(interval + 1, Math.round(interval * newEase * 1.25));
      } else {
        newInterval = Math.max(interval + 1, Math.round(interval * newEase));
      }
    }
    return { ease: newEase, repetitions: newReps, intervalDays: newInterval };
  }

  /**
   * A card is due when it has never been reviewed, or when
   * lastReview + intervalDays days is in the past (or today).
   */
  function isDue(card, today) {
    today = today || new Date();
    if (!card.lastReview) return true;
    var dueDate = addDays(new Date(card.lastReview), card.intervalDays || 0);
    return startOfDay(dueDate) <= startOfDay(today);
  }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function dayKey(d) {
    d = startOfDay(d);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /**
   * Build an ordered study queue.
   * @param {object[]} cards cards with {id, topic, ...}
   * @param {object} opts {interleave:bool, includeNotDue:bool, today:Date}
   * @returns {object[]} ordered card ids-wrapped objects
   *
   * Interleaved: round-robin across topics so adjacent cards usually
   * come from different topics. Non-interleaved: topic blocks
   * (blocked practice) — kept deliberately, because comparing the two
   * modes is itself a learning-science exercise.
   */
  function buildQueue(cards, opts) {
    opts = opts || {};
    var today = opts.today || new Date();
    var due = cards.filter(function (c) {
      return opts.includeNotDue || isDue(c, today);
    });
    if (opts.topics && opts.topics.length) {
      due = due.filter(function (c) {
        return opts.topics.indexOf(c.topic) !== -1;
      });
    }

    if (!opts.interleave) {
      // Blocked: group by topic, stable order inside each group.
      var byTopic = {};
      due.forEach(function (c) {
        (byTopic[c.topic] = byTopic[c.topic] || []).push(c);
      });
      var out = [];
      Object.keys(byTopic).forEach(function (t) { out = out.concat(byTopic[t]); });
      return out;
    }

    // Interleaved round-robin: sort each topic's pile by due date
    // (oldest first) and take one at a time, cycling topics.
    var topics = {};
    due.forEach(function (c) {
      (topics[c.topic] = topics[c.topic] || []).push(c);
    });
    var queues = Object.keys(topics)
      .map(function (t) { return { topic: t, items: topics[t] }; })
      .sort(function (a, b) { return a.topic < b.topic ? -1 : 1; });

    queues.forEach(function (q) {
      q.items.sort(function (a, b) {
        var ad = a.lastReview || 0;
        var bd = b.lastReview || 0;
        return ad - bd; // never-reviewed cards first
      });
    });

    var result = [];
    var active = queues.filter(function (q) { return q.items.length; });
    while (active.length) {
      var next = [];
      active.forEach(function (q) {
        result.push(q.items.shift());
        if (q.items.length) next.push(q);
      });
      active = next;
    }
    return result;
  }

  /**
   * Calibration: compare predicted confidence with actual recall.
   * reviews: [{estimatePct: 0..100, recalled: bool}]
   * Returns bins of width 10 with avgEstimate / avgRecall / n,
   * plus overall Brier score and a bias index (avgEstimate - avgRecall).
   */
  function calibration(reviews) {
    var bins = [];
    for (var i = 0; i < 10; i++) {
      bins.push({ from: i * 10, to: (i + 1) * 10, est: 0, rec: 0, n: 0 });
    }
    var brierSum = 0, estSum = 0, recSum = 0, n = 0;
    (reviews || []).forEach(function (r) {
      if (typeof r.estimatePct !== 'number' || r.estimatePct < 0 || r.estimatePct > 100) return;
      var e = r.estimatePct / 100;
      var a = r.recalled ? 1 : 0;
      var b = Math.min(9, Math.floor(r.estimatePct / 10));
      bins[b].est += e; bins[b].rec += a; bins[b].n += 1;
      brierSum += (e - a) * (e - a);
      estSum += e; recSum += a; n += 1;
    });
    var out = bins.map(function (b) {
      return {
        from: b.from, to: b.to, n: b.n,
        avgEstimate: b.n ? b.est / b.n : null,
        avgRecall: b.n ? b.rec / b.n : null
      };
    });
    return {
      bins: out,
      n: n,
      brier: n ? brierSum / n : null,
      bias: n ? estSum / n - recSum / n : null // >0 = overconfident
    };
  }

  /** Reviews grouped per day-key, for the activity chart. */
  function reviewsPerDay(reviews, days) {
    days = days || 14;
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var key = dayKey(addDays(new Date(), -i));
      var count = (reviews || []).filter(function (r) {
        return dayKey(new Date(r.ts)) === key;
      }).length;
      out.push({ day: key, count: count });
    }
    return out;
  }

  /** Consecutive days (ending today or yesterday) with at least one review. */
  function streak(reviews) {
    var days = new Set((reviews || []).map(function (r) { return dayKey(new Date(r.ts)); }));
    var cur = new Date();
    if (!days.has(dayKey(cur))) cur = addDays(cur, -1); // streak survives until today is done
    var s = 0;
    while (days.has(dayKey(cur))) { s++; cur = addDays(cur, -1); }
    return s;
  }

  function countWords(s) {
    return (s || '').trim().split(/\s+/).filter(Boolean).length;
  }

  var API = {
    scheduleAfter: scheduleAfter,
    isDue: isDue,
    buildQueue: buildQueue,
    calibration: calibration,
    reviewsPerDay: reviewsPerDay,
    streak: streak,
    countWords: countWords,
    dayKey: dayKey,
    EASE_START: EASE_START
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.CogniLab = global.CogniLab || {};
  global.CogniLab.Engine = API;
})(typeof window !== 'undefined' ? window : this);

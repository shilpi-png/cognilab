/* CogniLab — app.js
 * UI layer: views (Study, Reread, Library, Insights), session runner,
 * metacognition prompts, and persistence wiring. No business logic here —
 * that lives in engine.js / store.js.
 */
(function () {
  'use strict';

  var E = window.CogniLab.Engine;
  var S = window.CogniLab.Store;
  var C = window.CogniLab.Charts;

  var state = S.load();
  var session = null; // active study session

  function persist() { S.save(state); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function allCards() { return Object.keys(state.cards).map(function (k) { return state.cards[k]; }); }

  function todayKey() { return E.dayKey(new Date()); }

  function reviewsToday() {
    return state.reviews.filter(function (r) { return E.dayKey(new Date(r.ts)) === todayKey(); });
  }

  function topics() {
    var t = {};
    allCards().forEach(function (c) { t[c.topic || 'General'] = (t[c.topic || 'General'] || 0) + 1; });
    return Object.keys(t).sort(function (a, b) { return a < b ? -1 : 1; });
  }

  /* ---------------- views ---------------- */

  function render() {
    var route = (location.hash || '#study').replace('#', '');
    var main = document.getElementById('view');
    var nav = document.getElementById('nav');
    var views = ['study', 'reread', 'library', 'insights'];
    nav.innerHTML = views.map(function (v) {
      var label = { study: 'Study', reread: 'Reread', library: 'Library', insights: 'Insights' }[v];
      var extra = v === 'study' ? dueBadge() : '';
      return '<a href="#' + v + '" class="nav-link ' + (route === v ? 'active' : '') + '">' + label + extra + '</a>';
    }).join('');
    if (route === 'study') main.innerHTML = viewStudy();
    else if (route === 'reread') main.innerHTML = viewReread();
    else if (route === 'library') main.innerHTML = viewLibrary();
    else main.innerHTML = viewInsights();
    wire(route);
  }

  function dueBadge() {
    var n = allCards().filter(function (c) { return E.isDue(c, new Date()); }).length;
    return n ? '<span class="badge">' + n + '</span>' : '';
  }

  /* ---- Study: retrieval practice + spaced schedule + metacognition ---- */

  function viewStudy() {
    if (session) return sessionView();
    var ts = topics();
    var due = allCards().filter(function (c) { return E.isDue(c, new Date()); });
    var today = reviewsToday().length;
    var goal = state.settings.dailyGoal;
    var interleave = state.settings.interleave;

    var topicChecks = ts.map(function (t) {
      return '<label class="topic-check"><input type="checkbox" class="topic-pick" value="' + esc(t) + '" checked> ' + esc(t) + '</label>';
    }).join('') || '<span class="muted">No topics yet — add cards in the Library.</span>';

    return [
      '<div class="card hero">',
      '  <div class="hero-row">',
      '    <div><h2>Today</h2><p class="big-stat">' + due.length + '<span class="stat-unit"> cards due</span></p>',
      '    <p class="muted">' + today + ' of ' + goal + ' reviews done today</p>',
      '    <div class="goalbar"><div class="goalbar-fill" style="width:' + Math.min(100, Math.round(today / goal * 100)) + '%"></div></div></div>',
      '    <div class="hero-actions">',
      '      <button class="btn primary" id="start-session" ' + (due.length ? '' : 'disabled') + '>Start session</button>',
      '      <label class="toggle"><input type="checkbox" id="interleave-toggle" ' + (interleave ? 'checked' : '') + '> Interleave topics</label>',
      '    </div>',
      '  </div>',
      '  <p class="hint">' + (interleave
        ? 'Interleaving mixes topics within the session — harder moment to moment, stronger strategy skills. '
        : 'Blocked practice groups each topic — better when first acquiring material. ')
        + 'You can toggle it any time; comparing both modes is part of the method.</p>',
      '  <div class="queue-setup">',
      '    <label>Session size <input type="number" id="session-size" min="1" max="60" value="' + state.settings.sessionSize + '"></label>',
      '    <label class="topic-check"><input type="checkbox" id="include-notdue"> Include not-yet-due cards</label>',
      '    <div class="topic-list">' + topicChecks + '</div>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function sessionView() {
    var i = session.index, card = session.queue[i];
    var progress = Math.round(i / session.queue.length * 100);
    var total = session.queue.length;

    if (!card) {
      // Summary
      var ests = session.results.filter(function (r) { return r.estimatePct != null; });
      var avgEst = ests.length ? Math.round(ests.reduce(function (a, r) { return a + r.estimatePct; }, 0) / ests.length) : null;
      var recRate = session.results.length ? Math.round(session.results.filter(function (r) { return r.recalled; }).length / session.results.length * 100) : 0;
      var gap = avgEst != null ? avgEst - recRate : null;
      var nudge = '';
      if (gap != null && gap >= 12) nudge = '<p class="nudge">Your confidence outran your recall by ' + gap + ' points. This session: estimate lower — a 70 you keep at 70 is worth more than a 95 you keep at 70.</p>';
      else if (gap != null && gap <= -12) nudge = '<p class="nudge good">Underselling yourself: you recalled more than you predicted. Raise your estimates.</p>';
      var rows = session.results.map(function (r) {
        var c = state.cards[r.cardId];
        var next = c.intervalDays === 0 ? 'relearn now' : 'in ' + c.intervalDays + 'd';
        return '<tr><td>' + esc(c.topic) + '</td><td>' + esc(c.front.slice(0, 60)) + '</td><td>' + (r.estimatePct != null ? r.estimatePct + '%' : '—') + '</td><td>' + (r.recalled ? 'yes' : 'no') + '</td><td>' + next + '</td></tr>';
      }).join('');
      return [
        '<div class="card hero">',
        '  <h2>Session complete</h2>',
        '  <p class="big-stat">' + session.results.length + '<span class="stat-unit"> cards</span> · recall ' + recRate + '%</p>',
        '  ' + nudge,
        '  <table class="table"><thead><tr><th>Topic</th><th>Card</th><th>Estimate</th><th>Recalled</th><th>Next</th></tr></thead><tbody>' + rows + '</tbody></table>',
        '  <button class="btn primary" id="finish-session">Back to today</button>',
        '</div>'
      ].join('');
    }

    var shown = session.shown;
    var confHtml = !shown
      ? '<div class="conf"><label for="conf">Confidence you can recall this: <output id="conf-out">' + session.confidence + '%</output></label>' +
        '<input type="range" id="conf" min="0" max="100" step="5" value="' + session.confidence + '"></div>'
      : '';

    return [
      '<div class="card hero">',
      '  <div class="prog"><div class="prog-fill" style="width:' + progress + '%"></div></div>',
      '  <p class="muted center">' + (i + 1) + ' of ' + total + ' · ' + esc(card.topic) + (session.interleave ? ' · interleaved' : ' · blocked') + '</p>',
      '  <div class="flash">' +
        '    <h3 class="front">' + esc(card.front) + '</h3>' +
        (shown ? '<div class="back"><p>' + esc(card.back) + '</p>' + (card.summary ? '<p class="muted small">Your summary: ' + esc(card.summary) + '</p>' : '') + '</div>' : '') +
      '  </div>',
      '  ' + confHtml,
      '  <div class="session-actions">',
        !shown
          ? '<button class="btn primary" id="reveal">Reveal</button>'
          : '<div class="grades">' +
            '  <button class="btn grade g0" data-grade="0">Failed</button>' +
            '  <button class="btn grade g1" data-grade="1">Hard</button>' +
            '  <button class="btn grade g2" data-grade="2">Good</button>' +
            '  <button class="btn grade g3" data-grade="3">Easy</button>' +
            '</div>' +
            '<input type="text" id="feynman" class="feynman" placeholder="Feynman check (optional): explain it in one plain sentence">',
      '  </div>',
      '</div>'
    ].join('');
  }

  /* ---- Reread: re-exposure that always ends in retrieval ---- */

  var reread = null; // {topic, index, read, recalled}

  function viewReread() {
    var ts = topics();
    var options = ts.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');
    if (reread) {
      var card = allCards().filter(function (c) { return (c.topic || 'General') === reread.topic; })[reread.index];
      if (card) {
        if (!reread.read) {
          return [
            '<div class="card hero">',
            '  <p class="muted">Rereading · ' + esc(reread.topic) + ' · card ' + (reread.index + 1) + ' of ' + allCards().filter(function (c) { return (c.topic || 'General') === reread.topic; }).length + '</p>',
            '  <div class="reread-text"><h3>' + esc(card.front) + '</h3><p>' + esc(card.back) + '</p></div>',
            '  <p class="hint">Read it once — do not loop. The reading is the setup; the recall is the work.</p>',
            '  <div class="session-actions"><button class="btn" id="rr-cancel">Cancel</button><button class="btn primary" id="rr-close">Close it — I recall from memory</button></div>',
            '</div>'
          ].join('');
        }
        if (!reread.attempted) {
          return [
            '<div class="card hero">',
            '  <p class="muted">Retrieval · ' + esc(reread.topic) + '</p>',
            '  <div class="flash"><h3 class="front">' + esc(card.front) + '</h3></div>',
            '  <textarea id="rr-recall" rows="3" class="rr-recall" placeholder="Write or speak the answer from memory…"></textarea>',
            '  <div class="session-actions"><button class="btn" id="rr-cancel">Cancel</button><button class="btn primary" id="rr-check">Check against the card</button></div>',
            '</div>'
          ].join('');
        }
        return [
          '<div class="card hero">',
          '  <p class="muted">Compare: what you said vs the card (' + esc(reread.topic) + ')</p>',
          '  <div class="reread-text"><h3>' + esc(card.front) + '</h3><p><strong>You said:</strong> ' + esc(reread.attempt) + '</p><p><strong>Card says:</strong> ' + esc(card.back) + '</p></div>',
          '  <div class="session-actions">' +
          '    <button class="btn grade g0" id="rr-miss">Mostly missed</button>' +
          '  <button class="btn grade g3" id="rr-hit">Recalled it</button>' +
          '  </div>',
          '</div>'
        ].join('');
      }
      reread = null;
    }
    return [
      '<div class="card hero">',
      '  <h2>Reread, then retrieve</h2>',
      '  <p class="hint">Rereading alone is the weakest way to study — it feels fluent and fixes nothing. This mode pairs it with retrieval: read the explanation once, then recall it from memory and check. The recall is what the schedule counts.</p>',
      '  <label>Pick a topic <select id="rr-topic">' + options + '</select></label>',
      '  <div class="session-actions"><button class="btn primary" id="rr-start">Start rereading</button></div>',
      '</div>'
    ].join('');
  }

  /* ---- Library ---- */

  var editingId = null;

  function viewLibrary() {
    var cards = allCards().sort(function (a, b) { return (a.topic || '') < (b.topic || '') ? -1 : 1; });
    var rows = cards.map(function (c) {
      var next = c.lastReview ? 'in ' + c.intervalDays + 'd' : (E.isDue(c, new Date()) ? 'due' : '—');
      var sum = c.summary ? '<span class="ok">✓ ' + E.countWords(c.summary) + 'w</span>' : '<span class="muted">—</span>';
      return '<tr><td>' + esc(c.topic) + '</td><td class="q">' + esc(c.front) + '</td><td>' + next + '</td><td>' + sum + '</td>' +
        '<td class="row-actions"><button class="btn small" data-edit="' + c.id + '">Edit</button><button class="btn small danger" data-del="' + c.id + '">Delete</button></td></tr>';
    }).join('') || '<tr><td colspan="5" class="muted">No cards yet.</td></tr>';

    var editing = editingId ? state.cards[editingId] : null;
    var form = [
      '<div class="card form-card">',
      '  <h2>' + (editing ? 'Edit card' : 'Add a card') + '</h2>',
      '  <div class="form-grid">',
      '    <label>Topic <input id="f-topic" value="' + esc(editing ? editing.topic : '') + '" placeholder="e.g. Physics"></label>',
      '    <label>Question / prompt <textarea id="f-front" rows="2" placeholder="What should you be able to answer?">' + esc(editing ? editing.front : '') + '</textarea></label>',
      '    <label>Explanation (the material to reread) <textarea id="f-back" rows="3" placeholder="Write it in your own words.">' + esc(editing ? editing.back : '') + '</textarea></label>',
      '    <label>Your one-line summary <input id="f-summary" value="' + esc(editing ? editing.summary : '') + '" placeholder="The one idea, in your words."></label>',
      '  </div>',
      '  <div class="session-actions">' +
      '    <button class="btn primary" id="f-save">' + (editing ? 'Save changes' : 'Add card') + '</button>' +
      (editing ? '  <button class="btn" id="f-cancel">Cancel</button>' : '') +
      '  </div>',
      '</div>'
    ].join('');

    var covered = cards.filter(function (c) { return c.summary && E.countWords(c.summary) >= 8; }).length;
    var pct = cards.length ? Math.round(covered / cards.length * 100) : 0;

    return [
      form,
      '<div class="card">',
      '  <div class="card-head"><h2>Library</h2><span class="muted">' + pct + '% summarised</span></div>',
      '  <table class="table"><thead><tr><th>Topic</th><th>Question</th><th>Next</th><th>Summary</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>',
      '  <div class="session-actions">' +
      '    <button class="btn" id="export">Export JSON</button>' +
      '    <label class="btn as-file">Import JSON<input type="file" id="import" accept=".json,application/json" hidden></label>',
      '  </div>',
      '</div>'
    ].join('');
  }

  /* ---- Insights ---- */

  function viewInsights() {
    var cal = E.calibration(state.reviews);
    var act = E.reviewsPerDay(state.reviews, 14);
    var s = E.streak(state.reviews);
    var today = reviewsToday().length;
    var goal = state.settings.dailyGoal;
    var cards = allCards();
    var summarized = cards.filter(function (c) { return c.summary && E.countWords(c.summary) >= 8; }).length;
    var interleaveReviews = state.reviews.filter(function (r) { return r.mode === 'reread'; }).length;

    var biasText = '—';
    if (cal.n >= 5) {
      var b = Math.round(cal.bias * 100);
      biasText = Math.abs(b) <= 10 ? 'Well calibrated (' + (b > 0 ? '+' : '') + b + ' pts)' : (b > 0 ? 'Overconfident by about ' + b + ' pts' : 'Underconfident by about ' + Math.abs(b) + ' pts');
      if (b > 15) biasText += ' — the gap between "I think I know it" and "I can produce it" is where forgetting hides.';
    } else if (cal.n > 0) {
      biasText = 'needs ~' + (5 - cal.n) + ' more estimated reviews to say anything';
    }

    var tips = [
      ['Retrieval practice', 'Every card flip is a recall attempt. The testing effect: successfully retrieving a memory makes it stronger than the same amount of re-exposure ever will.'],
      ['Spaced practice', 'Intervals grow only when a card is recalled. Failed cards reset to today; hard cards grow slower. You are spacing, not cramming.'],
      ['Rereading', 'Used here only as a setup step: read once, then recall. Standalone rereading is fluency, not memory — that is why this mode ends in retrieval.'],
      ['Summarization', 'Cards gain a "summary" field: the one idea in your own words. Aim for 8+ words, and rewrite summaries that you copied rather than compressed.'],
      ['Interleaving', 'Toggle it in Study. Mixed sessions feel harder and test better — blocking is for first exposure, interleaving is for discrimination and strategy.'],
      ['Metacognition', 'The confidence slider before every reveal feeds the calibration chart below. Track whether you over- or under-estimate; the bias line tells you which.']
    ];
    var tipRows = tips.map(function (t) { return '<tr><td class="tip-k">' + t[0] + '</td><td>' + t[1] + '</td></tr>'; }).join('');

    return [
      '<div class="card hero">',
      '  <div class="stats-row">',
      '    <div class="stat"><span class="stat-num">' + s + '</span><span class="stat-label">day streak</span></div>',
      '    <div class="stat"><span class="stat-num">' + today + '/' + goal + '</span><span class="stat-label">today vs goal</span></div>',
      '    <div class="stat"><span class="stat-num">' + (cards.length ? Math.round(summarized / cards.length * 100) + '%' : '—') + '</span><span class="stat-label">cards summarised</span></div>',
      '    <div class="stat"><span class="stat-num">' + interleaveReviews + '</span><span class="stat-label">reread→retrieve</span></div>',
      '  </div>',
      '</div>',
      '<div class="two-col">',
      '  <div class="card"><h2>Activity · 14 days</h2>' + C.activityChart(act) + '</div>',
      '  <div class="card"><h2>Calibration</h2>' + C.calibrationChart(cal.bins) +
        '<p class="muted">n=' + cal.n + ' estimated reviews · Brier ' + (cal.brier != null ? cal.brier.toFixed(3) : '—') + ' · ' + biasText + '</p></div>',
      '</div>',
      '<div class="card"><h2>The six levers, applied</h2><table class="table"><tbody>' + tipRows + '</tbody></table></div>'
    ].join('');
  }

  /* ---------------- wiring ---------------- */

  function wire(route) {
    if (route === 'study') {
      var interleaveToggle = document.getElementById('interleave-toggle');
      if (interleaveToggle) interleaveToggle.addEventListener('change', function () {
        state.settings.interleave = interleaveToggle.checked; persist(); render();
      });
      var size = document.getElementById('session-size');
      if (size) size.addEventListener('change', function () {
        state.settings.sessionSize = Math.max(1, Math.min(60, parseInt(size.value, 10) || 10)); persist();
      });
      var start = document.getElementById('start-session');
      if (start) start.addEventListener('click', startSession);
      var finish = document.getElementById('finish-session');
      if (finish) finish.addEventListener('click', function () { session = null; persist(); render(); });
      var reveal = document.getElementById('reveal');
      if (reveal) reveal.addEventListener('click', function () {
        var conf = document.getElementById('conf');
        session.confidence = conf ? parseInt(conf.value, 10) : 0;
        session.shown = true; render();
      });
      var conf = document.getElementById('conf');
      if (conf) conf.addEventListener('input', function () {
        var out = document.getElementById('conf-out');
        if (out) out.textContent = conf.value + '%';
        session.confidence = parseInt(conf.value, 10);
      });
      var grades = document.querySelectorAll('.grade[data-grade]');
      Array.prototype.forEach.call(grades, function (b) {
        b.addEventListener('click', function () { gradeCard(parseInt(b.dataset.grade, 10)); });
      });
    } else if (route === 'reread') {
      var cancel = document.getElementById('rr-cancel');
      if (cancel) cancel.addEventListener('click', function () { reread = null; render(); });
      var close = document.getElementById('rr-close');
      if (close) close.addEventListener('click', function () { reread.read = true; render(); });
      var check = document.getElementById('rr-check');
      if (check) check.addEventListener('click', function () {
        var ta = document.getElementById('rr-recall');
        reread.attempt = ta ? ta.value.trim() : '';
        reread.attempted = true; render();
      });
      var hit = document.getElementById('rr-hit');
      if (hit) hit.addEventListener('click', function () { finishReread(3); });
      var miss = document.getElementById('rr-miss');
      if (miss) miss.addEventListener('click', function () { finishReread(0); });
      var rst = document.getElementById('rr-start');
      if (rst) rst.addEventListener('click', function () {
        var sel = document.getElementById('rr-topic');
        reread = { topic: sel ? sel.value : topics()[0], index: 0, read: false, attempted: false, attempt: '' };
        render();
      });
    } else if (route === 'library') {
      var save = document.getElementById('f-save');
      if (save) save.addEventListener('click', saveCard);
      var cancelE = document.getElementById('f-cancel');
      if (cancelE) cancelE.addEventListener('click', function () { editingId = null; render(); });
      var exp = document.getElementById('export');
      if (exp) exp.addEventListener('click', exportData);
      var imp = document.getElementById('import');
      if (imp) imp.addEventListener('change', importData);
      var edits = document.querySelectorAll('[data-edit]');
      Array.prototype.forEach.call(edits, function (b) {
        b.addEventListener('click', function () { editingId = b.dataset.edit; render(); window.scrollTo(0, 0); });
      });
      var dels = document.querySelectorAll('[data-del]');
      Array.prototype.forEach.call(dels, function (b) {
        b.addEventListener('click', function () {
          if (confirm('Delete this card and its review history?')) {
            S.deleteCard(state, b.dataset.del); persist(); render();
          }
        });
      });
    }
  }

  function startSession() {
    var interleave = !!state.settings.interleave;
    var includeNotDue = !!document.getElementById('include-notdue').checked;
    var picks = Array.prototype.map.call(document.querySelectorAll('.topic-pick:checked'), function (c) { return c.value; });
    var queue = E.buildQueue(allCards(), {
      interleave: interleave,
      includeNotDue: includeNotDue,
      topics: picks.length ? picks : null
    });
    queue = queue.slice(0, state.settings.sessionSize);
    if (!queue.length) { alert('Nothing to study with those filters.'); return; }
    session = {
      queue: queue, index: 0, shown: false, confidence: 50,
      interleave: interleave, results: []
    };
    render();
  }

  function gradeCard(grade) {
    var card = session.queue[session.index];
    var feynman = document.getElementById('feynman');
    S.recordReview(state, {
      cardId: card.id,
      mode: 'study',
      grade: grade,
      estimatePct: session.confidence,
      feynman: feynman ? feynman.value.trim() : ''
    });
    session.results.push({
      cardId: card.id,
      estimatePct: session.confidence,
      recalled: grade > 0
    });
    session.index++;
    session.shown = false;
    session.confidence = 50;
    persist();
    render();
  }

  function finishReread(grade) {
    var cards = allCards().filter(function (c) { return (c.topic || 'General') === reread.topic; });
    var card = cards[reread.index];
    var estimate = null;
    S.recordReview(state, {
      cardId: card.id, mode: 'reread', grade: grade,
      estimatePct: estimate,
      feynman: grade === 0 ? reread.attempt : ''
    });
    reread.index++;
    if (reread.index >= cards.length) reread = null;
    else { reread.read = false; reread.attempted = false; reread.attempt = ''; }
    persist();
    render();
  }

  function saveCard() {
    var get = function (id) { return document.getElementById(id).value; };
    try {
      var card = S.upsertCard(state, {
        id: editingId || undefined,
        topic: get('f-topic'),
        front: get('f-front'),
        back: get('f-back'),
        summary: get('f-summary')
      });
      editingId = null;
      persist();
      render();
      if (!document.getElementById('f-front').value) { /* keep scroll for next add */ }
    } catch (e) {
      alert(e.message);
    }
  }

  function exportData() {
    var blob = new Blob([S.exportJSON(state)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cognilab-export-' + E.dayKey(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function importData(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var s = S.importJSON(reader.result);
        if (confirm('Replace current data with the import?')) {
          state = s; persist(); render();
        }
      } catch (e) { alert('Import failed: ' + e.message); }
    };
    reader.readAsText(file);
  }

  window.addEventListener('hashchange', render);
  render();
})();

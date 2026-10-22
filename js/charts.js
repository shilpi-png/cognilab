/* CogniLab — charts.js
 * Tiny dependency-free SVG charts. Pure functions: data in, SVG string out.
 */
(function (global) {
  'use strict';

  function svgOpen(w, h) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" style="max-width:' + w + 'px">';
  }

  /**
   * Calibration chart.
   * bins: [{from,to,n,avgEstimate,avgRecall}] (values 0..1 or null)
   * Returns an SVG string: diagonal = perfect calibration,
   * dots = actual (avgEstimate -> avgRecall) per filled bin.
   */
  function calibrationChart(bins) {
    var W = 420, H = 260, M = 36;
    var pw = W - M * 2, ph = H - M * 2;
    var x = function (v) { return M + v * pw; };
    var y = function (v) { return H - M - v * ph; };
    var s = svgOpen(W, H);
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fbf9f4"/>';
    // grid
    for (var g = 0; g <= 100; g += 25) {
      s += '<line x1="' + x(g / 100) + '" y1="' + y(0) + '" x2="' + x(g / 100) + '" y2="' + y(1) + '" stroke="#e8e2d6" stroke-width="1"/>';
      s += '<line x1="' + x(0) + '" y1="' + y(g / 100) + '" x2="' + x(1) + '" y2="' + y(g / 100) + '" stroke="#e8e2d6" stroke-width="1"/>';
    }
    // axes labels
    [0, 25, 50, 75, 100].forEach(function (v) {
      s += '<text x="' + x(v / 100) + '" y="' + (H - M + 16) + '" font-size="10" text-anchor="middle" fill="#8a8375">' + v + '</text>';
      s += '<text x="' + (M - 6) + '" y="' + (y(v / 100) + 3) + '" font-size="10" text-anchor="end" fill="#8a8375">' + v + '</text>';
    });
    s += '<text x="' + (W / 2) + '" y="' + (H - 4) + '" font-size="11" text-anchor="middle" fill="#6b6455">predicted confidence</text>';
    s += '<text x="12" y="' + (H / 2) + '" font-size="11" text-anchor="middle" fill="#6b6455" transform="rotate(-90 12 ' + (H / 2) + ')">actual recall</text>';
    // diagonal
    s += '<line x1="' + x(0) + '" y1="' + y(0) + '" x2="' + x(1) + '" y2="' + y(1) + '" stroke="#c9a227" stroke-width="1.5" stroke-dasharray="5,4"/>';
    s += '<text x="' + (x(0.55)) + '" y="' + (y(0.55) - 8) + '" font-size="10" fill="#c9a227">perfect</text>';
    // dots + connector
    var pts = [];
    (bins || []).forEach(function (b) {
      if (b.n && b.avgEstimate != null && b.avgRecall != null) {
        pts.push([x(b.avgEstimate), y(b.avgRecall), b.n]);
      }
    });
    if (pts.length > 1) {
      s += '<polyline points="' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="#4a7c59" stroke-width="2" opacity="0.55"/>';
    }
    pts.forEach(function (p) {
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + Math.min(9, 4 + p[2] / 4) + '" fill="#4a7c59" stroke="#fbf9f4" stroke-width="1.5"/>';
    });
    if (!pts.length) {
      s += '<text x="' + (W / 2) + '" y="' + (H / 2 - 8) + '" font-size="12" text-anchor="middle" fill="#8a8375">Not enough estimated reviews yet.</text>';
      s += '<text x="' + (W / 2) + '" y="' + (H / 2 + 10) + '" font-size="11" text-anchor="middle" fill="#8a8375">Set a confidence estimate before revealing each card.</text>';
    }
    s += '</svg>';
    return s;
  }

  /**
   * Activity bars.
   * days: [{day:"YYYY-MM-DD", count:n}]
   */
  function activityChart(days) {
    var W = 420, H = 150, M = 30, B = 22;
    var n = days.length, bw = (W - M * 2) / n;
    var max = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.count; })));
    var s = svgOpen(W, H);
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fbf9f4"/>';
    days.forEach(function (d, i) {
      var h = (d.count / max) * (H - M - B);
      var y = H - B - h;
      var x = M + i * bw + bw * 0.15;
      s += '<rect x="' + x + '" y="' + (d.count ? y : H - B - 1) + '" width="' + (bw * 0.7) + '" height="' + (d.count ? h : 1) + '" rx="2" fill="' + (d.count ? '#4a7c59' : '#e8e2d6') + '"/>';
      if (d.count) s += '<text x="' + (x + bw * 0.35) + '" y="' + (y - 4) + '" font-size="9" text-anchor="middle" fill="#6b6455">' + d.count + '</text>';
      if (i % 2 === 0) s += '<text x="' + (x + bw * 0.35) + '" y="' + (H - 6) + '" font-size="8" text-anchor="middle" fill="#8a8375">' + d.day.slice(5) + '</text>';
    });
    s += '</svg>';
    return s;
  }

  var API = { calibrationChart: calibrationChart, activityChart: activityChart };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.CogniLab = global.CogniLab || {};
  global.CogniLab.Charts = API;
})(typeof window !== 'undefined' ? window : this);

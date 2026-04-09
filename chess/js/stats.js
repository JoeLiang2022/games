// Chinese Chess Stats — localStorage
var Stats = (function() {
  'use strict';
  var KEY = 'chessStats';
  var data = null;

  function load() {
    try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e) { data = {}; }
    if (!data.games) data.games = [];
    if (!data.byDiff) data.byDiff = {};
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e) {}
  }

  function record(difficulty, result, moves) {
    load();
    var entry = { date: new Date().toISOString(), diff: difficulty, result: result, moves: moves };
    data.games.push(entry);
    if (data.games.length > 100) data.games = data.games.slice(-100);
    // By difficulty
    var key = 'd' + difficulty;
    if (!data.byDiff[key]) data.byDiff[key] = { win:0, lose:0, draw:0 };
    data.byDiff[key][result]++;
    save();
  }

  function getSummary() {
    load();
    var total = { win:0, lose:0, draw:0, games:0 };
    var byDiff = {};
    var diffNames = { '1':'入門', '2':'初級', '3':'中級', '4':'高級' };
    for (var k in data.byDiff) {
      var d = data.byDiff[k];
      var num = k.replace('d','');
      byDiff[num] = { name: diffNames[num]||num, win:d.win||0, lose:d.lose||0, draw:d.draw||0 };
      total.win += d.win||0; total.lose += d.lose||0; total.draw += d.draw||0;
    }
    total.games = total.win + total.lose + total.draw;
    total.winRate = total.games > 0 ? Math.round(total.win / total.games * 100) : 0;
    return { total: total, byDiff: byDiff };
  }

  function clear() { data = { games:[], byDiff:{} }; save(); }

  load();
  return { record:record, getSummary:getSummary, clear:clear };
})();

/**
 * history.js — 五子棋對戰紀錄 (localStorage)
 */
var History = (function() {
  var KEY = 'gomoku_history';
  var MAX = 50;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch(e) { return []; }
  }

  function save(records) {
    try { localStorage.setItem(KEY, JSON.stringify(records.slice(0, MAX))); }
    catch(e) {}
  }

  function add(record) {
    var records = load();
    records.unshift(record);
    save(records);
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  function diffLabel(diff) {
    var map = { '30k':'30級', '20k':'20級', '10k':'10級', '5k':'5級', '1k':'1級', '1d':'初段', '3d':'三段' };
    return map[diff] || diff;
  }

  function record(winner) {
    var isPlayer = (Game.mode === 'single' && winner === Game.playerColor);
    var result = winner === 0 ? 'draw' : (isPlayer ? 'win' : 'lose');
    // Save full moves array for replay
    var movesData = [];
    var gm = Game.moves;
    for (var i = 0; i < gm.length; i++) {
      movesData.push({ x: gm[i].x, y: gm[i].y, color: gm[i].color });
    }
    add({
      date: new Date().toISOString(),
      difficulty: Game.difficulty,
      playerColor: Game.playerColor === 1 ? 'black' : 'white',
      result: result,
      moves: Game.moves.length,
      winner: winner === 0 ? 'draw' : (winner === 1 ? 'black' : 'white'),
      movesData: movesData,
      blackTime: Game.blackTime || 0,
      whiteTime: Game.whiteTime || 0
    });
  }

  function getStats() {
    var records = load();
    var total = records.length, wins = 0, losses = 0, draws = 0;
    var byDiff = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.result === 'win') wins++;
      else if (r.result === 'lose') losses++;
      else draws++;
      if (!byDiff[r.difficulty]) byDiff[r.difficulty] = { w: 0, l: 0, d: 0 };
      if (r.result === 'win') byDiff[r.difficulty].w++;
      else if (r.result === 'lose') byDiff[r.difficulty].l++;
      else byDiff[r.difficulty].d++;
    }
    return { total: total, wins: wins, losses: losses, draws: draws, byDiff: byDiff };
  }

  return { load: load, record: record, clear: clear, diffLabel: diffLabel, getStats: getStats };
})();

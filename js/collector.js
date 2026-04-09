/**
 * collector.js — GameCollector 前端資料收集器
 * 觀戰模式每局結束時擷取牌局資料，8局結束後上傳至伺服器
 */
var GameCollector = (function() {
  var SERVER_URL = 'https://mahjong-server-oc2m.onrender.com';
  var _rounds = [];
  var _sessionStart = 0;

  function startSession() {
    _rounds = [];
    _sessionStart = Date.now();
    console.log('[Collector] Session started');
  }

  function collectRound(game, roundIndex) {
    var analysis = null;
    if (typeof MahjongAnalysis !== 'undefined') {
      var allAnalysis = [];
      for (var seat = 0; seat < 4; seat++) {
        try { allAnalysis.push(MahjongAnalysis.analyze(game, seat)); }
        catch (e) { allAnalysis.push(null); }
      }
      analysis = allAnalysis;
    }

    var roundData = {
      roundIndex: roundIndex,
      timestamp: Date.now(),
      dealer: game.dealer,
      roundWind: game.roundWind,
      roundNumber: game.roundNumber,
      winnerSeat: game.winnerSeat != null ? game.winnerSeat : -1,
      winType: game.winType || null,
      lastDiscardSeat: game.lastDiscardSeat,
      scores: game.scores.slice(),
      gameLog: _serializeGameLog(game.gameLog || []),
      players: _serializePlayers(game.players),
      analysis: analysis
    };
    _rounds.push(roundData);
    console.log('[Collector] Round', roundIndex, 'collected');
    return roundData;
  }

  function submitSession() {
    if (_rounds.length === 0) {
      console.warn('[Collector] No rounds to submit');
      return Promise.resolve(null);
    }
    var sessionData = {
      startTime: _sessionStart,
      endTime: Date.now(),
      totalRounds: _rounds.length,
      rounds: _rounds,
      finalScores: _rounds[_rounds.length - 1].scores
    };

    return _upload(sessionData).then(function(result) {
      console.log('[Collector] Session uploaded:', result.sessionId);
      _rounds = [];
      return result;
    }).catch(function(err) {
      console.error('[Collector] Upload failed:', err);
      return null;
    });
  }

  function _serializeGameLog(gameLog) {
    return gameLog.map(function(entry) {
      var e = { action: entry.action, seat: entry.seat, turn: entry.turn };
      if (entry.tile) e.tile = _tileName(entry.tile);
      if (entry.action === 'discard') {
        if (entry.handSnapshot) e.handSnapshot = entry.handSnapshot.map(_tileName);
        if (entry.melds) e.melds = entry.melds;
        if (entry.remainingCount != null) e.remainingCount = entry.remainingCount;
      }
      if (entry.action === 'win') {
        e.winType = entry.winType;
        e.hand = entry.hand ? entry.hand.map(_tileName) : [];
        if (entry.melds) e.melds = entry.melds;
      }
      if (entry.action === 'pong' || entry.action === 'chow') {
        e.from = entry.from;
      }
      if (entry.action === 'pass') {
        e.availableActions = entry.availableActions;
      }
      return e;
    });
  }

  function _serializePlayers(players) {
    return players.map(function(p) {
      return {
        name: p.name,
        seat: p.seat,
        finalHand: p.hand ? p.hand.map(_tileName) : [],
        melds: p.melds ? p.melds.map(function(m) {
          return { type: m.type, tiles: m.tiles ? m.tiles.map(_tileName) : [] };
        }) : [],
        discards: p.discards ? p.discards.map(_tileName) : [],
        flowers: p.flowers ? p.flowers.map(_tileName) : []
      };
    });
  }

  function _tileName(tile) {
    if (typeof tile === 'string') return tile;
    return tile.name || (tile.suit + tile.value);
  }

  function _upload(sessionData) {
    return fetch(SERVER_URL + '/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData)
    }).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  return {
    startSession: startSession,
    collectRound: collectRound,
    submitSession: submitSession
  };
})();

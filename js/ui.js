/**
 * ui.js — UI 渲染與互動
 * 明星三缺一風格：牌牆 + 四家牌河 + 手牌 + 角色頭像
 */

const WIND_NAMES = { east: '東', south: '南', west: '西', north: '北' };

// 明星三缺一風格角色系統 — v43 高品質 Emoji 頭像
// 使用大型 emoji 組合取代手繪 SVG，在所有裝置上都清晰好看
const CHARACTERS = [
  { name: '你', color: '#fbbf24', bg: 'linear-gradient(135deg,#b45309,#78350f)',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><text x="50" y="68" font-size="62" text-anchor="middle">😎</text></svg>',
    taunts: ['哼，看我的！','這把穩了','你們太嫩了'] },
  { name: '小美', color: '#f472b6', bg: 'linear-gradient(135deg,#9d174d,#701a75)',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><text x="50" y="68" font-size="62" text-anchor="middle">👩</text></svg>',
    taunts: ['討厭啦～','人家要胡了','你好壞喔'] },
  { name: '老王', color: '#60a5fa', bg: 'linear-gradient(135deg,#1e3a5f,#1e40af)',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><text x="50" y="68" font-size="62" text-anchor="middle">👴</text></svg>',
    taunts: ['年輕人不懂','老夫看穿了','慢慢來，急什麼'] },
  { name: '阿弟', color: '#4ade80', bg: 'linear-gradient(135deg,#14532d,#166534)',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><text x="50" y="68" font-size="62" text-anchor="middle">😆</text></svg>',
    taunts: ['衝啊！','嘿嘿嘿','我要贏了啦'] }
];

// 角色對話氣泡系統
var _speechTimers = {};
function showSpeechBubble(seat, text, duration) {
  duration = duration || 2500;
  var humanSeat = (typeof game !== 'undefined' && game._mySeat) || 0;
  var relSeat = (seat - humanSeat + 4) % 4;
  var positions = ['south', 'east', 'north', 'west'];
  var container = document.getElementById('player-' + positions[relSeat]);
  if (!container) return;
  // Remove existing bubble
  var old = container.querySelector('.speech-bubble');
  if (old) old.remove();
  if (_speechTimers[seat]) clearTimeout(_speechTimers[seat]);
  var bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.textContent = text;
  container.appendChild(bubble);
  requestAnimationFrame(function() { bubble.classList.add('show'); });
  _speechTimers[seat] = setTimeout(function() {
    bubble.classList.remove('show');
    setTimeout(function() { if (bubble.parentNode) bubble.remove(); }, 300);
  }, duration);
}

let selectedTileId = null;
let game = null;
let lastPhase = 'idle';
let lastDiscardCounts = [0,0,0,0];
let lastFlowerCounts = [0,0,0,0];
let lastHandCount = 0;
let lastMeldCounts = [0,0,0,0];
let _aiWatchTimer = null; // AI 觀戰自動下一局的 timer
let _endScreenRendered = false; // 防止 renderEndScreen 重複設定 timer
let _liveDangerData = null; // 即時對手聽牌分析資料
let _liveDiscardData = null; // 即時出牌建議（含放槍風險）
let _dangerPanelVisible = false;
let _riskIndicatorOn = true; // 手牌風險指標開關

function initUI(gameInstance) {
  game = gameInstance;
  game.onUpdate = renderGame;
}

function createTileEl(tile, extraClass) {
  var el = document.createElement('div');
  el.className = 'tile ' + (extraClass || '');
  el.innerHTML = createTileHTML(tile);
  el.title = tile.name;
  el.dataset.tileId = tile.id;
  return el;
}

function makeFlowerRow(flowers) {
  if (!flowers.length) return null;
  var div = document.createElement('div');
  div.className = 'flower-area';
  flowers.forEach(function(tile) {
    div.appendChild(createTileEl(tile, 'flower-tile'));
  });
  return div;
}

function makeMeldRow(melds) {
  if (!melds.length) return null;
  var div = document.createElement('div');
  div.className = 'meld-area';
  melds.forEach(function(meld) {
    var meldDiv = document.createElement('div');
    meldDiv.className = 'meld-group meld-' + meld.type;
    meld.tiles.forEach(function(tile, idx) {
      if (meld.kongType === 'an' && (idx === 1 || idx === 2)) {
        var backEl = document.createElement('div');
        backEl.className = 'tile meld-tile back';
        meldDiv.appendChild(backEl);
      } else {
        meldDiv.appendChild(createTileEl(tile, 'meld-tile'));
      }
    });
    div.appendChild(meldDiv);
  });
  return div;
}

// ===== TTS 語音唸牌 =====
var ttsEnabled = true;
// 每個座位不同的語音參數（pitch, rate）讓電腦ABC聽起來不同
var VOICE_PROFILES = [
  { pitch: 1.0, rate: 0.9 },   // 座位0: 玩家（你）
  { pitch: 1.3, rate: 0.85 },  // 座位1: 電腦A（高音，稍慢）
  { pitch: 0.7, rate: 0.95 },  // 座位2: 電腦B（低音）
  { pitch: 1.1, rate: 0.8 }    // 座位3: 電腦C（中高音，最慢）
];
function speakTile(tileName, seatIndex) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  var profile = VOICE_PROFILES[seatIndex] || VOICE_PROFILES[0];
  var utter = new SpeechSynthesisUtterance(tileName);
  utter.lang = 'zh-TW';
  utter.rate = profile.rate;
  utter.pitch = profile.pitch;
  utter.volume = 0.8;
  var voices = window.speechSynthesis.getVoices();
  for (var i = 0; i < voices.length; i++) {
    if (voices[i].lang.indexOf('zh') >= 0) {
      utter.voice = voices[i];
      break;
    }
  }
  window.speechSynthesis.speak(utter);
}


function detectSounds(g) {
  var V = (typeof MahjongVoice !== 'undefined') ? MahjongVoice : null;
  var SPEECH = {
    pong: ['碰！','碰你的！','碰～'],
    kong: ['槓！','大槓！','槓起來！'],
    chow: ['吃！','吃了～','謝啦'],
    win: ['胡了！','我贏啦！','哈哈胡！'],
    zimo: ['自摸！','自摸啦！','摸到了！'],
    lose: ['啊…放槍了','不會吧…','嗚嗚'],
    start: ['開打！','來吧！','準備好了'],
    flower: ['花！','補花～','又一朵']
  };
  function charSpeech(seat, event) {
    var ch = CHARACTERS[seat] || CHARACTERS[0];
    var lines = SPEECH[event];
    if (!lines) return;
    var text = lines[Math.floor(Math.random() * lines.length)];
    showSpeechBubble(seat, text, 2000);
  }
  if (lastPhase === 'dealing' && g.phase === 'playing') {
    SFX.play('start');
    if (V) { var ds = g.dealer; setTimeout(function(){ V.play('start', ds); }, 300); }
    charSpeech(g.dealer, 'start');
  }
  if (lastPhase === 'playing' && g.phase === 'ended') {
    if (g.winnerSeat >= 0) {
      var wt = g.winType === 'zimo' ? 'zimo' : 'win';
      SFX.play('win');
      if (typeof VFX !== 'undefined') VFX.showAction(wt, g.winnerSeat);
      charSpeech(g.winnerSeat, wt);
      if (V) {
        var ws = g.winnerSeat, wtp = wt;
        setTimeout(function(){ V.play(wtp, ws); }, 500);
        if (wtp === 'win' && g.lastDiscardSeat >= 0 && g.lastDiscardSeat !== ws) {
          var ls = g.lastDiscardSeat;
          setTimeout(function(){ V.play('lose', ls); charSpeech(ls, 'lose'); }, 1500);
        }
      }
    } else {
      SFX.play('end');
      if (V) { var rd = Math.floor(Math.random() * 4); setTimeout(function(){ V.play('draw', rd); }, 500); }
    }
  }
  for (var i = 0; i < 4; i++) {
    var dc = g.players[i].discards.length;
    if (dc > lastDiscardCounts[i]) {
      SFX.play('discard');
      var lastTile = g.players[i].discards[g.players[i].discards.length - 1];
      if (lastTile) speakTile(lastTile.name, i);
    }
    lastDiscardCounts[i] = dc;
  }
  // Detect meld changes (pong/kong/chow) + speech bubbles
  for (var i = 0; i < 4; i++) {
    var mc = g.players[i].melds.length;
    if (mc > lastMeldCounts[i]) {
      var newMeld = g.players[i].melds[mc - 1];
      if (newMeld) {
        var mtype = newMeld.type;
        if (mtype === 'pong') { SFX.play('pong'); if (typeof VFX !== 'undefined') VFX.showAction('pong', i); if (V) V.play('pong', i); charSpeech(i, 'pong'); }
        else if (mtype === 'kong') { SFX.play('kong'); if (typeof VFX !== 'undefined') VFX.showAction(newMeld.kongType === 'an' ? 'ankong' : 'kong', i); if (V) V.play('kong', i); charSpeech(i, 'kong'); }
        else if (mtype === 'chow') { SFX.play('chow'); if (typeof VFX !== 'undefined') VFX.showAction('chow', i); if (V) V.play('chow', i); charSpeech(i, 'chow'); }
      }
    }
    lastMeldCounts[i] = mc;
  }
  for (var i = 0; i < 4; i++) {
    var fc = g.players[i].flowers.length;
    if (fc > lastFlowerCounts[i]) {
      SFX.play('flower');
      if (typeof VFX !== 'undefined') VFX.showAction('flower', i);
      if (V) V.play('flower', i);
      charSpeech(i, 'flower');
    }
    lastFlowerCounts[i] = fc;
  }
  var hc = g.players[g._mySeat || 0].hand.length;
  if (hc > lastHandCount && g.phase === 'playing') SFX.play('draw');
  lastHandCount = hc;
  lastPhase = g.phase;

  // Random taunt from AI (low probability per turn change)
  if (typeof VFX !== 'undefined' && g.phase === 'playing') {
    VFX.updateTurnIndicator(g.currentTurn);
    // ~8% chance an AI taunts on their turn
    if (g.currentTurn !== (g._mySeat || 0) && Math.random() < 0.08) {
      var ch = CHARACTERS[g.currentTurn];
      if (ch && ch.taunts) {
        var t = ch.taunts[Math.floor(Math.random() * ch.taunts.length)];
        showSpeechBubble(g.currentTurn, t, 2000);
        if (V) V.play('taunt', g.currentTurn);
      }
    }
  }
}

// ===== 主渲染 =====

function renderGame(g) {
  var humanSeat = g._mySeat || 0;
  detectSounds(g);

  // Center info
  var centerInfo = document.getElementById('center-info');
  var windChar = WIND_NAMES[g.roundWind] || '東';
  var humanWind = WIND_NAMES[getSeatWind(g, humanSeat)] || '東';
  var dealerMark = g.consecutiveWins > 0 ? ' 拉' + g.consecutiveWins : '';
  centerInfo.innerHTML =
    '<div class="wind-circle">' + windChar + '風' + humanWind + '</div>' +
    '<div class="round-detail">第' + g.roundNumber + '局' + dealerMark + '</div>' +
    '<div class="remaining">剩餘 ' + g.getRemainingTiles() + ' 張</div>';
  // AI 觀戰剩餘局數
  if (g._isAIWatch && typeof g._watchRoundsLeft === 'number') {
    centerInfo.innerHTML += '<div class="watch-rounds">🤖 剩餘 ' + g._watchRoundsLeft + ' 局</div>';
  }

  // 牌牆
  renderWall(g);

  // 四家（手牌在外場，面子在內場）
  var aiWatch = g._isAIWatch;
  if (aiWatch) {
    // AI 觀戰：全部用對手渲染（含亮牌）
    renderOpponent(g, 'south', humanSeat, true);
    renderOpponent(g, 'north', (humanSeat + 2) % 4, true);
    renderOpponent(g, 'west', (humanSeat + 3) % 4, true);
    renderOpponent(g, 'east', (humanSeat + 1) % 4, true);
  } else {
    renderHumanPlayer(g, humanSeat);
    renderOpponent(g, 'north', (humanSeat + 2) % 4);
    renderOpponent(g, 'west', (humanSeat + 3) % 4);
    renderOpponent(g, 'east', (humanSeat + 1) % 4);
  }

  // 四家牌河（在 #field 內）
  renderDiscards(g, 'discard-south', humanSeat);
  renderDiscards(g, 'discard-north', (humanSeat + 2) % 4);
  renderDiscards(g, 'discard-west', (humanSeat + 3) % 4);
  renderDiscards(g, 'discard-east', (humanSeat + 1) % 4);

  // 四家面子（在 #field 內，靠近各自牌河）
  renderMelds(g, 'melds-south', humanSeat);
  renderMelds(g, 'melds-north', (humanSeat + 2) % 4);
  renderMelds(g, 'melds-west', (humanSeat + 3) % 4);
  renderMelds(g, 'melds-east', (humanSeat + 1) % 4);

  renderActionButtons(g);

  // 即時對手聽牌分析 + 出牌建議
  if (g.phase === 'playing' && typeof MahjongAnalysis !== 'undefined' && !g._isAIWatch) {
    _liveDangerData = MahjongAnalysis.liveOpponentDanger(g, humanSeat);
    _liveDiscardData = MahjongAnalysis.liveDiscardAdvice(g, humanSeat);
    renderDangerPanel(g);
  } else {
    _liveDangerData = null;
    _liveDiscardData = null;
    var dp = document.getElementById('danger-panel');
    if (dp) dp.style.display = 'none';
  }

  var overlay = document.getElementById('result-overlay');
  if (g.phase === 'ended' || g.phase === 'game_over') {
    renderEndScreen(g);
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
  }
}

// ===== 牌牆渲染 =====

function renderWall(g) {
  // wallSegments[seat] = { draw: N, dead: N }
  // seat 0=南(玩家), 1=東(右), 2=北(對面), 3=西(左)
  var seatToWall = { south: 0, east: 1, north: 2, west: 3 };
  var sides = ['wall-south','wall-north','wall-west','wall-east'];
  var wallKeys = ['south','north','west','east'];

  // 找出哪面牆有下一張要抓的牌（取牌區 draw > 0 的第一面）
  var nextDrawWall = -1;
  // 取牌順序：breakWall 左邊 → 逆時針
  var drawOrder = [
    g.breakWall,
    (g.breakWall + 3) % 4,
    (g.breakWall + 2) % 4,
    (g.breakWall + 1) % 4
  ];
  for (var d = 0; d < 4; d++) {
    var ws = g.wallSegments ? g.wallSegments[drawOrder[d]] : null;
    if (ws && typeof ws === 'object' && ws.draw > 0) {
      nextDrawWall = drawOrder[d];
      break;
    }
  }
  // 找出哪面牆有下一張要補的牌（牌底區 dead > 0 的第一面）
  var nextDeadWall = -1;
  var deadOrder = [
    g.breakWall,
    (g.breakWall + 1) % 4,
    (g.breakWall + 2) % 4,
    (g.breakWall + 3) % 4
  ];
  for (var d = 0; d < 4; d++) {
    var ws = g.wallSegments ? g.wallSegments[deadOrder[d]] : null;
    if (ws && typeof ws === 'object' && ws.dead > 0) {
      nextDeadWall = deadOrder[d];
      break;
    }
  }

  for (var s = 0; s < 4; s++) {
    var el = document.getElementById(sides[s]);
    if (!el) continue;
    var wallIdx = seatToWall[wallKeys[s]];
    var seg = g.wallSegments ? g.wallSegments[wallIdx] : null;
    var drawCount = 0, deadCount = 0;
    if (seg && typeof seg === 'object') {
      drawCount = seg.draw || 0;
      deadCount = seg.dead || 0;
    } else if (typeof seg === 'number') {
      drawCount = seg;
    }
    var html = '';

    // ←抓 label（只在有取牌區的牆顯示）
    if (drawCount > 0) {
      html += '<span class="wall-label wall-label-draw">\u2190\u6293</span>';
    }

    // 取牌區（藍色）
    for (var i = 0; i < drawCount; i++) {
      var cls = 'wall-stack wall-draw';
      // 第一個 stack = 下一張要抓的（只在這面牆是 nextDrawWall 時標記）
      if (i === 0 && wallIdx === nextDrawWall) cls += ' wall-next-draw';
      html += '<div class="' + cls + '">' +
        '<div class="wall-tile wall-upper"></div>' +
        '<div class="wall-tile wall-lower"></div></div>';
    }

    // 牌底區（紅色）
    for (var i = 0; i < deadCount; i++) {
      var cls = 'wall-stack wall-dead';
      // 最後一個 stack = 下一張要補的（只在這面牆是 nextDeadWall 時標記）
      if (i === deadCount - 1 && wallIdx === nextDeadWall) cls += ' wall-next-dead';
      html += '<div class="' + cls + '">' +
        '<div class="wall-tile wall-upper"></div>' +
        '<div class="wall-tile wall-lower"></div></div>';
    }

    // 補→ label（只在有牌底區的牆顯示）
    if (deadCount > 0) {
      html += '<span class="wall-label wall-label-dead">\u88DC\u2192</span>';
    }

    el.innerHTML = html;
  }
}

// ===== 玩家（下方） =====

function renderHumanPlayer(g, seat) {
  var player = g.players[seat];
  var container = document.getElementById('player-south');
  var seatWind = getSeatWind(g, seat);
  var isDealer = g.dealer === seat;
  var ch = CHARACTERS[seat] || CHARACTERS[0];

  var infoRow = container.querySelector('.info-row');
  infoRow.innerHTML = '';

  // Character avatar (SVG manga style)
  var avatarWrap = document.createElement('span');
  avatarWrap.className = 'char-avatar char-avatar-sm';
  avatarWrap.style.background = ch.bg;
  avatarWrap.style.borderColor = ch.color;
  avatarWrap.innerHTML = ch.svg || '<span class="char-emoji">' + (ch.emoji||'🀄') + '</span>';
  infoRow.appendChild(avatarWrap);

  var label = document.createElement('span');
  label.className = 'player-label' + (isDealer ? ' is-dealer' : '');
  var wbc = isDealer ? 'wind-badge is-dealer' : 'wind-badge';
  label.innerHTML = player.name + ' <span class="' + wbc + '">' + WIND_NAMES[seatWind] + '</span>' + (isDealer ? ' 莊' : '');
  infoRow.appendChild(label);

  // 花牌顯示在 info-row（手牌旁邊）
  var flowerRow = makeFlowerRow(player.flowers);
  if (flowerRow) infoRow.appendChild(flowerRow);

  var handArea = container.querySelector('.hand-area');
  handArea.innerHTML = '';
  var mySeat = g._mySeat || 0;
  var isMyTurn = g.currentTurn === seat && seat === mySeat && g.phase === 'playing';

  // Build danger lookup from _liveDiscardData: idx -> {danger, isBest}
  var dangerMap = {};
  if (_liveDiscardData && _liveDiscardData.length > 0) {
    var bestIdx = _liveDiscardData[0].idx;
    for (var di = 0; di < _liveDiscardData.length; di++) {
      var d = _liveDiscardData[di];
      dangerMap[d.idx] = { danger: d.danger, totalScore: d.totalScore, isBest: d.idx === bestIdx };
    }
  }

  player.hand.forEach(function(tile) {
    var el = createTileEl(tile, 'hand-tile');
    if (g.lastDrawnTile && tile.id === g.lastDrawnTile.id) el.classList.add('just-drawn');
    if (tile.id === selectedTileId) el.classList.add('selected');
    if (isMyTurn) el.addEventListener('click', function() { onTileClick(tile); });

    // Danger indicator dot + best discard star
    if (_riskIndicatorOn && _liveDiscardData && typeof MahjongAnalysis !== 'undefined') {
      var tIdx = MahjongAnalysis._tileToIndex(tile);
      var info = dangerMap[tIdx];
      if (info) {
        var dot = document.createElement('span');
        dot.className = 'tile-danger-dot';
        if (info.danger >= 60) { dot.classList.add('hot'); dot.textContent = info.danger; }
        else if (info.danger >= 30) { dot.classList.add('warn'); dot.textContent = info.danger; }
        else { dot.classList.add('safe'); dot.textContent = info.danger; }
        el.appendChild(dot);
        if (info.isBest) {
          el.classList.add('best-discard');
        }
      }
    }

    handArea.appendChild(el);
  });
}

// ===== 對手渲染（只有名牌+手牌，面子移到 #field 內） =====

function renderOpponent(g, position, seat, showHand) {
  var player = g.players[seat];
  var container = document.getElementById('player-' + position);
  var seatWind = getSeatWind(g, seat);
  var isDealer = g.dealer === seat;
  var ch = CHARACTERS[seat] || CHARACTERS[0];

  container.innerHTML = '';

  // Character avatar (SVG manga style) + label
  var avatarWrap = document.createElement('div');
  avatarWrap.className = 'char-avatar';
  avatarWrap.style.background = ch.bg;
  avatarWrap.style.borderColor = ch.color;
  avatarWrap.innerHTML = ch.svg || '<span class="char-emoji">' + (ch.emoji||'🀄') + '</span>';
  container.appendChild(avatarWrap);

  var label = document.createElement('div');
  label.className = 'player-label' + (isDealer ? ' is-dealer' : '');
  var wbc = isDealer ? 'wind-badge is-dealer' : 'wind-badge';
  var displayName = player.name || ch.name;
  label.innerHTML = displayName + ' <span class="' + wbc + '">' + WIND_NAMES[seatWind] + '</span>' + (isDealer ? ' 莊' : '');
  container.appendChild(label);

  // 即時聽牌危險度標籤
  if (g.phase === 'playing' && !showHand && _liveDangerData) {
    var dangerInfo = null;
    for (var di = 0; di < _liveDangerData.length; di++) {
      if (_liveDangerData[di].seat === seat) { dangerInfo = _liveDangerData[di]; break; }
    }
    if (dangerInfo && dangerInfo.dangerLevel >= 5) {
      var badge = document.createElement('div');
      badge.className = 'danger-badge';
      badge.style.background = dangerInfo.dangerColor;
      badge.textContent = dangerInfo.dangerLevel >= 8 ? '⚠聽' : '🟡注意';
      badge.onclick = function() { toggleDangerPanel(); };
      container.appendChild(badge);
    }
  }

  // 花牌小小顯示在名牌旁
  var flowerRow = makeFlowerRow(player.flowers);
  if (flowerRow) container.appendChild(flowerRow);

  var handDiv = document.createElement('div');
  handDiv.className = 'opponent-hand';
  for (var i = 0; i < player.hand.length; i++) {
    if (showHand) {
      var t = createTileEl(player.hand[i]);
      t.className += ' opp-tile';
      handDiv.appendChild(t);
    } else {
      var t = document.createElement('div');
      t.className = 'tile back';
      handDiv.appendChild(t);
    }
  }
  container.appendChild(handDiv);
}

// ===== 面子渲染（在 #field 內，靠近各自的牌河） =====

function renderMelds(g, elementId, seat) {
  var el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = '';
  var player = g.players[seat];
  if (!player.melds.length) return;
  var meldRow = makeMeldRow(player.melds);
  if (meldRow) {
    // 把 meld-area 的子元素搬進來
    while (meldRow.firstChild) {
      el.appendChild(meldRow.firstChild);
    }
  }
}

// ===== 牌河渲染 =====

function renderDiscards(g, elementId, seat) {
    var el = document.getElementById(elementId);
    el.innerHTML = '';
    var discards = g.players[seat].discards;
    // 每排6張，用 div.discard-row 包起來
    var row = null;
    discards.forEach(function(tile, idx) {
      if (idx % 6 === 0) {
        row = document.createElement('div');
        row.className = 'discard-row';
        row.style.display = 'flex';
        row.style.gap = '1px';
        row.style.flexShrink = '0';
        el.appendChild(row);
      }
      var cls = 'discard-tile';
      if (g.lastDiscardedTile && g.lastDiscardSeat === seat && idx === discards.length - 1) {
        cls += ' last-discard';
      }
      row.appendChild(createTileEl(tile, cls));
    });
  }

function getSeatWind(g, seat) {
  var winds = ['east', 'south', 'west', 'north'];
  var offset = (seat - g.dealer + 4) % 4;
  return winds[offset];
}

// ===== Phase 2: 動作按鈕 =====

function renderActionButtons(g) {
  var container = document.getElementById('action-bar');
  container.innerHTML = '';
  container.classList.remove('show');

  if (g.phase !== 'waiting_action') return;

  var humanActions = g.pendingActions.filter(function(a) { return g.players[a.seat].isHuman; });
  if (humanActions.length === 0) return;

  container.classList.add('show');

  // 動作提示
  var isSelfAction = humanActions.every(function(a) {
    return a.type === 'zimo' || a.type === 'ankong' || a.type === 'addkong';
  });
  var hintDiv = document.createElement('div');
  hintDiv.className = 'action-hint';
  if (isSelfAction) {
    hintDiv.textContent = '你的回合';
  } else if (g.lastDiscardedTile && g.lastDiscardSeat >= 0) {
    var fromPlayer = g.players[g.lastDiscardSeat];
    hintDiv.appendChild(createTileEl(g.lastDiscardedTile));
    var textSpan = document.createElement('span');
    textSpan.textContent = fromPlayer.name + ' 打出';
    hintDiv.appendChild(textSpan);
  }
  container.appendChild(hintDiv);

  // 搶槓胡
  var robKongAction = humanActions.find(function(a) { return a.type === 'robkong'; });
  if (robKongAction) {
    var rbtn = document.createElement('button');
    rbtn.className = 'action-btn action-win';
    rbtn.textContent = '搶槓胡';
    rbtn.addEventListener('click', function() {
      SFX.play('start');
      var mySeat = game._mySeat || 0;
      if (game._isMultiplayer && !game._isHost && typeof MahjongNet !== 'undefined') {
        MahjongNet.sendAction({ action: 'robkong', seat: mySeat });
      } else {
        game.doRobKong(mySeat);
        if (game._isMultiplayer && typeof MahjongNet !== 'undefined') {
          MahjongNet.sendAction({ action: 'robkong', seat: mySeat });
        }
      }
    });
    container.appendChild(rbtn);
  }

  // 胡
  var winAction = humanActions.find(function(a) { return a.type === 'win' || a.type === 'zimo'; });
  if (winAction) {
    var btn = document.createElement('button');
    btn.className = 'action-btn action-win';
    btn.textContent = winAction.type === 'zimo' ? '自摸' : '胡';
    btn.addEventListener('click', function() {
      SFX.play('start');
      var mySeat = game._mySeat || 0;
      if (game._isMultiplayer && !game._isHost && typeof MahjongNet !== 'undefined') {
        MahjongNet.sendAction({ action: 'win', seat: mySeat, winType: winAction.type === 'zimo' ? 'zimo' : 'fangpao' });
      } else {
        if (winAction.type === 'zimo') game.doWin(mySeat, 'zimo');
        else game.doWin(mySeat, 'fangpao');
        if (game._isMultiplayer && typeof MahjongNet !== 'undefined') {
          MahjongNet.sendAction({ action: 'win', seat: mySeat, winType: winAction.type === 'zimo' ? 'zimo' : 'fangpao' });
        }
      }
    });
    container.appendChild(btn);
  }

  // 槓
  var kongActions = humanActions.filter(function(a) {
    return a.type === 'mingkong' || a.type === 'ankong' || a.type === 'addkong';
  });
  kongActions.forEach(function(action) {
    var btn = document.createElement('button');
    btn.className = 'action-btn action-kong';
    if (action.type === 'ankong') btn.textContent = '暗槓 ' + action.tiles[0].name;
    else if (action.type === 'addkong') btn.textContent = '加槓 ' + action.tile.name;
    else btn.textContent = '槓';
    btn.addEventListener('click', function() {
      var mySeat = game._mySeat || 0;
      if (game._isMultiplayer && !game._isHost && typeof MahjongNet !== 'undefined') {
        var kdata = { action: action.type, seat: mySeat };
        if (action.type === 'ankong') kdata.tileIds = action.tiles.map(function(t){return t.id;});
        if (action.type === 'addkong') { kdata.meldIdx = game.players[mySeat].melds.indexOf(action.meld); kdata.tileId = action.tile.id; }
        MahjongNet.sendAction(kdata);
      } else {
        if (action.type === 'mingkong') game.doMingKong(mySeat);
        else if (action.type === 'ankong') game.doAnKong(mySeat, action.tiles);
        else if (action.type === 'addkong') game.doAddKong(mySeat, action.meld, action.tile);
        if (game._isMultiplayer && typeof MahjongNet !== 'undefined') {
          var kdata = { action: action.type, seat: mySeat };
          if (action.type === 'ankong') kdata.tileIds = action.tiles.map(function(t){return t.id;});
          if (action.type === 'addkong') { kdata.meldIdx = game.players[mySeat].melds.indexOf(action.meld); kdata.tileId = action.tile.id; }
          MahjongNet.sendAction(kdata);
        }
      }
    });
    container.appendChild(btn);
  });

  // 碰
  var pongAction = humanActions.find(function(a) { return a.type === 'pong'; });
  if (pongAction) {
    var btn = document.createElement('button');
    btn.className = 'action-btn action-pong';
    btn.textContent = '碰';
    btn.addEventListener('click', function() {
      var mySeat = game._mySeat || 0;
      SFX.play('discard');
      if (game._isMultiplayer && !game._isHost && typeof MahjongNet !== 'undefined') {
        MahjongNet.sendAction({ action: 'pong', seat: mySeat });
      } else {
        game.doPong(mySeat);
        if (game._isMultiplayer && typeof MahjongNet !== 'undefined') {
          MahjongNet.sendAction({ action: 'pong', seat: mySeat });
        }
      }
    });
    container.appendChild(btn);
  }

  // 吃
  var chowAction = humanActions.find(function(a) { return a.type === 'chow'; });
  if (chowAction) {
    chowAction.combos.forEach(function(combo) {
      var btn = document.createElement('button');
      btn.className = 'action-btn action-chow';
      var tile = g.lastDiscardedTile;
      var names = combo.map(function(v) { return TILE_NAMES[tile.suit][v - 1]; });
      btn.textContent = '吃 ' + names.join('');
      btn.addEventListener('click', function() {
        var mySeat = game._mySeat || 0;
        SFX.play('discard');
        if (game._isMultiplayer && !game._isHost && typeof MahjongNet !== 'undefined') {
          MahjongNet.sendAction({ action: 'chow', seat: mySeat, combo: combo });
        } else {
          game.doChow(mySeat, combo);
          if (game._isMultiplayer && typeof MahjongNet !== 'undefined') {
            MahjongNet.sendAction({ action: 'chow', seat: mySeat, combo: combo });
          }
        }
      });
      container.appendChild(btn);
    });
  }

  // 過
  var passBtn = document.createElement('button');
  passBtn.className = 'action-btn action-pass';
  passBtn.textContent = '過';
  passBtn.addEventListener('click', function() {
    var mySeat = game._mySeat || 0;
    if (game._isMultiplayer && !game._isHost && typeof MahjongNet !== 'undefined') {
      MahjongNet.sendAction({ action: 'pass', seat: mySeat });
    } else {
      game.doPass(mySeat);
      if (game._isMultiplayer && typeof MahjongNet !== 'undefined') {
        MahjongNet.sendAction({ action: 'pass', seat: mySeat });
      }
    }
  });
  container.appendChild(passBtn);
}

// ===== 即時對手聽牌分析面板 =====

function renderDangerPanel(g) {
  var panel = document.getElementById('danger-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'danger-panel';
    document.getElementById('game-table').appendChild(panel);
  }

  if (!_liveDangerData || _liveDangerData.length === 0) {
    panel.style.display = 'none';
    return;
  }

  // 檢查是否有任何危險對手
  var hasDanger = false;
  for (var i = 0; i < _liveDangerData.length; i++) {
    if (_liveDangerData[i].dangerLevel >= 5) { hasDanger = true; break; }
  }

  if (!hasDanger) {
    panel.style.display = 'none';
    return;
  }

  // 始終顯示摘要按鈕
  var html = '<div class="danger-summary" onclick="toggleDangerPanel()">';
  html += '<span class="danger-icon">🔍</span>';
  var dangerNames = [];
  for (var j = 0; j < _liveDangerData.length; j++) {
    var d = _liveDangerData[j];
    if (d.dangerLevel >= 8) dangerNames.push('⚠️' + d.name);
    else if (d.dangerLevel >= 5) dangerNames.push('🟡' + d.name);
  }
  html += '<span class="danger-text">' + dangerNames.join(' ') + '</span>';
  html += '<span class="danger-arrow">' + (_dangerPanelVisible ? '▼' : '▲') + '</span>';
  html += '</div>';

  if (_dangerPanelVisible) {
    html += '<div class="danger-detail">';
    for (var k = 0; k < _liveDangerData.length; k++) {
      var info = _liveDangerData[k];
      if (info.dangerLevel < 5) continue;
      var ch = CHARACTERS[info.seat] || CHARACTERS[0];
      html += '<div class="danger-card" style="border-left:3px solid ' + info.dangerColor + '">';
      html += '<div class="danger-card-header">';
      html += '<span style="color:' + ch.color + '">' + info.name + '</span>';
      html += '<span class="danger-level-tag" style="background:' + info.dangerColor + '">' + info.dangerLabel + '</span>';
      html += '</div>';
      // 牌型推測
      if (info.patterns.length > 0) {
        html += '<div class="danger-row">🎯 ' + info.patterns.join('、') + '</div>';
      }
      // 提示
      if (info.tips.length > 0) {
        html += '<div class="danger-row tip">💡 ' + info.tips.join(' / ') + '</div>';
      }
      // 可能聽的牌
      if (info.likelyWaits.length > 0) {
        html += '<div class="danger-row">👀 可能聽：';
        for (var wi = 0; wi < info.likelyWaits.length; wi++) {
          html += '<span class="dtile hot">' + info.likelyWaits[wi] + '</span>';
        }
        html += '</div>';
      }
      // 危險牌
      if (info.dangerTiles.length > 0) {
        html += '<div class="danger-row">🚨 危險：';
        for (var dti = 0; dti < info.dangerTiles.length; dti++) {
          html += '<span class="dtile warn">' + info.dangerTiles[dti] + '</span>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  panel.innerHTML = html;
  panel.style.display = 'block';
}

function toggleDangerPanel() {
  _dangerPanelVisible = !_dangerPanelVisible;
  if (_liveDangerData && game) renderDangerPanel(game);
}

// ===== 結算畫面 =====

function renderEndScreen(g) {
  var overlay = document.getElementById('result-overlay');
  // 清除之前的 AI 觀戰 timer
  if (_aiWatchTimer) { clearTimeout(_aiWatchTimer); _aiWatchTimer = null; }
  if (g.phase === 'game_over') {
    // 一將結束 — 顯示最終排名
    var sorted = g.players.map(function(p,i){ return {name:p.name, score:g.scores[i], seat:i}; });
    sorted.sort(function(a,b){ return b.score - a.score; });
    var rankHtml = '<div class="final-ranking">';
    var medals = ['🥇','🥈','🥉',''];
    for (var r = 0; r < 4; r++) {
      var s = sorted[r];
      var scClass = s.score > 0 ? 'score-pos' : s.score < 0 ? 'score-neg' : '';
      var scSign = s.score > 0 ? '+' : '';
      rankHtml += '<div class="rank-row"><span class="rank-medal">' + medals[r] + '</span><span class="rank-name">' + s.name + '</span><span class="rank-score ' + scClass + '">' + scSign + s.score + '</span></div>';
    }
    rankHtml += '</div>';
    var goButtons = '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;justify-content:center">';
    if (typeof MahjongAnalysis !== 'undefined' && g.gameLog && g.gameLog.length > 0) {
      goButtons += '<button onclick="showAnalysis()">📊 牌局分析</button>';
    }
    if (game._isMultiplayer) {
      goButtons += '<button onclick="backToChatroom()">🏠 回到聊天室</button>';
    } else {
      goButtons += '<button onclick="location.reload()">重新開始</button>';
    }
    goButtons += '</div>';
    overlay.innerHTML = '<h2>🀄 一將結束</h2>' + rankHtml + goButtons;
    return;
  }
  // 結算分數
  var settlement = g._lastSettlement || (g.settleRound ? g.settleRound() : null);

  if (g.winnerSeat >= 0) {
    var winner = g.players[g.winnerSeat];
    var typeText = g.winType === 'zimo' ? '自摸' : '胡牌';
    var scoreHTML = '';
    if (typeof MahjongScoring !== 'undefined') {
      var result = settlement || MahjongScoring.calculate(winner, g, g.winType);
      scoreHTML = '<div class="score-detail">';
      for (var i = 0; i < result.fans.length; i++) {
        var f = result.fans[i];
        scoreHTML += '<div class="score-line"><span class="fan-name">' + f.name + '</span><span class="fan-val">' + f.fan + ' 台</span></div>';
      }
      if (result.lianZhuangTai > 0) {
        scoreHTML += '<div class="score-line"><span class="fan-name">連莊</span><span class="fan-val">' + result.lianZhuangTai + ' 台</span></div>';
      }
      scoreHTML += '</div>';
      if (result.winAmount) {
        var totalTai = result.totalTaiWithBonus || result.totalFan;
        scoreHTML += '<div class="score-total">共 ' + totalTai + ' 台';
        if (g.winType === 'zimo') {
          scoreHTML += '（每家付 ' + result.winAmount + '）';
        } else {
          scoreHTML += '（' + g.players[g.lastDiscardSeat].name + ' 付 ' + (result.winAmount * 3) + '）';
        }
        scoreHTML += '</div>';
      } else {
        scoreHTML += '<div class="score-total">共 ' + result.totalFan + ' 台</div>';
      }
    }
    var fangpaoHTML = '';
    if (g.winType === 'fangpao' && g.lastDiscardSeat >= 0) {
      fangpaoHTML = '<p style="color:#ff6b6b;font-size:14px;margin-top:4px">' + g.players[g.lastDiscardSeat].name + ' 放槍</p>';
    }
    var dealerInfo = '';
    if (g.winnerSeat === g.dealer) {
      dealerInfo = '<p style="color:#ffd700;font-size:13px;margin-top:2px">莊家連莊 (拉' + (g.consecutiveWins + 1) + ')</p>';
    } else {
      dealerInfo = '<p style="color:#aaa;font-size:13px;margin-top:2px">過莊 → ' + g.players[(g.dealer + 1) % 4].name + ' 做莊</p>';
    }
    // 目前分數
    var standingHtml = renderStandings(g);
    overlay.innerHTML =
      '<h2>🀄 ' + winner.name + ' ' + typeText + '！</h2>' + fangpaoHTML + dealerInfo +
      '<div class="win-hand">' + renderWinHand(winner) + '</div>' +
      scoreHTML + standingHtml +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;justify-content:center">' +
      '<button onclick="showAnalysis()">📊 牌局分析</button>' +
      '<button onclick="nextRound()">下一局</button>' +
      (game._isMultiplayer ? '<button class="btn-quit" onclick="backToChatroom()">🏠 回到聊天室</button>' : '<button class="btn-quit" onclick="quitGame()">退出</button>') + '</div>';
    // AI 觀戰自動下一局（有限次數）
    if (game._isAIWatch) {
      if (typeof GameCollector !== 'undefined') {
        var roundIdx = (game._totalWatchRounds || 8) - (game._watchRoundsLeft || 0);
        GameCollector.collectRound(game, roundIdx);
      }
      if (typeof game._watchRoundsLeft === 'number') game._watchRoundsLeft--;
      if (game._watchRoundsLeft <= 0) {
        if (typeof GameCollector !== 'undefined') GameCollector.submitSession();
        game.phase = 'game_over';
        _aiWatchTimer = setTimeout(function(){ _aiWatchTimer = null; renderEndScreen(game); document.getElementById('result-overlay').classList.add('show'); }, 3000);
      } else {
        _aiWatchTimer = setTimeout(function(){ _aiWatchTimer = null; nextRound(); }, 3000);
      }
    }
  } else {
    var standingHtml2 = renderStandings(g);
    overlay.innerHTML =
      '<h2>🀄 流局</h2><p style="color:#aaa">牌牆已摸完（莊家連莊）</p>' +
      standingHtml2 +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;justify-content:center">' +
      '<button onclick="showAnalysis()">📊 牌局分析</button>' +
      '<button onclick="nextRound()">下一局</button>' +
      (game._isMultiplayer ? '<button class="btn-quit" onclick="backToChatroom()">🏠 回到聊天室</button>' : '<button class="btn-quit" onclick="quitGame()">退出</button>') + '</div>';
    // AI 觀戰自動下一局（有限次數）
    if (game._isAIWatch) {
      if (typeof GameCollector !== 'undefined') {
        var roundIdx2 = (game._totalWatchRounds || 8) - (game._watchRoundsLeft || 0);
        GameCollector.collectRound(game, roundIdx2);
      }
      if (typeof game._watchRoundsLeft === 'number') game._watchRoundsLeft--;
      if (game._watchRoundsLeft <= 0) {
        if (typeof GameCollector !== 'undefined') GameCollector.submitSession();
        game.phase = 'game_over';
        _aiWatchTimer = setTimeout(function(){ _aiWatchTimer = null; renderEndScreen(game); document.getElementById('result-overlay').classList.add('show'); }, 3000);
      } else {
        _aiWatchTimer = setTimeout(function(){ _aiWatchTimer = null; nextRound(); }, 3000);
      }
    }
  }
}

function renderStandings(g) {
  var html = '<div class="round-standings">';
  for (var i = 0; i < 4; i++) {
    var sc = g.scores[i];
    var ch = CHARACTERS[i] || CHARACTERS[0];
    var scClass = sc > 0 ? 'score-pos' : sc < 0 ? 'score-neg' : '';
    var scSign = sc > 0 ? '+' : '';
    html += '<span class="standing-item ' + scClass + '"><span class="standing-avatar" style="background:' + ch.bg + ';border-color:' + ch.color + '">' + ch.svg + '</span> ' + g.players[i].name + ' ' + scSign + sc + '</span>';
  }
  html += '</div>';
  return html;
}

function renderWinHand(player) {
  var html = '<div class="win-melds">';
  player.melds.forEach(function(meld) {
    html += '<div class="win-meld-group">';
    meld.tiles.forEach(function(tile) {
      html += '<div class="tile meld-tile">' + createTileHTML(tile) + '</div>';
    });
    html += '</div>';
  });
  html += '</div><div class="win-tiles">';
  player.hand.forEach(function(tile) {
    html += '<div class="tile meld-tile">' + createTileHTML(tile) + '</div>';
  });
  html += '</div>';
  if (player.flowers.length > 0) {
    html += '<div class="win-flowers">';
    player.flowers.forEach(function(tile) {
      html += '<div class="tile flower-tile">' + createTileHTML(tile) + '</div>';
    });
    html += '</div>';
  }
  return html;
}

// ===== 牌局分析顯示 =====

function renderMiniHand(handSnapshot, meldsSnapshot, discardName, suggestName) {
  var html = '<div class="advice-hand">';
  // Melds first
  if (meldsSnapshot && meldsSnapshot.length > 0) {
    for (var mi = 0; mi < meldsSnapshot.length; mi++) {
      var meld = meldsSnapshot[mi];
      html += '<span class="advice-meld">';
      for (var ti = 0; ti < meld.tiles.length; ti++) {
        html += '<span class="mini-tile mini-meld">' + (meld.tiles[ti].name || '?') + '</span>';
      }
      html += '</span>';
    }
    html += '<span class="advice-meld-sep">|</span>';
  }
  // Hand tiles
  for (var i = 0; i < handSnapshot.length; i++) {
    var t = handSnapshot[i];
    var tName = t.name || '?';
    var cls = 'mini-tile';
    if (tName === discardName) cls += ' mini-discard';
    else if (suggestName && tName === suggestName) cls += ' mini-suggest';
    html += '<span class="' + cls + '">' + tName + '</span>';
  }
  html += '</div>';
  return html;
}

function showAnalysis() {
  if (typeof MahjongAnalysis === 'undefined') return;
  // 暫停 AI 觀戰的自動下一局 timer
  if (_aiWatchTimer) { clearTimeout(_aiWatchTimer); _aiWatchTimer = null; }
  var mySeat = game._mySeat || 0;
  var result = MahjongAnalysis.analyze(game, mySeat);
  var overlay = document.getElementById('result-overlay');

  var gradeColors = { S: '#fbbf24', A: '#22c55e', B: '#3b82f6', C: '#f97316', D: '#ef4444' };
  var gradeColor = gradeColors[result.grade] || '#fff';
  var levelColors = { good: '#22c55e', ok: '#3b82f6', bad: '#f97316', mistake: '#ef4444' };

  var html = '<div class="analysis-overlay">';
  html += '<h2>📊 AI 牌局分析</h2>';
  html += '<div class="analysis-grade" style="color:' + gradeColor + '">' + result.grade + '</div>';
  html += '<div class="analysis-score">綜合評分 ' + result.score + ' / 100</div>';
  html += '<div class="analysis-result">' + result.resultSummary + '</div>';

  // 決策統計
  var ov = result.overall;
  html += '<div class="analysis-section">';
  html += '<div class="analysis-section-title">📈 決策統計</div>';
  html += '<div class="analysis-stats">';
  html += '<span style="color:#22c55e">好棋 ' + ov.goodMoves + '</span>';
  html += '<span style="color:#3b82f6">可以 ' + ov.okMoves + '</span>';
  html += '<span style="color:#f97316">不好 ' + ov.badMoves + '</span>';
  html += '<span style="color:#ef4444">失誤 ' + ov.mistakes + '</span>';
  html += '</div></div>';

  // 關鍵失誤（如果有的話）
  if (result.keyMistakes.length > 0) {
    html += '<div class="analysis-section">';
    html += '<div class="analysis-section-title">⚠️ 關鍵失誤</div>';
    for (var i = 0; i < result.keyMistakes.length; i++) {
      var m = result.keyMistakes[i];
      html += '<div class="advice-item advice-' + m.level + '">';
      html += '<div class="advice-header">';
      html += '<span class="advice-turn">第' + m.turn + '巡</span>';
      html += '<span class="advice-verdict">' + m.verdict + '</span>';
      html += '</div>';
      html += '<div class="advice-detail">打了 <span class="advice-tile">' + m.tileName + '</span>';
      if (m.suggestion) {
        html += '，建議打 <span class="advice-suggest">' + m.suggestion + '</span>';
      }
      html += '</div>';
      if (m.handSnapshot) {
        html += renderMiniHand(m.handSnapshot, m.meldsSnapshot, m.tileName, m.suggestion);
      }
      if (m.reason) {
        html += '<div class="advice-reason">💡 ' + m.reason + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // 完整時間軸
  html += '<div class="analysis-section">';
  html += '<div class="analysis-section-title">🕐 逐巡分析 <span class="advice-toggle" onclick="toggleTimeline()">(展開)</span></div>';
  html += '<div id="advice-timeline" class="advice-timeline collapsed">';
  for (var j = 0; j < result.advice.length; j++) {
    var a = result.advice[j];
    var lc = levelColors[a.level] || '#fff';
    html += '<div class="advice-item advice-' + a.level + '">';
    html += '<div class="advice-header">';
    html += '<span class="advice-turn">第' + a.turn + '巡</span>';
    html += '<span class="advice-verdict" style="color:' + lc + '">' + a.verdict + '</span>';
    html += '</div>';
    if (a.isPass) {
      html += '<div class="advice-detail">放棄了 <span class="advice-tile">' + a.tileName + '</span>';
      if (a.suggestion) html += '，' + a.suggestion;
      html += '</div>';
    } else {
      html += '<div class="advice-detail">打了 <span class="advice-tile">' + a.tileName + '</span>';
      if (a.suggestion) {
        html += '，建議打 <span class="advice-suggest">' + a.suggestion + '</span>';
      }
      html += '</div>';
      html += '<div class="advice-meta">' + (a.shanten || '') + ' · 進張 ' + (a.acceptance || 0) + ' 張';
      if (a.bestAcceptance && a.bestAcceptance > a.acceptance) {
        html += '（最佳 ' + a.bestAcceptance + ' 張）';
      }
      html += '</div>';
    }
    if (a.handSnapshot) {
      html += renderMiniHand(a.handSnapshot, a.meldsSnapshot, a.tileName, a.suggestion);
    }
    if (a.reason) {
      html += '<div class="advice-reason">💡 ' + a.reason + '</div>';
    }
    html += '</div>';
  }
  if (result.advice.length === 0) {
    html += '<div class="advice-empty">沒有足夠的打牌記錄可分析</div>';
  }
  html += '</div></div>';

  // 基本統計
  var st = result.stats;
  html += '<div class="analysis-section">';
  html += '<div class="analysis-section-title">🀄 牌局統計</div>';
  html += '<div class="analysis-stats">';
  html += '<span>摸牌 ' + st.draws + '</span>';
  html += '<span>打牌 ' + st.discards + '</span>';
  html += '<span>碰 ' + st.pongs + '</span>';
  html += '<span>吃 ' + st.chows + '</span>';
  html += '<span>過 ' + st.passes + '</span>';
  html += '<span>槓 ' + st.kongs + '</span>';
  html += '<span>花 ' + st.flowers + '</span>';
  html += '</div></div>';

  // 對手聽牌分析
  if (result.opponentDanger && result.opponentDanger.length > 0) {
    html += '<div class="analysis-section">';
    html += '<div class="analysis-section-title">🔍 對手聽牌推測</div>';
    for (var oi = 0; oi < result.opponentDanger.length; oi++) {
      var opp = result.opponentDanger[oi];
      var ch = CHARACTERS[opp.seat] || CHARACTERS[0];
      html += '<div class="opp-danger-card" style="border-left:3px solid ' + ch.color + '">';
      html += '<div class="opp-danger-header">';
      html += '<span style="color:' + ch.color + ';font-weight:bold">' + opp.name + '</span>';
      html += '<span class="opp-danger-badge">' + opp.dangerLabel + '</span>';
      html += '</div>';
      // 牌型推測
      if (opp.patterns.length > 0) {
        html += '<div class="opp-danger-row">🎯 推測牌型：' + opp.patterns.join('、') + '</div>';
      }
      // 推理依據
      if (opp.reasoning.length > 0) {
        html += '<div class="opp-danger-row" style="color:#aaa;font-size:11px">💡 ' + opp.reasoning.join(' / ') + '</div>';
      }
      // 危險牌
      if (opp.dangerTiles.length > 0) {
        html += '<div class="opp-danger-row">🚨 危險牌：';
        for (var dti = 0; dti < opp.dangerTiles.length; dti++) {
          html += '<span class="mini-tile mini-discard">' + opp.dangerTiles[dti] + '</span> ';
        }
        html += '</div>';
      }
      // 可能聽的牌
      if (opp.likelyWaits.length > 0) {
        html += '<div class="opp-danger-row">👀 可能聽：';
        for (var lwi = 0; lwi < opp.likelyWaits.length; lwi++) {
          html += '<span class="mini-tile" style="background:rgba(239,68,68,0.4);border-color:#ef4444">' + opp.likelyWaits[lwi] + '</span> ';
        }
        html += '</div>';
      }
      // 安全牌
      if (opp.safeTiles.length > 0) {
        html += '<div class="opp-danger-row">✅ 現物安全牌：';
        for (var sti = 0; sti < Math.min(opp.safeTiles.length, 8); sti++) {
          html += '<span class="mini-tile mini-suggest">' + opp.safeTiles[sti] + '</span> ';
        }
        if (opp.safeTiles.length > 8) html += '<span style="color:#888">+' + (opp.safeTiles.length - 8) + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  html += '<button onclick="backToResult()">返回</button>';
  html += '</div>';

  overlay.innerHTML = html;
}

function toggleTimeline() {
  var el = document.getElementById('advice-timeline');
  var toggle = document.querySelector('.advice-toggle');
  if (!el) return;
  if (el.classList.contains('collapsed')) {
    el.classList.remove('collapsed');
    if (toggle) toggle.textContent = '(收合)';
  } else {
    el.classList.add('collapsed');
    if (toggle) toggle.textContent = '(展開)';
  }
}

function backToResult() {
  // 確保 phase 還是 ended（防止 AI 觀戰 timer 已經改掉 phase）
  if (game.phase !== 'ended' && game.phase !== 'game_over') {
    game.phase = 'ended';
  }
  renderEndScreen(game);
  document.getElementById('result-overlay').classList.add('show');
}


// ===== 牌的點擊與遊戲控制 =====

function quitGame() {
  if (confirm('確定要退出嗎？')) {
    var qb = document.getElementById('quit-btn');
    if (qb) qb.style.display = 'none';
    if (game._isMultiplayer) {
      MahjongNet.sendGameEnd();
    } else {
      location.reload();
    }
  }
}

function backToChatroom() {
  // 從結算畫面回到聊天室
  if (game._isMultiplayer) {
    MahjongNet.sendGameEnd();
  }
}

function onTileClick(tile) {
  if (!game || game.phase !== 'playing') return;
  var mySeat = game._mySeat || 0;
  if (game.currentTurn !== mySeat) return;
  if (selectedTileId === tile.id) {
    SFX.play('discard');
    selectedTileId = null;
    if (game._isMultiplayer && !game._isHost && typeof MahjongNet !== 'undefined') {
      // Non-host: only send action to host, don't modify local state
      MahjongNet.sendAction({ action: 'discard', seat: mySeat, tileId: tile.id });
    } else {
      game.discardTile(mySeat, tile.id);
      if (game._isMultiplayer && typeof MahjongNet !== 'undefined') {
        MahjongNet.sendAction({ action: 'discard', seat: mySeat, tileId: tile.id });
      }
    }
  } else {
    SFX.play('select');
    selectedTileId = tile.id;
    renderGame(game);
  }
}

function startGame() {
  document.getElementById('start-screen').style.display = 'none';
  var qb = document.getElementById('quit-btn'); if (qb) qb.style.display = 'flex';
  if (typeof checkOrientation === 'function') checkOrientation();
  document.getElementById('result-overlay').classList.remove('show');
  document.getElementById('action-bar').classList.remove('show');
  selectedTileId = null;
  lastPhase = 'idle';
  lastDiscardCounts = [0,0,0,0];
  lastFlowerCounts = [0,0,0,0];
  lastMeldCounts = [0,0,0,0];
  lastHandCount = 0;
  if (typeof BGM !== 'undefined' && SFX.isEnabled()) BGM.start();
  showDiceAnimation(game, function() {
    SFX.play('start');
    game.startRound();
  });
}

function nextRound() {
  if (_aiWatchTimer) { clearTimeout(_aiWatchTimer); _aiWatchTimer = null; }
  document.getElementById('result-overlay').classList.remove('show');
  document.getElementById('action-bar').classList.remove('show');
  selectedTileId = null;
  lastPhase = 'idle';
  lastDiscardCounts = [0,0,0,0];
  lastFlowerCounts = [0,0,0,0];
  lastMeldCounts = [0,0,0,0];
  lastHandCount = 0;

  if (game.phase === 'game_over') {
    var overlay = document.getElementById('result-overlay');
    overlay.innerHTML = '<h2>\u{1F004} 遊戲結束</h2><p style="color:#ffd700">四圈已打完</p>' +
      '<button onclick="location.reload()">重新開始</button>';
    overlay.classList.add('show');
    return;
  }

  showDiceAnimation(game, function() {
    SFX.play('start');
    game.nextRound();
  });
}

function toggleMute() {
  var on = SFX.toggle();
  ttsEnabled = on;
  if (typeof BGM !== 'undefined') BGM.setEnabled(on);
  var btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = on ? '🔊' : '🔇';
}

function toggleRiskIndicator() {
  _riskIndicatorOn = !_riskIndicatorOn;
  var btn = document.getElementById('risk-btn');
  if (btn) btn.style.opacity = _riskIndicatorOn ? '1' : '0.4';
  if (game && game.phase === 'playing') renderGame(game);
}


// ===== 骰子動畫（3 顆骰子）=====
var DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function showDiceAnimation(g, callback) {
  var overlay = document.getElementById('dice-overlay');
  var die1El = document.getElementById('die1');
  var die2El = document.getElementById('die2');
  var die3El = document.getElementById('die3');
  var resultEl = document.getElementById('dice-result');
  overlay.classList.add('show');
  resultEl.textContent = '';
  die1El.classList.add('rolling');
  die2El.classList.add('rolling');
  die3El.classList.add('rolling');
  SFX.play('dice');
  var rollCount = 0;
  var rollInterval = setInterval(function() {
    die1El.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    die2El.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    die3El.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    rollCount++;
    if (rollCount > 20) {
      clearInterval(rollInterval);
      var result = g.rollDice(0);
      die1El.textContent = DICE_FACES[result.dice1 - 1];
      die2El.textContent = DICE_FACES[result.dice2 - 1];
      die3El.textContent = DICE_FACES[result.dice3 - 1];
      die1El.classList.remove('rolling');
      die2El.classList.remove('rolling');
      die3El.classList.remove('rolling');
      var dealerName = g.players[result.dealer].name;
      resultEl.innerHTML = '點數 ' + result.sum + '　→　' + dealerName + ' 做莊（東風位）';
      setTimeout(function() {
        overlay.classList.remove('show');
        if (callback) callback();
      }, 2000);
    }
  }, 70);
}


// ===== Multiplayer Functions =====

function startMultiplayerGame() {
  document.getElementById('start-screen').style.display = 'none';
  var qb = document.getElementById('quit-btn'); if (qb) qb.style.display = 'flex';
  if (typeof checkOrientation === 'function') checkOrientation();
  document.getElementById('result-overlay').classList.remove('show');
  document.getElementById('action-bar').classList.remove('show');
  selectedTileId = null;
  lastPhase = 'idle';
  lastDiscardCounts = [0,0,0,0];
  lastFlowerCounts = [0,0,0,0];
  lastMeldCounts = [0,0,0,0];
  lastHandCount = 0;

  if (game._isHost) {
    // Host: hook into onUpdate to auto-broadcast state to remote players
    var origOnUpdate = game.onUpdate;
    game.onUpdate = function(g) {
      if (origOnUpdate) origOnUpdate(g);
      broadcastGameState();
    };
    showDiceAnimation(game, function() {
      SFX.play('start');
      game.startRound();
    });
  } else {
    // Non-host: wait for game state from host via WebSocket
    SFX.play('start');
  }
}

function broadcastGameState() {
  if (!game._isMultiplayer || !game._isHost) return;
  if (typeof MahjongNet === 'undefined') return;
  // Serialize game state for broadcast
  var state = {
    action: 'gameState',
    wall: game.wall.map(function(t) { return { id: t.id, type: t.type, suit: t.suit, value: t.value, name: t.name, sortKey: t.sortKey }; }),
    wallIndex: game.wallIndex,
    wallTailIndex: game.wallTailIndex,
    dealer: game.dealer,
    diceSum: game.diceSum,
    breakWall: game.breakWall,
    breakStack: game.breakStack,
    currentTurn: game.currentTurn,
    phase: game.phase,
    players: game.players.map(function(p) {
      return {
        name: p.name,
        seat: p.seat,
        hand: p.hand.map(function(t) { return { id: t.id, type: t.type, suit: t.suit, value: t.value, name: t.name, sortKey: t.sortKey }; }),
        melds: p.melds.map(function(m) { return { type: m.type, kongType: m.kongType, from: m.from, tiles: m.tiles.map(function(t) { return { id: t.id, type: t.type, suit: t.suit, value: t.value, name: t.name, sortKey: t.sortKey }; }) }; }),
        flowers: p.flowers.map(function(t) { return { id: t.id, type: t.type, suit: t.suit, value: t.value, name: t.name, sortKey: t.sortKey }; }),
        discards: p.discards.map(function(t) { return { id: t.id, type: t.type, suit: t.suit, value: t.value, name: t.name, sortKey: t.sortKey }; }),
        isHuman: p.isHuman,
        isRemote: p.isRemote
      };
    }),
    lastDiscardedTile: game.lastDiscardedTile ? { id: game.lastDiscardedTile.id, type: game.lastDiscardedTile.type, suit: game.lastDiscardedTile.suit, value: game.lastDiscardedTile.value, name: game.lastDiscardedTile.name, sortKey: game.lastDiscardedTile.sortKey } : null,
    lastDiscardSeat: game.lastDiscardSeat,
    lastDrawnTile: game.lastDrawnTile ? { id: game.lastDrawnTile.id, type: game.lastDrawnTile.type, suit: game.lastDrawnTile.suit, value: game.lastDrawnTile.value, name: game.lastDrawnTile.name, sortKey: game.lastDrawnTile.sortKey } : null,
    winnerSeat: game.winnerSeat,
    winType: game.winType,
    pendingActions: game.pendingActions.map(function(a) {
      var sa = { type: a.type, seat: a.seat, priority: a.priority };
      if (a.combos) sa.combos = a.combos;
      if (a.tiles) sa.tiles = a.tiles.map(function(t) { return { id: t.id, type: t.type, suit: t.suit, value: t.value, name: t.name, sortKey: t.sortKey }; });
      if (a.tile) sa.tile = { id: a.tile.id, type: a.tile.type, suit: a.tile.suit, value: a.tile.value, name: a.tile.name, sortKey: a.tile.sortKey };
      if (a.meld) {
        sa.meldIdx = game.players[a.seat].melds.indexOf(a.meld);
      }
      return sa;
    }),
    gameLog: game.gameLog
  };
  MahjongNet.sendAction(state);
}

function handleRemoteAction(msg) {
  if (!game || !game._isMultiplayer) return;
  var data = msg.data || msg;

  if (data.action === 'gameState') {
    // Non-host receives full game state from host
    applyGameState(data);
    return;
  }

  if (game._isHost) {
    // Host receives actions from remote players and applies them
    // Note: broadcastGameState is called automatically via game.onUpdate hook
    var seat = data.seat;
    switch (data.action) {
      case 'discard':
        game.discardTile(seat, data.tileId);
        break;
      case 'pong':
        game.doPong(seat);
        break;
      case 'chow':
        game.doChow(seat, data.combo);
        break;
      case 'mingkong':
        game.doMingKong(seat);
        break;
      case 'ankong':
        var tiles = [];
        if (data.tileIds) {
          for (var i = 0; i < data.tileIds.length; i++) {
            var t = game.players[seat].hand.find(function(h) { return h.id === data.tileIds[i]; });
            if (t) tiles.push(t);
          }
        }
        if (tiles.length === 4) game.doAnKong(seat, tiles);
        break;
      case 'addkong':
        var meld = game.players[seat].melds[data.meldIdx];
        var tile = game.players[seat].hand.find(function(h) { return h.id === data.tileId; });
        if (meld && tile) game.doAddKong(seat, meld, tile);
        break;
      case 'win':
        game.doWin(seat, data.winType);
        break;
      case 'pass':
        game.doPass(seat);
        break;
    }
  } else {
    // Non-host: apply state updates from host
    if (data.action === 'gameState') {
      applyGameState(data);
    }
  }
}

function applyGameState(state) {
  // Rebuild game state from host's broadcast
  // Reconstruct tile objects with displayInfo for rendering
  function rebuildTile(t) {
    if (!t) return null;
    var tile = { id: t.id, type: t.type, suit: t.suit, value: t.value, name: t.name, sortKey: t.sortKey };
    // Rebuild displayInfo needed by createTileHTML
    if (t.type === 'suit' && TILE_DISPLAY[t.suit]) {
      tile.displayInfo = TILE_DISPLAY[t.suit][t.value - 1];
    } else if (TILE_DISPLAY[t.suit]) {
      tile.displayInfo = TILE_DISPLAY[t.suit];
    } else {
      tile.displayInfo = { top: t.name || '?', bottom: '', color: 'black' };
    }
    return tile;
  }

  game.wallIndex = state.wallIndex;
  game.wallTailIndex = state.wallTailIndex;
  game.dealer = state.dealer;
  game.diceSum = state.diceSum;
  game.breakWall = state.breakWall;
  game.breakStack = state.breakStack;
  game.currentTurn = state.currentTurn;
  game.phase = state.phase;
  game.lastDiscardSeat = state.lastDiscardSeat;
  game.lastDiscardedTile = state.lastDiscardedTile ? rebuildTile(state.lastDiscardedTile) : null;
  game.lastDrawnTile = state.lastDrawnTile ? rebuildTile(state.lastDrawnTile) : null;
  game.winnerSeat = state.winnerSeat;
  game.winType = state.winType;
  game.gameLog = state.gameLog || [];

  // Rebuild wall
  if (state.wall) {
    game.wall = state.wall.map(rebuildTile);
  }

  // Rebuild players
  if (state.players) {
    var mySeat = game._mySeat || 0;
    for (var i = 0; i < 4; i++) {
      var sp = state.players[i];
      var gp = game.players[i];
      gp.name = sp.name;
      gp.hand = sp.hand.map(rebuildTile);
      gp.melds = sp.melds.map(function(m) {
        return { type: m.type, kongType: m.kongType, from: m.from, tiles: m.tiles.map(rebuildTile) };
      });
      gp.flowers = sp.flowers.map(rebuildTile);
      gp.discards = sp.discards.map(rebuildTile);
      // Adjust perspective: my seat is local human, other humans are remote
      var isHumanOnHost = sp.isHuman || sp.isRemote; // either flag means a real human
      if (i === mySeat) {
        gp.isHuman = true;
        gp.isRemote = false;
      } else if (isHumanOnHost) {
        gp.isHuman = false;
        gp.isRemote = true;
      } else {
        gp.isHuman = false;
        gp.isRemote = false;
      }
    }
  }

  // Rebuild pending actions with proper references
  if (state.pendingActions) {
    game.pendingActions = state.pendingActions.map(function(a) {
      var ra = { type: a.type, seat: a.seat, priority: a.priority };
      if (a.combos) ra.combos = a.combos;
      if (a.tiles) ra.tiles = a.tiles.map(rebuildTile);
      if (a.tile) ra.tile = rebuildTile(a.tile);
      if (typeof a.meldIdx === 'number' && a.meldIdx >= 0) {
        ra.meld = game.players[a.seat].melds[a.meldIdx];
      }
      return ra;
    });
  }

  // Update wall segments and render
  game._updateWallSegments();
  renderGame(game);

  // If it's my turn and phase is waiting_action, check for my actions
  var mySeat = game._mySeat || 0;
  if (game.phase === 'waiting_action') {
    var myActions = game.pendingActions.filter(function(a) { return a.seat === mySeat; });
    if (myActions.length > 0) {
      renderActionButtons(game);
    }
  }
}

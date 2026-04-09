/**
 * ui.js — 五子棋 UI 控制
 */
var UI = (function() {
  var screens = {};
  var selectedDiff = '10k';
  var selectedColor = 'black';
  var replayIdx = 0;
  var replayMoves = [];
  var replayBoard = null;
  var replayAnalysis = null;

  // === 瀏覽器返回鍵管理 ===
  var navStack = []; // 導航堆疊，記錄開啟的 overlay/screen
  var ignorePopstate = false; // 防止 history.back() 觸發 popstate 重複處理

  function pushNav(id) {
    navStack.push(id);
    history.pushState({ nav: id }, '');
  }

  function closeTopNav() {
    var top = navStack.pop();
    if (!top) return false;
    if (top === 'replay') { closeReplayDirect(); return true; }
    if (top === 'analysis') { closeAnalysisDirect(); return true; }
    if (top === 'history') { closeHistoryDirect(); return true; }
    if (top === 'win') { document.getElementById('winOverlay').classList.remove('active'); VFX.clear(); return true; }
    if (top === 'setup') { showScreen('menu'); return true; }
    if (top === 'multi') { showScreen('menu'); return true; }
    if (top === 'game') { showMenu(); return true; }
    return false;
  }

  function init() {
    screens = {
      menu: document.getElementById('menuScreen'),
      setup: document.getElementById('setupScreen'),
      game: document.getElementById('gameScreen'),
      multi: document.getElementById('multiScreen')
    };

    // 瀏覽器返回鍵
    history.replaceState({ nav: 'menu' }, '');
    window.addEventListener('popstate', function(e) {
      if (ignorePopstate) { ignorePopstate = false; return; }
      if (navStack.length > 0) {
        closeTopNav();
      }
    });

    // 棋盤初始化
    Board.init(document.getElementById('boardCanvas'));

    // VFX 初始化（用遊戲畫面的 boardCanvas 座標系）
    // 注意：VFX canvas 在 winOverlay 裡，遊戲中的粒子直接畫在 board canvas 上
    VFX.init(document.getElementById('vfxCanvas'));

    // 難度按鈕
    var diffBtns = document.querySelectorAll('[data-diff]');
    diffBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        diffBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedDiff = btn.dataset.diff;
        Sound.click();
      });
    });

    // 執子按鈕
    var colorBtns = document.querySelectorAll('[data-color]');
    colorBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        colorBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedColor = btn.dataset.color;
        Sound.click();
      });
    });

    // Canvas 事件
    var canvas = document.getElementById('boardCanvas');
    canvas.addEventListener('click', function(e) {
      e.stopPropagation();
      var pos = Board.getClickPos(e);
      if (pos) Game.handleClick(pos.x, pos.y);
    });
    canvas.addEventListener('mousemove', function(e) {
      var pos = Board.getClickPos(e);
      Board.setHover(pos);
      Board.draw();
    });
    canvas.addEventListener('mouseleave', function() {
      Board.setHover(null);
      Board.draw();
    });
    // 觸控 — 直接落子（點擊即下）
    canvas.addEventListener('touchend', function(e) {
      e.preventDefault();
      var pos = Board.getClickPos(e);
      if (!pos) return;
      Board.setConfirmPos(null);
      Board.draw();
      Game.handleClick(pos.x, pos.y);
    }, { passive: false });

    // 視窗大小
    window.addEventListener('resize', function() {
      Board.resize();
      VFX.resize();
    });

    // 音樂選擇器初始化
    initMusicSelector();
  }

  function showScreen(name) {
    Object.keys(screens).forEach(function(k) {
      screens[k].classList.remove('active');
    });
    if (screens[name]) screens[name].classList.add('active');
    // 隱藏 overlays
    document.getElementById('winOverlay').classList.remove('active');
    document.getElementById('replayOverlay').classList.remove('active');
  }

  function showMenu() { BGM.stop(); navStack = []; showScreen('menu'); }

  function showSingleSetup() { pushNav('setup'); showScreen('setup'); Sound.click(); }
  function showMultiplayer() { pushNav('multi'); showScreen('multi'); Sound.click(); }

  function startSingleGame() {
    pushNav('game');
    showScreen('game');
    Sound.click();
    analysisReady = false;
    analysisMoves = null;
    var tutorial = document.getElementById('tutorialToggle') && document.getElementById('tutorialToggle').checked;
    // Use multiple resize attempts to handle layout timing
    function tryResize() {
      Board.resize();
      if (Board.cellSize <= 0) {
        setTimeout(tryResize, 100);
        return;
      }
      Game.startSingle(selectedDiff, selectedColor, tutorial);
    }
    setTimeout(tryResize, 50);
    BGM.start();
  }

  function updateTurn() {
    var dot = document.getElementById('turnDot');
    var text = document.getElementById('turnText');
    var count = document.getElementById('moveCount');
    if (Game.turn === 1) {
      dot.className = 'dot-black';
      text.textContent = '黑子的回合';
    } else {
      dot.className = 'dot-white';
      text.textContent = '白子的回合';
    }
    // AI thinking animation
    if (Game.aiThinking) {
      text.innerHTML = '<span class="thinking-text">' + text.textContent + '</span><span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>';
      dot.classList.add('ai-thinking');
    } else {
      dot.classList.remove('ai-thinking');
    }
    count.textContent = '第 ' + Game.moves.length + ' 手';
  }

  function updateTimer(black, white, current) {
    var el = document.getElementById('gameTimer');
    if (!el) return;
    function fmt(s) {
      var m = Math.floor(s / 60);
      var sec = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }
    var bClass = current === 1 ? ' timer-active' : '';
    var wClass = current === 2 ? ' timer-active' : '';
    el.innerHTML = '<span class="timer-black' + bClass + '">⚫ ' + fmt(black) + '</span>' +
                   '<span class="timer-sep">|</span>' +
                   '<span class="timer-white' + wClass + '">⚪ ' + fmt(white) + '</span>';
  }

  function showWin(winner) {
    var overlay = document.getElementById('winOverlay');
    var title = document.getElementById('winTitle');
    var sub = document.getElementById('winSub');
    VFX.clear();
    VFX.resize();

    if (winner === 0) {
      title.textContent = '平局';
      title.style.color = '#888';
      sub.textContent = '棋盤已滿，不分勝負';
    } else {
      var isPlayer = (Game.mode === 'single' && winner === Game.playerColor);
      if (winner === 1) {
        title.textContent = '⚫ 黑子勝利';
        title.style.color = '#00d4ff';
      } else {
        title.textContent = '⚪ 白子勝利';
        title.style.color = '#ffd700';
      }
      sub.textContent = isPlayer ? '恭喜你贏了！' : (Game.mode === 'single' ? 'AI 獲勝，再接再厲！' : '');
      VFX.winEffect();
    }
    overlay.classList.add('active');
    pushNav('win');

    // 儲存對戰紀錄
    if (Game.mode === 'single') {
      History.record(winner);
    }
  }

  function rematch() {
    // 移除 win overlay 的 nav 記錄
    for (var i = navStack.length - 1; i >= 0; i--) { if (navStack[i] === 'win') { navStack.splice(i, 1); break; } }
    document.getElementById('winOverlay').classList.remove('active');
    VFX.clear();
    var tutorial = document.getElementById('tutorialToggle') && document.getElementById('tutorialToggle').checked;
    Game.startSingle(Game.difficulty, Game.playerColor === 1 ? 'black' : 'white', tutorial);
  }

  function confirmExit() {
    if (Game.gameOver || confirm('確定要離開遊戲嗎？')) {
      BGM.stop();
      // 清空 navStack 並回主選單
      var count = navStack.length;
      navStack = [];
      showScreen('menu');
      // 清掉 browser history entries
      if (count > 0) history.go(-count);
    }
  }

  function toggleNumbers() {
    var btn = document.getElementById('btnNumbers');
    var on = btn.classList.toggle('active-toggle');
    Board.setShowNumbers(on);
    Board.draw();
  }

  // === 棋譜回放 ===
  function showReplay() {
    // 隱藏 win overlay（但保留 navStack 中的 win 記錄）
    document.getElementById('winOverlay').classList.remove('active');
    VFX.clear();
    var overlay = document.getElementById('replayOverlay');
    overlay.classList.add('active');
    pushNav('replay');
    replayMoves = Game.moves.slice();
    replayIdx = 0;
    replayAnalysis = null;
    replayBoard = [];
    for (var y = 0; y < 15; y++) { replayBoard[y] = []; for (var x = 0; x < 15; x++) replayBoard[y][x] = 0; }

    // Pre-run analysis
    try { replayAnalysis = Analysis.analyze(replayMoves, Game.playerColor || 1); } catch(e) { replayAnalysis = []; }

    var rc = document.getElementById('replayCanvas');
    var container = document.getElementById('replayBoardContainer');
    var dim = Math.min(container.clientWidth, 400);
    rc.width = dim; rc.height = dim;
    drawReplay();
    updateReplayStep();
  }

  // 直接關閉（popstate 用，不操作 history）
  function closeReplayDirect() {
    document.getElementById('replayOverlay').classList.remove('active');
    // 回到勝利畫面（只有當前遊戲結束時）
    if (Game.gameOver && screens.game && screens.game.classList.contains('active')) {
      document.getElementById('winOverlay').classList.add('active');
    }
  }

  function closeReplay() {
    document.getElementById('replayOverlay').classList.remove('active');
    // 從 navStack 移除 replay
    for (var i = navStack.length - 1; i >= 0; i--) { if (navStack[i] === 'replay') { navStack.splice(i, 1); break; } }
    // 回到勝利畫面（只有當前遊戲結束時）
    if (Game.gameOver && screens.game && screens.game.classList.contains('active')) {
      document.getElementById('winOverlay').classList.add('active');
    }
    ignorePopstate = true;
    history.back();
  }

  function replayStep(delta) {
    var target = replayIdx + delta;
    if (target < 0) target = 0;
    if (target > replayMoves.length) target = replayMoves.length;
    // 重建到 target
    replayBoard = [];
    for (var y = 0; y < 15; y++) { replayBoard[y] = []; for (var x = 0; x < 15; x++) replayBoard[y][x] = 0; }
    for (var i = 0; i < target; i++) {
      var m = replayMoves[i];
      replayBoard[m.y][m.x] = m.color;
    }
    replayIdx = target;
    drawReplay();
    updateReplayStep();
    Sound.click();
  }

  function updateReplayStep() {
    document.getElementById('replayStep').textContent = replayIdx + ' / ' + replayMoves.length;
    // Show analysis commentary
    var el = document.getElementById('replayComment');
    if (!el) return;
    if (replayIdx === 0) {
      el.innerHTML = '<span class="rc-hint">按 ▶ 逐步回放，每一手都有教練分析</span>';
      return;
    }
    // Run analysis if not cached
    if (!replayAnalysis || replayAnalysis.length === 0) {
      try { replayAnalysis = Analysis.analyze(replayMoves, Game.playerColor || 1); } catch(e) { replayAnalysis = []; }
    }
    var r = replayAnalysis[replayIdx - 1];
    if (!r) { el.innerHTML = ''; return; }
    var adv = r.advice;
    var isObj = adv && typeof adv === 'object';
    var short = isObj ? adv.short : (r.rating ? r.rating.emoji + ' ' + r.rating.label : '');
    var detail = isObj ? adv.detail : (typeof adv === 'string' ? adv : '');
    var ratingClass = '';
    if (r.rating === Analysis.RATINGS.BEST) ratingClass = 'rc-best';
    else if (r.rating === Analysis.RATINGS.GOOD) ratingClass = 'rc-good';
    else if (r.rating === Analysis.RATINGS.OK) ratingClass = 'rc-ok';
    else if (r.rating === Analysis.RATINGS.INACCURACY) ratingClass = 'rc-warn';
    else if (r.rating === Analysis.RATINGS.MISTAKE) ratingClass = 'rc-bad';
    else if (r.rating === Analysis.RATINGS.BLUNDER) ratingClass = 'rc-blunder';
    var who = r.move.color === 1 ? '⚫' : '⚪';
    var wr = r.winRate !== undefined ? ' · 勝率 ' + r.winRate + '%' : '';
    el.innerHTML = '<div class="rc-header ' + ratingClass + '">'
      + '<span class="rc-num">#' + r.moveNum + ' ' + who + '</span>'
      + '<span class="rc-label">' + short + '</span>'
      + '<span class="rc-wr">' + wr + '</span>'
      + '</div>'
      + (detail ? '<div class="rc-detail">' + detail + '</div>' : '');
  }

  function drawReplay() {
    var rc = document.getElementById('replayCanvas');
    var ctx = rc.getContext('2d');
    var dim = rc.width;
    var pad = dim * 0.06;
    var bpx = dim - pad * 2;
    var cs = bpx / 14;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, dim, dim);

    // 格線
    ctx.strokeStyle = '#333366'; ctx.lineWidth = 1;
    for (var i = 0; i < 15; i++) {
      ctx.beginPath(); ctx.moveTo(pad + i * cs, pad); ctx.lineTo(pad + i * cs, pad + 14 * cs); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, pad + i * cs); ctx.lineTo(pad + 14 * cs, pad + i * cs); ctx.stroke();
    }

    // 棋子
    for (var y = 0; y < 15; y++) {
      for (var x = 0; x < 15; x++) {
        var v = replayBoard[y][x];
        if (v === 0) continue;
        var px = pad + x * cs, py = pad + y * cs;
        var r = cs * 0.4;
        if (v === 1) {
          ctx.fillStyle = '#1a1a3e'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,212,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = '#e0e0e0'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,215,0,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
        }
        // 手數
        ctx.fillStyle = v === 1 ? '#aaccff' : '#333';
        ctx.font = 'bold ' + (cs * 0.32) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // 找手數
        for (var mi = 0; mi < replayIdx; mi++) {
          if (replayMoves[mi].x === x && replayMoves[mi].y === y) {
            ctx.fillText(String(mi + 1), px, py);
            break;
          }
        }
      }
    }

    // 最後一手標記（根據分析評級上色）
    if (replayIdx > 0) {
      var last = replayMoves[replayIdx - 1];
      var lx = pad + last.x * cs, ly = pad + last.y * cs;
      var markColor = '#ff4444';
      var ra = replayAnalysis && replayAnalysis[replayIdx - 1];
      if (ra && ra.rating) markColor = ra.rating.color || '#ff4444';
      ctx.strokeStyle = markColor; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(lx, ly, cs * 0.15, 0, Math.PI * 2); ctx.stroke();

      // 如果有更好的手，畫綠色虛線圈標示最佳位置
      if (ra && ra.bestMove && ra.rating !== Analysis.RATINGS.BEST && ra.rating !== Analysis.RATINGS.GOOD) {
        var bx = pad + ra.bestMove.x * cs, by = pad + ra.bestMove.y * cs;
        ctx.strokeStyle = 'rgba(76,175,80,0.7)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(bx, by, cs * 0.35, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // 小箭頭標記
        ctx.fillStyle = 'rgba(76,175,80,0.8)';
        ctx.font = 'bold ' + (cs * 0.28) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✦', bx, by);
      }
    }
  }

  // === 覆盤分析 ===
  var analysisReady = false; // 是否已分析過（避免重複計算）
  var analysisMoves = null;  // 快取的棋步

  function showAnalysis() {
    // 隱藏 win overlay（但保留 navStack 中的 win 記錄）
    document.getElementById('winOverlay').classList.remove('active');
    VFX.clear();
    var overlay = document.getElementById('analysisOverlay');
    overlay.classList.add('active');
    pushNav('analysis');

    // 如果已經分析過且棋步沒變，直接顯示
    if (analysisReady && analysisMoves === Game.moves) {
      document.getElementById('analysisLoading').style.display = 'none';
      document.getElementById('analysisContent').style.display = '';
      return;
    }

    document.getElementById('analysisLoading').style.display = '';
    document.getElementById('analysisContent').style.display = 'none';

    setTimeout(function() {
      analysisMoves = Game.moves;
      Analysis.analyze(Game.moves, Game.playerColor);
      renderAnalysis();
      analysisReady = true;
      document.getElementById('analysisLoading').style.display = 'none';
      document.getElementById('analysisContent').style.display = '';

      // Gemini AI 評語（非同步，透過後端 proxy）
      var geminiDiv = document.getElementById('geminiReview');
      geminiDiv.innerHTML = '<div class="gemini-loading"><div class="spinner-sm"></div> Gemini 分析中...</div>';
      Analysis.getGeminiReview(null, Game.moves, Game.playerColor).then(function(text) {
        geminiDiv.textContent = text;
      });
    }, 100);
  }

  // 直接關閉（popstate 用）
  function closeAnalysisDirect() {
    document.getElementById('analysisOverlay').classList.remove('active');
    if (Game.gameOver) {
      document.getElementById('winOverlay').classList.add('active');
    }
  }

  function closeAnalysis() {
    document.getElementById('analysisOverlay').classList.remove('active');
    for (var i = navStack.length - 1; i >= 0; i--) { if (navStack[i] === 'analysis') { navStack.splice(i, 1); break; } }
    // 關閉後顯示勝利畫面
    if (Game.gameOver) {
      document.getElementById('winOverlay').classList.add('active');
    }
    ignorePopstate = true;
    history.back();
  }

  function renderAnalysis() {
    var stats = Analysis.getSummary(Game.playerColor);
    // 準確率環
    var pct = stats.accuracy;
    document.getElementById('accuracyPct').textContent = pct;
    var circle = document.getElementById('accuracyCircle');
    var circumference = 2 * Math.PI * 42;
    circle.style.transition = 'stroke-dashoffset 1s ease';
    circle.setAttribute('stroke-dasharray', circumference);
    circle.setAttribute('stroke-dashoffset', circumference);
    setTimeout(function() {
      circle.setAttribute('stroke-dashoffset', circumference * (1 - pct / 100));
    }, 50);

    // 統計數字
    document.getElementById('statBest').textContent = stats.best;
    document.getElementById('statGood').textContent = stats.good;
    document.getElementById('statOk').textContent = stats.ok;
    document.getElementById('statInaccuracy').textContent = stats.inaccuracy;
    document.getElementById('statMistake').textContent = stats.mistake;
    document.getElementById('statBlunder').textContent = stats.blunder;

    drawWinRateChart();
    renderMoments();
    renderMovesList();
  }

  function drawWinRateChart() {
    var canvas = document.getElementById('winRateChart');
    var container = canvas.parentElement;
    var w = container.clientWidth - 40;
    if (w < 200) w = 300;
    var h = 120;
    canvas.width = w * 2; canvas.height = h * 2;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    var res = Analysis.results;
    if (res.length < 2) return;

    ctx.fillStyle = '#0d0d20';
    ctx.fillRect(0, 0, w, h);

    // 50% 線
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    var stepX = w / (res.length - 1);

    // 填充區域
    ctx.beginPath();
    ctx.moveTo(0, h - (res[0].winRate / 100) * h);
    for (var i = 1; i < res.length; i++) {
      ctx.lineTo(i * stepX, h - (res[i].winRate / 100) * h);
    }
    ctx.lineTo((res.length - 1) * stepX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,212,255,0.3)');
    grad.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // 線條
    ctx.beginPath();
    ctx.moveTo(0, h - (res[0].winRate / 100) * h);
    for (var i = 1; i < res.length; i++) {
      ctx.lineTo(i * stepX, h - (res[i].winRate / 100) * h);
    }
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 標記關鍵轉折點
    var moments = Analysis.getKeyMoments(3);
    for (var m = 0; m < moments.length; m++) {
      var idx = moments[m].index;
      var x = idx * stepX;
      var y = h - (res[idx].winRate / 100) * h;
      ctx.fillStyle = moments[m].result.rating.color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderMoments() {
    var list = document.getElementById('momentsList');
    list.innerHTML = '';
    var moments = Analysis.getKeyMoments(5);
    for (var i = 0; i < moments.length; i++) {
      var m = moments[i];
      var r = m.result;
      var isBlack = r.move.color === 1;
      var coord = String.fromCharCode(65 + r.move.x) + (15 - r.move.y);
      var prev = Analysis.results[m.index - 1] ? Analysis.results[m.index - 1].winRate : 50;
      var deltaVal = r.winRate - prev;
      var deltaSign = deltaVal >= 0 ? '+' : '';

      var div = document.createElement('div');
      div.className = 'moment-item';
      var advText = r.advice ? ((typeof r.advice === 'object') ? (r.advice.detail || r.advice.short || '') : r.advice) : '';
      var adviceHtml = advText ? '<div class="moment-advice">' + advText + '</div>' : '';
      div.innerHTML =
        '<div class="moment-num ' + (isBlack ? 'black' : 'white') + '">' + r.moveNum + '</div>' +
        '<div class="moment-info">' +
          '<div class="label">' + r.rating.emoji + ' ' + coord + ' ' + r.rating.label + '</div>' +
          '<div class="detail">勝率 ' + r.winRate + '%</div>' +
          adviceHtml +
        '</div>' +
        '<div class="moment-delta" style="color:' + (deltaVal >= 0 ? '#4caf50' : '#f44336') + '">' +
          deltaSign + deltaVal + '%</div>';
      list.appendChild(div);
    }
  }

  function renderMovesList() {
    var list = document.getElementById('movesList');
    list.innerHTML = '';
    var res = Analysis.results;
    var allMoves = Game.moves;

    for (var i = 0; i < allMoves.length; i++) {
      var m = allMoves[i];
      var isBlack = m.color === 1;
      var coord = String.fromCharCode(65 + m.x) + (15 - m.y);
      var moveNum = i + 1;

      // 找對應的分析結果
      var r = null;
      for (var j = 0; j < res.length; j++) {
        if (res[j].moveNum === moveNum) { r = res[j]; break; }
      }

      var div = document.createElement('div');
      div.className = 'move-item';
      div.dataset.step = moveNum;
      div.style.cursor = 'pointer';

      var colorDot = isBlack
        ? '<span class="move-color-dot dot-b">⚫</span>'
        : '<span class="move-color-dot dot-w">⚪</span>';

      var ratingHtml = '';
      if (r && r.rating) {
        ratingHtml = '<span class="rating-badge" style="background:' + r.rating.color + '22;color:' + r.rating.color + '">' +
          r.rating.emoji + ' ' + r.rating.label + '</span>';
        if (r.rating !== Analysis.RATINGS.BEST && r.bestMove) {
          var bestCoord = String.fromCharCode(65 + r.bestMove.x) + (15 - r.bestMove.y);
          ratingHtml += '<span class="best-hint">最佳: ' + bestCoord + '</span>';
        }
        if (r.advice) {
          var advText = (typeof r.advice === 'object') ? (r.advice.detail || r.advice.short || '') : r.advice;
          if (advText) ratingHtml += '<div class="move-advice">' + advText + '</div>';
        }
      }

      div.innerHTML = colorDot +
        '<span class="num">#' + moveNum + '</span>' +
        '<span class="coord">' + coord + '</span>' +
        ratingHtml;

      // 點擊跳到棋譜回放該步
      (function(step) {
        div.addEventListener('click', function() {
          // 直接關閉分析（不操作 history），然後開啟回放
          document.getElementById('analysisOverlay').classList.remove('active');
          for (var i = navStack.length - 1; i >= 0; i--) { if (navStack[i] === 'analysis') { navStack.splice(i, 1); break; } }
          document.getElementById('winOverlay').classList.remove('active');
          showReplay();
          // 跳到指定步數
          replayStep(step - replayIdx);
        });
      })(moveNum);

      list.appendChild(div);
    }
  }

  // DOM Ready
  // === 對戰紀錄 ===
  function showHistory() {
    var overlay = document.getElementById('historyOverlay');
    var stats = History.getStats();
    var statsEl = document.getElementById('historyStats');
    var listEl = document.getElementById('historyList');

    // 統計摘要
    var winRate = stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : 0;
    var html = '<div class="stats-row">';
    html += '<div class="stat-box"><span class="stat-num">' + stats.total + '</span><span class="stat-lbl">總場次</span></div>';
    html += '<div class="stat-box win"><span class="stat-num">' + stats.wins + '</span><span class="stat-lbl">勝</span></div>';
    html += '<div class="stat-box lose"><span class="stat-num">' + stats.losses + '</span><span class="stat-lbl">負</span></div>';
    html += '<div class="stat-box"><span class="stat-num">' + winRate + '%</span><span class="stat-lbl">勝率</span></div>';
    html += '</div>';

    // 各等級勝率
    var diffs = ['30k','20k','10k','5k','1k','1d','3d'];
    var hasAny = false;
    var diffHtml = '<div class="diff-stats">';
    for (var i = 0; i < diffs.length; i++) {
      var d = stats.byDiff[diffs[i]];
      if (!d) continue;
      hasAny = true;
      var t = d.w + d.l + d.d;
      var wr = t > 0 ? Math.round(d.w / t * 100) : 0;
      diffHtml += '<div class="diff-row"><span class="diff-name">' + History.diffLabel(diffs[i]) + '</span>';
      diffHtml += '<span class="diff-record">' + d.w + '勝 ' + d.l + '負</span>';
      diffHtml += '<span class="diff-rate">' + wr + '%</span></div>';
    }
    diffHtml += '</div>';
    if (hasAny) html += diffHtml;
    statsEl.innerHTML = html;

    // 紀錄列表
    var records = History.load();
    if (records.length === 0) {
      listEl.innerHTML = '<div class="history-empty">還沒有對戰紀錄</div>';
    } else {
      var lhtml = '';
      for (var j = 0; j < records.length; j++) {
        var r = records[j];
        var d = new Date(r.date);
        var dateStr = (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
        var resultCls = r.result === 'win' ? 'result-win' : (r.result === 'lose' ? 'result-lose' : 'result-draw');
        var resultTxt = r.result === 'win' ? '勝' : (r.result === 'lose' ? '負' : '平');
        var colorIcon = r.playerColor === 'black' ? '⚫' : '⚪';
        var hasReplay = r.movesData && r.movesData.length > 0;
        lhtml += '<div class="history-item' + (hasReplay ? ' has-replay' : '') + '" data-idx="' + j + '">';
        lhtml += '<span class="hi-date">' + dateStr + '</span>';
        lhtml += '<span class="hi-color">' + colorIcon + '</span>';
        lhtml += '<span class="hi-diff">' + History.diffLabel(r.difficulty) + '</span>';
        lhtml += '<span class="hi-result ' + resultCls + '">' + resultTxt + '</span>';
        lhtml += '<span class="hi-moves">' + r.moves + '手</span>';
        if (hasReplay) lhtml += '<span class="hi-replay-icon">▶</span>';
        lhtml += '</div>';
      }
      listEl.innerHTML = lhtml;
      // Bind click for replay
      var items = listEl.querySelectorAll('.history-item.has-replay');
      items.forEach(function(item) {
        item.addEventListener('click', function() {
          var idx = parseInt(item.dataset.idx);
          var rec = records[idx];
          if (!rec || !rec.movesData) return;
          // Close history, open replay with saved moves
          document.getElementById('historyOverlay').classList.remove('active');
          for (var i = navStack.length - 1; i >= 0; i--) { if (navStack[i] === 'history') { navStack.splice(i, 1); break; } }
          ignorePopstate = true;
          history.back();
          showHistoryReplay(rec.movesData);
        });
      });
    }
    overlay.classList.add('active');
    pushNav('history');
    Sound.click();
  }

  // 直接關閉（popstate 用）
  function closeHistoryDirect() {
    document.getElementById('historyOverlay').classList.remove('active');
  }

  function closeHistory() {
    document.getElementById('historyOverlay').classList.remove('active');
    for (var i = navStack.length - 1; i >= 0; i--) { if (navStack[i] === 'history') { navStack.splice(i, 1); break; } }
    history.back();
  }

  function clearHistory() {
    if (confirm('確定要清除所有對戰紀錄嗎？')) {
      History.clear();
      showHistory();
    }
  }

  // === 教學模式提示 ===
  var hintTimer = null;

  // === History Replay (from saved movesData) ===
  function showHistoryReplay(movesData) {
    var overlay = document.getElementById('replayOverlay');
    overlay.classList.add('active');
    pushNav('replay');
    replayMoves = movesData.slice();
    replayIdx = 0;
    replayAnalysis = null;
    replayBoard = [];
    for (var y = 0; y < 15; y++) { replayBoard[y] = []; for (var x = 0; x < 15; x++) replayBoard[y][x] = 0; }

    // Pre-run analysis
    try { replayAnalysis = Analysis.analyze(replayMoves, Game.playerColor || 1); } catch(e) { replayAnalysis = []; }

    var rc = document.getElementById('replayCanvas');
    var container = document.getElementById('replayBoardContainer');
    var dim = Math.min(container.clientWidth, 400);
    rc.width = dim; rc.height = dim;
    drawReplay();
    updateReplayStep();
  }
  function showHint(text, type) {
    var el = document.getElementById('tutorialHint');
    if (!el) return;
    el.textContent = text;
    el.className = 'tutorial-hint show hint-' + (type || 'ok');
    clearTimeout(hintTimer);
    // 好棋提示短一點，警告長一點
    var duration = (type === 'good' || type === 'ok') ? 6000 : 12000;
    hintTimer = setTimeout(function() { el.classList.remove('show'); }, duration);
  }
  function hideHint() {
    var el = document.getElementById('tutorialHint');
    if (el) { el.classList.remove('show'); el.textContent = ''; }
    clearTimeout(hintTimer);
  }

  function initMusicSelector() {
    var container = document.getElementById('musicSelector');
    if (!container) return;
    var cats = BGM.getCategories();
    var tracks = BGM.getTracks();
    var catTracks = BGM.getCatTracks();
    container.innerHTML = '';

    // Helper: make element tap-friendly on mobile
    // Records touchstart pos, on touchend checks if finger moved < 10px (tap vs scroll)
    var _touchY = 0;
    function addTap(el, fn) {
      el.addEventListener('click', function(e) { e.preventDefault(); fn(); });
      el.addEventListener('touchstart', function(e) {
        _touchY = e.changedTouches[0].clientY;
      }, {passive: true});
      el.addEventListener('touchend', function(e) {
        var dy = Math.abs(e.changedTouches[0].clientY - _touchY);
        if (dy < 10) { e.preventDefault(); fn(); }
      });
    }

    // Category tabs row
    var tabRow = document.createElement('div');
    tabRow.className = 'bgm-tabs';
    Object.keys(cats).forEach(function(key) {
      var c = cats[key];
      var btn = document.createElement('button');
      btn.className = 'bgm-cat' + (key === BGM.getCategory() ? ' active' : '');
      btn.dataset.cat = key;
      btn.innerHTML = c.icon + ' ' + c.name + ' <span class="bgm-cnt">' + (catTracks[key]||[]).length + '</span>';
      addTap(btn, function() {
        tabRow.querySelectorAll('.bgm-cat').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        BGM.setCategory(key);
        Sound.click();
        renderTracks(key);
      });
      tabRow.appendChild(btn);
    });
    container.appendChild(tabRow);

    // Controls row (shuffle + now playing + prev/next)
    var ctrl = document.createElement('div');
    ctrl.className = 'bgm-ctrl';
    ctrl.innerHTML = '<button class="bgm-btn" id="bgmShuffle" title="隨機">🔀</button>'
      + '<button class="bgm-btn" id="bgmPrev" title="上一首">⏮</button>'
      + '<span class="bgm-now" id="bgmNowPlaying">未播放</span>'
      + '<button class="bgm-btn" id="bgmNext" title="下一首">⏭</button>';
    container.appendChild(ctrl);

    var shuffleBtn = document.getElementById('bgmShuffle');
    addTap(shuffleBtn, function() {
      BGM.setShuffle(!BGM.isShuffle());
      shuffleBtn.style.opacity = BGM.isShuffle() ? '1' : '0.4';
      Sound.click();
    });
    addTap(document.getElementById('bgmPrev'), function() { BGM.prev(); Sound.click(); });
    addTap(document.getElementById('bgmNext'), function() { BGM.next(); Sound.click(); });

    // Track list
    var list = document.createElement('div');
    list.className = 'bgm-list';
    list.id = 'bgmTrackList';
    container.appendChild(list);

    function renderTracks(cat) {
      var indices = catTracks[cat] || [];
      list.innerHTML = '';
      indices.forEach(function(idx) {
        var t = tracks[idx];
        var item = document.createElement('div');
        item.className = 'bgm-track' + (BGM.isPlaying() && idx === BGM.getCurrentIdx() ? ' active' : '');
        item.dataset.idx = idx;
        item.textContent = t.name;
        addTap(item, function() {
          BGM.playTrack(idx);
          Sound.click();
        });
        list.appendChild(item);
      });
    }
    renderTracks(BGM.getCategory());
  }


  document.addEventListener('DOMContentLoaded', init);

  return {
    showMenu: showMenu,
    showSingleSetup: showSingleSetup,
    showMultiplayer: showMultiplayer,
    startSingleGame: startSingleGame,
    updateTurn: updateTurn,
    showWin: showWin,
    rematch: rematch,
    confirmExit: confirmExit,
    toggleNumbers: toggleNumbers,
    showReplay: showReplay,
    closeReplay: closeReplay,
    replayStep: replayStep,
    showAnalysis: showAnalysis,
    closeAnalysis: closeAnalysis,
    showHistory: showHistory,
    closeHistory: closeHistory,
    clearHistory: clearHistory,
    showHint: showHint,
    hideHint: hideHint,
    updateTimer: updateTimer
  };
})();

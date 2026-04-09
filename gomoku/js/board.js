/**
 * board.js — Canvas 棋盤繪製（Premium Visual Edition）
 */
var Board = (function() {
  var SIZE = 15;
  var canvas, ctx;
  var cellSize = 0;
  var padding = 0;
  var boardPx = 0;
  var showNumbers = false;
  var hoverPos = null;
  var lastMove = null;
  var winLine = null;
  var boardData = null;
  var movesData = null;
  var hintPos = null;
  var confirmPos = null;

  // 星位
  var stars = [[3,3],[3,11],[7,7],[11,3],[11,11]];

  // 預渲染的木紋紋理
  var woodPattern = null;
  var woodCanvas = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    createWoodTexture();
    resize();
  }

  // 生成木紋紋理（離屏 canvas，只做一次）
  function createWoodTexture() {
    woodCanvas = document.createElement('canvas');
    woodCanvas.width = 800;
    woodCanvas.height = 800;
    var wctx = woodCanvas.getContext('2d');

    // 基底色 — 溫暖的木頭色
    var baseGrad = wctx.createLinearGradient(0, 0, 800, 800);
    baseGrad.addColorStop(0, '#c8a45c');
    baseGrad.addColorStop(0.3, '#d4ad62');
    baseGrad.addColorStop(0.5, '#c09a50');
    baseGrad.addColorStop(0.7, '#d0a858');
    baseGrad.addColorStop(1, '#b89848');
    wctx.fillStyle = baseGrad;
    wctx.fillRect(0, 0, 800, 800);

    // 木紋線條
    wctx.globalAlpha = 0.08;
    for (var i = 0; i < 60; i++) {
      var y = Math.random() * 800;
      var curve = Math.random() * 20 - 10;
      wctx.strokeStyle = Math.random() > 0.5 ? '#8b6914' : '#a07828';
      wctx.lineWidth = 0.5 + Math.random() * 2;
      wctx.beginPath();
      wctx.moveTo(0, y);
      for (var x = 0; x < 800; x += 20) {
        y += curve * 0.1 + (Math.random() - 0.5) * 3;
        wctx.lineTo(x, y);
      }
      wctx.stroke();
    }
    wctx.globalAlpha = 1;

    // 微妙的噪點紋理
    var imgData = wctx.getImageData(0, 0, 800, 800);
    var d = imgData.data;
    for (var p = 0; p < d.length; p += 4) {
      var noise = (Math.random() - 0.5) * 12;
      d[p] += noise;
      d[p+1] += noise;
      d[p+2] += noise * 0.7;
    }
    wctx.putImageData(imgData, 0, 0);
  }

  function resize() {
    if (!canvas) return;
    var container = canvas.parentElement;
    var w = container.clientWidth;
    var h = container.clientHeight;
    var dim = Math.min(w, h) - 16;
    dim = Math.min(dim, 600);
    dim = Math.max(dim, 200);
    canvas.width = dim;
    canvas.height = dim;
    canvas.style.width = dim + 'px';
    canvas.style.height = dim + 'px';
    padding = dim * 0.07;
    boardPx = dim - padding * 2;
    cellSize = boardPx / (SIZE - 1);
    draw();
  }

  function toCanvas(gx, gy) {
    return { x: padding + gx * cellSize, y: padding + gy * cellSize };
  }

  function toGrid(cx, cy) {
    var gx = Math.round((cx - padding) / cellSize);
    var gy = Math.round((cy - padding) / cellSize);
    if (gx < 0 || gx >= SIZE || gy < 0 || gy >= SIZE) return null;
    return { x: gx, y: gy };
  }

  function draw() {
    if (!ctx) return;
    var w = canvas.width, h = canvas.height;

    // === 木紋背景 ===
    if (woodCanvas) {
      ctx.drawImage(woodCanvas, 0, 0, 800, 800, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#c8a45c';
      ctx.fillRect(0, 0, w, h);
    }

    // 棋盤邊框（深色木邊）
    var edgeInset = padding * 0.35;
    ctx.strokeStyle = 'rgba(80,50,10,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(edgeInset, edgeInset, w - edgeInset * 2, h - edgeInset * 2);

    // 內框微光
    ctx.strokeStyle = 'rgba(255,220,150,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(edgeInset + 2, edgeInset + 2, w - edgeInset * 2 - 4, h - edgeInset * 2 - 4);

    // === 格線 ===
    ctx.strokeStyle = 'rgba(40,25,5,0.55)';
    ctx.lineWidth = 1;
    for (var i = 0; i < SIZE; i++) {
      var p1 = toCanvas(i, 0), p2 = toCanvas(i, SIZE - 1);
      ctx.beginPath(); ctx.moveTo(Math.round(p1.x) + 0.5, Math.round(p1.y)); ctx.lineTo(Math.round(p2.x) + 0.5, Math.round(p2.y)); ctx.stroke();
      p1 = toCanvas(0, i); p2 = toCanvas(SIZE - 1, i);
      ctx.beginPath(); ctx.moveTo(Math.round(p1.x), Math.round(p1.y) + 0.5); ctx.lineTo(Math.round(p2.x), Math.round(p2.y) + 0.5); ctx.stroke();
    }

    // 外框粗線
    ctx.strokeStyle = 'rgba(40,25,5,0.7)';
    ctx.lineWidth = 2;
    var tl = toCanvas(0, 0), br = toCanvas(SIZE - 1, SIZE - 1);
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // === 星位 ===
    ctx.fillStyle = 'rgba(40,25,5,0.7)';
    for (var s = 0; s < stars.length; s++) {
      var sp = toCanvas(stars[s][0], stars[s][1]);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, cellSize * 0.12, 0, Math.PI * 2); ctx.fill();
    }

    // === 座標 ===
    var coordSize = Math.max(cellSize * 0.32, 10);
    ctx.font = '700 ' + coordSize + 'px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < SIZE; i++) {
      var tp = toCanvas(i, 0);
      // 上方字母 A-O
      ctx.fillStyle = 'rgba(50,28,5,0.85)';
      ctx.fillText(String.fromCharCode(65 + i), tp.x, padding * 0.42);
      // 左側數字 1-15
      var lp = toCanvas(0, i);
      ctx.fillText(String(i + 1), padding * 0.38, lp.y);
    }

    // === 棋子 ===
    if (boardData) {
      var moveIndex = {};
      if (movesData) {
        for (var m = 0; m < movesData.length; m++) {
          moveIndex[movesData[m].x + ',' + movesData[m].y] = m + 1;
        }
      }
      for (var gx = 0; gx < SIZE; gx++) {
        for (var gy = 0; gy < SIZE; gy++) {
          var v = boardData[gy][gx];
          if (v !== 0) drawStone(gx, gy, v === 1 ? 'black' : 'white', moveIndex[gx + ',' + gy]);
        }
      }
    }

    // === 最後一手標記 ===
    if (lastMove && boardData) {
      var lp = toCanvas(lastMove.x, lastMove.y);
      var isBlack = boardData[lastMove.y][lastMove.x] === 1;
      ctx.fillStyle = isBlack ? '#ff4444' : '#ff4444';
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, cellSize * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // === 勝利連線 ===
    if (winLine) {
      drawWinLine();
    }

    // === Tutorial hint (pulsing green) ===
    if (hintPos && boardData && boardData[hintPos.y] && boardData[hintPos.y][hintPos.x] === 0 && !winLine) {
      var hp2 = toCanvas(hintPos.x, hintPos.y);
      var r2 = cellSize * 0.42;
      var pulse = 0.4 + 0.35 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      // 半透明綠色填充
      ctx.fillStyle = 'rgba(76,175,80,0.2)';
      ctx.beginPath(); ctx.arc(hp2.x, hp2.y, r2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4caf50';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(hp2.x, hp2.y, r2, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // === Touch confirm preview ===
    if (confirmPos && boardData && boardData[confirmPos.y][confirmPos.x] === 0 && !winLine) {
      drawConfirmPreview();
    }

    // === Hover 預覽 ===
    if (hoverPos && !confirmPos && boardData && boardData[hoverPos.y][hoverPos.x] === 0 && !winLine) {
      drawHoverPreview();
    }
  }

  // === 繪製棋子（3D 擬真） ===
  function drawStone(gx, gy, color, moveNum) {
    var p = toCanvas(gx, gy);
    var r = cellSize * 0.44;

    // 陰影
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = cellSize * 0.15;
    ctx.shadowOffsetX = cellSize * 0.04;
    ctx.shadowOffsetY = cellSize * 0.06;

    if (color === 'black') {
      // 黑子 — 深色漸層 + 光澤
      var grad = ctx.createRadialGradient(
        p.x - r * 0.35, p.y - r * 0.35, r * 0.05,
        p.x + r * 0.1, p.y + r * 0.1, r
      );
      grad.addColorStop(0, '#555');
      grad.addColorStop(0.4, '#2a2a2a');
      grad.addColorStop(0.85, '#111');
      grad.addColorStop(1, '#000');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // 高光
      ctx.save();
      ctx.globalAlpha = 0.5;
      var hlGrad = ctx.createRadialGradient(
        p.x - r * 0.3, p.y - r * 0.35, r * 0.02,
        p.x - r * 0.3, p.y - r * 0.35, r * 0.45
      );
      hlGrad.addColorStop(0, 'rgba(255,255,255,0.6)');
      hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hlGrad;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // 邊緣微光
      ctx.strokeStyle = 'rgba(100,100,120,0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    } else {
      // 白子 — 明亮漸層 + 光澤
      var grad = ctx.createRadialGradient(
        p.x - r * 0.35, p.y - r * 0.35, r * 0.05,
        p.x + r * 0.1, p.y + r * 0.1, r
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, '#f5f5f0');
      grad.addColorStop(0.7, '#e0ddd5');
      grad.addColorStop(1, '#c8c4b8');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // 高光
      ctx.save();
      ctx.globalAlpha = 0.7;
      var hlGrad = ctx.createRadialGradient(
        p.x - r * 0.3, p.y - r * 0.35, r * 0.02,
        p.x - r * 0.3, p.y - r * 0.35, r * 0.4
      );
      hlGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
      hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hlGrad;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // 邊緣陰影
      ctx.strokeStyle = 'rgba(120,110,90,0.3)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    }

    // 手數編號
    if (showNumbers && moveNum) {
      ctx.fillStyle = color === 'black' ? '#ddd' : '#222';
      ctx.font = 'bold ' + (cellSize * 0.3) + 'px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(moveNum), p.x, p.y + 1);
    }
  }

  // === 勝利連線動畫 ===
  function drawWinLine() {
    if (!winLine || winLine.length < 2) return;
    var p0 = toCanvas(winLine[0].x, winLine[0].y);
    var pN = toCanvas(winLine[winLine.length - 1].x, winLine[winLine.length - 1].y);

    // 發光連線
    ctx.save();
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = cellSize * 0.12;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur = 15;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(pN.x, pN.y); ctx.stroke();
    ctx.restore();

    // 內線
    ctx.save();
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = cellSize * 0.05;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(pN.x, pN.y); ctx.stroke();
    ctx.restore();

    // 高亮棋子外圈
    for (var w = 0; w < winLine.length; w++) {
      var wp = toCanvas(winLine[w].x, winLine[w].y);
      ctx.save();
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(wp.x, wp.y, cellSize * 0.48, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // === Touch confirm 預覽 ===
  function drawConfirmPreview() {
    var cp = toCanvas(confirmPos.x, confirmPos.y);
    var cr = cellSize * 0.44;
    var pulse = 0.55 + 0.25 * Math.sin(Date.now() / 350);

    ctx.save();
    ctx.globalAlpha = pulse;
    var isBlack = Game && Game.currentColor !== 'white';
    if (isBlack) {
      var g = ctx.createRadialGradient(cp.x - cr * 0.3, cp.y - cr * 0.3, cr * 0.05, cp.x, cp.y, cr);
      g.addColorStop(0, '#444'); g.addColorStop(1, '#111');
      ctx.fillStyle = g;
    } else {
      var g = ctx.createRadialGradient(cp.x - cr * 0.3, cp.y - cr * 0.3, cr * 0.05, cp.x, cp.y, cr);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#ccc');
      ctx.fillStyle = g;
    }
    ctx.beginPath(); ctx.arc(cp.x, cp.y, cr, 0, Math.PI * 2); ctx.fill();

    // 綠色確認圈
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(cp.x, cp.y, cr + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // ✓ 符號
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold ' + (cellSize * 0.35) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✓', cp.x, cp.y);
  }

  // === Hover 預覽 ===
  function drawHoverPreview() {
    var hp = toCanvas(hoverPos.x, hoverPos.y);
    var r = cellSize * 0.44;
    ctx.save();
    ctx.globalAlpha = 0.3;
    var isBlack = Game && Game.currentColor !== 'white';
    if (isBlack) {
      var g = ctx.createRadialGradient(hp.x - r * 0.3, hp.y - r * 0.3, r * 0.05, hp.x, hp.y, r);
      g.addColorStop(0, '#444'); g.addColorStop(1, '#111');
      ctx.fillStyle = g;
    } else {
      var g = ctx.createRadialGradient(hp.x - r * 0.3, hp.y - r * 0.3, r * 0.05, hp.x, hp.y, r);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#ccc');
      ctx.fillStyle = g;
    }
    ctx.beginPath(); ctx.arc(hp.x, hp.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function setBoard(data, moves) { boardData = data; movesData = moves; }
  function setLastMove(pos) { lastMove = pos; }
  function setWinLine(line) { winLine = line; }
  function setHover(pos) { hoverPos = pos; }
  function setShowNumbers(v) { showNumbers = v; }
  function setHintPos(pos) { hintPos = pos; }
  function setConfirmPos(pos) { confirmPos = pos; }
  function getConfirmPos() { return confirmPos; }

  function getClickPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx, cy;
    if (e.touches && e.touches.length > 0) {
      cx = e.touches[0].clientX - rect.left;
      cy = e.touches[0].clientY - rect.top;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      cx = e.changedTouches[0].clientX - rect.left;
      cy = e.changedTouches[0].clientY - rect.top;
    } else {
      cx = e.clientX - rect.left;
      cy = e.clientY - rect.top;
    }
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    cx *= scaleX;
    cy *= scaleY;
    return toGrid(cx, cy);
  }

  return {
    SIZE: SIZE,
    init: init, resize: resize, draw: draw,
    setBoard: setBoard, setLastMove: setLastMove, setWinLine: setWinLine,
    setHover: setHover, setShowNumbers: setShowNumbers, setHintPos: setHintPos,
    setConfirmPos: setConfirmPos, getConfirmPos: getConfirmPos,
    getClickPos: getClickPos, toCanvas: toCanvas,
    get cellSize() { return cellSize; },
    get canvas() { return canvas; }
  };
})();

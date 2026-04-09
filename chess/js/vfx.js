// Chinese Chess VFX — Animations & Particle Effects
var VFX = (function() {
  'use strict';

  var canvas, ctx;
  var particles = [];
  var animations = []; // {type, startTime, duration, data}
  var rafId = null;
  var running = false;

  function init(c, context) { canvas = c; ctx = context; }

  // === Particle System ===
  function addParticle(p) { particles.push(p); startLoop(); }

  function spawnCapture(x, y, color) {
    var isRed = color === 'r';
    for (var i = 0; i < 20; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1.5 + Math.random() * 4;
      var size = 2 + Math.random() * 4;
      particles.push({
        x: x, y: y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 1,
        size: size, life: 1, decay: 0.015 + Math.random()*0.02,
        color: isRed ? 'rgba(200,30,30,' : 'rgba(60,60,60,',
        type: 'fragment', rotation: Math.random()*6.28, rotSpeed: (Math.random()-0.5)*0.3
      });
    }
    // Shockwave ring
    animations.push({ type:'ring', x:x, y:y, startTime:Date.now(), duration:400, maxR:60, color: isRed?'rgba(255,80,80,':'rgba(120,120,120,' });
    startLoop();
  }

  function spawnCheck(x, y) {
    animations.push({ type:'checkPulse', x:x, y:y, startTime:Date.now(), duration:1500 });
    startLoop();
  }

  // Move animation: piece slides from A to B
  var moveAnim = null;
  function animateMove(fromPx, toPx, piece, duration, onDone) {
    moveAnim = { from:fromPx, to:toPx, piece:piece, start:Date.now(), dur:duration||250, onDone:onDone };
    startLoop();
  }
  function getMoveAnim() { return moveAnim; }

  // Selected piece float animation
  var floatPhase = 0;
  function getFloatOffset() {
    floatPhase += 0.08;
    return Math.sin(floatPhase) * 2.5;
  }

  // === Render Loop ===
  function startLoop() { if (!running) { running = true; loop(); } }

  function loop() {
    if (!running) return;
    var hasWork = false;

    // Update & draw particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; // gravity
      p.life -= p.decay;
      if (p.rotation !== undefined) p.rotation += p.rotSpeed;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      hasWork = true;
      ctx.save();
      ctx.globalAlpha = p.life;
      if (p.type === 'fragment') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation || 0);
        ctx.fillStyle = p.color + p.life + ')';
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      }
      ctx.restore();
    }

    // Update & draw animations
    var now = Date.now();
    for (var j = animations.length - 1; j >= 0; j--) {
      var a = animations[j];
      var t = (now - a.startTime) / a.duration;
      if (t > 1) { animations.splice(j, 1); continue; }
      hasWork = true;

      if (a.type === 'ring') {
        var r = a.maxR * t;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI*2);
        ctx.strokeStyle = a.color + (1-t)*0.6 + ')';
        ctx.lineWidth = 3 * (1-t);
        ctx.stroke();
      }

      if (a.type === 'checkPulse') {
        var pulse = Math.sin(t * Math.PI * 3) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 30 + pulse*8, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,40,40,' + (0.5 * (1-t)) + ')';
        ctx.lineWidth = 2 + pulse*2;
        ctx.stroke();
        // Inner glow
        var glow = ctx.createRadialGradient(a.x, a.y, 10, a.x, a.y, 35);
        glow.addColorStop(0, 'rgba(255,0,0,' + 0.15*(1-t) + ')');
        glow.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fill();
      }
    }

    // Move animation
    if (moveAnim) {
      var mt = (now - moveAnim.start) / moveAnim.dur;
      if (mt >= 1) {
        var cb = moveAnim.onDone;
        moveAnim = null;
        if (cb) cb();
      } else {
        hasWork = true;
      }
    }

    if (hasWork) {
      rafId = requestAnimationFrame(function() {
        // Redraw board then overlay VFX
        if (typeof Board !== 'undefined') Board.draw();
        loop();
      });
    } else {
      running = false;
    }
  }

  function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); particles=[]; animations=[]; moveAnim=null; }

  // Easing: ease-out cubic
  function easeOut(t) { return 1 - Math.pow(1-t, 3); }

  function getMoveAnimProgress() {
    if (!moveAnim) return null;
    var t = Math.min(1, (Date.now() - moveAnim.start) / moveAnim.dur);
    var e = easeOut(t);
    return {
      x: moveAnim.from.x + (moveAnim.to.x - moveAnim.from.x) * e,
      y: moveAnim.from.y + (moveAnim.to.y - moveAnim.from.y) * e - Math.sin(t*Math.PI)*12, // arc
      piece: moveAnim.piece,
      t: t
    };
  }

  return {
    init: init, spawnCapture: spawnCapture, spawnCheck: spawnCheck,
    animateMove: animateMove, getMoveAnim: getMoveAnim, getMoveAnimProgress: getMoveAnimProgress,
    getFloatOffset: getFloatOffset, stop: stop, startLoop: startLoop
  };
})();

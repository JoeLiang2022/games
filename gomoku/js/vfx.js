/**
 * vfx.js — 五子棋粒子特效（Premium Edition）
 */
var VFX = (function() {
  var canvas, ctx;
  var particles = [];
  var animId = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
  }

  function resize() {
    if (!canvas) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }

  // 落子粒子爆發
  function placeEffect(x, y, color) {
    var hue = color === 'black' ? 200 : 45;
    for (var i = 0; i < 16; i++) {
      var angle = (Math.PI * 2 / 16) * i + Math.random() * 0.3;
      var speed = 2 + Math.random() * 4;
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.015 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        hue: hue + Math.random() * 30 - 15,
        type: 'circle'
      });
    }
    // 小星星
    for (var j = 0; j < 6; j++) {
      var a2 = Math.random() * Math.PI * 2;
      var sp2 = 1 + Math.random() * 2;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a2) * sp2,
        vy: Math.sin(a2) * sp2 - 1,
        life: 1,
        decay: 0.01 + Math.random() * 0.01,
        size: 3 + Math.random() * 3,
        hue: hue,
        type: 'star'
      });
    }
    if (!animId) tick();
  }

  // 勝利煙火（多波次）
  function winEffect() {
    if (!canvas) return;
    var w = canvas.width, h = canvas.height;
    function burst(delay) {
      setTimeout(function() {
        var cx = w * 0.15 + Math.random() * w * 0.7;
        var cy = h * 0.15 + Math.random() * h * 0.45;
        var hue = Math.random() * 360;
        // 主爆發
        for (var i = 0; i < 50; i++) {
          var angle = (Math.PI * 2 / 50) * i + Math.random() * 0.15;
          var speed = 3 + Math.random() * 6;
          particles.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: 0.006 + Math.random() * 0.008,
            size: 2 + Math.random() * 4,
            hue: hue + Math.random() * 50,
            type: Math.random() > 0.7 ? 'star' : 'circle'
          });
        }
        // 拖尾火花
        for (var j = 0; j < 15; j++) {
          var a2 = Math.random() * Math.PI * 2;
          particles.push({
            x: cx, y: cy,
            vx: Math.cos(a2) * (1 + Math.random() * 2),
            vy: Math.sin(a2) * (1 + Math.random() * 2) - 2,
            life: 1,
            decay: 0.004 + Math.random() * 0.006,
            size: 1 + Math.random() * 2,
            hue: hue + 30,
            type: 'trail'
          });
        }
        if (!animId) tick();
      }, delay);
    }
    burst(0);
    burst(250);
    burst(500);
    burst(800);
    burst(1200);
  }

  function drawStar(x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = (Math.PI * 2 / 5) * i - Math.PI / 2;
      var ox = x + Math.cos(a) * r;
      var oy = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
      a += Math.PI * 2 / 10;
      ox = x + Math.cos(a) * r * 0.4;
      oy = y + Math.sin(a) * r * 0.4;
      ctx.lineTo(ox, oy);
    }
    ctx.closePath();
    ctx.fill();
  }

  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.vx *= 0.995;
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }

      ctx.globalAlpha = p.life * p.life;
      ctx.fillStyle = 'hsl(' + p.hue + ',90%,65%)';

      if (p.type === 'star') {
        drawStar(p.x, p.y, p.size * p.life);
      } else if (p.type === 'trail') {
        ctx.fillStyle = 'hsl(' + p.hue + ',80%,80%)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (particles.length > 0) {
      animId = requestAnimationFrame(tick);
    } else {
      animId = null;
    }
  }

  function clear() {
    particles = [];
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { init: init, resize: resize, placeEffect: placeEffect, winEffect: winEffect, clear: clear };
})();

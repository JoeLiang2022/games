// Chinese Chess Sound Effects — Web Audio API
var Sound = (function() {
  'use strict';
  var ctx = null;
  var enabled = true;

  function getCtx() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
    return ctx;
  }

  function play(fn) {
    if (!enabled) return;
    var c = getCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    try { fn(c); } catch(e) {}
  }

  // Wood piece placement — short thud
  function move() {
    play(function(c) {
      var t = c.currentTime;
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t); osc.stop(t + 0.12);
      // Noise burst for wood texture
      var buf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.15;
      var noise = c.createBufferSource(); noise.buffer = buf;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.2, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      noise.connect(ng); ng.connect(c.destination);
      noise.start(t); noise.stop(t + 0.06);
    });
  }

  // Capture — heavier impact
  function capture() {
    play(function(c) {
      var t = c.currentTime;
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(250, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t); osc.stop(t + 0.2);
      // Crack noise
      var buf = c.createBuffer(1, c.sampleRate * 0.08, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
      var noise = c.createBufferSource(); noise.buffer = buf;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.35, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      noise.connect(ng); ng.connect(c.destination);
      noise.start(t); noise.stop(t + 0.1);
    });
  }

  // Check — alert tone
  function check() {
    play(function(c) {
      var t = c.currentTime;
      [440, 550, 660].forEach(function(f, i) {
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.15, t + i*0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i*0.1 + 0.15);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t + i*0.1); osc.stop(t + i*0.1 + 0.15);
      });
    });
  }

  // Select piece — soft click
  function select() {
    play(function(c) {
      var t = c.currentTime;
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = 'sine'; osc.frequency.value = 600;
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t); osc.stop(t + 0.06);
    });
  }

  // Win — triumphant arpeggio
  function win() {
    play(function(c) {
      var t = c.currentTime;
      [523, 659, 784, 1047].forEach(function(f, i) {
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.2, t + i*0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i*0.15 + 0.4);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t + i*0.15); osc.stop(t + i*0.15 + 0.4);
      });
    });
  }

  // Lose — descending tones
  function lose() {
    play(function(c) {
      var t = c.currentTime;
      [400, 350, 300, 250].forEach(function(f, i) {
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.15, t + i*0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i*0.2 + 0.3);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t + i*0.2); osc.stop(t + i*0.2 + 0.3);
      });
    });
  }

  // Draw — neutral chord
  function drawSound() {
    play(function(c) {
      var t = c.currentTime;
      [330, 392].forEach(function(f) {
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t); osc.stop(t + 0.6);
      });
    });
  }

  function toggle() { enabled = !enabled; return enabled; }
  function isEnabled() { return enabled; }

  return { move:move, capture:capture, check:check, select:select, win:win, lose:lose, drawSound:drawSound, toggle:toggle, isEnabled:isEnabled };
})();

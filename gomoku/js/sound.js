/**
 * sound.js — 五子棋音效管理 v2
 * Web Audio API 合成音效，不需外部檔案
 */
var Sound = (function() {
  var enabled = true;
  var ctx = null;
  var volume = 0.3;

  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, delay) {
    if (!enabled) return;
    var c = getCtx(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    var v = (vol || 1) * volume;
    gain.gain.setValueAtTime(v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t); osc.stop(t + dur);
  }

  function noise(dur, vol, delay) {
    if (!enabled) return;
    var c = getCtx(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var len = c.sampleRate * dur;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    var src = c.createBufferSource();
    src.buffer = buf;
    var gain = c.createGain();
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.5;
    var v = (vol || 0.3) * volume;
    gain.gain.setValueAtTime(v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(c.destination);
    src.start(t); src.stop(t + dur);
  }

  // 落子音效 — 清脆的「啪」聲
  function place() {
    noise(0.06, 0.5);
    tone(800, 0.08, 'sine', 0.4);
    tone(1200, 0.05, 'sine', 0.2, 0.02);
  }

  // 勝利音效 — 上行琶音 + 和弦
  function win() {
    var notes = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
    notes.forEach(function(f, i) {
      tone(f, 0.4, 'triangle', 0.3, i * 0.1);
    });
    // 最後和弦
    setTimeout(function() {
      tone(523, 0.8, 'sine', 0.2);
      tone(659, 0.8, 'sine', 0.15);
      tone(784, 0.8, 'sine', 0.15);
    }, 600);
  }

  // UI 點擊音效
  function click() { tone(600, 0.05, 'sine', 0.2); }

  // 悔棋音效
  function undo() {
    tone(600, 0.1, 'sine', 0.2);
    tone(400, 0.1, 'sine', 0.2, 0.08);
  }

  function toggle() {
    enabled = !enabled;
    var btn = document.getElementById('btnSound');
    if (btn) btn.textContent = enabled ? '🔊' : '🔇';
  }

  function setVolume(v) { volume = Math.max(0, Math.min(1, v)); }

  return {
    place: place, win: win, click: click, undo: undo,
    toggle: toggle, setVolume: setVolume, getCtx: getCtx,
    get enabled() { return enabled; }
  };
})();

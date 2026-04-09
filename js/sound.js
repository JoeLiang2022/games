/**
 * sound.js v28 — audio files + Web Audio synth for action sounds
 */
const SFX = (function() {
  let enabled = true;
  const cache = {};
  let audioCtx = null;
  const SOUNDS = {
    draw:'sounds/draw.wav', discard:'sounds/discard.wav',
    flower:'sounds/flower.wav', select:'sounds/select.wav',
    start:'sounds/start.wav', end:'sounds/end.wav', dice:'sounds/dice.wav'
  };
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(ctx, gain, freq, t, dur) {
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t); o.connect(gain);
    o.start(t); o.stop(t + dur);
  }
  function synthPlay(type) {
    if (!enabled) return;
    try {
      var ctx = getCtx(), now = ctx.currentTime;
      var g = ctx.createGain(); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.4, now);
      if (type === 'pong') {
        tone(ctx,g,440,now,0.08); tone(ctx,g,520,now+0.1,0.08);
        g.gain.setValueAtTime(0.4,now+0.2);
        g.gain.linearRampToValueAtTime(0,now+0.25);
      } else if (type === 'kong') {
        tone(ctx,g,400,now,0.07); tone(ctx,g,500,now+0.08,0.07);
        tone(ctx,g,630,now+0.16,0.1);
        g.gain.setValueAtTime(0.4,now+0.28);
        g.gain.linearRampToValueAtTime(0,now+0.35);
      } else if (type === 'chow') {
        var o = ctx.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(350,now);
        o.frequency.linearRampToValueAtTime(550,now+0.15);
        o.connect(g); o.start(now); o.stop(now+0.18);
        g.gain.setValueAtTime(0.35,now+0.18);
        g.gain.linearRampToValueAtTime(0,now+0.22);
      } else if (type === 'win') {
        tone(ctx,g,523,now,0.3); tone(ctx,g,659,now+0.05,0.3);
        tone(ctx,g,784,now+0.1,0.3); tone(ctx,g,1047,now+0.15,0.4);
        g.gain.setValueAtTime(0.5,now+0.5);
        g.gain.linearRampToValueAtTime(0,now+0.8);
      } else if (type === 'robkong') {
        tone(ctx,g,600,now,0.1); tone(ctx,g,800,now+0.08,0.15);
        tone(ctx,g,1000,now+0.18,0.2);
        g.gain.setValueAtTime(0.5,now+0.4);
        g.gain.linearRampToValueAtTime(0,now+0.5);
      }
    } catch(e) {}
  }
  function preload() {
    for (var k in SOUNDS) {
      var a = new Audio(SOUNDS[k]); a.preload='auto'; a.volume=0.7; cache[k]=a;
    }
  }
  function play(type) {
    if (!enabled) return;
    if (['pong','kong','chow','win','robkong'].indexOf(type) >= 0) {
      synthPlay(type); return;
    }
    var s = cache[type]; if (!s) return;
    try { var a = s.cloneNode(); a.volume = s.volume; a.play().catch(function(){}); } catch(e) {}
  }
  function toggle() { enabled = !enabled; return enabled; }
  function isEnabled() { return enabled; }
  var pl = false;
  function ep() { if (pl) return; pl = true; preload(); try { getCtx(); } catch(e) {} }
  document.addEventListener('click', ep, { once: true });
  document.addEventListener('touchstart', ep, { once: true });
  if (document.readyState === 'complete') preload();
  else window.addEventListener('load', preload);
  return { play:play, toggle:toggle, isEnabled:isEnabled, preload:preload };
})();

// Chinese Chess Theme System
var Themes = (function() {
  'use strict';

  var current = 'classic';

  var THEMES = {
    classic: {
      name: '經典木紋',
      board: { bg1:'#deb068', bg2:'#d4a050', bg3:'#c89848', bg4:'#d0a458',
        line:'#3a2008', frame1:'#3a2008', frame2:'#6a4a1a', river:'#5a3a10',
        grainColor:'#6a4a1a', grainAlpha:0.08 },
      piece: {
        edge1:'#6a4018', edge2:'#8a5828', shadow:'rgba(0,0,0,0.4)',
        face: ['#ffe8c0','#f0d898','#d4a858','#b08030'],
        bevelTop:'rgba(255,255,240,0.55)', bevelBot:'rgba(0,0,0,0.18)',
        specular:'rgba(255,255,255,0.5)',
        groove:'rgba(80,50,10,0.45)',
        redRing:'rgba(170,15,15,0.65)', blackRing:'rgba(25,25,25,0.55)',
        redText:'#a80808', blackText:'#151515',
        engraveLt:'rgba(255,255,240,0.35)', engraveDk:'rgba(0,0,0,0.18)'
      }
    },
    jade: {
      name: '翡翠玉石',
      board: { bg1:'#2a3a2a', bg2:'#1e2e1e', bg3:'#243424', bg4:'#2a3a28',
        line:'#4a6a4a', frame1:'#1a2a1a', frame2:'#3a5a3a', river:'#5a8a5a',
        grainColor:'#3a5a3a', grainAlpha:0.06 },
      piece: {
        edge1:'#1a4a2a', edge2:'#2a6a3a', shadow:'rgba(0,0,0,0.5)',
        face: ['#c8f0d0','#88d898','#58b868','#389848'],
        bevelTop:'rgba(200,255,220,0.5)', bevelBot:'rgba(0,0,0,0.2)',
        specular:'rgba(255,255,255,0.55)',
        groove:'rgba(20,60,30,0.5)',
        redRing:'rgba(220,60,60,0.7)', blackRing:'rgba(200,200,200,0.5)',
        redText:'#dd2020', blackText:'#f0f0f0',
        engraveLt:'rgba(200,255,220,0.3)', engraveDk:'rgba(0,0,0,0.2)'
      }
    },
    ink: {
      name: '水墨丹青',
      board: { bg1:'#f5f0e8', bg2:'#ebe5d8', bg3:'#e0d8c8', bg4:'#e8e0d0',
        line:'#4a4a4a', frame1:'#2a2a2a', frame2:'#6a6a6a', river:'#5a5a5a',
        grainColor:'#8a8a7a', grainAlpha:0.04 },
      piece: {
        edge1:'#3a3a3a', edge2:'#5a5a5a', shadow:'rgba(0,0,0,0.35)',
        face: ['#f8f4f0','#e8e4e0','#d0ccc8','#b0aca8'],
        bevelTop:'rgba(255,255,255,0.5)', bevelBot:'rgba(0,0,0,0.15)',
        specular:'rgba(255,255,255,0.4)',
        groove:'rgba(60,60,60,0.4)',
        redRing:'rgba(180,40,40,0.6)', blackRing:'rgba(40,40,40,0.5)',
        redText:'#8a1010', blackText:'#1a1a1a',
        engraveLt:'rgba(255,255,255,0.3)', engraveDk:'rgba(0,0,0,0.15)'
      }
    },
    neon: {
      name: '霓虹科技',
      board: { bg1:'#0a0a1a', bg2:'#0a0a18', bg3:'#080816', bg4:'#0a0a1a',
        line:'#1a3a6a', frame1:'#0a1a3a', frame2:'#1a2a5a', river:'#2a4a8a',
        grainColor:'#1a2a4a', grainAlpha:0.1 },
      piece: {
        edge1:'#0a1a3a', edge2:'#1a2a5a', shadow:'rgba(0,100,255,0.3)',
        face: ['#1a2a4a','#152040','#102038','#0a1830'],
        bevelTop:'rgba(100,180,255,0.3)', bevelBot:'rgba(0,0,0,0.3)',
        specular:'rgba(100,200,255,0.4)',
        groove:'rgba(0,150,255,0.4)',
        redRing:'rgba(255,50,100,0.8)', blackRing:'rgba(0,200,255,0.7)',
        redText:'#ff3060', blackText:'#00ccff',
        engraveLt:'rgba(100,200,255,0.3)', engraveDk:'rgba(0,0,0,0.3)'
      }
    }
  };

  function get() { return THEMES[current]; }
  function set(name) { if (THEMES[name]) { current = name; localStorage.setItem('chessTheme', name); } }
  function getName() { return current; }
  function getAll() { return THEMES; }
  function load() { var s = localStorage.getItem('chessTheme'); if (s && THEMES[s]) current = s; }

  load();

  return { get:get, set:set, getName:getName, getAll:getAll };
})();

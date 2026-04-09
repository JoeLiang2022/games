var UI = (function() {
  'use strict';
  var aiColor='b', aiThinking=false, _flipped=false, aiDepth=3;

  function init() {
    Game.init(); Board.init('gameCanvas');
    var canvas = Board.getCanvas();
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchend', onTouch);
    document.getElementById('btnNewGame').addEventListener('click', newGame);
    document.getElementById('btnUndo').addEventListener('click', undo);
    document.getElementById('btnFlip').addEventListener('click', flip);
    var tb=document.getElementById('btnTheme'); if(tb) tb.addEventListener('click', toggleThemePanel);
    var sb=document.getElementById('btnSound'); if(sb) sb.addEventListener('click', function() {
      var on=Sound.toggle(); sb.textContent=on?'🔊':'🔇'; });
    var mb=document.getElementById('btnMusic'); if(mb) mb.addEventListener('click', function() {
      var on=BGM.toggle(); mb.textContent=on?'🎵':'🎵'; showBgmInfo(); });
    var stb=document.getElementById('btnStats'); if(stb) stb.addEventListener('click', toggleStatsPanel);
    var ds=document.getElementById('selDifficulty');
    if(ds) ds.addEventListener('change', function() { aiDepth=parseInt(ds.value)||3; });
    document.body.className='theme-'+Themes.getName();
    updateStatus(); Board.draw();
  }

  function showBgmInfo() {
    var el=document.getElementById('bgmInfo'); if(!el)return;
    if(BGM.isPlaying()){el.style.display='';el.textContent='♪ '+BGM.getCurrentName();
      setTimeout(function(){el.style.display='none';},3000);
    } else el.style.display='none';
  }

  function toggleThemePanel() {
    var p=document.getElementById('themePanel');
    if(p.style.display==='none'){p.style.display='flex';p.innerHTML='';
      var all=Themes.getAll();Object.keys(all).forEach(function(k){
        var b=document.createElement('div');b.className='theme-opt'+(k===Themes.getName()?' active':'');
        b.textContent=all[k].name;b.addEventListener('click',function(){
          Themes.set(k);document.body.className='theme-'+k;
          p.querySelectorAll('.theme-opt').forEach(function(x){x.classList.remove('active');});
          b.classList.add('active');Board.draw();});p.appendChild(b);});
    } else p.style.display='none';
  }

  function toggleStatsPanel() {
    var p=document.getElementById('statsPanel');
    if(p.style.display==='none'){
      p.style.display='';
      var s=Stats.getSummary();
      var html='<div class="stats-title">📊 戰績統計</div>';
      html+='<div class="stats-total">總場次: '+s.total.games+' | 勝: <span class="sw">'+s.total.win+'</span> | 負: <span class="sl">'+s.total.lose+'</span> | 和: '+s.total.draw+' | 勝率: '+s.total.winRate+'%</div>';
      html+='<div class="stats-diff">';
      for(var k in s.byDiff){var d=s.byDiff[k];var t=d.win+d.lose+d.draw;
        html+='<div class="stats-row">'+d.name+': '+d.win+'勝 '+d.lose+'負 '+d.draw+'和'+(t>0?' ('+Math.round(d.win/t*100)+'%)':'')+'</div>';}
      html+='</div><button class="stats-close" onclick="document.getElementById(\'statsPanel\').style.display=\'none\'">關閉</button>';
      p.innerHTML=html;
    } else p.style.display='none';
  }

  function onClick(e){if(aiThinking)return;var rect=Board.getCanvas().getBoundingClientRect();
    var pos=Board.fromPixel(e.clientX-rect.left,e.clientY-rect.top);if(pos)handleInput(pos.row,pos.col);}
  function onTouch(e){if(aiThinking)return;e.preventDefault();var t=e.changedTouches[0];
    var rect=Board.getCanvas().getBoundingClientRect();
    var pos=Board.fromPixel(t.clientX-rect.left,t.clientY-rect.top);if(pos)handleInput(pos.row,pos.col);}

  function handleInput(row,col){
    if(Game.getTurn()===aiColor)return;
    var r=Game.handleClick(row,col);if(!r)return;
    if(r.action==='select'){Board.setLegalMoves(r.moves);Sound.select();}
    else if(r.action==='deselect'){Board.setLegalMoves([]);}
    else if(r.action==='move'){
      Board.setLegalMoves([]);Board.setLastMove({from:r.from,to:r.to});
      if(r.captured) Sound.capture(); else Sound.move();
      if(r.check) setTimeout(Sound.check, 200);
      showTeachHint(r.from.row,r.from.col,r.to.row,r.to.col);
      updateStatus();Board.draw();
      if(r.gameOver){
        if(r.isDraw){Sound.drawSound();Stats.record(aiDepth,'draw',Game.getMoveHistory().length);}
        else if(r.winner==='r'){Sound.win();Stats.record(aiDepth,'win',Game.getMoveHistory().length);}
        else{Sound.lose();Stats.record(aiDepth,'lose',Game.getMoveHistory().length);}
        return;
      }
      scheduleAI();return;
    }
    updateStatus();Board.draw();
  }

  function showTeachHint(fr,fc,tr,tc){
    var hint=document.getElementById('teachHint');if(!hint)return;
    try{var result=AI.evaluatePlayerMove(fr,fc,tr,tc,'r');
      hint.style.display='';hint.className='teach-hint '+result.rating;
      var msg=result.msg;
      if(result.best&&result.rating!=='good'){var bm=result.best;
        msg+='　建議移動到 ('+bm.tr+','+bm.tc+')';Board.setBestHint({row:bm.tr,col:bm.tc});}
      else Board.setBestHint(null);
      hint.textContent=msg;
      setTimeout(function(){hint.style.display='none';Board.setBestHint(null);Board.draw();},6000);
    }catch(e){hint.style.display='none';}
  }

  function scheduleAI(){if(Game.isGameOver())return;aiThinking=true;updateStatus();
    setTimeout(function(){var m=AI.getMove(aiColor,aiDepth,2500);aiThinking=false;
      if(m){
        var board=Game.getBoard();var wasCap=board[m.tr][m.tc];
        Game.makeMove(m.fr,m.fc,m.tr,m.tc);
        Board.setLastMove({from:{row:m.fr,col:m.fc},to:{row:m.tr,col:m.tc}});
        if(wasCap)Sound.capture();else Sound.move();
        if(Game.isInCheck('r'))setTimeout(Sound.check,200);
        if(Game.isGameOver()){
          if(Game.isDraw()){Sound.drawSound();Stats.record(aiDepth,'draw',Game.getMoveHistory().length);}
          else{Sound.lose();Stats.record(aiDepth,'lose',Game.getMoveHistory().length);}
        }
      }
      updateStatus();Board.draw();},300);}

  function updateStatus(){var el=document.getElementById('statusText');
    if(Game.isGameOver()){
      if(Game.isDraw()){el.textContent='🤝 和棋！';el.className='status-text draw';}
      else{el.textContent='🏆 '+(Game.getWinner()==='r'?'紅方':'黑方')+'勝！';el.className='status-text win';}
      return;}
    if(aiThinking){el.textContent='🤔 AI 思考中...';el.className='status-text black-turn';return;}
    var ck=Game.isInCheck(Game.getTurn());
    el.textContent=(Game.getTurn()==='r'?'紅方':'黑方')+'走棋'+(ck?' ⚠️ 將軍！':'');
    el.className='status-text '+(Game.getTurn()==='r'?'red-turn':'black-turn');
    var cnt=document.getElementById('moveCount');
    if(cnt)cnt.textContent='第 '+(Math.floor(Game.getMoveHistory().length/2)+1)+' 回合';}
  function newGame(){aiThinking=false;Game.init();Board.setLegalMoves([]);Board.setLastMove(null);Board.setBestHint(null);
    document.getElementById('teachHint').style.display='none';updateStatus();Board.draw();}
  function undo(){if(aiThinking)return;Game.undoMove();Game.undoMove();Board.setLegalMoves([]);Board.setBestHint(null);
    document.getElementById('teachHint').style.display='none';
    var h=Game.getMoveHistory();Board.setLastMove(h.length>0?{from:h[h.length-1].from,to:h[h.length-1].to}:null);updateStatus();Board.draw();}
  function flip(){_flipped=!_flipped;Board.setFlipped(_flipped);Board.draw();}
  document.addEventListener('DOMContentLoaded',init);
  return {newGame:newGame,undo:undo,flip:flip};
})();

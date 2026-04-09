// Chinese Chess Board — 2D Canvas with Static Lighting
var Board = (function() {
  'use strict';
  var canvas, ctx;
  var GRID=60, PAD=40, PIECE_R=26, W=9, H=10;
  var legalMoves=[], lastMove=null, flipped=false;
  var boardCache = null;
  var lastTheme = '';
  // Fixed light position (top-left, like a desk lamp)
  var LIGHT_X = 0.3, LIGHT_Y = 0.25;

  function init(id) {
    canvas = document.getElementById(id);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    var maxW = Math.min(window.innerWidth-16, 580);
    GRID = Math.floor((maxW-PAD*2)/(W-1));
    if (GRID<38) GRID=38;
    PIECE_R = Math.floor(GRID*0.43);
    PAD = Math.floor(GRID*0.72);
    canvas.width = PAD*2+(W-1)*GRID;
    canvas.height = PAD*2+(H-1)*GRID;
    boardCache = null;
    draw();
  }
  function toPixel(r,c) {
    var rr=flipped?(9-r):r, cc=flipped?(8-c):c;
    return {x:PAD+cc*GRID, y:PAD+rr*GRID};
  }
  function fromPixel(px,py) {
    var c=Math.round((px-PAD)/GRID), r=Math.round((py-PAD)/GRID);
    if(flipped){r=9-r;c=8-c;}
    return (r>=0&&r<=9&&c>=0&&c<=8)?{row:r,col:c}:null;
  }

  function buildBoardCache() {
    var T = Themes.get().board;
    var w=canvas.width, h=canvas.height;
    var oc = document.createElement('canvas');
    oc.width=w; oc.height=h;
    var g = oc.getContext('2d');
    // Background
    var bg=g.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,T.bg1);bg.addColorStop(0.3,T.bg2);bg.addColorStop(0.6,T.bg3);bg.addColorStop(1,T.bg4);
    g.fillStyle=bg; g.fillRect(0,0,w,h);
    // Wood grain
    g.globalAlpha=T.grainAlpha;
    for(var i=0;i<30;i++){g.beginPath();var gy=Math.random()*h;g.moveTo(0,gy);
      for(var gx=0;gx<w;gx+=15){gy+=(Math.random()-0.5)*4;g.lineTo(gx,gy);}
      g.strokeStyle=T.grainColor;g.lineWidth=Math.random()*1.5+0.5;g.stroke();}
    g.globalAlpha=1;
    // Static ambient light
    var lgx=LIGHT_X*w, lgy=LIGHT_Y*h;
    var lg=g.createRadialGradient(lgx,lgy,0,lgx,lgy,w*0.7);
    lg.addColorStop(0,'rgba(255,255,220,0.08)');lg.addColorStop(1,'rgba(0,0,0,0.03)');
    g.fillStyle=lg;g.fillRect(0,0,w,h);
    // Grid
    var x0=PAD,y0=PAD,x1=PAD+(W-1)*GRID,y1=PAD+(H-1)*GRID;
    g.strokeStyle=T.frame1;g.lineWidth=4;g.strokeRect(x0-8,y0-8,x1-x0+16,y1-y0+16);
    g.strokeStyle=T.frame2;g.lineWidth=2;g.strokeRect(x0-4,y0-4,x1-x0+8,y1-y0+8);
    g.strokeStyle=T.line;g.lineWidth=1.2;
    for(var r=0;r<H;r++){g.beginPath();g.moveTo(x0,y0+r*GRID);g.lineTo(x1,y0+r*GRID);g.stroke();}
    for(var c=0;c<W;c++){
      if(c===0||c===W-1){g.beginPath();g.moveTo(x0+c*GRID,y0);g.lineTo(x0+c*GRID,y1);g.stroke();}
      else{g.beginPath();g.moveTo(x0+c*GRID,y0);g.lineTo(x0+c*GRID,y0+4*GRID);g.stroke();
           g.beginPath();g.moveTo(x0+c*GRID,y0+5*GRID);g.lineTo(x0+c*GRID,y1);g.stroke();}}
    g.beginPath();g.moveTo(x0+3*GRID,y0);g.lineTo(x0+5*GRID,y0+2*GRID);g.stroke();
    g.beginPath();g.moveTo(x0+5*GRID,y0);g.lineTo(x0+3*GRID,y0+2*GRID);g.stroke();
    g.beginPath();g.moveTo(x0+3*GRID,y0+7*GRID);g.lineTo(x0+5*GRID,y0+9*GRID);g.stroke();
    g.beginPath();g.moveTo(x0+5*GRID,y0+7*GRID);g.lineTo(x0+3*GRID,y0+9*GRID);g.stroke();
    [[2,1],[2,7],[3,0],[3,2],[3,4],[3,6],[3,8],[6,0],[6,2],[6,4],[6,6],[6,8],[7,1],[7,7]].forEach(function(p){
      var sx=x0+p[1]*GRID,sy=y0+p[0]*GRID,s=GRID*0.12,gg=3;
      g.lineWidth=1.2;g.strokeStyle=T.line;
      [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(function(d){
        g.beginPath();g.moveTo(sx+d[0]*gg,sy+d[1]*(gg+s));g.lineTo(sx+d[0]*gg,sy+d[1]*gg);g.lineTo(sx+d[0]*(gg+s),sy+d[1]*gg);g.stroke();});});
    g.fillStyle=T.river;
    g.font='bold '+Math.floor(GRID*0.5)+'px "KaiTi","DFKai-SB","Noto Serif TC",serif';
    g.textAlign='center';g.textBaseline='middle';
    g.fillText('楚  河',x0+2*GRID,y0+4.5*GRID);
    g.fillText('漢  界',x0+6*GRID,y0+4.5*GRID);
    boardCache=oc; lastTheme=Themes.getName();
  }

  function drawBoard() {
    if(!boardCache||lastTheme!==Themes.getName()) buildBoardCache();
    ctx.drawImage(boardCache,0,0);
  }

  function drawPiece(row,col,piece,isSel) {
    var pos=toPixel(row,col);
    var T=Themes.get().piece;
    var x=pos.x,y=pos.y,r=PIECE_R,isRed=piece.color==='r';
    var isNeon=Themes.getName()==='neon';
    var lx=(LIGHT_X-x/canvas.width)*2, ly=(LIGHT_Y-y/canvas.height)*2;

    ctx.save();ctx.shadowColor=T.shadow;ctx.shadowBlur=isSel?18:10;
    ctx.shadowOffsetX=3-lx*4;ctx.shadowOffsetY=5-ly*4;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=T.edge1;ctx.fill();ctx.restore();

    ctx.beginPath();ctx.arc(x+0.5,y+2.5,r,0,Math.PI*2);ctx.fillStyle=T.edge1;ctx.fill();
    ctx.beginPath();ctx.arc(x+0.3,y+1.5,r,0,Math.PI*2);ctx.fillStyle=T.edge2;ctx.fill();

    var hlx=x-r*0.3+lx*r*0.4,hly=y-r*0.35+ly*r*0.4;
    var fg=ctx.createRadialGradient(hlx,hly,0,x,y,r);
    fg.addColorStop(0,T.face[0]);fg.addColorStop(0.25,T.face[1]);fg.addColorStop(0.6,T.face[2]);fg.addColorStop(1,T.face[3]);
    ctx.beginPath();ctx.arc(x,y,r-1,0,Math.PI*2);ctx.fillStyle=fg;ctx.fill();

    var bv=ctx.createLinearGradient(x,y-r,x,y+r);
    bv.addColorStop(0,T.bevelTop);bv.addColorStop(0.3,'rgba(255,255,255,0.1)');
    bv.addColorStop(0.6,'rgba(0,0,0,0)');bv.addColorStop(1,T.bevelBot);
    ctx.beginPath();ctx.arc(x,y,r-1,0,Math.PI*2);ctx.fillStyle=bv;ctx.fill();

    var spx=x+lx*r*0.4-r*0.1,spy=y+ly*r*0.4-r*0.15;
    var sg=ctx.createRadialGradient(spx,spy,0,spx,spy,r*0.5);
    sg.addColorStop(0,T.specular);sg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.beginPath();ctx.arc(x,y,r-1,0,Math.PI*2);ctx.fillStyle=sg;ctx.fill();

    if(isNeon){ctx.save();ctx.shadowColor=isRed?'#ff3060':'#00ccff';ctx.shadowBlur=15;
      ctx.beginPath();ctx.arc(x,y,r-2,0,Math.PI*2);ctx.strokeStyle=isRed?'rgba(255,48,96,0.6)':'rgba(0,204,255,0.6)';
      ctx.lineWidth=2.5;ctx.stroke();ctx.restore();}

    ctx.beginPath();ctx.arc(x,y,r-2.5,0,Math.PI*2);
    ctx.strokeStyle=isSel?'#00ee44':T.groove;ctx.lineWidth=isSel?3:1.5;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,r*0.73,0,Math.PI*2);
    ctx.strokeStyle=isRed?T.redRing:T.blackRing;ctx.lineWidth=1.5;ctx.stroke();

    var name=Game.NAMES[piece.color][piece.type],fs=Math.floor(r*1.15);
    ctx.font='bold '+fs+'px "KaiTi","DFKai-SB","Noto Serif TC","SimSun",serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=T.engraveLt;ctx.fillText(name,x-0.5,y-0.5);
    ctx.fillStyle=T.engraveDk;ctx.fillText(name,x+0.8,y+1.5);
    ctx.fillStyle=isRed?T.redText:T.blackText;
    if(isNeon){ctx.save();ctx.shadowColor=isRed?'#ff3060':'#00ccff';ctx.shadowBlur=10;}
    ctx.fillText(name,x,y+0.5);
    if(isNeon)ctx.restore();
    if(isSel){ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.strokeStyle='rgba(0,238,68,0.4)';ctx.lineWidth=3;ctx.stroke();}
  }

  function drawLegalMoves(){var n=Themes.getName()==='neon';
    for(var i=0;i<legalMoves.length;i++){var m=legalMoves[i],p=toPixel(m.row,m.col),b=Game.getBoard();
      if(b[m.row]&&b[m.row][m.col]){ctx.beginPath();ctx.arc(p.x,p.y,PIECE_R+5,0,Math.PI*2);ctx.strokeStyle=n?'rgba(255,50,100,0.8)':'rgba(255,40,40,0.7)';ctx.lineWidth=3;ctx.stroke();}
      else{ctx.beginPath();ctx.arc(p.x,p.y,GRID*0.13,0,Math.PI*2);ctx.fillStyle=n?'rgba(0,255,150,0.6)':'rgba(0,200,80,0.6)';ctx.fill();}}}
  function drawLastMove(){if(!lastMove)return;var n=Themes.getName()==='neon';
    [lastMove.from,lastMove.to].forEach(function(p){var pos=toPixel(p.row,p.col);
      ctx.strokeStyle=n?'rgba(0,200,255,0.5)':'rgba(255,200,0,0.5)';ctx.lineWidth=2.5;var s=GRID*0.42;
      [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(function(d){var cx=pos.x+d[0]*s,cy=pos.y+d[1]*s;
        ctx.beginPath();ctx.moveTo(cx,cy-d[1]*s*0.4);ctx.lineTo(cx,cy);ctx.lineTo(cx-d[0]*s*0.4,cy);ctx.stroke();});});}
  function setLegalMoves(m){legalMoves=m||[];}
  function setLastMove(m){lastMove=m;}
  function setFlipped(f){flipped=f;boardCache=null;}
  var bestHint = null;
  function setBestHint(h){bestHint=h;}
  function drawBestHint(){
    if(!bestHint)return;
    var pos=toPixel(bestHint.row,bestHint.col);
    // Pulsing green circle
    ctx.beginPath();ctx.arc(pos.x,pos.y,PIECE_R+6,0,Math.PI*2);
    ctx.strokeStyle='rgba(0,255,100,0.6)';ctx.lineWidth=3;
    ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);
    // Star marker
    ctx.fillStyle='rgba(0,255,100,0.8)';ctx.font='bold 16px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('✦',pos.x,pos.y-PIECE_R-10);
  }
  function draw(){if(!ctx)return;drawBoard();drawLastMove();
    var b=Game.getBoard();if(!b||!b.length)return;var sel=Game.getSelected();
    for(var r=0;r<10;r++){if(!b[r])continue;for(var c=0;c<9;c++){if(b[r][c])drawPiece(r,c,b[r][c],!!(sel&&sel.row===r&&sel.col===c));}}
    drawLegalMoves();drawBestHint();}
  return {init:init,draw:draw,resize:resize,fromPixel:fromPixel,toPixel:toPixel,
    setLegalMoves:setLegalMoves,setLastMove:setLastMove,setFlipped:setFlipped,setBestHint:setBestHint,getCanvas:function(){return canvas;}};
})();

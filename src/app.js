import { GoGame, GridTopology, BLACK, WHITE, EMPTY, buildRegions, scoreRegions, generateRandomRegions, recommendedRegionCounts, recommendedSafeCount, estimateLiveOwnership } from './engine.js';
import { chooseMove } from './ai.js';
import { MatchState, PHASES } from './match.js';
import { createMatchRecord, appendMatchEvent, serializeMatchRecord, parseMatchRecord, applyMatchEvent } from './record.js';
import { kataGoStatus, requestKataGoGuidance, suggestDeadStones } from './katago.js';
import { lastMoveHighlightFrame, regionOverlayTitle } from './board-effects.js';
import { buildPostgameSummary, countRegionalMoves } from './postgame.js';
import { isHumanVsAi, shouldAiOfferSwap } from './controllers.js';
import { onLanguageChange, setLanguage, t, translateDocument } from './i18n/index.js';
import { BrowserAi, supportsBrowserAi } from './browser-ai.js';
import { cloneWithHistory } from './browser-position.js';

const canvas = document.querySelector('#goBoard'), ctx = canvas.getContext('2d');
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
let selectedSize = 19, selectedWidth = 19, selectedHeight = 19, game, regions, hoverNode = null, aiBusy = false, lastMove = null;
let deadStones = new Set(), finalScore = null;
let controllers = { [BLACK]: 'human', [WHITE]: 'ai' }, gameSerial = 0;
let safeRule, currentRecord, replayState = null;
let regionColorFrom = [], regionColorTarget = [], regionColorStarted = 0, regionColorFrame = null;
let lastMoveHighlight = null, lastMoveHighlightAnimation = null;
let safeCountTouched = false;
let gameStarted = false;
let reviewAnalysis = null;
let currentEngine='native';
const browserAi=new BrowserAi({onState:()=>{if(currentEngine==='browser')updateKataGoStatus();}});

function startGame(begin = true) {
  const requestedSize=Number(document.querySelector('#sizeOptions .active').dataset.size);
  const requestedWidth=ui.regionPreset.value==='australia'?15:ui.regionPreset.value==='usa'?19:requestedSize;
  const requestedHeight=ui.regionPreset.value==='australia'?11:ui.regionPreset.value==='usa'?13:requestedSize;
  if(ui.aiEngine.value==='browser'&&!supportsBrowserAi({width:requestedWidth,height:requestedHeight})){showMessage(t('ai.browserUnsupported'));return false;}
  if(replayState?.timer)clearTimeout(replayState.timer);
  browserAi.cancel();
  currentEngine=ui.aiEngine.value;
  if(currentEngine!=='browser')browserAi.dispose();
  gameSerial++;
  gameStarted = begin;
  selectedSize = Number(document.querySelector('#sizeOptions .active').dataset.size);
  selectedWidth=ui.regionPreset.value==='australia'?15:ui.regionPreset.value==='usa'?19:selectedSize;
  selectedHeight=ui.regionPreset.value==='australia'?11:ui.regionPreset.value==='usa'?13:selectedSize;
  controllers = { [BLACK]: ui.blackController.value, [WHITE]: ui.whiteController.value };
  game = new GoGame(new GridTopology(selectedWidth,selectedHeight));
  if (ui.regionPreset.value === 'random') {
    if (!ui.mapSeed.value.trim()) ui.mapSeed.value = makeSeed();
    const density = document.querySelector('#densityOptions .active').dataset.density;
    regions = generateRandomRegions(game.topology, { count: recommendedRegionCounts(selectedSize)[density], style: ui.regionStyle.value, seed: ui.mapSeed.value.trim() });
  } else regions = buildRegions(game.topology, ui.regionPreset.value);
  const safeCount = Math.min(Number(ui.safeStateCount.value || 1), Math.floor(regions.length / 2));
  const config={size:selectedWidth,width:selectedWidth,height:selectedHeight,controllers:{...controllers},safeEnabled:ui.safeStateEnabled.checked,safeCount,aiLevel:ui.aiLevel.value,aiEngine:currentEngine,regionPreset:ui.regionPreset.value,density:document.querySelector('#densityOptions .active').dataset.density,regionStyle:ui.regionStyle.value,mapSeed:ui.mapSeed.value.trim()};
  currentRecord=createMatchRecord(config,regions);
  safeRule=new MatchState({game,regions,safeEnabled:config.safeEnabled,safeCount,onEvent:event=>appendMatchEvent(currentRecord,event)});
  if(begin)safeRule.start();
  replayState=null;
  hoverNode = null; lastMove = null; aiBusy = false; deadStones = safeRule.deadStones; finalScore = null;
  if(regionColorFrame)cancelAnimationFrame(regionColorFrame);
  if(lastMoveHighlightAnimation)cancelAnimationFrame(lastMoveHighlightAnimation);
  lastMoveHighlight=null;lastMoveHighlightAnimation=null;
  regionColorFrom=[];regionColorTarget=[];regionColorFrame=null;
  ui.thinkingOverlay.classList.add('hidden');
  updateBoardAspect();
  update();
  updateKataGoStatus();
  if(begin&&currentEngine==='browser')browserAi.load().catch(()=>updateKataGoStatus());
  if(gameStarted)scheduleAiTurn();
}

function canvasMetrics() {
  const ratio = window.devicePixelRatio || 1, displayWidth = canvas.clientWidth, displayHeight=canvas.clientHeight;
  if (canvas.width !== Math.round(displayWidth * ratio)||canvas.height!==Math.round(displayHeight*ratio)) { canvas.width = Math.round(displayWidth*ratio); canvas.height = Math.round(displayHeight*ratio); }
  const pad=Math.min(canvas.width,canvas.height)*.055;
  const step=Math.min((canvas.width-pad*2)/(selectedWidth-1),(canvas.height-pad*2)/(selectedHeight-1));
  const originX=(canvas.width-step*(selectedWidth-1))/2,originY=(canvas.height-step*(selectedHeight-1))/2;
  return { ratio, originX, originY, step };
}

function updateBoardAspect(){ui.boardFrame.style.setProperty('--board-aspect',`${selectedWidth}/${selectedHeight}`);}

async function updateKataGoStatus(){
  ui.retryBrowserAi.classList.toggle('hidden',currentEngine!=='browser'||browserAi.state.phase!=='error');
  if(currentEngine==='browser'){
    const state=browserAi.state;
    ui.katagoStatus.textContent=state.phase==='ready'?t('ai.browserReady',{backend:state.backend}):state.phase==='loading'?t('ai.browserLoading'):state.phase==='error'?t('ai.browserFailed'):t('ai.browserIdle');
    if(state.phase==='loading'&&state.progress){const p=state.progress;ui.katagoStatus.textContent=p.stage==='download'?t('ai.browserDownload',{percent:Math.floor(100*p.received/p.total)}):t(p.stage==='cached'?'ai.browserCached':'ai.browserPreparing');}
    return;
  }
  if(currentEngine==='builtin'){ui.katagoStatus.textContent=t('ai.engineBuiltin');return;}
  const serial=gameSerial;
  const status=await kataGoStatus();
  if(serial!==gameSerial||currentEngine!=='native')return;
  ui.katagoStatus.textContent=status.builtinOnly?t('ai.statusBuiltin'):status.running?t('ai.statusRunning',{model:status.model?` · ${status.model}`:''}):status.configured?t('ai.statusConfigured'):t('ai.statusUnavailable');
}

async function activeGuidance(position,level='balanced',allowed=null,engine=currentEngine){
  if(engine==='builtin')return null;
  if(engine==='native')return requestKataGoGuidance(position,level,allowed);
  try{return await browserAi.guidance(position,level,allowed);}
  catch(error){if(error.name==='AbortError')throw error;updateKataGoStatus();return null;}
}

function regionAt(node) { return safeRule?.regionAt(node) ?? regions.findIndex(r => r.nodes.includes(node)); }

function colorName(color) { return t(color===BLACK?'color.black':color===WHITE?'color.white':'regions.contested'); }

function regionName(region,index) {
  return region?.nameKey ? t(region.nameKey,region.nameParams||{number:index+1}) : region?.name || t('region.numbered',{number:index+1});
}

function localizeReason(reason,params={}){const key=`error.${reason}`,message=t(key,params);return message===key?reason:message;}

function makeSeed() { return Math.random().toString(36).slice(2,8).toUpperCase(); }

function updateCountLabels() {
  const size = Number(document.querySelector('#sizeOptions .active').dataset.size), counts = recommendedRegionCounts(size);
  ui.fewCount.textContent = t('density.count',{count:counts.few}); ui.standardCount.textContent = t('density.count',{count:counts.standard}); ui.manyCount.textContent = t('density.count',{count:counts.many});
}

function configuredRegionCount() {
  if (ui.regionPreset.value === 'random') {
    const size=Number(document.querySelector('#sizeOptions .active').dataset.size), density=document.querySelector('#densityOptions .active').dataset.density;
    return recommendedRegionCounts(size)[density];
  }
  return { three:3, four:4, center:5, australia:7, usa:15 }[ui.regionPreset.value] || 5;
}

function updateSafeCountOptions() {
  const regionCount=configuredRegionCount(), max=Math.max(1,Math.min(4,Math.floor(regionCount/2))), recommended=ui.regionPreset.value==='australia'?1:recommendedSafeCount(regionCount);
  const previous=Number(ui.safeStateCount.value);
  ui.safeStateCount.innerHTML=Array.from({length:max},(_,i)=>`<option value="${i+1}">${t('setup.safeCountOption',{count:i+1})}${i+1===recommended?` · ${t('setup.recommended')}`:''}</option>`).join('');
  ui.safeStateCount.value=String(safeCountTouched&&previous>=1&&previous<=max?previous:recommended);
}

function draw() {
  const { originX, originY, step } = canvasMetrics(), w = canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const displayScore=currentDisplayScore();
  const palette = regions.map((_,i)=>`hsla(${(i*137.5+8)%360}, 42%, 48%, .12)`);
  for (let y=0;y<selectedHeight;y++) for (let x=0;x<selectedWidth;x++) {
    const node = game.topology.index(x,y), regionIndex=regionAt(node), left=x===0?0:originX+(x-.5)*step, top=y===0?0:originY+(y-.5)*step;
    const right=x===selectedWidth-1?w:originX+(x+.5)*step, bottom=y===selectedHeight-1?h:originY+(y+.5)*step;
    if(safeRule.phase==='play'){
      ctx.fillStyle=regionFillStyle(regionIndex);
    }else ctx.fillStyle=palette[regionIndex % palette.length];
    ctx.fillRect(left,top,right-left,bottom-top);
    if(safeRule.phase!=='play'){
      const safeOwner=safeOwnerOf(regionIndex);
      if(safeOwner){ctx.fillStyle=safeOwner===BLACK?'rgba(18,24,22,.13)':'rgba(255,255,255,.24)';ctx.fillRect(left,top,right-left,bottom-top);}
    }
  }
  ctx.strokeStyle = '#4c3a22'; ctx.lineWidth = Math.max(1, w/700); ctx.beginPath();
  for(let x=0;x<selectedWidth;x++){const p=originX+x*step;ctx.moveTo(p,originY);ctx.lineTo(p,originY+(selectedHeight-1)*step);}
  for(let y=0;y<selectedHeight;y++){const p=originY+y*step;ctx.moveTo(originX,p);ctx.lineTo(originX+(selectedWidth-1)*step,p);}ctx.stroke();
  ctx.strokeStyle='rgba(126,48,38,.62)';ctx.lineWidth=Math.max(2,w/350);ctx.beginPath();
  for(let y=0;y<selectedHeight;y++)for(let x=0;x<selectedWidth;x++){
    const node=game.topology.index(x,y), region=regionAt(node), px=originX+x*step, py=originY+y*step;
    if(x+1<selectedWidth&&regionAt(game.topology.index(x+1,y))!==region){const bx=px+step/2;ctx.moveTo(bx,py-step/2);ctx.lineTo(bx,py+step/2);}
    if(y+1<selectedHeight&&regionAt(game.topology.index(x,y+1))!==region){const by=py+step/2;ctx.moveTo(px-step/2,by);ctx.lineTo(px+step/2,by);}
  }ctx.stroke();
  const starXs=selectedWidth===15?[3,7,11]:selectedWidth===9?[2,4,6]:selectedWidth===13?[3,6,9]:[3,9,15];
  const starYs=selectedHeight===11?[2,5,8]:selectedHeight===9?[2,4,6]:selectedHeight===13?[3,6,9]:[3,9,15];
  ctx.fillStyle='#45351f';for(const x of starXs)for(const y of starYs){ctx.beginPath();ctx.arc(originX+x*step,originY+y*step,Math.max(2,Math.min(w,h)/270),0,Math.PI*2);ctx.fill();}
  game.board.forEach((color,node) => {
    if(color===EMPTY) return;
    if (deadStones.has(node)) ctx.globalAlpha = .28;
    drawStone(node,color,originX,originY,step);
    if (deadStones.has(node)) {
      const {x,y}=game.topology.coords(node), px=originX+x*step, py=originY+y*step, r=step*.22;
      ctx.globalAlpha=1;ctx.strokeStyle='#b63b2d';ctx.lineWidth=Math.max(2,step*.07);ctx.beginPath();ctx.moveTo(px-r,py-r);ctx.lineTo(px+r,py+r);ctx.moveTo(px+r,py-r);ctx.lineTo(px-r,py+r);ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  if(ui.regionOverlayToggle.checked)drawRegionOverlays(originX,originY,step,w,h,displayScore);
  if (lastMove !== null && game.board[lastMove]) { const {x,y}=game.topology.coords(lastMove);ctx.beginPath();ctx.arc(originX+x*step,originY+y*step,step*.1,0,Math.PI*2);ctx.fillStyle=game.board[lastMove]===BLACK?'#eee':'#333';ctx.fill(); }
  drawLastMoveHighlight(originX,originY,step);
  if(hoverNode!==null && safeRule.phase!=='draft' && !aiBusy && isHumanTurn() && isAllowedOpeningNode(hoverNode) && game.analyzeMove(hoverNode).legal){ctx.globalAlpha=.35;drawStone(hoverNode,game.turn,originX,originY,step);ctx.globalAlpha=1;}
}

function drawLastMoveHighlight(originX,originY,step){
  if(!lastMoveHighlight||!game.board[lastMoveHighlight.node])return;
  const elapsed=performance.now()-lastMoveHighlight.started,progress=Math.min(1,elapsed/lastMoveHighlight.duration),frame=lastMoveHighlightFrame(progress,step);
  const {x,y}=game.topology.coords(lastMoveHighlight.node),px=originX+x*step,py=originY+y*step;
  ctx.save();ctx.globalAlpha=frame.alpha;ctx.shadowColor='rgba(23,32,29,.28)';ctx.shadowBlur=step*.15;
  ctx.beginPath();ctx.arc(px,py,frame.radius,0,Math.PI*2);ctx.strokeStyle='rgba(250,247,239,.96)';ctx.lineWidth=Math.max(5,step*.14);ctx.stroke();
  ctx.shadowColor='transparent';ctx.beginPath();ctx.arc(px,py,frame.radius,0,Math.PI*2);ctx.strokeStyle='#b63b2d';ctx.lineWidth=Math.max(2,step*.065);ctx.stroke();ctx.restore();
}

function canHighlightOpponentMove(){
  if(!gameStarted||lastMove===null||!game.board[lastMove])return false;
  const humanColors=[BLACK,WHITE].filter(color=>controllers[color]==='human');
  return humanColors.length!==1||game.board[lastMove]!==humanColors[0];
}

function animateLastMove(){
  if(!canHighlightOpponentMove())return;
  if(lastMoveHighlightAnimation)cancelAnimationFrame(lastMoveHighlightAnimation);
  const duration=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?180:720;
  lastMoveHighlight={node:lastMove,started:performance.now(),duration};
  const tick=()=>{draw();if(lastMoveHighlight&&performance.now()-lastMoveHighlight.started<duration)lastMoveHighlightAnimation=requestAnimationFrame(tick);else{lastMoveHighlight=null;lastMoveHighlightAnimation=null;draw();}};
  lastMoveHighlightAnimation=requestAnimationFrame(tick);
}

function drawRegionOverlays(originX,originY,step,canvasWidth,canvasHeight,score){
  const fontSize=Math.max(8,Math.min(12,step*.2)), nameFontSize=Math.max(7,Math.min(10,fontSize*.82)), boxHeight=fontSize*3.75;
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(let regionIndex=0;regionIndex<score.details.length;regionIndex++){
    const region=score.details[regionIndex];
    const safeOwner=safeOwnerOf(regionIndex),title=regionOverlayTitle(regionIndex,regionName(region,regionIndex));
    ctx.font=`600 ${nameFontSize}px "Noto Serif SC", serif`;
    const boxWidth=Math.max(58,Math.min(canvasWidth*.23,132,ctx.measureText(title).width+(safeOwner?25:16)));
    const center=region.nodes.reduce((sum,node)=>{const c=game.topology.coords(node);sum.x+=c.x;sum.y+=c.y;return sum;},{x:0,y:0});center.x/=region.nodes.length;center.y/=region.nodes.length;
    const anchor=region.nodes.reduce((best,node)=>{const c=game.topology.coords(node),d=(c.x-center.x)**2+(c.y-center.y)**2;return d<best.d?{node,d}:best;},{node:region.nodes[0],d:Infinity}).node;
    const c=game.topology.coords(anchor), x=Math.max(boxWidth/2+2,Math.min(canvasWidth-boxWidth/2-2,originX+c.x*step)), y=Math.max(boxHeight/2+2,Math.min(canvasHeight-boxHeight/2-2,originY+c.y*step));
    const whiteLead=region.winner===WHITE, tied=region.winner===EMPTY;
    ctx.fillStyle=whiteLead?'rgba(250,247,239,.92)':tied?'rgba(104,108,103,.88)':'rgba(18,24,22,.88)';ctx.beginPath();ctx.roundRect(x-boxWidth/2,y-boxHeight/2,boxWidth,boxHeight,4);ctx.fill();
    if(whiteLead){ctx.strokeStyle='rgba(65,67,63,.55)';ctx.lineWidth=1;ctx.stroke();}
    ctx.fillStyle=whiteLead?'#18201d':'#fff';ctx.font=`600 ${nameFontSize}px "Noto Serif SC", serif`;ctx.fillText(title,x,y-fontSize*1.15,boxWidth-12);
    ctx.font=`600 ${fontSize}px "DM Mono", monospace`;ctx.fillText(t('regions.points',{points:region.points}),x,y);
    ctx.fillStyle=whiteLead?'#59615c':'#ddd5c8';ctx.font=`500 ${Math.max(7,fontSize*.78)}px "DM Mono", monospace`;ctx.fillText(t('regions.counts',{black:region.black,white:region.white}),x,y+fontSize*1.12);
    if(safeOwner)drawShield(x+boxWidth/2-7,y-boxHeight/2+7,safeOwner,Math.max(4,fontSize*.48),whiteLead);
  }
  ctx.textAlign='start';ctx.textBaseline='alphabetic';
}

function drawShield(x,y,color,size,onLight){
  ctx.save();ctx.beginPath();ctx.moveTo(x-size,y-size*.85);ctx.lineTo(x+size,y-size*.85);ctx.lineTo(x+size*.78,y+size*.35);ctx.quadraticCurveTo(x,y+size*1.15,x-size*.78,y+size*.35);ctx.closePath();
  ctx.fillStyle=color===BLACK?'#111714':'#fffdf8';ctx.fill();ctx.strokeStyle=color===BLACK?(onLight?'#fff':'#c9c2b6'):'#555d58';ctx.lineWidth=1;ctx.stroke();ctx.restore();
}

function targetRegionColor(detail){
  if(detail.winner===EMPTY)return [104,108,103,.12];
  const lead=Math.abs(detail.black-detail.white), strength=Math.min(1,lead/Math.max(3,detail.nodes.length*.3)), alpha=.08+strength*.18;
  return detail.winner===BLACK?[18,24,22,alpha]:[255,255,255,.14+strength*.25];
}

function animatedRegionColor(index,now=performance.now()){
  const target=regionColorTarget[index]||[104,108,103,.12],from=regionColorFrom[index]||target;
  const raw=Math.min(1,Math.max(0,(now-regionColorStarted)/220)),t=1-(1-raw)**3;
  return target.map((value,i)=>from[i]+(value-from[i])*t);
}

function regionFillStyle(index){const [r,g,b,a]=animatedRegionColor(index);return `rgba(${r},${g},${b},${a})`;}

function setRegionColorTargets(score){
  const next=score.details.map(targetRegionColor),same=next.length===regionColorTarget.length&&next.every((color,i)=>color.every((value,j)=>Math.abs(value-regionColorTarget[i][j])<.001));
  if(same)return;
  const now=performance.now();
  if(!regionColorTarget.length){regionColorFrom=next.map(color=>[...color]);regionColorTarget=next;regionColorStarted=now;return;}
  regionColorFrom=next.map((_,i)=>animatedRegionColor(i,now));regionColorTarget=next;regionColorStarted=now;
  if(regionColorFrame)cancelAnimationFrame(regionColorFrame);
  const tick=()=>{draw();if(performance.now()-regionColorStarted<230)regionColorFrame=requestAnimationFrame(tick);else regionColorFrame=null;};
  regionColorFrame=requestAnimationFrame(tick);
}

function drawStone(node,color,originX,originY,step){
  const {x,y}=game.topology.coords(node), px=originX+x*step, py=originY+y*step, r=step*.43;
  const g=ctx.createRadialGradient(px-r*.3,py-r*.35,r*.08,px,py,r);
  if(color===BLACK){g.addColorStop(0,'#4b504d');g.addColorStop(.42,'#202522');g.addColorStop(1,'#080a09');}
  else {g.addColorStop(0,'#fff');g.addColorStop(.6,'#f5f0e7');g.addColorStop(1,'#c9c2b8');}
  ctx.shadowColor='rgba(40,30,18,.35)';ctx.shadowBlur=r*.25;ctx.shadowOffsetY=r*.16;ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';
}

function update() {
  gameStarted=safeRule.started;
  finalScore=safeRule.finalScore;
  deadStones=safeRule.deadStones;
  if(safeRule.phase!==PHASES.REVIEW||replayState)reviewAnalysis=null;
  else if(!reviewAnalysis||reviewAnalysis.match!==safeRule)startReviewAnalysis();
  const score = currentDisplayScore();
  setRegionColorTargets(score);
  const actor=activeColor();
  const blackName = t(controllers[BLACK] === 'ai' ? 'controller.ai' : 'controller.human'), whiteName = t(controllers[WHITE] === 'ai' ? 'controller.ai' : 'controller.human');
  ui.blackRole.textContent = blackName; ui.whiteRole.textContent = whiteName;
  ui.matchTitle.textContent = t('match.versus',{black:blackName,white:whiteName});
  ui.matchSubtitle.textContent = t('match.blackStarts',{player:blackName});
  ui.blackScore.textContent = score.owners.reduce((n,c)=>n+(c===BLACK),0);
  ui.whiteScore.textContent = score.owners.reduce((n,c)=>n+(c===WHITE),0);
  ui.blackElectoral.textContent = score.blackTotal;
  ui.whiteElectoral.textContent = score.whiteTotal;
  const regionPoints=regions.reduce((n,r)=>n+r.points,0);
  ui.totalPoints.textContent = t(safeRule.whiteBonus?'score.totalWithBonus':'score.total',{points:regionPoints,bonus:safeRule.whiteBonus});
  ui.blackPlayer.classList.toggle('active', gameStarted&&actor===BLACK&&![PHASES.REVIEW,PHASES.FINISHED].includes(safeRule.phase));
  ui.whitePlayer.classList.toggle('active', gameStarted&&actor===WHITE&&![PHASES.REVIEW,PHASES.FINISHED].includes(safeRule.phase));
  const actorName = colorName(actor), actorIsAi=controllers[actor]==='ai';
  if(!gameStarted)ui.turnLabel.textContent=t('match.waiting');
  else if(safeRule.phase===PHASES.FINISHED)ui.turnLabel.textContent=t('match.finished');
  else if(safeRule.phase===PHASES.REVIEW)ui.turnLabel.textContent=t('match.review');
  else if(safeRule.phase==='draft')ui.turnLabel.textContent=t('match.drafting',{color:actorName,ai:actorIsAi?' AI':''});
  else if(safeRule.phase==='opening')ui.turnLabel.textContent=t('match.safeOpening',{color:actorName,ai:actorIsAi?' AI':''});
  else ui.turnLabel.textContent=actorIsAi?t('match.aiThinking',{color:actorName}):t('match.yourTurn',{color:actorName});
  ui.moveNumber.textContent=gameStarted?t('match.move',{move:game.history.length+1}):t('match.ready');
  ui.gameMessage.textContent = transientMessage || (replayState ? t('replay.active') : !gameStarted ? t('match.setupPrompt') : finalScore ? endMessage(score) : safeRule.phase===PHASES.REVIEW ? t('endgame.markedDead',{count:deadStones.size}) : safePhaseMessage() || (game.consecutivePasses ? t('match.lastPassed') : t('match.clickToPlay')));
  ui.endgamePanel.classList.toggle('hidden', safeRule.phase!==PHASES.REVIEW || Boolean(replayState));
  ui.endgameAnalysisStatus.textContent=reviewAnalysis?t(`endgame.analysis${reviewAnalysis.status}`):'';
  ui.analyzeDeadButton.disabled=reviewAnalysis?.status==='Pending';
  ui.confirmScoreButton.disabled=reviewAnalysis?.status==='Pending';
  ui.safePhasePanel.classList.toggle('hidden', !gameStarted || !safeRule.enabled || ![PHASES.DRAFT,PHASES.SAFE_OPENING].includes(safeRule.phase));
  ui.postgamePanel.classList.toggle('hidden',safeRule.phase!==PHASES.FINISHED||!finalScore);
  if(safeRule.phase===PHASES.FINISHED&&finalScore)renderPostgameSummary(finalScore);
  updateSafePanel();
  ui.passButton.disabled = Boolean(replayState) || !gameStarted || safeRule.phase!==PHASES.PLAY || !isHumanTurn();
  ui.undoButton.disabled = Boolean(replayState) || !gameStarted || aiBusy || ![PHASES.PLAY,PHASES.REVIEW].includes(safeRule.phase) || Object.values(controllers).every(value=>value==='ai');
  ui.highlightLastMoveButton.disabled=!canHighlightOpponentMove();
  ui.replayPanel.classList.toggle('hidden', !replayState);
  if(replayState){
    ui.replayStatus.textContent=`${replayState.index} / ${replayState.record.events.length}`;
    ui.replayPrev.disabled=replayState.index===0;
    ui.replayNext.disabled=replayState.index===replayState.record.events.length;
    ui.replayPlay.disabled=replayState.record.events.length===0;
    ui.replayPlay.textContent=replayState.timer?t('replay.pause'):replayState.index===replayState.record.events.length?t('replay.restart'):t('replay.play');
  }
  ui.regionList.innerHTML = score.details.map((r,i)=>{
    const total=Math.max(1,r.black+r.white), bp=r.black/total*100, wp=r.white/total*100;
    const safe=safeOwnerOf(i), safeTag=safe?` · ${t('regions.safeTag',{color:colorName(safe)})}`:r.safeSelectable===false?` · ${t('regions.notSelectable')}`:'';
    const lead=t(r.winner===BLACK?'regions.blackLead':r.winner===WHITE?'regions.whiteLead':'regions.contested');
    return `<div class="region-row"><div class="region-top"><span class="region-name">${String(i+1).padStart(2,'0')} · ${regionName(r,i)}${safeTag}</span><span class="region-points">${t('regions.points',{points:r.points})}</span></div><div class="region-bar"><span class="black-control" style="width:${bp}%"></span><span class="white-control" style="width:${wp}%"></span></div><div class="region-counts"><span>${t('regions.blackCount',{count:r.black})}</span><span>${lead}</span><span>${t('regions.whiteCount',{count:r.white})}</span></div></div>`;
  }).join('');
  draw();
}

function renderPostgameSummary(score){
  const summary=buildPostgameSummary(score,regions,countRegionalMoves(game,regions),safeRule.picks);
  ui.postgameLead.textContent=summary.winner===EMPTY?t('postgame.draw',{score:summary.blackTotal}):t('postgame.win',{color:colorName(summary.winner),winner:Math.max(summary.blackTotal,summary.whiteTotal),loser:Math.min(summary.blackTotal,summary.whiteTotal)});
  const metrics=[t('postgame.regionTotals',{black:summary.blackWon,white:summary.whiteWon,tied:summary.tied}),t('postgame.closeRegions',{count:summary.closeRegions}),summary.safeTotal?t('postgame.safeHeld',{held:summary.safeHeld,total:summary.safeTotal}):t('postgame.safeDisabled'),t('postgame.highLosses',{count:summary.highInvestmentLosses})];
  if(summary.whiteBonus)metrics.push(t('postgame.swapBonus',{bonus:summary.whiteBonus}));
  ui.postgameMetrics.innerHTML=metrics.map(text=>`<span>${text}</span>`).join('');
  ui.postgameRegions.innerHTML=summary.rows.map(row=>{
    const result=row.winner===EMPTY?t('postgame.split'):t('postgame.result',{color:colorName(row.winner),points:row.points}),efficiency=row.efficiency?t('postgame.efficiency',{value:row.efficiency.toFixed(2)}):'—';
    return `<article class="postgame-region"><div><strong>${String(row.index+1).padStart(2,'0')} · ${regionName(regions[row.index],row.index)}</strong><b class="winner-${row.winner}">${result}</b></div><p>${t('postgame.control',{black:row.black,white:row.white,margin:row.margin})}</p><p>${t('postgame.moves',{black:row.blackMoves,white:row.whiteMoves,efficiency})}</p>${row.tags.length?`<div class="postgame-tags">${row.tags.map(tag=>`<span>${t(`postgame.tag.${tag}`)}</span>`).join('')}</div>`:''}</article>`;
  }).join('');
}

function currentReviewGame() {
  return safeRule.reviewGame();
}

function currentReviewScore() { return safeRule.reviewScore(); }

function currentDisplayScore() {
  if(finalScore)return finalScore;
  if([PHASES.REVIEW,PHASES.FINISHED].includes(safeRule.phase))return currentReviewScore();
  return safeRule.withWhiteBonus(scoreRegions(game,regions,estimateLiveOwnership(game)));
}

function toggleDeadGroup(node) {
  const result=safeRule.toggleDeadGroup(node);
  if(result.ok)update();else showMessage(result.reason);
}

function startReviewAnalysis(){
  const match=safeRule,serial=gameSerial,snapshot=cloneWithHistory(game),engine=currentEngine;
  const before=[...match.deadStones].sort((a,b)=>a-b).join(',');
  const token={match,status:'Pending'};reviewAnalysis=token;
  const current=()=>reviewAnalysis===token&&safeRule===match&&gameSerial===serial&&match.phase===PHASES.REVIEW&&!replayState;
  Promise.resolve().then(()=>suggestDeadStones(snapshot,(position,level,allowed)=>activeGuidance(position,level,allowed,engine))).then(result=>{
    if(!current())return;
    const after=[...match.deadStones].sort((a,b)=>a-b).join(',');
    if(after!==before)token.status='Manual';
    else {match.suggestDeadNodes(result.dead);token.status=result.source==='browser-katago'?'Browser':result.source==='katago'?'KataGo':'Builtin';}
    update();
  }).catch(()=>{if(current()){token.status='Builtin';update();}});
}

function activeColor() { return safeRule.activeColor; }

function safeOwnerOf(regionIndex) { return safeRule.safeOwner(regionIndex); }

function availableSafeRegions(color=game.turn) { return safeRule.availableSafeRegions(color); }

function isAllowedOpeningNode(node) { return safeRule.canPlay(node).ok; }

function safePhaseMessage() {
  if(safeRule.phase==='draft')return t('safe.draftPrompt',{color:colorName(activeColor())});
  if(safeRule.phase==='opening')return t('safe.openingPrompt',{round:safeRule.openingRound+1,count:safeRule.count});
  return '';
}

function updateSafePanel() {
  const names=color=>safeRule.picks[color].map(i=>regionName(regions[i],i)).filter(Boolean).join(' · ')||t('safe.none');
  ui.blackSafeList.textContent=names(BLACK);ui.whiteSafeList.textContent=names(WHITE);
  ui.swapOffer.classList.toggle('hidden',!safeRule.canSwapSides);
  ui.swapBonusLabel.textContent=t('safe.whiteBonus',{bonus:safeRule.whiteBonus});
  ui.swapSidesButton.disabled=Boolean(replayState)||aiBusy||!isHumanTurn();
  if(safeRule.phase==='draft'){
    const color=colorName(activeColor());ui.safePhaseBadge.textContent=t('safe.draftBadge');ui.safePhaseTitle.textContent=t('safe.draftTitle',{color});ui.safePhaseMessage.textContent=t('safe.draftHelp',{count:safeRule.count});
  }else if(safeRule.phase==='opening'){
    ui.safePhaseBadge.textContent=t('safe.openingBadge');ui.safePhaseTitle.textContent=t('safe.openingRound',{round:safeRule.openingRound+1,count:safeRule.count});
    ui.safePhaseMessage.textContent=t('safe.openingHelp',{color:colorName(game.turn)});
  }
}

function selectSafeRegion(regionIndex) {
  const result=safeRule.selectSafeRegion(regionIndex);
  if(!result.ok)showMessage(result.reason);
  return result.ok;
}

function swapControllers() {
  [controllers[BLACK],controllers[WHITE]]=[controllers[WHITE],controllers[BLACK]];
}

function requestSideSwap() {
  const result=safeRule.requestSideSwap();
  if(!result.ok){showMessage(result.reason);return false;}
  swapControllers();
  return true;
}

function chooseAiSafeRegion() {
  const available=regions.map((region,index)=>({index,score:region.points+Math.random()*8})).filter(({index})=>regions[index].safeSelectable!==false&&safeOwnerOf(index)===EMPTY);
  available.sort((a,b)=>b.score-a.score);return available[0]?.index??null;
}

function endMessage(score){ if(score.blackTotal===score.whiteTotal)return t('match.endDraw',{score:score.blackTotal});const winner=score.blackTotal>score.whiteTotal?BLACK:WHITE;return t('match.endWin',{color:colorName(winner),winner:Math.max(score.blackTotal,score.whiteTotal),loser:Math.min(score.blackTotal,score.whiteTotal)}); }

function buildReplayPosition(index) {
  const record=replayState.record, config=record.config;
  gameSerial++;
  browserAi.cancel();
  currentEngine=config.aiEngine||'native';
  selectedWidth=Number(config.width||config.size);selectedHeight=Number(config.height||config.size);selectedSize=selectedWidth===selectedHeight?selectedWidth:19;
  controllers={ [BLACK]:config.controllers?.[BLACK]||'human', [WHITE]:config.controllers?.[WHITE]||'human' };
  game=new GoGame(new GridTopology(selectedWidth,selectedHeight));
  regions=record.regions.map(region=>({name:region.name,...(region.nameKey?{nameKey:region.nameKey}:{}),...(region.nameParams?{nameParams:{...region.nameParams}}:{}),points:region.points,nodes:[...region.nodes],...(region.safeSelectable===false?{safeSelectable:false}:{})}));
  safeRule=new MatchState({game,regions,safeEnabled:Boolean(config.safeEnabled),safeCount:Number(config.safeCount)||0});
  safeRule.start();
  for(let i=0;i<index;i++){
    const event=record.events[i],result=applyMatchEvent(safeRule,event);
    if(!result.ok)throw new Error(t('replay.failed',{step:i+1,reason:localizeReason(result.reason,result.params)}));
    if(event.type==='swap-sides')swapControllers();
  }
  replayState.index=index;
  gameStarted=true; aiBusy=false; hoverNode=null;
  deadStones=safeRule.deadStones;finalScore=safeRule.finalScore;
  const last=record.events.slice(0,index).findLast?.(event=>event.type==='play');
  lastMove=last?.node??null;
  regionColorFrom=[];regionColorTarget=[];
  ui.thinkingOverlay.classList.add('hidden');
  updateBoardAspect();
  update();
}

function enterReplay(record) {
  if(replayState?.timer)clearTimeout(replayState.timer);
  syncControlsFromRecord(record);
  currentRecord=record;
  replayState={record,index:0,timer:null};
  buildReplayPosition(0);
}

function setReplayIndex(index) {
  if(!replayState)return;
  const next=Math.max(0,Math.min(index,replayState.record.events.length));
  try{buildReplayPosition(next);}catch(error){stopReplay();showMessage(error.message);}
}

function stopReplay() {
  if(replayState?.timer)clearTimeout(replayState.timer);
  if(replayState)replayState.timer=null;
}

function toggleReplayPlayback() {
  if(!replayState)return;
  if(replayState.timer){stopReplay();update();return;}
  if(replayState.index>=replayState.record.events.length)setReplayIndex(0);
  const tick=()=>{
    if(!replayState)return;
    if(replayState.index>=replayState.record.events.length){stopReplay();update();return;}
    setReplayIndex(replayState.index+1);
    if(replayState)replayState.timer=setTimeout(tick,500);
    update();
  };
  replayState.timer=setTimeout(tick,250);update();
}

function syncControlsFromRecord(record) {
  const config=record.config;
  const width=Number(config.width||config.size),height=Number(config.height||config.size);
  if(width===height)[...ui.sizeOptions.children].forEach(button=>button.classList.toggle('active',Number(button.dataset.size)===width));
  if([...ui.regionPreset.options].some(option=>option.value===config.regionPreset))ui.regionPreset.value=config.regionPreset;
  const density=[...ui.densityOptions.children].find(button=>button.dataset.density===config.density);
  if(density)[...ui.densityOptions.children].forEach(button=>button.classList.toggle('active',button===density));
  if([...ui.regionStyle.options].some(option=>option.value===config.regionStyle))ui.regionStyle.value=config.regionStyle;
  if(config.mapSeed)ui.mapSeed.value=config.mapSeed;
  ui.blackController.value=config.controllers?.[BLACK]||'human';ui.whiteController.value=config.controllers?.[WHITE]||'human';
  if([...ui.aiLevel.options].some(option=>option.value===config.aiLevel))ui.aiLevel.value=config.aiLevel;
  ui.aiEngine.value=['native','browser','builtin'].includes(config.aiEngine)?config.aiEngine:'native';
  ui.safeStateEnabled.checked=Boolean(config.safeEnabled);ui.safeStateOptions.classList.toggle('hidden',!config.safeEnabled);
  ui.randomSettings.classList.toggle('hidden',ui.regionPreset.value!=='random');
  updateSizeControlState();
  safeCountTouched=false;updateCountLabels();updateSafeCountOptions();
  if([...ui.safeStateCount.options].some(option=>Number(option.value)===Number(config.safeCount)))ui.safeStateCount.value=String(config.safeCount);
}

function showRecordDialog() {
  ui.recordText.value=serializeMatchRecord(currentRecord);
  ui.recordError.textContent='';
  ui.recordDialog.showModal();
}

function downloadRecord() {
  const blob=new Blob([serializeMatchRecord(currentRecord)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`zhouyi-${new Date().toISOString().slice(0,10)}.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}

let transientMessage='',transientTimer=null;
function showMessage(message){transientMessage=localizeReason(message);if(transientTimer)clearTimeout(transientTimer);transientTimer=setTimeout(()=>{transientMessage='';update();},1800);update();}

function pointerNode(event){
  const rect=canvas.getBoundingClientRect(), scaleX=canvas.width/rect.width,scaleY=canvas.height/rect.height,{originX,originY,step}=canvasMetrics();
  const ex=(event.clientX-rect.left)*scaleX,ey=(event.clientY-rect.top)*scaleY;
  const x=Math.round((ex-originX)/step), y=Math.round((ey-originY)/step);
  if(x<0||y<0||x>=selectedWidth||y>=selectedHeight)return null;
  const px=originX+x*step,py=originY+y*step;
  return Math.hypot(ex-px,ey-py)<step*.48?game.topology.index(x,y):null;
}

function isHumanTurn() { return controllers[activeColor()] === 'human'; }

function scheduleAiTurn(){
  const actor=activeColor();
  if(!gameStarted||[PHASES.REVIEW,PHASES.FINISHED].includes(safeRule.phase)||controllers[actor]!=='ai'||replayState)return;
  const serial=gameSerial;
  aiBusy=true;ui.thinkingOverlay.classList.remove('hidden');update();
  setTimeout(async()=>{
    if(serial!==gameSerial)return;
    let highlightAiMove=false,continueAi=true;
    try{
    if(safeRule.phase==='draft'){
      if(safeRule.canSwapSides&&shouldAiOfferSwap(controllers,safeRule.whiteBonus))requestSideSwap();
      else { const choice=chooseAiSafeRegion();if(choice!==null)selectSafeRegion(choice); }
    }else{
      const available=availableSafeRegions(), allowed=safeRule.phase==='opening'?available.flatMap(regionIndex=>regions[regionIndex].nodes):null;
      const guidance=await activeGuidance(game,ui.aiLevel.value,allowed);
      if(serial!==gameSerial)return;
      if(guidance)updateKataGoStatus();
      const node=chooseMove(game,regions,ui.aiLevel.value,allowed,Math.random,guidance);
      if(node===null&&safeRule.phase==='play')safeRule.pass();else if(node!==null){const result=safeRule.play(node);if(result.ok){lastMove=node;highlightAiMove=isHumanVsAi(controllers);}}
    }
    }catch(error){continueAi=false;if(serial===gameSerial&&error.name!=='AbortError')showMessage(t('ai.turnFailed'));}
    finally{if(serial===gameSerial){aiBusy=false;ui.thinkingOverlay.classList.add('hidden');update();if(highlightAiMove)animateLastMove();if(continueAi)scheduleAiTurn();}}
  }, ui.aiLevel.value==='deep'?700:420);
}

canvas.addEventListener('pointermove',e=>{hoverNode=pointerNode(e);draw();});
canvas.addEventListener('pointerleave',()=>{hoverNode=null;draw();});
canvas.addEventListener('click',e=>{
  if(!gameStarted||aiBusy||replayState)return;
  const node=pointerNode(e);
  if(safeRule.phase==='draft'){
    if(node!==null&&isHumanTurn()&&selectSafeRegion(regionAt(node))){update();scheduleAiTurn();}
    return;
  }
  if(safeRule.phase===PHASES.REVIEW){if(node!==null)toggleDeadGroup(node);return;}
  if(!isHumanTurn())return;
  if(node!==null){const result=safeRule.play(node);if(result.ok){lastMove=node;update();scheduleAiTurn();}else showMessage(result.reason);}
});
ui.passButton.addEventListener('click',()=>{if(aiBusy||!isHumanTurn())return;const result=safeRule.pass();if(result.ok){lastMove=null;update();scheduleAiTurn();}else showMessage(result.reason);});
ui.swapSidesButton.addEventListener('click',()=>{if(aiBusy||replayState||!isHumanTurn())return;if(requestSideSwap()){update();scheduleAiTurn();}});
ui.undoButton.addEventListener('click',()=>{if(aiBusy||safeRule.phase===PHASES.FINISHED)return;const oneHuman=Object.values(controllers).filter(v=>v==='human').length===1;const count=safeRule.phase===PHASES.REVIEW?2:oneHuman&&isHumanTurn()?2:1;const result=safeRule.undo(count);if(result.ok){browserAi.cancel();lastMove=null;update();scheduleAiTurn();}else showMessage(result.reason);});
ui.resumeButton.addEventListener('click',()=>{const result=safeRule.resume();if(result.ok){browserAi.cancel();update();scheduleAiTurn();}else showMessage(result.reason);});
ui.confirmScoreButton.addEventListener('click',()=>{const result=safeRule.confirm();if(result.ok)update();else showMessage(result.reason);});
ui.analyzeDeadButton.addEventListener('click',()=>{if(safeRule.phase===PHASES.REVIEW&&reviewAnalysis?.status!=='Pending'){reviewAnalysis=null;update();}});
ui.newGameButton.addEventListener('click',()=>startGame(true));
ui.retryBrowserAi.addEventListener('click',()=>{if(currentEngine==='browser')browserAi.retry().catch(()=>updateKataGoStatus());});
ui.aiEngine.addEventListener('change',()=>{if(!gameStarted){browserAi.cancel();currentEngine=ui.aiEngine.value;if(currentEngine!=='browser')browserAi.dispose();updateKataGoStatus();}});
ui.recordButton.addEventListener('click',showRecordDialog);
ui.highlightLastMoveButton.addEventListener('click',animateLastMove);
ui.closeRecord.addEventListener('click',()=>ui.recordDialog.close());
ui.recordRefresh.addEventListener('click',()=>{ui.recordText.value=serializeMatchRecord(currentRecord);ui.recordError.textContent='';});
ui.recordDownload.addEventListener('click',downloadRecord);
ui.recordLoad.addEventListener('click',()=>{try{const record=parseMatchRecord(ui.recordText.value);enterReplay(record);ui.recordDialog.close();}catch(error){ui.recordError.textContent=localizeReason(error.code||error.message,error.params);}});
ui.replayPrev.addEventListener('click',()=>{stopReplay();setReplayIndex(replayState.index-1);});
ui.replayNext.addEventListener('click',()=>{stopReplay();setReplayIndex(replayState.index+1);});
ui.replayPlay.addEventListener('click',toggleReplayPlayback);
ui.replayExit.addEventListener('click',()=>{stopReplay();startGame(false);});
function updateSizeControlState(){
  const rectangular=['australia','usa'].includes(ui.regionPreset.value);
  ui.sizeOptions.classList.toggle('is-disabled',rectangular);
  ui.aiEngine.querySelector('[value="browser"]').disabled=rectangular||Number(document.querySelector('#sizeOptions .active').dataset.size)!==9;
}
ui.regionPreset.addEventListener('change',()=>{ui.randomSettings.classList.toggle('hidden',ui.regionPreset.value!=='random');updateSizeControlState();updateSafeCountOptions();});
ui.sizeOptions.addEventListener('click',e=>{if(!e.target.dataset.size)return;[...ui.sizeOptions.children].forEach(b=>b.classList.toggle('active',b===e.target));updateCountLabels();updateSafeCountOptions();updateSizeControlState();});
ui.densityOptions.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;[...ui.densityOptions.children].forEach(b=>b.classList.toggle('active',b===button));updateSafeCountOptions();});
ui.rerollSeed.addEventListener('click',()=>{ui.mapSeed.value=makeSeed();});
ui.safeStateEnabled.addEventListener('change',()=>ui.safeStateOptions.classList.toggle('hidden',!ui.safeStateEnabled.checked));
ui.safeStateCount.addEventListener('change',()=>{safeCountTouched=true;});
ui.regionOverlayToggle.addEventListener('change',draw);
ui.rulesButton.addEventListener('click',()=>ui.rulesDialog.showModal());ui.closeRules.addEventListener('click',()=>ui.rulesDialog.close());ui.rulesGotIt.addEventListener('click',()=>ui.rulesDialog.close());
window.addEventListener('resize',draw);
document.querySelector('.language-switch').addEventListener('click',event=>{const button=event.target.closest('[data-language]');if(button)setLanguage(button.dataset.language);});
onLanguageChange(()=>{updateCountLabels();updateSafeCountOptions();update();updateKataGoStatus();});
if(new URL(location.href).searchParams.get('ai')==='browser'){
  ui.aiEngine.value='browser';
  [...ui.sizeOptions.children].forEach(button=>button.classList.toggle('active',Number(button.dataset.size)===9));
}
translateDocument();
updateCountLabels();
updateSizeControlState();
updateSafeCountOptions();
startGame(false);
updateKataGoStatus();

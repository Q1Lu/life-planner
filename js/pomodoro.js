/* ---------- 番茄鐘 ---------- */
// countUp：專注改成「正計時」（00:00 → ∞，自己按結束）
const PSET=Object.assign({focus:25,short:5,long:15,every:4,auto:false,countUp:false},jget('pomoSet')||{});
const P=Object.assign({mode:'focus',running:false,endAt:0,left:PSET.focus*60,todoId:'',cycles:0,acc:0,startAt:0},jget('pomoState')||{});
const PLABEL={focus:'專注',short:'短休息',long:'長休息'};
const PMAX={focus:180,short:60,long:90};     // 滾輪可以選到幾分鐘
const pDur=m=>PSET[m]*60;
const pSave=()=>ls('pomoState',JSON.stringify(P));
const pSaveSet=()=>ls('pomoSet',JSON.stringify(PSET));
const isUp=()=>P.mode==='focus'&&PSET.countUp;
const pLeft=()=>P.running?Math.max(0,(P.endAt-Date.now())/1000):P.left;
const pElapsed=()=>isUp()?(P.acc||0)+(P.running?(Date.now()-P.startAt)/1000:0):pDur(P.mode)-pLeft();
const pStarted=()=>P.running||(isUp()?(P.acc||0)>0:P.left<pDur(P.mode));
const pShown=()=>isUp()?pElapsed():pLeft();     // 畫面上顯示的秒數
const pNext=()=>P.mode==='focus'?(P.cycles%PSET.every===0?'long':'short'):'focus';
function pLog(sec){         // 把這段專注時間記到目前的工作上
  const min=Math.round(sec/60); if(min<1) return;
  const t=db.todos.find(x=>x.id===P.todoId);
  db.pomos.push({id:uid(),todoId:P.todoId||'',title:t?t.text:'',date:habitDay(),min,at:Date.now(),full:sec>=pDur('focus')-1});
  save();
}
function pStart(){
  if(P.running) return pPause();
  try{if('Notification' in window&&Notification.permission==='default') Notification.requestPermission();}catch(e){}
  if(isUp()) P.startAt=Date.now(); else P.endAt=Date.now()+P.left*1000;
  P.running=true; pSave(); renderPomo(); renderMini();
}
function pPause(){if(isUp()) P.acc=pElapsed(); else P.left=pLeft(); P.running=false; pSave(); renderPomo(); renderMini();}
function pSetMode(m){P.mode=m; P.running=false; P.left=pDur(m); P.acc=0; pSave(); renderPomo(); renderMini();}
function pFinish(){          // 時間到
  const was=P.mode;
  if(was==='focus'){pLog(pDur('focus')); P.cycles++;}
  const next=pNext(); P.mode=next; P.left=pDur(next); P.running=false;
  if(PSET.auto){P.endAt=Date.now()+P.left*1000; P.running=true;}
  pSave(); beep(); notify(was==='focus'?`專注 ${PSET.focus} 分鐘完成！休息一下吧`:'休息結束，回來專注吧');
  renderPomo(); renderMini(); if(tab==='todo') renderTodo();
}
$('pStart').onclick=pStart;
$('pReset').onclick=()=>pSetMode(P.mode);
$('pSkip').onclick=()=>{
  if(P.mode==='focus'){const el=pElapsed(); if(el>=60) pLog(el); P.cycles++;}
  pSetMode(pNext());};
$('pFinish').onclick=()=>{  // 提早結束（正計時就是結束）：記錄已經專注的時間
  const el=pElapsed();
  if(el<60){alert('專注還不到 1 分鐘，這次不記錄。'); return;}
  pLog(el); if(isUp()) P.cycles++; pSetMode('focus');};
// 計時方式：倒數（選幾分鐘）／正計時（從 00:00 開始，自己按結束）
$('pUpSeg').onclick=async e=>{const b=e.target.closest('[data-u]'); if(!b) return; const up=b.dataset.u==='1'; if(up===PSET.countUp) return;
  if(pStarted()&&!await ask('計時中，確定要切換嗎？目前這段不會記錄。')) return;
  PSET.countUp=up; pSaveSet(); pSetMode('focus');};
/* 選時間：手機上點一下時間，跳出可以上下滑動的滾輪；電腦版用 ⚙️ 設定直接輸入分鐘 */
const isTouch=()=>matchMedia('(pointer:coarse)').matches;
const canPick=()=>!pStarted()&&!isUp();   // 還沒開始的倒數才可以改時間
const WH=36;   // 每一格高度(px)，要跟 CSS 的 .wh-it 一樣
let whMode='';
function wheelPaint(){
  const w=$('pWheel'), c=w.scrollTop/WH;
  w.querySelectorAll('.wh-it').forEach((el,i)=>{const d=Math.abs(i-c); el.style.opacity=Math.max(.15,1-d*.28); el.style.transform=`scale(${Math.max(.6,1-d*.13)})`;});
}
function openWheel(){
  const w=$('pWheel'), m=P.mode;
  if(whMode!==m){whMode=m; w.innerHTML='<div class="wh-pad"></div>'+Array.from({length:PMAX[m]},(_,i)=>`<div class="wh-it" data-v="${i+1}">${pad(i+1)}:00</div>`).join('')+'<div class="wh-pad"></div>';}
  $('pwTitle').textContent='選擇'+PLABEL[m]+'時間';
  $('pwModal').classList.remove('hidden');
  w.scrollTop=(PSET[m]-1)*WH; wheelPaint();
}
const closeWheel=()=>$('pwModal').classList.add('hidden');
$('pWheel').addEventListener('scroll',wheelPaint,{passive:true});
$('pWheel').onclick=e=>{const it=e.target.closest('.wh-it'); if(it) $('pWheel').scrollTo({top:(+it.dataset.v-1)*WH,behavior:'smooth'});};
$('pTime').onclick=()=>{if(!canPick()) return; isTouch()?openWheel():typeEdit();};
/* 電腦版：點時間直接打字改（輸入分鐘，例如 45；或 45:00）。Enter／點旁邊 = 套用，Esc = 取消 */
function typeEdit(){
  const inp=$('pTimeIn'); inp.value=String(PSET[P.mode]);
  $('pTime').classList.add('hidden'); inp.classList.remove('hidden'); inp.focus(); inp.select();
}
function typeDone(apply){
  const inp=$('pTimeIn'); if(inp.classList.contains('hidden')) return;
  inp.classList.add('hidden'); $('pTime').classList.remove('hidden');
  const m=P.mode, v=parseInt(inp.value.trim().split(':')[0],10);
  if(apply&&v>=1&&!pStarted()){PSET[m]=Math.min(PMAX[m],v); pSaveSet(); P.left=pDur(m); pSave(); renderMini();}
  renderPomo();
}
$('pTimeIn').onkeydown=e=>{if(e.isComposing) return; if(e.key==='Enter'){e.preventDefault(); typeDone(true);} else if(e.key==='Escape') typeDone(false);};
$('pTimeIn').onblur=()=>typeDone(true);
$('pwCancel').onclick=closeWheel;
$('pwModal').onclick=e=>{if(e.target.id==='pwModal') closeWheel();};
$('pwOk').onclick=()=>{
  const m=P.mode, v=Math.max(1,Math.min(PMAX[m],Math.round($('pWheel').scrollTop/WH)+1));
  closeWheel(); if(pStarted()) return;
  PSET[m]=v; pSaveSet(); P.left=pDur(m); pSave(); renderPomo(); renderMini();
};
$('pModeSeg').onclick=async e=>{const b=e.target.closest('[data-m]'); if(!b||b.dataset.m===P.mode) return;
  if(P.running&&!await ask('計時中，確定要切換嗎？目前這段不會記錄。')) return; pSetMode(b.dataset.m);};
$('pTask').onchange=e=>{P.todoId=e.target.value; pSave(); renderMini();};
$('pAddTask').onclick=()=>{const v=$('pNewTask').value.trim(); if(!v) return;
  const t={id:uid(),text:v,due:'',pri:2,done:false,created:Date.now()}; db.todos.push(t); save();
  P.todoId=t.id; pSave(); $('pNewTask').value=''; renderPomo();};
$('pNewTask').onkeydown=e=>{if(e.key==='Enter') $('pAddTask').click();};
let pPeriod='today';
function pRange(){const t=habitDay(); if(pPeriod==='today') return [t,addDays(t,1)]; if(pPeriod==='week'){const s=weekStart(t); return [s,addDays(s,7)];} return ['0000','9999'];}
$('pPeriodSeg').onclick=e=>{const b=e.target.closest('[data-p]'); if(b){pPeriod=b.dataset.p; renderPomo();}};
$('pLogList').onclick=async e=>{const id=e.target.dataset.pdel; if(id&&await ask('刪除這筆專注紀錄？')){db.pomos=db.pomos.filter(p=>p.id!==id); save(); renderPomo();}};
$('psBox').onchange=()=>{
  ['focus','short','long','every'].forEach(k=>PSET[k]=Math.max(1,Math.round(+$('ps_'+k).value)||PSET[k]));
  PSET.auto=$('ps_auto').checked; ls('pomoSet',JSON.stringify(PSET));
  if(!P.running) P.left=pDur(P.mode); pSave(); renderPomo();};
const taskName=p=>db.todos.find(x=>x.id===p.todoId)?.text||p.title||'（不指定工作）';
function renderPomo(){
  document.querySelectorAll('#pModeSeg .pbtn').forEach(b=>b.classList.toggle('on',b.dataset.m===P.mode));
  document.querySelectorAll('#pPeriodSeg .pbtn').forEach(b=>b.classList.toggle('on',b.dataset.p===pPeriod));
  const open=db.todos.filter(x=>!x.done||x.id===P.todoId);
  $('pTask').innerHTML='<option value="">（不指定工作）</option>'+open.map(x=>`<option value="${x.id}">${esc(x.text)}</option>`).join('');
  $('pTask').value=open.some(x=>x.id===P.todoId)?P.todoId:'';
  $('pStart').textContent=P.running?'⏸ 暫停':(pStarted()?'▶ 繼續':'▶ 開始');
  $('pFinish').classList.toggle('hidden',P.mode!=='focus'||(isUp()&&!pStarted()));
  $('pUpSeg').classList.toggle('hidden',P.mode!=='focus');
  document.querySelectorAll('#pUpSeg .pbtn').forEach(b=>b.classList.toggle('on',(b.dataset.u==='1')===!!PSET.countUp));
  $('pTime').classList.toggle('pickable',canPick());

  $('pCycle').textContent=`第 ${P.cycles%PSET.every+1} 輪 · 每 ${PSET.every} 輪後長休息一次`;
  pTickUI();
  const t=habitDay(), today=db.pomos.filter(p=>p.date===t);
  $('pToday').innerHTML=`<div class="stat"><div class="muted">今天專注</div><div class="v">${fmtDur(today.reduce((s,p)=>s+p.min,0))}</div></div>`+
    `<div class="stat"><div class="muted">今天完成</div><div class="v">${today.filter(p=>p.full).length} 🍅</div></div>`;
  const [a,b]=pRange(), logs=db.pomos.filter(p=>p.date>=a&&p.date<b), by={};
  logs.forEach(p=>{const k=p.todoId||'_'; by[k]??={title:taskName(p),min:0,n:0}; by[k].min+=p.min; if(p.full) by[k].n++;});
  const rows=Object.values(by).sort((x,y)=>y.min-x.min), mx=Math.max(1,...rows.map(r=>r.min));
  $('pByTask').innerHTML=rows.map(r=>`<div class="bar-row" style="grid-template-columns:minmax(0,1.3fr) 1fr 130px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.title)}</span><div class="bar-bg"><div class="bar" style="width:${r.min/mx*100}%;background:#e5484d"></div></div><span style="text-align:right">${fmtDur(r.min)} <span class="muted" style="font-size:12px">${r.n} 🍅</span></span></div>`).join('')
    ||'<div class="muted">這段期間還沒有專注紀錄</div>';
  $('pLogList').innerHTML=logs.slice().sort((x,y)=>y.at-x.at).slice(0,30).map(p=>`<li><span>🍅</span><span class="grow">${esc(taskName(p))}<div class="muted" style="font-size:12px">${p.date} ${new Date(p.at).toTimeString().slice(0,5)} 結束</div></span><strong>${fmtDur(p.min)}</strong><button class="x" data-pdel="${p.id}">✕</button></li>`).join('')
    ||'<li class="muted">沒有紀錄</li>';
  ['focus','short','long','every'].forEach(k=>$('ps_'+k).value=PSET[k]); $('ps_auto').checked=PSET.auto;
}
function pTickUI(){
  const C=2*Math.PI*90, ring=$('pRing'), up=isUp(), sec=pShown();
  $('pTime').textContent=fmtClock(sec);
  $('pModeLabel').textContent=canPick()?PLABEL[P.mode]+(isTouch()?' · 點時間可以調整':' · 點時間可以直接輸入'):(up?'正計時':PLABEL[P.mode])+(P.running?'中':(pStarted()?'（暫停）':''));
  // 倒數：剩下多少；正計時：每 60 分鐘繞一圈
  const frac=up?(sec%3600)/3600:sec/pDur(P.mode);
  ring.style.strokeDasharray=C; ring.style.strokeDashoffset=C*(1-frac);
  ring.style.stroke=P.mode==='focus'?'#e5484d':'#16a34a';
}
function beep(){
  try{const ac=new (window.AudioContext||window.webkitAudioContext)();
    [0,.35,.7].forEach(t=>{const o=ac.createOscillator(), g=ac.createGain(); o.frequency.value=880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(.25,ac.currentTime+t); g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+t+.3); o.start(ac.currentTime+t); o.stop(ac.currentTime+t+.3);});
  }catch(e){}
}
function notify(msg){try{if('Notification' in window&&Notification.permission==='granted') new Notification('🍅 番茄鐘',{body:msg});}catch(e){}}

/* 頂部的小計時器：在其他分頁也看得到番茄鐘、習慣計時 */
function renderMini(){
  let h='';
  if(tab!=='pomo'&&pStarted()){
    const t=db.todos.find(x=>x.id===P.todoId);
    h+=`<button class="mini" data-go="pomo" style="--c:${P.mode==='focus'?'#e5484d':'#16a34a'}">${P.mode==='focus'?'🍅':'☕'} ${fmtClock(pShown())}${P.running?'':' ⏸'}${t&&P.mode==='focus'?' · '+esc(t.text.slice(0,10)):''}</button>`;
  }
  const hb=db.habitTimer&&db.habits.find(x=>x.id===db.habitTimer.habitId);
  if(hb&&tab!=='habit') h+=`<button class="mini" data-go="habit" style="--c:${esc(hb.color)}">${esc(hb.icon)} ${fmtClock((Date.now()-db.habitTimer.start)/1000)}</button>`;
  $('miniTimers').innerHTML=h;
  document.title=(P.running?`${P.mode==='focus'?'🍅':'☕'} ${fmtClock(pShown())} · `:'')+'我的生活手帳';
}
$('miniTimers').onclick=e=>{const b=e.target.closest('[data-go]'); if(b) goTab(b.dataset.go);};
setInterval(()=>{
  if(P.running&&!isUp()&&Date.now()>=P.endAt) pFinish();
  if(tab==='pomo') pTickUI();
  document.querySelectorAll('.htimer').forEach(el=>el.textContent=fmtClock((Date.now()-+el.dataset.start)/1000));
  renderMini();
},1000);
if(P.running&&!isUp()&&Date.now()>=P.endAt) pFinish();   // 關掉頁面期間時間到了

/* ---------- 共用：時間格式 ---------- */
function fmtDur(min){min=Math.round(min); const h=Math.floor(min/60), m=min%60; return h?(m?`${h} 小時 ${m} 分`:`${h} 小時`):`${m} 分`;}
function fmtClock(sec){sec=Math.max(0,Math.round(sec)); const h=Math.floor(sec/3600), m=Math.floor(sec/60)%60, s=sec%60; return (h?h+':'+pad(m):pad(m))+':'+pad(s);}

/* ---------- 習慣紀錄 ---------- */
let hPeriod='week', hAnchor=habitDay();
function hRange(){
  if(hPeriod==='week'){const s=weekStart(hAnchor); return [s,addDays(s,7)];}
  const d=parse(hAnchor); return [ymd(new Date(d.getFullYear(),d.getMonth(),1)),ymd(new Date(d.getFullYear(),d.getMonth()+1,1))];
}
const sumMin=(hid,a,b)=>db.habitLogs.filter(l=>l.habitId===hid&&l.date>=a&&l.date<b).reduce((s,l)=>s+l.min,0);
function streak(hid){   // 連續幾天有紀錄（今天還沒做也從昨天往回算）
  const days=new Set(db.habitLogs.filter(l=>l.habitId===hid).map(l=>l.date));
  let d=habitDay(), n=0; if(!days.has(d)) d=addDays(d,-1);
  while(days.has(d)){n++; d=addDays(d,-1);} return n;
}
$('habitForm').onsubmit=e=>{e.preventDefault();
  db.habits.push({id:uid(),name:$('hName').value.trim(),icon:$('hIcon').value.trim()||'⭐',goal:+$('hGoal').value||0,color:COLORS[db.habits.length%COLORS.length]});
  $('hName').value=''; $('hGoal').value=''; save(); renderHabit();};
function renderHabit(){
  renderDaily(); renderHabStats();
  const t=habitDay(), ws=weekStart(t), we=addDays(ws,7), d=parse(t);
  const ms=ymd(new Date(d.getFullYear(),d.getMonth(),1)), me=ymd(new Date(d.getFullYear(),d.getMonth()+1,1));
  $('habitGrid').innerHTML=db.habits.map(h=>{
    const wk=sumMin(h.id,ws,we), mo=sumMin(h.id,ms,me), st=streak(h.id), running=db.habitTimer?.habitId===h.id;
    const days=Array.from({length:7},(_,i)=>addDays(ws,i)), dm=days.map(x=>sumMin(h.id,x,addDays(x,1))), mx=Math.max(60,...dm);
    const pct=h.goal?Math.min(100,wk/(h.goal*60)*100):0;
    return `<div class="card habit" data-h="${h.id}" style="--c:${esc(h.color)}">
      <div class="row"><span style="font-size:22px">${esc(h.icon)}</span><strong style="flex:1;font-size:16px">${esc(h.name)}</strong><button class="x" data-hdel title="刪除習慣">✕</button></div>
      <div class="hbig">${fmtDur(wk)}<span class="muted"> 本週</span></div>
      ${h.goal?`<div class="bar-bg"><div class="bar" style="width:${pct}%;background:var(--c)"></div></div><div class="muted small">每週目標 ${h.goal} 小時 · 已完成 ${Math.round(pct)}%</div>`:''}
      <div class="muted small">本月 ${fmtDur(mo)}${st?` · 🔥 連續 ${st} 天`:''}</div>
      <div class="hweek">${days.map((x,i)=>`<div title="${x}：${fmtDur(dm[i])}"><i style="height:${dm[i]/mx*52}px"></i><span class="${x===t?'t':''}">${WD[i]}</span></div>`).join('')}</div>
      <div class="row">${running
        ?`<button class="btn" data-hstop style="background:var(--red)">■ 停止 <span class="htimer" data-start="${db.habitTimer.start}">${fmtClock((Date.now()-db.habitTimer.start)/1000)}</span></button>`
        :`<button class="btn" data-hstart style="background:var(--c)">▶ 開始計時</button>`}<button class="ghost" data-hadd>＋ 手動記錄</button></div>
      <form class="hform hidden" data-hform>
        <input type="date" name="d" value="${t}" required>
        <div class="row"><input type="number" name="hh" min="0" step="1" placeholder="0" style="width:70px"> 小時 <input type="number" name="mm" min="0" max="59" step="1" placeholder="0" style="width:70px"> 分</div>
        <input type="text" name="note" placeholder="備註（選填），例如：練腿">
        <button class="btn">儲存紀錄</button>
      </form></div>`;
  }).join('')||'<div class="card muted">還沒有習慣，先在上面新增一個，例如「健身房 💪」。</div>';
  renderHabitStats();
}
function stopHabit(){
  const T=db.habitTimer; if(!T) return; db.habitTimer=null;
  const min=Math.round((Date.now()-T.start)/6e4);
  if(min<1) alert('不到 1 分鐘，這次不記錄。');
  else db.habitLogs.push({id:uid(),habitId:T.habitId,date:ymd(new Date(T.start)),min,note:''});
  save(); renderHabit(); renderMini();
}
$('habitGrid').onclick=async e=>{
  const card=e.target.closest('[data-h]'); if(!card) return; const id=card.dataset.h;
  if(e.target.closest('[data-hdel]')){
    if(!await ask('刪除這個習慣和它的所有紀錄？')) return;
    db.habits=db.habits.filter(h=>h.id!==id); db.habitLogs=db.habitLogs.filter(l=>l.habitId!==id);
    if(db.habitTimer?.habitId===id) db.habitTimer=null; save(); renderHabit(); renderMini(); return;}
  if(e.target.closest('[data-hstart]')){
    if(db.habitTimer){ if(!await ask('另一個習慣正在計時，要先停止並記錄它嗎？')) return; stopHabit(); }
    db.habitTimer={habitId:id,start:Date.now()}; save(); renderHabit(); renderMini(); return;}
  if(e.target.closest('[data-hstop]')) return stopHabit();
  if(e.target.closest('[data-hadd]')) card.querySelector('[data-hform]').classList.toggle('hidden');
};
$('habitGrid').onsubmit=e=>{e.preventDefault();
  const f=e.target, id=f.closest('[data-h]').dataset.h, min=(+f.hh.value||0)*60+(+f.mm.value||0);
  if(min<=0) return alert('請輸入時間');
  db.habitLogs.push({id:uid(),habitId:id,date:f.d.value,min,note:f.note.value.trim()}); save(); renderHabit();};
function renderHabitStats(){
  document.querySelectorAll('#hPeriodSeg .pbtn').forEach(b=>b.classList.toggle('on',b.dataset.p===hPeriod));
  const [a,b]=hRange(), pa=parse(a), pb=parse(addDays(b,-1));
  $('hPeriodTitle').textContent=hPeriod==='week'?`${pa.getMonth()+1}/${pa.getDate()} – ${pb.getMonth()+1}/${pb.getDate()}`:`${pa.getFullYear()} 年 ${pa.getMonth()+1} 月`;
  const logs=db.habitLogs.filter(l=>l.date>=a&&l.date<b);
  const hs=db.habits.map(h=>{const ls_=logs.filter(l=>l.habitId===h.id); return {h,min:ls_.reduce((s,l)=>s+l.min,0),n:ls_.length};}).sort((x,y)=>y.min-x.min);
  const mx=Math.max(1,...hs.map(x=>x.min)), tot=hs.reduce((s,x)=>s+x.min,0);
  const days=[]; for(let d=a; d<b; d=addDays(d,1)) days.push(d);
  const dayTot=days.map(d=>logs.filter(l=>l.date===d).reduce((s,l)=>s+l.min,0)), dmx=Math.max(60,...dayTot);
  const cols=days.map((d,i)=>`<div class="sc" title="${d}：${fmtDur(dayTot[i])}">`+
    db.habits.map(h=>{const m=logs.filter(l=>l.date===d&&l.habitId===h.id).reduce((s,l)=>s+l.min,0); return m?`<i style="height:${m/dmx*100}px;background:${esc(h.color)}"></i>`:''}).join('')+
    `<span>${hPeriod==='week'?WD[parse(d).getDay()]:parse(d).getDate()}</span></div>`).join('');
  $('hSummary').innerHTML=db.habits.length
    ?hs.map(x=>`<div class="bar-row" style="grid-template-columns:minmax(0,130px) 1fr 140px"><span>${esc(x.h.icon)} ${esc(x.h.name)}</span><div class="bar-bg"><div class="bar" style="width:${x.min/mx*100}%;background:${esc(x.h.color)}"></div></div><span style="text-align:right">${fmtDur(x.min)} <span class="muted" style="font-size:12px">${x.n} 次</span></span></div>`).join('')
      +`<div class="muted" style="margin-top:6px">合計 ${fmtDur(tot)}（約 ${(tot/60).toFixed(1)} 小時）</div><div class="stack">${cols}</div>`
    :'<div class="muted">還沒有習慣</div>';
  const hm=Object.fromEntries(db.habits.map(h=>[h.id,h]));
  $('hLogList').innerHTML=logs.slice().sort((x,y)=>y.date.localeCompare(x.date)).map(l=>{const h=hm[l.habitId]||{icon:'❔',name:'（已刪除）'};
    return `<li><span>${esc(h.icon)}</span><span class="grow">${esc(h.name)}${l.note?` <span class="muted">· ${esc(l.note)}</span>`:''}<div class="muted" style="font-size:12px">${l.date}</div></span><strong>${fmtDur(l.min)}</strong><button class="x" data-ldel="${l.id}">✕</button></li>`}).join('')
    ||'<li class="muted">這段期間沒有紀錄</li>';
}
$('hPeriodSeg').onclick=e=>{const b=e.target.closest('[data-p]'); if(b){hPeriod=b.dataset.p; renderHabitStats();}};
const hShift=n=>{if(hPeriod==='week') hAnchor=addDays(hAnchor,7*n); else{const d=parse(hAnchor); hAnchor=ymd(new Date(d.getFullYear(),d.getMonth()+n,1));} renderHabitStats();};
$('hPrev').onclick=()=>hShift(-1); $('hNext').onclick=()=>hShift(1);
$('hLogList').onclick=async e=>{const id=e.target.dataset.ldel; if(id&&await ask('刪除這筆紀錄？')){db.habitLogs=db.habitLogs.filter(l=>l.id!==id); save(); renderHabit();}};

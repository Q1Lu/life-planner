/* ---------- 每日任務（作息、飲食、保健、routine…）+ 段位 ---------- */
const SLOTS={m:'早',n:'午',e:'晚'};
// 段位看總經驗值 XP：習慣達標日、番茄鐘專注、完成待辦都會加分
const RANKS=[['青銅',0,'#c08457'],['白銀',150,'#9aa6b5'],['黃金',600,'#d4a72c'],['白金',1800,'#3fb8b0'],['鑽石',4000,'#5b8cff'],['大師',8000,'#b06cff']];
const RANK_RATE=0.8;                       // 一天完成 80% 以上算「達標日」
const XP_RULE={day:10,perfect:15,pomoMin:5,todo:5,todoImp:10,onTime:3};
let hDay=habitDay(), hEdit=false, hIdx=new Map(), suppSel={};
const byOrder=(a,b)=>(a.order||0)-(b.order||0);
const doneId=(ds,it,s)=>`${ds}|${it.id}|${s||''}`;
const getVal=(ds,it,s)=>hIdx.get(doneId(ds,it,s))?.val||0;
function setVal(ds,it,s,val){
  const id=doneId(ds,it,s), r=db.hdone.find(x=>x.id===id);
  if(r) r.val=val; else db.hdone.push({id,date:ds,itemId:it.id,slot:s||'',val});
  save();
}
const scheduled=(it,ds)=>(!it.days||it.days.includes(parse(ds).getDay()))&&(!it.created||it.created<=ds);
function itemProgress(ds,it){              // [完成量, 總量]
  if(it.type==='supp'){const sl=it.slots||[]; return [sl.filter(s=>getVal(ds,it,s)>0).length,sl.length];}
  if(it.type==='count') return [Math.min(1,getVal(ds,it)/(it.target||1)),1];
  if(it.type==='timer'){const m=sumMin(it.habitId,ds,addDays(ds,1)); return [it.target?Math.min(1,m/it.target):(m>0?1:0),1];}
  return [getVal(ds,it)>0?1:0,1];
}
const isDone=(ds,it)=>{const [a,b]=itemProgress(ds,it); return b>0&&a>=b;};
function dayStat(ds){let d=0,t=0,n=0,c=0; for(const it of db.hitems) if(scheduled(it,ds)){const [a,b]=itemProgress(ds,it); d+=a; t+=b; n++; if(b&&a>=b) c++;} return {rate:t?d/t:0,done:c,total:n};}
const daysLabel=d=>!d||d.length===7?'':d.join()==='1,2,3,4,5'?'平日':d.join()==='0,6'?'週末':d.map(x=>WD[x]).join('');

// 第一次使用：建立幾個通用的範例群組（之後都可以改）。
// 已經連過 Google 的裝置，先等雲端同步完再決定要不要建，避免跟別台裝置的資料重複。
function seedDaily(){
  if(db.hgroups.length||ls('hSeeded')) return;
  if(G.want&&!ls('syncLast')) return;            // 等第一次同步（driveSync 完成後會再呼叫）
  ls('hSeeded','1');
  const t='2000-01-01', g=(id,icon,name,kind,order)=>db.hgroups.push({id,icon,name,kind,order,u:1});
  let o=0; const it=(groupId,name,x={})=>db.hitems.push({id:'tpl-i'+(++o),groupId,name,note:'',type:'check',order:o,created:t,u:1,...x});
  g('tpl-g1','🌅','morning routine','routine',1);
  ['起床後喝一杯水','伸展 5 分鐘','列出今天最重要的一件事','整理床鋪'].forEach(n=>it('tpl-g1',n));
  g('tpl-g2','🛏️','作息','normal',2); it('tpl-g2','早睡早起'); it('tpl-g2','睡滿 7 小時');
  g('tpl-g3','🥗','飲食','normal',3);
  it('tpl-g3','喝水',{type:'count',target:2000,unit:'ml',step:250});
  it('tpl-g3','健康三餐',{type:'count',target:3,unit:'餐',step:1,note:'早·午·晚'});
  g('tpl-g4','💊','保健','supp',4); it('tpl-g4','維他命',{type:'supp',slots:['m']});
  g('tpl-g5','🌙','睡前檢查','normal',5); it('tpl-g5','記帳'); it('tpl-g5','準備明天要用的東西');
  save();
}
seedDaily();

/* 完成待辦的 XP 記在 db.xp：之後刪掉已完成的待辦，分數也不會不見 */
function todoXp(t){
  const id='xp|'+t.id, r=db.xp.find(x=>x.id===id);
  if(t.done){
    if(r&&r.pts>0) return;
    const dl=deadline(t), pts=(t.pri===3?XP_RULE.todoImp:XP_RULE.todo)+(dl&&Date.now()<=dl?XP_RULE.onTime:0);
    if(r) Object.assign(r,{pts,date:habitDay(),title:t.text}); else db.xp.push({id,src:'todo',ref:t.id,title:t.text,pts,date:habitDay()});
  }else if(r) r.pts=0;
}
db.todos.filter(t=>t.done&&!db.xp.some(x=>x.id==='xp|'+t.id)).forEach(t=>db.xp.push({id:'xp|'+t.id,src:'todo',ref:t.id,title:t.text,pts:t.pri===3?XP_RULE.todoImp:XP_RULE.todo,date:habitDay()}));

const habitXpOf=st=>st.total&&st.rate>=1?XP_RULE.perfect:st.rate>=RANK_RATE?XP_RULE.day:0;
function rankInfo(){
  hIdx=new Map(db.hdone.map(r=>[r.id,r]));
  const t=habitDay(), dates=db.hdone.filter(r=>r.val>0).map(r=>r.date).sort();
  let habit=0, days=0, streak=0;
  if(dates.length){
    for(let d=dates[0]; d<=t; d=addDays(d,1)){const x=habitXpOf(dayStat(d)); habit+=x; if(x) days++;}
    let d=t; if(dayStat(d).rate<RANK_RATE) d=addDays(d,-1);
    while(d>=dates[0]&&dayStat(d).rate>=RANK_RATE){streak++; d=addDays(d,-1);}
  }
  const pomoPts=p=>Math.floor(p.min/XP_RULE.pomoMin);
  const pomo=db.pomos.reduce((s,p)=>s+pomoPts(p),0), todo=db.xp.reduce((s,x)=>s+(x.pts||0),0);
  const today={habit:habitXpOf(dayStat(t)),pomo:db.pomos.filter(p=>p.date===t).reduce((s,p)=>s+pomoPts(p),0),todo:db.xp.filter(x=>x.date===t).reduce((s,x)=>s+(x.pts||0),0)};
  const total=habit+pomo+todo;
  let i=RANKS.length-1; while(i>0&&total<RANKS[i][1]) i--;
  return {total,habit,pomo,todo,days,streak,today,cur:RANKS[i],next:RANKS[i+1],ti:i};
}
function renderRank(R=rankInfo()){
  const [name,min,color]=R.cur, st=dayStat(habitDay()), tt=R.today.habit+R.today.pomo+R.today.todo;
  const pct=R.next?(R.total-min)/(R.next[1]-min)*100:100;
  const el=$('hRank'); el.style.setProperty('--rk',color);
  el.innerHTML=`<div class="rk-top"><span class="rk-label">RANK</span><span class="rk-name">${name}</span>
      <div class="rk-days"><b>${R.total.toLocaleString()}</b><span class="muted small">XP</span></div></div>
    <div class="rk-bar"><i style="width:${pct}%"></i></div>
    <div class="muted small">${R.next?`再 ${(R.next[1]-R.total).toLocaleString()} XP 晉升 <b style="color:${R.next[2]}">${R.next[0]}</b>`:'已經是最高段位 🎉'}${R.streak?` · 🔥 連續達標 ${R.streak} 天`:''}</div>
    <div class="rk-src">
      <div><span>🏃 習慣</span><b>${R.habit}</b><small>達標 ${R.days} 天${R.today.habit?` · 今天 +${R.today.habit}`:` · 今天 ${st.done}/${st.total}`}</small></div>
      <div><span>🍅 番茄鐘</span><b>${R.pomo}</b><small>今天 +${R.today.pomo}</small></div>
      <div><span>✅ 待辦</span><b>${R.todo}</b><small>今天 +${R.today.todo}</small></div>
    </div>
    <details class="muted small" style="margin-top:8px"><summary style="cursor:pointer">怎麼得分？（今天共 +${tt} XP）</summary>
      <div style="margin-top:6px;line-height:1.7">🏃 每日任務完成 ${RANK_RATE*100}% 以上 = 達標日 +${XP_RULE.day}，全部完成 +${XP_RULE.perfect}<br>
      🍅 每專注 ${XP_RULE.pomoMin} 分鐘 +1（一個 25 分鐘番茄 = +5）<br>
      ✅ 完成待辦 +${XP_RULE.todo}，🔴 重要 +${XP_RULE.todoImp}；有截止時間且準時完成再 +${XP_RULE.onTime}<br>
      段位：${RANKS.map(r=>`${r[0]} ${r[1].toLocaleString()}`).join(' → ')}</div></details>`;
}
/* 頂部段位徽章 + 得分提示 */
let rkLast=null, rkTimer=null;
function updateRankPill(){
  const R=rankInfo(), p=$('rankPill');
  p.style.setProperty('--c',R.cur[2]); p.textContent=`🏅 ${R.cur[0]} · ${R.total.toLocaleString()} XP`;
  if(rkLast){
    const d=R.total-rkLast.total;
    if(R.ti>rkLast.ti) toast(`🎉 晉升 ${R.cur[0]}！`,R.cur[2]);
    else if(d>0) toast(`+${d} XP`,R.cur[2]);
  }
  rkLast=R; if(tab==='rank') renderRankPage(R);
}
function toast(msg,color){
  const el=document.createElement('div'); el.className='toast'; el.textContent=msg; el.style.background=color||'var(--primary)';
  document.body.appendChild(el); setTimeout(()=>el.classList.add('out'),1600); setTimeout(()=>el.remove(),2100);
}
function renderRankPage(R=rankInfo()){
  renderRank(R); document.querySelector('#hRank details')?.setAttribute('open','');
  const t=habitDay(), days=Array.from({length:14},(_,i)=>addDays(t,i-13));
  const pp=p=>Math.floor(p.min/XP_RULE.pomoMin);
  const rows=days.map(d=>({d,h:habitXpOf(dayStat(d)),p:db.pomos.filter(x=>x.date===d).reduce((s,x)=>s+pp(x),0),t:db.xp.filter(x=>x.date===d).reduce((s,x)=>s+(x.pts||0),0)}));
  const mx=Math.max(20,...rows.map(r=>r.h+r.p+r.t));
  $('rkHist').innerHTML=rows.map(r=>{const tot=r.h+r.p+r.t, dd=parse(r.d);
    return `<div class="xc" title="${r.d}：習慣 ${r.h}、番茄 ${r.p}、待辦 ${r.t}"><span class="xv">${tot||''}</span><div class="xb">`+
      [['h','var(--amber)'],['p','#e5484d'],['t','var(--green)']].map(([k,c])=>r[k]?`<i style="height:${r[k]/mx*100}%;background:${c}"></i>`:'').join('')+
      `</div><span class="xd${r.d===t?' t':''}">${dd.getMonth()+1}/${dd.getDate()}</span></div>`;}).join('');
  $('rkTiers').innerHTML=RANKS.map(([n,min,c],i)=>{const got=R.total>=min, cur=i===R.ti;
    return `<div class="tier${cur?' cur':''}" style="--c:${c}"><span class="tdot"></span><b>${n}</b><span class="muted">${min.toLocaleString()} XP</span><span class="grow"></span>${cur?'<span class="htag">目前</span>':got?'✓':`<span class="muted small">還差 ${(min-R.total).toLocaleString()}</span>`}</div>`;}).join('');
}
{const as=window.afterSave; window.afterSave=()=>{as(); clearTimeout(rkTimer); rkTimer=setTimeout(updateRankPill,150);};}
$('rankPill').onclick=()=>{goTab('rank'); scrollTo({top:0});};
updateRankPill();

let hStatMode=ls('hStatMode')||'streak', hsView='week', hsAnchor=habitDay();
const ICOL=['#6aa3f5','#f6c453','#ef5350','#3ecf8e','#4fb3e8','#7dd3d8','#d4d43c','#a259f7','#f062b0','#a8d5a2','#e8a184','#8c9eff'];
const itemColor=it=>ICOL[[...it.id].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7)%ICOL.length];
const doneOn=(it,d)=>scheduled(it,d)&&isDone(d,it);
function itemStreak(it){        // 往回數連續完成的天數（今天還沒做就從昨天算；不用做的日子跳過）
  let d=habitDay(), n=0, guard=0; if(!doneOn(it,d)) d=addDays(d,-1);
  while(guard++<1500){ if(it.created&&d<it.created) break;
    if(!scheduled(it,d)){d=addDays(d,-1); continue;} if(!isDone(d,it)) break; n++; d=addDays(d,-1); }
  return n;
}
function itemTotal(it){
  const dates=new Set(it.type==='timer'?db.habitLogs.filter(l=>l.habitId===it.habitId).map(l=>l.date):db.hdone.filter(r=>r.itemId===it.id&&r.val>0).map(r=>r.date));
  let n=0; for(const d of dates) if(isDone(d,it)) n++; return n;
}
function renderHabStats(){
  hIdx=new Map(db.hdone.map(r=>[r.id,r]));
  document.querySelectorAll('#hsSeg .pbtn').forEach(b=>b.classList.toggle('on',b.dataset.v===hsView));
  const t=habitDay(), items=[...db.hgroups].sort(byOrder).flatMap(g=>db.hitems.filter(i=>i.groupId===g.id).sort(byOrder));
  if(!items.length){$('hsBody').innerHTML='<div class="muted">還沒有每日任務</div>'; return;}
  if(hsView==='week'){
    const ws=weekStart(hsAnchor), days=Array.from({length:7},(_,i)=>addDays(ws,i)), we=parse(days[6]), wsD=parse(ws);
    $('hsTitle').textContent=ws===weekStart(t)?'本週':`${wsD.getMonth()+1}/${wsD.getDate()} – ${we.getMonth()+1}/${we.getDate()}`;
    let ok=0, sched=0, dayOk=0;
    const rows=items.map(it=>`<div class="hsr"><span class="hsn" title="${esc(it.name)}">${esc(it.name)}</span>`+days.map(d=>{
      const sc=scheduled(it,d), dn=sc&&isDone(d,it); if(sc&&d<=t){sched++; if(dn) ok++;}
      return `<i class="sq${dn?' on':''}${!sc?' rest':''}${d>t?' fut':''}" style="${dn?'background:'+itemColor(it):''}" title="${d}${dn?' ✓':''}"></i>`;}).join('')+'</div>').join('');
    days.forEach(d=>{if(d<=t&&dayStat(d).rate>=RANK_RATE) dayOk++;});
    $('hsBody').innerHTML=`<div class="hsnum"><div><b>${ok}</b><span>完成次數</span></div><div><b>${sched?Math.round(ok/sched*100):0}%</b><span>完成率</span></div><div><b>${dayOk}</b><span>達標天數</span></div></div>
      <div class="hsr hsh"><span class="hsn"></span>${days.map((d,i)=>`<span class="${d===t?'t':''}">${WD[i]}</span>`).join('')}</div>${rows}`;
  }else{
    const a=parse(hsAnchor), y=a.getFullYear(), m=a.getMonth(), n=new Date(y,m+1,0).getDate(), first=new Date(y,m,1).getDay();
    $('hsTitle').textContent=`${y} 年 ${m+1} 月`;
    $('hsBody').innerHTML='<div class="hsm">'+items.map(it=>{
      let cells='<i></i>'.repeat(first), c=0, sc_=0;
      for(let d=1; d<=n; d++){const ds=`${y}-${pad(m+1)}-${pad(d)}`, sc=scheduled(it,ds), dn=sc&&isDone(ds,it); if(sc&&ds<=t){sc_++; if(dn) c++;}
        cells+=`<b class="${dn?'on':''}${!sc?' rest':''}${ds>t?' fut':''}${ds===t?' t':''}" style="${dn?'background:'+itemColor(it):''}">${d}</b>`;}
      return `<div class="hmc"><div class="hmt"><span class="dot" style="background:${itemColor(it)}"></span>${esc(it.name)}</div><div class="hmg">${cells}</div>
        <div class="hmf"><span>◔ ${sc_?Math.round(c/sc_*100):0}%</span><span>✓ ${c}</span></div></div>`;}).join('')+'</div>';
  }
}
$('hsSeg').onclick=e=>{const b=e.target.closest('[data-v]'); if(b){hsView=b.dataset.v; renderHabStats();}};
const hsShift=n=>{if(hsView==='week') hsAnchor=addDays(hsAnchor,7*n); else{const d=parse(hsAnchor); hsAnchor=ymd(new Date(d.getFullYear(),d.getMonth()+n,1));} renderHabStats();};
$('hsPrev').onclick=()=>hsShift(-1); $('hsNext').onclick=()=>hsShift(1);

function renderHabWeek(){
  const t=habitDay(), ws=weekStart(hDay); let sum=0, ok=0;
  $('hWeek').innerHTML=Array.from({length:7},(_,i)=>{
    const d=addDays(ws,i), st=dayStat(d), future=d>t, pct=Math.round(st.rate*100), good=st.rate>=RANK_RATE;
    if(!future){sum+=st.rate; if(good) ok++;}
    return `<button class="${d===hDay?'sel':''}" data-d="${d}" title="${d}：${st.done}/${st.total}">
      <span class="pc">${future?'':pct+'%'}</span><span class="bar-v"><i class="${good?'ok':''}" style="height:${future?0:pct}%"></i></span>
      <span class="wd${d===t?' t':''}">${WD[i]}</span></button>`;
  }).join('');
  $('hWeekSum').textContent=`達標 ${ok} 天`;
}
$('hWeek').onclick=e=>{const b=e.target.closest('[data-d]'); if(b){hDay=b.dataset.d; renderDaily();}};
function renderDaily(){
  hIdx=new Map(db.hdone.map(r=>[r.id,r]));
  renderHabWeek();
  const d=parse(hDay), t=habitDay();
  $('hdTitle').textContent=`${d.getMonth()+1}/${d.getDate()}（${WD[d.getDay()]}）${hDay===t?' 今天':''}`;
  const st=dayStat(hDay); $('hdCount').textContent=`今日任務 ${st.done} / ${st.total}`;
  $('hEditBtn').textContent=hEdit?'✓ 完成':'✏️ 編輯';
  const running=db.habitTimer;
  let h='';
  for(const g of [...db.hgroups].sort(byOrder)){
    const all=db.hitems.filter(i=>i.groupId===g.id).sort(byOrder);
    const items=hEdit?all:all.filter(i=>scheduled(i,hDay));
    if(!items.length&&!hEdit) continue;
    const live=items.filter(i=>scheduled(i,hDay)), gc=live.filter(i=>isDone(hDay,i)).length;
    h+=`<div class="hg"><div class="hg-head"><span class="grow">${esc(g.icon||'')} ${esc(g.name)}</span>`+
      (hEdit?`<span class="hedit"><button data-act="gup" data-g="${g.id}" title="上移">↑</button><button data-act="gdown" data-g="${g.id}" title="下移">↓</button><button data-act="gedit" data-g="${g.id}" title="編輯群組">✏️</button><button data-act="gdel" data-g="${g.id}" title="刪除群組">🗑</button></span>`
        :`<span class="cnt">${gc} / ${live.length}</span>${g.kind==='routine'&&live.length?(gc===live.length?'<span class="hrun" style="background:var(--green)">✓ 完成</span>':`<button class="hrun" data-act="run" data-g="${g.id}">▶ ${gc?'繼續':'開始'}</button>`):''}`)+'</div>';
    let list=items;
    if(g.kind==='supp'&&!hEdit){           // 保健：早／午／晚 進度，點一下只看那個時段
      const sl=Object.keys(SLOTS).filter(s=>items.some(i=>(i.slots||[]).includes(s)));
      if(sl.length>1) h+='<div class="schips">'+sl.map(s=>{const its=items.filter(i=>(i.slots||[]).includes(s)), c=its.filter(i=>getVal(hDay,i,s)>0).length;
        return `<button class="schip${c===its.length?' full':''}${suppSel[g.id]===s?' sel':''}" data-act="slot" data-g="${g.id}" data-s="${s}">${SLOTS[s]} ${c}/${its.length}</button>`;}).join('')+'</div>';
      if(suppSel[g.id]) list=items.filter(i=>(i.slots||[]).includes(suppSel[g.id]));
    }
    list.forEach((it,k)=>{
      const on=scheduled(it,hDay), done=on&&isDone(hDay,it), dl=daysLabel(it.days);
      const lead=g.kind==='routine'?`<span class="hnum">${k+1}</span>`:'';
      let left='', side='';
      if(it.type==='supp'){
        side=(it.slots||[]).map(s=>`<button class="slotb${it.must?' must':''}${getVal(hDay,it,s)?' on':''}" data-act="chk" data-i="${it.id}" data-s="${s}">${SLOTS[s]}</button>`).join('');
      }else{
        left=`<button class="hck${done?' on':''}" data-act="chk" data-i="${it.id}"></button>`;
        if(it.type==='count') side=`<button class="hstep" data-act="dec" data-i="${it.id}">−</button><span>${getVal(hDay,it)} / ${it.target} ${esc(it.unit||'')}</span><button class="hstep" data-act="inc" data-i="${it.id}">+</button>`;
        if(it.type==='timer'){
          const m=sumMin(it.habitId,hDay,addDays(hDay,1)), run=running?.habitId===it.habitId;
          side=`<span>${run?'<span class="htimer" data-start="'+running.start+'">'+fmtClock((Date.now()-running.start)/1000)+'</span>':fmtDur(m)+(it.target?' / '+it.target+' 分':'')}</span>`+
            (hDay===t?`<button class="hstep" data-act="${run?'tstop':'tstart'}" data-i="${it.id}" title="${run?'停止並記錄':'開始計時'}">${run?'■':'▶'}</button>`:'');
        }
      }
      const tags=(dl?`<span class="htag">${dl}</span>`:'')+(it.must?'<span class="htag must">必吃</span>':'')+(hEdit&&!on?'<span class="htag">今天休息</span>':'');
      const edit=hEdit?`<span class="hedit"><button data-act="iup" data-i="${it.id}">↑</button><button data-act="idown" data-i="${it.id}">↓</button><button data-act="iedit" data-i="${it.id}">✏️</button></span>`:'';
      const stat=hEdit?'':(hStatMode==='total'?`<button class="hstat" data-act="stat" title="點一下切換成「當前連續」"><b>${itemTotal(it)}</b><small>總天數</small></button>`
        :`<button class="hstat" data-act="stat" title="點一下切換成「總天數」"><b>${itemStreak(it)}</b><small>當前連續</small></button>`);
      h+=`<div class="hi${done?' done':''}${on?'':' off'}">${lead}${hEdit?'':left}<div class="hi-main"><div class="hi-name">${esc(it.name)} ${tags}</div>${it.note?`<div class="hi-note">${esc(it.note)}</div>`:''}</div><div class="hi-side">${hEdit?'':side}</div>${stat}${edit}</div>`;
    });
    if(hEdit) h+=`<button class="hadd" data-act="iadd" data-g="${g.id}">＋ 在「${esc(g.name)}」新增項目</button>`;
    h+='</div>';
  }
  if(hEdit) h+=`<button class="hadd" data-act="gadd" style="margin-top:18px">＋ 新增群組</button>`;
  $('hToday').innerHTML=h||'<div class="muted">今天沒有任務。按右上「✏️ 編輯」新增群組和項目。</div>';
}
function moveOrder(list,item,dir){
  list.sort(byOrder).forEach((x,i)=>x.order=i*10);
  const i=list.indexOf(item), j=i+dir; if(j<0||j>=list.length) return;
  [list[i].order,list[j].order]=[list[j].order,list[i].order];
}
$('hToday').onclick=e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  const act=b.dataset.act, it=db.hitems.find(x=>x.id===b.dataset.i), g=db.hgroups.find(x=>x.id===b.dataset.g);
  switch(act){
    case 'chk':
      if(it.type==='count') setVal(hDay,it,'',getVal(hDay,it)>=it.target?0:it.target);
      else if(it.type==='timer') return alert('計時項目請按右邊的 ▶ 開始計時，達到目標就會自動打勾。');
      else {const s=b.dataset.s||''; setVal(hDay,it,s,getVal(hDay,it,s)?0:1);}
      break;
    case 'inc': case 'dec': setVal(hDay,it,'',Math.max(0,getVal(hDay,it)+(act==='inc'?1:-1)*(it.step||1))); break;
    case 'tstart':
      if(db.habitTimer){if(!confirm('另一個計時正在進行，要先停止並記錄它嗎？')) return; stopHabit();}
      db.habitTimer={habitId:it.habitId,start:Date.now()}; save(); renderMini(); break;
    case 'tstop': return stopHabit();
    case 'run': return openRoutine(g.id);
    case 'stat': hStatMode=hStatMode==='total'?'streak':'total'; ls('hStatMode',hStatMode); return renderDaily();
    case 'slot': suppSel[g.id]=suppSel[g.id]===b.dataset.s?'':b.dataset.s; break;
    case 'iadd': return openItemEd(null,g.id);
    case 'iedit': return openItemEd(it);
    case 'iup': case 'idown': moveOrder(db.hitems.filter(x=>x.groupId===it.groupId),it,act==='iup'?-1:1); save(); break;
    case 'gup': case 'gdown': moveOrder(db.hgroups,g,act==='gup'?-1:1); save(); break;
    case 'gedit': return openGroupEd(g);
    case 'gadd': return openGroupEd(null);
    case 'gdel':
      if(!confirm(`刪除「${g.name}」和裡面的所有項目？`)) return;
      db.hitems=db.hitems.filter(x=>x.groupId!==g.id); db.hgroups=db.hgroups.filter(x=>x!==g); save(); break;
  }
  renderHabit();
};
$('hEditBtn').onclick=()=>{hEdit=!hEdit; renderDaily();};
$('hdPrev').onclick=()=>{hDay=addDays(hDay,-1); renderDaily();};
$('hdNext').onclick=()=>{hDay=addDays(hDay,1); renderDaily();};

/* 項目編輯視窗 */
let hiEditing=null, hiSlots=[], hiDays=[];
const paintSeg=(id,attr,vals)=>document.querySelectorAll(`#${id} .pbtn`).forEach(b=>b.classList.toggle('on',vals.includes(b.dataset[attr])));
function hiTypeUI(){const t=$('hiType').value; $('hiCount').classList.toggle('hidden',t!=='count'); $('hiTimer').classList.toggle('hidden',t!=='timer'); $('hiSupp').classList.toggle('hidden',t!=='supp');}
function openItemEd(it,groupId){
  hiEditing=it; $('hiTitle').textContent=it?'編輯項目':'新增項目';
  $('hiGroup').innerHTML=[...db.hgroups].sort(byOrder).map(g=>`<option value="${g.id}">${esc(g.icon||'')} ${esc(g.name)}</option>`).join('');
  $('hiHabit').innerHTML=db.habits.map(h=>`<option value="${h.id}">${esc(h.icon)} ${esc(h.name)}</option>`).join('')+'<option value="__new">＋ 用這個名稱新增一個計時習慣</option>';
  const gid=it?it.groupId:groupId, kind=db.hgroups.find(g=>g.id===gid)?.kind;
  $('hiName').value=it?.name||''; $('hiNote').value=it?.note||''; $('hiGroup').value=gid;
  $('hiType').value=it?.type||(kind==='supp'?'supp':'check');
  $('hiTarget').value=it?.target||''; $('hiUnit').value=it?.unit||''; $('hiStep').value=it?.step||1;
  $('hiHabit').value=it?.habitId&&db.habits.some(h=>h.id===it.habitId)?it.habitId:'__new'; $('hiMin').value=it?.target??0;
  hiSlots=[...(it?.slots||['m'])]; $('hiMust').checked=!!it?.must;
  hiDays=(it?.days||[0,1,2,3,4,5,6]).map(String);
  paintSeg('hiSlots','s',hiSlots); paintSeg('hiDays','d',hiDays); hiTypeUI();
  $('hiDel').classList.toggle('hidden',!it);
  $('hiModal').classList.remove('hidden'); $('hiName').focus();
}
$('hiType').onchange=hiTypeUI;
$('hiSlots').onclick=e=>{const b=e.target.closest('[data-s]'); if(!b) return; const s=b.dataset.s; hiSlots=hiSlots.includes(s)?hiSlots.filter(x=>x!==s):[...hiSlots,s]; paintSeg('hiSlots','s',hiSlots);};
$('hiDays').onclick=e=>{const b=e.target.closest('[data-d]'); if(!b) return; const d=b.dataset.d; hiDays=hiDays.includes(d)?hiDays.filter(x=>x!==d):[...hiDays,d]; paintSeg('hiDays','d',hiDays);};
$('hiForm').addEventListener('click',e=>{const q=e.target.dataset.q; if(!q) return; hiDays=q==='all'?['0','1','2','3','4','5','6']:['1','2','3','4','5']; paintSeg('hiDays','d',hiDays);});
const closeHi=()=>$('hiModal').classList.add('hidden');
$('hiCancel').onclick=closeHi; $('hiModal').onclick=e=>{if(e.target.id==='hiModal') closeHi();};
$('hiDel').onclick=()=>{if(confirm(`刪除「${hiEditing.name}」？`)){db.hitems=db.hitems.filter(x=>x!==hiEditing); save(); closeHi(); renderHabit();}};
$('hiForm').onsubmit=e=>{e.preventDefault();
  const type=$('hiType').value, days=hiDays.map(Number).sort();
  if(type==='supp'&&!hiSlots.length) return alert('請至少選一個時段');
  if(!days.length) return alert('請至少選一天');
  const d={name:$('hiName').value.trim(),note:$('hiNote').value.trim(),type,groupId:$('hiGroup').value,days:days.length===7?null:days};
  if(type==='count') Object.assign(d,{target:Math.max(1,+$('hiTarget').value||1),unit:$('hiUnit').value.trim(),step:Math.max(1,+$('hiStep').value||1)});
  if(type==='timer'){
    let hid=$('hiHabit').value;
    if(hid==='__new'){hid=uid(); db.habits.push({id:hid,name:d.name,icon:'⏱',goal:0,color:COLORS[db.habits.length%COLORS.length]});}
    Object.assign(d,{habitId:hid,target:Math.max(0,+$('hiMin').value||0)});
  }
  if(type==='supp') Object.assign(d,{slots:Object.keys(SLOTS).filter(s=>hiSlots.includes(s)),must:$('hiMust').checked});
  if(hiEditing){['target','unit','step','habitId','slots','must'].forEach(k=>delete hiEditing[k]); Object.assign(hiEditing,d);}
  else db.hitems.push({id:uid(),order:Date.now(),created:habitDay(),...d});
  save(); closeHi(); renderHabit();};

/* 群組編輯視窗 */
let hgEditing=null;
function openGroupEd(g){
  hgEditing=g; $('hgTitle').textContent=g?'編輯群組':'新增群組';
  $('hgIcon').value=g?.icon||'📋'; $('hgName').value=g?.name||''; $('hgKind').value=g?.kind||'normal';
  $('hgModal').classList.remove('hidden'); $('hgName').focus();
}
const closeHg=()=>$('hgModal').classList.add('hidden');
$('hgCancel').onclick=closeHg; $('hgModal').onclick=e=>{if(e.target.id==='hgModal') closeHg();};
$('hgForm').onsubmit=e=>{e.preventDefault();
  const d={icon:$('hgIcon').value.trim(),name:$('hgName').value.trim(),kind:$('hgKind').value};
  if(hgEditing) Object.assign(hgEditing,d); else db.hgroups.push({id:uid(),order:Date.now(),...d});
  save(); closeHg(); renderHabit();};

/* Routine：一步一步照順序做 */
let RT=null;
function openRoutine(gid){
  const g=db.hgroups.find(x=>x.id===gid);
  const list=db.hitems.filter(i=>i.groupId===gid&&scheduled(i,hDay)).sort(byOrder);
  RT={g,list,idx:-1,start:Date.now(),ended:false}; rtNext();
  $('rtModal').classList.remove('hidden');
}
function rtNext(){                          // 跳到下一個還沒完成的步驟
  hIdx=new Map(db.hdone.map(r=>[r.id,r]));
  let i=RT.idx+1; while(i<RT.list.length&&isDone(hDay,RT.list[i])) i++;
  RT.idx=i; rtShow();
}
function rtShow(){
  const n=RT.list.length, done=RT.list.filter(i=>isDone(hDay,i)).length, it=RT.list[RT.idx];
  $('rtGroup').textContent=`${RT.g.icon||''} ${RT.g.name}`;
  $('rtBar').style.width=(done/n*100)+'%';
  if(!it){
    RT.ended=true;
    $('rtStep').textContent=`${done} / ${n} 完成`; $('rtName').textContent=done===n?'🎉 全部完成！':'這輪走完了';
    $('rtNote').textContent=done===n?'做得好，今天的 routine 達成了':'有跳過的步驟，可以之後再回來勾';
    $('rtDone').textContent='關閉'; $('rtSkip').classList.add('hidden'); return;
  }
  $('rtStep').textContent=`第 ${RT.idx+1} / ${n} 步 · 已完成 ${done}`;
  $('rtName').textContent=it.name; $('rtNote').textContent=it.note||'';
  $('rtDone').textContent='✓ 完成，下一步'; $('rtSkip').classList.remove('hidden');
}
$('rtDone').onclick=()=>{
  if(RT.ended) return $('rtClose').onclick();
  const it=RT.list[RT.idx];
  if(it.type==='count') setVal(hDay,it,'',it.target);
  else if(it.type==='supp') (it.slots||[]).forEach(s=>setVal(hDay,it,s,1));
  else if(it.type!=='timer') setVal(hDay,it,'',1);
  rtNext();
};
$('rtSkip').onclick=rtNext;
$('rtClose').onclick=()=>{$('rtModal').classList.add('hidden'); RT=null; renderHabit();};
setInterval(()=>{if(RT) $('rtClock').textContent='⏱ 已經 '+fmtClock((Date.now()-RT.start)/1000);},1000);

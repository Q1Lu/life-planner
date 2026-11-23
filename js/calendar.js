/* ---------- 行事曆 ---------- */
let view=new Date(); view.setDate(1); let sel=todayStr();
let calView=ls('calView')||'month';                 // year | month | week | day | list
const showLocal=Object.assign({ev:true,todo:true,cd:true},jget('showLocal')||{});
const WD='日一二三四五六';
const HH=48;                                         // 時間軸每小時的高度(px)
const toMin=s=>{const[h,m]=s.split(':').map(Number);return h*60+m};
const minToHm=m=>{m=Math.max(0,Math.min(1439,Math.round(m)));return pad(Math.floor(m/60))+':'+pad(m%60)};
const wrapHm=m=>minToHm(((m%1440)+1440)%1440);
const isoLocal=ms=>{const d=new Date(ms);return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`};
const addDays=(ds,n)=>{const d=parse(ds);d.setDate(d.getDate()+n);return ymd(d)};
const weekStart=ds=>addDays(ds,-parse(ds).getDay());
const findEv=id=>[...db.events,...G.events].find(x=>x.id===id);

function localOn(ds){
  if(!showLocal.ev) return [];
  const d=parse(ds);
  return db.events.filter(ev=>{
    const s=parse(ev.date); if(d<s) return false;
    if(ev.date===ds) return true;
    if(ev.repeat==='w') return d.getDay()===s.getDay();
    if(ev.repeat==='m') return d.getDate()===s.getDate();
    if(ev.repeat==='y') return d.getDate()===s.getDate()&&d.getMonth()===s.getMonth();
    return false;
  });
}
function eventsOn(ds){
  const gs=G.events.filter(ev=>ev.endDate?(ev.date<=ds&&ds<ev.endDate):ev.date===ds);
  return [...localOn(ds),...gs].sort((a,b)=>(a.start||'99').localeCompare(b.start||'99'));
}
const todosOn=ds=>showLocal.todo?db.todos.filter(x=>x.due===ds):[];
const cdsOn=()=>[];   // 倒數分頁已移除，改成待辦的截止倒數
const evLi=ev=>`<li data-ev="${esc(ev.id)}" style="cursor:pointer"><span class="dot" style="background:${esc(ev.color)}"></span><span class="grow">${esc(ev.title)}${ev.calName&&G.show.length>1?`<div class="muted" style="font-size:12px">📅 ${esc(ev.calName)}</div>`:''}${ev.note?`<div class="muted" style="font-size:13px">${esc(ev.note)}</div>`:''}</span><span class="muted">${ev.start||'整天'}${ev.end?'–'+ev.end:''}</span></li>`;
const todoLi=x=>`<li><input type="checkbox" data-tg="${x.id}" ${x.done?'checked':''}><span class="grow todo-edit ${x.done?'done-text':''}" data-edit="${x.id}">${esc(x.text)}</span><span class="tag">${x.dueTime?x.dueTime+' 截止':'待辦'}</span></li>`;
const cdLi=x=>`<li><span class="dot" style="background:var(--amber)"></span><span class="grow">⏳ ${esc(x.name)}</span><span class="muted">${x.date.slice(11)}</span></li>`;

// 目前視圖需要向 Google 讀取的日期範圍
function calRange(){
  if(calView==='month'){const s=new Date(view);s.setDate(1-view.getDay());const e=new Date(s);e.setDate(s.getDate()+42);return[s,e];}
  if(calView==='year') return [new Date(view.getFullYear(),0,1),new Date(view.getFullYear()+1,0,1)];
  const s0=calView==='week'?weekStart(sel):sel;
  return [parse(s0),parse(addDays(s0,{week:7,day:1,list:30}[calView]))];
}
function setView(v){calView=v; ls('calView',v); renderCal();}
function shift(n){
  if(calView==='month') view.setMonth(view.getMonth()+n);
  else if(calView==='year') view.setFullYear(view.getFullYear()+n);
  else{sel=addDays(sel,n*{week:7,day:1,list:30}[calView]); const d=parse(sel); view=new Date(d.getFullYear(),d.getMonth(),1);}
  renderCal();
}

function renderCal(){
  if(tgDrag) return;                       // 拖曳中不要重畫
  const pane=calView==='week'||calView==='day'?'time':calView;
  ['month','time','list','year'].forEach(v=>$('v-'+v).classList.toggle('hidden',v!==pane));
  document.querySelectorAll('.vbtn').forEach(b=>b.classList.toggle('on',b.dataset.v===calView));
  const sd=parse(sel), ws=parse(weekStart(sel)), we=parse(addDays(weekStart(sel),6));
  $('monthTitle').textContent=
    calView==='year'?`${view.getFullYear()} 年`:
    calView==='day'?`${sd.getMonth()+1} 月 ${sd.getDate()} 日（${WD[sd.getDay()]}）`:
    calView==='week'?`${ws.getMonth()+1}/${ws.getDate()} – ${we.getMonth()+1}/${we.getDate()}`:
    calView==='list'?`${sd.getMonth()+1}/${sd.getDate()} 起 30 天`:
    `${view.getFullYear()} 年 ${view.getMonth()+1} 月`;
  if(calView==='month') renderMonth();
  else if(calView==='year') renderYear();
  else if(calView==='list') renderList();
  else renderTime(calView==='week'?Array.from({length:7},(_,i)=>addDays(weekStart(sel),i)):[sel]);
  renderDrawer();
  gSync();
}

/* 月檢視 + 右側當天清單 */
function renderMonth(){
  let h=WD.split('').map(d=>`<div class="dow">${d}</div>`).join('');
  const start=new Date(view); start.setDate(1-view.getDay());
  const t=todayStr();
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const ds=ymd(d);
    if(i===35 && d.getMonth()!==view.getMonth()) break;
    let chips=eventsOn(ds).map(ev=>`<div class="chip" style="background:${esc(ev.color)};color:${esc(ev.fg||'#fff')}">${ev.start?ev.start+' ':''}${esc(ev.title)}</div>`).join('');
    chips+=todosOn(ds).map(x=>`<div class="chip todo ${x.done?'done':''}">☐ ${esc(x.text)}</div>`).join('');
    chips+=cdsOn(ds).map(x=>`<div class="chip cd">⏳ ${esc(x.name)}</div>`).join('');
    h+=`<div class="day ${d.getMonth()!==view.getMonth()?'other':''} ${ds===t?'today':''} ${ds===sel?'sel':''}" data-d="${ds}"><div class="n">${d.getDate()}</div>${chips}</div>`;
  }
  $('calGrid').innerHTML=h;
  const sd=parse(sel);
  $('selTitle').textContent=`${sd.getMonth()+1}/${sd.getDate()}（${WD[sd.getDay()]}）`;
  const li=eventsOn(sel).map(evLi).join('')+todosOn(sel).map(todoLi).join('')+cdsOn(sel).map(cdLi).join('');
  $('dayList').innerHTML=li||'<li class="muted">這天沒有安排</li>';
  const m=db.money.filter(x=>x.date===sel); const e=m.filter(x=>x.type==='exp').reduce((a,b)=>a+b.amt,0);
  $('dayMoney').textContent=m.length?`當日支出 ${money(e)}，共 ${m.length} 筆紀錄`:'';
}
$('calGrid').onclick=e=>{const d=e.target.closest('.day'); if(!d) return;
  if(sel===d.dataset.d){openEv(null,sel);return;}  // 再點一次 = 新增
  sel=d.dataset.d; const pd=parse(sel); if(pd.getMonth()!==view.getMonth()){view=new Date(pd.getFullYear(),pd.getMonth(),1);} renderCal();};

/* 行程列表 */
function renderList(){
  let h=''; const t=todayStr();
  for(let i=0;i<30;i++){
    const ds=addDays(sel,i), evs=eventsOn(ds), tds=todosOn(ds), cds=cdsOn(ds);
    if(!evs.length&&!tds.length&&!cds.length) continue;
    const d=parse(ds);
    h+=`<li class="lhead">${d.getMonth()+1}/${d.getDate()}（${WD[d.getDay()]}）${ds===t?' · 今天':''}</li>`+evs.map(evLi).join('')+tds.map(todoLi).join('')+cds.map(cdLi).join('');
  }
  $('agenda').innerHTML=h||'<li class="muted">這 30 天沒有安排</li>';
}

/* 年檢視 */
function renderYear(){
  const y=view.getFullYear(), t=todayStr(); let h='';
  for(let m=0;m<12;m++){
    const first=new Date(y,m,1), n=new Date(y,m+1,0).getDate();
    let cells=WD.split('').map(w=>`<i>${w}</i>`).join('')+'<i></i>'.repeat(first.getDay());
    for(let d=1;d<=n;d++){
      const ds=`${y}-${pad(m+1)}-${pad(d)}`, has=eventsOn(ds).length||todosOn(ds).length||cdsOn(ds).length;
      cells+=`<b data-d="${ds}" class="${ds===t?'t':''}${has?' has':''}">${d}</b>`;
    }
    h+=`<div><div class="ymt" data-m="${m}">${m+1} 月</div><div class="yg">${cells}</div></div>`;
  }
  $('v-year').innerHTML=`<div class="ygrid">${h}</div>`;
}
$('v-year').onclick=e=>{
  const b=e.target.closest('[data-d]'), mt=e.target.closest('[data-m]');
  if(b){sel=b.dataset.d; const d=parse(sel); view=new Date(d.getFullYear(),d.getMonth(),1); setView('month');}
  else if(mt){view=new Date(view.getFullYear(),+mt.dataset.m,1); setView('month');}};

/* 週／日 時間軸 */
function allDayOn(ds){
  return [...localOn(ds).filter(ev=>!ev.start),...G.events.filter(ev=>ev.endDate&&ev.date<=ds&&ds<ev.endDate)];
}
function pack(segs){                       // 重疊的行程並排
  segs.sort((a,b)=>a.s-b.s||b.e-a.e);
  const groups=[]; let cur=[], end=-1;
  for(const g of segs){ if(g.s>=end&&cur.length){groups.push(cur);cur=[];} cur.push(g); end=Math.max(end,g.e); }
  if(cur.length) groups.push(cur);
  for(const grp of groups){ const cols=[];
    for(const g of grp){ let i=cols.findIndex(c=>c<=g.s); if(i<0){i=cols.length;cols.push(0);} cols[i]=g.e; g.col=i; }
    grp.forEach(g=>g.n=cols.length); }
  return segs;
}
function timedSegs(ds){
  const d0=parse(ds).getTime(), d1=d0+864e5, out=[];
  localOn(ds).filter(ev=>ev.start).forEach(ev=>{
    const s=toMin(ev.start); let e=ev.end?toMin(ev.end):s+60; if(e<=s) e=1440;
    out.push({ev,occ:ds,s,e:Math.min(e,1440)});});
  G.events.filter(ev=>ev.sMs!=null&&ev.sMs<d1&&ev.eMs>d0).forEach(ev=>
    out.push({ev,occ:ds,s:Math.max(0,(ev.sMs-d0)/6e4),e:Math.min(1440,(ev.eMs-d0)/6e4)}));
  return pack(out);
}
let blkMap=[], tgScroll=null, tgDrag=null, tgTouch=null;
function renderTime(days){
  const t=todayStr(); blkMap=[];
  const old=document.querySelector('#v-time .tg-scroll'); if(old) tgScroll=old.scrollTop;
  const head='<div></div>'+days.map(ds=>{const d=parse(ds);
    return `<div class="tg-dh${ds===t?' today':''}${d.getDay()===0?' sun':''}${d.getDay()===6?' sat':''}" data-d="${ds}"><div class="wd">週${WD[d.getDay()]}</div><div class="dn">${d.getDate()}</div></div>`}).join('');
  const ad='<div class="tg-adl">整天</div>'+days.map(ds=>`<div class="cell" data-d="${ds}">`+
    allDayOn(ds).map(ev=>`<div class="chip" data-ev="${esc(ev.id)}" style="background:${esc(ev.color)};color:${esc(ev.fg||'#fff')}">${esc(ev.title)}</div>`).join('')+
    todosOn(ds).map(x=>`<div class="chip todo ${x.done?'done':''}" data-tg="${x.id}">☐ ${esc(x.text)}</div>`).join('')+
    cdsOn(ds).map(x=>`<div class="chip cd">⏳ ${esc(x.name)}</div>`).join('')+'</div>').join('');
  const hours='<div class="tg-hours">'+Array.from({length:23},(_,i)=>`<div style="top:${(i+1)*HH}px">${i+1}</div>`).join('')+'</div>';
  const now=new Date(), nowMin=now.getHours()*60+now.getMinutes();
  const cols=days.map(ds=>{
    let blks=timedSegs(ds).map(g=>{
      const k=blkMap.push(g)-1, ev=g.ev, h=Math.max(g.e-g.s,20)*HH/60;
      return `<div class="blk${ev.ro?' ro':''}" data-k="${k}" style="top:${g.s*HH/60}px;height:${h}px;left:calc(${g.col/g.n*100}% + 1px);width:calc(${100/g.n}% - 3px);background:${esc(ev.color)};color:${esc(ev.fg||'#fff')}">`+
        `<div class="t">${esc(ev.title)}</div>${h>=34?`<div class="s">${ev.start}${ev.end?'–'+ev.end:''}</div>`:''}${ev.ro?'':'<div class="rz"></div>'}</div>`;
    }).join('');
    if(ds===t) blks+=`<div class="nowline" style="top:${nowMin*HH/60}px"></div>`;
    return `<div class="tg-col" data-d="${ds}">${blks}</div>`;
  }).join('');
  const v=$('v-time'); v.style.setProperty('--n',days.length);
  v.innerHTML=`<div class="tg-head">${head}</div><div class="tg-allday">${ad}</div><div class="tg-scroll"><div class="tg-body">${hours}${cols}</div></div>`;
  const sc=v.querySelector('.tg-scroll'); sc.scrollTop=tgScroll??(8*HH-8);
  bindTimeGrid(sc.firstElementChild);
}
// 標題列：點日期切換 日/週；整天列：點行程編輯、點空白新增整天行程
$('v-time').onclick=e=>{
  if(e.target.closest('.tg-body')) return;
  const dh=e.target.closest('.tg-dh'); if(dh){sel=dh.dataset.d; setView(calView==='day'?'week':'day'); return;}
  const c=e.target.closest('[data-ev]'); if(c){openEv(findEv(c.dataset.ev)); return;}
  const tg=e.target.closest('[data-tg]'); if(tg){toggleTodo(tg.dataset.tg); return;}
  const cell=e.target.closest('.tg-allday .cell'); if(cell) openEv(null,cell.dataset.d);
};

/* 拖曳：滑鼠直接拖；手機長按 0.45 秒後拖。拖行程 = 移動，拖底邊 = 調整結束時間，拖空白 = 新增 */
const colAtX=x=>[...document.querySelectorAll('#v-time .tg-col')].find(c=>{const r=c.getBoundingClientRect();return x>=r.left&&x<r.right});
const yMin=(y,col)=>(y-col.getBoundingClientRect().top)/HH*60;
const snap=(m,f=Math.round)=>f(m/15)*15;
function dragStart(target,x,y){
  const blk=target.closest('.blk');
  if(blk){
    const g=blkMap[+blk.dataset.k], ev=g.ev, col=blk.parentElement, d0=parse(g.occ).getTime();
    const st0=ev.google?(ev.sMs-d0)/6e4:g.s, dur=ev.google?(ev.eMs-ev.sMs)/6e4:g.e-g.s;
    tgDrag={kind:target.closest('.rz')?'resize':'move',g,ev,blk,col,ds:g.occ,x0:x,y0:y,moved:false,off:yMin(y,col)-st0,st0,dur,s:st0,e:st0+dur};
  }else{
    const col=target.closest('.tg-col'); if(!col) return false;
    const a=Math.max(0,Math.min(1425,snap(yMin(y,col),Math.floor)));
    tgDrag={kind:'new',col,ds:col.dataset.d,x0:x,y0:y,moved:false,a,s:a,e:a+15};
  }
  return true;
}
function dragMove(x,y){
  const D=tgDrag; if(!D) return;
  if(!D.moved&&Math.hypot(x-D.x0,y-D.y0)<5) return;
  if(!D.moved){D.moved=true; D.blk?.classList.add('dragging');}
  if(D.kind==='new'){
    const m=Math.max(0,Math.min(1425,snap(yMin(y,D.col),Math.floor)));
    D.s=Math.min(D.a,m); D.e=Math.max(D.a,m)+15;
    let gh=D.col.querySelector('.ghost-sel'); if(!gh){gh=document.createElement('div');gh.className='ghost-sel';D.col.appendChild(gh);}
    gh.style.top=D.s*HH/60+'px'; gh.style.height=(D.e-D.s)*HH/60+'px'; gh.textContent=minToHm(D.s)+'–'+wrapHm(D.e);
    return;
  }
  if(D.ev.ro) return;
  if(D.kind==='move'){
    const col=colAtX(x)||D.col; if(col!==D.col){col.appendChild(D.blk); D.col=col; D.ds=col.dataset.d;}
    const maxS=D.ev.google?1425:1440-Math.min(D.dur,1440);
    // 以 15 分鐘為單位「位移」，保留原本的分鐘數（例如 09:10 的課拖動後還是 xx:10）
    D.s=Math.max(0,Math.min(maxS,D.st0+snap(yMin(y,col)-D.off-D.st0))); D.e=D.s+D.dur;
    Object.assign(D.blk.style,{top:D.s*HH/60+'px',height:Math.max(Math.min(D.e,1440)-D.s,20)*HH/60+'px',left:'1px',width:'calc(100% - 3px)'});
  }else{
    const e0=D.st0+D.dur;
    D.e=Math.min(1440,Math.max(D.st0+15,e0+snap(yMin(y,D.col)-e0)));
    D.blk.style.height=Math.max(D.e-Math.max(0,D.st0),15)*HH/60+'px';
  }
  const lab=D.blk.querySelector('.s'); if(lab) lab.textContent=wrapHm(D.s)+'–'+wrapHm(D.e);
}
function dragEnd(){
  const D=tgDrag; tgDrag=null; if(!D) return;
  document.querySelectorAll('.ghost-sel').forEach(x=>x.remove());
  if(!D.moved){                                   // 單純點一下
    if(D.ev) return openEv(D.ev);
    const s=Math.floor(D.a/30)*30; return openEv(null,D.ds,{start:minToHm(s),end:minToHm(Math.min(s+60,1439))});
  }
  if(D.kind==='new') return openEv(null,D.ds,{start:minToHm(D.s),end:D.e>=1440?'23:59':minToHm(D.e)});
  if(D.ev.ro) return renderCal();
  saveTimes(D.ev,D.g.occ,D.ds,D.s,D.e);
}
async function saveTimes(ev,occ,ds,s,e){
  try{
    if(ev.google){
      const d0=parse(ds).getTime(), sm=d0+s*6e4, em=d0+e*6e4, hm=ms=>{const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())};
      Object.assign(ev,{sMs:sm,eMs:em,date:ymd(new Date(sm)),start:hm(sm),end:hm(em)}); renderCal();
      await gApi(evPath(ev.calId,ev.gid),'PATCH',{start:{dateTime:isoLocal(sm),timeZone:TZ},end:{dateTime:isoLocal(em),timeZone:TZ}});
      await gSync(true);
    }else{
      const delta=Math.round((parse(ds)-parse(occ))/864e5);   // 重複行程：整個系列一起平移
      ev.date=addDays(ev.date,delta); ev.start=minToHm(s); ev.end=minToHm(Math.min(e,1439));
      save(); renderCal();
    }
  }catch(err){alert(err.message); gSync(true);}
}
function bindTimeGrid(body){
  body.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||e.button!==0) return;
    if(dragStart(e.target,e.clientX,e.clientY)) e.preventDefault();});
  body.addEventListener('touchstart',e=>{
    if(e.touches.length!==1) return; const t=e.touches[0];
    const T=tgTouch={x:t.clientX,y:t.clientY,target:e.target,moved:false};
    T.timer=setTimeout(()=>{
      if(tgTouch!==T||T.moved||!dragStart(T.target,T.x,T.y)) return;
      tgDrag.moved=true; tgDrag.blk?.classList.add('dragging'); navigator.vibrate?.(15);
      if(tgDrag.kind==='new'){tgDrag.moved=false; dragMove(T.x,T.y+6);}
    },450);
  },{passive:true});
  body.addEventListener('touchmove',e=>{
    const t=e.touches[0];
    if(tgDrag){e.preventDefault(); dragMove(t.clientX,t.clientY); return;}
    if(tgTouch&&Math.hypot(t.clientX-tgTouch.x,t.clientY-tgTouch.y)>8){tgTouch.moved=true; clearTimeout(tgTouch.timer);}
  },{passive:false});
  body.addEventListener('touchend',e=>{
    const T=tgTouch; tgTouch=null; if(T) clearTimeout(T.timer);
    if(tgDrag){e.preventDefault(); dragEnd();}
    else if(T&&!T.moved){e.preventDefault(); if(dragStart(T.target,T.x,T.y)) dragEnd();}
  });
  body.addEventListener('touchcancel',()=>{if(tgTouch) clearTimeout(tgTouch.timer); tgTouch=null; if(tgDrag){tgDrag=null; renderCal();}});
  body.addEventListener('contextmenu',e=>e.preventDefault());
}
window.addEventListener('pointermove',e=>{if(tgDrag&&e.pointerType!=='touch') dragMove(e.clientX,e.clientY);});
window.addEventListener('pointerup',e=>{if(tgDrag&&e.pointerType!=='touch') dragEnd();});

/* 側邊選單：切換視圖、勾選要顯示的日曆 */
function renderDrawer(){
  $('dvViews').innerHTML=[['year','🗓️','年'],['month','📅','月'],['week','🗒️','週'],['day','📄','日'],['list','☰','行程列表']]
    .map(([v,i,t])=>`<button class="dv${calView===v?' on':''}" data-v="${v}"><span class="ic">${i}</span>${t}</button>`).join('');
  const ck=(attr,on,color,label,extra='')=>`<div class="ck" ${attr}><span class="cb${on?' on':''}" style="--c:${color}"></span><span class="grow">${label}</span>${extra}</div>`;
  $('dvLocal').innerHTML=ck('data-local="ev"',showLocal.ev,COLORS[0],'本機行程')+ck('data-local="todo"',showLocal.todo,'#6b7280','待辦事項');
  if(gReady()&&G.cals.length){
    const p=G.cals.find(c=>c.primary);
    $('dvGTitle').innerHTML='Google 日曆'+(p?`<div class="muted" style="font-weight:400;font-size:12px">${esc(p.id)}</div>`:'');
    $('dvG').innerHTML=G.cals.map(c=>ck(`data-cal="${esc(c.id)}"`,G.show.includes(c.id),esc(c.bg||'#039be5'),esc(c.name),canWrite(c)?'':'<span class="muted" style="font-size:12px">唯讀</span>')).join('');
  }else{
    $('dvGTitle').textContent='Google 日曆';
    $('dvG').innerHTML=`<button class="ghost" data-gconnect style="margin:4px 14px">${G.want?'🔄 重新連線 Google':'🔗 連接 Google 日曆'}</button>`;
  }
}
const isWide=()=>matchMedia('(min-width:1000px)').matches;
const closeDrawer=()=>$('drawerBg').classList.remove('open');
if(ls('dockHidden')==='1') $('tab-cal').classList.add('collapsed');
$('drawerBtn').onclick=()=>{
  renderDrawer();
  if(isWide()){   // 寬螢幕：收合／展開固定側邊欄
    const c=$('tab-cal').classList.toggle('collapsed'); ls('dockHidden',c?'1':'0');
    if(calView==='week'||calView==='day') renderCal();
  }else $('drawerBg').classList.add('open');
};
$('drawerBg').onclick=e=>{
  if(e.target.id==='drawerBg') return closeDrawer();
  const v=e.target.closest('[data-v]'); if(v){setView(v.dataset.v); closeDrawer(); return;}
  const l=e.target.closest('[data-local]');
  if(l){showLocal[l.dataset.local]=!showLocal[l.dataset.local]; ls('showLocal',JSON.stringify(showLocal)); renderDrawer(); render(); return;}
  const c=e.target.closest('[data-cal]');
  if(c){const id=c.dataset.cal; G.show=G.show.includes(id)?G.show.filter(x=>x!==id):[...G.show,id];
    ls('gShow',JSON.stringify(G.show)); renderDrawer(); gSync(true); return;}
  if(e.target.closest('[data-gconnect]')){closeDrawer(); $('gBtn').onclick(); return;}
  if(e.target.closest('#drawerGear')){closeDrawer(); $('gClientId').value=G.clientId; gStatus(); $('gModal').classList.remove('hidden');}
};
$('vseg').onclick=e=>{const v=e.target.closest('[data-v]'); if(v) setView(v.dataset.v);};
$('prevM').onclick=()=>shift(-1);
$('nextM').onclick=()=>shift(1);
$('todayBtn').onclick=()=>{view=new Date();view.setDate(1);sel=todayStr();tgScroll=null;renderCal()};
$('addEventBtn').onclick=()=>openEv(null,sel);
const listClick=e=>{const li=e.target.closest('[data-ev]'); if(li) openEv(findEv(li.dataset.ev));
  const ed=e.target.closest('[data-edit]'); if(ed) return openTodo(ed.dataset.edit);
  const tg=e.target.dataset.tg; if(tg) toggleTodo(tg);};
$('dayList').onclick=listClick; $('agenda').onclick=listClick;

let editing=null, evColor=COLORS[0];
$('evColors').innerHTML=COLORS.map(c=>`<span style="background:${c}" data-c="${c}"></span>`).join('');
$('evColors').onclick=e=>{if(e.target.dataset.c){evColor=e.target.dataset.c;paintColors();}};
const paintColors=()=>document.querySelectorAll('#evColors span').forEach(s=>s.classList.toggle('on',s.dataset.c===evColor));
function openEv(ev,date,pre){
  editing=ev||null;
  $('evModalTitle').textContent=ev?'編輯行程':'新增行程';
  $('evTitle').value=ev?.title||''; $('evDate').value=ev?.date||date;
  $('evStart').value=ev?.start||pre?.start||''; $('evEnd').value=ev?.end||pre?.end||'';
  $('evRepeat').value=ev?.repeat||''; $('evNote').value=ev?.note||'';
  $('evRepeat').disabled=!!ev?.recurring; $('evRepeatHint').classList.toggle('hidden',!ev?.recurring);
  // 寫入 Google 時可以選日曆；顏色留空 = 使用該日曆的顏色
  const gTarget=ev?!!ev.google:gReady();
  $('evCalWrap').classList.toggle('hidden',!gTarget);
  if(gTarget){
    let opts=G.cals.filter(c=>canWrite(c)||c.id===ev?.calId);
    if(!opts.length) opts=[{id:'primary',name:'主要日曆'}];
    $('evCal').innerHTML=opts.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('evCal').value=ev?ev.calId:G.def;
    $('evCal').disabled=!!(ev&&(ev.recurring||ev.ro));
    $('evCalHint').textContent=ev?.ro?'這是唯讀日曆（例如節日或別人分享的），無法在這裡修改。':ev?.recurring?'重複行程中的單次無法搬到其他日曆。':'';
  }
  evColor=ev?.color||(gTarget?'':COLORS[0]); paintColors();
  $('evSave').disabled=!!ev?.ro;
  $('evDel').classList.toggle('hidden',!ev||!!ev.ro);
  $('evModal').classList.remove('hidden'); $('evTitle').focus();
}
const closeEv=()=>$('evModal').classList.add('hidden');
$('evCancel').onclick=closeEv;
$('evModal').onclick=e=>{if(e.target.id==='evModal') closeEv()};
$('evDel').onclick=async()=>{
  if(!confirm(editing.recurring?'只刪除這一次的重複行程？':'刪除這個行程？')) return;
  try{
    if(editing.google){await gApi(evPath(editing.calId,editing.gid),'DELETE'); closeEv(); await gSync(true); return;}
    db.events=db.events.filter(x=>x!==editing); save(); closeEv(); render();
  }catch(err){alert(err.message)}};
$('evForm').onsubmit=async e=>{e.preventDefault();
  const d={title:$('evTitle').value.trim(),date:$('evDate').value,start:$('evStart').value,end:$('evEnd').value,repeat:$('evRepeat').value,note:$('evNote').value.trim(),color:evColor};
  // 已連線 Google 時，新行程直接建在 Google 日曆；Google 行程的修改也寫回 Google
  const toGoogle=editing?!!editing.google:gReady();
  try{
    if(toGoogle){
      const body=toG(d); if(editing?.recurring) delete body.recurrence;
      const cal=$('evCal').value||'primary';
      if(editing){
        let calId=editing.calId;
        if(cal!==calId){  // 換日曆 = 先搬過去再更新內容
          await gApi(evPath(calId,editing.gid)+'/move?destination='+encodeURIComponent(cal),'POST'); calId=cal;}
        await gApi(evPath(calId,editing.gid),'PATCH',body);
      }else await gApi(evPath(cal),'POST',body);
      if(!G.show.includes(cal)&&G.cals.some(c=>c.id===cal)){G.show.push(cal); ls('gShow',JSON.stringify(G.show));}
    }else{
      if(!d.color) d.color=COLORS[0];
      if(editing) Object.assign(editing,d); else db.events.push({id:uid(),...d});
      save();
    }
  }catch(err){alert(err.message);return;}
  sel=d.date; closeEv();
  if(toGoogle) await gSync(true); else render();};

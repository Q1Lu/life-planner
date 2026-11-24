/* ---------- 待辦 ---------- */
let tf='open';
function toggleTodo(id){const t=db.todos.find(x=>x.id===id); if(t){t.done=!t.done; todoXp(t); save(); render();}}
$('todoForm').onsubmit=e=>{e.preventDefault();
  const time=$('todoTime').value, due=$('todoDue').value||(time?todayStr():'');   // 只填時間 = 今天
  db.todos.push({id:uid(),text:$('todoText').value.trim(),due,dueTime:time,pri:+$('todoPri').value,done:false,created:Date.now()});
  $('todoText').value='';$('todoDue').value='';$('todoTime').value='';save();renderTodo();};
document.querySelectorAll('.tf').forEach(b=>b.onclick=()=>{tf=b.dataset.f;renderTodo()});
// 截止時間（沒填時間 = 當天 23:59:59.999）
const deadline=x=>x.due?(x.dueTime?new Date(`${x.due}T${x.dueTime}:00`).getTime():new Date(`${x.due}T23:59:59.999`).getTime()):null;
function fmtLeft(ms){
  const neg=ms<0; ms=Math.abs(ms);
  const d=Math.floor(ms/864e5), h=Math.floor(ms/36e5)%24, m=Math.floor(ms/6e4)%60, s=Math.floor(ms/1e3)%60, x=Math.floor(ms%1000);
  return (neg?'已逾期 ':'剩 ')+(d?d+' 天 ':'')+`${pad(h)}:${pad(m)}:${pad(s)}.${String(x).padStart(3,'0')}`;
}
const cdLevel=ms=>ms<0?'over':ms<36e5?'urgent':ms<864e5?'soon':'ok';
// 排序：未完成在前；長按拖曳過的（有 order）照拖的順序；還沒拖過的（例如剛新增的）排最上面、依截止時間
const hasOrd=x=>x.order!=null;
const todoCmp=(a,b)=>a.done-b.done||hasOrd(a)-hasOrd(b)||
  (hasOrd(a)?a.order-b.order:(deadline(a)??Infinity)-(deadline(b)??Infinity)||b.pri-a.pri);
function renderTodo(){
  document.querySelectorAll('.tf').forEach(b=>b.style.borderColor=b.dataset.f===tf?'var(--primary)':'');
  let list=db.todos.filter(x=>tf==='all'||(tf==='done'?x.done:!x.done));
  list.sort(todoCmp);
  $('todoResort').classList.toggle('hidden',!db.todos.some(x=>x.order!=null));
  const priTxt={3:'🔴',2:'',1:'⚪'}, now=Date.now();
  $('todoList').innerHTML=list.map(x=>{
    const dl=deadline(x), dd=x.due?parse(x.due):null;
    const ddl=dl?`<div class="ddl"><span class="muted">⏰ ${dd.getMonth()+1}/${dd.getDate()}（${WD[dd.getDay()]}）${x.dueTime||'23:59'}</span>`+
      (x.done?'<span class="muted">✔ 已完成</span>':`<span class="cdn ${cdLevel(dl-now)}" data-dl="${dl}">${fmtLeft(dl-now)}</span>`)+'</div>':'';
    const spent=db.pomos.filter(p=>p.todoId===x.id).reduce((s,p)=>s+p.min,0);
    return `<li data-tid="${x.id}"><input type="checkbox" data-tg="${x.id}" ${x.done?'checked':''}><span class="grow todo-edit" data-edit="${x.id}" title="點一下編輯"><span class="${x.done?'done-text':''}">${priTxt[x.pri]||''} ${esc(x.text)}</span>${ddl}</span>`+
      (spent?`<span class="tag tomato" title="番茄鐘累計時間">🍅 ${fmtDur(spent)}</span>`:'')+
      (x.done?'':`<button class="x" data-pomo="${x.id}" title="用番茄鐘處理這項">🍅</button>`)+
      `<button class="x" data-del="${x.id}">✕</button></li>`;
  }).join('')||'<li class="muted">沒有項目 🎉</li>';
  $('todoCount').textContent=`未完成 ${db.todos.filter(x=>!x.done).length} 項`;
}
// 每一個畫面更新一次倒數（約每秒 60 次），所以毫秒會一直跑
function cdTick(){
  if(tab!=='todo') return;
  const now=Date.now();
  document.querySelectorAll('#todoList .cdn').forEach(el=>{
    const ms=+el.dataset.dl-now, lv=cdLevel(ms);
    el.textContent=fmtLeft(ms); if(!el.classList.contains(lv)) el.className='cdn '+lv;
  });
}
(function cdLoop(){cdTick(); requestAnimationFrame(cdLoop);})();
setInterval(cdTick,1000);   // 備援：瀏覽器暫停動畫時（例如分頁在背景）至少每秒更新
/* 編輯待辦：內容、截止日／時間、重要性 */
let tdEditing=null, tdPri=2;
const paintPri=()=>document.querySelectorAll('#tdPri .pbtn').forEach(b=>b.classList.toggle('on',+b.dataset.v===tdPri));
function openTodo(id){
  const t=db.todos.find(x=>x.id===id); if(!t) return; tdEditing=t;
  $('tdText').value=t.text; $('tdDue').value=t.due||''; $('tdTime').value=t.dueTime||'';
  tdPri=t.pri||2; paintPri(); $('tdDone').checked=!!t.done;
  $('tdModal').classList.remove('hidden'); $('tdText').focus();
}
const closeTd=()=>$('tdModal').classList.add('hidden');
$('tdPri').onclick=e=>{const b=e.target.closest('[data-v]'); if(b){tdPri=+b.dataset.v; paintPri();}};
$('tdCancel').onclick=closeTd;
$('tdModal').onclick=e=>{if(e.target.id==='tdModal') closeTd();};
$('tdDel').onclick=()=>{if(confirm('刪除這個待辦？')){db.todos=db.todos.filter(x=>x!==tdEditing); save(); closeTd(); render();}};
$('tdForm').onsubmit=e=>{e.preventDefault();
  const time=$('tdTime').value;
  Object.assign(tdEditing,{text:$('tdText').value.trim(),due:$('tdDue').value||(time?todayStr():''),dueTime:time,pri:tdPri,done:$('tdDone').checked});
  todoXp(tdEditing);
  save(); closeTd(); render();};

$('todoList').onclick=e=>{
  if(tdJustDragged){tdJustDragged=false; e.preventDefault(); return;}   // 拖完放開不要當成點擊
  if(e.target.dataset.tg) toggleTodo(e.target.dataset.tg);
  const ed=e.target.closest('[data-edit]'); if(ed){openTodo(ed.dataset.edit); return;}
  if(e.target.dataset.pomo){   // 用番茄鐘處理這項待辦
    P.todoId=e.target.dataset.pomo;
    if(!P.running&&P.mode!=='focus') pSetMode('focus');
    pSave(); goTab('pomo'); if(!P.running) pStart(); return;}
  if(e.target.dataset.del){db.todos=db.todos.filter(x=>x.id!==e.target.dataset.del);save();renderTodo();}};

/* 長按待辦 → 上下拖曳調整順序（滑鼠、手機都是長按約 0.4 秒） */
let tdHold=null, tdDrag=null, tdJustDragged=false;
function tdLift(li){
  tdDrag={li}; li.classList.add('td-lift'); navigator.vibrate?.(15);
}
function tdMove(y){
  const li=tdDrag?.li; if(!li) return;
  const ul=$('todoList'), sibs=[...ul.children].filter(x=>x!==li&&x.dataset.tid);
  const after=sibs.find(x=>{const r=x.getBoundingClientRect(); return y<r.top+r.height/2;});
  if(after){if(li.nextElementSibling!==after) ul.insertBefore(li,after);} else if(ul.lastElementChild!==li) ul.appendChild(li);
  // 拖到畫面上下邊緣時自動捲動
  if(y<60) scrollBy(0,-12); else if(y>innerHeight-60) scrollBy(0,12);
}
function tdDrop(){
  const D=tdDrag; tdDrag=null; if(!D) return;
  D.li.classList.remove('td-lift'); tdJustDragged=true; setTimeout(()=>tdJustDragged=false,400);
  [...$('todoList').children].forEach((li,i)=>{const t=db.todos.find(x=>x.id===li.dataset.tid); if(t) t.order=i;});
  save(); renderTodo();
}
const tdCancelHold=()=>{if(tdHold){clearTimeout(tdHold.timer); tdHold=null;}};
function tdHoldStart(target,x,y){
  const li=target.closest('#todoList li[data-tid]'); if(!li||target.closest('button,input')) return;
  tdCancelHold(); const H=tdHold={x,y,li};
  H.timer=setTimeout(()=>{if(tdHold===H){tdHold=null; tdLift(li);}},400);
}
const tdHoldMove=(x,y)=>{if(tdHold&&Math.hypot(x-tdHold.x,y-tdHold.y)>8) tdCancelHold();};
{
  const ul=$('todoList');
  ul.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'&&e.button===0) tdHoldStart(e.target,e.clientX,e.clientY);});
  addEventListener('pointermove',e=>{if(e.pointerType==='touch') return; if(tdDrag){e.preventDefault(); tdMove(e.clientY);} else tdHoldMove(e.clientX,e.clientY);});
  addEventListener('pointerup',e=>{if(e.pointerType==='touch') return; tdCancelHold(); tdDrop();});
  ul.addEventListener('touchstart',e=>{if(e.touches.length===1) tdHoldStart(e.target,e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  ul.addEventListener('touchmove',e=>{const t=e.touches[0];
    if(tdDrag){e.preventDefault(); tdMove(t.clientY);} else tdHoldMove(t.clientX,t.clientY);},{passive:false});
  ul.addEventListener('touchend',e=>{tdCancelHold(); if(tdDrag){e.preventDefault(); tdDrop();}});
  ul.addEventListener('touchcancel',()=>{tdCancelHold(); if(tdDrag){tdDrag=null; renderTodo();}});
  ul.addEventListener('contextmenu',e=>{if(e.target.closest('li[data-tid]')) e.preventDefault();});
}
$('todoResort').onclick=()=>{
  if(!confirm('清除手動排序，改回依截止時間排序？')) return;
  db.todos.forEach(t=>{delete t.order;}); save(); renderTodo();
};
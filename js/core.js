const KEY='lifePlanner.v1';
// 顏色採用 Google 日曆的事件色，方便雙向同步
const COLORS=['#3f51b5','#0b8043','#d50000','#f4511e','#8e24aa','#039be5','#e67c73'];
const CATS={exp:['餐飲','交通','購物','娛樂','居家','醫療','學習','其他'],inc:['薪水','獎金','投資','副業','其他']};
// hgroups／hitems：每日任務的群組和項目；hdone：每天每項的完成紀錄
const EMPTY_DB=()=>({events:[],todos:[],cds:[],money:[],habits:[],habitLogs:[],habitTimer:null,pomos:[],hgroups:[],hitems:[],hdone:[],xp:[],health:[],mcats:[],deleted:{}});
let db=EMPTY_DB();
try{const s=localStorage.getItem(KEY); if(s) db=Object.assign(db,JSON.parse(s));}catch(e){}
// 存檔時先標記哪些資料改過（雲端同步用），存完再排程同步
const save=()=>{
  try{window.beforeSave?.()}catch(e){}
  try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}
  try{window.afterSave?.()}catch(e){}
};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
if(db.cds?.length){   // 以前「倒數」分頁的項目，轉成有截止時間的待辦
  db.cds.forEach(c=>db.todos.push({id:uid(),text:c.name,due:c.date.slice(0,10),dueTime:c.date.slice(11,16),pri:2,done:false,created:Date.now()}));
  db.cds=[]; save();
}
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+Math.round(n).toLocaleString();
const todayStr=()=>ymd(new Date());
// 習慣、每日任務、段位、番茄鐘的「今天」：凌晨 4 點前還算前一天（熬夜時打勾才會記在對的日子）
const DAY_START_HOUR=4;
const habitDay=()=>{const d=new Date(); if(d.getHours()<DAY_START_HOUR) d.setDate(d.getDate()-1); return ymd(d);};
const dayDiff=s=>Math.round((parse(s)-parse(todayStr()))/864e5);
const ls=(k,v)=>{try{if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v);}catch(e){}};
const jget=k=>{try{return JSON.parse(ls(k))}catch(e){return null}};

/* ---------- 拖曳排序（待辦、習慣共用） ----------
   每一列前面放 dragHandle(key)；按住把手就能上下拖（滑鼠、手機都一樣）。
   makeSortable(box,key,sel,onDrop)：box 裡、同一層、符合 sel 的元素互換位置，放開時 onDrop(新順序的 id 陣列, 元素)。
   拖曳中 SORT.on 為 true，各頁的 render 應該先跳過重畫。 */
const SORT={on:false};
const dragHandle=key=>`<span class="drag-h" data-sort="${key}" title="按住上下拖曳調整順序" aria-label="拖曳排序"><i></i><i></i><i></i><i></i></span>`;
function makeSortable(box,key,sel,onDrop){
  let D=null;
  const move=y=>{
    const el=D.el, sibs=[...el.parentElement.children].filter(x=>x!==el&&x.matches(sel));
    const after=sibs.find(x=>{const r=x.getBoundingClientRect(); return y<r.top+r.height/2;});
    if(after){if(el.nextElementSibling!==after) el.parentElement.insertBefore(el,after);}
    else if(sibs.length&&sibs[sibs.length-1].nextElementSibling!==el) sibs[sibs.length-1].after(el);
    if(y<60) scrollBy(0,-12); else if(y>innerHeight-60) scrollBy(0,12);   // 拖到畫面邊緣自動捲動
  };
  const drop=()=>{
    const d=D; D=null; SORT.on=false; if(!d) return;
    d.el.classList.remove('drag-lift');
    const ids=[...d.el.parentElement.children].filter(x=>x.matches(sel)).map(x=>x.dataset.sid);
    onDrop(ids,d.el);
  };
  box.addEventListener('pointerdown',e=>{
    const h=e.target.closest(`.drag-h[data-sort="${key}"]`); if(!h||(e.pointerType==='mouse'&&e.button!==0)) return;
    const el=h.closest(sel); if(!el) return;
    e.preventDefault(); D={el,id:e.pointerId}; SORT.on=true; el.classList.add('drag-lift');
    try{h.setPointerCapture(e.pointerId)}catch(err){}
  });
  // 移動、放開聽整個頁面：手指拖到清單外面放開也收得到（移動元素時把手可能會失去 pointer capture）
  addEventListener('pointermove',e=>{if(D&&e.pointerId===D.id){e.preventDefault(); move(e.clientY);}});
  addEventListener('pointerup',e=>{if(D&&e.pointerId===D.id) drop();});
  addEventListener('pointercancel',e=>{if(D&&e.pointerId===D.id) drop();});
  addEventListener('touchmove',e=>{if(D) e.preventDefault();},{passive:false});   // iOS 保險：拖曳中不要捲動頁面
  box.addEventListener('click',e=>{if(e.target.closest('.drag-h')) e.stopPropagation();},true);   // 點把手不要觸發那一列的其他動作
}
// 只重排其中一部分（例如篩選後看得到的那些）：照新順序放回它們原本佔的位置，其他的不動。回傳整份新順序。
function reorderSubset(fullSorted,newIds){
  const q=newIds.map(id=>fullSorted.find(x=>x.id===id)).filter(Boolean), set=new Set(q.map(x=>x.id));
  return fullSorted.map(x=>set.has(x.id)?q.shift():x);
}

/* ---------- 分頁 ---------- */
let tab='cal';
$('tabs').onclick=e=>{const b=e.target.closest('button'); if(!b) return; tab=b.dataset.tab;
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('active',x===b));
  ['cal','todo','money','habit','pomo','rank','health'].forEach(t=>$('tab-'+t).classList.toggle('hidden',t!==tab)); render(); renderMini();};
const goTab=t=>document.querySelector(`#tabs [data-tab="${t}"]`).click();

/* ---------- 深色／淺色模式：自動（跟系統）→ 淺色 → 深色 ---------- */
const THEMES={auto:'🌗 自動',light:'☀️ 淺色',dark:'🌙 深色'};
let theme=ls('theme')||'auto';
function applyTheme(){
  if(theme==='auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=theme;
  $('themeBtn').textContent=THEMES[theme];
  $('themeBtn').title='目前：'+THEMES[theme]+'（點一下切換）';
}
$('themeBtn').onclick=()=>{theme={auto:'light',light:'dark',dark:'auto'}[theme]; ls('theme',theme==='auto'?null:theme); applyTheme();};
applyTheme();

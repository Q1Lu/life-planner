const KEY='lifePlanner.v1';
// 顏色採用 Google 日曆的事件色，方便雙向同步
const COLORS=['#3f51b5','#0b8043','#d50000','#f4511e','#8e24aa','#039be5','#e67c73'];
const CATS={exp:['餐飲','交通','購物','娛樂','居家','醫療','學習','其他'],inc:['薪水','獎金','投資','副業','其他']};
// hgroups／hitems：每日任務的群組和項目；hdone：每天每項的完成紀錄
const EMPTY_DB=()=>({events:[],todos:[],cds:[],money:[],habits:[],habitLogs:[],habitTimer:null,pomos:[],hgroups:[],hitems:[],hdone:[],xp:[],health:[],deleted:{}});
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
const dayDiff=s=>Math.round((parse(s)-parse(todayStr()))/864e5);
const ls=(k,v)=>{try{if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v);}catch(e){}};
const jget=k=>{try{return JSON.parse(ls(k))}catch(e){return null}};

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

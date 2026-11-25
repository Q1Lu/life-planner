/* ---------- 記帳 ---------- */
let mView=new Date(); mView.setDate(1);
/* 分類：可以自己打字，按「建立」就會存起來，之後用選的（像 Notion 的選項）。支出、收入各有一份。
   db.mcats 每筆 {id:'mc|類型|名稱', type, name, t:建立時間, hide:從選單拿掉}，會跟著雲端同步 */
const mcId=(type,name)=>`mc|${type}|${name}`;
const uidTime=id=>parseInt(String(id).slice(0,-4),36)||0;     // uid() 前面是建立時間
function mcSet(type,name,patch){
  let r=db.mcats.find(x=>x.id===mcId(type,name));
  if(!r){r={id:mcId(type,name),type,name,t:Date.now(),hide:false}; db.mcats.push(r);}
  Object.assign(r,patch); save();
}
function catOptions(type){
  const last=new Map(), bump=(c,t)=>{if(c&&!(last.get(c)>=t)) last.set(c,t);};
  for(const x of db.mcats) if(x.type===type&&!x.hide) bump(x.name,x.t||0);
  for(const x of db.money) if(x.type===type) bump(x.cat,uidTime(x.id));
  const hidden=new Set(db.mcats.filter(x=>x.type===type&&x.hide).map(x=>x.name));
  const used=[...last.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  return [...new Set([...used,...CATS[type]])].filter(c=>!hidden.has(c));
}
const CB={sel:0,opts:[]};
function catList(){
  const type=$('mType').value, q=$('mCat').value.trim(), ql=q.toLowerCase();
  const all=catOptions(type);
  CB.opts=all.filter(c=>c.toLowerCase().includes(ql)).map(c=>({c}));
  if(q&&!all.includes(q)) CB.opts.unshift({c:q,create:true});
  CB.sel=Math.min(CB.sel,Math.max(CB.opts.length-1,0));
  const L=$('mCatList');
  L.innerHTML=CB.opts.map((o,i)=>`<div class="copt${i===CB.sel?' on':''}" data-i="${i}">${o.create?`<span class="muted">＋ 建立</span> <span class="tag">${esc(o.c)}</span>`:`<span class="tag">${esc(o.c)}</span><button type="button" class="cx" data-hide="${esc(o.c)}" title="從選單移除">✕</button>`}</div>`).join('')||'<div class="copt muted">打字來新增分類</div>';
  L.classList.remove('hidden');
  // 靠右邊時往左展開，不要超出畫面
  L.style.left='0'; L.style.right='auto';
  if(L.getBoundingClientRect().right>innerWidth-8){L.style.left='auto'; L.style.right='0';}
}
const catClose=()=>$('mCatList').classList.add('hidden');
function catPick(i){
  const o=CB.opts[i]; if(!o) return;
  if(o.create||db.mcats.some(x=>x.id===mcId($('mType').value,o.c)&&x.hide)) mcSet($('mType').value,o.c,{hide:false,t:Date.now()});
  $('mCat').value=o.c; catClose();
}
$('mCat').onfocus=$('mCat').onclick=()=>{CB.sel=0; catList();};
$('mCat').oninput=()=>{CB.sel=0; catList();};
$('mCat').onblur=()=>setTimeout(catClose,150);
$('mCat').onkeydown=e=>{
  if(e.isComposing||e.keyCode===229) return;               // 中文輸入法選字時的 Enter 不算
  const open=!$('mCatList').classList.contains('hidden');
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault(); if(!open) return catList();
    CB.sel=(CB.sel+(e.key==='ArrowDown'?1:-1)+CB.opts.length)%Math.max(CB.opts.length,1); catList();}
  else if(e.key==='Enter'&&open&&CB.opts.length){e.preventDefault(); catPick(CB.sel);}
  else if(e.key==='Escape') catClose();
};
$('mCatList').onpointerdown=e=>e.preventDefault();       // 不讓輸入框失去焦點
$('mCatList').onclick=e=>{
  const h=e.target.closest('[data-hide]');
  if(h){mcSet($('mType').value,h.dataset.hide,{hide:true}); $('mCat').focus(); catList(); return;}
  const r=e.target.closest('[data-i]'); if(r) catPick(+r.dataset.i);
};
$('mType').onchange=()=>{$('mCat').value=''; catClose();}; $('mDate').value=todayStr();
db.mcats=(db.mcats||[]).filter(x=>!String(x.id).startsWith('mch|'));   // 舊格式
$('moneyForm').onsubmit=e=>{e.preventDefault();
  const type=$('mType').value, cat=$('mCat').value.trim(); if(!cat) return $('mCat').focus();
  const r=db.mcats.find(x=>x.id===mcId(type,cat));
  if(!r||r.hide) mcSet(type,cat,{hide:false,t:Date.now()});   // 直接打字送出也會記住
  db.money.push({id:uid(),type,amt:+$('mAmt').value,cat,date:$('mDate').value,note:$('mNote').value.trim()});
  const d=parse($('mDate').value); mView=new Date(d.getFullYear(),d.getMonth(),1);
  $('mAmt').value='';$('mCat').value='';$('mNote').value='';catClose();save();renderMoney();};
$('mPrev').onclick=()=>{mView.setMonth(mView.getMonth()-1);renderMoney()};
$('mNext').onclick=()=>{mView.setMonth(mView.getMonth()+1);renderMoney()};
function renderMoney(){
  const key=`${mView.getFullYear()}-${pad(mView.getMonth()+1)}`;
  $('mMonth').textContent=`${mView.getFullYear()} 年 ${mView.getMonth()+1} 月`;
  const list=db.money.filter(x=>x.date.startsWith(key)).sort((a,b)=>b.date.localeCompare(a.date));
  const inc=list.filter(x=>x.type==='inc').reduce((a,b)=>a+b.amt,0), exp=list.filter(x=>x.type==='exp').reduce((a,b)=>a+b.amt,0);
  $('sInc').textContent=money(inc); $('sExp').textContent=money(exp);
  $('sBal').textContent=money(inc-exp); $('sBal').className='v '+(inc-exp>=0?'inc':'exp');
  $('moneyList').innerHTML=list.map(x=>`<li><span class="tag">${esc(x.cat)}</span><span class="grow">${esc(x.note)||'<span class="muted">—</span>'}<div class="muted" style="font-size:12px">${x.date}</div></span><strong class="${x.type}">${x.type==='inc'?'+':'-'}${money(x.amt)}</strong><button class="x" data-del="${x.id}">✕</button></li>`).join('')||'<li class="muted">本月還沒有紀錄</li>';
  const by={}; list.filter(x=>x.type==='exp').forEach(x=>by[x.cat]=(by[x.cat]||0)+x.amt);
  const rows=Object.entries(by).sort((a,b)=>b[1]-a[1]); const max=rows[0]?.[1]||1;
  $('catBars').innerHTML=rows.map(([c,v])=>`<div class="bar-row"><span>${esc(c)}</span><div class="bar-bg"><div class="bar" style="width:${v/max*100}%"></div></div><span style="text-align:right">${money(v)} <span class="muted" style="font-size:12px">${Math.round(v/exp*100)}%</span></span></div>`).join('')||'<div class="muted">沒有支出資料</div>';
}
$('moneyList').onclick=e=>{if(e.target.dataset.del&&confirm('刪除這筆紀錄？')){db.money=db.money.filter(x=>x.id!==e.target.dataset.del);save();renderMoney();}};

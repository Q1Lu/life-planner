/* ---------- 記帳 ---------- */
let mView=new Date(); mView.setDate(1);
/* 分類：可以自己打字，打過一次就會出現在選單裡（像 Notion 的選項）。
   選單 = 用過的分類（最近用的在前）+ 預設分類；按 ✕ 可以從選單拿掉（記在 db.mcats，會同步） */
const catHidden=(type,name)=>db.mcats.some(x=>x.id===`mch|${type}|${name}`);
function catOptions(type){
  const seen=new Map();
  for(const x of [...db.money].sort((a,b)=>(b.date+(b.id||'')).localeCompare(a.date+(a.id||'')))) if(x.type===type&&x.cat&&!seen.has(x.cat)) seen.set(x.cat,1);
  for(const c of CATS[type]) if(!seen.has(c)) seen.set(c,1);
  return [...seen.keys()].filter(c=>!catHidden(type,c));
}
const CB={sel:0,opts:[]};
function catList(){
  const type=$('mType').value, q=$('mCat').value.trim(), ql=q.toLowerCase();
  const all=catOptions(type), m=all.filter(c=>c.toLowerCase().includes(ql));
  CB.opts=m.map(c=>({c}));
  if(q&&!all.includes(q)) CB.opts.push({c:q,create:true});
  CB.sel=Math.min(CB.sel,Math.max(CB.opts.length-1,0));
  $('mCatList').innerHTML=CB.opts.map((o,i)=>`<div class="copt${i===CB.sel?' on':''}" data-i="${i}">${o.create?`<span class="muted">建立</span> <span class="tag">${esc(o.c)}</span>`:`<span class="tag">${esc(o.c)}</span><button type="button" class="cx" data-hide="${esc(o.c)}" title="從選單移除">✕</button>`}</div>`).join('')||'<div class="copt muted">輸入新的分類名稱</div>';
  $('mCatList').classList.remove('hidden');
}
const catClose=()=>$('mCatList').classList.add('hidden');
const catPick=i=>{const o=CB.opts[i]; if(o){$('mCat').value=o.c; catClose();}};
$('mCat').onfocus=()=>{CB.sel=0; catList();};
$('mCat').oninput=()=>{CB.sel=0; catList();};
$('mCat').onblur=()=>setTimeout(catClose,120);
$('mCat').onkeydown=e=>{
  const open=!$('mCatList').classList.contains('hidden');
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault(); if(!open) return catList();
    CB.sel=(CB.sel+(e.key==='ArrowDown'?1:-1)+CB.opts.length)%Math.max(CB.opts.length,1); catList();}
  else if(e.key==='Enter'&&open&&CB.opts.length){e.preventDefault(); catPick(CB.sel);}
  else if(e.key==='Escape') catClose();
};
$('mCatList').onpointerdown=e=>{e.preventDefault();      // 不讓輸入框失去焦點
  const h=e.target.closest('[data-hide]');
  if(h){const type=$('mType').value; db.mcats.push({id:`mch|${type}|${h.dataset.hide}`}); save(); catList(); return;}
  const r=e.target.closest('[data-i]'); if(r) catPick(+r.dataset.i);
};
$('mType').onchange=()=>{$('mCat').value='';}; $('mDate').value=todayStr();
$('moneyForm').onsubmit=e=>{e.preventDefault();
  const cat=$('mCat').value.trim(); if(!cat) return $('mCat').focus();
  db.mcats=db.mcats.filter(x=>x.id!==`mch|${$('mType').value}|${cat}`);   // 拿掉過又用回來 → 重新出現在選單
  db.money.push({id:uid(),type:$('mType').value,amt:+$('mAmt').value,cat,date:$('mDate').value,note:$('mNote').value.trim()});
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

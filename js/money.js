/* ---------- 記帳 ---------- */
let mView=new Date(); mView.setDate(1);
const fillCats=()=>{$('mCat').innerHTML=CATS[$('mType').value].map(c=>`<option>${c}</option>`).join('')};
$('mType').onchange=fillCats; fillCats(); $('mDate').value=todayStr();
$('moneyForm').onsubmit=e=>{e.preventDefault();
  db.money.push({id:uid(),type:$('mType').value,amt:+$('mAmt').value,cat:$('mCat').value,date:$('mDate').value,note:$('mNote').value.trim()});
  const d=parse($('mDate').value); mView=new Date(d.getFullYear(),d.getMonth(),1);
  $('mAmt').value='';$('mNote').value='';save();renderMoney();};
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

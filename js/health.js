/* ---------- 健康：體重、血壓、InBody ----------
   每天一筆體重（w|日期）、早晚各一筆血壓（bp|日期|m 或 e）、每次 InBody 一筆（ib|日期）。固定 id → 同一天再輸入就是修改。 */
const IB_FIELDS=[['weight','體重','kg',0.1],['smm','骨骼肌重','kg',0.1],['bfm','體脂肪重','kg',0.1],['pbf','體脂率','%',0.1],['bmi','BMI','',0.1],['vfl','內臟脂肪等級','',1],['bmr','基礎代謝','kcal',1],['score','InBody 分數','分',1]];
const BP_SLOT={m:'早上',e:'晚上'};
let hlRange=30, hlDate=habitDay(), bpSlot=(h=>h>=DAY_START_HOUR&&h<15?'m':'e')(new Date().getHours()), ibEditing=null;
const hRec=id=>db.health.find(x=>x.id===id);
function hPut(rec){const r=hRec(rec.id); if(r){Object.keys(r).forEach(k=>{if(!(k in rec)&&k!=='u') delete r[k];}); Object.assign(r,rec);} else db.health.push(rec); save();}
const hOf=type=>db.health.filter(x=>x.type===type).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.slot||'')<(b.slot||'')?-1:1);
// 台灣高血壓指引（2022）分級，只是參考
function bpClass(sy,di){
  if(sy>=140||di>=90) return ['第二期高血壓','#dc2626'];
  if(sy>=130||di>=80) return ['第一期高血壓','#ea580c'];
  if(sy>=120) return ['血壓偏高','#d97706'];
  return ['正常','#16a34a'];
}
const fmtD=d=>{const x=parse(d); return `${x.getMonth()+1}/${x.getDate()}`;};
const delta=(v,unit,goodDown=true)=>{if(v==null||isNaN(v)) return ''; const r=Math.round(v*10)/10; if(!r) return '<span class="muted">持平</span>';
  return `<span class="${(r<0)===goodDown?'dgood':'dbad'}">${r>0?'▲':'▼'} ${Math.abs(r)}${unit}</span>`;};
// 體重：每天的體重紀錄；那天沒量但有 InBody，就用 InBody 的體重
function weightSeries(){
  const m=new Map(); hOf('ib').forEach(r=>{if(r.weight) m.set(r.date,r.weight);}); hOf('weight').forEach(r=>m.set(r.date,r.val));
  return [...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1);
}
function lineChart(series,{days,refs=[],unit=''}){
  const t=habitDay(), from=addDays(t,-days+1), x0=parse(from).getTime(), x1=parse(t).getTime();
  const pts=series.flatMap(sr=>sr.pts.filter(p=>p[0]>=from&&p[0]<=t));
  if(!pts.length) return '<div class="muted" style="padding:20px 0;text-align:center">這段期間還沒有資料</div>';
  let lo=Math.min(...pts.map(p=>p[1]),...refs.map(r=>r.y)), hi=Math.max(...pts.map(p=>p[1]),...refs.map(r=>r.y));
  const padv=(hi-lo)*0.15||1; lo-=padv; hi+=padv;
  const W=600,H=210,L=40,R=14,T=14,B=24;
  const X=d=>L+(parse(d).getTime()-x0)/Math.max(1,x1-x0)*(W-L-R), Y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
  let g='';
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4, y=Y(v); g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" class="gl"/><text x="${L-6}" y="${y+4}" text-anchor="end" class="gt">${v.toFixed(hi-lo<15?1:0)}</text>`;}
  refs.forEach(r=>{g+=`<line x1="${L}" x2="${W-R}" y1="${Y(r.y)}" y2="${Y(r.y)}" class="rl"/><text x="${L+4}" y="${Y(r.y)-4}" class="gt">${r.label}</text>`;});
  [from,addDays(from,Math.floor(days/2)),t].forEach((d,i)=>{g+=`<text x="${X(d)}" y="${H-6}" text-anchor="${['start','middle','end'][i]}" class="gt">${fmtD(d)}</text>`;});
  for(const sr of series){
    const ps=sr.pts.filter(p=>p[0]>=from&&p[0]<=t); if(!ps.length) continue;
    if(ps.length>1) g+=`<polyline fill="none" stroke="${sr.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${ps.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join(' ')}"/>`;
    g+=ps.map(p=>`<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="${ps.length>45?2:3.5}" fill="${sr.color}"><title>${p[0]}　${sr.name}：${p[1]}${unit}</title></circle>`).join('');
    const l=ps[ps.length-1]; g+=`<text x="${X(l[0])-6}" y="${Y(l[1])-9}" text-anchor="end" class="gv" fill="${sr.color}">${l[1]}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="lc" role="img">${g}</svg>`;
}
function renderHealth(){
  const t=habitDay();
  $('hlDate').value=hlDate;
  document.querySelectorAll('#bpSlot .pbtn').forEach(b=>b.classList.toggle('on',b.dataset.s===bpSlot));
  document.querySelectorAll('#hlRange .pbtn').forEach(b=>b.classList.toggle('on',+b.dataset.r===hlRange));
  // 選定日期已有的紀錄 → 預先填好，方便修改
  const w=hRec('w|'+hlDate), bp=hRec(`bp|${hlDate}|${bpSlot}`);
  $('wVal').value=w?w.val:''; $('bpSys').value=bp?bp.sys:''; $('bpDia').value=bp?bp.dia:''; $('bpPulse').value=bp?.pulse||'';
  const dayBps=Object.keys(BP_SLOT).map(s=>hRec(`bp|${hlDate}|${s}`)).filter(Boolean);
  $('hlDay').innerHTML=(w||dayBps.length)?`<div class="muted" style="margin-bottom:4px">${hlDate===t?'今天':fmtD(hlDate)}已記錄：</div>`+
      (w?`<div>⚖️ ${w.val} kg</div>`:'')+dayBps.map(b=>{const [c,col]=bpClass(b.sys,b.dia); return `<div>🩺 ${BP_SLOT[b.slot]} ${b.sys}/${b.dia}${b.pulse?` · 脈搏 ${b.pulse}`:''} <span class="bp-tag" style="background:${col}">${c}</span></div>`;}).join('')
    :`<span class="muted">${hlDate===t?'今天':fmtD(hlDate)}還沒有紀錄</span>`;

  // 上方三格：最新體重、最新血壓、最新體脂
  const ws=weightSeries(), lw=ws[ws.length-1];
  const ago=n=>{if(!lw) return null; const target=addDays(lw[0],-n); const c=[...ws].reverse().find(p=>p[0]<=target); return c?lw[1]-c[1]:null;};
  const bps=hOf('bp'), lb=bps[bps.length-1], ibs=hOf('ib'), li=ibs[ibs.length-1], pi=ibs[ibs.length-2];
  const avg7=(()=>{const f=addDays(t,-6), r=bps.filter(b=>b.date>=f); return r.length?[Math.round(r.reduce((s,b)=>s+b.sys,0)/r.length),Math.round(r.reduce((s,b)=>s+b.dia,0)/r.length),r.length]:null;})();
  $('hlTiles').innerHTML=
    `<div class="hl-tile"><div class="k">⚖️ 最新體重${lw?` · ${fmtD(lw[0])}`:''}</div><div class="v">${lw?lw[1]+' <small>kg</small>':'—'}</div><div class="small">${lw?`7 天 ${delta(ago(7),' kg')}　30 天 ${delta(ago(30),' kg')}`:'<span class="muted">輸入第一筆體重吧</span>'}</div></div>`+
    `<div class="hl-tile"><div class="k">🩺 最新血壓${lb?` · ${fmtD(lb.date)} ${BP_SLOT[lb.slot]}`:''}</div><div class="v">${lb?`${lb.sys}/${lb.dia}`:'—'}</div><div class="small">${lb?`<span class="bp-tag" style="background:${bpClass(lb.sys,lb.dia)[1]}">${bpClass(lb.sys,lb.dia)[0]}</span>${avg7?` <span class="muted">7 天平均 ${avg7[0]}/${avg7[1]}</span>`:''}`:'<span class="muted">還沒有血壓紀錄</span>'}</div></div>`+
    `<div class="hl-tile"><div class="k">🧬 體脂率${li?` · ${fmtD(li.date)}`:''}</div><div class="v">${li?.pbf!=null?li.pbf+' <small>%</small>':'—'}</div><div class="small">${li?`骨骼肌 ${li.smm??'—'} kg ${pi&&li.smm!=null&&pi.smm!=null?delta(li.smm-pi.smm,' kg',false):''}`:'<span class="muted">還沒有 InBody</span>'}</div></div>`;

  $('wChart').innerHTML=lineChart([{name:'體重',color:'#5b8cff',pts:ws}],{days:hlRange,unit:' kg'});
  $('bpChart').innerHTML=lineChart([
      {name:'收縮壓',color:'#ef5350',pts:bps.map(b=>[b.date,b.sys])},
      {name:'舒張壓',color:'#4fb3e8',pts:bps.map(b=>[b.date,b.dia])}],
    {days:hlRange,unit:' mmHg',refs:[{y:130,label:'130'},{y:80,label:'80'}]})+
    '<div class="row muted small" style="gap:14px"><span><i class="lg" style="background:#ef5350"></i>收縮壓</span><span><i class="lg" style="background:#4fb3e8"></i>舒張壓</span></div>';

  // InBody：最新一筆 + 跟第一筆比較
  $('ibLatest').innerHTML=li?`<div class="muted small" style="margin-bottom:6px">${li.date}${li.note?` · ${esc(li.note)}`:''}　<a href="#" data-ib="${li.date}">修改</a></div><div class="ib-sum">`+
      IB_FIELDS.filter(([k])=>li[k]!=null).map(([k,n,u])=>`<div><span>${n}</span><b>${li[k]}</b> <small class="muted">${u}</small></div>`).join('')+'</div>'
    :'<div class="muted">量完 InBody 後按「＋ 新增一筆」，把報告上的數字填進來。</div>';
  const fi=ibs[0];
  $('ibHist').innerHTML=ibs.length?(ibs.length>1?`<div class="muted small" style="margin-bottom:8px">${fi.date} → ${li.date}（共 ${ibs.length} 次）</div><div class="ib-cmp">`+
      IB_FIELDS.filter(([k])=>fi[k]!=null&&li[k]!=null).map(([k,n,u])=>{const goodDown=!['smm','bmr','score'].includes(k);
        return `<span>${n}</span><span><span class="from">${fi[k]}</span> → <b>${li[k]}</b> ${u} ${delta(li[k]-fi[k],'',goodDown)}</span>`;}).join('')+'</div>':'<div class="muted small">再量一次就能看到變化</div>')+
      '<ul class="list" style="margin-top:10px">'+[...ibs].reverse().map(r=>`<li><span class="grow">${r.date}${r.note?` <span class="muted">· ${esc(r.note)}</span>`:''}</span><span class="muted small">${r.weight??'—'} kg · 體脂 ${r.pbf??'—'}% · 肌肉 ${r.smm??'—'} kg</span><button class="x" data-ib="${r.date}" title="修改">✏️</button></li>`).join('')+'</ul>'
    :'<div class="muted">還沒有 InBody 紀錄</div>';

  const recent=[...hOf('weight'),...bps].sort((a,b)=>a.date>b.date?-1:a.date<b.date?1:(a.slot||'')>(b.slot||'')?-1:1).slice(0,25);
  $('hlList').innerHTML=recent.map(r=>r.type==='weight'
      ?`<li><span>⚖️</span><span class="grow">${r.val} kg<div class="muted" style="font-size:12px">${r.date}</div></span><button class="x" data-hdel="${r.id}">✕</button></li>`
      :`<li><span>🩺</span><span class="grow">${r.sys}/${r.dia}${r.pulse?` · 脈搏 ${r.pulse}`:''} <span class="bp-tag" style="background:${bpClass(r.sys,r.dia)[1]}">${bpClass(r.sys,r.dia)[0]}</span><div class="muted" style="font-size:12px">${r.date} ${BP_SLOT[r.slot]}</div></span><button class="x" data-hdel="${r.id}">✕</button></li>`).join('')
    ||'<li class="muted">還沒有紀錄</li>';
}
$('hlDate').onchange=e=>{hlDate=e.target.value||habitDay(); renderHealth();};
$('bpSlot').onclick=e=>{const b=e.target.closest('[data-s]'); if(b){bpSlot=b.dataset.s; renderHealth();}};
$('hlRange').onclick=e=>{const b=e.target.closest('[data-r]'); if(b){hlRange=+b.dataset.r; renderHealth();}};
$('wForm').onsubmit=e=>{e.preventDefault(); const v=Math.round(+$('wVal').value*10)/10; if(!v) return;
  hPut({id:'w|'+hlDate,type:'weight',date:hlDate,val:v}); renderHealth();};
$('bpForm').onsubmit=e=>{e.preventDefault();
  const sy=Math.round(+$('bpSys').value), di=Math.round(+$('bpDia').value), pu=Math.round(+$('bpPulse').value)||null;
  if(!sy||!di) return alert('請輸入收縮壓和舒張壓');
  if(sy<=di) return alert('收縮壓（上面的數字）應該比舒張壓大，請確認一下');
  hPut({id:`bp|${hlDate}|${bpSlot}`,type:'bp',date:hlDate,slot:bpSlot,sys:sy,dia:di,...(pu?{pulse:pu}:{})}); renderHealth();};
const hlClick=e=>{
  const d=e.target.closest('[data-hdel]'); if(d){if(confirm('刪除這筆紀錄？')){db.health=db.health.filter(x=>x.id!==d.dataset.hdel); save(); renderHealth();} return;}
  const ib=e.target.closest('[data-ib]'); if(ib){e.preventDefault(); openIb(ib.dataset.ib);}
};
$('tab-health').addEventListener('click',hlClick);
$('ibFields').innerHTML=IB_FIELDS.map(([k,n,u,st])=>`<div><label>${n}${u?`（${u}）`:''}</label><input type="number" step="${st}" min="0" id="ib_${k}"></div>`).join('');
function openIb(date){
  ibEditing=date?hRec('ib|'+date):null;
  $('ibTitle').textContent=ibEditing?'修改 InBody 紀錄':'新增 InBody 紀錄';
  $('ibDate').value=ibEditing?.date||habitDay();
  IB_FIELDS.forEach(([k])=>$('ib_'+k).value=ibEditing?.[k]??'');
  $('ibNote').value=ibEditing?.note||'';
  $('ibDel').classList.toggle('hidden',!ibEditing);
  $('ibModal').classList.remove('hidden');
}
$('ibAdd').onclick=()=>openIb(null);
const closeIb=()=>$('ibModal').classList.add('hidden');
$('ibCancel').onclick=closeIb; $('ibModal').onclick=e=>{if(e.target.id==='ibModal') closeIb();};
$('ibDel').onclick=()=>{if(confirm(`刪除 ${ibEditing.date} 的 InBody 紀錄？`)){db.health=db.health.filter(x=>x!==ibEditing); save(); closeIb(); renderHealth();}};
$('ibForm').onsubmit=e=>{e.preventDefault();
  const date=$('ibDate').value, rec={id:'ib|'+date,type:'ib',date};
  IB_FIELDS.forEach(([k])=>{const v=$('ib_'+k).value; if(v!=='') rec[k]=+v;});
  if(Object.keys(rec).length<=3) return alert('至少填一個數字');
  if($('ibNote').value.trim()) rec.note=$('ibNote').value.trim();
  if(ibEditing&&ibEditing.date!==date) db.health=db.health.filter(x=>x!==ibEditing);   // 改了日期
  hPut(rec); closeIb(); renderHealth();};

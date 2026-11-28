/* ---------- 飲食：身體資料 → TDEE、蛋白質目標；打字記錄吃了什麼，自動估算營養 ----------
   db.body：身體資料（id 'profile'，飲食和健身頁共用）
   db.meals：每一筆吃的東西 {id,date,slot,name,amount,k,p,c,s,f,fi,na,src}
   AI 分析用使用者自己的 Claude API 金鑰，只存在這台裝置的瀏覽器（不會同步到雲端） */
const ACTS=[[1.2,'幾乎不運動（久坐）'],[1.375,'輕度：每週運動 1–3 天'],[1.55,'中度：每週運動 3–5 天'],[1.725,'高度：每週運動 6–7 天'],[1.9,'非常高：勞力工作＋每天訓練']];
const SLOTS_M={b:'🌅 早餐',l:'🍱 午餐',d:'🍽️ 晚餐',s:'🍪 點心'};
const NUTR=[['k','熱量','kcal'],['p','蛋白質','g'],['c','碳水','g'],['s','糖','g'],['f','脂肪','g'],['fi','纖維','g'],['na','鈉','mg']];
function bodyProf(){
  let p=db.body.find(x=>x.id==='profile');
  if(!p){p={id:'profile',sex:'m',age:null,height:null,act:1.375,goalW:null,protK:1.8,shapes:[],equip:'gym',days:3,level:'new'}; db.body.push(p);}
  return p;
}
// 目前體重：健康頁最新一筆；沒有的話用這裡手動填的
const curWeight=()=>{const s=weightSeries(); return s.length?s[s.length-1][1]:bodyProf().w||null;};
function dietTargets(){
  const p=bodyProf(), w=curWeight(); if(!w||!p.height||!p.age) return null;
  const bmr=Math.round(10*w+6.25*p.height-5*p.age+(p.sex==='f'?-161:5));   // Mifflin-St Jeor
  const tdee=Math.round(bmr*p.act);
  const gw=+p.goalW||0, mode=gw&&gw<w-0.5?'cut':gw&&gw>w+0.5?'bulk':'keep';
  const kcal=mode==='cut'?Math.max(Math.round(tdee*0.8),bmr):mode==='bulk'?tdee+300:tdee;   // 減脂少 20%（不低於基礎代謝）、增肌多 300
  const protT=Math.round(w*p.protK), fat=Math.round(kcal*0.25/9);
  const carb=Math.max(0,Math.round((kcal-protT*4-fat*9)/4));
  return {w,bmr,tdee,kcal,mode,gw,prot:[Math.round(w*1.6),Math.round(w*2)],protT,
    goal:{k:kcal,p:protT,c:carb,s:Math.round(kcal*0.1/4),f:fat,fi:p.sex==='f'?25:30,na:2400}};
}

/* 打字的內容 → 對照食物資料庫 */
const FKEYS=FOODS.flatMap(f=>[f.n,...f.a].map(k=>[k,f])).sort((a,b)=>b[0].length-a[0].length);
const CNUM={'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'半':0.5};
const NUM='(\\d+(?:\\.\\d+)?|[一二兩三四五六七八九十半])', UNIT='(小碗|大碗|湯匙|公克|顆|個|碗|盤|杯|片|條|支|份|根|罐|包|塊|匙|把|球|瓶|g|G|克)';
const QTY_BEFORE=new RegExp(NUM+'\\s*'+UNIT+'?\\s*$'), QTY_AFTER=new RegExp('^\\s*'+NUM+'\\s*'+UNIT);
const toNum=s=>/^\d/.test(s)?parseFloat(s):CNUM[s]||1;
const NOISE=/(早餐|午餐|晚餐|宵夜|點心|今天|今日|吃了|喝了|吃|喝|大概|大約|然後|還有|以及|加上|加|的|了)/g;
// 份量換算：「200g」用一份的克數換算；「大碗」算 1.5 份
const qtyOf=(m,food)=>{const n=toNum(m[1]), unit=m[2]||''; return /^(g|G|克|公克)$/.test(unit)?(food.g?n/food.g:1):unit==='大碗'?n*1.5:n;};
function parseMeal(text){
  const items=[], unknown=[];
  for(const seg of text.split(/[、,，+＋\n;；。]|和|跟|配|還有|以及/).map(s=>s.trim()).filter(Boolean)){
    // 由左到右找食物；份量看緊貼在前面的「兩顆」，或緊貼在後面的「半碗」「200g」
    let rest=seg, left='', found=0;
    for(let guard=0;guard<10;guard++){
      let best=null;
      for(const [k,f] of FKEYS){const i=rest.indexOf(k); if(i>=0&&(!best||i<best.i||(i===best.i&&k.length>best.k.length))) best={i,k,f};}
      if(!best) break;
      const pre=rest.slice(0,best.i), post=rest.slice(best.i+best.k.length);
      const mb=pre.match(QTY_BEFORE); let ma=post.match(QTY_AFTER);
      if(ma&&FKEYS.some(([k])=>post.slice(ma[0].length).trimStart().startsWith(k))) ma=null;   // 是下一個食物的份量
      const qty=mb?qtyOf(mb,best.f):ma?qtyOf(ma,best.f):1;
      items.push(mealFromFood(best.f,Math.round(qty*100)/100)); found++;
      left+=mb?pre.slice(0,pre.length-mb[0].length):pre;
      rest=ma?post.slice(ma[0].length):post;
    }
    left=(left+rest).replace(NOISE,'').replace(new RegExp('\\d+(?:\\.\\d+)?\\s*'+UNIT+'?','g'),'').replace(/\s/g,'');
    if(left.length>=2||(!found&&left.length)) unknown.push(left);
  }
  return {items,unknown};
}
function mealFromFood(f,qty){
  const it={name:f.n,unit:f.u,qty,base:{},src:'db'};
  NUTR.forEach(([k])=>it.base[k]=f[k]||0); return mealScale(it);
}
function mealScale(it){NUTR.forEach(([k])=>it[k]=Math.round((it.base[k]||0)*it.qty*10)/10); return it;}

/* AI 分析：用使用者自己的 Claude API 金鑰，直接從瀏覽器呼叫 */
const AI_MODELS=[['claude-opus-5-5','Claude Opus 5.5（最準，預設）'],['claude-sonnet-5-5','Claude Sonnet 5.5（比較便宜）'],['claude-haiku-5-5','Claude Haiku 5.5（最便宜、最快）']];
const AI_SCHEMA={type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'object',additionalProperties:false,
  required:['name','amount','kcal','protein_g','carbs_g','sugar_g','fat_g','fiber_g','sodium_mg'],
  properties:{name:{type:'string'},amount:{type:'string'},kcal:{type:'number'},protein_g:{type:'number'},carbs_g:{type:'number'},sugar_g:{type:'number'},fat_g:{type:'number'},fiber_g:{type:'number'},sodium_mg:{type:'number'}}}}}};
const AI_SYSTEM='你是台灣的營養師。使用者會用中文描述吃了什麼（可能是台灣外食、便利商店、手搖飲）。把內容拆成一項一項的食物，估計每一項的份量和營養素（熱量 kcal、蛋白質、碳水、糖、脂肪、膳食纖維 g、鈉 mg）。沒寫份量就用台灣常見的一份。name 用繁體中文，amount 寫你假設的份量（例如「1 碗約 200g」）。只回傳 JSON。';
// 有沒有辦法用 AI 分析（網頁版要有金鑰；Claude App 版改用 Claude 本身，會覆寫這個函式）
function hasAI(){return !!ls('claudeKey');}
let anthropicMod=null;
async function aiAnalyze(text){
  const key=ls('claudeKey'); if(!key) throw new Error('還沒有設定 Claude API 金鑰');
  anthropicMod??=await import('https://esm.sh/@anthropic-ai/sdk');
  const client=new anthropicMod.default({apiKey:key,dangerouslyAllowBrowser:true});
  const model=ls('claudeModel')||'claude-opus-5-5';
  const req={model,max_tokens:16000,system:AI_SYSTEM,messages:[{role:'user',content:text}],
    output_config:{effort:'low',format:{type:'json_schema',schema:AI_SCHEMA}}};
  // 被安全機制拒絕時自動換模型重試（Opus、Sonnet 支援；Haiku 沒有）
  const res=model==='claude-haiku-5-5'?await client.messages.create(req)
    :await client.beta.messages.create({...req,betas:['server-side-fallback-2026-07-01'],fallbacks:'default'});
  if(res.stop_reason==='refusal') throw new Error('AI 拒絕回答這次的內容，請換個說法再試一次');
  if(res.stop_reason==='max_tokens') throw new Error('內容太長，AI 沒寫完，請分成幾次輸入');
  const txt=res.content.filter(b=>b.type==='text').map(b=>b.text).join('');
  return JSON.parse(txt).items.map(x=>{
    const it={name:x.name,unit:x.amount,qty:1,src:'ai',base:{k:x.kcal,p:x.protein_g,c:x.carbs_g,s:x.sugar_g,f:x.fat_g,fi:x.fiber_g,na:x.sodium_mg}};
    return mealScale(it);
  });
}

/* 畫面 */
let dDay=habitDay(), dSlot=(h=>h<DAY_START_HOUR?'s':h<10?'b':h<14?'l':h<17?'s':h<21?'d':'s')(new Date().getHours());
let dPrev=[], dUnknown=[], dBusy=false;
const fmtN=(v,u)=>`${Math.round(v*10)/10} ${u}`;
function renderDiet(){
  const p=bodyProf(), T=dietTargets(), w=curWeight();
  // 身體資料表單
  $('dpSex').value=p.sex; $('dpAge').value=p.age??''; $('dpH').value=p.height??''; $('dpAct').value=p.act;
  $('dpGoal').value=p.goalW??''; $('dpProt').value=p.protK; $('dpProtV').textContent=p.protK.toFixed(1);
  $('dpW').value=w??''; $('dpW').disabled=!!weightSeries().length;
  $('dpWHint').textContent=weightSeries().length?'（健康頁）':'（先填這裡）';
  $('dpTargets').innerHTML=!T?'<div class="muted">填好年齡、身高、體重，就會算出每天建議吃多少。</div>':
    `<div class="dt-grid">
      <div class="stat"><div class="muted">基礎代謝 BMR</div><div class="v">${T.bmr}<small> kcal</small></div></div>
      <div class="stat"><div class="muted">每日消耗 TDEE</div><div class="v">${T.tdee}<small> kcal</small></div></div>
      <div class="stat"><div class="muted">${T.mode==='cut'?'減脂':T.mode==='bulk'?'增肌':'維持'}建議攝取</div><div class="v">${T.kcal}<small> kcal</small></div></div>
      <div class="stat"><div class="muted">蛋白質（×${p.protK.toFixed(1)}）</div><div class="v">${T.protT}<small> g</small></div><div class="muted small">建議範圍 ${T.prot[0]}–${T.prot[1]} g</div></div>
    </div>
    <div class="muted small" style="margin-top:8px">碳水約 ${T.goal.c} g、脂肪約 ${T.goal.f} g（熱量 25%）、添加糖最好少於 ${T.goal.s} g（熱量 10%）。
    ${T.mode==='cut'?`目標 ${T.gw} kg：每天少吃約 ${T.tdee-T.kcal} kcal，大約每週減 ${((T.tdee-T.kcal)*7/7700).toFixed(1)} kg。`:T.mode==='bulk'?`目標 ${T.gw} kg：每天多吃約 300 kcal，搭配重量訓練。`:''}
    公式：Mifflin-St Jeor × 活動量，只是估計值。</div>`;
  // 日期、今天的總量
  const d=parse(dDay); $('dDay').textContent=`${d.getMonth()+1}/${d.getDate()}（${WD[d.getDay()]}）${dDay===habitDay()?' 今天':''}`;
  document.querySelectorAll('#dSlotSeg .pbtn').forEach(b=>b.classList.toggle('on',b.dataset.s===dSlot));
  const meals=db.meals.filter(m=>m.date===dDay), sum={}; NUTR.forEach(([k])=>sum[k]=meals.reduce((a,m)=>a+(+m[k]||0),0));
  $('dTotals').innerHTML=NUTR.map(([k,n,u])=>{
    const g=T?.goal[k], pct=g?Math.min(100,sum[k]/g*100):0, over=g&&sum[k]>g&&k!=='p'&&k!=='fi';
    return `<div class="bar-row" style="grid-template-columns:56px 1fr 130px"><span>${n}</span><div class="bar-bg"><div class="bar" style="width:${pct}%;background:${over?'var(--red)':k==='p'?'var(--green)':'var(--primary)'}"></div></div><span style="text-align:right">${fmtN(sum[k],u)}${g?` <span class="muted small">/ ${g}</span>`:''}</span></div>`;}).join('');
  $('dMeals').innerHTML=Object.entries(SLOTS_M).map(([s,label])=>{
    const ms=meals.filter(m=>m.slot===s); if(!ms.length) return '';
    return `<div class="dm-slot"><div class="dm-head">${label}<span class="muted small">${Math.round(ms.reduce((a,m)=>a+m.k,0))} kcal · 蛋白質 ${Math.round(ms.reduce((a,m)=>a+m.p,0))} g</span></div>`+
      ms.map(m=>`<div class="dm-it"><span class="grow">${esc(m.name)} <span class="muted small">${esc(m.amount||'')}</span>${m.src==='ai'?' <span class="tag">AI</span>':''}</span><span class="small">${Math.round(m.k)} kcal · P ${Math.round(m.p)}</span><button class="x" data-mdel="${m.id}">✕</button></div>`).join('')+'</div>';
  }).join('')||'<div class="muted">這天還沒有紀錄</div>';
  renderDietPreview();
  // AI 設定
  const hasKey=hasAI();
  $('dAi').classList.toggle('hidden',!hasKey); $('dAiHint').classList.toggle('hidden',hasKey);
  $('aiKeyState').textContent=hasKey?'✅ 已設定（只存在這台裝置）':'尚未設定';
  $('aiModel').value=ls('claudeModel')||'claude-opus-5-5';
}
function renderDietPreview(){
  const box=$('dPrevBox'); box.classList.toggle('hidden',!dPrev.length&&!dUnknown.length);
  $('dPrev').innerHTML=dPrev.map((it,i)=>`<div class="dp-it"><span class="grow">${esc(it.name)} <span class="muted small">${esc(it.unit||'')}</span>${it.src==='ai'?' <span class="tag">AI</span>':''}</span>
    <label class="small">× <input type="number" step="0.5" min="0" value="${it.qty}" data-pq="${i}" style="width:62px"></label>
    <span class="small" style="min-width:120px;text-align:right">${Math.round(it.k)} kcal · P ${Math.round(it.p)} g</span><button class="x" data-pdel="${i}">✕</button></div>`).join('')+
    (dPrev.length>1?`<div class="dp-it" style="font-weight:600"><span class="grow">合計</span><span class="small">${Math.round(dPrev.reduce((a,x)=>a+x.k,0))} kcal · P ${Math.round(dPrev.reduce((a,x)=>a+x.p,0))} g · 糖 ${Math.round(dPrev.reduce((a,x)=>a+x.s,0))} g</span></div>`:'');
  $('dUnknown').innerHTML=dUnknown.length?`⚠️ 資料庫裡找不到：${dUnknown.map(esc).join('、')}${hasAI()?'（可以按「🤖 AI 分析」）':'（可以手動新增，或在下方設定 AI）'}`:'';
  $('dSave').disabled=!dPrev.length;
}
// 身體資料
$('dpForm').addEventListener('change',()=>{
  const p=bodyProf(), num=id=>{const v=parseFloat($(id).value); return isNaN(v)?null:v;};
  Object.assign(p,{sex:$('dpSex').value,age:num('dpAge'),height:num('dpH'),act:+$('dpAct').value,goalW:num('dpGoal'),protK:+$('dpProt').value});
  if(!weightSeries().length) p.w=num('dpW');
  save(); renderDiet();
});
$('dpProt').oninput=()=>$('dpProtV').textContent=(+$('dpProt').value).toFixed(1);
$('dpAct').innerHTML=ACTS.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
// 日期、餐別
$('dPrevDay').onclick=()=>{dDay=addDays(dDay,-1); renderDiet();};
$('dNextDay').onclick=()=>{dDay=addDays(dDay,1); renderDiet();};
$('dSlotSeg').onclick=e=>{const b=e.target.closest('[data-s]'); if(b){dSlot=b.dataset.s; renderDiet();}};
// 分析
$('dParse').onclick=()=>{
  const t=$('dText').value.trim(); if(!t) return $('dText').focus();
  const r=parseMeal(t); dPrev=[...dPrev,...r.items]; dUnknown=r.unknown; renderDietPreview();
};
$('dAi').onclick=async()=>{
  const t=$('dText').value.trim(); if(!t) return $('dText').focus(); if(dBusy) return;
  const label=$('dAi').textContent;
  dBusy=true; $('dAi').textContent='🤖 分析中…'; $('dAi').disabled=true;
  try{dPrev=[...dPrev,...await aiAnalyze(t)]; dUnknown=[];}
  catch(err){alert('AI 分析失敗：'+(err?.status===401?'金鑰不正確或已失效':err?.message||err));}
  dBusy=false; $('dAi').textContent=label; $('dAi').disabled=false; renderDietPreview();
};
$('dText').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault(); $('dParse').click();}};
$('dPrev').addEventListener('change',e=>{const i=e.target.dataset.pq; if(i==null) return; const it=dPrev[+i]; it.qty=Math.max(0,+e.target.value||0); mealScale(it); renderDietPreview();});
$('dPrev').addEventListener('click',e=>{const i=e.target.dataset.pdel; if(i!=null){dPrev.splice(+i,1); renderDietPreview();}});
$('dClear').onclick=()=>{dPrev=[]; dUnknown=[]; renderDietPreview();};
$('dSave').onclick=()=>{
  dPrev.filter(it=>it.qty>0).forEach(it=>{
    const r={id:uid(),date:dDay,slot:dSlot,name:it.name,amount:(it.qty!==1?`共 ${it.qty} 份 · 每份 `:'')+(it.unit||''),src:it.src};
    NUTR.forEach(([k])=>r[k]=it[k]); db.meals.push(r);
  });
  dPrev=[]; dUnknown=[]; $('dText').value=''; save(); renderDiet();
};
// 手動新增
$('dManual').onsubmit=e=>{e.preventDefault();
  const n=$('dmName').value.trim(), k=+$('dmK').value; if(!n||!(k>=0)) return;
  const it={name:n,unit:'',qty:1,src:'manual',base:{k,p:+$('dmP').value||0,c:+$('dmC').value||0,s:+$('dmS').value||0,f:+$('dmF').value||0,fi:0,na:0}};
  dPrev.push(mealScale(it)); e.target.reset(); renderDietPreview();
};
$('dMeals').onclick=async e=>{const id=e.target.dataset.mdel; if(id&&await ask('刪除這筆？')){db.meals=db.meals.filter(m=>m.id!==id); save(); renderDiet();}};
// AI 設定（金鑰只存在這台裝置，不會同步）
$('aiModel').innerHTML=AI_MODELS.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
$('aiModel').onchange=e=>ls('claudeModel',e.target.value);
$('aiKeySave').onclick=()=>{const v=$('aiKey').value.trim(); if(!v) return; ls('claudeKey',v); $('aiKey').value=''; renderDiet();};
$('aiKeyDel').onclick=async()=>{if(await ask('從這台裝置移除 Claude API 金鑰？')){ls('claudeKey',null); renderDiet();}};

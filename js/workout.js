/* ---------- 健身：依目標體重和想要的身材，排出每週訓練菜單 ----------
   設定存在 db.body 的 profile（跟飲食頁共用）：shapes 想要的身材、equip 器材、days 每週幾天、level 程度。
   動作庫 EX：g 部位、eq 需要的器材（gym 健身房、db 啞鈴、home 徒手）、t 時間制（秒）、tip 重點 */
const SHAPES=[
  ['abs','六塊肌','腹直肌＋降體脂'],['vline','人魚線','腹斜肌、下腹＋降體脂'],['vtaper','倒三角','背闊肌、肩膀側束'],
  ['chest','胸肌','上胸、中胸'],['arms','手臂線條','二頭、三頭'],['glute','翹臀','臀大肌、臀中肌'],
  ['legs','腿部線條','大腿、小腿'],['fatloss','整體減脂','全身＋有氧'],['strong','增肌變壯','大重量複合動作'],
];
// 每種身材要加強哪些部位（數字越大越優先）
const SHAPE_GROUPS={abs:{abs:3,cardio:2},vline:{obl:3,abs:2,cardio:2},vtaper:{back:3,shoulder:3},chest:{chest:3,shoulder:1},
  arms:{arms:3},glute:{glute:3,legs:1},legs:{legs:2,glute:1,cardio:1},fatloss:{cardio:3,legs:1,back:1,chest:1},strong:{legs:2,back:2,chest:2}};
const GNAME={chest:'胸',back:'背',shoulder:'肩',arms:'手臂',legs:'腿',glute:'臀',abs:'腹肌',obl:'腹斜肌',cardio:'有氧'};
const EX=[
  // 胸
  {n:'槓鈴臥推',c:1,g:'chest',eq:['gym'],tip:'肩胛骨夾緊、槓落在乳頭下緣'},
  {n:'上斜啞鈴臥推',c:1,g:'chest',eq:['gym','db'],tip:'椅子 30°，練上胸'},
  {n:'器械夾胸（蝴蝶機）',g:'chest',eq:['gym'],tip:'手肘微彎，夾到中間停 1 秒'},
  {n:'啞鈴臥推',c:1,g:'chest',eq:['db'],tip:'下放到胸口兩側'},
  {n:'伏地挺身',c:1,g:'chest',eq:['home','db','gym'],tip:'身體一直線，做不到可以跪姿'},
  {n:'窄距伏地挺身',g:'chest',eq:['home'],tip:'兩手靠近，同時練三頭'},
  // 背
  {n:'滑輪下拉',c:1,g:'back',eq:['gym'],tip:'拉到鎖骨，用背不是用手'},
  {n:'引體向上（可輔助）',c:1,g:'back',eq:['gym','home'],tip:'做不到可以用彈力帶或輔助機'},
  {n:'坐姿划船',c:1,g:'back',eq:['gym'],tip:'挺胸，手肘往後帶'},
  {n:'單手啞鈴划船',c:1,g:'back',eq:['db','gym'],tip:'背打平，啞鈴拉到腰側'},
  {n:'俯身反向划船（桌子／毛巾）',c:1,g:'back',eq:['home'],tip:'在穩固的桌子下面拉起身體'},
  {n:'超人式',g:'back',eq:['home'],tip:'手腳同時抬起停 2 秒',t:1},
  // 肩
  {n:'啞鈴肩推',c:1,g:'shoulder',eq:['gym','db'],tip:'不要聳肩'},
  {n:'側平舉',g:'shoulder',eq:['gym','db'],tip:'練肩膀側束，倒三角關鍵；重量輕、控制'},
  {n:'臉拉（Face pull）',g:'shoulder',eq:['gym'],tip:'拉到眼睛高度，練後束'},
  {n:'派克伏地挺身',c:1,g:'shoulder',eq:['home'],tip:'屁股抬高，頭往地板下'},
  {n:'寶特瓶側平舉',g:'shoulder',eq:['home'],tip:'裝滿水的 1.5L 寶特瓶也可以'},
  // 手臂
  {n:'啞鈴彎舉',bi:1,g:'arms',eq:['gym','db'],tip:'手肘固定在身體旁'},
  {n:'繩索三頭下壓',g:'arms',eq:['gym'],tip:'手肘不要張開'},
  {n:'啞鈴過頭三頭伸展',g:'arms',eq:['db','gym'],tip:'上臂貼耳朵'},
  {n:'椅子撐體（Dips）',g:'arms',eq:['home','db'],tip:'練三頭，肩膀不舒服就做淺一點'},
  {n:'毛巾彎舉（腳踩毛巾對抗）',bi:1,g:'arms',eq:['home'],tip:'慢慢彎起、慢慢放'},
  // 腿
  {n:'槓鈴深蹲',c:1,g:'legs',eq:['gym'],tip:'膝蓋跟腳尖同方向，蹲到大腿平行'},
  {n:'腿推機',c:1,g:'legs',eq:['gym'],tip:'不要鎖死膝蓋'},
  {n:'羅馬尼亞硬舉',c:1,g:'legs',eq:['gym','db'],tip:'臀部往後推，背打直，練大腿後側'},
  {n:'高腳杯深蹲',c:1,g:'legs',eq:['db'],tip:'啞鈴抱在胸前'},
  {n:'徒手深蹲',c:1,g:'legs',eq:['home'],tip:'太輕鬆就放慢下蹲 3 秒'},
  {n:'保加利亞分腿蹲',c:1,g:'legs',eq:['home','db','gym'],tip:'後腳放椅子，每腳各做'},
  {n:'提踵',g:'legs',eq:['home','db','gym'],tip:'練小腿，頂端停 1 秒'},
  // 臀
  {n:'臀推',c:1,g:'glute',eq:['gym','db'],tip:'上背靠椅子，頂端夾臀 1 秒'},
  {n:'臀橋',c:1,g:'glute',eq:['home'],tip:'頂端夾緊臀部，可單腳加難度'},
  {n:'側躺抬腿',g:'glute',eq:['home','db','gym'],tip:'練臀中肌，讓臀部更圓'},
  {n:'彈力帶側走',g:'glute',eq:['home','db','gym'],tip:'膝蓋微彎，保持張力'},
  // 腹
  {n:'捲腹',g:'abs',eq:['home','db','gym'],tip:'下背貼地，用腹肌捲起上半身'},
  {n:'平板支撐',g:'abs',eq:['home','db','gym'],tip:'核心收緊，屁股不要翹',t:1},
  {n:'懸垂抬腿',g:'abs',eq:['gym'],tip:'練下腹，不要甩'},
  {n:'仰臥抬腿',g:'abs',eq:['home','db'],tip:'練下腹，下背貼地'},
  {n:'健腹輪',g:'abs',eq:['gym','home'],tip:'可以從跪姿開始'},
  // 腹斜（人魚線）
  {n:'俄羅斯轉體',g:'obl',eq:['home','db','gym'],tip:'轉的是上半身，不是手'},
  {n:'側棒式',g:'obl',eq:['home','db','gym'],tip:'身體一直線，每邊做',t:1},
  {n:'單車捲腹',g:'obl',eq:['home','db','gym'],tip:'手肘碰對側膝蓋，慢慢做'},
  {n:'繩索伐木',g:'obl',eq:['gym'],tip:'由上往下斜拉，練腹斜'},
  {n:'登山者',g:'obl',eq:['home','db','gym'],tip:'膝蓋往對側手肘帶',t:1},
  // 有氧
  {n:'跑步機坡度快走',g:'cardio',eq:['gym'],tip:'坡度 8–12、時速 5，心跳約最大心率 60–70%',t:2},
  {n:'飛輪／腳踏車',g:'cardio',eq:['gym'],tip:'中等強度，說話會喘但還能講',t:2},
  {n:'快走或慢跑',g:'cardio',eq:['home','db'],tip:'飯後快走也算',t:2},
  {n:'開合跳＋波比跳間歇',g:'cardio',eq:['home','db'],tip:'30 秒動、30 秒休，做 10 輪',t:2},
];
// 每週天數 → 每天練哪些部位；ok＝這天可以額外加的優先部位（腿日不會被塞胸、手臂）
const UPPER=['chest','back','shoulder','arms','abs','obl'], LOWER=['legs','glute','abs','obl'];
function dayTemplates(n){
  const full=['legs','chest','back','shoulder','abs'], all=Object.keys(GNAME);
  if(n<=3) return Array.from({length:n},(_,i)=>({name:`全身 ${'ABC'[i]}`,gs:full,ok:all}));
  if(n===4) return [{name:'上半身 A',gs:['chest','back','shoulder','arms_b','abs'],ok:UPPER},{name:'下半身 A',gs:['legs','glute','legs','obl','cardio'],ok:LOWER},
                    {name:'上半身 B',gs:['back','chest','shoulder','arms_t','obl'],ok:UPPER},{name:'下半身 B',gs:['legs','glute','legs','abs','cardio'],ok:LOWER}];
  const ppl=[{name:'推（胸肩三頭）',gs:['chest','chest','shoulder','arms_t','abs'],ok:['chest','shoulder','arms','abs','obl']},
             {name:'拉（背二頭）',gs:['back','back','shoulder_a','arms_b','obl'],ok:['back','shoulder','arms','abs','obl']},
             {name:'腿臀',gs:['legs','legs','glute','abs','cardio'],ok:LOWER}];
  return Array.from({length:n},(_,i)=>({...ppl[i%3],name:ppl[i%3].name+(i>=3?' B':'')}));
}
function buildPlan(){
  const p=bodyProf(), w=curWeight(), gw=+p.goalW||0;
  const mode=gw&&w&&gw<w-0.5?'cut':gw&&w&&gw>w+0.5?'bulk':'keep';
  const pri={}; (p.shapes||[]).forEach(s=>Object.entries(SHAPE_GROUPS[s]||{}).forEach(([g,v])=>pri[g]=(pri[g]||0)+v));
  if(mode==='cut') pri.cardio=(pri.cardio||0)+2;
  const top=Object.entries(pri).filter(([g])=>g!=='cardio').sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  const beg=p.level==='new';
  // 組數、次數：減脂多次數短休息；增肌中等次數長休息
  const scheme=mode==='cut'?{sets:3,reps:'12–15',rest:'45–60 秒'}:mode==='bulk'||(p.shapes||[]).includes('strong')?{sets:4,reps:'8–12',rest:'90 秒'}:{sets:3,reps:'10–12',rest:'60–90 秒'};
  // 每個部位當天第一個動作用複合動作（深蹲、臥推、划船…），第二個再用輔助動作；不同天輪流換
  // 部位後面的 _b＝二頭、_t＝三頭、_a＝只用輔助動作（例如拉日的肩膀做側平舉、臉拉，不做肩推）
  const pick=(spec,di,occ,seen)=>{
    const [g,m]=spec.split('_');
    let list=EX.filter(e=>e.g===g&&e.eq.includes(p.equip||'gym'));
    if(m==='b') list=list.filter(e=>e.bi); else if(m==='t') list=list.filter(e=>!e.bi); else if(m==='a') list=list.filter(e=>!e.c);
    if(!list.length) return null;
    const comp=list.filter(e=>e.c), acc=list.filter(e=>!e.c);
    const pool=(occ===0||(g==='legs'&&occ===1&&comp.length>1))&&comp.length?comp:acc.length?acc:list;   // 腿日前兩個都用複合動作（蹲＋硬舉類）
    for(let k=0;k<pool.length;k++){const e=pool[(di+k)%pool.length]; if(!seen.has(e.n)) return e;}
    return list.find(e=>!seen.has(e.n))||null;
  };
  const days=dayTemplates(Math.min(6,Math.max(2,+p.days||3))).map((d,di)=>{
    let gs=[...d.gs]; const base=s=>s.split('_')[0];
    // 優先部位：這天適合練、還沒排到就加進來；排到了就多一組
    top.slice(0,2).forEach(g=>{if(d.ok.includes(g)&&!gs.some(x=>base(x)===g)&&gs.length<7) gs.splice(gs.length-(gs.at(-1)==='cardio'?1:0),0,g);});
    if((pri.cardio||0)>=2&&!gs.includes('cardio')) gs.push('cardio');
    const seen=new Set(), occ={}, list=[];
    for(const spec of gs){const g=base(spec), e=pick(spec,di,occ[g]||0,seen); occ[g]=(occ[g]||0)+1; if(!e) continue; seen.add(e.n);
      const boost=(pri[g]||0)>=3?1:0, sets=Math.min(4,Math.max(2,scheme.sets-(beg?1:0)+boost));
      const reps=e.t===2?(mode==='cut'?'25–35 分鐘':'15–20 分鐘'):e.t?(beg?'20–30 秒':'40–60 秒'):g==='abs'||g==='obl'?'15–20 下':scheme.reps+' 下';
      list.push({...e,sets:e.t===2?1:sets,reps,rest:e.t===2?'':g==='abs'||g==='obl'?'30–45 秒':scheme.rest,pri:!!boost});
    }
    return {...d,list};
  });
  return {mode,w,gw,pri,top,scheme,days};
}function renderGym(){
  const p=bodyProf(), w=curWeight();
  $('gGoal').value=p.goalW??''; $('gNowW').textContent=w?`${w} kg`:'還沒有體重紀錄（到健康頁記錄，或在飲食頁填）';
  $('gShapes').innerHTML=SHAPES.map(([k,n,d])=>`<button type="button" class="gchip${(p.shapes||[]).includes(k)?' on':''}" data-shape="${k}" title="${d}">${n}</button>`).join('');
  document.querySelectorAll('#gEquip .pbtn').forEach(b=>b.classList.toggle('on',b.dataset.v===(p.equip||'gym')));
  document.querySelectorAll('#gLevel .pbtn').forEach(b=>b.classList.toggle('on',b.dataset.v===(p.level||'new')));
  $('gDays').value=p.days||3; $('gDaysV').textContent=p.days||3;
  const P=buildPlan(), ib=hOf('ib').pop();
  const notes=[];
  if(P.mode==='cut') notes.push(`目標從 ${P.w} → ${P.gw} kg：以減脂為主，重量訓練保住肌肉，每次最後加有氧。`);
  if(P.mode==='bulk') notes.push(`目標從 ${P.w} → ${P.gw} kg：以增肌為主，每週慢慢加重量或次數（漸進超負荷）。`);
  if((p.shapes||[]).some(s=>s==='abs'||s==='vline')) notes.push(`腹肌和人魚線要「看得到」主要靠體脂：男生大約 10–12%、女生大約 18–20% 以下。${ib?.pbf?`你最近一次 InBody 體脂率 ${ib.pbf}%。`:''}練腹只會讓它更明顯，飲食控制才是關鍵。`);
  if((p.shapes||[]).includes('vtaper')) notes.push('倒三角＝寬背＋肩膀側束，下拉／划船和側平舉每次都要做。');
  if(!(p.shapes||[]).length) notes.push('先在上面選想要的身材，菜單會依照目標調整。');
  $('gNotes').innerHTML=notes.map(n=>`<li>${esc(n)}</li>`).join('');
  $('gPlan').innerHTML=P.days.map((d,i)=>`<div class="card gday"><h2>第 ${i+1} 天 · ${esc(d.name)}</h2>
    <table class="gtab"><thead><tr><th>動作</th><th>組數</th><th>次數／時間</th><th>休息</th></tr></thead><tbody>${d.list.map(e=>
      `<tr${e.pri?' class="gpri"':''}><td><b>${esc(e.n)}</b> <span class="tag">${GNAME[e.g]}</span>${e.pri?' <span class="tag" style="background:var(--amber);color:#fff">重點</span>':''}<div class="muted small">${esc(e.tip)}</div></td><td>${e.sets} 組</td><td>${e.reps}</td><td>${e.rest}</td></tr>`).join('')}</tbody></table></div>`).join('');
  $('gScheme').textContent=`這份菜單：每個動作 ${P.scheme.sets} 組 × ${P.scheme.reps} 下，組間休息 ${P.scheme.rest}${p.level==='new'?'（新手先少一組，動作做標準再加）':''}。最後兩下要覺得吃力；能輕鬆多做 2 下就加重量。`;
}
$('gForm').addEventListener('change',e=>{
  const p=bodyProf();
  if(e.target.id==='gGoal'){const v=parseFloat(e.target.value); p.goalW=isNaN(v)?null:v;}
  if(e.target.id==='gDays') p.days=+e.target.value;
  save(); renderGym();
});
$('gDays').oninput=()=>$('gDaysV').textContent=$('gDays').value;
$('gForm').addEventListener('click',e=>{
  const p=bodyProf(), s=e.target.closest('[data-shape]'), eq=e.target.closest('#gEquip [data-v]'), lv=e.target.closest('#gLevel [data-v]');
  if(s){const k=s.dataset.shape; p.shapes=(p.shapes||[]).includes(k)?p.shapes.filter(x=>x!==k):[...(p.shapes||[]),k];}
  else if(eq) p.equip=eq.dataset.v; else if(lv) p.level=lv.dataset.v; else return;
  save(); renderGym();
});

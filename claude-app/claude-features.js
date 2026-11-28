/* ---------- Claude App 版的額外功能（最後載入） ----------
   1. 飲食 AI 分析：直接用 Claude，不用 API 金鑰
   2. 匯出備份：用 Claude 的下載功能
   3. 安裝成電腦 App；在 App 裡：系統通知、工作列圖示、全域快捷鍵、迷你浮動計時器
   4. 提醒：待辦截止、保健品、今日任務、喝水伸展
   5. 🤖 每週回顧：Claude 依照這週的紀錄寫回顧和建議 */

/* ===== 1. 飲食 AI 分析 ===== */
let SAMPLE=null;
cUse('sample').then(s=>{SAMPLE=s; if(tab==='diet') renderDiet();});
function hasAI(){return !!SAMPLE;}
const num0=v=>{const n=+v; return isFinite(n)&&n>0?Math.round(n*10)/10:0;};
async function aiAnalyze(text){
  if(!SAMPLE) throw new Error('這個畫面沒辦法使用 Claude');
  const prompt=AI_SYSTEM+'\n\n只回傳一個 JSON 物件，格式：{"items":[{"name":"雞腿便當","amount":"1 個","kcal":850,"protein_g":40,"carbs_g":100,"sugar_g":5,"fat_g":35,"fiber_g":4,"sodium_mg":1500}]}\n數字都用數字，不要加單位。\n\n使用者吃了：\n'+text;
  let r;
  try{r=await SAMPLE.json(prompt,{modelTier:'default'});}
  catch(e){throw new Error(e?.code==='not_granted'?'你沒有允許這個 App 使用 Claude':e?.code==='rate_limited'?'用得太頻繁了，等一下再試':e?.code==='invalid_json'?'Claude 回的格式不對，再按一次試試':e?.message||String(e));}
  const items=(Array.isArray(r)?r:r?.items)||[];
  if(!items.length) throw new Error('Claude 沒有分析出食物，換個說法再試一次');
  return items.map(x=>mealScale({name:String(x.name||'（未命名）'),unit:String(x.amount||''),qty:1,src:'ai',
    base:{k:num0(x.kcal),p:num0(x.protein_g),c:num0(x.carbs_g),s:num0(x.sugar_g),f:num0(x.fat_g),fi:num0(x.fiber_g),na:num0(x.sodium_mg)}}));
}
$('dAi').textContent='🤖 Claude 分析';

/* ===== 2. 匯出備份 ===== */
let DL=null; cUse('downloads').then(d=>DL=d);
$('exportBtn').onclick=async()=>{
  const data=JSON.stringify(db,null,2), filename=`生活手帳備份-${todayStr()}.json`;
  if(DL){
    try{await DL.save({filename,data}); toast('✅ 已匯出備份'); return;}
    catch(e){if(e?.code==='declined') return; if(!['unavailable','host_unavailable','not_granted'].includes(e?.code)) return alert('匯出失敗：'+(e?.message||e));}
  }
  try{await navigator.clipboard.writeText(data); alert('這裡沒辦法下載檔案，已經把備份內容複製到剪貼簿，可以貼到記事本存成 .json 檔。');}
  catch(e){alert('這裡沒辦法下載檔案。請在電腦的 Claude App 或瀏覽器打開再匯出。');}
};

/* ===== 2b. Google 雲端硬碟備份／還原（用 Claude 的 Google Drive 連接器） ===== */
const GDRIVE='Google Drive', BK_PREFIX='生活手帳備份';
let DMCP=null; cUse('mcp').then(m=>DMCP=m);
const dCall=async(tool,input)=>{if(!DMCP) throw {code:'capability_disabled'}; return (await DMCP.callTool(GDRIVE,tool,input,{cache:false}));};
const dErr=e=>gErrMsg(e).replace(/Google 日曆|Google Calendar/g,m=>m.includes('Calendar')?'Google Drive':'Google 雲端硬碟');
function b64utf8(b){const bin=atob(b.replace(/\s/g,'')); return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)));}
// 從連接器的回應裡找出檔案內容（可能是 resource 區塊、base64，或文字）
function fileText(res){
  for(const b of res.content||[]){
    const r=b.resource; if(r?.text) return r.text; if(r?.blob) return b64utf8(r.blob);
    if(b.type==='text'&&/^\s*[{[]/.test(b.text||'')){
      try{const j=JSON.parse(b.text); if(j&&j.todos) return b.text; const c=j?.content??j?.base64Content; if(typeof c==='string'&&!/sent separately/.test(c)){try{return b64utf8(c);}catch(e){return c;}}}catch(e){}
    }
  }
  const p=res.payload; if(p&&typeof p==='object'){if(p.todos) return JSON.stringify(p); const c=p.content??p.base64Content; if(typeof c==='string'&&!/sent separately/.test(c)){try{return b64utf8(c);}catch(e){return c;}}}
  return null;
}
async function dvLoad(){
  const L=$('dvList'); L.innerHTML='<li class="muted">讀取中…</li>';
  try{
    const p=(await dCall('search_files',{query:`title contains '${BK_PREFIX}' and trashed = false`,orderBy:'modifiedTime desc',pageSize:15,excludeContentSnippets:true})).payload||{};
    const fs=(p.files||[]).filter(f=>/\.json$/i.test(f.title||'')||f.mimeType==='application/json');
    L.textContent='';
    if(!fs.length){L.innerHTML='<li class="muted">雲端硬碟裡還沒有備份</li>'; return;}
    for(const f of fs){
      const li=document.createElement('li'), s=document.createElement('span'), d=document.createElement('div'), b=document.createElement('button');
      s.className='grow'; s.textContent=f.title; d.className='muted small'; d.textContent=new Date(f.modifiedTime).toLocaleString()+(f.fileSize?` · ${Math.round(f.fileSize/1024)} KB`:''); s.appendChild(d);
      b.className='ghost'; b.textContent='還原'; b.onclick=()=>dvRestore(f);
      li.append(s,b); L.appendChild(li);
    }
  }catch(e){L.textContent=''; const li=document.createElement('li'); li.style.color='var(--red)'; li.textContent=dErr(e); L.appendChild(li);}
}
async function dvRestore(f){
  if(!await ask(`用「${f.title}」還原？\n目前 App 裡的資料會被這份備份取代（手機也會一起同步成這份）。`,{ok:'還原',danger:true})) return;
  $('dvMsg').textContent='⏳ 下載中…';
  try{
    const txt=fileText(await dCall('download_file_content',{fileId:f.id}));
    const d=JSON.parse(txt||'');
    if(!d||typeof d!=='object'||!Array.isArray(d.todos)) throw new Error('這個檔案不是生活手帳的備份');
    db={...EMPTY_DB(),...d}; save(); render(); $('dvMsg').textContent='✅ 已還原'; toast('✅ 已從雲端硬碟還原');
  }catch(e){$('dvMsg').textContent='⚠️ 還原失敗：'+(e instanceof SyntaxError?'讀不到檔案內容，可以改用：在雲端硬碟下載這個檔案，再按「匯入」':e?.code?dErr(e):e.message);}
}
$('dvBackup').onclick=async()=>{
  const b=$('dvBackup'); b.disabled=true; $('dvMsg').textContent='⏳ 上傳中…';
  const d=new Date(), title=`${BK_PREFIX}-${todayStr()}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  try{
    await dCall('create_file',{title,textContent:JSON.stringify(db),contentMimeType:'application/json',disableConversionToGoogleType:true});
    $('dvMsg').textContent='✅ 已備份：'+title; ls('dvLast',String(Date.now())); dvLoad();
  }catch(e){$('dvMsg').textContent='⚠️ '+dErr(e);}
  b.disabled=false;
};
$('driveBtn').onclick=()=>{$('dvMsg').textContent=ls('dvLast')?'上次備份：'+new Date(+ls('dvLast')).toLocaleString():''; $('dvModal').classList.remove('hidden'); dvLoad(); brUI();};
$('dvClose').onclick=()=>$('dvModal').classList.add('hidden');

/* ===== 2c. 跟網頁版同步：雲端硬碟「生活手帳同步」資料夾 =====
   網頁版寫 web.json；這邊的連接器不能覆寫檔案，所以每次存一個新的 app-時間.json，再把讀過的舊 app-*.json 丟到垃圾桶。
   同步時把資料夾裡的檔案全部讀進來逐筆合併（跟 Claude 資料庫的同步用同一套合併邏輯）。 */
const SHARED_FOLDER='1zkLk1W1PCg9I8FiujnuWhRjOuB4xbTnK', FOLDER_NAME='生活手帳同步';
const BR={busy:false,again:false,timer:null,err:'',last:+(ls('brLast')||0),folder:ls('lpFolder')||SHARED_FOLDER,seen:jget('brSeen')||{},hash:ls('brHash')||''};
async function brFolder(){
  const p=(await dCall('search_files',{query:`title = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,pageSize:5,excludeContentSnippets:true})).payload||{};
  const f=(p.files||[]).sort((a,b)=>(a.createdTime||'').localeCompare(b.createdTime||''))[0];
  if(f) return f.id;
  const r=await dCall('create_file',{title:FOLDER_NAME,contentMimeType:'application/vnd.google-apps.folder'}); return r.payload?.id;
}
async function brList(){
  const p=(await dCall('search_files',{query:`parentId = '${BR.folder}' and trashed = false`,orderBy:'modifiedTime desc',pageSize:50,excludeContentSnippets:true})).payload||{};
  return (p.files||[]).filter(f=>f.title==='web.json'||/^app-.*\.json$/.test(f.title||''));
}
async function bridgeSync(){
  if(!DMCP) return;
  if(BR.busy){BR.again=true; return;}
  BR.busy=true; BR.err='';
  try{
    let files=await brList();
    if(!files.length&&BR.folder===SHARED_FOLDER&&!ls('lpFolder')){   // 預設資料夾找不到（例如被刪了）→ 依名稱找或重新建立
      const id=await brFolder(); if(id&&id!==BR.folder){BR.folder=id; files=await brList();}
    }
    ls('lpFolder',BR.folder);
    let changed=false; const merged=[];
    for(const f of files.slice(0,6)){
      if(BR.seen[f.id]===f.modifiedTime){merged.push(f); continue;}
      const txt=fileText(await dCall('download_file_content',{fileId:f.id}));
      if(txt!=null){try{const rem=JSON.parse(txt); changed=(mergeInto(rem)|dedupeHabits(rem))||changed;}catch(e){}}
      BR.seen[f.id]=f.modifiedTime; merged.push(f);
    }
    if(changed){render(); if(CS.ready) cloudSync();}
    const out=payload(), h=hashStr(out);
    if(h!==BR.hash){
      const d=new Date(), title=`app-${ymd(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
      const r=await dCall('create_file',{title,parentId:BR.folder,textContent:out,contentMimeType:'application/json',disableConversionToGoogleType:true});
      const nf=r.payload; if(nf?.id) BR.seen[nf.id]=nf.modifiedTime;
      BR.hash=h; ls('brHash',h);
      // 讀過、已經合併進新檔的舊 app 檔丟到垃圾桶（沒讀過的不動）
      for(const f of merged) if(/^app-/.test(f.title)&&f.id!==nf?.id){try{await dCall('trash_file',{fileId:f.id}); delete BR.seen[f.id];}catch(e){}}
    }
    ls('brSeen',JSON.stringify(BR.seen)); BR.last=Date.now(); ls('brLast',String(BR.last));
  }catch(e){BR.err=dErr(e); if(e?.code==='tool_error'&&/not.?found|404/i.test(e.message||'')){BR.folder=SHARED_FOLDER; ls('lpFolder',null);}}
  BR.busy=false; brUI();
  if(BR.again){BR.again=false; bridgeSync();}
}
function brUI(){
  const el=$('brState'); if(!el) return;
  el.textContent=BR.busy?'⏳ 同步中…':BR.err?'⚠️ '+BR.err:BR.last?'✅ 上次和網頁版同步：'+new Date(BR.last).toLocaleString():'還沒同步過';
  el.style.color=BR.err?'var(--red)':'';
}
{const a=window.afterSave; window.afterSave=()=>{a(); clearTimeout(BR.timer); BR.timer=setTimeout(bridgeSync,30e3);};}   // 存檔後 30 秒才寫，避免一直產生新檔
setInterval(()=>{if(!document.hidden) bridgeSync();},10*60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-BR.last>60e3) bridgeSync();});
cUse('mcp').then(m=>{if(m) setTimeout(bridgeSync,3000);});
$('brNow').onclick=()=>{bridgeSync(); brUI();};
$('dvModal').onclick=e=>{if(e.target.id==='dvModal') $('dvModal').classList.add('hidden');};

/* ===== 3. 電腦 App ===== */
let DESK=null, DPERM={}, OS='';
const inApp=()=>!!DESK?.window;
const canNotify=()=>inApp()&&DPERM.notifications==='granted';
function drawIcon(size=256,mono=false){
  const c=document.createElement('canvas'); c.width=c.height=size; const x=c.getContext('2d'), s=size/256;
  const rr=(X,Y,W,H,R)=>{x.beginPath(); x.roundRect(X*s,Y*s,W*s,H*s,R*s);};
  if(mono){   // macOS 選單列：黑色透明底，系統會自動上色
    x.fillStyle='#000'; rr(52,28,152,200,22); x.fill();
    x.globalCompositeOperation='destination-out'; x.lineWidth=16*s; x.lineCap='round';
    [96,136,176].forEach(y=>{x.beginPath(); x.moveTo(88*s,y*s); x.lineTo(172*s,y*s); x.stroke();});
    return c.toDataURL('image/png');
  }
  const g=x.createLinearGradient(0,0,0,size); g.addColorStop(0,'#5d7bff'); g.addColorStop(1,'#3b54d9');
  x.fillStyle=g; rr(0,0,256,256,56); x.fill();
  x.fillStyle='#fff'; rr(58,40,140,176,18); x.fill();                 // 手帳本
  x.fillStyle='#3b54d9'; rr(58,40,26,176,12); x.fill();              // 書背
  x.strokeStyle='#c7d0f5'; x.lineWidth=9*s; x.lineCap='round';
  [92,124,156].forEach(y=>{x.beginPath(); x.moveTo(102*s,y*s); x.lineTo(176*s,y*s); x.stroke();});
  x.fillStyle='#e5484d'; x.beginPath(); x.arc(180*s,190*s,34*s,0,Math.PI*2); x.fill();   // 小番茄
  x.fillStyle='#16a34a'; x.beginPath(); x.ellipse(180*s,160*s,12*s,6*s,0,0,Math.PI*2); x.fill();
  return c.toDataURL('image/png');
}
// 視窗樣式：一般模式／迷你浮動計時器。setOptions 換樣式會重新載入頁面，所以每次載入都送同一組
const WIN={normal:{width:1280,height:860,minWidth:420,minHeight:520},mini:{frame:false,alwaysOnTop:true,width:300,height:132,resizable:false,minimizable:false,maximizable:false,fullscreenable:false}};
let winMode=ls('winMode')==='mini'?'mini':'normal';
async function applyWindow(){
  // 保險：10 秒內重新載入超過 3 次就不再改視窗，避免一直重新整理
  const k='winLoads', now=Date.now(), arr=(jget(k)||[]).filter(t=>now-t<10e3); arr.push(now); ls(k,JSON.stringify(arr));
  if(arr.length>3) return;
  try{
    const cur=await DESK.window.getOptions().catch(()=>null), want=WIN[winMode];
    if(cur&&Object.keys(want).every(key=>cur.applied?.[key]===want[key])) return;
    await DESK.window.setOptions(want);
  }catch(e){
    if(winMode==='mini'){winMode='normal'; ls('winMode',null); document.documentElement.classList.remove('mini-mode'); toast('迷你模式需要「浮在其他視窗上」的權限');}
  }
}
async function setWinMode(m){
  if(!inApp()||m===winMode) return;
  if(m==='mini'){
    const st=await DESK.permissions.state('overlay').catch(()=>'unavailable');
    if(st==='prompt'){const r=await DESK.permissions.request(['overlay']).catch(()=>({})); if(r.overlay!=='granted') return toast('沒有允許浮動視窗');}
    else if(st!=='granted') return alert('迷你模式需要「浮在其他視窗上」的權限，可以在 App 的「權限」裡打開。');
  }
  winMode=m; ls('winMode',m==='mini'?'mini':null); ls('winLoads',null);
  try{const r=await DESK.window.setOptions(WIN[m]); if(!r.reloading) location.reload();}catch(e){winMode='normal'; ls('winMode',null); alert('沒辦法切換視窗：'+e.message);}
}
// 工作列（Windows 右下角）／選單列（Mac 右上角）圖示
let trayOn=false, trayKey='';
async function updateTray(force){
  if(!inApp()||DPERM['menu-bar']!=='granted') return;
  const run=P.running, st=pStarted(), mac=OS==='darwin';
  const timeTxt=st?`${P.mode==='focus'?'🍅':'☕'} ${fmtClock(pShown())}`:'';
  const key=[run,st,P.mode,winMode,mac?timeTxt:''].join('|'); if(!force&&key===trayKey) return; trayKey=key;
  const t=db.todos.find(x=>x.id===P.todoId);
  try{
    await DESK.tray.set({
      icon:mac?drawIcon(64,true):drawIcon(64), iconIsTemplate:mac,
      title:mac?timeTxt:undefined,
      toolTip:(st?`${timeTxt}${run?'':'（暫停）'}${t?' · '+t.text.slice(0,30):''}`:'番茄鐘沒有在跑')+` · 今日任務 ${dayStat(habitDay()).done}/${dayStat(habitDay()).total}`,
      menu:[
        {label:run?'⏸ 暫停番茄鐘':st?'▶ 繼續番茄鐘':'▶ 開始專注',click:()=>{pStart();}},
        ...(P.mode==='focus'&&st?[{label:'■ 結束並記錄',click:()=>$('pFinish').click()}]:[]),
        {type:'separator'},
        {label:winMode==='mini'?'⤢ 回到完整視窗':'🪟 迷你浮動計時器',click:()=>setWinMode(winMode==='mini'?'normal':'mini')},
        {label:'📒 打開生活手帳',click:()=>{DESK.window.show(); if(winMode==='mini') setWinMode('normal');}},
      ]});
    trayOn=true;
  }catch(e){trayOn=false;}
}
// 全域快捷鍵：Alt+Shift+P 開始／暫停番茄鐘（在任何程式裡都能按）
async function setupShortcut(){
  if(!inApp()||DPERM.shortcuts!=='granted') return;
  try{await DESK.globalShortcut.register('Alt+Shift+P',()=>{pStart(); toast(P.running?'🍅 開始專注':'⏸ 已暫停');});}catch(e){}
}
async function refreshPerms(){DPERM=await DESK.permissions.state().catch(()=>({}))||{}; renderPermBar();}
function renderPermBar(){
  const need=['notifications','menu-bar','shortcuts'].filter(p=>DPERM[p]==='prompt');
  $('permBar').classList.toggle('hidden',!inApp()||!need.length||winMode==='mini');
}
$('permAsk').onclick=async()=>{
  try{DPERM=await DESK.permissions.request(['notifications','menu-bar','shortcuts']);}catch(e){}
  renderPermBar(); updateTray(true); setupShortcut();
  if(DPERM.notifications==='granted') DESK.notification.show({body:'📒 生活手帳：通知已開啟，時間到會提醒你'}).catch(()=>{});
};
$('permLater').onclick=()=>$('permBar').classList.add('hidden');
// 番茄鐘時間到 → 系統通知（原本的 notify 只在瀏覽器分頁有用）
// （函式宣告會被提前，所以不能先存原本的 notify 再呼叫，這裡直接重寫）
function notify(msg,title='🍅 番茄鐘'){
  if(canNotify()) return DESK.notification.show({body:`${title}　${msg}`.slice(0,300)}).catch(()=>toast(msg));
  try{if('Notification' in window&&Notification.permission==='granted') new Notification(title,{body:msg});}catch(e){}
  if(!document.hidden) toast(`${title}　${msg}`);
}
(async()=>{
  DESK=await cUse('desktop');
  if(!inApp()){
    if((await DESK?.install?.state().catch(()=>''))==='available'){
      const b=$('installBtn'); b.classList.remove('hidden');
      b.onclick=()=>DESK.install.request().then(r=>{if(r==='installed') b.classList.add('hidden');}).catch(()=>{});
    }
    return;
  }
  document.documentElement.classList.add('in-desktop');
  OS=await DESK.os.platform().catch(()=>'');
  if(winMode==='mini'){document.documentElement.classList.add('mini-mode'); renderMiniPomo();}
  DESK.app.dock.setIcon(drawIcon()).catch(()=>{});
  await applyWindow();
  $('miniBtn').classList.remove('hidden');
  await refreshPerms();
  updateTray(true); setupShortcut();
  setInterval(()=>updateTray(),5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) refreshPerms();});
})();
$('miniBtn').onclick=()=>setWinMode('mini');

/* 迷你浮動計時器（只在安裝好的 App 視窗裡） */
function renderMiniPomo(){
  if(winMode!=='mini'||!inApp()) return;
  const t=db.todos.find(x=>x.id===P.todoId), st=pStarted();
  $('mpTime').textContent=fmtClock(pShown());
  $('mpTime').style.color=P.mode==='focus'?'#e5484d':'#16a34a';
  $('mpLabel').textContent=(isUp()?'正計時':PLABEL[P.mode])+(P.running?'':st?'（暫停）':'')+(t&&P.mode==='focus'?' · '+t.text:'');
  $('mpGo').textContent=P.running?'⏸':'▶';
  $('mpGo').title=P.running?'暫停':'開始';
}
$('mpGo').onclick=()=>{pStart(); renderMiniPomo();};
$('mpFull').onclick=()=>setWinMode('normal');
setInterval(renderMiniPomo,500); renderMiniPomo();

/* ===== 4. 提醒 ===== */
const REM_DEF={ev:true,evLead:10,todo:true,todoLead:60,supp:true,suppT:{m:'08:30',n:'12:30',e:'20:30'},daily:true,dailyT:'21:30',move:false,moveEvery:60,moveFrom:'09:00',moveTo:'22:00'};
const REM=Object.assign({},REM_DEF,jget('remSet')||{}); REM.suppT=Object.assign({},REM_DEF.suppT,REM.suppT);
const remSent=jget('remSent')||{};    // 已經提醒過的（每台裝置各自記），避免重複
const hmNow=()=>{const d=new Date(); return pad(d.getHours())+':'+pad(d.getMinutes());};
const inWin=(hm,mins=15)=>{const [h,m]=hm.split(':').map(Number), d=new Date(), t=new Date(d); t.setHours(h,m,0,0); return d>=t&&d-t<mins*6e4;};
function remOnce(key,msg,title){
  if(remSent[key]) return; remSent[key]=Date.now();
  const old=Date.now()-14*864e5; for(const k in remSent) if(remSent[k]<old) delete remSent[k];
  ls('remSent',JSON.stringify(remSent)); notify(msg,title);
}
function remTick(){
  const now=Date.now(), today=habitDay();
  if(REM.ev&&REM.evLead>=0){   // 行程（本機＋Google 日曆）開始前提醒
    const ds=todayStr();
    for(const ev of eventsOn(ds)){
      if(!ev.start) continue;
      const st=ev.sMs??new Date(`${ds}T${ev.start}:00`).getTime(), lead=REM.evLead*6e4;
      if(st-now<=lead&&st-now>lead-10*6e4) remOnce(`ev|${ev.id}|${st}`,`${ev.start}「${ev.title}」${REM.evLead?`${REM.evLead} 分鐘後開始`:'現在開始'}`,'📅 行程');
    }
  }
  if(REM.todo) for(const t of db.todos){
    if(t.done) continue; const dl=deadline(t); if(!dl) continue;
    const lead=REM.todoLead*6e4;
    if(lead&&dl-now<=lead&&dl-now>lead-15*6e4) remOnce(`td|${t.id}|${dl}|lead`,`「${t.text}」還有 ${fmtDur((dl-now)/6e4)} 截止`,'⏰ 待辦');
    if(dl<=now&&now-dl<10*6e4) remOnce(`td|${t.id}|${dl}|due`,`「${t.text}」已經到截止時間了`,'⏰ 待辦');
  }
  if(REM.supp){
    hIdx=new Map(db.hdone.map(r=>[r.id,r]));
    for(const s of Object.keys(SLOTS)){
      if(!inWin(REM.suppT[s])) continue;
      const left=db.hitems.filter(it=>it.type==='supp'&&(it.slots||[]).includes(s)&&scheduled(it,today)&&!getVal(today,it,s));
      if(left.length) remOnce(`sp|${today}|${s}`,`${SLOTS[s]}上該吃：${left.map(i=>i.name).join('、')}`,'💊 保健');
    }
  }
  if(REM.daily&&inWin(REM.dailyT)){
    const st=dayStat(today);
    if(st.total&&st.done<st.total) remOnce(`dy|${today}`,`今天還有 ${st.total-st.done} 項任務沒完成（${st.done}/${st.total}）`,'🏃 今日任務');
  }
  if(REM.move&&REM.moveEvery>0){
    const hm=hmNow();
    if(hm>=REM.moveFrom&&hm<REM.moveTo){
      const slot=Math.floor(now/(REM.moveEvery*6e4));
      if(!remSent['mv|last']) remSent['mv|last']=slot;
      if(slot!==remSent['mv|last']){remSent['mv|last']=slot; ls('remSent',JSON.stringify(remSent)); notify('起來動一動、喝口水 💧','🧘 休息一下');}
    }
  }
}
setInterval(remTick,30e3); setTimeout(remTick,5000);
function openRem(){
  $('rmEv').checked=REM.ev; $('rmEvLead').value=REM.evLead;
  $('rmTodo').checked=REM.todo; $('rmLead').value=REM.todoLead;
  $('rmSupp').checked=REM.supp; ['m','n','e'].forEach(s=>$('rmS_'+s).value=REM.suppT[s]);
  $('rmDaily').checked=REM.daily; $('rmDailyT').value=REM.dailyT;
  $('rmMove').checked=REM.move; $('rmEvery').value=REM.moveEvery; $('rmFrom').value=REM.moveFrom; $('rmTo').value=REM.moveTo;
  $('rmNote').textContent=inApp()?(canNotify()?'✅ 通知已開啟。App 開著（或縮到右下角工作列）時才會提醒。':'⚠️ 還沒有允許通知，按下面的「允許通知」。'):'💡 系統通知只在電腦的 Claude App 版有。這裡（手機、瀏覽器）只有開著畫面時會跳出提示。';
  $('rmPerm').classList.toggle('hidden',!inApp()||canNotify());
  $('rmModal').classList.remove('hidden');
}
$('remBtn').onclick=openRem;
$('rmClose').onclick=()=>$('rmModal').classList.add('hidden');
$('rmModal').onclick=e=>{if(e.target.id==='rmModal') $('rmModal').classList.add('hidden');};
$('rmPerm').onclick=async()=>{await $('permAsk').onclick(); openRem();};
$('rmTest').onclick=()=>notify('這是測試通知，提醒會長這樣','📒 生活手帳');
$('rmForm').onchange=()=>{
  Object.assign(REM,{ev:$('rmEv').checked,evLead:Math.max(0,+$('rmEvLead').value||0),todo:$('rmTodo').checked,todoLead:Math.max(0,+$('rmLead').value||0),supp:$('rmSupp').checked,
    suppT:{m:$('rmS_m').value||REM.suppT.m,n:$('rmS_n').value||REM.suppT.n,e:$('rmS_e').value||REM.suppT.e},
    daily:$('rmDaily').checked,dailyT:$('rmDailyT').value||REM.dailyT,
    move:$('rmMove').checked,moveEvery:Math.max(15,+$('rmEvery').value||60),moveFrom:$('rmFrom').value||'09:00',moveTo:$('rmTo').value||'22:00'});
  ls('remSet',JSON.stringify(REM));
};

/* ===== 5. 🤖 每週回顧 ===== */
function weekFacts(){
  const t=habitDay(), from=addDays(t,-6), inR=d=>d>=from&&d<=t, days=Array.from({length:7},(_,i)=>addDays(from,i));
  hIdx=new Map(db.hdone.map(r=>[r.id,r]));
  const L=[];
  L.push(`期間：${from} 到 ${t}（今天）`);
  const ds=days.map(d=>{const s=dayStat(d); return `${d.slice(5)} ${s.done}/${s.total}`;});
  L.push('每日任務完成（完成/總數）：'+ds.join('、'));
  const items=db.hitems.map(it=>{let sc=0,ok=0; days.forEach(d=>{if(scheduled(it,d)){sc++; if(isDone(d,it)) ok++;}}); return sc?`${it.name} ${ok}/${sc}`:'';}).filter(Boolean);
  if(items.length) L.push('各項任務本週完成次數：'+items.join('、'));
  const pm=db.pomos.filter(p=>inR(p.date)), byT={}; pm.forEach(p=>{const k=taskName(p); byT[k]=(byT[k]||0)+p.min;});
  L.push(`番茄鐘專注：共 ${fmtDur(pm.reduce((s,p)=>s+p.min,0))}`+(pm.length?'；'+Object.entries(byT).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`${k} ${fmtDur(v)}`).join('、'):''));
  const done=db.xp.filter(x=>x.src==='todo'&&x.pts>0&&inR(x.date)).map(x=>x.title);
  L.push(`本週完成的待辦（${done.length}）：`+(done.slice(0,15).join('、')||'無'));
  const now=Date.now(), open=db.todos.filter(x=>!x.done), over=open.filter(x=>deadline(x)&&deadline(x)<now), soon=open.filter(x=>{const d=deadline(x); return d&&d>=now&&d-now<7*864e5;});
  L.push(`還沒完成的待辦 ${open.length} 項；已逾期：${over.map(x=>x.text).join('、')||'無'}；7 天內要截止：${soon.map(x=>`${x.text}（${x.due}）`).join('、')||'無'}`);
  const hl=db.habitLogs.filter(l=>inR(l.date)), byH={}; hl.forEach(l=>{const h=db.habits.find(x=>x.id===l.habitId); const k=h?h.name:'其他'; byH[k]=(byH[k]||0)+l.min;});
  if(hl.length) L.push('計時習慣：'+Object.entries(byH).map(([k,v])=>`${k} ${fmtDur(v)}`).join('、'));
  const mn=db.money.filter(x=>inR(x.date)), exp=mn.filter(x=>x.type==='exp'), byC={}; exp.forEach(x=>byC[x.cat]=(byC[x.cat]||0)+x.amt);
  if(mn.length) L.push(`記帳：支出 ${money(exp.reduce((s,x)=>s+x.amt,0))}、收入 ${money(mn.filter(x=>x.type==='inc').reduce((s,x)=>s+x.amt,0))}；支出分類：`+Object.entries(byC).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${money(v)}`).join('、'));
  const ws=weightSeries().filter(p=>p[0]>=addDays(t,-13));
  if(ws.length) L.push(`體重（近兩週）：`+ws.map(p=>`${p[0].slice(5)} ${p[1]}kg`).join('、'));
  const bps=hOf('bp').filter(b=>inR(b.date));
  if(bps.length) L.push(`血壓：${bps.length} 次，平均 ${Math.round(bps.reduce((s,b)=>s+b.sys,0)/bps.length)}/${Math.round(bps.reduce((s,b)=>s+b.dia,0)/bps.length)}`);
  const T=dietTargets(), ml=db.meals.filter(m=>inR(m.date)), md=[...new Set(ml.map(m=>m.date))];
  if(md.length) L.push(`飲食：記錄了 ${md.length} 天，平均每天 ${Math.round(ml.reduce((s,m)=>s+m.k,0)/md.length)} kcal、蛋白質 ${Math.round(ml.reduce((s,m)=>s+m.p,0)/md.length)} g`+(T?`（目標 ${T.kcal} kcal、蛋白質 ${T.protT} g）`:''));
  const R=rankInfo(); L.push(`段位：${R.cur[0]}，總共 ${R.total} XP，連續達標 ${R.streak} 天`);
  return L.join('\n');
}
let rvBusy=false;
async function runReview(){
  if(rvBusy) return; if(!SAMPLE) return alert('這個畫面沒辦法使用 Claude');
  rvBusy=true; const out=$('rvOut'), btn=$('rvGo'); btn.disabled=true; btn.textContent='🤖 Claude 正在寫…'; out.textContent='';
  const prompt=`你是一位溫和、具體、會鼓勵人的生活教練。下面是使用者「生活手帳」這 7 天的紀錄。用繁體中文（台灣用語）寫一份簡短的每週回顧，純文字、不要用 Markdown 符號（不要 # 或 **），分成這幾段，每段用一行標題開頭：
【這週做得好的】2–3 點，引用具體數字
【可以注意的】1–3 點，具體、不要說教
【下週建議】3 點，每點都是做得到的小行動
最後一句短短的鼓勵。整份不超過 350 字。沒有資料的部分就略過，不要編造。

${weekFacts()}`;
  try{
    const r=await SAMPLE(prompt,{onText:({text})=>{out.textContent=text;},cache:false});
    out.textContent=r.text; ls('rvLast',JSON.stringify({at:Date.now(),text:r.text}));
    $('rvAt').textContent='剛剛寫的';
  }catch(e){out.textContent=e?.code==='not_granted'?'你沒有允許這個 App 使用 Claude。':e?.code==='rate_limited'?'用得太頻繁了，等一下再試。':'寫回顧失敗：'+(e?.message||e);}
  rvBusy=false; btn.disabled=false; btn.textContent='🤖 重新寫一份';
}
{
  const card=document.createElement('div'); card.className='card'; card.id='rvCard';
  card.innerHTML='<div class="row" style="margin-bottom:8px"><h2 style="margin:0;flex:1">🤖 每週回顧</h2><span class="muted small" id="rvAt"></span></div>'+
    '<div class="muted small" style="margin-bottom:10px">Claude 會看這 7 天的任務、番茄鐘、待辦、記帳、健康和飲食紀錄，寫一份回顧和下週建議。</div>'+
    '<div id="rvOut" class="rv-out"></div><button class="btn" id="rvGo" style="margin-top:10px">🤖 寫這週的回顧</button>';
  document.querySelector('#tab-rank .rank-page').prepend(card);
  const last=jget('rvLast'); if(last?.text){$('rvOut').textContent=last.text; $('rvAt').textContent=new Date(last.at).toLocaleString(); $('rvGo').textContent='🤖 重新寫一份';}
  $('rvGo').onclick=runReview;
}
// 段位徽章旁邊加一個直接到回顧的按鈕
$('reviewBtn').onclick=()=>{goTab('rank'); scrollTo({top:0});};

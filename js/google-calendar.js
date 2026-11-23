/* ---------- Google 日曆同步 ---------- */
// 可以把你的 OAuth Client ID 直接填在這裡，就不用在每台裝置上輸入
const GOOGLE_CLIENT_ID='201482397631-1i2oiqjf43l8skh79pjsrimpdomiel4r.apps.googleusercontent.com';
const GCOL={1:'#7986cb',2:'#33b679',3:'#8e24aa',4:'#e67c73',5:'#f6bf26',6:'#f4511e',7:'#039be5',8:'#616161',9:'#3f51b5',10:'#0b8043',11:'#d50000'};
const TZ=Intl.DateTimeFormat().resolvedOptions().timeZone;
// calendar.events：讀寫行程；calendarlist.readonly：列出你有哪些日曆
// drive.appdata：只能存取這個 App 自己在雲端硬碟的隱藏資料夾，看不到你其他檔案
const SCOPES='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/drive.appdata';
const G={clientId:ls('gClientId')||GOOGLE_CLIENT_ID,want:ls('gConnected')==='1',token:null,exp:0,tc:null,tcId:'',events:[],range:'',busy:false,err:'',
  cals:[],show:jget('gShow')||['primary'],def:ls('gDef')||'primary'};
const gReady=()=>!!(G.token&&Date.now()<G.exp);
// 授權碼（約 1 小時有效）存在這個瀏覽器，重新整理頁面時不用再登入一次
{const t=jget('gTok'); if(G.want&&t&&t.exp>Date.now()&&t.scopes===SCOPES){G.token=t.token; G.exp=t.exp;}}
const gSaveTok=()=>ls('gTok',G.token?JSON.stringify({token:G.token,exp:G.exp,scopes:SCOPES}):null);
const canWrite=c=>c.role==='owner'||c.role==='writer';
const evPath=(cal,id)=>'calendars/'+encodeURIComponent(cal)+'/events'+(id?'/'+encodeURIComponent(id):'');

function gToken(prompt){
  return new Promise((res,rej)=>{
    if(!window.google?.accounts?.oauth2) return rej(new Error('Google 登入元件尚未載入，請確認網路連線後重新整理'));
    if(!G.clientId) return rej(new Error('請先填入 OAuth Client ID'));
    if(!G.tc||G.tcId!==G.clientId){
      G.tc=google.accounts.oauth2.initTokenClient({client_id:G.clientId,scope:SCOPES,callback:()=>{}});
      G.tcId=G.clientId;
    }
    G.tc.callback=r=>{
      if(r.error) return rej(new Error(r.error_description||r.error));
      G.token=r.access_token; G.exp=Date.now()+(r.expires_in-60)*1000; G.want=true; ls('gConnected','1'); gSaveTok(); res();};
    G.tc.error_callback=e=>rej(new Error(e?.type==='popup_closed'?'登入視窗被關閉了':(e?.message||'無法開啟 Google 登入視窗')));
    G.tc.requestAccessToken({prompt});
  });
}
async function gApi(path,method='GET',body){
  if(!gReady()) await gToken('');
  const r=await fetch('https://www.googleapis.com/calendar/v3/'+path,{
    method,headers:{Authorization:'Bearer '+G.token,...(body?{'Content-Type':'application/json'}:{})},
    // PATCH 需要用 null 清除欄位；新增時則把 null 拿掉
    body:body?JSON.stringify(body,(k,v)=>method==='POST'&&v===null?undefined:v):undefined});
  if(r.status===401){G.token=null; gSaveTok(); gStatus(); throw new Error('Google 授權已過期，請按上方按鈕重新連線');}
  if(!r.ok){let m=r.status; try{m=(await r.json()).error.message}catch(e){} throw new Error('Google 日曆錯誤：'+m);}
  return r.status===204?null:r.json();
}
function fromG(it,cal){
  const allDay=!!it.start.date;
  const hm=s=>{const d=new Date(s);return pad(d.getHours())+':'+pad(d.getMinutes())};
  return {id:'g:'+cal.id+':'+it.id,gid:it.id,calId:cal.id,calName:cal.name,ro:!canWrite(cal),google:true,
    sMs:allDay?null:new Date(it.start.dateTime).getTime(),eMs:allDay?null:new Date(it.end.dateTime).getTime(),
    fg:it.colorId?'#fff':(cal.fg||'#fff'),
    recurring:!!it.recurringEventId,title:it.summary||'（無標題）',
    date:allDay?it.start.date:ymd(new Date(it.start.dateTime)),endDate:allDay?it.end.date:null,
    start:allDay?'':hm(it.start.dateTime),end:allDay?'':hm(it.end.dateTime),
    note:it.description||'',color:GCOL[it.colorId]||cal.bg||'#039be5',repeat:''};
}
async function gLoadCals(){
  try{
    const d=await gApi('users/me/calendarList?minAccessRole=reader&maxResults=250');
    G.cals=(d.items||[]).filter(c=>!c.deleted&&!c.hidden)
      .map(c=>({id:c.id,name:c.summaryOverride||c.summary,bg:c.backgroundColor,fg:c.foregroundColor,role:c.accessRole,primary:!!c.primary}))
      .sort((a,b)=>b.primary-a.primary);
  }catch(err){
    // 舊授權沒有「列出日曆」權限時，先只用主要日曆
    G.cals=[{id:'primary',name:'主要日曆',bg:'#039be5',role:'owner',primary:true}];
    G.calErr='無法讀取日曆清單（'+err.message+'），請按「中斷連線」後重新連接。';
  }
  const pid=G.cals.find(c=>c.primary)?.id||'primary';
  G.show=G.show.map(x=>x==='primary'?pid:x).filter(id=>G.cals.some(c=>c.id===id));
  if(!G.show.length) G.show=[pid];
  if(!G.cals.some(c=>c.id===G.def&&canWrite(c))) G.def=pid;
  ls('gShow',JSON.stringify(G.show)); ls('gDef',G.def);
}
function toG(d){
  const b={summary:d.title,description:d.note||''};
  const cid=Object.keys(GCOL).find(k=>GCOL[k]===d.color); if(cid) b.colorId=cid;
  if(d.start){
    let end=d.end, ed=d.date;
    if(!end){const [h,m]=d.start.split(':').map(Number); end=h>=23?'23:59':pad(h+1)+':'+pad(m);}
    else if(end<=d.start){const n=parse(d.date); n.setDate(n.getDate()+1); ed=ymd(n);}  // 跨夜，例如 22:00–05:30
    b.start={dateTime:`${d.date}T${d.start}:00`,timeZone:TZ,date:null};
    b.end={dateTime:`${ed}T${end}:00`,timeZone:TZ,date:null};
  }else{
    const n=parse(d.date); n.setDate(n.getDate()+1);
    b.start={date:d.date,dateTime:null}; b.end={date:ymd(n),dateTime:null};
  }
  if(d.repeat) b.recurrence=['RRULE:FREQ='+{w:'WEEKLY',m:'MONTHLY',y:'YEARLY'}[d.repeat]];
  return b;
}
async function gSync(force){
  if(!gReady()||G.busy) return;
  const [s,e]=calRange();
  const key=calView+ymd(s); if(!force&&G.range===key) return;
  G.range=key; G.busy=true; gStatus();
  try{
    if(!G.cals.length) await gLoadCals();
    const q=new URLSearchParams({singleEvents:'true',orderBy:'startTime',maxResults:'2500',timeMin:s.toISOString(),timeMax:e.toISOString()});
    const lists=await Promise.all(G.cals.filter(c=>G.show.includes(c.id)).map(async cal=>{
      const d=await gApi(evPath(cal.id)+'?'+q);
      return (d.items||[]).filter(x=>x.status!=='cancelled').map(it=>fromG(it,cal));
    }));
    G.events=lists.flat(); G.err='';
  }catch(err){G.err=err.message;}
  G.busy=false; gStatus(); if(tab==='cal'&&!tgDrag) renderCal();
}
function gStatus(){
  const b=$('gBtn');
  b.textContent=G.busy?'⏳ 同步中…':gReady()?(G.err?'⚠️ Google 同步錯誤':'🟢 Google 日曆'):G.want?'🔄 重新連線 Google':'🔗 連接 Google 日曆';
  b.title=G.err||'';
  $('gState').textContent=gReady()?'已連線：勾選的日曆會和 Google 雙向同步。'+(G.calErr?' '+G.calErr:'')+(G.err?' 最近一次錯誤：'+G.err:'')
    :G.want?'授權已過期（Google 每小時要重新確認一次），請按「連接」。':'尚未連線。';
  $('gConnect').textContent=gReady()?'立即同步':'連接';
  $('gUpload').disabled=!gReady()||!db.events.length;
  $('gUpload').textContent=`把本機行程上傳到 Google 預設日曆（${db.events.length} 筆）`;
  $('gDisconnect').classList.toggle('hidden',!G.want);
  gRenderCals();
}
function gRenderCals(){
  $('gCalBox').classList.toggle('hidden',!gReady()||!G.cals.length);
  renderDrawer();
  if(!G.cals.length) return;
  $('gDefCal').innerHTML=G.cals.filter(canWrite).map(c=>`<option value="${esc(c.id)}" ${c.id===G.def?'selected':''}>${esc(c.name)}</option>`).join('');
}
$('gDefCal').onchange=e=>{G.def=e.target.value; ls('gDef',G.def);};
const gConnect=()=>gToken(G.want?'':'consent').then(()=>{gSync(true); driveSync();}).catch(err=>{alert(err.message);gStatus();});
$('gBtn').onclick=()=>{
  if(G.want&&!gReady()&&G.clientId) return gConnect();   // 一鍵重新連線
  $('gClientId').value=G.clientId; gStatus(); $('gModal').classList.remove('hidden');};
$('gClose').onclick=()=>$('gModal').classList.add('hidden');
$('gModal').onclick=e=>{if(e.target.id==='gModal') $('gModal').classList.add('hidden')};
$('gConnect').onclick=()=>{
  const id=$('gClientId').value.trim(); if(id!==G.clientId){G.clientId=id; ls('gClientId',id);}
  if(gReady()) gSync(true); else gConnect();};
$('gDisconnect').onclick=()=>{
  if(G.token&&window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(G.token,()=>{});
  Object.assign(G,{token:null,exp:0,want:false,events:[],range:'',err:'',cals:[],calErr:''}); ls('gConnected',null); gSaveTok();
  gStatus(); render();};
$('gUpload').onclick=async()=>{
  if(!confirm(`要把 ${db.events.length} 筆本機行程上傳到 Google 日曆嗎？上傳成功的會從本機移除，之後以 Google 上的為準。`)) return;
  let ok=0;
  for(const ev of [...db.events]){
    try{await gApi(evPath(G.def),'POST',toG(ev)); db.events=db.events.filter(x=>x!==ev); ok++;}
    catch(err){alert(err.message); break;}
  }
  save(); alert(`已上傳 ${ok} 筆`); await gSync(true); gStatus();};
setInterval(()=>{if(gReady()&&!document.hidden) gSync(true)},5*60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&gReady()) gSync(true)});

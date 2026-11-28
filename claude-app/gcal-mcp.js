/* ---------- Claude App 版：透過 Claude 的「Google Calendar」連接器讀寫 Google 日曆 ----------
   對外介面跟網頁版 js/google-calendar.js 一樣（G、gReady、gSync、gApi、toG…），所以 calendar.js 不用改。
   gApi 收到網頁版寫法的 REST 路徑（calendars/<id>/events/<id>），在這裡翻成連接器的工具：
   list_calendars、list_events、create_event、update_event、delete_event。 */
const GCAL='Google Calendar';
const GCOL={1:'#7986cb',2:'#33b679',3:'#8e24aa',4:'#e67c73',5:'#f6bf26',6:'#f4511e',7:'#039be5',8:'#616161',9:'#3f51b5',10:'#0b8043',11:'#d50000'};
const CAL_BG=['#039be5','#33b679','#8e24aa','#e67c73','#f6bf26','#f4511e','#7986cb','#0b8043','#d50000','#616161'];   // 連接器沒給日曆顏色，依順序配色
const TZ=Intl.DateTimeFormat().resolvedOptions().timeZone;
const G={want:ls('gConnected')==='1',ok:false,mcp:null,events:[],range:'',busy:false,err:'',cals:[],
  show:jget('gShow')||[],def:ls('gDef')||'',calErr:''};
const gReady=()=>G.ok;
const canWrite=c=>c.role==='owner'||c.role==='writer';
const evPath=(cal,id)=>'calendars/'+encodeURIComponent(cal)+'/events'+(id?'/'+encodeURIComponent(id):'');
// 連接器錯誤 → 看得懂的說明（每種要做的事不一樣）
function gErrMsg(e){
  switch(e?.code){
    case 'needs_reauth': return 'Google 日曆的連線過期了，請到 claude.ai「設定 → 連接器」重新連接 Google Calendar';
    case 'server_not_connected': case 'server_not_found': return '找不到 Google 日曆連接器，請到 claude.ai「設定 → 連接器」加入 Google Calendar';
    case 'selection_required': return '你有不只一個 Google Calendar 連接器，請在 Claude 跳出的視窗選一個';
    case 'not_in_manifest': case 'approval_required': case 'consent_required': return '你沒有允許這個 App 使用 Google 日曆。按「🔗 連接 Google 日曆」再允許一次';
    case 'blocked_by_policy': return '你的組織不允許使用 Google 日曆連接器';
    case 'server_unavailable': case 'rate_limited': return 'Google 日曆暫時連不上，等一下會再試';
    case 'not_granted': case 'capability_disabled': case 'capability_removed': return '這個畫面沒辦法使用連接器（請在 Claude 裡打開）';
    case 'tool_error': return 'Google 日曆回報錯誤：'+(e.message||'').slice(0,200);
    default: return 'Google 日曆錯誤：'+(e?.message||e);
  }
}
async function gCall(tool,input){
  if(!G.mcp) throw {code:'capability_disabled'};
  try{return (await G.mcp.callTool(GCAL,tool,input,{cache:false})).payload||{};}
  catch(e){if(e?.retryable&&/^(list_|get_)/.test(tool)){await sleep((e.retryAfterMs||1500)+Math.random()*800); return (await G.mcp.callTool(GCAL,tool,input,{cache:false})).payload||{};} throw e;}
}
const localIso=d=>`${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const isReadonlyCal=id=>/#holiday@|@group\.v\.calendar\.google\.com$/.test(id);
async function gLoadCals(){
  const d=await gCall('list_calendars',{pageSize:250});
  const old=new Map(G.cals.map(c=>[c.id,c]));
  G.cals=(d.calendars||[]).map((c,i)=>({id:c.id,name:c.summary||c.id,bg:old.get(c.id)?.bg||CAL_BG[i%CAL_BG.length],fg:'#fff',
    role:old.get(c.id)?.role||(isReadonlyCal(c.id)?'reader':'owner'),primary:false}));
  // 主要日曆：名稱是 email、不是群組日曆的那一個
  const p=G.cals.find(c=>c.id.includes('@')&&!c.id.includes('group.')); if(p) p.primary=true;
  G.cals.sort((a,b)=>b.primary-a.primary);
  const pid=p?.id||G.cals[0]?.id||'primary';
  G.show=G.show.filter(id=>G.cals.some(c=>c.id===id)); if(!G.show.length) G.show=G.cals.map(c=>c.id);   // 第一次：全部顯示
  if(!G.cals.some(c=>c.id===G.def&&canWrite(c))) G.def=pid;
  ls('gShow',JSON.stringify(G.show)); ls('gDef',G.def);
}
function fromG(it,cal){
  const allDay=!!it.start?.date;
  const hm=s=>{const d=new Date(s);return pad(d.getHours())+':'+pad(d.getMinutes())};
  return {id:'g:'+cal.id+':'+it.id,gid:it.id,calId:cal.id,calName:cal.name,ro:!canWrite(cal),google:true,
    sMs:allDay?null:new Date(it.start.dateTime).getTime(),eMs:allDay?null:new Date(it.end.dateTime).getTime(),
    fg:'#fff',recurring:!!it.recurringEventId,title:it.summary||'（無標題）',
    date:allDay?it.start.date:ymd(new Date(it.start.dateTime)),endDate:allDay?it.end.date:null,
    start:allDay?'':hm(it.start.dateTime),end:allDay?'':hm(it.end.dateTime),
    note:it.description||'',color:GCOL[it.colorId]||cal.bg,repeat:''};
}
async function gListEvents(cal,s,e){
  const out=[]; let pageToken;
  for(let i=0;i<6;i++){   // 一頁最多 250 筆，最多讀 6 頁
    const d=await gCall('list_events',{calendarId:cal.id,startTime:localIso(s),endTime:localIso(e),orderBy:'startTime',pageSize:250,...(pageToken?{pageToken}:{})});
    if(d.accessRole){cal.role=d.accessRole;}
    out.push(...(d.events||[]).filter(x=>x.status!=='cancelled'&&x.start).map(x=>fromG(x,cal)));
    pageToken=d.nextPageToken; if(!pageToken) break;
  }
  return out;
}
// calendar.js 寫入時用的資料格式（給下面的 gApi 用）
function toG(d){
  const b={summary:d.title,description:d.note||''};
  const cid=Object.keys(GCOL).find(k=>GCOL[k]===d.color); if(cid) b.colorId=cid;
  if(d.start){
    let end=d.end, ed=d.date;
    if(!end){const [h,m]=d.start.split(':').map(Number); end=h>=23?'23:59':pad(h+1)+':'+pad(m);}
    else if(end<=d.start){const n=parse(d.date); n.setDate(n.getDate()+1); ed=ymd(n);}   // 跨夜
    b.startTime=`${d.date}T${d.start}:00`; b.endTime=`${ed}T${end}:00`; b.allDay=false;
  }else{
    const n=parse(d.date); n.setDate(n.getDate()+1);
    b.startTime=`${d.date}T00:00:00`; b.endTime=`${ymd(n)}T00:00:00`; b.allDay=true;
  }
  if(d.repeat) b.recurrence=['RRULE:FREQ='+{w:'WEEKLY',m:'MONTHLY',y:'YEARLY'}[d.repeat]];
  return b;
}
// 網頁版 REST 寫法 → 連接器工具
async function gApi(path,method='GET',body){
  const m=path.match(/^calendars\/([^/]+)\/events(?:\/([^/?]+))?(\/move)?/);
  if(!m) throw new Error('不支援的操作');
  const calendarId=decodeURIComponent(m[1]), eventId=m[2]&&decodeURIComponent(m[2]);
  if(m[3]) throw new Error('目前不能把行程搬到另一個日曆，請刪掉再到新的日曆建立');
  const ev=body&&{summary:body.summary,description:body.description,colorId:body.colorId,
    startTime:body.startTime||body.start?.dateTime,endTime:body.endTime||body.end?.dateTime,allDay:body.allDay};
  if(ev) Object.keys(ev).forEach(k=>ev[k]===undefined&&delete ev[k]);
  try{
    if(method==='DELETE') return await gCall('delete_event',{calendarId,eventId,notificationLevel:'NONE'});
    if(method==='POST') return await gCall('create_event',{calendarId,...ev,...(body.recurrence?{recurrenceData:body.recurrence}:{}),notificationLevel:'NONE'});
    if(method==='PATCH') return await gCall('update_event',{calendarId,eventId,...ev,notificationLevel:'NONE'});
  }catch(e){throw new Error(gErrMsg(e));}
  throw new Error('不支援的操作');
}
async function gSync(force){
  if(!gReady()||G.busy) return;
  const [s,e]=calRange();
  const key=calView+ymd(s); if(!force&&G.range===key) return;
  G.range=key; G.busy=true; gStatus();
  try{
    const lists=await Promise.all(G.cals.filter(c=>G.show.includes(c.id)).map(c=>gListEvents(c,s,e)));
    G.events=lists.flat(); G.err='';
  }catch(err){G.err=gErrMsg(err); G.range='';
    if(['needs_reauth','server_not_connected','not_in_manifest','approval_required','blocked_by_policy','selection_required'].includes(err?.code)){G.ok=false; G.events=[];}}
  G.busy=false; gStatus(); if(tab==='cal'&&!tgDrag) renderCal();
}
function gStatus(){
  if(tab==='cal') renderDrawer();
  const t=$('dvGTitle'); if(!t) return;
  if(G.busy) t.textContent='Google 日曆 ⏳';
  if(G.err){const n=document.createElement('div'); n.className='small'; n.style.cssText='color:var(--red);font-weight:400;margin-top:4px'; n.textContent=G.err; t.appendChild(n);}
}
function gRenderCals(){renderDrawer();}
async function gConnect(){
  G.want=true; ls('gConnected','1'); G.err=''; G.busy=true; gStatus();
  try{await gLoadCals(); G.ok=true;}
  catch(e){G.ok=false; G.err=gErrMsg(e);}
  G.busy=false; gStatus();
  if(G.ok) await gSync(true); else if(G.err&&tab==='cal') alert(G.err);
}
$('gBtn').onclick=()=>gConnect();
setInterval(()=>{if(gReady()&&!document.hidden) gSync(true);},5*60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&gReady()) gSync(true);});
// 連接器在 App 載入後才拿得到；之前連過就自動接上（第一次要使用者按按鈕，Claude 才會問要不要允許）
cUse('mcp').then(m=>{G.mcp=m; if(m&&G.want) gConnect(); else gStatus();});

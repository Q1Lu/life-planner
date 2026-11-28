/* ---------- Claude App 版：資料存在 Claude 的資料庫，手機和電腦同步 ----------
   用 sync-merge.js 的合併邏輯（逐筆比較，新的留下）。資料放在每個人自己的私人區 data/users/<你的 id>/，別人看不到。
   一份文件最多 256 KB，所以整包資料切成好幾段存：lp-meta 記有幾段和版本，lp-0、lp-1… 是內容。
   lp-meta 有變動（另一台裝置剛存檔）就會即時收到，自動合併。 */
const CS={db:null,uid:null,ready:false,off:false,busy:false,again:false,timer:null,
  last:+(ls('csLast')||0),err:'',rev:ls('csRev')||''};
const CS_CHUNK=60000;          // 每段最多 6 萬字（中文 3 bytes，約 180 KB，低於上限）
const hashStr=s=>{let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0).toString(36)+'.'+s.length;};
function chunks(s){            // 切段時不要把 emoji（兩個字元組成）切成兩半
  const out=[]; let i=0;
  while(i<s.length){let j=Math.min(s.length,i+CS_CHUNK); const c=s.charCodeAt(j-1); if(j<s.length&&c>=0xd800&&c<0xdc00) j--; out.push(s.slice(i,j)); i=j;}
  return out.length?out:[''];
}
const csDoc=name=>CS.db.doc(`data/users/${CS.uid}/${name}`);
window.afterSave=()=>{if(!CS.ready) return; clearTimeout(CS.timer); CS.timer=setTimeout(cloudSync,1200);};
async function csReadAll(meta){
  const snaps=await Promise.all(Array.from({length:meta.n},(_,i)=>csDoc('lp-'+i).get()));
  const parts=snaps.map(s=>s.exists?s.data():null);
  if(parts.some(p=>!p||p.rev!==meta.rev)) return null;     // 另一台裝置寫到一半
  return parts.map(p=>p.s).join('');
}
const csErrMsg=e=>e?.code==='quota_exceeded'?'Claude 的資料空間滿了，請刪掉一些舊紀錄':e?.code==='revoked'?'這個 App 的存取權被取消了':e?.message||String(e);
async function cloudSync(){
  if(!CS.ready) return csUI();
  if(CS.busy){CS.again=true; return;}
  CS.busy=true; CS.err=''; csUI();
  try{
    let meta=(await csDoc('lp-meta').get()).data()||null, remoteHash='';
    if(meta?.n){
      let txt=await csReadAll(meta);
      if(txt==null){await sleep(1500+Math.random()*1000); meta=(await csDoc('lp-meta').get()).data()||null; txt=meta?.n?await csReadAll(meta):null;}
      if(txt==null) throw new Error('另一台裝置正在同步，稍後會自動再試');
      const rem=JSON.parse(txt); const a=mergeInto(rem), b=dedupeHabits(rem); if(a||b) render();
      remoteHash=meta.h;
    }
    const out=payload(), h=hashStr(out);
    if(h!==remoteHash){
      const rev=uid(), parts=chunks(out);
      for(let i=0;i<parts.length;i++) await csDoc('lp-'+i).set({rev,s:parts[i]});
      CS.rev=rev;                                     // 先記下，等一下收到自己寫的 lp-meta 才不會再同步一次
      await csDoc('lp-meta').set({rev,n:parts.length,h,at:Date.now()});
    }else CS.rev=meta.rev;
    ls('csRev',CS.rev); CS.last=Date.now(); ls('csLast',String(CS.last));
  }catch(err){CS.err=csErrMsg(err); if(err?.code==='unavailable') setTimeout(cloudSync,5000);}
  CS.busy=false; csUI();
  if(CS.again){CS.again=false; cloudSync();}
}
function csUI(){
  const el=$('syncState');
  if(CS.off){el.textContent='📱 只存在這台裝置'; el.title='這個畫面沒辦法使用 Claude 的資料庫（例如沒有登入），資料只存在這台裝置。'; return;}
  if(!CS.ready){el.textContent='☁️ 連線中…'; el.title=''; return;}
  el.textContent=CS.busy?'☁️ 同步中…':CS.err?'⚠️ 同步失敗':CS.last?'☁️ 已同步':'☁️';
  el.title=CS.err||(CS.last?'手機、電腦都會同步，上次同步 '+new Date(CS.last).toLocaleTimeString()+'（點一下立即同步）':'點一下立即同步');
  el.style.color=CS.err?'var(--red)':'';
}
function syncUI(){csUI();}
$('syncState').onclick=()=>{if(CS.err&&!CS.busy) alert(CS.err); cloudSync();};
setInterval(()=>{if(CS.ready&&!document.hidden) cloudSync();},5*60e3);    // 保險：即時通知漏掉時，每 5 分鐘對一次
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&CS.ready) cloudSync();});
(async()=>{
  const [dbx,user]=await Promise.all([cUse('db'),cUse('user')]);
  const id=await user?.id?.().catch(()=>null);
  if(!dbx||!id){CS.off=true; return csUI();}
  CS.db=dbx; CS.uid=id; CS.ready=true; csUI();
  csDoc('lp-meta').onSnapshot(s=>{
    const m=s.exists?s.data():null;
    if(m&&m.rev!==CS.rev&&!s.metadata.hasPendingWrites&&!s.metadata.fromCache) cloudSync();
  },err=>{CS.err=csErrMsg(err); csUI();});
  cloudSync();
})();

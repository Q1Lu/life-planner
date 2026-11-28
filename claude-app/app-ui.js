/* ---------- Claude App 版：畫面內的確認框、提示框 ----------
   工件裡瀏覽器的 confirm()／alert() 不會顯示，所以換成自己畫的視窗。在 core.js 之後載入，覆寫 ask()。 */
document.documentElement.classList.add('claude-app');
const DLG={q:[],cur:null};
function dlgShow(){
  if(DLG.cur||!DLG.q.length) return;
  const d=DLG.cur=DLG.q.shift();
  $('askMsg').textContent=d.msg;
  $('askOk').textContent=d.ok; $('askOk').classList.toggle('danger',!!d.danger);
  $('askCancel').classList.toggle('hidden',!d.cancel);
  $('askModal').classList.remove('hidden'); $('askOk').focus();
}
function dlgDone(v){
  const d=DLG.cur; if(!d) return; DLG.cur=null;
  $('askModal').classList.add('hidden'); d.res(v); dlgShow();
}
function ask(msg,o={}){
  return new Promise(res=>{DLG.q.push({msg:String(msg),ok:o.ok||'確定',cancel:true,danger:o.danger??/^(刪除|清除|匯入會覆蓋)/.test(msg),res}); dlgShow();});
}
window.alert=msg=>{DLG.q.push({msg:String(msg??''),ok:'好',cancel:false,res:()=>{}}); dlgShow();};
$('askOk').onclick=()=>dlgDone(true);
$('askCancel').onclick=()=>dlgDone(false);
$('askModal').onclick=e=>{if(e.target.id==='askModal') dlgDone(false);};
document.addEventListener('keydown',e=>{
  if(!DLG.cur) return;
  if(e.key==='Escape'){e.preventDefault(); dlgDone(false);}
  else if(e.key==='Enter'&&!e.isComposing){e.preventDefault(); dlgDone(true);}
},true);
// claude.use() 的小工具：不在 Claude 裡打開（例如直接開本機檔案）就回傳 null
const cUse=name=>window.claude?.use?claude.use(name).catch(()=>null):Promise.resolve(null);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- 今天（首頁）：番茄鐘、今天的待辦和行程、今日任務進度、今天花費 ---------- */
const TDY_MAX=8;                       // 首頁最多列幾項待辦，其他到「全部」看
function tdyPomo(){
  const t=db.todos.find(x=>x.id===P.todoId), focus=P.mode==='focus';
  $('tpMode').textContent=PLABEL[P.mode]+(P.running?' 中':pStarted()?'（暫停）':'');
  $('tpTime').textContent=fmtClock(pShown());
  $('tpTask').textContent=focus?(t?'正在做：'+t.text:'按待辦旁邊的 🍅 就能直接開始專注'):'休息一下，喝口水吧';
  $('tpStart').textContent=P.running?'⏸ 暫停':(pStarted()?'▶ 繼續':'▶ 開始');
  $('tdyPomo').style.setProperty('--c',focus?'#e5484d':'#16a34a');
  $('tdyPomo').classList.toggle('on',P.running);
}
function renderToday(){
  const ds=todayStr(), d=new Date(), h=d.getHours();
  $('tdyDate').textContent=`${d.getMonth()+1} 月 ${d.getDate()} 日（${WD[d.getDay()]}）`;
  $('tdyHi').textContent=h<5?'夜深了，早點休息 🌙':h<11?'早安 ☀️':h<14?'午安 🍱':h<18?'下午好 ☕':'晚安 🌆';
  tdyPomo();
  // 待辦：今天到期、已逾期的排前面，再來是其他還沒做的
  const open=db.todos.filter(x=>!x.done).sort(todoCmp);
  const due=open.filter(x=>x.due&&x.due<=ds), rest=open.filter(x=>!(x.due&&x.due<=ds));
  const list=[...due,...rest].slice(0,TDY_MAX), now=Date.now(), priTxt={3:'🔴',1:'⚪'};
  $('tdyTodo').innerHTML=list.map(x=>{
    const dl=deadline(x);
    const tag=!x.due?'':x.due<ds||dl<now?'<span class="tag" style="color:var(--red)">已逾期</span>':
      x.due===ds?`<span class="tag">${x.dueTime?x.dueTime+' 截止':'今天'}</span>`:
      `<span class="tag muted">${parse(x.due).getMonth()+1}/${parse(x.due).getDate()}</span>`;
    return `<li><input type="checkbox" data-tg="${x.id}"><span class="grow todo-edit" data-edit="${x.id}" title="點一下編輯">${priTxt[x.pri]||''} ${esc(x.text)}</span>${tag}`+
      `<button class="x" data-pomo="${x.id}" title="用番茄鐘處理這項">🍅</button></li>`;
  }).join('')||'<li class="muted">都做完了 🎉</li>';
  const more=open.length-list.length;
  $('tdyTodoCnt').textContent=(due.length?`今天 ${due.length} 項`:'')+(more>0?`${due.length?'・':''}還有 ${more} 項`:'');
  // 行程
  $('tdyEv').innerHTML=eventsOn(ds).map(evLi).join('')||'<li class="muted">今天沒有行程</li>';
  // 今日任務（習慣頁的打卡）
  const st=dayStat(habitDay());
  $('tdyHabTxt').textContent=st.total?`${st.done} / ${st.total} 項・${Math.round(st.rate*100)}%`:'還沒有設定任務';
  $('tdyHabBar').style.width=Math.round(st.rate*100)+'%';
  // 今天花費
  const exp=db.money.filter(x=>x.type==='exp'&&x.date===ds).reduce((s,x)=>s+x.amt,0);
  $('tdyMoney').textContent='$'+exp.toLocaleString();
}
$('tdyForm').onsubmit=e=>{e.preventDefault();
  const text=$('tdyText').value.trim(); if(!text) return;
  db.todos.push({id:uid(),text,due:todayStr(),dueTime:'',pri:2,done:false,created:Date.now()});
  $('tdyText').value=''; save(); renderToday();};
$('tdyTodo').onclick=e=>{
  if(e.target.dataset.tg){toggleTodo(e.target.dataset.tg); return;}
  if(e.target.dataset.pomo){             // 跟待辦頁一樣：記到這一項並開始專注，但留在首頁
    P.todoId=e.target.dataset.pomo;
    if(!P.running&&P.mode!=='focus') pSetMode('focus');
    pSave(); if(!P.running) pStart(); renderToday(); return;}
  const ed=e.target.closest('[data-edit]'); if(ed) openTodo(ed.dataset.edit);
};
$('tdyEv').onclick=e=>listClick(e);
$('tpStart').onclick=e=>{e.stopPropagation(); pStart(); tdyPomo();};
$('tdyPomo').onclick=()=>goTab('pomo');
$('tab-today').addEventListener('click',e=>{const b=e.target.closest('[data-go]'); if(b){goTab(b.dataset.go); scrollTo({top:0});}});
setInterval(()=>{if(tab==='today') tdyPomo();},1000);

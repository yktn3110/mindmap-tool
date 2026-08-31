const $ = s => document.querySelector(s);
const canvas = $('#canvas'), layer = $('#node-layer'), svg = $('#connections');
let map, selectedId, scale = 1, pan = {x:0,y:0}, drag = null, currentLayout = 'tree', hasUnsavedChanges = false, hasSavedVersion = false, currentFileHandle = null, cutNodeId = null, autoSaveTimer = null;
let undoStack = [], redoStack = [];
const starter = () => ({ nodes:[
  {id:'root',text:'新しいアイデア',x:520,y:310,parent:null,color:'root'},
  {id:'a',text:'やりたいこと',x:260,y:165,parent:'root'}, {id:'b',text:'調べること',x:795,y:170,parent:'root'},
  {id:'c',text:'次のアクション',x:780,y:455,parent:'root'}, {id:'d',text:'アイデアをメモ',x:80,y:75,parent:'a'},
  {id:'e',text:'優先順位を決める',x:65,y:245,parent:'a'}, {id:'f',text:'参考資料',x:1065,y:90,parent:'b'}
]});
map = starter();
$('#map-title').value = '無題のマップ';
function get(id){ return map.nodes.find(n=>n.id===id); }
function hexToRgb(hex){const value=hex.replace('#','');return [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)];}
function mixWithWhite(hex,amount=.84){const rgb=hexToRgb(hex).map(value=>Math.round(255-(255-value)*(1-amount)));return `rgb(${rgb.join(', ')})`;}
function childrenOf(id){ return map.nodes.filter(n=>n.parent===id).sort((a,b)=>(a.order??map.nodes.indexOf(a))-(b.order??map.nodes.indexOf(b))); }
function visibleNodes(){ const output=[]; const visit=node=>{output.push(node);if(!node.collapsed)childrenOf(node.id).forEach(visit);}; const root=map.nodes.find(n=>!n.parent);if(root)visit(root);return output; }
function copyMap(value=map){ return JSON.parse(JSON.stringify(value)); }
function updateSaveStatus(text,dirty=hasUnsavedChanges){const status=$('#save-status');status.textContent=text;status.classList.toggle('dirty',dirty);status.title=dirty?'変更があります。保存してから閉じてください。':'保存が必要な変更はありません。';}
function markDirty(){hasUnsavedChanges=true;updateSaveStatus(hasSavedVersion?'更新あり':'未保存（新規）');}
function markSaved(){hasUnsavedChanges=false;hasSavedVersion=true;const time=new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit'}).format(new Date());updateSaveStatus(`保存済み ${time}`);}
function markOpened(filename){hasUnsavedChanges=false;hasSavedVersion=true;updateSaveStatus(`保存済み: ${filename}`,false);}
function mapName(){return $('#map-title').value.trim()||'無題のマップ';}
function persist(){ markDirty(); }
function mapJson(){const data=copyMap();delete data.title;return JSON.stringify(data,null,2);}
function updateOverwriteButton(){$('#overwrite-btn').disabled=!currentFileHandle;}
function downloadJson(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([mapJson()],{type:'application/json'}));a.download=mapName()+'.json';a.click();URL.revokeObjectURL(a.href);markSaved();toast('マップを保存しました');}
async function saveAs(){
  if(!window.showSaveFilePicker){downloadJson();return;}
  try{currentFileHandle=await window.showSaveFilePicker({suggestedName:mapName()+'.json',types:[{description:'Mindflow map',accept:{'application/json':['.json']}}]});$('#map-title').value=currentFileHandle.name.replace(/\.json$/i,'');updateOverwriteButton();await saveOverwrite();}catch(error){if(error.name!=='AbortError')toast('保存できませんでした');}
}
async function saveOverwrite(){
  if(!currentFileHandle){await saveAs();return;}
  try{const writable=await currentFileHandle.createWritable();await writable.write(mapJson());await writable.close();markSaved();toast('上書き保存しました');}catch(error){toast('保存できませんでした');}
}
async function autoSaveIfNeeded(){if(hasUnsavedChanges&&currentFileHandle)await saveOverwrite();}
function toggleAutoSave(){if(autoSaveTimer){clearInterval(autoSaveTimer);autoSaveTimer=null;$('#auto-save-btn').textContent='自動保存 OFF';$('#auto-save-btn').setAttribute('aria-pressed','false');toast('自動保存を停止しました');return;}if(!currentFileHandle){toast('先に名前を付けて保存、またはファイルを開いてください');return;}autoSaveTimer=setInterval(autoSaveIfNeeded,3*60*1000);$('#auto-save-btn').textContent='自動保存 ON';$('#auto-save-btn').setAttribute('aria-pressed','true');toast('3分ごとの自動保存を開始しました');}
function updateHistoryButtons(){ $('#undo-btn').disabled=!undoStack.length; $('#redo-btn').disabled=!redoStack.length; }
function recordChange(before){
  if(JSON.stringify(before)===JSON.stringify(map)) return;
  undoStack.push(before);
  if(undoStack.length>100) undoStack.shift();
  redoStack=[];
  updateHistoryButtons();
}
function restore(snapshot){
  map=copyMap(snapshot);
  selectedId=map.nodes.some(n=>n.id===selectedId) ? selectedId : 'root';
  persist();
  draw();
}
function undo(){
  if(!undoStack.length) return;
  redoStack.push(copyMap());
  restore(undoStack.pop());
  updateHistoryButtons();
  toast('元に戻しました');
}
function redo(){
  if(!redoStack.length) return;
  undoStack.push(copyMap());
  restore(redoStack.pop());
  updateHistoryButtons();
  toast('やり直しました');
}
function setLayoutButton(type){ $('#auto-layout').classList.toggle('active',type==='tree'); $('#horizontal-layout').classList.toggle('active',type==='horizontal'); }
function layoutMap(type){
  const leaves=[];
  const children=childrenOf;
  const place=(node,depth)=>{ const kids=node.collapsed ? [] : children(node.id); if(!kids.length){ if(type==='tree')node.x=90+leaves.length*190; else node.y=90+leaves.length*105; leaves.push(node); } else { kids.forEach(k=>place(k,depth+1)); if(type==='tree')node.x=kids.reduce((sum,k)=>sum+k.x,0)/kids.length; else node.y=kids.reduce((sum,k)=>sum+k.y,0)/kids.length; } if(type==='tree')node.y=90+depth*125; else node.x=90+depth*210; };
  const root=map.nodes.find(n=>!n.parent); if(root)place(root,0);
}
function autoLayout(type='tree'){
  const before=copyMap();
  layoutMap(type); currentLayout=type; persist(); recordChange(before); draw(); setLayoutButton(type); toast(type==='tree'?'ツリーに整列しました':'横展開に整列しました');
}
function mapBounds(){
  const nodes=visibleNodes(), widths=nodes.map(n=>(layer.querySelector(`[data-id="${n.id}"]`)?.offsetWidth||130)), heights=nodes.map(n=>(layer.querySelector(`[data-id="${n.id}"]`)?.offsetHeight||46));
  return {minX:Math.min(...nodes.map(n=>n.x))-35,minY:Math.min(...nodes.map(n=>n.y))-35,maxX:Math.max(...nodes.map((n,i)=>n.x+widths[i]))+35,maxY:Math.max(...nodes.map((n,i)=>n.y+heights[i]))+35};
}
function fitView(){
  const b=mapBounds(), rect=canvas.getBoundingClientRect(), padding=56;
  const mapWidth=Math.max(1,b.maxX-b.minX), mapHeight=Math.max(1,b.maxY-b.minY);
  scale=Math.max(.2,Math.min(1.8,(rect.width-padding)/mapWidth,(rect.height-padding)/mapHeight));
  pan={x:(rect.width-mapWidth*scale)/2-b.minX*scale,y:(rect.height-mapHeight*scale)/2-b.minY*scale};
  draw();
}
function createPngDataUrl(){
  const b=mapBounds(), width=Math.ceil(b.maxX-b.minX), height=Math.ceil(b.maxY-b.minY), ratio=2;
  const out=document.createElement('canvas');out.width=width*ratio;out.height=height*ratio;const ctx=out.getContext('2d');ctx.scale(ratio,ratio);ctx.fillStyle='#f9fafc';ctx.fillRect(0,0,width,height);
  const pos=n=>{const el=layer.querySelector(`[data-id="${n.id}"]`);return {x:n.x-b.minX,y:n.y-b.minY,w:el?.offsetWidth||130,h:el?.offsetHeight||46};};
  ctx.strokeStyle='#bdb8e8';ctx.lineWidth=2;map.nodes.filter(n=>n.parent).forEach(n=>{const a=pos(get(n.parent)),c=pos(n);ctx.beginPath();ctx.moveTo(a.x+a.w/2,a.y+a.h/2);ctx.bezierCurveTo(a.x+a.w/2+(c.x-a.x)*.48,a.y+a.h/2,c.x+c.w/2-(c.x-a.x)*.48,c.y+c.h/2,c.x+c.w/2,c.y+c.h/2);ctx.stroke();});
  map.nodes.forEach(n=>{const p=pos(n), root=!n.parent;ctx.fillStyle=root?'#6856e9':'#fff';ctx.strokeStyle=n.color||'#e0e5ef';ctx.lineWidth=root?0:2;ctx.beginPath();ctx.roundRect(p.x,p.y,p.w,p.h,9);ctx.fill();ctx.stroke();ctx.fillStyle=root?'#fff':'#20283a';ctx.font=`${root?'700 16px':'14px'} system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${n.icon?n.icon+' ':''}${n.text}`,p.x+p.w/2,p.y+p.h/2,p.w-18);});
  return out.toDataURL('image/png');
}
function exportPng(){
  const a=document.createElement('a');a.href=createPngDataUrl();a.download=mapName()+'.png';a.click();toast('PNGを書き出しました');
}
function exportPdf(){
  const pngWindow=window.open('','_blank');if(!pngWindow){toast('ポップアップを許可してください');return;}
  pngWindow.document.write(`<title>${mapName()}</title><style>body{margin:0;text-align:center}img{max-width:100%;height:auto}</style><img src="${createPngDataUrl()}"><script>onload=()=>print()<\/script>`);pngWindow.document.close();
}
function draw(){
  layer.innerHTML=''; svg.innerHTML='';
  layer.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${scale})`;
  const visible=visibleNodes();
  visible.forEach(n=>{
    const el=document.createElement('div'); el.className='node'+(n.id==='root'?' root':'')+(n.id===selectedId?' selected':'')+(n.id===cutNodeId?' cut':''); el.dataset.id=n.id; el.style.left=n.x+'px'; el.style.top=n.y+'px'; if(n.color){el.style.setProperty('--node-color',n.color);el.style.setProperty('--node-background',mixWithWhite(n.color));el.style.setProperty('--node-border',n.color);el.style.setProperty('--node-text',n.color);}
    const icon=document.createElement('span');icon.className='node-icon';icon.textContent=n.icon ? n.icon+' ' : ''; const label=document.createElement('span');label.className='node-label';label.textContent=n.text;label.addEventListener('mousedown',e=>{if(label.isContentEditable)e.stopPropagation();});label.addEventListener('click',e=>{if(label.isContentEditable)e.stopPropagation();});el.append(icon,label);if(n.note){const noteMark=document.createElement('span');noteMark.className='note-indicator';noteMark.setAttribute('aria-label','補足メモあり');noteMark.title='補足メモあり';noteMark.textContent='▤';el.append(noteMark);}
    if(childrenOf(n.id).length){const toggle=document.createElement('button');toggle.className='collapse-toggle';toggle.type='button';toggle.dataset.id=n.id;toggle.setAttribute('aria-label',n.collapsed?'子ノードを展開':'子ノードを折り畳む');toggle.textContent=n.collapsed?'＋':'−';toggle.addEventListener('mousedown',e=>e.stopPropagation());toggle.addEventListener('click',e=>{e.stopPropagation();toggleCollapse(n.id);});el.append(toggle);}
    el.addEventListener('dblclick',e=>editNode(n.id,e.currentTarget.querySelector('.node-label'))); el.addEventListener('mousedown',startNodeDrag); el.addEventListener('click',()=>select(n.id)); layer.append(el);
  });
  visible.filter(n=>n.parent).forEach(n=>{ const p=get(n.parent); if(!p)return; const a=center(p),b=center(n); const dx=Math.abs(b.x-a.x)*.48; const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',`M ${a.x} ${a.y} C ${a.x+(b.x>a.x?dx:-dx)} ${a.y}, ${b.x-(b.x>a.x?dx:-dx)} ${b.y}, ${b.x} ${b.y}`); path.setAttribute('fill','none');path.setAttribute('stroke','#bdb8e8');path.setAttribute('stroke-width','2'); svg.append(path); });
  $('#zoom-label').textContent=Math.round(scale*100)+'%';
}
function toggleCollapse(id){const before=copyMap(),node=get(id);node.collapsed=!node.collapsed;persist();recordChange(before);draw();select(id);}
function center(n){ const el=layer.querySelector(`[data-id="${n.id}"]`); return {x:(n.x+(el?.offsetWidth||130)/2)*scale+pan.x,y:(n.y+(el?.offsetHeight||42)/2)*scale+pan.y}; }
function select(id){
  selectedId=id;
  layer.querySelectorAll('.node').forEach(el=>el.classList.toggle('selected',el.dataset.id===id));
  const node=get(id), enabled=!!node; $('#node-icon').disabled=!enabled;$('#node-note').disabled=!enabled;$('#node-icon').value=node?.icon||'';$('#node-note').value=node?.note||'';$('#color-picker').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.color===node?.color));
  const siblings=node?.parent ? childrenOf(node.parent) : [], index=siblings.indexOf(node);$('#move-node-up').disabled=index<=0;$('#move-node-down').disabled=index<0||index===siblings.length-1;
  const preview=$('#note-preview');preview.hidden=!node?.note;if(node?.note){$('#note-preview-node').textContent=`${node.icon?node.icon+' ':''}${node.text}`;$('#note-preview-text').textContent=node.note;}
}
function focusNode(id){
  const node=get(id); if(!node)return;
  const el=layer.querySelector(`[data-id="${id}"]`), rect=canvas.getBoundingClientRect();
  pan={x:rect.width/2-(node.x+(el?.offsetWidth||130)/2)*scale,y:rect.height/2-(node.y+(el?.offsetHeight||46)/2)*scale};
  select(id); draw(); select(id);
}
function searchNodes(){
  const query=$('#node-search').value.trim().toLocaleLowerCase(), results=$('#search-results');
  layer.querySelectorAll('.node').forEach(el=>el.classList.remove('search-match'));
  if(!query){results.innerHTML='';return;}
  const matches=map.nodes.filter(n=>`${n.text} ${n.note||''}`.toLocaleLowerCase().includes(query));
  matches.forEach(n=>layer.querySelector(`[data-id="${n.id}"]`)?.classList.add('search-match'));
  results.innerHTML=matches.length ? '' : '<p class="search-empty">該当するノードはありません</p>';
  matches.forEach(n=>{const button=document.createElement('button');button.className='search-result';button.textContent=n.icon?`${n.icon} ${n.text}`:n.text;button.onclick=()=>focusNode(n.id);results.append(button);});
}
function insertLineBreak(el){
  const selection=window.getSelection();
  if(!selection?.rangeCount)return;
  const range=selection.getRangeAt(0);
  if(!el.contains(range.commonAncestorContainer))return;
  range.deleteContents();
  const lineBreak=document.createElement('br'), cursor=document.createTextNode('\u200B'), fragment=document.createDocumentFragment();
  fragment.append(lineBreak,cursor);
  range.insertNode(fragment);
  range.setStartAfter(cursor);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
function editNode(id,el,selectAll=true){
  const before=copyMap();
  selectedId=id;
  select(id);
  el.contentEditable='true';
  el.focus();
  if(selectAll){
    const range=document.createRange();
    range.selectNodeContents(el);
    const selection=window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  const finish=()=>{
    const text=[...el.childNodes].map(child=>child.nodeName==='BR'?'\n':child.textContent).join('').replaceAll('\u200B','').trim();
    if(text){
      get(id).text=text;
      el.textContent=text;
    }
    el.contentEditable='false';
    persist();
    recordChange(before);
  };
  const onKeydown=e=>{
    if(e.key==='Enter'&&e.shiftKey){ e.preventDefault(); insertLineBreak(el); }
    else if(e.key==='Enter'){ e.preventDefault(); el.blur(); }
    if(e.key==='Tab'){
      e.preventDefault();
      e.stopPropagation();
      el.blur();
      requestAnimationFrame(()=>addNode());
    }
  };
  el.addEventListener('blur',()=>{el.removeEventListener('keydown',onKeydown);finish();},{once:true});
  el.addEventListener('keydown',onKeydown);
}
function addNode(sibling=false){ const before=copyMap(); const base=get(selectedId)||get('root'); const parent=sibling ? get(base.parent)||base : base; const siblings=childrenOf(parent.id); const index=siblings.length; const node={id:crypto.randomUUID(),text:'新しいノード',parent:parent.id,order:index,x:currentLayout==='horizontal'?parent.x+210:parent.x+index*145,y:currentLayout==='horizontal'?parent.y+index*92:parent.y+125}; map.nodes.push(node); selectedId=node.id; persist();recordChange(before);draw(); editNode(node.id,layer.querySelector(`[data-id="${node.id}"] .node-label`)); }
function remove(){ const n=get(selectedId); if(!n||!n.parent){toast('中心ノードは削除できません');return;} const before=copyMap(); const ids=new Set([n.id]); let changed=true; while(changed){changed=false;map.nodes.forEach(x=>{if(ids.has(x.parent)&&!ids.has(x.id)){ids.add(x.id);changed=true;}})} map.nodes=map.nodes.filter(x=>!ids.has(x.id));selectedId=n.parent;persist();recordChange(before);draw(); }
function cutNode(){const node=get(selectedId);if(!node||!node.parent){toast('中心ノードは切り取れません');return;}cutNodeId=node.id;$('#paste-node').disabled=false;draw();}
function pasteNode(){const node=get(cutNodeId),target=get(selectedId);if(!node||!target)return;const descendants=new Set([node.id]);let changed=true;while(changed){changed=false;map.nodes.forEach(item=>{if(descendants.has(item.parent)&&!descendants.has(item.id)){descendants.add(item.id);changed=true;}})}if(descendants.has(target.id)){toast('子ノードには貼り付けできません');return;}const before=copyMap(),order=childrenOf(target.id).length;node.parent=target.id;node.order=order;cutNodeId=null;$('#paste-node').disabled=true;persist();recordChange(before);draw();select(node.id);toast('ノードを貼り付けました');}
function moveSibling(direction){
  const node=get(selectedId); if(!node?.parent)return;
  const siblings=childrenOf(node.parent),index=siblings.indexOf(node),target=index+direction;
  if(target<0||target>=siblings.length)return;
  const before=copyMap();
  [siblings[index],siblings[target]]=[siblings[target],siblings[index]];
  siblings.forEach((item,position)=>item.order=position);
  layoutMap(currentLayout);persist();recordChange(before);draw();select(node.id);toast('兄弟ノードの順番を変更しました');
}
function startNodeDrag(e){
  const n=get(e.currentTarget.dataset.id);
  const label=e.target.closest('.node-label');
  if(label && selectedId===n.id && !label.isContentEditable && e.detail===1){ editNode(n.id,label,false); e.stopPropagation(); return; }
  if(e.target.contentEditable==='true'){ e.stopPropagation(); return; }
  e.stopPropagation();
  drag={type:'node',node:n,startX:e.clientX,startY:e.clientY,x:n.x,y:n.y,moved:false,before:copyMap()};
  canvas.focus({preventScroll:true});
}
canvas.addEventListener('mousedown',e=>{
  canvas.focus({preventScroll:true});
  if(!e.target.closest('.node')) drag={type:'pan',startX:e.clientX,startY:e.clientY,x:pan.x,y:pan.y,moved:false};
});
window.addEventListener('mousemove',e=>{
  if(!drag) return;
  const dx=e.clientX-drag.startX, dy=e.clientY-drag.startY;
  if(Math.abs(dx)>3 || Math.abs(dy)>3) drag.moved=true;
  if(!drag.moved) return;
  if(drag.type==='node'){
    drag.node.x=drag.x+dx/scale;
    drag.node.y=drag.y+dy/scale;
  } else {
    pan={x:drag.x+dx,y:drag.y+dy};
  }
  draw();
});
window.addEventListener('mouseup',()=>{
  if(!drag) return;
  if(drag.type==='node' && !drag.moved) select(drag.node.id);
  if(drag.moved&&drag.type==='node'){ persist(); recordChange(drag.before); }
  drag=null;
});
canvas.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(.45,Math.min(1.8,scale+(e.deltaY<0?.08:-.08)));draw();},{passive:false});
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800);}
$('#add-child').onclick=()=>addNode();$('#add-sibling').onclick=()=>addNode(true);$('#delete-node').onclick=remove;$('#move-node-up').onclick=()=>moveSibling(-1);$('#move-node-down').onclick=()=>moveSibling(1);$('#undo-btn').onclick=undo;$('#redo-btn').onclick=redo;$('#zoom-in').onclick=()=>{scale=Math.min(1.8,scale+.1);draw()};$('#zoom-out').onclick=()=>{scale=Math.max(.45,scale-.1);draw()};$('#fit-view').onclick=fitView;
$('#cut-node').onclick=cutNode;$('#paste-node').onclick=pasteNode;
$('#auto-layout').onclick=()=>autoLayout('tree');$('#horizontal-layout').onclick=()=>autoLayout('horizontal');
$('#export-png-btn').onclick=exportPng;$('#export-pdf-btn').onclick=exportPdf;
$('#color-picker').onclick=e=>{if(!e.target.matches('button[data-color]')||!get(selectedId))return;const before=copyMap();get(selectedId).color=e.target.dataset.color||undefined;persist();recordChange(before);draw();select(selectedId);};$('#node-icon').onchange=e=>{if(!get(selectedId))return;const before=copyMap();get(selectedId).icon=e.target.value;persist();recordChange(before);draw();select(selectedId);};$('#node-note').onchange=e=>{if(!get(selectedId))return;const before=copyMap();get(selectedId).note=e.target.value;persist();recordChange(before);draw();select(selectedId);};
$('#node-search').oninput=searchNodes;
$('#new-btn').onclick=()=>{if(confirm('現在のマップを新しくしますか？')){const before=copyMap();map=starter();$('#map-title').value='無題のマップ';hasSavedVersion=false;currentFileHandle=null;updateOverwriteButton();selectedId=undefined;scale=1;pan={x:0,y:0};persist();recordChange(before);draw();}};
function loadMapData(value,filename,handle=null){if(!Array.isArray(value.nodes))throw new Error('invalid map');const before=copyMap();map=value;$('#map-title').value=filename.replace(/\.json$/i,'')||'無題のマップ';delete map.title;currentFileHandle=handle;updateOverwriteButton();selectedId=undefined;recordChange(before);draw();markOpened(filename);toast('マップを開きました');}
function loadMapFile(file,handle=null){const r=new FileReader();r.onload=()=>{try{loadMapData(JSON.parse(r.result),file.name,handle);}catch{toast('有効なマップファイルではありません');}};r.readAsText(file);}
async function openInitialMapFromCli(){const token=new URLSearchParams(location.search).get('initial-map');if(!token)return;try{const response=await fetch(`/api/initial-map?token=${encodeURIComponent(token)}`);if(!response.ok)throw new Error('not found');const {filename,map:initialMap}=await response.json();loadMapData(initialMap,filename);}catch{toast('起動時のマップを開けませんでした');}}
async function openMap(){if(!window.showOpenFilePicker){$('#file-input').click();return;}try{const [handle]=await window.showOpenFilePicker({types:[{description:'Mindflow map',accept:{'application/json':['.json']}}]});loadMapFile(await handle.getFile(),handle);}catch(error){if(error.name!=='AbortError')toast('ファイルを開けませんでした');}}
$('#export-btn').onclick=saveAs;$('#overwrite-btn').onclick=saveOverwrite;$('#import-btn').onclick=openMap;$('#file-input').onchange=e=>{const f=e.target.files[0];if(f)loadMapFile(f);};
$('#auto-save-btn').onclick=toggleAutoSave;
document.addEventListener('keydown',e=>{
  if(document.activeElement.isContentEditable || document.activeElement.matches('input, textarea, select')) return;
  if((e.ctrlKey||e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); }
  else if((e.ctrlKey||e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); }
  else if(e.altKey && !e.ctrlKey && !e.metaKey && e.key==='ArrowUp'){ e.preventDefault(); moveSibling(-1); }
  else if(e.altKey && !e.ctrlKey && !e.metaKey && e.key==='ArrowDown'){ e.preventDefault(); moveSibling(1); }
  else if(e.key==='Tab'){ e.preventDefault(); addNode(); }
  else if(e.key==='Enter'){ e.preventDefault(); addNode(true); }
  else if(e.key==='Delete' || e.key==='Backspace'){ e.preventDefault(); remove(); }
}, true);
window.addEventListener('beforeunload',e=>{if(!hasUnsavedChanges)return;e.preventDefault();e.returnValue='';});
updateSaveStatus('未保存（新規）',false);
updateOverwriteButton();
updateHistoryButtons();
draw();
openInitialMapFromCli();

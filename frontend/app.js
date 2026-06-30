// ══════════════════════════════════════════════════════════
//  CLOCK
// ══════════════════════════════════════════════════════════
(function tick(){
  const d=new Date();
  document.getElementById('clock').textContent=
    d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})+
    '  '+d.toLocaleTimeString('en-GB');
  setTimeout(tick,1000);
})();

// ══════════════════════════════════════════════════════════
//  API LAYER — connects to Node.js/Express backend
// ══════════════════════════════════════════════════════════
const API_BASE = window.location.protocol.startsWith('http') ? `${window.location.origin}/api` : 'http://localhost:3001/api';

let _isOnline = true;

async function checkConnection() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    _isOnline = res.ok;
  } catch {
    _isOnline = false;
  }
  updateStatusDot();
}

function updateStatusDot() {
  const dot = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  if (!dot) return;
  if (_isOnline) {
    dot.style.background = '#1a7a3f';
    label.textContent = 'Online';
  } else {
    dot.style.background = '#b30000';
    label.textContent = 'Offline';
  }
}

// Check connection every 10 seconds
setInterval(checkConnection, 10000);

// ── Generic API helper ────────────────────────────────────
async function apiFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ══════════════════════════════════════════════════════════
//  DB API — mirrors old IndexedDB interface for compatibility
// ══════════════════════════════════════════════════════════

function initDB() {
  return checkConnection();
}

async function dbGet(store, key) {
  if (store === 'months') {
    return apiFetch(`/months/${encodeURIComponent(key)}`);
  }
  if (store === 'settings') {
    const val = await apiFetch('/settings');
    return val ? { key: 'appSettings', value: val } : null;
  }
  throw new Error(`dbGet: unknown store "${store}"`);
}

async function dbGetAll(store) {
  if (store === 'months') {
    return apiFetch('/months');
  }
  if (store === 'recommendations') {
    return apiFetch('/recommendations');
  }
  if (store === 'sans') {
    return apiFetch('/sans');
  }
  if (store === 'settings') {
    const val = await apiFetch('/settings');
    return val ? [{ key: 'appSettings', value: val }] : [];
  }
  throw new Error(`dbGetAll: unknown store "${store}"`);
}

async function dbPut(store, obj) {
  if (store === 'months') {
    return apiFetch(`/months/${encodeURIComponent(obj.key)}`, 'PUT', {
      sheets:   obj.sheets,
      fileName: obj.fileName,
      savedAt:  obj.savedAt,
    });
  }
  if (store === 'recommendations') {
    return apiFetch(`/recommendations/${encodeURIComponent(obj.caseKey)}`, 'PUT', obj);
  }
  if (store === 'sans') {
    if (obj.id) {
      return apiFetch(`/sans/${obj.id}`, 'PUT', obj);
    } else {
      const created = await apiFetch('/sans', 'POST', obj);
      obj.id = created.id;
      return created;
    }
  }
  if (store === 'settings') {
    return apiFetch('/settings', 'PUT', obj.value);
  }
  throw new Error(`dbPut: unknown store "${store}"`);
}

async function dbDelete(store, key) {
  if (store === 'months') {
    return apiFetch(`/months/${encodeURIComponent(key)}`, 'DELETE');
  }
  if (store === 'recommendations') {
    return apiFetch(`/recommendations/${encodeURIComponent(key)}`, 'DELETE');
  }
  if (store === 'sans') {
    return apiFetch(`/sans/${key}`, 'DELETE');
  }
  throw new Error(`dbDelete: unknown store "${store}"`);
}

async function dbGetByIndex(store, indexName, val) {
  const all = await dbGetAll(store);
  return all.filter(item => item[indexName] === val);
}

// ── BACKUP / RESTORE ──
async function backupDB() {
  try {
    const data = await apiFetch('/backup');
    const json = JSON.stringify(data, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `MRO_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  } catch (err) {
    alert('Backup failed: ' + err.message);
  }
}

async function restoreDB(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    const months = data.months || [];
    const recs   = data.recs   || [];
    const sans   = data.sans   || [];

    const result = await apiFetch('/restore', 'POST', { months, recs, sans });
    alert(`Restore complete!\nMonths: ${result.results.months}\nRecommendations: ${result.results.recs}\nSANs: ${result.results.sans}${result.results.errors.length ? '\n\nErrors:\n' + result.results.errors.join('\n') : ''}`);
    buildMonthGrid();
  } catch (e) {
    alert('Restore failed: ' + e.message);
  }
  input.value = '';
}

// ══════════════════════════════════════════════════════════
//  NAV STATE
// ══════════════════════════════════════════════════════════
const TODAY=new Date(), CUR_YEAR=TODAY.getFullYear(), CUR_MONTH=TODAY.getMonth();
let selYear=null, selMonth=null;
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');}

function updateBC(){
  const show=(id,txt)=>{const el=document.getElementById(id);el.style.display='';el.textContent=txt;};
  const hide=id=>document.getElementById(id).style.display='none';
  if(selYear){show('bc2',selYear);show('bc2-sep','›');}else{hide('bc2');hide('bc2-sep');}
  if(selMonth!==null){show('bc3',MONTHS[selMonth]);show('bc3-sep','›');}else{hide('bc3');hide('bc3-sep');}
}

function goHome(){selYear=null;selMonth=null;updateBC();showScreen('screen-home');}
function goMonths(){selMonth=null;updateBC();buildMonthGrid();showScreen('screen-months');}
function goModules(){updateBC();showScreen('screen-modules');}

// YEAR GRID — init on DOMContentLoaded so all functions are defined first
async function initPortal(){
  try {
    await initDB();
    await loadSettings();
  } catch(e) { console.warn('Settings load error:',e); }
  const grid=document.getElementById('year-grid');
  const years=[];for(let y=CUR_YEAR-4;y<=CUR_YEAR+1;y++)years.push(y);
  grid.innerHTML=years.map(y=>`
    <button class="year-btn ${y===CUR_YEAR?'current-year':''}" onclick="selectYear(${y})">
      ${y}<span class="yr-label">${y===CUR_YEAR?'Current':y<CUR_YEAR?'Past':'Upcoming'}</span>
    </button>`).join('');
}
document.addEventListener('DOMContentLoaded', initPortal);

function selectYear(y){selYear=y;document.getElementById('months-title').textContent=y;updateBC();buildMonthGrid();showScreen('screen-months');}

async function buildMonthGrid(){
  const grid=document.getElementById('month-grid');
  const allMonths=await dbGetAll('months');
  grid.innerHTML=MONTHS.map((name,i)=>{
    const isFuture=selYear>CUR_YEAR||(selYear===CUR_YEAR&&i>CUR_MONTH);
    const isCurrent=selYear===CUR_YEAR&&i===CUR_MONTH;
    const key=selYear+'-'+i;
    const hasData=allMonths.some(m=>m.key===key);
    let cls=isFuture?'future':isCurrent?'current':'';
    if(hasData&&!isFuture)cls=(cls?cls+' ':'')+'has-data';
    const badge=isCurrent?'<span class="month-badge">Current</span>':hasData?'<span class="month-badge" style="background:var(--green)">✓ Data</span>':'';
    return `<div class="month-card ${cls}" onclick="selectMonth(${i})">
      <div class="month-num">${String(i+1).padStart(2,'0')}</div>
      <div class="month-name">${name}</div>${badge}</div>`;
  }).join('');
}

function selectMonth(m){
  selMonth=m;
  const label=`${MONTHS[m]} ${selYear}`;
  document.getElementById('modules-title').textContent=label;
  document.getElementById('oida-title').textContent=`OIDA – ${label}`;
  updateBC();showScreen('screen-modules');
}

// ══════════════════════════════════════════════════════════
//  DATA STATE
// ══════════════════════════════════════════════════════════
let allSheets={}, activeSheet='', activeRows=[];
let currentRecs={}; // caseKey → rec object

function monthKey(){return selYear+'-'+selMonth;}
function caseKey(caseNo){return monthKey()+'-'+caseNo;}

// ══════════════════════════════════════════════════════════
//  OPEN MODULE
// ══════════════════════════════════════════════════════════
async function openModule(mod){
  if(mod==='rcb'){ await openRCBModule(); return; }
  if(mod==='san'){ await openModule_san(selYear, selMonth); return; }
  if(mod!=='oida')return;
  document.getElementById('bc4').textContent='OIDA';
  document.getElementById('bc4').style.display='';
  document.getElementById('bc4-sep').style.display='';

  // Load saved month data from IndexedDB
  const saved=await dbGet('months',monthKey());
  // Load all recommendations for this month
  const allRecs=await dbGetAll('recommendations');
  currentRecs={};
  allRecs.filter(r=>r.caseKey.startsWith(monthKey()+'-')).forEach(r=>{currentRecs[r.caseKey]=r;});

  if(saved){
    allSheets=saved.sheets;
    const names=Object.keys(allSheets);
    buildSheetTabs(names);
    selectSheet(names[0]);
    document.getElementById('upload-zone').style.display='none';
    document.getElementById('oida-content').style.display='block';
  }else{
    allSheets={}; activeSheet=''; activeRows=[];
    document.getElementById('oida-content').style.display='none';
    document.getElementById('upload-zone').style.display='block';
  }
  showScreen('screen-oida');
}

function triggerUpload(){document.getElementById('file-input').click();}

// ══════════════════════════════════════════════════════════
//  FILE UPLOAD
// ══════════════════════════════════════════════════════════
document.getElementById('file-input').addEventListener('change',async function(e){
  const file=e.target.files[0]; if(!file)return;
  document.getElementById('loader').classList.add('on');
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const wb=XLSX.read(ev.target.result,{type:'array',cellText:true,cellDates:true});
      allSheets={};
      const KW=['ser','dept','dir','case','ata','description','fleet','response'];
      wb.SheetNames.forEach(sn=>{
        const ws=wb.Sheets[sn];
        const raw2d=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let hIdx=0;
        for(let i=0;i<Math.min(raw2d.length,12);i++){
          if(KW.filter(k=>raw2d[i].join(' ').toLowerCase().includes(k)).length>=3){hIdx=i;break;}
        }
        const headers=raw2d[hIdx].map(h=>String(h).trim());
        const dataRows=raw2d.slice(hIdx+1).map(row=>{
          const obj={};headers.forEach((h,i)=>{obj[h]=row[i]!==undefined?row[i]:'';});return obj;
        }).filter(r=>Object.values(r).some(v=>v!==''&&v!==null));
        if(dataRows.length>0)allSheets[sn]={rows:dataRows,headers};
      });
      const names=Object.keys(allSheets);
      if(!names.length)throw new Error('No data found in file.');
      await dbPut('months',{key:monthKey(),sheets:allSheets,fileName:file.name,savedAt:new Date().toISOString()});
      buildSheetTabs(names);
      selectSheet(names[0]);
      document.getElementById('upload-zone').style.display='none';
      document.getElementById('oida-content').style.display='block';
    }catch(err){alert('Could not read file:\n'+err.message);}
    document.getElementById('loader').classList.remove('on');
  };
  reader.readAsArrayBuffer(file);
});

// ══════════════════════════════════════════════════════════
//  SHEET TABS
// ══════════════════════════════════════════════════════════
function buildSheetTabs(names){
  const wrap=document.getElementById('sheet-tabs-wrap');
  const tabs=document.getElementById('sheet-tabs');
  tabs.innerHTML='';
  if(names.length>1){
    wrap.style.display='block';
    names.forEach(n=>{
      const b=document.createElement('button');
      b.textContent=n;
      b.style.cssText='padding:5px 16px;border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:var(--white);color:var(--gray5);font-family:inherit;transition:all .15s;';
      b.onclick=()=>selectSheet(n);
      b.dataset.name=n;
      tabs.appendChild(b);
    });
  }else{wrap.style.display='none';}
}

function selectSheet(name){
  activeSheet=name;
  const sheet=allSheets[name];
  activeRows=parseRows(sheet.rows);
  document.querySelectorAll('#sheet-tabs button').forEach(b=>{
    const a=b.dataset.name===name;
    b.style.background=a?'var(--accent)':'var(--white)';
    b.style.color=a?'#fff':'var(--gray5)';
    b.style.borderColor=a?'var(--accent)':'var(--border)';
  });
  document.getElementById('period-label').textContent=name;
  const dbg=document.getElementById('debug-panel');
  document.getElementById('debug-cols').textContent=(sheet.headers||[]).filter(h=>h).join(' · ');
  dbg.style.display=activeRows.length===0?'block':'none';
  buildDashboard(activeRows);
}

// ══════════════════════════════════════════════════════════
//  PARSE ROWS
// ══════════════════════════════════════════════════════════
function col(row,...cands){
  for(const c of cands){
    for(const k of Object.keys(row)){
      const kn=k.trim().toLowerCase().replace(/[^a-z0-9]/g,'');
      const cn=c.toLowerCase().replace(/[^a-z0-9]/g,'');
      if(kn.includes(cn)){const v=row[k];if(v!==''&&v!==null&&v!==undefined)return String(v).trim();}
    }
  }
  return '';
}

const MONTHS_S=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function formatDate(raw){
  if(!raw)return'';
  if(raw instanceof Date&&!isNaN(raw)){const d=raw;return String(d.getDate()).padStart(2,'0')+'-'+MONTHS_S[d.getMonth()]+'-'+String(d.getFullYear()).slice(-2);}
  const s=String(raw).trim();
  if(/^\d{4,6}$/.test(s)){const d=new Date(Math.round((parseFloat(s)-25569)*86400*1000));if(!isNaN(d))return String(d.getDate()).padStart(2,'0')+'-'+MONTHS_S[d.getMonth()]+'-'+String(d.getFullYear()).slice(-2);}
  const parsed=new Date(s);
  if(!isNaN(parsed)&&s.length>5)return String(parsed.getDate()).padStart(2,'0')+'-'+MONTHS_S[parsed.getMonth()]+'-'+String(parsed.getFullYear()).slice(-2);
  const parts=s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if(parts){const day=parseInt(parts[1]),mon=parseInt(parts[2])-1,yr=parseInt(parts[3]),fy=yr<100?2000+yr:yr;if(mon>=0&&mon<12)return String(day).padStart(2,'0')+'-'+MONTHS_S[mon]+'-'+String(fy).slice(-2);}
  const dateOnly=s.match(/\d{1,2}[\/\-\.]\d{1,2}/);
  if(dateOnly)return dateOnly[0];
  return s;
}

function parseRows(raw){
  return raw.map((r,i)=>({
    ser:i+1,
    dept:col(r,'Dir./Dept','Dir/Dept','Dept','Dir','Department'),
    caseNo:col(r,'Case No','CaseNo','Case','CSD','ASD'),
    fleet:col(r,'Fleet TYPE','Fleet Type','Fleet'),
    reg:col(r,'Reg. No','Reg.No','RegNo','Reg'),
    ata:col(r,'ATA'),
    desc:col(r,'Description','Desc'),
    response:col(r,'Response'),
    dateRec:formatDate(col(r,'Date Received','DateReceived','Date')),
    status:inferStatus(col(r,'Response')),
  })).filter(r=>r.caseNo||r.desc);
}

function inferStatus(resp){
  if(!resp)return'unresolved';
  if(/postponed|deferred|pending|await/i.test(resp))return'deferred';
  const ticks=(resp.match(/✓/g)||[]).length;
  const crosses=(resp.match(/✗/g)||[]).length;
  if(crosses===0&&ticks>0)return'resolved';
  if(ticks>0&&crosses>0)return'partial';
  return'unresolved';
}

function expandDepts(str){
  if(!str)return['Unknown'];
  const s=str.trim();
  const arrow=s.match(/^(.+?)\s*(?:→|->|>)\s*(.+)$/);
  if(arrow)return[arrow[2].trim()];
  if(s.includes('&')){const p=s.split('&').map(x=>x.trim()).filter(Boolean);if(p.length>=2)return p;}
  return[s];
}

function parseResponseBadges(response){
  if(!response)return[];
  const badges=[];
  const re=/([A-Za-z0-9\/&]+)\s*(✓|✗)/g;
  let m;
  while((m=re.exec(response))!==null)badges.push({dept:m[1].trim(),ok:m[2]==='✓'});
  return badges;
}

// ══════════════════════════════════════════════════════════
//  BUILD DASHBOARD
// ══════════════════════════════════════════════════════════
function buildDashboard(rows){
  buildKPIs(rows);buildDeptBars(rows);buildFleetBars(rows);buildDonut(rows);
  buildRCBReport(rows);buildFilters(rows);renderTable(rows);
}

function buildKPIs(rows){
  const total=rows.length,resolved=rows.filter(r=>r.status==='resolved').length,
    partial=rows.filter(r=>r.status==='partial').length,
    deferred=rows.filter(r=>r.status==='deferred').length,
    unresolved=rows.filter(r=>r.status==='unresolved').length;
  const pct=n=>total?Math.round(n/total*100)+'% of total':'—';
  const s=(id,v)=>document.getElementById(id).textContent=v;
  s('kpi-total',total);s('kpi-resolved',resolved);s('kpi-partial',partial);s('kpi-deferred',deferred);s('kpi-unresolved',unresolved);
  s('pct-resolved',pct(resolved));s('pct-partial',pct(partial));s('pct-deferred',pct(deferred));s('pct-unresolved',pct(unresolved));
}

function buildDeptBars(rows){
  const counts={};
  rows.forEach(r=>expandDepts(r.dept).forEach(d=>{counts[d]=(counts[d]||0)+1;}));
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;
  document.getElementById('dept-bars').innerHTML=sorted.map(([d,n])=>
    `<div><div class="bar-meta"><span class="bar-name">${d}</span><span class="bar-count">${n}</span></div>
     <div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%;background:var(--accent)"></div></div></div>`
  ).join('');
}

function buildFleetBars(rows){
  const counts={};
  rows.forEach(r=>{const f=r.fleet||'Unknown';counts[f]=(counts[f]||0)+1;});
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;
  document.getElementById('fleet-bars').innerHTML=sorted.map(([f,n])=>
    `<div><div class="bar-meta"><span class="bar-name">${f}</span><span class="bar-count">${n}</span></div>
     <div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%;background:var(--ea-red)"></div></div></div>`
  ).join('');
}

const DC={resolved:'#1a7a3f',partial:'#b8860b',deferred:'#c45c00',unresolved:'#b30000'};
const DL={resolved:'RECEIVED',partial:'PARTIAL',deferred:'POSTPONED',unresolved:'NOT RECEIVED'};
function buildDonut(rows){
  const total=rows.length||1;
  const counts={resolved:0,partial:0,deferred:0,unresolved:0};
  rows.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
  const R=48,CX=60,CY=60,SW=18,circ=2*Math.PI*R;
  let offset=0;
  const arcs=document.getElementById('donut-arcs');
  const leg=document.getElementById('donut-legend');
  arcs.innerHTML='';leg.innerHTML='';
  Object.entries(counts).forEach(([s,n])=>{
    const frac=n/total,dash=frac*circ,gap=circ-dash,rot=offset/total*360-90;
    if(n)arcs.innerHTML+=`<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${DC[s]}" stroke-width="${SW}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="0" transform="rotate(${rot} ${CX} ${CY})"/>`;
    offset+=n;
    leg.innerHTML+=`<div class="leg-row"><div class="leg-dot" style="background:${DC[s]}"></div><span class="leg-lbl">${DL[s]}</span><span class="leg-val">${n} (${Math.round(frac*100)}%)</span></div>`;
  });
}

// ══════════════════════════════════════════════════════════
//  RCB REPORT
// ══════════════════════════════════════════════════════════
let rcbDeptOrder=[];

// Parse response per-dept: "B ✓ | A ✗" → {B:'resolved', A:'unresolved'}
function parseResponsePerDept(response){
  const map={};
  if(!response)return map;
  const re=/([A-Za-z0-9\/&]+)\s*(✓|✗)/g;
  let m;
  while((m=re.exec(response))!==null){
    const d=m[1].trim();
    map[d]=m[2]==='✓'?'resolved':'unresolved';
  }
  return map;
}

function buildRCBReport(rows){
  const dOpen={},dRecv={},dPost={};

  rows.forEach(r=>{
    if(/postponed|deferred|pending/i.test(r.response||'')){
      // POSTPONED — assign to all expanded depts
      expandDepts(r.dept).forEach(d=>{
        if(!dOpen[d]){dOpen[d]=[];dRecv[d]=[];dPost[d]=[];}
        dPost[d].push(r);
      });
      return;
    }

    const perDept=parseResponsePerDept(r.response);
    const hasBadges=Object.keys(perDept).length>0;

    if(hasBadges){
      // Use per-dept response to assign correctly
      Object.entries(perDept).forEach(([d,st])=>{
        if(!dOpen[d]){dOpen[d]=[];dRecv[d]=[];dPost[d]=[];}
        if(st==='resolved') dRecv[d].push({...r,_deptStatus:'resolved'});
        else                dOpen[d].push({...r,_deptStatus:'unresolved'});
      });
    } else {
      // No badges — use overall status + expandDepts
      expandDepts(r.dept).forEach(d=>{
        if(!dOpen[d]){dOpen[d]=[];dRecv[d]=[];dPost[d]=[];}
        if(r.status==='resolved')       dRecv[d].push(r);
        else if(r.status==='deferred')  dPost[d].push(r);
        else                            dOpen[d].push(r);
      });
    }
  });

  const allDepts=[...new Set([...Object.keys(dOpen),...Object.keys(dRecv),...Object.keys(dPost)])];
  const newD=allDepts.filter(d=>!rcbDeptOrder.includes(d));
  rcbDeptOrder=rcbDeptOrder.filter(d=>allDepts.includes(d)).concat(newD.sort());
  renderRCBTable(rcbDeptOrder,dOpen,dRecv,dPost);
  document.getElementById('export-rcb-btn').onclick=()=>{
    const csv=['Department,Status,Count,Case Numbers'];
    rcbDeptOrder.forEach(d=>{
      csv.push(`${d},OPEN,${(dOpen[d]||[]).length},"${(dOpen[d]||[]).map(r=>r.caseNo).join(' | ')}"`);
      csv.push(`${d},RECEIVED,${(dRecv[d]||[]).length},"${(dRecv[d]||[]).map(r=>r.caseNo).join(' | ')}"`);
      csv.push(`${d},POSTPONED,${(dPost[d]||[]).length},"${(dPost[d]||[]).map(r=>r.caseNo).join(' | ')}"`);
    });
    dlCSV(csv.join('\n'),`OIDA_${activeSheet}_RCB.csv`);
  };
}

function getDecBadge(caseNo){
  const rec=currentRecs[caseKey(caseNo)];
  if(!rec||!rec.decision)return'';
  const map={closed:['dec-closed','CLOSED'],open:['dec-open','OPEN'],future:['dec-future','CARRY OVER']};
  const[cls,lbl]=map[rec.decision]||['dec-none','—'];
  return`<span class="dec-badge ${cls}">${lbl}</span>`;
}

// Case order overrides per dept-row: { "A-open": [caseNo,...], "B-recv": [...] }
const caseOrderOverrides={};

function saveCaseOrder(dept,row,cases){
  caseOrderOverrides[dept+'-'+row]=cases.map(r=>r.caseNo);
}

function applyCaseOrder(dept,row,cases){
  const saved=caseOrderOverrides[dept+'-'+row];
  if(!saved)return cases;
  const map=Object.fromEntries(cases.map(r=>[r.caseNo,r]));
  const ordered=saved.map(cn=>map[cn]).filter(Boolean);
  const remaining=cases.filter(r=>!saved.includes(r.caseNo));
  return [...ordered,...remaining];
}

function renderRCBTable(depts,dOpen,dRecv,dPost){
  const dash='<span style="color:var(--gray3);font-size:12px">—</span>';
  let html='';
  depts.forEach((dept,idx)=>{
    const open=applyCaseOrder(dept,'open',dOpen[dept]||[]);
    const recv=applyCaseOrder(dept,'recv',dRecv[dept]||[]);
    const post=applyCaseOrder(dept,'post',dPost[dept]||[]);
    const tagHtml=(r,cls,row)=>`<span class="rcb-tag ${cls}" draggable="true" data-caseno="${r.caseNo}" data-dept="${dept}" data-row="${row}" onclick="openModal('${r.caseNo}')" title="${r.desc||''}"><span class="drag-handle" style="font-size:10px;padding:0 3px 0 0;opacity:.4">⠿</span><span style="opacity:.5;font-size:9px;margin-right:3px">${r.ser}</span>${r.caseNo||'—'} ${getDecBadge(r.caseNo)}</span>`;
    const oTags=open.map(r=>tagHtml(r,r._deptStatus==='unresolved'||r.status==='unresolved'?'rcb-tag-open':r.status==='partial'?'rcb-tag-partial':'rcb-tag-open','open')).join('');
    const rTags=recv.map(r=>tagHtml(r,'rcb-tag-recv','recv')).join('');
    const pTags=post.map(r=>tagHtml(r,'rcb-tag-post','post')).join('');
    html+=`
    <tbody class="rcb-group" draggable="true" data-dept="${dept}" data-idx="${idx}">
      <tr>
        <td class="rcb-dept-cell" rowspan="3" style="border-bottom:2px solid var(--border)"><span class="drag-handle" title="Drag to reorder">⠿</span>${dept}</td>
        <td style="padding:7px 12px 3px"><span class="rcb-status-badge rcb-open">OPEN</span></td>
        <td style="padding:7px 12px 3px;text-align:center"><span class="rcb-count ${open.length?'rcb-cnt-open':'rcb-cnt-zero'}">${open.length}</span></td>
        <td style="padding:7px 14px 3px"><div class="rcb-cases">${oTags||dash}</div></td>
      </tr>
      <tr>
        <td style="padding:3px 12px"><span class="rcb-status-badge rcb-recv">RECEIVED</span></td>
        <td style="padding:3px 12px;text-align:center"><span class="rcb-count ${recv.length?'rcb-cnt-recv':'rcb-cnt-zero'}">${recv.length}</span></td>
        <td style="padding:3px 14px"><div class="rcb-cases">${rTags||dash}</div></td>
      </tr>
      <tr style="border-bottom:2px solid var(--border)">
        <td style="padding:3px 12px 7px"><span class="rcb-status-badge rcb-post">POSTPONED</span></td>
        <td style="padding:3px 12px 7px;text-align:center"><span class="rcb-count ${post.length?'rcb-cnt-post':'rcb-cnt-zero'}">${post.length}</span></td>
        <td style="padding:3px 14px 7px"><div class="rcb-cases">${pTags||dash}</div></td>
      </tr>
    </tbody>`;
  });

  const table=document.getElementById('rcb-table');
  table.querySelectorAll('tbody.rcb-group').forEach(b=>b.remove());
  table.insertAdjacentHTML('beforeend',html);

  // ── DEPT DRAG & DROP ──
  let dragSrc=null;
  table.querySelectorAll('tbody.rcb-group').forEach(group=>{
    group.addEventListener('dragstart',e=>{
      if(e.target.closest('.rcb-tag'))return; // let case drag handle it
      dragSrc=group;group.classList.add('dragging');e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('type','dept');
    });
    group.addEventListener('dragend',()=>{group.classList.remove('dragging');table.querySelectorAll('tbody.rcb-group').forEach(g=>g.classList.remove('drag-over'));});
    group.addEventListener('dragover',e=>{
      e.preventDefault();
      if(e.dataTransfer.types.includes('type'))return; // case drag — handled below
      if(group!==dragSrc){table.querySelectorAll('tbody.rcb-group').forEach(g=>g.classList.remove('drag-over'));group.classList.add('drag-over');}
    });
    group.addEventListener('drop',e=>{
      e.preventDefault();
      if(!dragSrc||dragSrc===group)return;
      group.classList.remove('drag-over');
      const all=[...table.querySelectorAll('tbody.rcb-group')];
      const si=all.indexOf(dragSrc),di=all.indexOf(group);
      if(si<di)group.after(dragSrc);else group.before(dragSrc);
      rcbDeptOrder=[...table.querySelectorAll('tbody.rcb-group')].map(g=>g.dataset.dept);
      dragSrc=null;
    });
  });

  // ── CASE DRAG & DROP within same dept row ──
  let caseDragSrc=null;

  table.querySelectorAll('.rcb-tag[draggable]').forEach(tag=>{
    tag.addEventListener('dragstart',e=>{
      e.stopPropagation();
      caseDragSrc=tag;
      tag.style.opacity='.4';
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('type','case');
      e.dataTransfer.setData('caseno', tag.dataset.caseno);
      e.dataTransfer.setData('dept',   tag.dataset.dept);
      e.dataTransfer.setData('row',    tag.dataset.row);
    });
    tag.addEventListener('dragend',()=>{
      if(caseDragSrc)caseDragSrc.style.opacity='1';
      caseDragSrc=null;
      table.querySelectorAll('.rcb-tag.case-drag-over').forEach(t=>t.classList.remove('case-drag-over'));
    });
    tag.addEventListener('dragover',e=>{
      e.preventDefault(); e.stopPropagation();
      if(!caseDragSrc||caseDragSrc===tag)return;
      // Only allow within same dept + same row
      if(tag.dataset.dept!==caseDragSrc.dataset.dept)return;
      if(tag.dataset.row!==caseDragSrc.dataset.row)return;
      table.querySelectorAll('.rcb-tag.case-drag-over').forEach(t=>t.classList.remove('case-drag-over'));
      tag.classList.add('case-drag-over');
    });
    tag.addEventListener('drop',e=>{
      e.preventDefault(); e.stopPropagation();
      if(!caseDragSrc||caseDragSrc===tag)return;
      if(tag.dataset.dept!==caseDragSrc.dataset.dept)return;
      if(tag.dataset.row!==caseDragSrc.dataset.row)return;

      // Reorder in DOM
      const container=tag.parentElement;
      const allTags=[...container.querySelectorAll('.rcb-tag')];
      const si=allTags.indexOf(caseDragSrc), di=allTags.indexOf(tag);
      if(si<di) tag.after(caseDragSrc); else tag.before(caseDragSrc);

      // Save new order
      const dept=tag.dataset.dept, row=tag.dataset.row;
      const newOrder=[...container.querySelectorAll(`.rcb-tag[data-dept="${dept}"][data-row="${row}"]`)]
        .map(t=>t.dataset.caseno);
      caseOrderOverrides[dept+'-'+row]=newOrder;

      tag.classList.remove('case-drag-over');
    });
  });
}

// ══════════════════════════════════════════════════════════
//  ALL CASES TABLE
// ══════════════════════════════════════════════════════════
function buildFilters(rows){
  const deptSet=new Set();
  rows.forEach(r=>expandDepts(r.dept).forEach(d=>deptSet.add(d)));
  const depts=[...deptSet].sort();
  const fleets=[...new Set(rows.map(r=>r.fleet).filter(Boolean))].sort();
  document.getElementById('filter-dept').innerHTML='<option value="">All Departments</option>'+depts.map(d=>`<option>${d}</option>`).join('');
  document.getElementById('filter-fleet').innerHTML='<option value="">All Fleets</option>'+fleets.map(f=>`<option>${f}</option>`).join('');
  ['filter-dept','filter-status','filter-fleet','filter-search'].forEach(id=>{const el=document.getElementById(id);el.onchange=el.oninput=applyFilters;});
  document.getElementById('export-all-btn').onclick=()=>{
    const filtered=getFiltered();
    const csv=[['Ser','Department','Case No','Fleet','Reg No','ATA','Description','Status','Decision','Date'].join(','),
      ...filtered.map(r=>{const rec=currentRecs[caseKey(r.caseNo)];const dec=rec?rec.decision:'';return[r.ser,r.dept,r.caseNo,r.fleet,r.reg,r.ata,`"${(r.desc||'').replace(/"/g,'""')}"`,r.status,dec,r.dateRec].join(',');})
    ];
    dlCSV(csv.join('\n'),`OIDA_${activeSheet}_cases.csv`);
  };
}

function getFiltered(){
  const dept=document.getElementById('filter-dept').value;
  const status=document.getElementById('filter-status').value;
  const fleet=document.getElementById('filter-fleet').value;
  const search=document.getElementById('filter-search').value.toLowerCase();
  return activeRows.filter(r=>{
    if(dept&&!expandDepts(r.dept).includes(dept))return false;
    if(status&&r.status!==status)return false;
    if(fleet&&r.fleet!==fleet)return false;
    if(search&&!(r.desc+r.caseNo).toLowerCase().includes(search))return false;
    return true;
  });
}

function applyFilters(){renderTable(getFiltered());}

function pillHtml(s){
  const m={resolved:['p-resolved','RECEIVED'],partial:['p-partial','PARTIAL'],deferred:['p-deferred','POSTPONED'],unresolved:['p-unresolved','NOT RECEIVED']};
  const[cls,lbl]=m[s]||['p-unresolved','Unknown'];
  return`<span class="pill ${cls}">${lbl}</span>`;
}

function renderTable(rows){
  const tbody=document.getElementById('case-tbody');
  if(!rows.length){tbody.innerHTML='<tr><td colspan="11" class="empty-state">No cases match.</td></tr>';return;}
  tbody.innerHTML=rows.map(r=>{
    const statusCell=r.status==='partial'
      ?`<div style="display:flex;flex-direction:column;gap:4px">${pillHtml(r.status)}<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px">${parseResponseBadges(r.response).map(b=>`<span class="resp-badge ${b.ok?'resp-badge-yes':'resp-badge-no'}">${b.dept}${b.ok?'✓':'✗'}</span>`).join('')}</div></div>`
      :pillHtml(r.status);
    const rec=currentRecs[caseKey(r.caseNo)];
    const decCell=rec&&rec.decision?`<span class="dec-badge ${rec.decision==='closed'?'dec-closed':rec.decision==='future'?'dec-future':'dec-open'}">${rec.decision==='closed'?'CLOSED':rec.decision==='future'?'CARRY OVER':'OPEN'}</span>`:'<span class="dec-badge dec-none">—</span>';
    return`<tr>
      <td class="td-ser">${r.ser}</td>
      <td><span class="dept-tag">${r.dept||'—'}</span></td>
      <td class="td-case">${r.caseNo||'—'}</td>
      <td>${r.fleet||'—'}</td>
      <td>${r.reg||'—'}</td>
      <td style="text-align:center;font-weight:600;color:var(--accent)">${r.ata||'—'}</td>
      <td class="td-desc">${r.desc||'—'}</td>
      <td>${statusCell}</td>
      <td>${decCell}</td>
      <td style="white-space:nowrap;font-size:11px;color:var(--gray4)">${r.dateRec||'—'}</td>
      <td><button class="btn-secondary" style="padding:3px 10px;font-size:11px;" onclick="openModal('${r.caseNo}')">✏ Edit</button></td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  RECOMMENDATION MODAL
// ══════════════════════════════════════════════════════════
let modalCaseNo='';
let tempAttachments=[];

function openModal(caseNo){
  rcbModalMode=false;
  modalCaseNo=caseNo;
  const row=activeRows.find(r=>r.caseNo===caseNo)||{};
  const rec=currentRecs[caseKey(caseNo)]||{};
  document.getElementById('modal-case-title').textContent=`Case: ${caseNo}`;
  document.getElementById('modal-case-sub').textContent=`${row.dept||''} · ${row.fleet||''} ${row.reg||''} · ATA ${row.ata||''} · ${row.dateRec||''}`;
  document.getElementById('rec-tech-support').value=rec.techSupport||'';
  document.getElementById('rec-tech-services').value=rec.techServices||'';
  document.getElementById('rec-decision').value=rec.decision||'';
  document.getElementById('rec-closed-note').value=rec.closedNote||'';
  document.getElementById('rec-carry-month').value=rec.carryMonth||'';
  document.getElementById('rec-carry-note').value=rec.carryNote||'';
  tempAttachments=[...(rec.attachments||[])];
  // Populate dept dropdown for carry-over
  const deptSel=document.getElementById('rec-carry-dept');
  const allDepts=[...new Set(activeRows.flatMap(r=>expandDepts(r.dept)))].sort();
  deptSel.innerHTML='<option value="">— Same as current —</option>'+allDepts.map(d=>`<option value="${d}" ${rec.carryDept===d?'selected':''}>${d}</option>`).join('');
  toggleDecisionFields();
  renderAttachments();
  document.getElementById('rec-modal').classList.add('open');
}

function closeModal(){document.getElementById('rec-modal').classList.remove('open');}

function toggleDecisionFields(){
  const v=document.getElementById('rec-decision').value;
  document.getElementById('decision-closed-fields').style.display=v==='closed'?'block':'none';
  document.getElementById('decision-future-fields').style.display=v==='future'?'block':'none';
}

function addAttachment(){
  const input=document.getElementById('att-path-input');
  const path=input.value.trim();
  if(!path)return;
  const name=path.split(/[\\/]/).pop();
  const ext=(name.split('.').pop()||'').toLowerCase();
  const icon=ext==='pdf'?'📄':ext==='docx'||ext==='doc'?'📝':ext==='xlsx'||ext==='xls'?'📊':ext==='png'||ext==='jpg'||ext==='jpeg'?'🖼':'📁';
  tempAttachments.push({path,name,icon});
  input.value='';
  renderAttachments();
}

function removeAttachment(idx){
  tempAttachments.splice(idx,1);
  renderAttachments();
}

function renderAttachments(){
  const list=document.getElementById('att-list');
  if(!tempAttachments.length){list.innerHTML='<div style="font-size:12px;color:var(--gray4)">No attachments yet.</div>';return;}
  list.innerHTML=tempAttachments.map((a,i)=>`
    <div class="att-item">
      <span class="att-icon">${a.icon}</span>
      <span class="att-name">${a.name}</span>
      <span class="att-note">${a.path}</span>
      <button class="att-remove" onclick="removeAttachment(${i})">✕</button>
    </div>`).join('');
}

async function saveRecommendation(){
  // Determine which module's caseKey/monthKey to use
  const ck  = rcbModalMode ? rcbCaseKey(modalCaseNo)  : caseKey(modalCaseNo);
  const mKey= rcbModalMode ? rcbMonthKey()            : monthKey();
  const rec={
    caseKey:ck, caseNo:modalCaseNo, monthKey:mKey,
    techSupport:document.getElementById('rec-tech-support').value.trim(),
    techServices:document.getElementById('rec-tech-services').value.trim(),
    decision:document.getElementById('rec-decision').value,
    closedNote:document.getElementById('rec-closed-note').value.trim(),
    carryMonth:document.getElementById('rec-carry-month').value,
    carryDept:document.getElementById('rec-carry-dept').value,
    carryNote:document.getElementById('rec-carry-note').value.trim(),
    attachments:tempAttachments,
    savedAt:new Date().toISOString(),
  };
  await dbPut('recommendations',rec);
  if(rcbModalMode){
    rcbCurrentRecs[ck]=rec;
    closeModal();
    rcbBuildStatusTable(rcbActiveRows);
    rcbRenderTable(rcbGetFiltered());
  } else {
    currentRecs[ck]=rec;
    closeModal();
    buildRCBReport(activeRows);
    renderTable(getFiltered());
  }
}

// Close modal on overlay click
document.getElementById('rec-modal').addEventListener('click',function(e){if(e.target===this)closeModal();});

// ══════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════
function dlCSV(csv,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=name;a.click();
}

// ══════════════════════════════════════════════════════════
//  RCB MODULE — independent clone of OIDA logic
// ══════════════════════════════════════════════════════════
let rcbAllSheets={}, rcbActiveSheet='', rcbActiveRows=[];
let rcbCurrentRecs={};
let rcbStatusDeptOrder=[];

function rcbMonthKey(){ return 'rcb-'+selYear+'-'+selMonth; }
function rcbCaseKey(caseNo){ return rcbMonthKey()+'-'+caseNo; }

function triggerRCBUpload(){ document.getElementById('rcb-file-input').click(); }

// Open RCB module
async function openRCBModule(){
  document.getElementById('bc4').textContent='RCB';
  document.getElementById('bc4').style.display='';
  document.getElementById('bc4-sep').style.display='';
  document.getElementById('rcb-title').textContent=`RCB – ${MONTHS[selMonth]} ${selYear}`;

  const saved = await dbGet('months', rcbMonthKey());
  const allRecs = await dbGetAll('recommendations');
  rcbCurrentRecs={};
  allRecs.filter(r=>r.caseKey.startsWith(rcbMonthKey()+'-')).forEach(r=>{rcbCurrentRecs[r.caseKey]=r;});

  if(saved){
    rcbAllSheets=saved.sheets;
    const names=Object.keys(rcbAllSheets);
    rcbBuildSheetTabs(names);
    rcbSelectSheet(names[0]);
    document.getElementById('rcb-upload-zone').style.display='none';
    document.getElementById('rcb-content').style.display='block';
  } else {
    rcbAllSheets={}; rcbActiveSheet=''; rcbActiveRows=[];
    document.getElementById('rcb-content').style.display='none';
    document.getElementById('rcb-upload-zone').style.display='block';
  }
  showScreen('screen-rcb');
}

// File upload
document.getElementById('rcb-file-input').addEventListener('change', async function(e){
  const file=e.target.files[0]; if(!file)return;
  document.getElementById('loader').classList.add('on');
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const wb=XLSX.read(ev.target.result,{type:'array',cellText:true,cellDates:true});
      rcbAllSheets={};
      const KW=['ser','dept','dir','case','ata','description','fleet','response'];
      wb.SheetNames.forEach(sn=>{
        const ws=wb.Sheets[sn];
        const raw2d=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let hIdx=0;
        for(let i=0;i<Math.min(raw2d.length,12);i++){
          if(KW.filter(k=>raw2d[i].join(' ').toLowerCase().includes(k)).length>=3){hIdx=i;break;}
        }
        const headers=raw2d[hIdx].map(h=>String(h).trim());
        const dataRows=raw2d.slice(hIdx+1).map(row=>{
          const obj={};headers.forEach((h,i)=>{obj[h]=row[i]!==undefined?row[i]:'';});return obj;
        }).filter(r=>Object.values(r).some(v=>v!==''&&v!==null));
        if(dataRows.length>0)rcbAllSheets[sn]={rows:dataRows,headers};
      });
      const names=Object.keys(rcbAllSheets);
      if(!names.length)throw new Error('No data found in file.');
      await dbPut('months',{key:rcbMonthKey(),sheets:rcbAllSheets,fileName:file.name,savedAt:new Date().toISOString()});
      rcbBuildSheetTabs(names);
      rcbSelectSheet(names[0]);
      document.getElementById('rcb-upload-zone').style.display='none';
      document.getElementById('rcb-content').style.display='block';
    }catch(err){alert('Could not read file:\n'+err.message);}
    document.getElementById('loader').classList.remove('on');
  };
  reader.readAsArrayBuffer(file);
});

// Sheet tabs
function rcbBuildSheetTabs(names){
  const wrap=document.getElementById('rcb-sheet-tabs-wrap');
  const tabs=document.getElementById('rcb-sheet-tabs');
  tabs.innerHTML='';
  if(names.length>1){
    wrap.style.display='block';
    names.forEach(n=>{
      const b=document.createElement('button');
      b.textContent=n;
      b.style.cssText='padding:5px 16px;border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:var(--white);color:var(--gray5);font-family:inherit;transition:all .15s;';
      b.onclick=()=>rcbSelectSheet(n); b.dataset.name=n; tabs.appendChild(b);
    });
  } else { wrap.style.display='none'; }
}

function rcbSelectSheet(name){
  rcbActiveSheet=name;
  const sheet=rcbAllSheets[name];
  rcbActiveRows=parseRows(sheet.rows); // reuse same parser as OIDA
  document.querySelectorAll('#rcb-sheet-tabs button').forEach(b=>{
    const a=b.dataset.name===name;
    b.style.background=a?'var(--accent)':'var(--white)';
    b.style.color=a?'#fff':'var(--gray5)';
    b.style.borderColor=a?'var(--accent)':'var(--border)';
  });
  document.getElementById('rcb-period-label').textContent=name;
  const dbg=document.getElementById('rcb-debug-panel');
  document.getElementById('rcb-debug-cols').textContent=(sheet.headers||[]).filter(h=>h).join(' · ');
  dbg.style.display=rcbActiveRows.length===0?'block':'none';
  rcbBuildDashboard(rcbActiveRows);
}

// Dashboard
function rcbBuildDashboard(rows){
  rcbBuildKPIs(rows); rcbBuildDeptBars(rows); rcbBuildFleetBars(rows);
  rcbBuildDonut(rows); rcbBuildStatusTable(rows); rcbBuildFilters(rows); rcbRenderTable(rows);
}

function rcbBuildKPIs(rows){
  const total=rows.length,
    resolved=rows.filter(r=>r.status==='resolved').length,
    partial=rows.filter(r=>r.status==='partial').length,
    deferred=rows.filter(r=>r.status==='deferred').length,
    unresolved=rows.filter(r=>r.status==='unresolved').length;
  const pct=n=>total?Math.round(n/total*100)+'% of total':'—';
  const s=(id,v)=>document.getElementById(id).textContent=v;
  s('rcb-kpi-total',total); s('rcb-kpi-resolved',resolved); s('rcb-kpi-partial',partial);
  s('rcb-kpi-deferred',deferred); s('rcb-kpi-unresolved',unresolved);
  s('rcb-pct-resolved',pct(resolved)); s('rcb-pct-partial',pct(partial));
  s('rcb-pct-deferred',pct(deferred)); s('rcb-pct-unresolved',pct(unresolved));
}

function rcbBuildDeptBars(rows){
  const counts={};
  rows.forEach(r=>expandDepts(r.dept).forEach(d=>{counts[d]=(counts[d]||0)+1;}));
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;
  document.getElementById('rcb-dept-bars').innerHTML=sorted.map(([d,n])=>
    `<div><div class="bar-meta"><span class="bar-name">${d}</span><span class="bar-count">${n}</span></div>
     <div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%;background:var(--accent)"></div></div></div>`
  ).join('');
}

function rcbBuildFleetBars(rows){
  const counts={};
  rows.forEach(r=>{const f=r.fleet||'Unknown';counts[f]=(counts[f]||0)+1;});
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;
  document.getElementById('rcb-fleet-bars').innerHTML=sorted.map(([f,n])=>
    `<div><div class="bar-meta"><span class="bar-name">${f}</span><span class="bar-count">${n}</span></div>
     <div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%;background:var(--ea-red)"></div></div></div>`
  ).join('');
}

function rcbBuildDonut(rows){
  const total=rows.length||1;
  const counts={resolved:0,partial:0,deferred:0,unresolved:0};
  rows.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
  const R=48,CX=60,CY=60,SW=18,circ=2*Math.PI*R;
  let offset=0;
  const arcs=document.getElementById('rcb-donut-arcs');
  const leg=document.getElementById('rcb-donut-legend');
  arcs.innerHTML=''; leg.innerHTML='';
  Object.entries(counts).forEach(([s,n])=>{
    const frac=n/total,dash=frac*circ,gap=circ-dash,rot=offset/total*360-90;
    if(n)arcs.innerHTML+=`<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${DC[s]}" stroke-width="${SW}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="0" transform="rotate(${rot} ${CX} ${CY})"/>`;
    offset+=n;
    leg.innerHTML+=`<div class="leg-row"><div class="leg-dot" style="background:${DC[s]}"></div><span class="leg-lbl">${DL[s]}</span><span class="leg-val">${n} (${Math.round(frac*100)}%)</span></div>`;
  });
}

function rcbGetDecBadge(caseNo){
  const rec=rcbCurrentRecs[rcbCaseKey(caseNo)];
  if(!rec||!rec.decision)return'';
  const map={closed:['dec-closed','CLOSED'],open:['dec-open','OPEN'],future:['dec-future','CARRY OVER']};
  const[cls,lbl]=map[rec.decision]||['dec-none','—'];
  return`<span class="dec-badge ${cls}">${lbl}</span>`;
}

function rcbBuildStatusTable(rows){
  const dOpen={},dRecv={},dPost={};
  rows.forEach(r=>{
    expandDepts(r.dept).forEach(d=>{
      if(!dOpen[d]){dOpen[d]=[];dRecv[d]=[];dPost[d]=[];}
      if(r.status==='resolved')dRecv[d].push(r);
      else if(r.status==='deferred')dPost[d].push(r);
      else dOpen[d].push(r);
    });
  });
  const allDepts=[...new Set([...Object.keys(dOpen),...Object.keys(dRecv),...Object.keys(dPost)])];
  const newD=allDepts.filter(d=>!rcbStatusDeptOrder.includes(d));
  rcbStatusDeptOrder=rcbStatusDeptOrder.filter(d=>allDepts.includes(d)).concat(newD.sort());

  const dash='<span style="color:var(--gray3);font-size:12px">—</span>';
  let html='';
  rcbStatusDeptOrder.forEach((dept,idx)=>{
    const open=dOpen[dept]||[],recv=dRecv[dept]||[],post=dPost[dept]||[];
    const tagHtml=(r,cls)=>`<span class="rcb-tag ${cls}" onclick="rcbOpenModal('${r.caseNo}')" title="${r.desc||''}"><span style="opacity:.5;font-size:9px;margin-right:3px">${r.ser}</span>${r.caseNo||'—'} ${rcbGetDecBadge(r.caseNo)}</span>`;
    const oTags=open.map(r=>tagHtml(r,r.status==='partial'?'rcb-tag-partial':'rcb-tag-open')).join('');
    const rTags=recv.map(r=>tagHtml(r,'rcb-tag-recv')).join('');
    const pTags=post.map(r=>tagHtml(r,'rcb-tag-post')).join('');
    html+=`
    <tbody class="rcb-status-group" draggable="true" data-dept="${dept}">
      <tr>
        <td class="rcb-dept-cell" rowspan="3" style="border-bottom:2px solid var(--border)"><span class="drag-handle">⠿</span>${dept}</td>
        <td style="padding:7px 12px 3px"><span class="rcb-status-badge rcb-open">OPEN</span></td>
        <td style="padding:7px 12px 3px;text-align:center"><span class="rcb-count ${open.length?'rcb-cnt-open':'rcb-cnt-zero'}">${open.length}</span></td>
        <td style="padding:7px 14px 3px"><div class="rcb-cases">${oTags||dash}</div></td>
      </tr>
      <tr>
        <td style="padding:3px 12px"><span class="rcb-status-badge rcb-recv">RECEIVED</span></td>
        <td style="padding:3px 12px;text-align:center"><span class="rcb-count ${recv.length?'rcb-cnt-recv':'rcb-cnt-zero'}">${recv.length}</span></td>
        <td style="padding:3px 14px"><div class="rcb-cases">${rTags||dash}</div></td>
      </tr>
      <tr style="border-bottom:2px solid var(--border)">
        <td style="padding:3px 12px 7px"><span class="rcb-status-badge rcb-post">POSTPONED</span></td>
        <td style="padding:3px 12px 7px;text-align:center"><span class="rcb-count ${post.length?'rcb-cnt-post':'rcb-cnt-zero'}">${post.length}</span></td>
        <td style="padding:3px 14px 7px"><div class="rcb-cases">${pTags||dash}</div></td>
      </tr>
    </tbody>`;
  });

  const table=document.getElementById('rcb-status-table');
  table.querySelectorAll('tbody.rcb-status-group').forEach(b=>b.remove());
  table.insertAdjacentHTML('beforeend',html);

  // Drag & drop
  let dragSrc=null;
  table.querySelectorAll('tbody.rcb-status-group').forEach(group=>{
    group.addEventListener('dragstart',e=>{dragSrc=group;group.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    group.addEventListener('dragend',()=>{group.classList.remove('dragging');table.querySelectorAll('tbody.rcb-status-group').forEach(g=>g.classList.remove('drag-over'));});
    group.addEventListener('dragover',e=>{e.preventDefault();if(group!==dragSrc){table.querySelectorAll('tbody.rcb-status-group').forEach(g=>g.classList.remove('drag-over'));group.classList.add('drag-over');}});
    group.addEventListener('drop',e=>{
      e.preventDefault();if(!dragSrc||dragSrc===group)return;
      group.classList.remove('drag-over');
      const all=[...table.querySelectorAll('tbody.rcb-status-group')];
      if(all.indexOf(dragSrc)<all.indexOf(group))group.after(dragSrc);else group.before(dragSrc);
      rcbStatusDeptOrder=[...table.querySelectorAll('tbody.rcb-status-group')].map(g=>g.dataset.dept);
    });
  });

  document.getElementById('rcb-export-status-btn').onclick=()=>{
    const csv=['Department,Status,Count,Case Numbers'];
    rcbStatusDeptOrder.forEach(d=>{
      csv.push(`${d},OPEN,${(dOpen[d]||[]).length},"${(dOpen[d]||[]).map(r=>r.caseNo).join(' | ')}"`);
      csv.push(`${d},RECEIVED,${(dRecv[d]||[]).length},"${(dRecv[d]||[]).map(r=>r.caseNo).join(' | ')}"`);
      csv.push(`${d},POSTPONED,${(dPost[d]||[]).length},"${(dPost[d]||[]).map(r=>r.caseNo).join(' | ')}"`);
    });
    dlCSV(csv.join('\n'),`RCB_${rcbActiveSheet}_Status.csv`);
  };
}

// Filters
function rcbBuildFilters(rows){
  const deptSet=new Set();
  rows.forEach(r=>expandDepts(r.dept).forEach(d=>deptSet.add(d)));
  document.getElementById('rcb-filter-dept').innerHTML='<option value="">All Departments</option>'+[...deptSet].sort().map(d=>`<option>${d}</option>`).join('');
  document.getElementById('rcb-filter-fleet').innerHTML='<option value="">All Fleets</option>'+[...new Set(rows.map(r=>r.fleet).filter(Boolean))].sort().map(f=>`<option>${f}</option>`).join('');
  ['rcb-filter-dept','rcb-filter-status','rcb-filter-fleet','rcb-filter-search'].forEach(id=>{
    const el=document.getElementById(id); el.onchange=el.oninput=rcbApplyFilters;
  });
  document.getElementById('rcb-export-all-btn').onclick=()=>{
    const filtered=rcbGetFiltered();
    const csv=[['Ser','Department','Case No','Fleet','Reg No','ATA','Description','Status','Decision','Date'].join(','),
      ...filtered.map(r=>{const rec=rcbCurrentRecs[rcbCaseKey(r.caseNo)];return[r.ser,r.dept,r.caseNo,r.fleet,r.reg,r.ata,`"${(r.desc||'').replace(/"/g,'""')}"`,r.status,rec?rec.decision:'',r.dateRec].join(',');})
    ];
    dlCSV(csv.join('\n'),`RCB_${rcbActiveSheet}_cases.csv`);
  };
}

function rcbGetFiltered(){
  const dept=document.getElementById('rcb-filter-dept').value;
  const status=document.getElementById('rcb-filter-status').value;
  const fleet=document.getElementById('rcb-filter-fleet').value;
  const search=document.getElementById('rcb-filter-search').value.toLowerCase();
  return rcbActiveRows.filter(r=>{
    if(dept&&!expandDepts(r.dept).includes(dept))return false;
    if(status&&r.status!==status)return false;
    if(fleet&&r.fleet!==fleet)return false;
    if(search&&!(r.desc+r.caseNo).toLowerCase().includes(search))return false;
    return true;
  });
}

function rcbApplyFilters(){rcbRenderTable(rcbGetFiltered());}

function rcbRenderTable(rows){
  const tbody=document.getElementById('rcb-case-tbody');
  if(!rows.length){tbody.innerHTML='<tr><td colspan="11" class="empty-state">No cases match.</td></tr>';return;}
  tbody.innerHTML=rows.map(r=>{
    const statusCell=r.status==='partial'
      ?`<div style="display:flex;flex-direction:column;gap:4px">${pillHtml(r.status)}<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px">${parseResponseBadges(r.response).map(b=>`<span class="resp-badge ${b.ok?'resp-badge-yes':'resp-badge-no'}">${b.dept}${b.ok?'✓':'✗'}</span>`).join('')}</div></div>`
      :pillHtml(r.status);
    const rec=rcbCurrentRecs[rcbCaseKey(r.caseNo)];
    const decCell=rec&&rec.decision?`<span class="dec-badge ${rec.decision==='closed'?'dec-closed':rec.decision==='future'?'dec-future':'dec-open'}">${rec.decision==='closed'?'CLOSED':rec.decision==='future'?'CARRY OVER':'OPEN'}</span>`:'<span class="dec-badge dec-none">—</span>';
    return`<tr>
      <td class="td-ser">${r.ser}</td>
      <td><span class="dept-tag">${r.dept||'—'}</span></td>
      <td class="td-case">${r.caseNo||'—'}</td>
      <td>${r.fleet||'—'}</td>
      <td>${r.reg||'—'}</td>
      <td style="text-align:center;font-weight:600;color:var(--accent)">${r.ata||'—'}</td>
      <td class="td-desc">${r.desc||'—'}</td>
      <td>${statusCell}</td>
      <td>${decCell}</td>
      <td style="white-space:nowrap;font-size:11px;color:var(--gray4)">${r.dateRec||'—'}</td>
      <td><button class="btn-secondary" style="padding:3px 10px;font-size:11px;" onclick="rcbOpenModal('${r.caseNo}')">✏ Edit</button></td>
    </tr>`;
  }).join('');
}

// Modal for RCB module (reuses same modal, different caseKey prefix)
let rcbModalMode=false;

function rcbOpenModal(caseNo){
  rcbModalMode=true;
  modalCaseNo=caseNo;
  const row=rcbActiveRows.find(r=>r.caseNo===caseNo)||{};
  const rec=rcbCurrentRecs[rcbCaseKey(caseNo)]||{};
  document.getElementById('modal-case-title').textContent=`Case: ${caseNo}`;
  document.getElementById('modal-case-sub').textContent=`${row.dept||''} · ${row.fleet||''} ${row.reg||''} · ATA ${row.ata||''} · ${row.dateRec||''}`;
  document.getElementById('rec-tech-support').value=rec.techSupport||'';
  document.getElementById('rec-tech-services').value=rec.techServices||'';
  document.getElementById('rec-decision').value=rec.decision||'';
  document.getElementById('rec-closed-note').value=rec.closedNote||'';
  document.getElementById('rec-carry-month').value=rec.carryMonth||'';
  document.getElementById('rec-carry-note').value=rec.carryNote||'';
  tempAttachments=[...(rec.attachments||[])];
  const deptSel=document.getElementById('rec-carry-dept');
  const allDepts=[...new Set(rcbActiveRows.flatMap(r=>expandDepts(r.dept)))].sort();
  deptSel.innerHTML='<option value="">— Same as current —</option>'+allDepts.map(d=>`<option value="${d}" ${rec.carryDept===d?'selected':''}>${d}</option>`).join('');
  toggleDecisionFields();
  renderAttachments();
  document.getElementById('rec-modal').classList.add('open');
}

// RCB modal save — handled via rcbModalMode flag inside saveRecommendation

// ══════════════════════════════════════════════════════════
//  GLOBAL SEARCH
// ══════════════════════════════════════════════════════════
let gsResults = [];

function highlight(text, keyword) {
  if (!keyword || !text) return text || '';
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp('(' + escaped + ')', 'gi'),
    '<span class="highlight">$1</span>');
}

function truncate(text, len) {
  if (!text) return '—';
  return text.length > len ? text.slice(0, len) + '…' : text;
}

async function runGlobalSearch() {
  const keyword  = document.getElementById('gs-keyword').value.trim().toLowerCase();
  const caseno   = document.getElementById('gs-caseno').value.trim().toLowerCase();
  const reg      = document.getElementById('gs-reg').value.trim().toLowerCase();
  const ata      = document.getElementById('gs-ata').value.trim();
  const dept     = document.getElementById('gs-dept').value.trim().toLowerCase();
  const fleet    = document.getElementById('gs-fleet').value;
  const status   = document.getElementById('gs-status').value;
  const decision = document.getElementById('gs-decision').value;
  const module   = document.getElementById('gs-module').value;
  const dateFrom = document.getElementById('gs-date-from').value.trim().toLowerCase();
  const dateTo   = document.getElementById('gs-date-to').value.trim().toLowerCase();
  const recText  = document.getElementById('gs-rec').value.trim().toLowerCase();

  document.getElementById('loader').classList.add('on');

  // Load all months from DB
  const allMonths = await dbGetAll('months');
  const allRecs   = await dbGetAll('recommendations');
  const recMap    = {};
  allRecs.forEach(r => { recMap[r.caseKey] = r; });

  gsResults = [];

  const MONTH_NAMES = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  for (const monthData of allMonths) {
    const key = monthData.key; // e.g. "2026-3" or "rcb-2026-3"
    const isRCB  = key.startsWith('rcb-');
    const modName = isRCB ? 'rcb' : 'oida';

    // Module filter
    if (module && module !== modName) continue;

    // Parse year-month from key
    const parts = isRCB ? key.replace('rcb-','').split('-') : key.split('-');
    const yr = parseInt(parts[0]);
    const mo = parseInt(parts[1]);
    const monthLabel = MONTH_NAMES[mo] + ' ' + yr;

    // Get rows from all sheets
    const sheets = monthData.sheets || {};
    for (const sheetName of Object.keys(sheets)) {
      const rows = parseRows(sheets[sheetName].rows || []);

      for (const r of rows) {
        const ck = key + '-' + r.caseNo;
        const rec = recMap[ck] || {};

        // ── FILTERS ──
        if (caseno  && !r.caseNo.toLowerCase().includes(caseno))   continue;
        if (reg     && !r.reg.toLowerCase().includes(reg))          continue;
        if (ata     && r.ata !== ata)                                continue;
        if (dept    && !expandDepts(r.dept).some(d => d.toLowerCase().includes(dept))) continue;
        if (fleet   && r.fleet !== fleet)                            continue;
        if (status  && r.status !== status)                          continue;
        if (decision && (rec.decision || '') !== decision)           continue;

        // Date range filter (simple string match on month label)
        if (dateFrom && monthLabel.toLowerCase() < dateFrom)         continue;
        if (dateTo   && monthLabel.toLowerCase() > dateTo)           continue;

        // Keyword in description
        if (keyword && !r.desc.toLowerCase().includes(keyword))      continue;

        // Recommendation text search
        const recAll = ((rec.techSupport || '') + ' ' + (rec.techServices || '')).toLowerCase();
        if (recText && !recAll.includes(recText))                     continue;

        gsResults.push({ monthLabel, yr, mo, modName, sheetName, r, rec, keyword, recText });
      }
    }
  }

  renderSearchResults(keyword, recText);
  document.getElementById('loader').classList.remove('on');
}

const STATUS_LABELS = { resolved:'RECEIVED', partial:'PARTIAL', deferred:'POSTPONED', unresolved:'NOT RECEIVED' };
const STATUS_PILLS  = { resolved:'p-resolved', partial:'p-partial', deferred:'p-deferred', unresolved:'p-unresolved' };
const DEC_LABELS    = { closed:'CLOSED', open:'OPEN', future:'CARRY OVER' };
const DEC_CLS       = { closed:'dec-closed', open:'dec-open', future:'dec-future' };

function renderSearchResults(keyword, recText) {
  const resultsDiv = document.getElementById('gsearch-results');
  const tbody      = document.getElementById('gsr-tbody');
  document.getElementById('gsr-count').textContent = gsResults.length;
  resultsDiv.style.display = 'block';

  if (!gsResults.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="no-results">No cases found matching your criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = gsResults.map((item, idx) => {
    const { monthLabel, yr, mo, modName, r, rec } = item;
    const hl = t => highlight(t, keyword);
    const hlR = t => highlight(t, recText);

    const statusPill = `<span class="pill ${STATUS_PILLS[r.status]||'p-unresolved'}">${STATUS_LABELS[r.status]||'—'}</span>`;
    const decBadge   = rec.decision
      ? `<span class="dec-badge ${DEC_CLS[rec.decision]||'dec-none'}">${DEC_LABELS[rec.decision]||'—'}</span>`
      : '<span class="dec-badge dec-none">—</span>';

    const modBadge = modName === 'rcb'
      ? '<span class="gsr-module-badge gsr-module-rcb">RCB</span>'
      : '<span class="gsr-module-badge gsr-module-oida">OIDA</span>';

    // Tech support — highlight + truncate
    const techSup = rec.techSupport
      ? `<div class="gsr-rec-section"><div class="gsr-rec-label">Tech Support</div>${hlR(truncate(rec.techSupport, 120))}</div>`
      : '';
    const techSvc = rec.techServices
      ? `<div class="gsr-rec-section"><div class="gsr-rec-label">Tech Services</div>${hlR(truncate(rec.techServices, 120))}</div>`
      : '';
    const recCell = (techSup || techSvc)
      ? `<div class="gsr-rec">${techSup}${techSvc}</div>`
      : '<span style="color:var(--gray3);font-size:11px">—</span>';

    // Attachments count
    const attCount = (rec.attachments||[]).length;
    const attBadge = attCount ? `<span style="font-size:10px;color:var(--gray4);margin-left:4px">📎${attCount}</span>` : '';

    return `<tr onclick="goToCase(${yr},${mo},'${modName}','${r.caseNo}')">
      <td><span class="gsr-month-badge">${monthLabel}</span></td>
      <td>${modBadge}</td>
      <td><span class="dept-tag">${r.dept||'—'}</span></td>
      <td class="td-case">${r.caseNo||'—'}${attBadge}</td>
      <td style="white-space:nowrap;font-size:11px">${r.fleet||'—'}<br/><span style="color:var(--gray4)">${r.reg||''}</span></td>
      <td style="text-align:center;font-weight:600;color:var(--accent)">${r.ata||'—'}</td>
      <td class="gsr-desc">${hl(truncate(r.desc, 140))}</td>
      <td>${statusPill}</td>
      <td>${decBadge}</td>
      <td class="gsr-rec">${techSup||'<span style="color:var(--gray3);font-size:11px">—</span>'}</td>
      <td class="gsr-rec">${techSvc||'<span style="color:var(--gray3);font-size:11px">—</span>'}</td>
      <td style="white-space:nowrap;font-size:11px;color:var(--gray4)">${r.dateRec||'—'}</td>
      <td><button class="btn-primary" style="padding:3px 10px;font-size:10px;white-space:nowrap" onclick="event.stopPropagation();goToCase(${yr},${mo},'${modName}','${r.caseNo}')">→ Open</button></td>
    </tr>`;
  }).join('');
}

async function goToCase(yr, mo, mod, caseNo) {
  selYear  = yr;
  selMonth = mo;
  const MONTH_NAMES_G = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const label = MONTH_NAMES_G[mo] + ' ' + yr;
  document.getElementById('modules-title').textContent = label;
  document.getElementById('oida-title').textContent = `OIDA – ${label}`;
  document.getElementById('rcb-title').textContent  = `RCB – ${label}`;
  updateBC();
  await openModule(mod);
  // After module loads, highlight the case
  setTimeout(() => {
    if (mod === 'oida') {
      document.getElementById('filter-search').value = caseNo;
      applyFilters();
    } else {
      document.getElementById('rcb-filter-search').value = caseNo;
      rcbApplyFilters();
    }
    // Scroll to All Cases table
    const tbody = document.getElementById(mod === 'oida' ? 'case-tbody' : 'rcb-case-tbody');
    if (tbody) tbody.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

function clearSearch() {
  ['gs-keyword','gs-caseno','gs-reg','gs-ata','gs-dept','gs-rec','gs-date-from','gs-date-to']
    .forEach(id => document.getElementById(id).value = '');
  ['gs-fleet','gs-status','gs-decision','gs-module']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('gsearch-results').style.display = 'none';
  gsResults = [];
}

function exportSearchResults() {
  if (!gsResults.length) return;
  const header = ['Month','Module','Department','Case No','Fleet','Reg','ATA','Description','Status','RCB Decision','Tech Support Analysis','Tech Services Recommendation','Attachments','Date'].join(',');
  const rows = gsResults.map(({ monthLabel, modName, r, rec }) => [
    monthLabel, modName.toUpperCase(), r.dept, r.caseNo, r.fleet, r.reg, r.ata,
    `"${(r.desc||'').replace(/"/g,'""')}"`,
    STATUS_LABELS[r.status]||r.status,
    DEC_LABELS[rec.decision||'']||'—',
    `"${(rec.techSupport||'').replace(/"/g,'""')}"`,
    `"${(rec.techServices||'').replace(/"/g,'""')}"`,
    (rec.attachments||[]).length,
    r.dateRec
  ].join(','));
  dlCSV([header, ...rows].join('\n'), `MRO_Search_Results_${new Date().toISOString().slice(0,10)}.csv`);
}

// Trigger search on Enter key
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('screen-home').classList.contains('active')) {
    runGlobalSearch();
  }
});


// ══════════════════════════════════════════════════════════
//  CASE TIMELINE
// ══════════════════════════════════════════════════════════
const MONTH_NAMES_TL = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

function openTimelineScreen() {
  document.getElementById('tl-search-input').value = '';
  document.getElementById('tl-results').innerHTML = '';
  showScreen('screen-timeline');
}

function openTimelineFromModal() {
  if (!modalCaseNo) return;
  closeModal();
  document.getElementById('tl-search-input').value = modalCaseNo;
  showScreen('screen-timeline');
  searchTimeline();
}

async function searchTimeline() {
  const query = document.getElementById('tl-search-input').value.trim();
  const resultsDiv = document.getElementById('tl-results');
  if (!query) { resultsDiv.innerHTML = ''; return; }

  document.getElementById('loader').classList.add('on');

  const allMonths = await dbGetAll('months');
  const allRecs   = await dbGetAll('recommendations');
  const recMap = {};
  allRecs.forEach(r => { recMap[r.caseKey] = r; });

  // Collect every occurrence of this case across months & modules
  const events = [];

  for (const monthData of allMonths) {
    const key = monthData.key;
    const isRCB = key.startsWith('rcb-');
    const modName = isRCB ? 'rcb' : 'oida';
    const parts = isRCB ? key.replace('rcb-','').split('-') : key.split('-');
    const yr = parseInt(parts[0]), mo = parseInt(parts[1]);

    const sheets = monthData.sheets || {};
    for (const sheetName of Object.keys(sheets)) {
      const rows = parseRows(sheets[sheetName].rows || []);
      for (const r of rows) {
        if (r.caseNo.toLowerCase().trim() !== query.toLowerCase().trim()) continue;
        const ck = key + '-' + r.caseNo;
        const rec = recMap[ck] || null;
        events.push({ yr, mo, modName, sheetName, r, rec, sortKey: yr*100+mo });
      }
    }
  }

  document.getElementById('loader').classList.remove('on');

  if (!events.length) {
    resultsDiv.innerHTML = `<div class="no-results">No record found for case <strong>${query}</strong> in any month or module.</div>`;
    return;
  }

  // Sort chronologically
  events.sort((a,b) => a.sortKey - b.sortKey);

  renderTimeline(query, events);
}

const TL_STATUS_CLASS = { resolved:'tl-resolved', partial:'tl-partial', deferred:'tl-deferred', unresolved:'tl-unresolved' };
const TL_STATUS_LABEL = { resolved:'RECEIVED', partial:'PARTIAL', deferred:'POSTPONED', unresolved:'NOT RECEIVED' };
const TL_DEC_LABEL    = { closed:'CLOSED', open:'OPEN', future:'CARRY OVER TO FUTURE MONTH' };

function renderTimeline(query, events) {
  const first = events[0].r;
  const resultsDiv = document.getElementById('tl-results');

  const header = `
    <div class="tl-case-header">
      <div class="tl-case-title">${query}</div>
      <div class="tl-case-meta">
        <span>Dept: <strong>${first.dept||'—'}</strong></span>
        <span>Fleet: <strong>${first.fleet||'—'}</strong></span>
        <span>Reg: <strong>${first.reg||'—'}</strong></span>
        <span>ATA: <strong>${first.ata||'—'}</strong></span>
        <span>Appearances: <strong>${events.length}</strong></span>
      </div>
    </div>`;

  const track = events.map(ev => {
    const { yr, mo, modName, r, rec } = ev;
    const monthLabel = MONTH_NAMES_TL[mo] + ' ' + yr;
    const statusCls = TL_STATUS_CLASS[r.status] || 'tl-unresolved';
    const modBadgeCls = modName === 'rcb' ? 'gsr-module-rcb' : 'gsr-module-oida';
    const modLabel = modName.toUpperCase();

    // Per-dept response breakdown if available
    const perDeptBadges = parseResponseBadges(r.response).map(b =>
      `<span class="resp-badge ${b.ok?'resp-badge-yes':'resp-badge-no'}">${b.dept}${b.ok?'✓':'✗'}</span>`
    ).join('');

    let recHtml = '';
    if (rec) {
      if (rec.techSupport) {
        recHtml += `<div class="tl-rec-block"><div class="tl-rec-title">Technical Support Analysis</div>${rec.techSupport}</div>`;
      }
      if (rec.techServices) {
        recHtml += `<div class="tl-rec-block"><div class="tl-rec-title">Technical Services Recommendation</div>${rec.techServices}</div>`;
      }
      if (rec.attachments && rec.attachments.length) {
        recHtml += `<div style="margin-top:8px">` + rec.attachments.map(a =>
          `<span class="tl-att-chip">${a.icon||'📁'} ${a.name}</span>`
        ).join('') + `</div>`;
      }
      if (rec.decision) {
        const decLabel = TL_DEC_LABEL[rec.decision] || rec.decision;
        let decDetail = '';
        if (rec.decision === 'closed' && rec.closedNote) {
          decDetail = `<div class="tl-row"><span class="tl-label">Closing Note:</span><span>${rec.closedNote}</span></div>`;
        }
        if (rec.decision === 'future') {
          decDetail = `<div class="tl-row"><span class="tl-label">Carry-Over Month:</span><span>${rec.carryMonth||'—'}</span></div>
                        <div class="tl-row"><span class="tl-label">Assigned Dept:</span><span>${rec.carryDept||'Same as current'}</span></div>
                        <div class="tl-row"><span class="tl-label">Note:</span><span>${rec.carryNote||'—'}</span></div>`;
        }
        recHtml += `
          <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
            <div class="tl-row"><span class="tl-label">RCB Decision:</span><span class="dec-badge ${rec.decision==='closed'?'dec-closed':rec.decision==='future'?'dec-future':'dec-open'}">${decLabel}</span></div>
            ${decDetail}
          </div>`;
      }
    }

    return `
    <div class="tl-event ${statusCls}">
      <div class="tl-card">
        <div class="tl-card-header">
          <span class="tl-month-tag">${monthLabel}</span>
          <span class="tl-module-tag ${modBadgeCls}">${modLabel}</span>
        </div>
        <div class="tl-card-body">
          <div class="tl-row"><span class="tl-label">Department:</span><span>${r.dept||'—'}</span></div>
          <div class="tl-row"><span class="tl-label">Description:</span><span>${r.desc||'—'}</span></div>
          <div class="tl-row"><span class="tl-label">Response:</span><span>${r.response||'—'} ${perDeptBadges}</span></div>
          <div class="tl-row"><span class="tl-label">Status:</span><span class="pill ${STATUS_PILLS[r.status]||'p-unresolved'}">${TL_STATUS_LABEL[r.status]||'—'}</span></div>
          <div class="tl-row"><span class="tl-label">Date Received:</span><span>${r.dateRec||'—'}</span></div>
          ${recHtml}
          <div style="margin-top:10px">
            <button class="btn-secondary" style="font-size:11px;padding:4px 12px;" onclick="goToCase(${yr},${mo},'${modName}','${r.caseNo}')">→ Open this month</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  resultsDiv.innerHTML = header + `<div class="tl-track">${track}</div>`;
}


// ══════════════════════════════════════════════════════════
//  DEFAULT SETTINGS (ATA + AC Types + other dropdowns)
// ══════════════════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  acTypes: ['B787-9','B777-300','B737-800','A350-900'],
  ataChapters: [
    '21 - Air Conditioning','22 - Auto Flight','23 - Communications',
    '24 - Electrical Power','25 - Equipment/Furnishings','26 - Fire Protection',
    '27 - Flight Controls','28 - Fuel','29 - Hydraulic Power',
    '30 - Ice & Rain Protection','31 - Indicating/Recording Systems',
    '32 - Landing Gear','33 - Lights','34 - Navigation',
    '35 - Oxygen','36 - Pneumatic','38 - Water/Waste',
    '49 - Airborne Auxiliary Power','51 - Structures',
    '52 - Doors','53 - Fuselage','54 - Nacelles/Pylons',
    '55 - Stabilizers','56 - Windows','57 - Wings',
    '70 - Standard Practices Engine','71 - Power Plant',
    '72 - Engine','73 - Engine Fuel & Control','74 - Ignition',
    '75 - Air','76 - Engine Controls','77 - Engine Indicating',
    '78 - Exhaust','79 - Oil','80 - Starting'
  ],
};

let appSettings = { acTypes:[...DEFAULT_SETTINGS.acTypes], ataChapters:[...DEFAULT_SETTINGS.ataChapters] };

async function loadSettings() {
  const saved = await dbGet('settings','appSettings');
  if (saved) appSettings = saved.value;
  else appSettings = { acTypes:[...DEFAULT_SETTINGS.acTypes], ataChapters:[...DEFAULT_SETTINGS.ataChapters] };
  populateSettingsDropdowns();
}

async function saveSettings() {
  await dbPut('settings', { key:'appSettings', value:appSettings });
  populateSettingsDropdowns();
  closeSettings();
  alert('Settings saved!');
}

function populateSettingsDropdowns() {
  // Populate all AC Type dropdowns
  ['sf-actype','san-gs-type'].forEach(id => {
    const el = document.getElementById(id); if(!el)return;
    const val = el.value;
    el.innerHTML = '<option value="">— Select —</option>' +
      appSettings.acTypes.map(t=>`<option value="${t}" ${val===t?'selected':''}>${t}</option>`).join('');
  });
  // Populate all ATA dropdowns
  ['sf-ata','san-gs-ata'].forEach(id => {
    const el = document.getElementById(id); if(!el)return;
    const val = el.value;
    el.innerHTML = '<option value="">— Select —</option>' +
      appSettings.ataChapters.map(a=>{
        const code = a.split(' - ')[0];
        return `<option value="${code}" ${val===code?'selected':''}>${a}</option>`;
      }).join('');
  });
}

// ── SETTINGS MODAL ──
let settingsActiveTab = 'acTypes';

function openSettings() {
  renderSettingsTabs();
  renderSettingsContent(settingsActiveTab);
  document.getElementById('settings-modal').classList.add('open');
}
function closeSettings() { document.getElementById('settings-modal').classList.remove('open'); }

function renderSettingsTabs() {
  const tabs = [
    { key:'acTypes', label:'A/C Types' },
    { key:'ataChapters', label:'ATA Chapters' },
  ];
  document.getElementById('settings-tabs').innerHTML = tabs.map(t=>
    `<button class="settings-tab ${t.key===settingsActiveTab?'active':''}" onclick="switchSettingsTab('${t.key}')">${t.label}</button>`
  ).join('');
}

function switchSettingsTab(key) {
  settingsActiveTab = key;
  renderSettingsTabs();
  renderSettingsContent(key);
}

function renderSettingsContent(key) {
  const items = appSettings[key] || [];
  const el = document.getElementById('settings-tab-content');
  el.innerHTML = `
    <div id="settings-list">
      ${items.map((v,i)=>`
        <div class="settings-item">
          <input type="text" value="${v}" onchange="appSettings['${key}'][${i}]=this.value"/>
          <button class="btn-danger" onclick="removeSettingItem('${key}',${i})" style="padding:4px 10px;font-size:12px;">✕</button>
        </div>`).join('')}
    </div>
    <div class="settings-add-row">
      <input type="text" id="settings-new-val" placeholder="Add new value…" onkeydown="if(event.key==='Enter')addSettingItem('${key}')"/>
      <button class="btn-primary" onclick="addSettingItem('${key}')">+ Add</button>
    </div>`;
}

function addSettingItem(key) {
  const inp = document.getElementById('settings-new-val');
  const val = inp.value.trim(); if(!val)return;
  appSettings[key].push(val);
  inp.value='';
  renderSettingsContent(key);
}

function removeSettingItem(key, idx) {
  appSettings[key].splice(idx,1);
  renderSettingsContent(key);
}

// ══════════════════════════════════════════════════════════
//  SAN MODULE
// ══════════════════════════════════════════════════════════
let sanSelYear=null, sanSelMonth=null, currentMonthSans=[], sanEditId=null;
let sanGsResults=[];

function sanMonthKey(){ return sanSelYear+'-'+sanSelMonth; }

async function openModule_san(yr, mo) {
  sanSelYear = yr; sanSelMonth = mo;
  document.getElementById('bc4').textContent='SAN';
  document.getElementById('bc4').style.display='';
  document.getElementById('bc4-sep').style.display='';
  document.getElementById('san-screen-title').textContent=`SAN — ${MONTHS[mo]} ${yr}`;
  document.getElementById('san-month-name').textContent=`${MONTHS[mo]} ${yr}`;
  await loadSettings();
  await refreshMonthSans();
  showScreen('screen-san');
}

async function refreshMonthSans() {
  const all = await dbGetAll('sans');
  currentMonthSans = all.filter(s=>s.monthKey===sanMonthKey());
  // Check for previous alerts in any SAN currently shown
  await checkAllPreviousAlerts(currentMonthSans);
  renderMonthSansTable(currentMonthSans);
}

async function checkAllPreviousAlerts(sans) {
  const allSans = await dbGetAll('sans');
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth()-12, 1);
  let prevAlerts = [];
  sans.forEach(s=>{
    const matches = allSans.filter(x=>
      x.id !== s.id &&
      x.acType === s.acType &&
      x.ata === s.ata &&
      x.monthKey !== sanMonthKey()
    );
    matches.forEach(m=>{
      const [my,mm] = m.monthKey.split('-').map(Number);
      const mDate = new Date(my, mm, 1);
      if(mDate >= twelveMonthsAgo) prevAlerts.push({current:s, prev:m});
    });
  });
  const banner = document.getElementById('san-previous-alert-banner');
  if(prevAlerts.length){
    banner.style.display='flex';
    document.getElementById('san-prev-text').textContent =
      prevAlerts.map(p=>`SAN ${p.current.sanNo} matches previous SAN ${p.prev.sanNo} (ATA ${p.prev.ata} / ${p.prev.acType}) in ${MONTHS[parseInt(p.prev.monthKey.split('-')[1])]} ${p.prev.monthKey.split('-')[0]}`).join(' · ');
  } else {
    banner.style.display='none';
  }
  return prevAlerts.map(p=>p.current.id);
}

async function renderMonthSansTable(sans, prevAlertIds=[]) {
  const all = await dbGetAll('sans');
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth()-12, 1);

  // Build prev alert set for this render
  const prevSet = new Set();
  sans.forEach(s=>{
    const matches = all.filter(x=>
      x.id !== s.id && x.acType===s.acType && x.ata===s.ata && x.monthKey!==sanMonthKey()
    );
    matches.forEach(m=>{
      const [my,mm]=m.monthKey.split('-').map(Number);
      if(new Date(my,mm,1)>=twelveMonthsAgo) prevSet.add(s.id);
    });
  });

  const el = document.getElementById('san-month-table-wrap');
  if(!sans.length){ el.innerHTML='<div class="empty-state">No SANs for this month. Click "+ Create SAN" to add.</div>'; return; }

  // Load recs to check RCB closure
  const allRecs = await dbGetAll('recommendations');

  el.innerHTML = `<table class="san-table">
    <thead><tr>
      <th>SAN No.</th><th>A/C Type</th><th>ATA</th><th>Delivery</th><th>Target</th>
      <th>ETOPS</th><th>PIREPs</th><th>Rate</th><th>Alert</th>
      <th>TS Action</th><th>RCB</th><th>Rec.</th><th>Action</th>
    </tr></thead>
    <tbody>
    ${sans.map(s=>{
      const isPrev = prevSet.has(s.id);
      const etopsHtml = s.etops==='yes'
        ? '<span class="san-etops-yes">YES</span>'
        : '<span class="san-etops-no">NO</span>';
      const tsHtml = s.tsAction==='open'
        ? '<span class="san-action-open">OPEN</span>'
        : '<span class="san-action-closed">CLOSED</span>';

      // RCB status
      let rcbHtml = '<span style="color:var(--gray3);font-size:11px">—</span>';
      let recHtml = '<span style="color:var(--gray3);font-size:11px">—</span>';
      if(s.rcbModule){
        const rcbKey = s.rcbModule+'-'+s.rcbMonth;
        const caseKey = rcbKey+'-SAN '+s.sanNo;
        const rec = allRecs.find(r=>r.caseKey===caseKey);
        if(rec && rec.decision==='closed'){
          rcbHtml=`<span class="san-rcb-closed">✓ Closed in ${s.rcbModule.toUpperCase()}</span>`;
          recHtml=`<span style="font-size:10px;color:var(--green)" title="${(rec.techSupport||'')+(rec.techServices||'')}">✓ Has Rec.</span>`;
        } else {
          rcbHtml=`<span class="san-rcb-badge">→ ${s.rcbModule.toUpperCase()}</span>`;
        }
      }

      return `<tr class="${isPrev?'san-prev-alert':''}">
        <td><span class="san-no">SAN ${s.sanNo}</span>${isPrev?' <span style="font-size:9px;font-weight:700;color:#b8860b;background:#fff3b0;padding:1px 5px;border-radius:3px;">⚠ PREV ALERT</span>':''}</td>
        <td>${s.acType||'—'}</td>
        <td><strong>${s.ata||'—'}</strong></td>
        <td style="font-size:11px;color:var(--gray5)">${s.deliveryDate||'—'}</td>
        <td style="font-size:11px;color:var(--gray5)">${s.targetDate||'—'}</td>
        <td>${etopsHtml}</td>
        <td style="text-align:center;font-weight:600">${s.pireps||0}</td>
        <td style="text-align:center;font-weight:600;color:${parseFloat(s.rate)>1?'var(--red)':'var(--text)'}">${s.rate||'0'}</td>
        <td style="text-align:center;font-weight:600;color:${parseFloat(s.alert)>0?'var(--orange)':'var(--gray5)'}">${s.alert||'0'}</td>
        <td>${tsHtml}</td>
        <td>${rcbHtml}</td>
        <td>${recHtml}</td>
        <td><button class="btn-secondary" style="padding:3px 10px;font-size:11px" onclick="openSanForm(${s.id})">✏ Edit</button></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

function filterMonthSans() {
  const q = document.getElementById('san-inner-search').value.toLowerCase();
  const filtered = currentMonthSans.filter(s=>
    (s.sanNo||'').toLowerCase().includes(q)||
    (s.acType||'').toLowerCase().includes(q)||
    (s.ata||'').toLowerCase().includes(q)||
    (s.tsAction||'').toLowerCase().includes(q)
  );
  renderMonthSansTable(filtered);
}

// ── SAN FORM ──
async function openSanForm(id) {
  sanEditId = id;
  await loadSettings();
  populateSettingsDropdowns();
  document.getElementById('san-form-title').textContent = id ? 'Edit SAN' : 'Create SAN';
  document.getElementById('san-delete-btn').style.display = id ? '' : 'none';
  document.getElementById('san-form-prev-alert').style.display='none';

  if(id){
    const all = await dbGetAll('sans');
    const s = all.find(x=>x.id===id);
    if(s){
      document.getElementById('sf-actype').value  = s.acType||'';
      document.getElementById('sf-ata').value     = s.ata||'';
      document.getElementById('sf-delivery').value= s.deliveryDate||'';
      document.getElementById('sf-target').value  = s.targetDate||'';
      document.getElementById('sf-etops').value   = s.etops||'no';
      document.getElementById('sf-sanno').value   = s.sanNo||'';
      document.getElementById('sf-pireps').value  = s.pireps||'';
      document.getElementById('sf-rate').value    = s.rate||'';
      document.getElementById('sf-alert').value   = s.alert||'';
      document.getElementById('sf-tsaction').value= s.tsAction||'open';
      document.getElementById('sf-rcb-module').value= s.rcbModule||'';
      document.getElementById('sf-rcb-month').value = s.rcbMonth||'';
      handleEtops();
      toggleRcbMonth();
    }
  } else {
    document.getElementById('sf-actype').value='';
    document.getElementById('sf-ata').value='';
    document.getElementById('sf-delivery').value='';
    document.getElementById('sf-target').value='';
    document.getElementById('sf-etops').value='no';
    document.getElementById('sf-sanno').value='';
    document.getElementById('sf-pireps').value='';
    document.getElementById('sf-rate').value='';
    document.getElementById('sf-alert').value='0';
    document.getElementById('sf-tsaction').value='open';
    document.getElementById('sf-rcb-module').value='';
    document.getElementById('sf-rcb-month').value='';
    handleEtops();
  }
  document.getElementById('san-form-modal').classList.add('open');
}

function closeSanForm(){ document.getElementById('san-form-modal').classList.remove('open'); }

function handleEtops(){
  const isEtops = document.getElementById('sf-etops').value==='yes';
  if(isEtops){ document.getElementById('sf-alert').value='0'; document.getElementById('sf-alert').readOnly=true; }
  else { document.getElementById('sf-alert').readOnly=false; }
}

document.addEventListener('change', e=>{ if(e.target.id==='sf-rcb-module') toggleRcbMonth(); });
function toggleRcbMonth(){
  const val=document.getElementById('sf-rcb-module').value;
  document.getElementById('sf-rcb-month-wrap').style.display=val?'block':'none';
}

async function checkSanPrevAlert(){
  const acType=document.getElementById('sf-actype').value;
  const ata=document.getElementById('sf-ata').value;
  if(!acType||!ata){document.getElementById('san-form-prev-alert').style.display='none';return;}
  const all=await dbGetAll('sans');
  const now=new Date();
  const twelveMonthsAgo=new Date(now.getFullYear(),now.getMonth()-12,1);
  const matches=all.filter(x=>{
    if(sanEditId && x.id===sanEditId)return false;
    if(x.acType!==acType||x.ata!==ata)return false;
    const[my,mm]=x.monthKey.split('-').map(Number);
    return new Date(my,mm,1)>=twelveMonthsAgo;
  });
  const banner=document.getElementById('san-form-prev-alert');
  if(matches.length){
    banner.style.display='block';
    document.getElementById('san-form-prev-text').textContent=
      matches.map(m=>`SAN ${m.sanNo} (${MONTHS[parseInt(m.monthKey.split('-')[1])]} ${m.monthKey.split('-')[0]})`).join(', ');
  } else { banner.style.display='none'; }
}

async function saveSan(){
  const sanNo=document.getElementById('sf-sanno').value.trim();
  if(!sanNo){alert('Please enter a SAN number.');return;}
  const obj={
    monthKey:sanMonthKey(),
    acType:document.getElementById('sf-actype').value,
    ata:document.getElementById('sf-ata').value,
    deliveryDate:document.getElementById('sf-delivery').value,
    targetDate:document.getElementById('sf-target').value,
    etops:document.getElementById('sf-etops').value,
    sanNo,
    pireps:document.getElementById('sf-pireps').value,
    rate:document.getElementById('sf-rate').value,
    alert:document.getElementById('sf-alert').value,
    tsAction:document.getElementById('sf-tsaction').value,
    rcbModule:document.getElementById('sf-rcb-module').value,
    rcbMonth:document.getElementById('sf-rcb-month').value,
    savedAt:new Date().toISOString(),
  };
  if(sanEditId) obj.id=sanEditId;
  await dbPut('sans',obj);
  closeSanForm();
  await refreshMonthSans();
}

async function deleteSan(){
  if(!sanEditId)return;
  if(!confirm('Delete this SAN?'))return;
  await dbDelete('sans',sanEditId);
  closeSanForm();
  await refreshMonthSans();
}

// ── GLOBAL SAN SEARCH ──
async function runSanSearch(){
  const no      = document.getElementById('san-gs-no').value.trim().toLowerCase();
  const type    = document.getElementById('san-gs-type').value;
  const ata     = document.getElementById('san-gs-ata').value;
  const etops   = document.getElementById('san-gs-etops').value;
  const action  = document.getElementById('san-gs-action').value;
  const rcbSt   = document.getElementById('san-gs-rcb').value;
  const rateMin = parseFloat(document.getElementById('san-gs-rate').value)||0;
  const alertMin= parseFloat(document.getElementById('san-gs-alert').value)||0;

  const allSans = await dbGetAll('sans');
  const allRecs = await dbGetAll('recommendations');

  sanGsResults = allSans.filter(s=>{
    if(no     && !('san '+s.sanNo).toLowerCase().includes(no)) return false;
    if(type   && s.acType!==type)   return false;
    if(ata    && s.ata!==ata)       return false;
    if(etops  && s.etops!==etops)   return false;
    if(action && s.tsAction!==action)return false;
    if(rateMin && parseFloat(s.rate)<rateMin) return false;
    if(alertMin&& parseFloat(s.alert)<alertMin)return false;
    if(rcbSt){
      const ck=s.rcbModule+'-'+s.rcbMonth+'-SAN '+s.sanNo;
      const rec=allRecs.find(r=>r.caseKey===ck);
      if(rcbSt==='sent'   && !s.rcbModule) return false;
      if(rcbSt==='closed_rcb' && !(rec&&rec.decision==='closed')) return false;
      if(rcbSt==='none'   && s.rcbModule) return false;
    }
    return true;
  });

  document.getElementById('san-gs-count').textContent=sanGsResults.length;
  document.getElementById('san-gs-results').style.display='block';
  renderSanTable(sanGsResults, document.getElementById('san-gs-table-wrap'), true);
}

function clearSanSearch(){
  ['san-gs-no','san-gs-rate','san-gs-alert'].forEach(id=>document.getElementById(id).value='');
  ['san-gs-type','san-gs-ata','san-gs-etops','san-gs-action','san-gs-rcb'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('san-gs-results').style.display='none';
  sanGsResults=[];
}

function renderSanTable(sans, container, showMonth=false){
  if(!sans.length){container.innerHTML='<div class="empty-state">No SANs found.</div>';return;}
  const monthCol = showMonth?'<th>Month</th>':'';
  container.innerHTML=`<table class="san-table">
    <thead><tr>${monthCol}<th>SAN No.</th><th>A/C Type</th><th>ATA</th><th>ETOPS</th><th>PIREPs</th><th>Rate</th><th>Alert</th><th>TS Action</th><th>RCB</th></tr></thead>
    <tbody>${sans.map(s=>{
      const monthCell = showMonth?`<td><span class="gsr-month-badge">${MONTHS[parseInt(s.monthKey.split('-')[1])]} ${s.monthKey.split('-')[0]}</span></td>`:'';
      return `<tr onclick="goToSanMonth(${s.monthKey.split('-')[0]},${s.monthKey.split('-')[1]})" style="cursor:pointer">
        ${monthCell}
        <td><span class="san-no">SAN ${s.sanNo}</span></td>
        <td>${s.acType||'—'}</td>
        <td><strong>${s.ata||'—'}</strong></td>
        <td>${s.etops==='yes'?'<span class="san-etops-yes">YES</span>':'<span class="san-etops-no">NO</span>'}</td>
        <td style="text-align:center">${s.pireps||0}</td>
        <td style="text-align:center;font-weight:600;color:${parseFloat(s.rate)>1?'var(--red)':'inherit'}">${s.rate||0}</td>
        <td style="text-align:center;font-weight:600;color:${parseFloat(s.alert)>0?'var(--orange)':'inherit'}">${s.alert||0}</td>
        <td>${s.tsAction==='open'?'<span class="san-action-open">OPEN</span>':'<span class="san-action-closed">CLOSED</span>'}</td>
        <td>${s.rcbModule?'<span class="san-rcb-badge">→ '+s.rcbModule.toUpperCase()+'</span>':'—'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function goToSanMonth(yr,mo){
  openModule_san(yr,mo);
}

function exportSanResults(sans, prefix){
  if(!sans||!sans.length){alert('No data to export.');return;}
  const header=['Month','SAN No','A/C Type','ATA','Delivery Date','Target Date','ETOPS','PIREPs','Rate','Alert','TS Action','RCB Module','RCB Month'];
  const rows=sans.map(s=>[
    MONTHS[parseInt(s.monthKey.split('-')[1])]+' '+s.monthKey.split('-')[0],
    'SAN '+s.sanNo, s.acType, s.ata, s.deliveryDate, s.targetDate,
    s.etops?.toUpperCase(), s.pireps, s.rate, s.alert,
    s.tsAction?.toUpperCase(), s.rcbModule?.toUpperCase()||'', s.rcbMonth||''
  ]);
  // Build CSV
  const csv=[header,...rows].map(r=>r.map(c=>`"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  dlCSV(csv,`${prefix}_${new Date().toISOString().slice(0,10)}.csv`);
}
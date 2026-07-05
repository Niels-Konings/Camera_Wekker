'use strict';
/* =======================================================================
   Camera-Wekker — wekker die pas uitgaat als de camera een voorwerp ziet
   ======================================================================= */

/* ---------- modelbestanden (lokaal meegebundeld, werkt offline) ---------- */
const LIB = {
  tf:   './vendor/tf.min.js',
  coco: './vendor/coco-ssd.min.js',
  mnet: './vendor/mobilenet.min.js'
};
const MODEL_URL = {
  coco: './models/coco-ssd/model.json',
  mnet: './models/mobilenet/model.json'
};

/* ---------- voorwerpen ---------- */
// engine 'coco'  -> object-detectie met kader (COCO-SSD)
// engine 'mnet'  -> beeldclassificatie, voorwerp moet beeld vullen (MobileNet)
const OBJECTS = [
  // de gevraagde lijst (8 van de 9 werken zonder zelf trainen)
  { id:'pan',           label:'Pan',               icon:'🍳', engine:'mnet', group:'reco', match:['frying pan','skillet','frypan','wok','dutch oven','caldron'] },
  { id:'koffie',        label:'Koffiezetapparaat', icon:'☕', engine:'mnet', group:'reco', match:['espresso maker','coffeepot'] },
  { id:'mes',           label:'Mes',               icon:'🔪', engine:'coco', group:'reco', match:['knife'] },
  { id:'vork',          label:'Vork',              icon:'🍴', engine:'coco', group:'reco', match:['fork'] },
  { id:'lepel',         label:'Lepel',             icon:'🥄', engine:'coco', group:'reco', match:['spoon'] },
  { id:'tandenborstel', label:'Tandenborstel',     icon:'🪥', engine:'coco', group:'reco', match:['toothbrush'] },
  { id:'wc',            label:'Wc',                icon:'🚽', engine:'coco', group:'reco', match:['toilet'] },
  { id:'wcrol',         label:'Wc-rol',            icon:'🧻', engine:'mnet', group:'reco', match:['toilet tissue','toilet paper','bathroom tissue','paper towel'] },
  // extra betrouwbare voorwerpen
  { id:'fles',     label:'Fles',            icon:'🍾', engine:'coco', group:'extra', match:['bottle'] },
  { id:'kopje',    label:'Kopje / beker',   icon:'🥤', engine:'coco', group:'extra', match:['cup'] },
  { id:'kom',      label:'Kom',             icon:'🥣', engine:'coco', group:'extra', match:['bowl'] },
  { id:'wijnglas', label:'Wijnglas',        icon:'🍷', engine:'coco', group:'extra', match:['wine glass'] },
  { id:'telefoon', label:'Telefoon',        icon:'📱', engine:'coco', group:'extra', match:['cell phone'] },
  { id:'laptop',   label:'Laptop',          icon:'💻', engine:'coco', group:'extra', match:['laptop'] },
  { id:'boek',     label:'Boek',            icon:'📕', engine:'coco', group:'extra', match:['book'] },
  { id:'schaar',   label:'Schaar',          icon:'✂️', engine:'coco', group:'extra', match:['scissors'] },
  { id:'klok',     label:'Klok',            icon:'🕐', engine:'coco', group:'extra', match:['clock'] },
  { id:'plant',    label:'Plant',           icon:'🪴', engine:'coco', group:'extra', match:['potted plant'] },
  { id:'beer',     label:'Knuffelbeer',     icon:'🧸', engine:'coco', group:'extra', match:['teddy bear'] },
  { id:'banaan',   label:'Banaan',          icon:'🍌', engine:'coco', group:'extra', match:['banana'] },
  { id:'appel',    label:'Appel',           icon:'🍎', engine:'coco', group:'extra', match:['apple'] },
  { id:'magnetron',label:'Magnetron',       icon:'📦', engine:'coco', group:'extra', match:['microwave'] },
  { id:'gootsteen',label:'Gootsteen',       icon:'🚰', engine:'coco', group:'extra', match:['sink'] }
];
const objById = id => OBJECTS.find(o => o.id === id) || OBJECTS[0];

// 'random' = verrassingsmodus: pas bij het afgaan wordt een voorwerp gekozen
const RANDOM_ID = 'random';
const RANDOM_POOL = OBJECTS.filter(o => o.group === 'reco').map(o => o.id);
function pickRandomObject(prevId, pool){
  let p = (pool && pool.length) ? pool.slice() : RANDOM_POOL.slice();
  if(p.length > 1 && prevId) p = p.filter(id => id !== prevId);
  return objById(p[Math.floor(Math.random() * p.length)]);
}
// tekst voor de camera-chip; bij willekeurig met aantal voorwerpen in de loterij
function camChip(a){
  if(a.object === RANDOM_ID){ const n=(a.randomPool && a.randomPool.length) ? a.randomPool.length : RANDOM_POOL.length; return `🎲 Willekeurig · ${n}`; }
  const o = objById(a.object); return `${o.icon} ${o.label}`;
}

/* ---------- detectie-instellingen ---------- */
const COCO_MIN = 0.55;   // minimale score COCO-SSD
const MNET_MIN = 0.25;   // minimale kans MobileNet
const HOLD_TARGET = 5;   // aantal positieve frames om uit te zetten
const DETECT_MS = 220;   // tijd tussen detecties

const DISMISS_LOCK_MS = 3 * 60000; // alarm moet 3 min klinken voor je kunt uitzetten
const SNOOZE_MIN = 5;              // één keer 5 minuten sluimeren, daarna niet meer
const ESCAPE_AFTER_UNLOCK_MS = 90000; // noodknop pas 90s na ontgrendeling (voor als herkenning faalt)

/* ---------- geluiden (gesynthetiseerd, geen rechten) ---------- */
const SOUNDS = [
  { id:'xylo', name:'Morning Xylophone', wave:'triangle', gap:420, notes:[
      [523,260],[659,260],[784,260],[1047,360],[784,200],[659,200],[523,360] ] },
  { id:'klassiek', name:'Klassiek', wave:'square', gap:520, notes:[
      [880,140],[0,90],[880,140],[0,90],[880,140],[0,420] ] },
  { id:'chimes', name:'Klokkenspel', wave:'sine', gap:560, notes:[
      [659,420],[523,420],[587,420],[392,620] ] },
  { id:'radar', name:'Radar', wave:'sawtooth', gap:300, notes:[
      [440,420,880],[440,420,880],[440,520,1100] ] },
  { id:'digitaal', name:'Digitaal', wave:'square', gap:360, notes:[
      [1200,80],[0,60],[1200,80],[0,60],[1200,80],[0,60],[1500,120] ] },
  { id:'piep', name:'Simpele piep', wave:'square', gap:600, notes:[ [1000,300],[0,300] ] }
];
const soundById = id => SOUNDS.find(s => s.id === id) || SOUNDS[0];

/* ---------- trilpatronen ---------- */
const VIBES = [
  { id:'basic', name:'Basic call', pattern:[500,300,500,300], cycle:1700 },
  { id:'kort',  name:'Kort',       pattern:[140,120,140],     cycle:520 },
  { id:'lang',  name:'Lang',       pattern:[800,300],         cycle:1200 },
  { id:'hart',  name:'Hartslag',   pattern:[130,90,130,500],  cycle:950 },
  { id:'sos',   name:'SOS',        pattern:[120,80,120,80,120,250,320,140,320,140,320,250,120,80,120,80,120], cycle:2700 }
];
const vibeById = id => VIBES.find(v => v.id === id) || VIBES[0];

/* ---------- weekdagen (getDay: 0=zo .. 6=za) ---------- */
const WD_DISPLAY = [
  { d:1, l:'M' }, { d:2, l:'D' }, { d:3, l:'W' }, { d:4, l:'D' },
  { d:5, l:'V' }, { d:6, l:'Z' }, { d:0, l:'Z', sun:true }
];
const DAY_SHORT = ['zo','ma','di','wo','do','vr','za'];
const MON_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

/* =======================================================================
   Helpers
   ======================================================================= */
const $  = id => document.getElementById(id);
const pad = n => String(n).padStart(2,'0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }

let toastTimer=null;
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2200);
}

/* =======================================================================
   Opslag
   ======================================================================= */
const STORE_KEY='cw_alarms_v1', SET_KEY='cw_settings_v1';
let alarms=[];
let settings={ bannerHidden:false };

function load(){
  try{ alarms=JSON.parse(localStorage.getItem(STORE_KEY))||[]; }catch{ alarms=[]; }
  try{ settings=Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY))||{}); }catch{}
}
function save(){
  localStorage.setItem(STORE_KEY, JSON.stringify(alarms));
  localStorage.setItem(SET_KEY, JSON.stringify(settings));
}
function newAlarm(){
  const now=new Date();
  return {
    id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    hour: now.getHours(), minute: now.getMinutes(),
    days: [], specificDate: null, name: '',
    sound:'xylo', soundOn:true, vibe:'basic', vibeOn:true,
    snooze:{ enabled:true, minutes:SNOOZE_MIN, count:1 },
    cameraOn:true, object:RANDOM_ID, randomPool:RANDOM_POOL.slice(), gradual:true,
    enabled:true, lastFired:null
  };
}

/* =======================================================================
   Tijd-/datum-labels
   ======================================================================= */
function nextFire(a, from){
  from = from || Date.now();
  const base = new Date(from);
  if(a.specificDate){
    const [y,m,d]=a.specificDate.split('-').map(Number);
    const t=new Date(y,m-1,d,a.hour,a.minute,0,0).getTime();
    return t>from ? t : null;
  }
  if(a.days && a.days.length){
    for(let i=0;i<8;i++){
      const c=new Date(base); c.setDate(base.getDate()+i); c.setHours(a.hour,a.minute,0,0);
      if(a.days.includes(c.getDay()) && c.getTime()>from) return c.getTime();
    }
    return null;
  }
  const c=new Date(base); c.setHours(a.hour,a.minute,0,0);
  if(c.getTime()<=from) c.setDate(c.getDate()+1);
  return c.getTime();
}
function repeatLabel(a){
  if(a.specificDate){
    const [y,m,d]=a.specificDate.split('-').map(Number);
    const dt=new Date(y,m-1,d);
    return `${DAY_SHORT[dt.getDay()]} ${d} ${MON_SHORT[m-1]}`;
  }
  if(!a.days || !a.days.length){
    const nf=nextFire(a); if(nf==null) return 'Verlopen';
    const today=isoDate(new Date()), tomo=isoDate(new Date(Date.now()+864e5));
    const nd=isoDate(new Date(nf));
    if(nd===today) return 'Vandaag';
    if(nd===tomo) return 'Morgen';
    const dt=new Date(nf); return `${DAY_SHORT[dt.getDay()]} ${dt.getDate()} ${MON_SHORT[dt.getMonth()]}`;
  }
  const set=new Set(a.days);
  if(set.size===7) return 'Elke dag';
  if(set.size===5 && [1,2,3,4,5].every(x=>set.has(x))) return 'Weekdagen';
  if(set.size===2 && set.has(0) && set.has(6)) return 'Weekend';
  return WD_DISPLAY.filter(w=>set.has(w.d)).map(w=>DAY_SHORT[w.d]).join(', ');
}

/* =======================================================================
   Navigatie + Android terugknop (stapsgewijs, nooit direct sluiten)
   ======================================================================= */
const navStack=[];
let ringing=false;
let lastHomeBack=0;
let suppressNextPop=false;

function pushScreen(type){ navStack.push({type}); history.pushState({i:navStack.length},''); }

window.addEventListener('popstate', ()=>{
  // 0) eigen, programmatische terugnavigatie negeren
  if(suppressNextPop){ suppressNextPop=false; return; }
  // 1) tijdens het afgaan: terug is geblokkeerd, gebruik camera of sluimeren
  if(ringing){
    history.pushState({ring:true},'');
    const w=$('screen-ring'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
    return;
  }
  // 2) open subscherm/sheet sluiten
  if(sheetOpen){ doCloseSheet(); navStack.pop(); return; }
  const top=navStack.pop();
  if(top){
    if(top.type==='editor') hideScreen('screen-editor');
    else if(top.type==='test') closeTest();
    return;
  }
  // 3) op startscherm: dubbel terug om af te sluiten
  if(Date.now()-lastHomeBack < 2000){ return; } // volgende terug sluit af
  lastHomeBack=Date.now();
  toast('Tik nogmaals terug om af te sluiten');
}, false);

function showScreen(id){ const s=$(id); s.classList.remove('hidden'); requestAnimationFrame(()=>s.classList.remove('offscreen')); }
function hideScreen(id){ const s=$(id); s.classList.add('offscreen'); setTimeout(()=>s.classList.add('hidden'),300); }

/* =======================================================================
   Startscherm
   ======================================================================= */
function renderHome(){
  // banner
  const b=$('homeBanner'); b.innerHTML='';
  if(!settings.bannerHidden){
    const div=el('div','home-banner');
    div.innerHTML=`<span>⏰</span><span>Houd de app open en je telefoon <b>aan de lader</b>. Een wekker in de browser kan niet op de achtergrond afgaan.</span>`;
    const x=el('span','x','✕'); x.onclick=()=>{ settings.bannerHidden=true; save(); renderHome(); };
    div.appendChild(x); b.appendChild(div);
  }

  updateNextAlarm();

  const list=$('alarmList'); list.innerHTML='';
  if(!alarms.length){
    const e=el('div','empty');
    e.innerHTML=`<div class="big">🎲</div><div class="t">Nog geen alarm</div><div class="s">Tik op + voor een wekker die pas uitgaat als je de camera op een voorwerp richt.</div>`;
    list.appendChild(e); return;
  }
  const sorted=[...alarms].sort((x,y)=>(x.hour*60+x.minute)-(y.hour*60+y.minute));
  for(const a of sorted){
    const card=el('div','alarm-card'+(a.enabled?'':' off'));
    card.innerHTML=`
      <div class="row1">
        <div>
          <div class="alarm-time">${pad(a.hour)}:${pad(a.minute)}</div>
          <div class="alarm-sub">${repeatLabel(a)}</div>
          ${a.name?`<div class="alarm-name">${escapeHtml(a.name)}</div>`:''}
          ${a.cameraOn?`<div class="alarm-cam">📷 ${camChip(a)}</div>`:''}
        </div>
        <div class="alarm-actions"><div class="toggle ${a.enabled?'on':''}" data-tg="${a.id}"></div></div>
      </div>`;
    card.querySelector('.toggle').onclick=(ev)=>{ ev.stopPropagation(); a.enabled=!a.enabled; a.lastFired=null; save(); renderHome(); refreshWakeLock(); };
    card.onclick=()=>openEditor(a);
    list.appendChild(card);
  }
}
function escapeHtml(s){ return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function fmtCountdown(ms){
  const total=Math.max(0,Math.round(ms/60000));
  const d=Math.floor(total/1440), h=Math.floor((total%1440)/60), m=total%60;
  if(d>0) return `${d} d ${h} u`;
  if(h>0) return `${h} u ${m} min`;
  if(m>0) return `${m} min`;
  return 'nu';
}
function updateNextAlarm(){
  const box=$('nextAlarm'); if(!box) return;
  let best=null;
  for(const a of alarms){ if(!a.enabled) continue; const nf=nextFire(a); if(nf!=null && (best==null || nf<best.nf)) best={a,nf}; }
  if(!best){ box.className='next-alarm empty'; box.innerHTML='Geen alarm ingesteld'; return; }
  box.className='next-alarm';
  box.innerHTML=`Volgende alarm <b>${pad(best.a.hour)}:${pad(best.a.minute)}</b> · over <span class="acc">${fmtCountdown(best.nf-Date.now())}</span>`;
}

/* =======================================================================
   Editor (nieuw / bewerken)
   ======================================================================= */
let draft=null, isNew=false;

function openEditor(existing){
  isNew=!existing;
  draft = existing ? JSON.parse(JSON.stringify(existing)) : newAlarm();
  $('edTitle').textContent = isNew ? 'Alarm toevoegen' : 'Alarm bewerken';
  buildEditor();
  showScreen('screen-editor');
  pushScreen('editor');
}

function buildEditor(){
  const body=$('editorBody'); body.innerHTML='';

  // tijd-wieltjes
  const wheels=el('div','wheels');
  wheels.innerHTML=`<div class="wheel" id="wheelH"></div><div class="colon">:</div><div class="wheel" id="wheelM"></div>`;
  body.appendChild(wheels);

  // datum + weekdagen
  const dateCard=el('div','section-card');
  dateCard.innerHTML=`
    <div class="date-head">
      <span class="label" id="dateLabel"></span>
      <button class="cal ${draft.specificDate?'active':''}" id="calBtn" aria-label="Datum kiezen">📅</button>
    </div>
    <div class="weekdays" id="weekdays"></div>`;
  body.appendChild(dateCard);

  // naam
  const nameCard=el('div','section-card');
  const nf=el('div','name-field');
  const inp=el('input'); inp.type='text'; inp.placeholder='Alarmnaam'; inp.value=draft.name; inp.maxLength=40;
  inp.oninput=()=>{ draft.name=inp.value; };
  nf.appendChild(inp); nameCard.appendChild(nf); body.appendChild(nameCard);

  // opties: geluid / trillen / sluimeren
  const optCard=el('div','section-card');
  optCard.appendChild(optRow('🔔','Alarmgeluid', ()=>soundById(draft.sound).name, ()=>openSoundSheet(), draft.soundOn, v=>{draft.soundOn=v;}));
  optCard.appendChild(optRow('📳','Trillen', ()=>vibeById(draft.vibe).name, ()=>openVibeSheet(), draft.vibeOn, v=>{draft.vibeOn=v; if(v&&navigator.vibrate) navigator.vibrate(vibeById(draft.vibe).pattern);}));
  optCard.appendChild(buildSnoozeRow());
  body.appendChild(optCard);

  // camera-uitschakeling
  const camCard=el('div','section-card');
  camCard.appendChild(optRow('📷','Uitzetten met camera', ()=>camChip(draft), ()=>openObjectSheet(), draft.cameraOn, v=>{draft.cameraOn=v; refreshEditorSubs(); refreshCamTestBtn();}));
  const testBtn=el('button','cam-test-btn'); testBtn.id='camTestBtn'; testBtn.innerHTML='📷 Test herkenning';
  testBtn.onclick=()=>openTest(draft.object, draft.randomPool);
  camCard.appendChild(testBtn);
  body.appendChild(camCard);

  // verwijderen
  if(!isNew){
    const del=el('button','delete-btn','Alarm verwijderen');
    del.onclick=()=>{ alarms=alarms.filter(x=>x.id!==draft.id); save(); history.back(); renderHome(); refreshWakeLock(); toast('Alarm verwijderd'); };
    body.appendChild(del);
  }

  buildWheel($('wheelH'),24,draft.hour,v=>{draft.hour=v; refreshDateLabel();});
  buildWheel($('wheelM'),60,draft.minute,v=>{draft.minute=v; refreshDateLabel();});
  renderWeekdays();
  refreshDateLabel();
  refreshCamTestBtn();

  $('calBtn').onclick=pickDate;
}

function optRow(icon,title,subFn,onTap,toggleVal,onToggle){
  const row=el('div','opt-row tappable');
  row.innerHTML=`<span class="ico">${icon}</span>
    <div class="txt"><div class="t">${title}</div><div class="s">${subFn()}</div></div>
    <div class="toggle sm ${toggleVal?'on':''}"></div>`;
  const tg=row.querySelector('.toggle');
  row.dataset.subfn='1'; row._subFn=subFn; row._titleEl=row.querySelector('.s');
  row.onclick=onTap;
  tg.onclick=(ev)=>{ ev.stopPropagation(); const on=!tg.classList.contains('on'); tg.classList.toggle('on',on); onToggle(on); };
  return row;
}
function refreshEditorSubs(){
  document.querySelectorAll('#editorBody .opt-row').forEach(r=>{ if(r._subFn) r._titleEl.textContent=r._subFn(); });
}
function refreshCamTestBtn(){
  const b=$('camTestBtn'); if(!b) return;
  b.disabled=!draft.cameraOn; b.style.opacity=draft.cameraOn?'1':'.4';
}
// Sluimeren: één keer 5 minuten, daarna niet meer. Alleen aan/uit, verder vast.
function buildSnoozeRow(){
  const row=el('div','opt-row tappable');
  row.innerHTML=`<span class="ico">💤</span>
    <div class="txt"><div class="t">Sluimeren</div><div class="s"></div></div>
    <div class="toggle sm ${draft.snooze.enabled?'on':''}"></div>`;
  const tg=row.querySelector('.toggle'), sub=row.querySelector('.s');
  const setSub=()=>{ sub.textContent = draft.snooze.enabled ? '1× 5 minuten, daarna de camera' : 'Uit — meteen de camera'; };
  setSub();
  const flip=()=>{ draft.snooze.enabled=!draft.snooze.enabled; draft.snooze.minutes=SNOOZE_MIN; draft.snooze.count=1; tg.classList.toggle('on',draft.snooze.enabled); setSub(); };
  row.onclick=flip;
  tg.onclick=(ev)=>{ ev.stopPropagation(); flip(); };
  return row;
}

/* tijd-wiel */
function buildWheel(container,count,initial,onChange){
  container.innerHTML='';
  container.appendChild(el('div','wheel-spacer'));
  for(let i=0;i<count;i++){ const it=el('div','wheel-item',pad(i)); it.dataset.v=i; container.appendChild(it); }
  container.appendChild(el('div','wheel-spacer'));
  const H=74;
  const items=[...container.querySelectorAll('.wheel-item')];
  function setSel(idx){ items.forEach((it,i)=>it.classList.toggle('sel',i===idx)); }
  let raf=null;
  container.addEventListener('scroll',()=>{
    if(raf) return;
    raf=requestAnimationFrame(()=>{
      raf=null;
      const idx=Math.max(0,Math.min(count-1,Math.round(container.scrollTop/H)));
      setSel(idx); onChange(idx);
    });
  },{passive:true});
  items.forEach((it,i)=>it.addEventListener('click',()=>container.scrollTo({top:i*H,behavior:'smooth'})));
  requestAnimationFrame(()=>{ container.scrollTop=initial*H; setSel(initial); });
}

/* weekdagen */
function renderWeekdays(){
  const wd=$('weekdays'); wd.innerHTML='';
  WD_DISPLAY.forEach(w=>{
    const b=el('div','wd'+(w.sun?' sun':'')+(draft.days.includes(w.d)?' on':''),w.l);
    b.onclick=()=>{
      const i=draft.days.indexOf(w.d);
      if(i>=0) draft.days.splice(i,1); else draft.days.push(w.d);
      if(draft.days.length) draft.specificDate=null;
      renderWeekdays(); refreshDateLabel();
      $('calBtn').classList.toggle('active',!!draft.specificDate);
    };
    wd.appendChild(b);
  });
}
function refreshDateLabel(){ const l=$('dateLabel'); if(l) l.textContent=repeatLabel(draft); }

function pickDate(){
  const inp=el('input'); inp.type='date';
  inp.min=isoDate(new Date());
  inp.value=draft.specificDate||isoDate(new Date());
  inp.style.position='fixed'; inp.style.opacity='0'; inp.style.left='0'; inp.style.bottom='0';
  document.body.appendChild(inp);
  inp.onchange=()=>{ if(inp.value){ draft.specificDate=inp.value; draft.days=[]; renderWeekdays(); refreshDateLabel(); $('calBtn').classList.add('active'); } document.body.removeChild(inp); };
  inp.onblur=()=>{ if(inp.parentNode) document.body.removeChild(inp); };
  inp.showPicker ? inp.showPicker() : inp.click();
}

function saveDraft(){
  if(draft.cameraOn && !draft.object) draft.object=RANDOM_ID;
  draft.lastFired=null;
  if(isNew){ alarms.push(draft); }
  else { const i=alarms.findIndex(x=>x.id===draft.id); if(i>=0) alarms[i]=draft; }
  save(); history.back(); renderHome(); refreshWakeLock();
  if(draft.cameraOn){
    if(draft.object===RANDOM_ID){ ensureModel('coco').catch(()=>{}); ensureModel('mnet').catch(()=>{}); }
    else ensureModel(objById(draft.object).engine).catch(()=>{});
  }
  const nf=nextFire(draft);
  if(draft.enabled && nf) announceSaved(draft, nf);
}
async function announceSaved(a, nf){
  const mins=Math.round((nf-Date.now())/60000);
  const cd = mins<=0 ? 'nu' : (mins<60 ? `over ${mins} min` : `over ${Math.floor(mins/60)} u ${mins%60} min`);
  if(a.cameraOn){
    let state=null;
    try{ if(navigator.permissions){ state=(await navigator.permissions.query({name:'camera'})).state; } }catch{}
    if(state==='prompt' || state==='denied') toast(`Alarm ${cd} · test de camera 1× voor toestemming`);
    else toast(`Alarm ${cd}`);
  } else {
    toast(`Alarm ${cd}`);
  }
}

/* =======================================================================
   Bottom sheets
   ======================================================================= */
let sheetOpen=false;
function openSheet(title,buildFn){
  $('sheetTitle').textContent=title;
  $('sheetContent').innerHTML=''; buildFn($('sheetContent'));
  $('scrim').classList.add('open'); $('sheet').classList.add('open');
  sheetOpen=true; pushScreen('sheet');
}
function doCloseSheet(){ $('scrim').classList.remove('open'); $('sheet').classList.remove('open'); sheetOpen=false; }
function closeSheet(){ if(sheetOpen) history.back(); }
$('scrim').addEventListener('click',()=>closeSheet());

function previewSound(s){ playSound(s,{gradual:false,once:true}); }

function openSoundSheet(){
  openSheet('Alarmgeluid',(c)=>{
    const list=el('div','sheet-list');
    SOUNDS.forEach(s=>{
      const it=el('div','sheet-item'+(s.id===draft.sound?' sel':''));
      it.innerHTML=`<span class="ico">🎵</span><div class="t">${s.name}</div><span class="radio"></span>`;
      it.onclick=()=>{ draft.sound=s.id; previewSound(s); refreshEditorSubs(); list.querySelectorAll('.sheet-item').forEach(x=>x.classList.remove('sel')); it.classList.add('sel'); };
      list.appendChild(it);
    });
    c.appendChild(list);
    const done=el('button','sheet-done','Klaar'); done.onclick=()=>{ stopSound(); closeSheet(); }; c.appendChild(done);
  });
}
function openVibeSheet(){
  openSheet('Trillen',(c)=>{
    const list=el('div','sheet-list');
    VIBES.forEach(v=>{
      const it=el('div','sheet-item'+(v.id===draft.vibe?' sel':''));
      it.innerHTML=`<span class="ico">📳</span><div class="t">${v.name}</div><span class="radio"></span>`;
      it.onclick=()=>{ draft.vibe=v.id; if(navigator.vibrate) navigator.vibrate(v.pattern); refreshEditorSubs(); list.querySelectorAll('.sheet-item').forEach(x=>x.classList.remove('sel')); it.classList.add('sel'); };
      list.appendChild(it);
    });
    c.appendChild(list);
    const done=el('button','sheet-done','Klaar'); done.onclick=closeSheet; c.appendChild(done);
  });
}
let objMode='random', lastFixedObj='pan';
function openObjectSheet(){
  objMode = (draft.object===RANDOM_ID) ? 'random' : 'fixed';
  if(draft.object!==RANDOM_ID) lastFixedObj=draft.object;
  openSheet('Voorwerp om uit te zetten',(c)=>renderObjectSheet(c));
}
function renderObjectSheet(c){
  if(!Array.isArray(draft.randomPool) || !draft.randomPool.length) draft.randomPool = RANDOM_POOL.slice();
  c.innerHTML='';

  // schakelaar: willekeurig / vast
  const seg=el('div','seg');
  const bR=el('button','seg-btn'+(objMode==='random'?' on':''),'🎲 Willekeurig');
  const bF=el('button','seg-btn'+(objMode==='fixed'?' on':''),'Vast voorwerp');
  bR.onclick=()=>{ if(objMode!=='random'){ objMode='random'; draft.object=RANDOM_ID; refreshEditorSubs(); ensureModel('coco').catch(()=>{}); ensureModel('mnet').catch(()=>{}); renderObjectSheet(c); } };
  bF.onclick=()=>{ if(objMode!=='fixed'){ objMode='fixed'; draft.object=(lastFixedObj&&lastFixedObj!==RANDOM_ID)?lastFixedObj:'pan'; lastFixedObj=draft.object; refreshEditorSubs(); ensureModel(objById(draft.object).engine).catch(()=>{}); renderObjectSheet(c); } };
  seg.append(bR,bF); c.appendChild(seg);

  const list=el('div','sheet-list');

  if(objMode==='random'){
    const lbl=el('div','sheet-section-label'); lbl.id='poolCountLbl'; lbl.textContent=`In de loterij · ${draft.randomPool.length} gekozen`;
    list.appendChild(lbl);
    list.appendChild(el('div','pool-hint','Vink alleen aan wat je écht in huis hebt. Bij het afgaan wordt hieruit willekeurig gekozen — vooraf weet je niet welke.'));
    const addChecks=(grp,label)=>{
      list.appendChild(el('div','sheet-section-label',label));
      OBJECTS.filter(o=>o.group===grp).forEach(o=>{
        const it=el('div','sheet-item pool-item'+(draft.randomPool.includes(o.id)?' on':''));
        it.innerHTML=`<span class="ico">${o.icon}</span><div class="t">${o.label}</div><span class="check"></span>`;
        it.onclick=()=>{
          const i=draft.randomPool.indexOf(o.id);
          if(i>=0){ if(draft.randomPool.length<=1){ toast('Kies minstens 1 voorwerp'); return; } draft.randomPool.splice(i,1); it.classList.remove('on'); }
          else { draft.randomPool.push(o.id); it.classList.add('on'); }
          const l=$('poolCountLbl'); if(l) l.textContent=`In de loterij · ${draft.randomPool.length} gekozen`;
          refreshEditorSubs();
        };
        list.appendChild(it);
      });
    };
    addChecks('reco','Aanbevolen');
    addChecks('extra','Meer voorwerpen');
  } else {
    const addRadios=(grp,label)=>{
      list.appendChild(el('div','sheet-section-label',label));
      OBJECTS.filter(o=>o.group===grp).forEach(o=>{
        const it=el('div','sheet-item'+(o.id===draft.object?' sel':''));
        const eng=o.engine==='coco'?'nauwkeurig':'beeld vullen';
        it.innerHTML=`<span class="ico">${o.icon}</span><div class="t">${o.label}<span class="sub">${eng}</span></div><span class="radio"></span>`;
        it.onclick=()=>{ draft.object=o.id; lastFixedObj=o.id; refreshEditorSubs(); ensureModel(o.engine).catch(()=>{}); list.querySelectorAll('.sheet-item').forEach(x=>x.classList.remove('sel')); it.classList.add('sel'); };
        list.appendChild(it);
      });
    };
    addRadios('reco','Aanbevolen');
    addRadios('extra','Meer voorwerpen');
  }

  list.appendChild(el('div','home-banner','Tandenpasta zit in geen model en is daarom weggelaten. Alle herkenning gebeurt op je toestel.'));
  c.appendChild(list);
  const done=el('button','sheet-done','Klaar'); done.onclick=closeSheet; c.appendChild(done);
}

/* =======================================================================
   Audio (Web Audio API)
   ======================================================================= */
let audioCtx=null, soundTimers=[], masterGain=null, soundActive=false;
function ensureAudio(){
  if(!audioCtx){ try{ audioCtx=new (window.AudioContext||window.webkitAudioContext)(); }catch{ return null; } }
  if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function playNote(f,dur,wave,f2){
  if(!f || f<=0) return;
  const ctx=audioCtx, t=ctx.currentTime;
  const osc=ctx.createOscillator(), g=ctx.createGain();
  osc.type=wave||'sine'; osc.frequency.setValueAtTime(f,t);
  if(f2) osc.frequency.linearRampToValueAtTime(f2,t+dur/1000);
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(0.9,t+0.012);
  g.gain.exponentialRampToValueAtTime(0.0008,t+dur/1000);
  osc.connect(g); g.connect(masterGain);
  osc.start(t); osc.stop(t+dur/1000+0.05);
}
function playSound(sound,opts){
  opts=opts||{};
  const ctx=ensureAudio(); if(!ctx) return false;
  stopSound();
  masterGain=ctx.createGain();
  masterGain.gain.setValueAtTime(opts.gradual?0.06:0.8, ctx.currentTime);
  if(opts.gradual) masterGain.gain.linearRampToValueAtTime(0.9, ctx.currentTime+26);
  masterGain.connect(ctx.destination);
  soundActive=true;
  const seq=sound.notes;
  const runOnce=(done)=>{
    let t=0;
    seq.forEach(n=>{ soundTimers.push(setTimeout(()=>{ if(soundActive) playNote(n[0],n[1],sound.wave,n[2]); },t)); t+=n[1]; });
    soundTimers.push(setTimeout(done,t+sound.gap));
  };
  const loop=()=>{ if(!soundActive) return; runOnce(opts.once?()=>{stopSound();}:loop); };
  loop();
  return true;
}
function stopSound(){
  soundActive=false;
  soundTimers.forEach(clearTimeout); soundTimers=[];
  if(masterGain){ try{ masterGain.disconnect(); }catch{} masterGain=null; }
}

/* =======================================================================
   Trillen
   ======================================================================= */
let vibeTimer=null;
function startVibe(v){ if(!navigator.vibrate) return; navigator.vibrate(v.pattern); vibeTimer=setInterval(()=>navigator.vibrate(v.pattern),v.cycle); }
function stopVibe(){ if(vibeTimer){ clearInterval(vibeTimer); vibeTimer=null; } if(navigator.vibrate) navigator.vibrate(0); }

/* =======================================================================
   Modellen laden (lui, met cache in geheugen)
   ======================================================================= */
const modelState={ coco:null, mnet:null };
function loadScript(src){
  return new Promise((res,rej)=>{
    const existing=[...document.scripts].find(s=>s.src===src || s.src.endsWith(src.replace('./','/')));
    if(existing && existing.dataset.loaded){ res(); return; }
    const s=document.createElement('script'); s.src=src; s.async=true;
    s.onload=()=>{ s.dataset.loaded='1'; res(); }; s.onerror=()=>rej(new Error('script '+src));
    document.head.appendChild(s);
  });
}
let tfReady=null;
function ensureTf(){
  if(!tfReady) tfReady=(async()=>{
    await loadScript(LIB.tf);
    if(typeof tf==='undefined') throw new Error('tf niet gedefinieerd na laden van '+LIB.tf);
    if(tf.ready) await tf.ready();
  })();
  return tfReady;
}
async function ensureModel(engine){
  if(modelState[engine]) return modelState[engine];
  const p=(async()=>{
    try{ await ensureTf(); }catch(e){ throw new Error('TF: '+e.message); }
    if(engine==='coco'){
      try{ await loadScript(LIB.coco); }catch(e){ throw new Error('coco-lib: '+e.message); }
      if(typeof cocoSsd==='undefined') throw new Error('cocoSsd niet gedefinieerd (bestand ontbreekt?)');
      try{ return await cocoSsd.load({modelUrl:MODEL_URL.coco}); }catch(e){ throw new Error('coco-model: '+e.message); }
    } else {
      try{ await loadScript(LIB.mnet); }catch(e){ throw new Error('mnet-lib: '+e.message); }
      if(typeof mobilenet==='undefined') throw new Error('mobilenet niet gedefinieerd (bestand ontbreekt?)');
      try{ return await mobilenet.load({version:2,alpha:1.0,inputRange:[0,1],modelUrl:MODEL_URL.mnet}); }catch(e){ throw new Error('mnet-model: '+e.message); }
    }
  })();
  modelState[engine]=p;
  try{ return await p; }catch(e){ modelState[engine]=null; throw e; }
}
function preloadEnabledModels(){
  const engines=new Set();
  alarms.filter(a=>a.enabled&&a.cameraOn).forEach(a=>{
    if(a.object===RANDOM_ID){ engines.add('coco'); engines.add('mnet'); }
    else engines.add(objById(a.object).engine);
  });
  engines.forEach(e=>ensureModel(e).catch(()=>{}));
}

/* =======================================================================
   Camera + detectie-sessie
   ======================================================================= */
class Detector{
  constructor(video,canvas,obj,cbs){
    this.video=video; this.canvas=canvas; this.obj=obj; this.cbs=cbs||{};
    this.stream=null; this.model=null; this.running=false; this.meter=0; this.lastTop='';
  }
  async start(){
    try{
      this.stream=await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ideal:'environment'} }, audio:false });
    }catch(e){ this.cbs.onError && this.cbs.onError('camera'); return; }
    this.video.srcObject=this.stream; this.video.setAttribute('playsinline','');
    try{ await this.video.play(); }catch{}
    this.cbs.onCamera && this.cbs.onCamera();
    try{ this.model=await ensureModel(this.obj.engine); }
    catch(e){ this.cbs.onError && this.cbs.onError('model', e); return; }
    this.cbs.onReady && this.cbs.onReady();
    this.running=true; this.loop();
  }
  async loop(){
    if(!this.running) return;
    const t0=performance.now();
    let info={hit:false,score:0,label:'',boxes:[]};
    try{ info=await this.detect(); }catch{}
    if(this.running){
      this.meter = info.hit ? Math.min(HOLD_TARGET,this.meter+1) : Math.max(0,this.meter-1);
      this.draw(info);
      this.cbs.onTick && this.cbs.onTick(this.meter/HOLD_TARGET, info);
      if(this.meter>=HOLD_TARGET){
        const allowed = this.cbs.canSucceed ? this.cbs.canSucceed() : true;
        if(allowed){ this.running=false; this.cbs.onSuccess && this.cbs.onSuccess(); return; }
        // nog vergrendeld: blijf kijken, laat de balk vol staan
        this.cbs.onHold && this.cbs.onHold();
      }
    }
    const dt=performance.now()-t0;
    setTimeout(()=>this.loop(), Math.max(0,DETECT_MS-dt));
  }
  async detect(){
    if(this.obj.engine==='coco'){
      const preds=await this.model.detect(this.video,8);
      const m=preds.filter(p=>this.obj.match.includes(p.class)&&p.score>=COCO_MIN);
      const top=preds[0];
      return { hit:m.length>0, score:m[0]?m[0].score:(top?top.score:0), label:top?top.class:'', boxes:m.map(p=>p.bbox) };
    } else {
      const preds=await this.model.classify(this.video,3);
      let hit=false,score=0;
      for(const p of preds){ const name=p.className.toLowerCase(); if(this.obj.match.some(mm=>name.includes(mm))){ if(p.probability>=MNET_MIN){hit=true;score=Math.max(score,p.probability);} } }
      return { hit, score, label:preds[0]?preds[0].className.split(',')[0]:'', boxes:[] };
    }
  }
  draw(info){
    const c=this.canvas, v=this.video;
    if(!v.videoWidth) return;
    const cw=c.clientWidth, ch=c.clientHeight;
    if(!cw||!ch) return;
    c.width=cw; c.height=ch;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,cw,ch);
    if(info.boxes && info.boxes.length){
      const scale=Math.max(cw/v.videoWidth, ch/v.videoHeight);
      const ox=(cw-v.videoWidth*scale)/2, oy=(ch-v.videoHeight*scale)/2;
      ctx.lineWidth=Math.max(3,cw*0.012); ctx.strokeStyle='#43c08a'; ctx.fillStyle='rgba(67,192,138,.15)';
      info.boxes.forEach(b=>{
        const x=ox+b[0]*scale, y=oy+b[1]*scale, w=b[2]*scale, h=b[3]*scale;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(x,y,w,h,12); else ctx.rect(x,y,w,h);
        ctx.fill(); ctx.stroke();
      });
    }
  }
  stop(){
    this.running=false;
    if(this.stream){ this.stream.getTracks().forEach(t=>t.stop()); this.stream=null; }
    if(this.video) this.video.srcObject=null;
  }
}

/* =======================================================================
   Test-scherm
   ======================================================================= */
let testDetector=null;
function openTest(objectId, pool){
  const obj = objectId===RANDOM_ID ? pickRandomObject(null, pool) : objById(objectId);
  $('testTitle').textContent = objectId===RANDOM_ID ? 'Test 🎲 '+obj.label : 'Test: '+obj.label;
  $('testMsg').innerHTML=`<div class="spinner"></div><div>Camera starten…</div>`;
  $('testDot').className='status-dot'; $('testStatusText').textContent='Camera starten…'; $('testPill').textContent='';
  showScreen('screen-test'); pushScreen('test');
  testDetector=new Detector($('testVideo'),$('testCanvas'),obj,{
    onCamera:()=>{ $('testMsg').innerHTML=`<div class="spinner"></div><div>Model laden…</div>`; $('testStatusText').textContent='Model laden…'; },
    onReady:()=>{ $('testMsg').innerHTML=''; $('testDot').className='status-dot live'; $('testStatusText').textContent=`Richt op ${obj.icon} ${obj.label}`; },
    onError:(w,e)=>{ $('testMsg').innerHTML=`<div style="padding:0 18px;font-size:13px;line-height:1.5">⚠️ ${w==='camera'?'Geen toegang tot de camera.':'Model kon niet laden.<br><span style="opacity:.8">'+((e&&e.message)||'onbekende fout').replace(/</g,'&lt;')+'</span>'}</div>`; $('testStatusText').textContent='Mislukt'; },
    onTick:(prog,info)=>{
      $('testPill').textContent = info.label ? `${info.label} ${(info.score*100|0)}%` : '';
      if(prog>=1){ $('testDot').className='status-dot hit'; $('testStatusText').textContent='✓ Herkend! Alarm zou nu uitgaan.'; }
      else if(info.hit){ $('testDot').className='status-dot hit'; $('testStatusText').textContent='Even vasthouden…'; }
      else { $('testDot').className='status-dot live'; $('testStatusText').textContent=`Richt op ${obj.icon} ${obj.label}`; }
    },
    onSuccess:()=>{ $('testDot').className='status-dot hit'; $('testStatusText').textContent='✓ Herkend!'; if(navigator.vibrate) navigator.vibrate(120); const d=testDetector; setTimeout(()=>{ if(testDetector===d && d){ d.meter=0; d.running=true; d.loop(); } },1200); }
  });
  testDetector.start();
}
function closeTest(){ if(testDetector){ testDetector.stop(); testDetector=null; } hideScreen('screen-test'); }
$('testBack').onclick=()=>history.back();

/* =======================================================================
   Afgaan-scherm
   ======================================================================= */
let ringDetector=null, ringSession=null, snoozeTimers=[], ringFallbackTimer=null, ringCountdownTimer=null, ringUnlocked=false, ringHeld=false;

function fireAlarm(a, opts){
  opts=opts||{};
  if(ringing) return;
  ringing=true;
  if(sheetOpen){ doCloseSheet(); if(navStack.length && navStack[navStack.length-1].type==='sheet') navStack.pop(); }
  const obj = a.object===RANDOM_ID ? pickRandomObject(opts.prevObjId, a.randomPool) : objById(a.object);
  ringSession={ alarm:a, obj, snoozeLeft: (opts.snoozeLeft!=null) ? opts.snoozeLeft : (a.snooze.enabled?1:0) };
  ringUnlocked=false; ringHeld=false;

  $('ringTime').textContent=`${pad(a.hour)}:${pad(a.minute)}`;
  const now=new Date();
  $('ringDate').textContent=`${['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'][now.getDay()]} ${now.getDate()} ${MON_SHORT[now.getMonth()]}`;
  $('ringName').textContent=a.name||'';

  showScreen('screen-ring'); history.pushState({ring:true},'');
  requestWakeLock();

  if(a.soundOn) playSound(soundById(a.sound),{gradual:a.gradual});
  if(a.vibeOn) startVibe(vibeById(a.vibe));
  showNotification(a, obj);

  buildRingBottom(a);

  const dice = a.object===RANDOM_ID ? '🎲 ' : '';
  const lockEnd = Date.now() + DISMISS_LOCK_MS;
  const camWrap=$('ringCamWrap');

  const onUnlock=()=>{
    if(ringUnlocked) return;
    ringUnlocked=true;
    if(ringCountdownTimer){ clearInterval(ringCountdownTimer); ringCountdownTimer=null; }
    if(a.cameraOn){
      $('ringInstruct').innerHTML=`${dice}Richt de camera op <span class="target">${obj.icon} ${obj.label}</span> om uit te zetten`;
      ringFallbackTimer=setTimeout(()=>revealStop(a), ESCAPE_AFTER_UNLOCK_MS);
    } else {
      $('ringInstruct').innerHTML='Je mag het alarm nu uitzetten';
      const stop=el('button','ring-stop','Stop'); stop.onclick=()=>dismissAlarm(); $('ringBottom').appendChild(stop);
    }
  };
  const updLock=()=>{
    const rem=lockEnd-Date.now();
    if(rem<=0){ onUnlock(); return; }
    const s=Math.ceil(rem/1000), mm=Math.floor(s/60), ss=s%60;
    if(a.cameraOn && ringHeld) $('ringInstruct').innerHTML=`Herkend ✓ · uitzetten over <span class="target">${mm}:${pad(ss)}</span>`;
    else $('ringInstruct').innerHTML=`${dice}Uitzetten kan over <span class="target">${mm}:${pad(ss)}</span>`;
  };
  updLock(); ringCountdownTimer=setInterval(updLock,1000);

  if(a.cameraOn){
    $('ringCamMsg').innerHTML=`<div class="spinner"></div><div>Camera starten…</div>`;
    drawProgress(0);
    ringDetector=new Detector($('ringVideo'),$('ringCanvas'),obj,{
      onCamera:()=>{ $('ringCamMsg').innerHTML=`<div class="spinner"></div><div>Model laden…</div>`; },
      onReady:()=>{ $('ringCamMsg').innerHTML=''; },
      onError:(w,e)=>{ $('ringCamMsg').innerHTML=`<div style="padding:0 14px;font-size:12px;line-height:1.4">⚠️ ${w==='camera'?'Geen camera.':'Model laadt niet.<br>'+((e&&e.message)||'').replace(/</g,'&lt;')}</div>`; const wait=Math.max(0,lockEnd-Date.now()); ringFallbackTimer=setTimeout(()=>revealStop(a), wait); },
      canSucceed:()=>ringUnlocked,
      onTick:(prog,info)=>{
        ringHeld = prog>=1;
        drawProgress(prog);
        if(ringUnlocked && prog<1){
          $('ringInstruct').innerHTML = prog>0
            ? `Even vasthouden… <span class="target">${obj.icon} ${obj.label}</span>`
            : `Richt de camera op <span class="target">${obj.icon} ${obj.label}</span> om uit te zetten`;
        }
      },
      onSuccess:()=>{
        $('ringInstruct').innerHTML=`<span class="target ring-detected">✓ Herkend</span>`;
        drawProgress(1);
        if(camWrap){ camWrap.classList.remove('holding'); camWrap.classList.add('ok'); }
        const s=$('ringSuccess'); if(s) s.classList.add('show');
        if(navigator.vibrate) navigator.vibrate([60,50,120]);
        setTimeout(()=>dismissAlarm(), 700);
      }
    });
    ringDetector.start();
  } else {
    $('ringVideo').style.display='none'; $('ringCanvas').style.display='none'; $('ringBar').style.display='none';
    camWrap.style.background='var(--surface)';
    $('ringCamMsg').innerHTML=`<div style="font-size:64px">⏰</div>`;
  }
}

function buildRingBottom(a){
  const bottom=$('ringBottom'); bottom.innerHTML='';
  if(a.snooze.enabled && ringSession.snoozeLeft>0){
    const sn=el('button','ring-snooze',`💤 Sluimeren ${SNOOZE_MIN} min`);
    sn.onclick=()=>snoozeAlarm();
    bottom.appendChild(sn);
  }
  if(a.cameraOn){
    bottom.appendChild(el('div','ring-hint-audio','Geen geluid? Tik op het scherm.'));
  }
}
function revealStop(a){
  if(!ringing) return;
  if($('ringBottom').querySelector('.ring-stop')) return;
  const stop=el('button','ring-stop escape','Lukt herkennen niet? Stop');
  stop.onclick=()=>dismissAlarm();
  $('ringBottom').appendChild(stop);
}

function drawProgress(p){
  const bar=$('ringBar'); if(!bar) return;
  const span=bar.querySelector('span');
  if(span) span.style.width=Math.round(p*100)+'%';
  const wrap=$('ringCamWrap');
  if(wrap) wrap.classList.toggle('holding', p>0 && p<1);
}

function stopRingMedia(){
  stopSound(); stopVibe();
  if(ringFallbackTimer){ clearTimeout(ringFallbackTimer); ringFallbackTimer=null; }
  if(ringCountdownTimer){ clearInterval(ringCountdownTimer); ringCountdownTimer=null; }
  ringUnlocked=false; ringHeld=false;
  if(ringDetector){ ringDetector.stop(); ringDetector=null; }
  $('ringVideo').style.display=''; $('ringCanvas').style.display=''; $('ringBar').style.display='';
  const rb=$('ringBar'); if(rb){ const sp=rb.querySelector('span'); if(sp) sp.style.width='0%'; }
  const rs=$('ringSuccess'); if(rs) rs.classList.remove('show');
  const rw=$('ringCamWrap'); if(rw) rw.classList.remove('holding','ok');
}

function dismissAlarm(){
  const a=ringSession ? ringSession.alarm : null;
  stopRingMedia();
  if(a){
    const real=alarms.find(x=>x.id===a.id);
    // eenmalig alarm (geen herhaaldagen) of alarm op een vaste datum: na afgaan uitzetten
    if(real && (!real.days || real.days.length===0)) real.enabled=false;
    save();
  }
  closeRing();
  if(navigator.vibrate) navigator.vibrate(60);
}
function snoozeAlarm(){
  const a=ringSession.alarm; const left=ringSession.snoozeLeft-1;
  const prevObjId = ringSession.obj ? ringSession.obj.id : null;
  stopRingMedia();
  closeRing();
  const t=setTimeout(()=>fireAlarm(a,{snoozeLeft:left, prevObjId}), SNOOZE_MIN*60000);
  snoozeTimers.push(t);
  const when=new Date(Date.now()+SNOOZE_MIN*60000);
  toast(`Sluimeren tot ${pad(when.getHours())}:${pad(when.getMinutes())} · daarna de camera`);
}
function closeRing(){
  ringing=false; ringSession=null;
  releaseWakeLock();
  $('ringBottom').innerHTML='';
  hideScreen('screen-ring');
  // history terugzetten naar startscherm
  if(history.state && history.state.ring){ suppressNextPop=true; history.back(); }
  renderHome(); refreshWakeLock();
}

/* notificatie als steun in de rug */
function showNotification(a, obj){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  const title=`${pad(a.hour)}:${pad(a.minute)}  ${a.name||'Alarm'}`;
  let body;
  if(!a.cameraOn) body='Tik om te stoppen';
  else if(a.object===RANDOM_ID) body='Pak je telefoon en kijk welk voorwerp je moet laten zien';
  else body=`Richt de camera op ${(obj||objById(a.object)).label}`;
  const opts={ body, tag:'cw-alarm', renotify:true, silent:true, icon:'./icon-192.png', badge:'./icon-192.png' };
  if(navigator.serviceWorker && navigator.serviceWorker.ready){
    navigator.serviceWorker.ready.then(r=>r.showNotification(title,opts)).catch(()=>{ try{ new Notification(title,opts); }catch{} });
  } else { try{ new Notification(title,opts); }catch{} }
}

/* =======================================================================
   Wake lock (scherm aan)
   ======================================================================= */
let wakeLock=null;
async function requestWakeLock(){
  if(!('wakeLock' in navigator)) return;
  try{ wakeLock=await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release',()=>{}); }catch{}
}
function releaseWakeLock(){ if(wakeLock){ try{ wakeLock.release(); }catch{} wakeLock=null; } }
function refreshWakeLock(){
  const need = ringing || alarms.some(a=>a.enabled);
  if(need && document.visibilityState==='visible'){ if(!wakeLock) requestWakeLock(); }
  else { if(!ringing) releaseWakeLock(); }
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ ensureAudio(); refreshWakeLock(); } });

/* =======================================================================
   Scheduler
   ======================================================================= */
function tick(){
  updateNextAlarm();
  if(ringing) return;
  const now=new Date();
  for(const a of alarms){
    if(!a.enabled) continue;
    if(now.getHours()!==a.hour || now.getMinutes()!==a.minute) continue;
    let applies;
    if(a.specificDate) applies = (a.specificDate===isoDate(now));
    else if(a.days && a.days.length) applies = a.days.includes(now.getDay());
    else applies = true;
    const occ=isoDate(now)+' '+a.hour+':'+a.minute;
    if(applies && a.lastFired!==occ){ a.lastFired=occ; save(); fireAlarm(a); break; }
  }
}

/* =======================================================================
   PWA-installatie
   ======================================================================= */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; });
function isIos(){ return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone; }
function maybeShowIosHint(){
  if(isIos() && !isStandalone() && !settings.bannerHidden){
    const h=$('iosHint'); h.classList.add('show');
  }
}

/* =======================================================================
   Instellingen / menu
   ======================================================================= */
function openMenu(){
  openSheet('Instellingen',(c)=>{
    const list=el('div','sheet-list');
    const item=(icon,label,fn)=>{ const it=el('div','sheet-item'); it.innerHTML=`<span class="ico">${icon}</span><div class="t">${label}</div>`; it.onclick=fn; return it; };
    list.appendChild(item('📷','Test objectherkenning',()=>{ closeSheet(); setTimeout(()=>openObjectTestChooser(),260); }));
    if(deferredPrompt) list.appendChild(item('⬇️','App installeren',async()=>{ closeSheet(); deferredPrompt.prompt(); deferredPrompt=null; }));
    list.appendChild(item('🔔','Notificaties toestaan',async()=>{ if('Notification'in window){ await Notification.requestPermission(); toast('Gereed'); } closeSheet(); }));
    list.appendChild(item('🗑️','Alle alarmen wissen',()=>{ if(confirm('Alle alarmen verwijderen?')){ alarms=[]; save(); renderHome(); refreshWakeLock(); } closeSheet(); }));
    list.appendChild(el('div','home-banner','Camera-Wekker · alle herkenning gebeurt op je toestel, er gaat geen beeld het internet op.'));
    c.appendChild(list);
  });
}
function openObjectTestChooser(){
  openSheet('Welk voorwerp testen?',(c)=>{
    const list=el('div','sheet-list');
    OBJECTS.filter(o=>o.group==='reco').forEach(o=>{
      const it=el('div','sheet-item'); it.innerHTML=`<span class="ico">${o.icon}</span><div class="t">${o.label}</div><span class="chev">›</span>`;
      it.onclick=()=>{ closeSheet(); setTimeout(()=>openTest(o.id),260); };
      list.appendChild(it);
    });
    c.appendChild(list);
  });
}

/* =======================================================================
   Init
   ======================================================================= */
function init(){
  load();
  renderHome();
  $('addBtn').onclick=()=>openEditor(null);
  $('edCancel').onclick=()=>history.back();
  $('edSave').onclick=()=>saveDraft();
  $('homeMenuBtn').onclick=openMenu;
  $('iosHintClose').onclick=()=>$('iosHint').classList.remove('show');

  // tik tijdens afgaan = geluid (her)starten, maar alleen als het nodig is
  $('screen-ring').addEventListener('click',()=>{
    if(!ringing || !ringSession || !ringSession.alarm.soundOn) return;
    const wasSuspended = !audioCtx || audioCtx.state!=='running';
    ensureAudio();
    if(wasSuspended || !soundActive) playSound(soundById(ringSession.alarm.sound),{gradual:false});
  });

  // audio opwarmen bij eerste aanraking
  const warm=()=>{ ensureAudio(); document.removeEventListener('pointerdown',warm); };
  document.addEventListener('pointerdown',warm);

  // basis-guard voor de terugknop op het startscherm
  history.replaceState({base:true},'');
  history.pushState({guard:true},'');

  setInterval(tick,1000);
  preloadEnabledModels();
  refreshWakeLock();
  maybeShowIosHint();

  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
}
document.addEventListener('DOMContentLoaded',init);

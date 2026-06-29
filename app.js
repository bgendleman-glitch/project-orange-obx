const CFG = window.PROJECT_ORANGE_CONFIG || {API_URL:'', CURRENT_SEASON_ID:'S_2026'};
const VOTE_MAP = {love:3, like:1, maybe:0, pass:-3};
const VOTE_LABEL = {3:'❤️ Love', 1:'👍 Like', 0:'🤔 Maybe', '-3':'👎 Pass'};
let db = {}; let online = false;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const num = v => Number(String(v ?? '').replace(/[$,% ,]/g,'')) || 0;
const norm = s => String(s || '').trim().replace(/\s+/g,' ');
const money = v => num(v) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(num(v)) : '—';
const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const titleCase = s => String(s||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

function canonNeighborhood(n){
  n=norm(n); const key=n.toLowerCase().replace(/[^a-z0-9]/g,'');
  const map={pineisland:'Pine Island',pineisand:'Pine Island',palmerisland:'Palmer Island',palmersisland:'Palmer Island',whalehead:'Whalehead',oceanhill:'Ocean Hill',oceansands:'Ocean Sands',oceansandsb:'Ocean Sands B',buckisland:'Buck Island',corolla:'Corolla',duck:'Duck',southnagshead:'South Nags Head',nagshead:'Nags Head',killdevilhills:'Kill Devil Hills',kdh:'Kill Devil Hills',fourseasons:'Four Seasons',southernshores:'Southern Shores',salvo:'Salvo'};
  if(!n || ['comments','people','yes','no','nan','none'].includes(key)) return '';
  return map[key] || titleCase(n);
}
function canonAgency(n){
  n=norm(n); const key=n.toLowerCase().replace(/[^a-z0-9]/g,'');
  const map={twiddy:'Twiddy',brindley:'Brindley',brindleybeach:'Brindley',carolinadesigns:'Carolina Designs',carolinades:'Carolina Designs',beachrealty:'Beach Realty',kees:'KEES',villagerealty:'Village Realty',vrbo:'VRBO',airbnb:'Airbnb',corollaclassic:'Corolla Classic',joelamb:'Joe Lamb',joelambjr:'Joe Lamb',outerbanksblue:'Outer Banks Blue',resortrealty:'Resort Realty',sunrealty:'Sun Realty'};
  if(!n || ['comments','people','yes','no','nan','none'].includes(key)) return '';
  return map[key] || titleCase(n);
}
function dirtyName(n){n=String(n||''); return !n.trim() || n.length>75 || /[?#=]/.test(n) || /(checkin|checkout|previous page|federated|source impression|rcav|chkin|chkout|search mode)/i.test(n)}
function cleanHouseName(name,url){
  const n=norm(name); if(n && !dirtyName(n)) return n;
  try{const u=new URL(String(url||'')); const parts=u.pathname.split('/').filter(Boolean).map(decodeURIComponent); let slug=parts.at(-1)||parts.at(-2)||''; if(u.hostname.includes('airbnb')) return `Airbnb Listing ${parts[1]||parts[0]||''}`.trim(); if(u.hostname.includes('vrbo')) return `VRBO Listing ${parts[0]||''}`.trim(); if(u.hostname.includes('surforsound')) return `Surf or Sound Listing ${slug||''}`.trim(); slug=slug.replace(/\.html?$/i,'').replace(/^[a-z]{0,4}\d+[a-z]?[-_]?/i,'').replace(/[-_]+/g,' ').trim(); return slug?titleCase(slug):(n||'Unnamed Listing');}catch(e){return n?n.slice(0,70):'Unnamed Listing'}
}

async function init(){ bindNav(); bindForms(); await loadData(); renderAll(); }
async function loadData(){
  try{
    if(CFG.API_URL){const r=await fetch(CFG.API_URL+'?action=getData&cache='+Date.now()); const j=await r.json(); if(j.ok){db=normalize(j.data); online=true; return;}}
  }catch(e){console.warn('Live API unavailable; using sample data',e)}
  const local=await fetch('data/sample-data.json').then(r=>r.json()); db=normalize(local.data); online=false;
}
function normalize(data){
  data=data||{};
  data.Houses=(data.Houses||[]).map(h=>({...h,DisplayName:cleanHouseName(h.HouseName,h.ListingURL||h.HouseLink),Neighborhood:canonNeighborhood(h.Neighborhood),Agency:canonAgency(h.Agency)}));
  data.HouseSeasons=(data.HouseSeasons||[]).map(r=>({...r,Status: norm(r.Status||'WATCH').toUpperCase()}));
  return data;
}

function bindNav(){
  $$('.nav').forEach(b=>b.onclick=()=>{ $$('.nav').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.view').forEach(v=>v.classList.add('hidden')); $('#view-'+b.dataset.view).classList.remove('hidden'); $('#title').textContent=({'today':'Today’s Decision','houses':'Houses','group':'Group Picks','market':'Market','history':'History','admin':'Admin'})[b.dataset.view]||'Project Orange'; });
  $('#refreshBtn').onclick=async()=>{await loadData(); renderAll();};
  $('#addHouseBtn').onclick=()=>{$$('.view').forEach(v=>v.classList.add('hidden')); $('#view-admin').classList.remove('hidden'); $$('.nav').forEach(x=>x.classList.remove('active')); $('[data-view="admin"]').classList.add('active'); $('#title').textContent='Admin';};
  $('#search').oninput=renderDecisionBoard; $('#statusFilter').onchange=renderDecisionBoard;
}
function bindForms(){
  $('#priceForm').onsubmit=async e=>{e.preventDefault();const p=formObj(e.target);const h=house(p.HouseID);p.HouseName=hname(h);p.SeasonID=CFG.CURRENT_SEASON_ID;await post('addPrice',p);await loadData();renderAll();e.target.reset();};
  $('#houseForm').onsubmit=async e=>{e.preventDefault();const p=formObj(e.target);p.SeasonID=CFG.CURRENT_SEASON_ID;await post('addHouse',p);await loadData();renderAll();e.target.reset();};
  $('#statusForm').onsubmit=async e=>{e.preventDefault();const p=formObj(e.target);await post('updateStatus',p);await loadData();renderAll();e.target.reset();};
}
function formObj(f){return Object.fromEntries(new FormData(f).entries())}
async function post(action,payload){
  if(!CFG.API_URL){alert('No Apps Script API URL configured. Update config.js first.');return;}
  const body={action,payload}; if(CFG.PIN_REQUIRED) body.pin=prompt('Project Orange PIN');
  const r=await fetch(CFG.API_URL,{method:'POST',body:JSON.stringify(body)}); const j=await r.json(); if(!j.ok) alert('Save failed: '+j.error);
}
async function vote(houseId,person,kind){
  if(!person){person=prompt('Who is voting? Caitlin, Sarah, Claudine, Jenn, or Brent'); if(!person) return;}
  const h=house(houseId); await post('addVote',{SeasonID:CFG.CURRENT_SEASON_ID,HouseID:houseId,HouseName:hname(h),Person:person,Vote:VOTE_MAP[kind],VoteType:kind,Comments:VOTE_LABEL[VOTE_MAP[kind]]}); await loadData(); renderAll();
}
window.vote=vote;

function house(id){return (db.Houses||[]).find(h=>String(h.HouseID)===String(id))||{};}
function hname(h){return h.DisplayName||h.HouseName||'Unnamed House'}
function seasonRows(){return (db.HouseSeasons||[]).filter(r=>String(r.SeasonID)===String(CFG.CURRENT_SEASON_ID));}
function votes(){return (db.Votes||[]).filter(v=>String(v.SeasonID)===String(CFG.CURRENT_SEASON_ID));}
function houseVotes(id){return votes().filter(v=>String(v.HouseID)===String(id));}
function avgVote(id){const v=houseVotes(id); return v.length?v.reduce((a,r)=>a+num(r.Vote),0)/v.length:0;}
function loveCount(id){return houseVotes(id).filter(v=>num(v.Vote)>=2).length;}
function statusClass(s){s=String(s||'').toLowerCase(); if(s.includes('booked'))return 'booked'; if(s.includes('eliminated'))return 'eliminated'; if(s.includes('buy')||s.includes('winner'))return 'buy'; if(s.includes('short'))return 'shortlist'; if(s.includes('negotiate'))return 'negotiate'; if(s.includes('pass'))return 'pass'; return 'watch';}
function lost(r){return ['BOOKED','ELIMINATED','PASS'].includes(String(r.Status||'').toUpperCase());}
function score(r){return Math.round(num(r.OverallScore||70)+(avgVote(r.HouseID)*4)+(num(r.ValueScore||70)-70)*.18+(String(r.Status).includes('BUY')?5:0)+(lost(r)?-80:0));}
function ranked(includeLost=true){let rows=seasonRows().map(r=>({...r,house:house(r.HouseID),score:score(r),avgVote:avgVote(r.HouseID),loves:loveCount(r.HouseID)})); if(!includeLost) rows=rows.filter(r=>!lost(r)); return rows.sort((a,b)=>b.score-a.score);}

function renderAll(){renderKpis();renderRecommendation();renderActivity();renderDecisionBoard();renderHouseCards();renderGroup();renderMarket();renderHistory();renderForms();renderDataHealth();}
function renderKpis(){
  const active=ranked(false), all=ranked(true); const ocean=active.filter(r=>String(r.house.Oceanfront||'').toLowerCase().startsWith('yes')).length; const lostCt=all.filter(lost).length; const best=active[0]; const value=[...active].sort((a,b)=>num(b.ValueScore)-num(a.ValueScore))[0];
  const kpis=[['Active Houses',active.length,'still in play'],['Oceanfront',ocean,'active options'],['Best Buy',best?hname(best.house):'—',best?money(best.CurrentTotal):'—'],['Value Leader',value?hname(value.house):'—',value?money(value.CurrentTotal):'—'],['Lost / Eliminated',lostCt,'kept for history'],['Data Source',online?'Live':'Sample','Google Sheets status']];
  $('#kpis').innerHTML=kpis.map(k=>`<div class="kpi"><label>${k[0]}</label><b>${esc(k[1])}</b><p>${esc(k[2])}</p></div>`).join('');
  $('#liveBadge').textContent=online?'Live Google Sheets':'Sample Data'; $('#liveBadge').className='badge '+(online?'buy':'watch');
}
function renderRecommendation(){
  const rows=ranked(false); const best=rows[0], watch=rows.find(r=>/WATCH|NEGOTIATE|WAIT/.test(r.Status||''));
  if(!best){$('#recommendation').innerHTML='<div class="empty">No active houses yet.</div>';return;}
  $('#recommendation').innerHTML=`<div class="hero-rec"><div class="rec-card"><span class="badge ${statusClass(best.Status)}">${esc(best.Status||'WATCH')}</span><h4>${linkHouse(best.house)}</h4><p>${esc(best.AnalystNotes||'Current top option based on score, value, and group interest.')}</p><div class="money-row"><div><span>Total</span><b>${money(best.CurrentTotal)}</b></div><div><span>Target</span><b>${money(best.TargetPrice)}</b></div><div><span>Score</span><b>${best.score}</b></div></div></div>${watch&&watch.HouseID!==best.HouseID?`<div class="activity-item"><div class="activity-icon">🟡</div><div><b>Watch closely:</b> ${linkHouse(watch.house)}<br><span class="muted">${esc(watch.AnalystNotes||'Good option if the price moves.')}</span></div></div>`:''}</div>`;
}
function renderActivity(){
  const items=[]; const all=ranked(true); all.filter(lost).slice(0,4).forEach(r=>items.push(['❌',`${hname(r.house)} is ${r.Status.toLowerCase()}.`,r.AnalystNotes||'Keep it for history; do not delete.']));
  const prices=(db.PriceObservations||[]).filter(p=>String(p.SeasonID)===String(CFG.CURRENT_SEASON_ID)).sort((a,b)=>String(b.ObservationDate).localeCompare(String(a.ObservationDate))).slice(0,5); prices.forEach(p=>items.push(['📈',`${p.HouseName||hname(house(p.HouseID))}: ${money(p.TotalAmount)}`,p.Notes||p.ObservationDate||'Price observation']));
  votes().slice(-5).reverse().forEach(v=>items.push(['🗳️',`${v.Person} voted ${VOTE_LABEL[num(v.Vote)]||v.Vote} on ${v.HouseName||hname(house(v.HouseID))}`,v.Comments||'']));
  $('#activity').innerHTML=(items.slice(0,8).map(i=>`<div class="activity-item"><div class="activity-icon">${i[0]}</div><div><b>${esc(i[1])}</b><br><span class="muted">${esc(i[2])}</span></div></div>`).join(''))||'<div class="empty">No recent activity yet.</div>';
}
function renderDecisionBoard(){
  let rows=ranked(true); const q=($('#search')?.value||'').toLowerCase(); const f=$('#statusFilter')?.value||''; if(!f) rows=rows.filter(r=>!['PASS'].includes(r.Status)); else rows=rows.filter(r=>String(r.Status)===f); if(q) rows=rows.filter(r=>(JSON.stringify(r)+JSON.stringify(r.house)).toLowerCase().includes(q));
  $('#cards').innerHTML=rows.map((r,i)=>card(r,i+1)).join('')||'<div class="empty">No matching houses.</div>';
}
function renderHouseCards(){ $('#houseCards').innerHTML=ranked(true).sort((a,b)=>hname(a.house).localeCompare(hname(b.house))).map((r,i)=>card(r,'')).join(''); }
function card(r,rank){const h=r.house||{}; const st=statusClass(r.Status); const url=h.ListingURL||h.HouseLink||''; const gap=num(r.CurrentTotal)-num(r.TargetPrice); return `<article class="house-card ${lost(r)?'lost':''}"><div class="photo"><div class="rank">${rank||'🏠'}</div></div><div class="card-body"><div class="house-title"><h4>${linkHouse(h)}</h4><div class="score">${r.score}</div></div><div class="subline">${esc(h.Neighborhood||'Unknown area')} · ${esc(h.Agency||'Unknown agency')} · ${esc(h.Bedrooms||'—')} BR</div><div class="chips"><span class="chip ${st}">${esc(r.Status||'WATCH')}</span><span class="chip">🌊 ${esc(h.Oceanfront||'—')}</span><span class="chip">🏊 ${esc(h.Pool||'—')}</span><span class="chip">🛗 ${esc(h.Elevator||'—')}</span><span class="chip">❤️ ${r.loves}</span></div><div class="money-row"><div><span>Total</span><b>${money(r.CurrentTotal)}</b></div><div><span>Target</span><b>${money(r.TargetPrice)}</b></div><div><span>Gap</span><b>${gap?money(gap):'—'}</b></div></div><div class="notes">${esc(r.AnalystNotes||h.Notes||'No notes yet.')}</div><div class="vote-row"><button class="vote-btn love" onclick="vote('${esc(r.HouseID)}','','love')">❤️ Love</button><button class="vote-btn like" onclick="vote('${esc(r.HouseID)}','','like')">👍 Like</button><button class="vote-btn maybe" onclick="vote('${esc(r.HouseID)}','','maybe')">🤔 Maybe</button><button class="vote-btn pass" onclick="vote('${esc(r.HouseID)}','','pass')">👎 Pass</button></div><div class="card-actions">${url?`<a class="open-link" target="_blank" rel="noopener" href="${esc(url)}">Open Listing ↗</a>`:'<span class="muted">No URL</span>'}<span class="muted">Avg vote ${r.avgVote.toFixed(1)}</span></div></div></article>`;}
function linkHouse(h){const url=h.ListingURL||h.HouseLink||''; return url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(hname(h))}</a>`:esc(hname(h));}

function renderGroup(){
  const people=(db.People||[]).map(p=>p.PersonName||p.Person).filter(Boolean); const personList=people.length?people:['Caitlin','Sarah','Claudine','Jenn','Brent'];
  const rows=ranked(true); const html=personList.map(p=>{const pv=votes().filter(v=>String(v.Person).toLowerCase()===String(p).toLowerCase()).sort((a,b)=>num(b.Vote)-num(a.Vote)); return `<div class="person-card"><h4>${esc(p)}</h4>${pv.slice(0,6).map(v=>`<div>${VOTE_LABEL[num(v.Vote)]||v.Vote} ${esc(v.HouseName||hname(house(v.HouseID)))}</div>`).join('')||'<span class="muted">No votes yet</span>'}</div>`}).join('');
  $('#groupPicks').innerHTML=`<div class="person-grid">${html}</div><div class="panel" style="box-shadow:none;margin-top:18px"><h3>Consensus Ranking</h3><div class="table-wrap"><table><thead><tr><th>Rank</th><th>House</th><th>Score</th><th>Loves</th><th>Avg Vote</th><th>Status</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${linkHouse(r.house)}</td><td>${r.score}</td><td>${r.loves}</td><td>${r.avgVote.toFixed(1)}</td><td><span class="badge ${statusClass(r.Status)}">${esc(r.Status)}</span></td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderMarket(){
  const rows=ranked(false); const avg=rows.length?Math.round(rows.reduce((a,r)=>a+num(r.CurrentTotal),0)/rows.length):0; const maxDisc=rows.length?Math.max(...rows.map(r=>num(r.DiscountPct))):0; const prices=(db.PriceObservations||[]).filter(p=>String(p.SeasonID)===String(CFG.CURRENT_SEASON_ID)).sort((a,b)=>String(b.ObservationDate).localeCompare(String(a.ObservationDate)));
  $('#marketSnapshot').innerHTML=[['Avg Price',money(avg)],['Largest Discount',maxDisc+'%'],['Price Checks',prices.length],['Active Options',rows.length]].map(x=>`<div class="mini"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('');
  $('#pricesTable').innerHTML='<thead><tr><th>Date</th><th>House</th><th>Total</th><th>Discount</th><th>Notes</th></tr></thead><tbody>'+prices.map(p=>`<tr><td>${esc(p.ObservationDate)}</td><td>${esc(p.HouseName||hname(house(p.HouseID)))}</td><td>${money(p.TotalAmount)}</td><td>${esc(p.DiscountPct||'')}</td><td>${esc(p.Notes||'')}</td></tr>`).join('')+'</tbody>';
}
function renderHistory(){
  const seasons=(db.Seasons||[]).sort((a,b)=>String(a.SeasonID).localeCompare(String(b.SeasonID))); const evals=db.HistoricalEvaluations||[];
  $('#history').innerHTML=`<div class="panel"><h3>Syracuse Timeline</h3><div class="timeline">${seasons.map(s=>{const ev=evals.filter(e=>String(e.SeasonID)===String(s.SeasonID)); return `<div class="season"><h4>${esc(s.SeasonName||s.Year||s.SeasonID)} <span class="badge ${String(s.Status).toLowerCase().includes('skipped')?'booked':'watch'}">${esc(s.Status||'')}</span></h4><p class="muted">${esc(s.TargetWeek||s.Notes||'')}</p>${ev.slice(0,4).map(e=>`<div>🏠 <b>${esc(e.HouseName||'House')}</b> — ${esc(e.Comments||e.Notes||'')}</div>`).join('')}</div>`}).join('')}</div></div>`;
}
function renderForms(){
  const opts=ranked(true).map(r=>`<option value="${esc(r.HouseID)}">${esc(hname(r.house))}</option>`).join('');
  $$('#priceForm select[name="HouseID"]').forEach(s=>s.innerHTML=opts); 
  $('#statusForm select[name="HouseSeasonID"]').innerHTML=ranked(true).map(r=>`<option value="${esc(r.HouseSeasonID)}">${esc(hname(r.house))} — ${esc(r.Status)}</option>`).join('');
  const d=$('#priceForm input[name="ObservationDate"]'); if(d&&!d.value) d.value=new Date().toISOString().slice(0,10);
}
function renderDataHealth(){
  const dirty=(db.Houses||[]).filter(h=>dirtyName(h.HouseName)).length; const neighborhoods=[...new Set((db.Houses||[]).map(h=>h.Neighborhood).filter(Boolean))].length; const agencies=[...new Set((db.Houses||[]).map(h=>h.Agency).filter(Boolean))].length;
  $('#dataHealth').innerHTML=[['House Records',(db.Houses||[]).length],['Cleaned Names',dirty],['Neighborhoods',neighborhoods],['Agencies',agencies]].map(x=>`<div class="mini"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('');
}

init();

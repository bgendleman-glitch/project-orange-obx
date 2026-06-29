const CFG = window.PROJECT_ORANGE_CONFIG || {API_URL:'', CURRENT_SEASON_ID:'S_2026'};
const VOTERS = ['Caitlin','Sarah','Claudine','Jenn','Brent'];
let db = {}; let online = false;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const money = n => (n === '' || n == null || Number(n) === 0) ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n));
const num = n => Number(String(n ?? '').replace(/[$,]/g,'')) || 0;
const norm = s => String(s || '').trim().replace(/\s+/g,' ');
const LOST = ['BOOKED','ELIMINATED','PASS'];

function canonicalNeighborhood(n){
  n = norm(n); const key = n.toLowerCase().replace(/[^a-z0-9]/g,'');
  const map = {pineisand:'Pine Island', pineisland:'Pine Island', palmersisland:'Palmer Island', palmerisland:'Palmer Island', whalehead:'Whalehead', oceanhill:'Ocean Hill', oceansands:'Ocean Sands', oceansandsb:'Ocean Sands B', buckisland:'Buck Island', corollalight:'Corolla Light', corolla:'Corolla', duck:'Duck', southnagshead:'South Nags Head', nagshead:'Nags Head', killdevilhills:'Kill Devil Hills', kdh:'Kill Devil Hills', fourseasons:'Four Seasons', southernshores:'Southern Shores', salvo:'Salvo', hatteras:'Hatteras'};
  if(!n || ['people','comments','no','yes','nan','none'].includes(key)) return '';
  return map[key] || titleCase(n);
}
function canonicalAgency(n){
  n = norm(n); const key = n.toLowerCase().replace(/[^a-z0-9]/g,'');
  const map = {twiddy:'Twiddy', twiddyfriday:'Twiddy', brindley:'Brindley', brindleybeach:'Brindley', carolinades:'Carolina Designs', carolinadesign:'Carolina Designs', carolinadesigns:'Carolina Designs', carolinadesisn:'Carolina Designs', beachrealty:'Beach Realty', kees:'KEES', villagerealty:'Village Realty', vrbo:'VRBO', airbnb:'Airbnb', corollaclassic:'Corolla Classic', joelamb:'Joe Lamb', joelambjr:'Joe Lamb', outerbanksblue:'Outer Banks Blue', resortrealty:'Resort Realty', sunrealty:'Sun Realty'};
  if(!n || ['comments','people','no','yes','nan','none'].includes(key)) return '';
  return map[key] || titleCase(n);
}
async function init(){ bindNav(); bindForms(); await loadData(); renderAll(); }
async function loadData(){
  try{
    if(CFG.API_URL){
      const res = await fetch(CFG.API_URL + '?action=getData&cache=' + Date.now());
      const json = await res.json();
      if(json.ok){ db = normalizeData(json.data); online = true; return; }
    }
  }catch(e){ console.warn('Apps Script not available; loading local sample data.', e); }
  const local = await fetch('data/sample-data.json').then(r=>r.json());
  db = normalizeData(local.data); online = false;
}
function bindNav(){
  $$('.nav').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.nav').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    const v = btn.dataset.view; $$('.view').forEach(x=>x.classList.add('hidden')); $('#view-'+v).classList.remove('hidden');
    $('#title').textContent = ({war:"Today's Decision",houses:'House Database',prices:'Price History',votes:'Group Picks',intel:'Intelligence'})[v];
  }));
  $('#refreshBtn').onclick = async()=>{ await loadData(); renderAll(); };
  $('#addHouseBtn').onclick = ()=>$('#houseDialog').showModal();
  $('#search').oninput = renderWar; $('#statusFilter').onchange = renderWar;
}
function bindForms(){
  $('#voteForm').onsubmit = async e => { e.preventDefault(); const p = formObj(e.target); const house = houseById(p.HouseID); p.HouseName = houseName(house) || ''; p.SeasonID = CFG.CURRENT_SEASON_ID; p.VoteType = 'Current'; await post('addVote', p); await loadData(); renderAll(); e.target.reset(); };
  $('#priceForm').onsubmit = async e => { e.preventDefault(); const p = formObj(e.target); const house = houseById(p.HouseID); p.HouseName = houseName(house) || ''; p.SeasonID = CFG.CURRENT_SEASON_ID; await post('addPrice', p); await loadData(); renderAll(); e.target.reset(); };
  $('#houseForm').onsubmit = async e => { e.preventDefault(); const p = formObj(e.target); p.SeasonID = CFG.CURRENT_SEASON_ID; await post('addHouse', p); $('#houseDialog').close(); await loadData(); renderAll(); e.target.reset(); };
}
function formObj(form){ return Object.fromEntries(new FormData(form).entries()); }
async function post(action, payload){
  if(!CFG.API_URL){ alert('No Apps Script API_URL configured yet. Paste it into config.js.'); return {ok:false}; }
  const body = {action, payload}; if(CFG.PIN_REQUIRED) body.pin = prompt('Project Orange PIN');
  const res = await fetch(CFG.API_URL, {method:'POST', body:JSON.stringify(body)}); const json = await res.json();
  if(!json.ok) alert('Save failed: ' + json.error); return json;
}

function normalizeData(data){
  data = data || {};
  const houses = (data.Houses || []).map(h=>{ const clean = cleanHouseName(h.HouseName || '', h.ListingURL || h.HouseLink || ''); return {...h, DisplayName: clean, Neighborhood: canonicalNeighborhood(h.Neighborhood), Agency: canonicalAgency(h.Agency)}; });
  data.Houses = dedupeRows(houses, h => String(h.HouseID || houseName(h)).toLowerCase(), mergeHouseRows);
  data.Neighborhoods = buildNeighborhoods(data); data.Agencies = buildAgencies(data); return data;
}
function dedupeRows(rows, keyFn, mergeFn){ const m = new Map(); (rows||[]).forEach(r=>{ const k = keyFn(r); if(!k) return; m.set(k, m.has(k) ? mergeFn(m.get(k), r) : {...r}); }); return [...m.values()]; }
function mergeHouseRows(a,b){ const out = {...a}; Object.keys(b||{}).forEach(k=>{ if((out[k] == null || out[k] === '') && b[k] != null && b[k] !== '') out[k] = b[k]; }); out.DisplayName = cleanHouseName(out.DisplayName || out.HouseName, out.ListingURL || out.HouseLink || b.ListingURL || b.HouseLink || ''); out.Neighborhood = canonicalNeighborhood(out.Neighborhood || b.Neighborhood); out.Agency = canonicalAgency(out.Agency || b.Agency); return out; }
function buildNeighborhoods(data){
  const base = (data.Neighborhoods||[]).map(n=>({...n, NeighborhoodName: canonicalNeighborhood(n.NeighborhoodName || n.Neighborhood)})).filter(n=>n.NeighborhoodName);
  const fromHouses = (data.Houses||[]).map(h=>({NeighborhoodName: canonicalNeighborhood(h.Neighborhood), Notes:''})).filter(n=>n.NeighborhoodName);
  const by = new Map(); [...base, ...fromHouses].forEach(r=>{ const k=r.NeighborhoodName; const ex=by.get(k)||{NeighborhoodID:'N_'+k.toLowerCase().replace(/[^a-z0-9]/g,''),NeighborhoodName:k,BeachPrivacyScore:'',GroceryConvenienceScore:'',Notes:''}; by.set(k,{...ex,BeachPrivacyScore:ex.BeachPrivacyScore||r.BeachPrivacyScore||'',GroceryConvenienceScore:ex.GroceryConvenienceScore||r.GroceryConvenienceScore||'',Notes:[ex.Notes,r.Notes].filter(Boolean).join(' | ').split(' | ').filter((v,i,a)=>a.indexOf(v)===i).join(' | ')}); });
  return [...by.values()].sort((a,b)=>a.NeighborhoodName.localeCompare(b.NeighborhoodName));
}
function buildAgencies(data){
  const base = (data.Agencies||[]).map(a=>({...a, AgencyName: canonicalAgency(a.AgencyName || a.Agency)})).filter(a=>a.AgencyName);
  const fromHouses = (data.Houses||[]).map(h=>({AgencyName: canonicalAgency(h.Agency), Notes:''})).filter(a=>a.AgencyName);
  const by = new Map(); [...base, ...fromHouses].forEach(r=>{ const k=r.AgencyName; const ex=by.get(k)||{AgencyID:'A_'+k.toLowerCase().replace(/[^a-z0-9]/g,''),AgencyName:k,TypicalDiscount:'TBD from observed data',Notes:''}; by.set(k,{...ex,TypicalDiscount:ex.TypicalDiscount||r.TypicalDiscount||'TBD from observed data',Notes:[ex.Notes,r.Notes].filter(Boolean).join(' | ').split(' | ').filter((v,i,a)=>a.indexOf(v)===i).join(' | ')}); });
  return [...by.values()].sort((a,b)=>a.AgencyName.localeCompare(b.AgencyName));
}
function isDirtyHouseName(name){ const n = String(name || ''); return !n.trim() || n.length > 75 || /[?#=]/.test(n) || /(checkin|checkout|previous page|federated|source impression|rcav|chkin|chkout|search mode)/i.test(n); }
function cleanHouseName(name, url){
  const n = String(name || '').trim(); if(n && !isDirtyHouseName(n)) return n; const u=String(url||'');
  try{ const parsed=new URL(u); const host=parsed.hostname.toLowerCase(); const parts=parsed.pathname.split('/').filter(Boolean).map(x=>decodeURIComponent(x)); if(host.includes('airbnb')){const id=parts[1]||parts[0]||''; return id?`Airbnb Listing ${id}`:'Airbnb Listing';} if(host.includes('vrbo')){const id=parts[0]||''; return id?`VRBO Listing ${id}`:'VRBO Listing';} if(host.includes('surforsound')){const id=parts.at(-1)||''; return id?`Surf or Sound Listing ${id}`:'Surf or Sound Listing';} let slug=parts.at(-1)||parts.at(-2)||''; slug=slug.replace(/\.html?$/i,'').replace(/^[a-z]{0,4}\d+[a-z]?[-_]?/i,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim(); if(slug) return titleCase(slug);}catch(e){}
  return n ? n.slice(0,70) : 'Unnamed Historical Listing';
}
function titleCase(s){ return String(s||'').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()); }
function houseName(h){ return h?.DisplayName || h?.HouseName || ''; }
function houseById(id){ return (db.Houses||[]).find(h=>String(h.HouseID)===String(id)); }
function currentSeasonRows(){ return (db.HouseSeasons||[]).filter(r=>String(r.SeasonID)===String(CFG.CURRENT_SEASON_ID)); }
function currentVotes(){ return (db.Votes||[]).filter(v=>String(v.SeasonID)===String(CFG.CURRENT_SEASON_ID)); }
function votePoints(v){ const s=String(v??'').toLowerCase(); if(s==='love'||s==='3')return 3; if(s==='like'||s==='2')return 2; if(s==='maybe'||s==='1'||s==='0')return 0; if(s==='pass'||s==='-3')return -3; return num(v); }
function voteLabel(v){ const s=String(v??'').toLowerCase(); if(s==='love'||s==='3')return '❤️'; if(s==='like'||s==='2')return '👍'; if(s==='maybe'||s==='1'||s==='0')return '🤔'; if(s==='pass'||s==='-3')return '👎'; return v||''; }
function latestVoteObj(hid, person){ const rows=currentVotes().filter(v=>String(v.HouseID)===String(hid)&&String(v.Person)===person); return rows.length ? rows[rows.length-1] : null; }
function latestVote(hid, person){ const v=latestVoteObj(hid,person); return v ? voteLabel(v.Vote) : ''; }
function avgVote(houseId){ const latest = VOTERS.map(p=>latestVoteObj(houseId,p)).filter(Boolean); if(!latest.length) return 0; return latest.reduce((a,r)=>a+votePoints(r.Vote),0)/latest.length; }
function finalScore(row){ return Math.round(num(row.OverallScore) + avgVote(row.HouseID)*4 + (num(row.BuyScore)-70)*0.12); }
function linkedHouse(name, url){ return url ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>` : escapeHtml(name); }
function statusClass(s){ s=String(s||'').toLowerCase(); if(s.includes('buy'))return 'buy'; if(s.includes('short'))return 'shortlist'; if(s.includes('book')||s.includes('elimin')||s.includes('pass'))return 'pass'; if(s.includes('negotiate'))return 'negotiate'; return 'watch'; }
function isLost(row){ return LOST.includes(String(row.Status||'').toUpperCase()); }
function effectiveRank(row){ return num(row.ManualRank || row.FinalRank); }
function rowsRanked(){
  return currentSeasonRows().map(r=>({...r, house:houseById(r.HouseID), score:finalScore(r)})).sort((a,b)=>{
    const al=isLost(a), bl=isLost(b); if(al!==bl) return al?1:-1;
    const ar=effectiveRank(a), br=effectiveRank(b); if(ar && br && ar!==br) return ar-br; if(ar && !br) return -1; if(!ar && br) return 1;
    return b.score-a.score;
  });
}

function renderAll(){ renderKpis(); renderActivity(); renderWar(); renderTables(); renderForms(); renderIntel(); }
function renderKpis(){
  const rows=rowsRanked(); const active=rows.filter(r=>!isLost(r)); const ocean=active.filter(r=>String(r.house?.Oceanfront||'').toLowerCase().startsWith('yes')).length; const buys=active.filter(r=>String(r.Status||'').toUpperCase().includes('BUY')).length; const avgDisc=active.length?Math.round(active.reduce((a,r)=>a+num(r.DiscountPct),0)/active.length):0; const valueLeader=[...active].sort((a,b)=>num(b.ValueScore)-num(a.ValueScore))[0]; const bestOverall=active[0]; const lost=rows.length-active.length;
  const kpis=[['Active Houses',active.length,online?'Live from Google Sheets':'Sample/offline data'],['Oceanfront',ocean,'active season'],['Buy Today',buys,'status = BUY'],['Avg Discount',avgDisc+'%','observed/entered'],['Value Leader',houseName(valueLeader?.house)||valueLeader?.HouseName||'—',money(valueLeader?.CurrentTotal)],['Lost/Booked',lost,'kept for history']];
  $('#kpis').innerHTML=kpis.map(k=>`<div class="kpi"><label>${k[0]}</label><b>${k[1]}</b><p>${k[2]}</p></div>`).join('');
}
function renderActivity(){
  const rows=rowsRanked(); const lost=rows.filter(isLost).slice(0,3); const recentVotes=(currentVotes()||[]).slice(-4).reverse(); const recentPrices=(db.PriceObservations||[]).slice(-3).reverse();
  const items=[]; lost.forEach(r=>items.push(`❌ <b>${escapeHtml(houseName(r.house)||r.HouseName)}</b> marked ${escapeHtml(r.Status||'lost')}.`)); recentPrices.forEach(p=>items.push(`💰 <b>${escapeHtml(p.HouseName||'House')}</b> price check: ${money(p.TotalAmount||p.RentAmount)}.`)); recentVotes.forEach(v=>items.push(`${voteLabel(v.Vote)} <b>${escapeHtml(v.Person||'Someone')}</b> voted on <b>${escapeHtml(v.HouseName||'a house')}</b>.`));
  $('#activity').innerHTML = `<div class="panel activity-panel"><h3>What changed?</h3>${items.length?`<ul>${items.slice(0,6).map(i=>`<li>${i}</li>`).join('')}</ul>`:'<p class="muted">No recent activity yet.</p>'}</div>`;
}

function isNewHouse(row, index){
  const status = String(row.Status || '').toUpperCase();
  const candidate = String(row.CandidateType || '').toLowerCase();
  const h = row.house || {};
  const added = row.CreatedAt || row.AddedDate || h.CreatedAt || h.AddedDate || '';
  if (status === 'NEW' || candidate.includes('new')) return true;
  if (added) {
    const d = new Date(added);
    if (!isNaN(d)) return (Date.now() - d.getTime()) <= 7*24*60*60*1000;
  }
  return false;
}
function tierMeta(row, index){
  if(isLost(row)) return {cls:'tier-lost',label:'Lost',emoji:'⚫'};
  if(isNewHouse(row,index)) return {cls:'tier-new',label:'New',emoji:'🔵'};
  if(index < 3) return {cls:'tier-top',label:'Top 3',emoji:'🟢'};
  if(index < 6) return {cls:'tier-watch',label:'Next 3',emoji:'🟡'};
  return {cls:'tier-backup',label:'Backup',emoji:'🟠'};
}
function medalRank(index){ return index===0?'🥇':index===1?'🥈':index===2?'🥉':'#'+(index+1); }

function renderWar(){
  const q=($('#search')?.value||'').toLowerCase(); const status=$('#statusFilter')?.value||''; let rows=rowsRanked(); if(status) rows=rows.filter(r=>String(r.Status||'').toUpperCase()===status); if(q) rows=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q)||JSON.stringify(r.house||{}).toLowerCase().includes(q));
  $('#cards').innerHTML=rows.map((r,i)=>{ const h=r.house||{}; const url=h.ListingURL||h.HouseLink||''; const gap=num(r.CurrentTotal)-num(r.TargetPrice); const lost=isLost(r); const votes=VOTERS.map(p=>latestVote(r.HouseID,p)).filter(Boolean).join(' '); const tier=tierMeta(r,i);
    return `<article class="card decision-card ${tier.cls} ${lost?'lost-card':''}"><div class="tier-pill">${tier.emoji} ${tier.label}</div><div class="rank">${medalRank(i)}</div><h4>${linkedHouse(houseName(h)||r.HouseName,url)}</h4><div class="chips"><span class="chip ${statusClass(r.Status)}">${escapeHtml(r.Status||'WATCH')}</span><span class="chip">${escapeHtml(h.Neighborhood||'')}</span><span class="chip">${escapeHtml(h.Agency||'')}</span><span class="chip">${escapeHtml(h.Bedrooms||'')} BR</span><span class="chip">OF: ${escapeHtml(h.Oceanfront||'—')}</span></div><div class="metrics"><div class="metric"><span>Decision</span><b>${r.score}</b><div class="scorebar"><i style="width:${Math.min(100,r.score)}%"></i></div></div><div class="metric"><span>Current</span><b>${money(r.CurrentTotal)}</b></div><div class="metric"><span>Target Gap</span><b>${gap?money(gap):'—'}</b></div><div class="metric"><span>Value</span><b>${num(r.ValueScore)}</b></div><div class="metric"><span>Group</span><b>${votes || '—'}</b></div><div class="metric"><span>Manual</span><b>${effectiveRank(r)||'—'}</b></div></div><p class="note">${escapeHtml(r.AnalystNotes||h.Notes||'')}</p><div class="card-actions"><button onclick="moveHouse('${escapeAttr(r.HouseSeasonID)}',-1)">↑ Move Up</button><button onclick="moveHouse('${escapeAttr(r.HouseSeasonID)}',1)">↓ Move Down</button><button onclick="quickStatus('${escapeAttr(r.HouseSeasonID)}','SHORTLIST')">⭐ Shortlist</button><button onclick="quickStatus('${escapeAttr(r.HouseSeasonID)}','BOOKED')">Mark Booked</button><button onclick="quickStatus('${escapeAttr(r.HouseSeasonID)}','ELIMINATED')">Eliminate</button></div></article>`;
  }).join('') || '<p class="muted">No houses match.</p>';
}
window.quickStatus=async function(houseSeasonId,status){ const row=currentSeasonRows().find(r=>String(r.HouseSeasonID)===String(houseSeasonId)); const name=row?.HouseName||houseName(houseById(row?.HouseID)); if(!confirm(`Mark ${name} as ${status}?`)) return; await post('updateHouseSeason',{HouseSeasonID:houseSeasonId,Status:status}); await loadData(); renderAll(); };
window.moveHouse=async function(houseSeasonId,dir){
  const rows=rowsRanked().filter(r=>!isLost(r)); const idx=rows.findIndex(r=>String(r.HouseSeasonID)===String(houseSeasonId)); if(idx<0) return; const ni=idx+dir; if(ni<0||ni>=rows.length) return;
  const moving=rows[idx], other=rows[ni]; const mr=effectiveRank(moving)||idx+1; const or=effectiveRank(other)||ni+1;
  await post('updateHouseSeason',{HouseSeasonID:moving.HouseSeasonID,ManualRank:or});
  await post('updateHouseSeason',{HouseSeasonID:other.HouseSeasonID,ManualRank:mr});
  await loadData(); renderAll();
};
function renderTables(){
  const houses=(db.Houses||[]).filter(h=>houseName(h)).sort((a,b)=>houseName(a).localeCompare(houseName(b)));
  $('#housesTable').innerHTML=table(['House','Agency','Neighborhood','BR','Oceanfront','Pool','Elevator','Notes'],houses.map(h=>[linkedHouse(houseName(h),h.ListingURL||h.HouseLink),h.Agency,h.Neighborhood,h.Bedrooms,h.Oceanfront,h.Pool,h.Elevator,h.Notes]));
  const prices=(db.PriceObservations||[]).slice().reverse(); $('#pricesTable').innerHTML=table(['Date','House','Total','Discount','Notes'],prices.map(p=>[p.ObservationDate,escapeHtml(p.HouseName),money(p.TotalAmount||p.RentAmount),p.DiscountPct?num(p.DiscountPct)+'%':'',escapeHtml(p.Notes||'')]));
  const summary=rowsRanked().map(r=>[linkedHouse(houseName(r.house)||r.HouseName,r.house?.ListingURL||r.house?.HouseLink),...VOTERS.map(p=>latestVote(r.HouseID,p)),avgVote(r.HouseID).toFixed(1),effectiveRank(r)||'',r.score,escapeHtml(r.Status||'')]);
  $('#votesTable').innerHTML=table(['House',...VOTERS,'Consensus','Manual Rank','Decision Score','Status'],summary);
}
function table(headers, rows){ return `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c??''}</td>`).join('')}</tr>`).join('')}</tbody>`; }
function renderForms(){ const opts=rowsRanked().filter(r=>!isLost(r)).map(r=>`<option value="${escapeAttr(r.HouseID)}">${escapeHtml(houseName(r.house)||r.HouseName)}</option>`).join(''); $('#voteForm select[name=HouseID]').innerHTML=opts; $('#priceForm select[name=HouseID]').innerHTML=opts; $('#voteForm select[name=Person]').innerHTML=VOTERS.map(p=>`<option>${p}</option>`).join(''); $('#priceForm input[name=ObservationDate]').valueAsDate=new Date(); }
function renderIntel(){
  const hrows=db.Houses||[]; const neighborhoods=(db.Neighborhoods||[]).map(n=>{ const name=n.NeighborhoodName; const houses=hrows.filter(h=>h.Neighborhood===name); const active=rowsRanked().filter(r=>r.house?.Neighborhood===name && !isLost(r)); const avgCurrent=active.length?active.reduce((a,r)=>a+num(r.CurrentTotal),0)/active.length:0; const avgScore=active.length?active.reduce((a,r)=>a+r.score,0)/active.length:0; return [escapeHtml(name),houses.length,active.length,n.BeachPrivacyScore||'—',n.GroceryConvenienceScore||'—',avgCurrent?money(avgCurrent):'—',avgScore?Math.round(avgScore):'—',escapeHtml(compactNotes(n.Notes))]; });
  const agencies=(db.Agencies||[]).map(a=>{ const name=a.AgencyName; const houses=hrows.filter(h=>h.Agency===name); const active=rowsRanked().filter(r=>r.house?.Agency===name && !isLost(r)); const avgCurrent=active.length?active.reduce((x,r)=>x+num(r.CurrentTotal),0)/active.length:0; const avgDisc=active.length?active.reduce((x,r)=>x+num(r.DiscountPct),0)/active.length:0; return [escapeHtml(name),houses.length,active.length,avgCurrent?money(avgCurrent):'—',avgDisc?Math.round(avgDisc)+'%':'—',escapeHtml(a.TypicalDiscount||'TBD'),escapeHtml(compactNotes(a.Notes))]; });
  const lessons=(db.Lessons||[]).filter(x=>x.Theme||x.Evidence).slice(0,60).map(x=>[escapeHtml(cleanHouseName(x.HouseName||'', '')),escapeHtml(x.Theme||''),escapeHtml(x.Evidence||''),escapeHtml(x.Impact||'')]);
  const dna=(db.ValueModel||[]).map(x=>[escapeHtml(x.Category||''),escapeHtml(x.Weight||''),escapeHtml(x['Scoring Notes']||x.ScoringNotes||'')]);
  const panels=[['Neighborhood Intelligence',['Neighborhood','All Houses','Active','Beach Privacy','Grocery','Avg Price','Avg Score','Notes'],neighborhoods],['Agency Intelligence',['Agency','All Houses','Active','Avg Price','Avg Discount','Typical Pattern','Notes'],agencies],['Syracuse DNA',['Category','Weight','Scoring Notes'],dna],['Lessons Learned',['House','Theme','Evidence','Impact'],lessons]];
  $('#intel').innerHTML=`<div class="intel-grid">${panels.map(([title,headers,rows])=>`<div class="panel"><h3>${title}</h3><p class="muted">Normalized, deduped view.</p><div class="table-wrap"><table>${table(headers,rows)}</table></div></div>`).join('')}</div>`;
}
function compactNotes(notes){ const seen=[]; String(notes||'').split('|').map(x=>x.trim()).filter(Boolean).forEach(x=>{ if(!seen.includes(x)&&!/imported from historical/i.test(x)) seen.push(x); }); return seen.slice(0,3).join(' | '); }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,'&#39;'); }
init();

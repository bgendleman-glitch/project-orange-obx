const CONFIG = window.PROJECT_ORANGE_CONFIG || {};
const API_URL = CONFIG.API_URL || '';
const ACTIVE_SEASON_ID = CONFIG.ACTIVE_SEASON_ID || 'S_2026';
let state = { houses: [], houseSeasons: [], votes: [], prices: [], people: [], seasons: [], neighborhoods: [], agencies: [], historical: [], lessons: [] };
const voteScores = { LOVE: 4, LIKE: 3, MAYBE: 2, PASS: 0 };
const statusLabels = { BUY:'BUY', WATCH:'WATCH', NEGOTIATE:'NEGOTIATE', SHORTLIST:'SHORTLIST', ACTIVE:'ACTIVE', NEW:'NEW', BOOKED:'BOOKED', ELIMINATED:'ELIMINATED', PASS:'PASS', LOST:'LOST' };
const lostStatuses = new Set(['BOOKED','ELIMINATED','PASS','LOST']);

function qs(s){ return document.querySelector(s); }
function qsa(s){ return [...document.querySelectorAll(s)]; }
function money(n){ const x = Number(String(n||'').replace(/[^0-9.-]/g,'')); return x ? x.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}) : 'TBD'; }
function clean(v){ return (v ?? '').toString().trim(); }
function getId(row, keys){ for(const k of keys){ if(row[k]) return row[k]; } return ''; }
function normalizeRows(rows){ return (rows||[]).map(r=>{ const out={}; Object.keys(r||{}).forEach(k=>out[clean(k)] = r[k]); return out; }); }

function api(action, payload={}){
  if(!API_URL || API_URL.includes('PASTE_')) return Promise.reject(new Error('Missing API_URL in config.js'));
  return new Promise((resolve,reject)=>{
    const cb = 'po_cb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('callback', cb);
    url.searchParams.set('payload', JSON.stringify(payload));
    window[cb] = (res)=>{ cleanup(); res && res.ok ? resolve(res.data) : reject(new Error((res&&res.error)||'API error')); };
    function cleanup(){ delete window[cb]; script.remove(); }
    script.onerror = ()=>{ cleanup(); reject(new Error('Could not reach Google Apps Script API. Check deployment permissions.')); };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function loadData(){
  try{
    setStatus('Loading live Google Sheet data…');
    const data = await api('getData', { seasonId: ACTIVE_SEASON_ID });
    state = normalizeData(data);
    setStatus('Live Google Sheet data');
    render();
  } catch(err){
    console.error(err);
    setStatus('Error: ' + err.message);
    toast(err.message);
    try{ await loadFallback(); }catch(e){}
  }
}
async function loadFallback(){
  const res = await fetch('data/sample-data.json');
  if(res.ok){ state = normalizeData(await res.json()); setStatus('Sample data fallback'); render(); }
}
function normalizeData(data){
  return {
    houses: normalizeRows(data.houses || data.Houses),
    houseSeasons: normalizeRows(data.houseSeasons || data.HouseSeasons),
    votes: normalizeRows(data.votes || data.Votes),
    prices: normalizeRows(data.prices || data.PriceObservations),
    people: normalizeRows(data.people || data.People),
    seasons: normalizeRows(data.seasons || data.Seasons),
    neighborhoods: normalizeRows(data.neighborhoods || data.Neighborhoods),
    agencies: normalizeRows(data.agencies || data.Agencies),
    historical: normalizeRows(data.historical || data.HistoricalEvaluations),
    lessons: normalizeRows(data.lessons || data.Lessons)
  };
}
function setStatus(s){ const el=qs('#dataStatus'); if(el) el.textContent=s; }
function toast(msg){ const t=qs('#toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),3500); }

function activeRecords(){
  const housesById = new Map(state.houses.map(h=>[getId(h,['HouseID','HouseId','ID']), h]));
  const votesByHs = groupBy(state.votes, v=>getId(v,['HouseSeasonID','HouseSeasonId']));
  const pricesByHs = groupBy(state.prices, p=>getId(p,['HouseSeasonID','HouseSeasonId']));
  return state.houseSeasons
    .filter(hs => !ACTIVE_SEASON_ID || clean(hs.SeasonID || hs.SeasonId) === ACTIVE_SEASON_ID || !hs.SeasonID)
    .map(hs=>{
      const house = housesById.get(clean(hs.HouseID || hs.HouseId)) || {};
      const id = getId(hs,['HouseSeasonID','HouseSeasonId','ID']) || `${house.HouseID||house.HouseId}_${hs.SeasonID||ACTIVE_SEASON_ID}`;
      const vv = votesByHs.get(id) || [];
      const pp = pricesByHs.get(id) || [];
      const voteAvg = vv.length ? vv.reduce((s,v)=>s+(voteScores[clean(v.Vote).toUpperCase()] ?? Number(v.Score||0)),0)/vv.length : 0;
      const currentPrice = clean(hs.CurrentPrice || hs.TotalPrice || hs.Price) || latestPrice(pp);
      const manual = Number(hs.ManualRank || hs.Priority || hs.Rank || 999);
      const overall = Number(hs.OverallScore || hs.BuyScore || hs.ValueScore || 0);
      const status = clean(hs.Status || 'ACTIVE').toUpperCase();
      return { id, hs, house, votes: vv, prices: pp, voteAvg, currentPrice, manual, overall, status,
        sortScore: (lostStatuses.has(status)?-1000:0) + (manual && manual<999 ? 1000-manual : 0) + voteAvg*20 + overall };
    })
    .sort((a,b)=> b.sortScore-a.sortScore || a.manual-b.manual || houseName(a).localeCompare(houseName(b)));
}
function latestPrice(pp){ if(!pp.length) return ''; return pp.slice().sort((a,b)=> new Date(b.Date||b.ObservationDate)-new Date(a.Date||a.ObservationDate))[0].Price || ''; }
function groupBy(arr, fn){ const m=new Map(); arr.forEach(x=>{ const k=fn(x); if(!m.has(k))m.set(k,[]); m.get(k).push(x); }); return m; }
function houseName(r){ return clean(r.house.HouseName || r.house.Name || r.hs.HouseName || r.hs.Name || 'Unnamed House'); }
function listingUrl(r){ return clean(r.house.ListingURL || r.house.URL || r.hs.ListingURL || r.hs.URL || ''); }
function tierFor(r, idx){ if(lostStatuses.has(r.status)) return 'tier-gray'; if(isNew(r)) return 'tier-blue'; if(idx<3) return 'tier-green'; if(idx<6) return 'tier-yellow'; return 'tier-orange'; }
function isNew(r){ return clean(r.status)==='NEW' || clean(r.hs.IsNew).toUpperCase()==='TRUE' || clean(r.hs.New).toUpperCase()==='TRUE'; }
function statusBadge(r){ const s=statusLabels[r.status] || r.status || 'ACTIVE'; const cls= lostStatuses.has(r.status)?'gray': r.status==='BUY'?'green': r.status==='WATCH'?'yellow': r.status==='NEW'?'blue': r.status==='NEGOTIATE'?'orange':'gray'; return `<span class="badge ${cls}">${s}</span>`; }
function rankLabel(i){ return i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1); }
function voteSummary(r){ if(!r.votes.length) return 'No votes yet'; const counts = {LOVE:0,LIKE:0,MAYBE:0,PASS:0}; r.votes.forEach(v=>{ const vv=clean(v.Vote).toUpperCase(); if(counts[vv]!==undefined) counts[vv]++; }); return `❤️ ${counts.LOVE} · 👍 ${counts.LIKE} · 🤔 ${counts.MAYBE} · 👎 ${counts.PASS}`; }

function render(){ renderDashboard(); renderHouses(); renderVotes(); renderMarket(); renderHistory(); }
function renderDashboard(){
  const recs = activeRecords(); const active = recs.filter(r=>!lostStatuses.has(r.status));
  const kpi = `
    <div class="kpis">
      <div class="kpi"><small>Active Houses</small><b>${active.length}</b></div>
      <div class="kpi"><small>Oceanfront</small><b>${active.filter(r=>/yes|true|oceanfront/i.test(clean(r.house.Oceanfront||r.hs.Oceanfront))).length}</b></div>
      <div class="kpi"><small>Value Leader</small><b>${houseName(active[0]||{})}</b></div>
      <div class="kpi"><small>Lost / Booked</small><b>${recs.filter(r=>lostStatuses.has(r.status)).length}</b></div>
      <div class="kpi"><small>Votes</small><b>${state.votes.length}</b></div>
    </div>`;
  const top = `<div class="panel"><h3>Today's Recommendation</h3><div class="grid">${active.slice(0,6).map(card).join('')}</div></div>`;
  const activity = renderActivity(recs);
  qs('#dashboard').innerHTML = kpi + top + activity;
}
function renderHouses(){ const recs=activeRecords(); qs('#houses').innerHTML = `<div class="grid">${recs.map(card).join('')}</div>`; }
function card(r, idx){ if(idx===undefined){ idx=activeRecords().findIndex(x=>x.id===r.id); }
  const name=houseName(r), url=listingUrl(r), href=url?`href="${url}" target="_blank" rel="noopener"`:'';
  const beds=clean(r.house.Bedrooms||r.hs.Bedrooms||''); const area=clean(r.house.Neighborhood||r.house.Area||r.hs.Neighborhood||r.hs.Area||'');
  const agency=clean(r.house.Agency||r.hs.Agency||''); const notes=clean(r.hs.AnalystNotes||r.hs.Notes||r.house.Notes||'');
  return `<article class="card ${tierFor(r,idx)}" data-id="${r.id}">
    <div class="rank">${rankLabel(idx)} · ${area || 'OBX'} ${agency?`· ${agency}`:''}</div>
    <div class="house-name">${url?`<a ${href}>${escapeHtml(name)}</a>`:escapeHtml(name)}</div>
    <div class="meta">${beds?`${beds} BR · `:''}${clean(r.house.Oceanfront||r.hs.Oceanfront)?'Oceanfront · ':''}${clean(r.house.Pool||r.hs.Pool)?'Pool · ':''}${clean(r.house.Elevator||r.hs.Elevator)?'Elevator':''}</div>
    <div class="price">${money(r.currentPrice)}</div>
    <div class="badges">${statusBadge(r)}<span class="badge">${voteSummary(r)}</span></div>
    ${notes?`<div class="note">${escapeHtml(notes)}</div>`:''}
    <div class="vote-row"><button onclick="vote('${r.id}','LOVE')">❤️ Love</button><button onclick="vote('${r.id}','LIKE')">👍 Like</button><button onclick="vote('${r.id}','MAYBE')">🤔 Maybe</button><button onclick="vote('${r.id}','PASS')">👎 Pass</button></div>
    <div class="admin-row"><button onclick="moveHouse('${r.id}',-1)">↑ Move Up</button><button onclick="moveHouse('${r.id}',1)">↓ Move Down</button><button onclick="statusHouse('${r.id}','BOOKED')">Mark Booked</button><button onclick="statusHouse('${r.id}','ELIMINATED')">Eliminate</button><button onclick="priceHouse('${r.id}')">Add Price</button></div>
  </article>`;
}
function renderActivity(recs){
  const items=[];
  recs.filter(r=>lostStatuses.has(r.status)).slice(0,5).forEach(r=>items.push(`❌ <b>${escapeHtml(houseName(r))}</b> marked ${r.status}`));
  state.prices.slice(-5).reverse().forEach(p=>items.push(`💰 Price check added: <b>${escapeHtml(p.HouseName||p.HouseSeasonID||'House')}</b> ${money(p.Price)}`));
  state.votes.slice(-5).reverse().forEach(v=>items.push(`🗳 ${escapeHtml(v.PersonName||v.Person||'Someone')} voted <b>${escapeHtml(v.Vote||'')}</b>`));
  return `<div class="panel"><h3>Activity Feed</h3><div class="activity">${items.length?items.map(x=>`<div class="activity-item">${x}</div>`).join(''):'<div class="activity-item">No activity yet.</div>'}</div></div>`;
}
function renderVotes(){
  const recs=activeRecords();
  qs('#votes').innerHTML = `<div class="panel"><h3>Group Picks</h3><table class="table"><thead><tr><th>Rank</th><th>House</th><th>Votes</th><th>Avg</th><th>Status</th></tr></thead><tbody>${recs.map((r,i)=>`<tr><td>${rankLabel(i)}</td><td>${escapeHtml(houseName(r))}</td><td>${voteSummary(r)}</td><td>${r.voteAvg.toFixed(1)}</td><td>${r.status}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderMarket(){
  const recs=activeRecords();
  const neigh = new Map(); recs.forEach(r=>{ const n=clean(r.house.Neighborhood||r.house.Area||r.hs.Neighborhood||'Unknown'); if(!neigh.has(n)) neigh.set(n,{count:0,active:0}); neigh.get(n).count++; if(!lostStatuses.has(r.status))neigh.get(n).active++; });
  qs('#market').innerHTML = `<div class="panel"><h3>Neighborhood Intelligence</h3><table class="table"><thead><tr><th>Neighborhood</th><th>Tracked</th><th>Active</th></tr></thead><tbody>${[...neigh.entries()].sort().map(([n,x])=>`<tr><td>${escapeHtml(n)}</td><td>${x.count}</td><td>${x.active}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderHistory(){
  const seasons = state.seasons.length ? state.seasons : [{SeasonName:'2021'},{SeasonName:'2022'},{SeasonName:'2023'},{SeasonName:'2024'},{SeasonName:'2025 Skipped'},{SeasonName:'2026 Active'}];
  qs('#history').innerHTML = `<div class="panel"><h3>Syracuse Timeline</h3><div class="activity">${seasons.map(s=>`<div class="activity-item"><b>${escapeHtml(s.SeasonName||s.Year||s.SeasonID)}</b><br>${escapeHtml(s.Status||s.Notes||'')}</div>`).join('')}</div></div>`;
}
function escapeHtml(s){ return clean(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function vote(houseSeasonId, voteVal){
  const person = prompt('Who is voting? (Brent, Caitlin, Sarah, Claudine, Jenn)', localStorage.poPerson || 'Brent'); if(!person) return; localStorage.poPerson=person;
  await runWrite('addVote',{ houseSeasonId, personName: person, vote: voteVal, seasonId: ACTIVE_SEASON_ID });
}
async function statusHouse(houseSeasonId, status){ if(!confirm(`Mark this house ${status}?`)) return; await runWrite('updateHouseSeason',{ houseSeasonId, updates:{ Status: status }}); }
async function moveHouse(houseSeasonId, direction){ await runWrite('moveHouseSeason',{ houseSeasonId, direction }); }
async function priceHouse(houseSeasonId){ const price=prompt('New total price?'); if(!price) return; await runWrite('addPriceObservation',{ houseSeasonId, price, seasonId: ACTIVE_SEASON_ID }); }
async function runWrite(action,payload){
  try{ toast('Saving…'); await api(action,payload); await loadData(); toast('Saved.'); }
  catch(err){ console.error(err); toast('Save failed: '+err.message); }
}
function showAddHouse(){
  qs('#modalContent').innerHTML = `<h2>Add House</h2><div class="form-grid"><div><label>House Name</label><input id="fName"></div><div><label>Listing URL</label><input id="fUrl"></div><div><label>Agency</label><input id="fAgency"></div><div><label>Neighborhood</label><input id="fNeighborhood"></div><div><label>Bedrooms</label><input id="fBeds"></div><div><label>Current Total Price</label><input id="fPrice"></div><div><label>Oceanfront?</label><select id="fOf"><option>Yes</option><option>No</option><option>Near</option></select></div><div><label>Status</label><select id="fStatus"><option>NEW</option><option>ACTIVE</option><option>WATCH</option><option>BUY</option><option>NEGOTIATE</option></select></div></div><label>Notes</label><textarea id="fNotes"></textarea><p><button class="primary" onclick="submitAddHouse()">Add House</button></p>`;
  qs('#modal').classList.remove('hidden');
}
async function submitAddHouse(){
  const payload={ seasonId: ACTIVE_SEASON_ID, house:{ HouseName:qs('#fName').value, ListingURL:qs('#fUrl').value, Agency:qs('#fAgency').value, Neighborhood:qs('#fNeighborhood').value, Bedrooms:qs('#fBeds').value, Oceanfront:qs('#fOf').value }, houseSeason:{ CurrentPrice:qs('#fPrice').value, Status:qs('#fStatus').value, AnalystNotes:qs('#fNotes').value }};
  if(!payload.house.HouseName) return toast('House name required');
  qs('#modal').classList.add('hidden'); await runWrite('addHouse',payload);
}

function bind(){
  qsa('.nav').forEach(b=>b.addEventListener('click',()=>{ qsa('.nav').forEach(x=>x.classList.remove('active')); b.classList.add('active'); qsa('.view').forEach(v=>v.classList.remove('active')); qs('#'+b.dataset.view).classList.add('active'); qs('#pageTitle').textContent=b.textContent; }));
  qs('#refreshBtn').addEventListener('click',loadData);
  qs('#addHouseBtn').addEventListener('click',showAddHouse);
  qs('#closeModal').addEventListener('click',()=>qs('#modal').classList.add('hidden'));
}
bind(); loadData();

/* Project Orange drop-in app.js
   GitHub UI + Google Apps Script JSONP backend.
*/
const state = {
  data: null,
  cards: [],
  filter: 'all',
  activeSeason: 'S_2026',
  apiUrl: ''
};

document.addEventListener('DOMContentLoaded', init);

function init(){
  state.apiUrl = getApiUrl();
  bindUI();
  if(!state.apiUrl || state.apiUrl.includes('PASTE_')){
    showBanner('Missing API URL. Open config.js and set window.PROJECT_ORANGE_CONFIG.API_URL to your Google Apps Script Web App URL.');
    return;
  }
  loadData();
}

function getApiUrl(){
  const cfg = window.PROJECT_ORANGE_CONFIG || window.CONFIG || {};
  return (cfg.API_URL || cfg.apiUrl || '').trim();
}

function bindUI(){
  document.getElementById('refreshBtn')?.addEventListener('click', loadData);
  document.getElementById('showAddBtn')?.addEventListener('click', ()=>document.getElementById('addPanel').classList.remove('hidden'));
  document.getElementById('hideAddBtn')?.addEventListener('click', ()=>document.getElementById('addPanel').classList.add('hidden'));
  document.getElementById('addHouseForm')?.addEventListener('submit', onAddHouse);
  document.querySelectorAll('.filter').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderCards();
    });
  });
}

function showBanner(message){
  const b = document.getElementById('connectionBanner');
  b.textContent = message;
  b.classList.remove('hidden');
}

function hideBanner(){
  document.getElementById('connectionBanner')?.classList.add('hidden');
}

function jsonp(action, payload={}){
  return new Promise((resolve,reject)=>{
    const cb = 'po_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const url = new URL(state.apiUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('callback', cb);
    if(payload && Object.keys(payload).length){
      url.searchParams.set('payload', JSON.stringify(payload));
    }
    const timer = setTimeout(()=>{
      cleanup();
      reject(new Error('Timed out calling Google Apps Script API.'));
    }, 20000);
    function cleanup(){
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }
    window[cb] = (result)=>{
      cleanup();
      if(result && result.ok === false) reject(new Error(result.error || 'API returned ok:false'));
      else resolve(result);
    };
    script.onerror = ()=>{
      cleanup();
      reject(new Error('Could not reach Google Apps Script API. Check deployment access and config.js URL.'));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function loadData(){
  try{
    hideBanner();
    const result = await jsonp('getData');
    state.data = normalizeResult(result);
    state.cards = buildCards(state.data);
    renderAll();
  }catch(err){
    showBanner(err.message);
    console.error(err);
  }
}

function normalizeResult(result){
  const tables = result.tables || result;
  return {
    Houses: tables.Houses || result.Houses || [],
    HouseSeasons: tables.HouseSeasons || result.HouseSeasons || [],
    Votes: tables.Votes || result.Votes || [],
    PriceObservations: tables.PriceObservations || result.PriceObservations || [],
    People: tables.People || result.People || [],
    Seasons: tables.Seasons || result.Seasons || []
  };
}

function buildCards(data){
  const housesById = Object.fromEntries(data.Houses.map(h => [String(h.HouseID), h]));
  const current = data.HouseSeasons.filter(hs => !state.activeSeason || !hs.SeasonID || hs.SeasonID === state.activeSeason);
  return current.map((hs, idx)=>{
    const h = housesById[String(hs.HouseID)] || {};
    const votes = data.Votes.filter(v => 
      (hs.HouseSeasonID && String(v.HouseSeasonID) === String(hs.HouseSeasonID)) ||
      (h.HouseID && String(v.HouseID) === String(h.HouseID))
    );
    const score = voteScore(votes);
    const manualRank = toNumber(hs.ManualRank || hs.FinalRank);
    return {
      ...h,
      ...hs,
      _votes: votes,
      _voteScore: score,
      _rankBase: manualRank || 9999,
      _idx: idx
    };
  }).sort((a,b)=>{
    const ar = a._rankBase, br = b._rankBase;
    if(ar !== br) return ar - br;
    if(b._voteScore !== a._voteScore) return b._voteScore - a._voteScore;
    return String(a.HouseName||'').localeCompare(String(b.HouseName||''));
  });
}

function voteScore(votes){
  if(!votes.length) return 0;
  const vals = votes.map(v => {
    const vote = String(v.Vote || v.Rating || '').toLowerCase();
    if(vote === 'love') return 4;
    if(vote === 'like') return 3;
    if(vote === 'maybe') return 2;
    if(vote === 'pass') return 1;
    return Number(v.Rating) || 0;
  }).filter(Boolean);
  if(!vals.length) return 0;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}

function renderAll(){
  renderKpis();
  renderToday();
  renderCards();
  renderActivity();
}

function statusOf(c){ return String(c.Status || '').toUpperCase(); }
function isLost(c){ return ['BOOKED','ELIMINATED','LOST','PASS'].includes(statusOf(c)); }
function isNew(c){ return statusOf(c) === 'NEW'; }
function activeCards(){ return state.cards.filter(c => !isLost(c)); }

function renderKpis(){
  const active = activeCards();
  const lost = state.cards.length - active.length;
  const newCount = state.cards.filter(isNew).length;
  document.getElementById('kpiActive').textContent = active.length;
  document.getElementById('kpiTop').textContent = Math.min(3, active.length);
  document.getElementById('kpiNew').textContent = newCount;
  document.getElementById('kpiLost').textContent = lost;
}

function renderToday(){
  const active = activeCards();
  const top = active[0];
  const txt = top
    ? `Current leader: ${top.HouseName || 'Unnamed house'} at ${money(top.CurrentTotal)}. Use Love / Like / Maybe / Pass to capture group consensus.`
    : 'No active houses found yet. Add a house to start the board.';
  document.getElementById('todayText').textContent = txt;
}

function tierClass(card, visibleIndex){
  if(isLost(card)) return 'tier-gray';
  if(isNew(card)) return 'tier-blue';
  if(visibleIndex < 3) return 'tier-green';
  if(visibleIndex < 6) return 'tier-yellow';
  return 'tier-orange';
}

function tierLabel(card, visibleIndex){
  if(isLost(card)) return statusOf(card) || 'LOST';
  if(isNew(card)) return 'NEW';
  if(visibleIndex < 3) return 'TOP PICK';
  if(visibleIndex < 6) return 'WATCH';
  return 'BACKUP';
}

function filteredCards(){
  return state.cards.filter(c=>{
    if(state.filter === 'active') return !isLost(c);
    if(state.filter === 'new') return isNew(c);
    if(state.filter === 'lost') return isLost(c);
    return true;
  });
}

function renderCards(){
  const el = document.getElementById('cards');
  const cards = filteredCards();
  if(!cards.length){ el.innerHTML = '<div class="empty">No houses match this filter.</div>'; return; }
  let visibleRank = 0;
  el.innerHTML = cards.map((c)=>{
    const lost = isLost(c);
    const rankForTier = lost ? 999 : visibleRank++;
    const rankDisplay = lost ? '×' : rankForTier + 1;
    const link = c.ListingURL ? `<a href="${escapeAttr(c.ListingURL)}" target="_blank" rel="noopener">${escapeHtml(c.HouseName || 'Unnamed House')}</a>` : escapeHtml(c.HouseName || 'Unnamed House');
    const votes = voteSummary(c._votes);
    const notes = c.AnalystNotes || c.Notes || '';
    return `<article class="card ${tierClass(c, rankForTier)}">
      <div class="card-head">
        <div>
          <h3 class="house-name">${link}</h3>
          <div class="meta">${escapeHtml([c.Neighborhood, c.Agency].filter(Boolean).join(' • '))}</div>
        </div>
        <div class="rank">${rankDisplay}</div>
      </div>
      <div class="price">${money(c.CurrentTotal)}</div>
      <div class="target">Target: ${money(c.TargetPrice)} ${c.HouseSeasonID ? '• ID ' + escapeHtml(c.HouseSeasonID) : ''}</div>
      <div class="badges">
        <span class="badge status ${lost?'lost':''}">${tierLabel(c, rankForTier)}</span>
        ${badge(c.Bedrooms ? c.Bedrooms + ' BR' : '')}
        ${badge(c.Oceanfront ? 'Oceanfront: ' + c.Oceanfront : '')}
        ${badge(c.Pool ? 'Pool: ' + c.Pool : '')}
        ${badge(c.Elevator ? 'Elevator: ' + c.Elevator : '')}
      </div>
      <div class="meta">Group: ${votes}</div>
      ${notes ? `<div class="notes">${escapeHtml(notes)}</div>` : ''}
      <div class="vote-row">
        <button class="vote" onclick="vote('${jsStr(c.HouseID)}','${jsStr(c.HouseSeasonID)}','Love')">❤️ Love</button>
        <button class="vote" onclick="vote('${jsStr(c.HouseID)}','${jsStr(c.HouseSeasonID)}','Like')">👍 Like</button>
        <button class="vote" onclick="vote('${jsStr(c.HouseID)}','${jsStr(c.HouseSeasonID)}','Maybe')">🤔 Maybe</button>
        <button class="vote" onclick="vote('${jsStr(c.HouseID)}','${jsStr(c.HouseSeasonID)}','Pass')">👎 Pass</button>
      </div>
      <div class="actions">
        <button class="btn small" onclick="moveHouse('${jsStr(c.HouseSeasonID)}','up')">Move Up</button>
        <button class="btn small" onclick="moveHouse('${jsStr(c.HouseSeasonID)}','down')">Move Down</button>
        <button class="btn small" onclick="updateStatus('${jsStr(c.HouseSeasonID)}','BOOKED')">Mark Booked</button>
        <button class="btn small danger" onclick="updateStatus('${jsStr(c.HouseSeasonID)}','ELIMINATED')">Eliminate</button>
        <button class="btn small" onclick="addPrice('${jsStr(c.HouseID)}','${jsStr(c.HouseSeasonID)}')">Add Price</button>
      </div>
    </article>`;
  }).join('');
}

function badge(txt){ return txt ? `<span class="badge">${escapeHtml(txt)}</span>` : ''; }

function voteSummary(votes){
  if(!votes || !votes.length) return 'No votes yet';
  const counts = {Love:0, Like:0, Maybe:0, Pass:0};
  votes.forEach(v=>{
    const raw = String(v.Vote || '').toLowerCase();
    const key = raw.charAt(0).toUpperCase() + raw.slice(1);
    if(counts[key] !== undefined) counts[key]++;
  });
  return `❤️ ${counts.Love} 👍 ${counts.Like} 🤔 ${counts.Maybe} 👎 ${counts.Pass}`;
}

async function vote(houseId, houseSeasonId, voteValue){
  const person = prompt('Who is voting? Brent, Caitlin, Sarah, Claudine, Jenn:', localStorage.getItem('po_person') || 'Brent');
  if(!person) return;
  localStorage.setItem('po_person', person);
  try{
    await jsonp('addVote', {HouseID: houseId, HouseSeasonID: houseSeasonId, PersonName: person, Person: person, Vote: voteValue});
    await loadData();
  }catch(err){ alert(err.message); }
}

async function updateStatus(houseSeasonId, status){
  if(!houseSeasonId) return alert('Missing HouseSeasonID for this house.');
  if(!confirm(`Change status to ${status}?`)) return;
  try{
    await jsonp('updateHouseSeason', {HouseSeasonID: houseSeasonId, Status: status});
    await loadData();
  }catch(err){ alert(err.message); }
}

async function moveHouse(houseSeasonId, direction){
  if(!houseSeasonId) return alert('Missing HouseSeasonID for this house.');
  try{
    await jsonp('moveHouseSeason', {HouseSeasonID: houseSeasonId, Direction: direction});
    await loadData();
  }catch(err){ alert(err.message); }
}

async function addPrice(houseId, houseSeasonId){
  const price = prompt('New current total price:');
  if(!price) return;
  const notes = prompt('Notes for this price check:', '') || '';
  try{
    await jsonp('addPriceObservation', {HouseID: houseId, HouseSeasonID: houseSeasonId, Price: price, Notes: notes});
    await loadData();
  }catch(err){ alert(err.message); }
}

async function onAddHouse(e){
  e.preventDefault();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try{
    await jsonp('addHouse', data);
    form.reset();
    document.getElementById('addPanel').classList.add('hidden');
    await loadData();
  }catch(err){ alert(err.message); }
}

function renderActivity(){
  const el = document.getElementById('activity');
  const items = [];
  (state.data.PriceObservations || []).slice(-5).reverse().forEach(p=>{
    items.push(`Price check: ${p.Price ? money(p.Price) : 'price noted'} ${p.Notes ? '— ' + p.Notes : ''}`);
  });
  (state.data.Votes || []).slice(-5).reverse().forEach(v=>{
    items.push(`${v.PersonName || v.PersonID || 'Someone'} voted ${v.Vote || v.Rating || ''}`);
  });
  el.innerHTML = (items.length ? items : ['No recent activity yet.']).map(i=>`<div class="activity-item">${escapeHtml(i)}</div>`).join('');
}

function money(v){
  const n = Number(String(v || '').replace(/[$,]/g,''));
  if(!n) return '--';
  return n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
}
function toNumber(v){ const n=Number(v); return Number.isFinite(n) && n>0 ? n : 0; }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return escapeHtml(s); }
function jsStr(s){ return String(s ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

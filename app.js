const CFG = window.PROJECT_ORANGE_CONFIG || {API_URL:'', CURRENT_SEASON_ID:'S_2026'};
const VOTERS = ['Caitlin','Sarah','Claudine','Jenn','Brent'];
let db = {}; let online = false;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const money = n => (n === '' || n == null || Number(n) === 0) ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n));
const num = n => Number(String(n ?? '').replace(/[$,]/g,'')) || 0;

async function init(){
  bindNav(); bindForms();
  await loadData();
  renderAll();
}

async function loadData(){
  try{
    if(CFG.API_URL){
      const res = await fetch(CFG.API_URL + '?action=getData&cache=' + Date.now());
      const json = await res.json();
      if(json.ok){ db = json.data; online = true; return; }
      console.warn(json.error);
    }
  }catch(e){ console.warn('Apps Script not available; loading local sample data.', e); }
  const local = await fetch('data/sample-data.json').then(r=>r.json());
  db = local.data; online = false;
}

function bindNav(){
  $$('.nav').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.nav').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    const v = btn.dataset.view; $$('.view').forEach(x=>x.classList.add('hidden')); $('#view-'+v).classList.remove('hidden');
    $('#title').textContent = ({war:'War Room',houses:'House Database',prices:'Price History',votes:'Voting',intel:'Intelligence'})[v];
  }));
  $('#refreshBtn').onclick = async()=>{ await loadData(); renderAll(); };
  $('#addHouseBtn').onclick = ()=>$('#houseDialog').showModal();
  $('#search').oninput = renderWar;
  $('#statusFilter').onchange = renderWar;
}

function bindForms(){
  $('#voteForm').onsubmit = async e => { e.preventDefault(); const p = formObj(e.target); const house = houseById(p.HouseID); p.HouseName = house?.HouseName || ''; p.SeasonID = CFG.CURRENT_SEASON_ID; p.VoteType = 'Current'; await post('addVote', p); await loadData(); renderAll(); e.target.reset(); };
  $('#priceForm').onsubmit = async e => { e.preventDefault(); const p = formObj(e.target); const house = houseById(p.HouseID); p.HouseName = house?.HouseName || ''; p.SeasonID = CFG.CURRENT_SEASON_ID; await post('addPrice', p); await loadData(); renderAll(); e.target.reset(); };
  $('#houseForm').onsubmit = async e => { e.preventDefault(); const p = formObj(e.target); p.SeasonID = CFG.CURRENT_SEASON_ID; await post('addHouse', p); $('#houseDialog').close(); await loadData(); renderAll(); e.target.reset(); };
}
function formObj(form){ return Object.fromEntries(new FormData(form).entries()); }

async function post(action, payload){
  if(!CFG.API_URL){ alert('No Apps Script API_URL configured yet. Paste it into config.js.'); return; }
  const body = {action, payload};
  if(CFG.PIN_REQUIRED) body.pin = prompt('Project Orange PIN');
  const res = await fetch(CFG.API_URL, {method:'POST', body:JSON.stringify(body)});
  const json = await res.json();
  if(!json.ok) alert('Save failed: ' + json.error);
}

function houseById(id){ return (db.Houses||[]).find(h=>String(h.HouseID)===String(id)); }
function currentSeasonRows(){ return (db.HouseSeasons||[]).filter(r=>String(r.SeasonID)===String(CFG.CURRENT_SEASON_ID)); }
function currentVotes(){ return (db.Votes||[]).filter(v=>String(v.SeasonID)===String(CFG.CURRENT_SEASON_ID)); }
function avgVote(houseId){ const rows=currentVotes().filter(v=>String(v.HouseID)===String(houseId)); if(!rows.length) return 0; return rows.reduce((a,r)=>a+num(r.Vote),0)/rows.length; }
function finalScore(row){ return Math.round(num(row.OverallScore) + avgVote(row.HouseID)*2 + (num(row.BuyScore)-70)*0.12); }
function linkedHouse(name, url){ return url ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>` : escapeHtml(name); }
function statusClass(s){ s=String(s||'').toLowerCase(); if(s.includes('buy'))return 'buy'; if(s.includes('negotiate'))return 'negotiate'; if(s.includes('pass'))return 'pass'; return 'watch'; }
function rowsRanked(){
  return currentSeasonRows().map(r=>({...r, house:houseById(r.HouseID), score:finalScore(r)})).sort((a,b)=>b.score-a.score);
}

function renderAll(){ renderKpis(); renderWar(); renderTables(); renderForms(); renderIntel(); }
function renderKpis(){
  const rows=rowsRanked(); const ocean = rows.filter(r=>String(r.house?.Oceanfront||'').toLowerCase().startsWith('yes')).length;
  const buys = rows.filter(r=>String(r.Status||'').toUpperCase().includes('BUY')).length;
  const avgDisc = rows.length ? Math.round(rows.reduce((a,r)=>a+num(r.DiscountPct),0)/rows.length) : 0;
  const valueLeader = [...rows].sort((a,b)=>num(b.ValueScore)-num(a.ValueScore))[0];
  const bestOverall = rows[0];
  const kpis = [
    ['Houses Tracked', rows.length, online?'Live from Google Sheets':'Sample/offline data'],
    ['Oceanfront', ocean, 'for active season'],
    ['Buy Today', buys, 'status = BUY'],
    ['Avg Discount', avgDisc+'%', 'observed/entered'],
    ['Current Value Leader', valueLeader?.HouseName || '—', money(valueLeader?.CurrentTotal)],
    ['Best Overall', bestOverall?.HouseName || '—', bestOverall ? 'Score '+bestOverall.score : '—']
  ];
  $('#kpis').innerHTML = kpis.map(k=>`<div class="kpi"><label>${k[0]}</label><b>${k[1]}</b><p>${k[2]}</p></div>`).join('');
}

function renderWar(){
  const q = ($('#search')?.value || '').toLowerCase(); const status = $('#statusFilter')?.value || '';
  let rows=rowsRanked();
  if(status) rows=rows.filter(r=>String(r.Status||'').toUpperCase()===status);
  if(q) rows=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q) || JSON.stringify(r.house||{}).toLowerCase().includes(q));
  $('#cards').innerHTML = rows.map((r,i)=>{
    const h=r.house||{}; const url=h.ListingURL || h.HouseLink || '';
    const gap=num(r.CurrentTotal)-num(r.TargetPrice);
    return `<article class="card"><div class="rank">#${i+1}</div><h4>${linkedHouse(r.HouseName,url)}</h4><div class="chips"><span class="chip ${statusClass(r.Status)}">${escapeHtml(r.Status||'WATCH')}</span><span class="chip">${escapeHtml(h.Neighborhood||'')}</span><span class="chip">${escapeHtml(h.Agency||'')}</span><span class="chip">${escapeHtml(h.Bedrooms||'')} BR</span><span class="chip">OF: ${escapeHtml(h.Oceanfront||'—')}</span></div><div class="metrics"><div class="metric"><span>Final</span><b>${r.score}</b><div class="scorebar"><i style="width:${Math.min(100,r.score)}%"></i></div></div><div class="metric"><span>Current</span><b>${money(r.CurrentTotal)}</b></div><div class="metric"><span>Target Gap</span><b>${gap?money(gap):'—'}</b></div><div class="metric"><span>Value</span><b>${num(r.ValueScore)}</b></div><div class="metric"><span>Experience</span><b>${num(r.ExperienceScore)}</b></div><div class="metric"><span>Vote Adj.</span><b>${avgVote(r.HouseID).toFixed(1)}</b></div></div><p class="note">${escapeHtml(r.AnalystNotes||h.Notes||'')}</p></article>`;
  }).join('') || '<p class="muted">No houses match.</p>';
}

function renderTables(){
  const houses=(db.Houses||[]).filter(h=>h.HouseName);
  $('#housesTable').innerHTML = table(['House','Agency','Neighborhood','BR','Oceanfront','Pool','Elevator','Notes'], houses.map(h=>[linkedHouse(h.HouseName,h.ListingURL||h.HouseLink),h.Agency,h.Neighborhood,h.Bedrooms,h.Oceanfront,h.Pool,h.Elevator,h.Notes]));
  const prices=(db.PriceObservations||[]).slice().reverse();
  $('#pricesTable').innerHTML = table(['Date','House','Total','Discount','Notes'], prices.map(p=>[p.ObservationDate,escapeHtml(p.HouseName),money(p.TotalAmount||p.RentAmount),p.DiscountPct?num(p.DiscountPct)+'%':'',escapeHtml(p.Notes||'')]));
  const summary = rowsRanked().map(r=>{
    const vs=VOTERS.map(p=>latestVote(r.HouseID,p)); return [linkedHouse(r.HouseName,r.house?.ListingURL||r.house?.HouseLink),...vs,avgVote(r.HouseID).toFixed(1),r.score];
  });
  $('#votesTable').innerHTML = table(['House',...VOTERS,'Avg','Final'], summary);
}
function latestVote(hid, person){ const rows=currentVotes().filter(v=>String(v.HouseID)===String(hid)&&String(v.Person)===person); return rows.length ? rows[rows.length-1].Vote : ''; }
function table(headers, rows){ return `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c??''}</td>`).join('')}</tr>`).join('')}</tbody>`; }

function renderForms(){
  const opts = rowsRanked().map(r=>`<option value="${escapeAttr(r.HouseID)}">${escapeHtml(r.HouseName)}</option>`).join('');
  $('#voteForm select[name=HouseID]').innerHTML=opts; $('#priceForm select[name=HouseID]').innerHTML=opts;
  $('#voteForm select[name=Person]').innerHTML=VOTERS.map(p=>`<option>${p}</option>`).join('');
  $('#priceForm input[name=ObservationDate]').valueAsDate = new Date();
}

function renderIntel(){
  const panels = [
    ['Syracuse DNA', db.ValueModel?.map(x=>[x.Category, x.Weight, x['Scoring Notes']]) || []],
    ['Neighborhood Intelligence', db.Neighborhoods?.map(x=>[x.NeighborhoodName, x.BeachPrivacyScore, x.GroceryConvenienceScore, x.Notes]) || []],
    ['Agency Intelligence', db.Agencies?.map(x=>[x.AgencyName, x.TypicalDiscount, x.Notes]) || []],
    ['Lessons Learned', db.Lessons?.slice(0,50).map(x=>[x.HouseName, x.Theme, x.Evidence, x.Impact]) || []]
  ];
  $('#intel').innerHTML = `<div class="intel-grid">${panels.map(([title,rows])=>`<div class="panel"><h3>${title}</h3><div class="table-wrap"><table>${table(rows[0]?.map((_,i)=>['Item','Score/Weight','Score/Notes','Notes'][i]||'Value')||['Item'],rows)}</table></div></div>`).join('')}</div>`;
}

function escapeHtml(s){ return String(s ?? '').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,'&#39;'); }

init();

// Dashboard: asks the server for a new reading + 30-minute prediction every second and draws it.
(() => {
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const IST = new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
const IST_DATE = new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});

let CFG, S = null, brain, selected = 'g', filter = 'off', history = null, historyKey = null, busy = false;

// Server calls. (The online demo defines window.LOCAL_ENGINE to run the same code in the browser.)
async function api(path, params){
  if (window.LOCAL_ENGINE) return window.LOCAL_ENGINE.call(path, params);
  const q = params ? '?' + new URLSearchParams(params) : '';
  const res = await fetch(path + q);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ---------- theme ---------- */
function currentTheme(){
  const t = document.documentElement.dataset.theme;
  return t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function setTheme(t){
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ppb-theme', t); } catch {}
  $('themeBtn').textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
  brain && brain.recolor();
}

/* ---------- helpers ---------- */
const status = i => CFG.loads[i].essential ? 'lock' : S.relays[i] ? 'on' : 'off';
const change = i => S.pred[i] / S.now[i] - 1;
const areaOf = l => CFG.areas[l.area].name;
function idsFor(key){
  const k = key[0], n = +key.slice(1);
  if (k === 'g') return CFG.loads.map(l => l.id);
  if (k === 's') return CFG.loads.filter(l => l.region === n).map(l => l.id);
  if (k === 'a') return CFG.loads.filter(l => l.area === n).map(l => l.id);
  return [n];
}
function nameFor(key){
  const k = key[0], n = +key.slice(1);
  if (k === 'g') return {name: CFG.grid, what: 'Where power enters Pune'};
  if (k === 's') return {name: CFG.regions[n].substation, what: `Feeds ${CFG.regions[n].name}`};
  if (k === 'a') return {name: CFG.areas[n].name, what: `Area in ${CFG.regions[CFG.areas[n].region].name}`};
  const l = CFG.loads[n];
  return {name: l.name, what: `${areaOf(l)} · ${l.group}`};
}
const sum = (ids, arr) => ids.reduce((a, i) => a + arr[i], 0);

/* ---------- every second ---------- */
function tickClock(){
  const now = new Date();
  $('clock').textContent = IST.format(now);
  $('clockSub').textContent = IST_DATE.format(now) + ' · Pune time, from your device clock';
  $('cClock').textContent = IST.format(now);
}

async function tick(){
  tickClock();
  if (busy) return;
  busy = true;
  try {
    S = await api('/api/state', {supply: $('supply').value, fault: $('fault').checked});
    brain.update(S);
    render();
  } catch (err) {
    $('kpis').innerHTML = `<div class="kpi warn" style="grid-column:1/-1"><span class="eyebrow">Server not reachable</span><span class="s">Start it with <b>python run.py</b>, then open http://127.0.0.1:8000</span></div>`;
  } finally { busy = false; }
}

function render(){
  const offN = S.relays.filter(r => !r).length;
  const surging = CFG.loads.filter(l => status(l.id) !== 'off' && change(l.id) >= CFG.surge_alert);
  const cityChange = S.total_pred / S.total_now - 1;
  $('kpis').innerHTML = `
    <div class="kpi"><span class="eyebrow">City demand now</span><span class="v">${fmt(S.total_now)}<small>MW</small></span><span class="s">All 82 places</span></div>
    <div class="kpi"><span class="eyebrow">Predicted in 30 min</span><span class="v">${fmt(S.total_pred)}<small>MW</small></span><span class="s ${cityChange >= 0 ? 'up' : 'down'}">${pct(cityChange)} from now</span></div>
    <div class="kpi"><span class="eyebrow">Electricity available</span><span class="v">${fmt(S.supply)}<small>MW</small></span><span class="s">${$('fault').checked ? 'Grid fault: 400 MW lost' : 'No grid fault'}</span></div>
    <div class="kpi ${offN ? 'warn' : ''}"><span class="eyebrow">Places switched off</span><span class="v">${offN}<small>of ${CFG.n_shed}</small></span><span class="s">Before the peak arrives</span></div>
    <div class="kpi ${surging.length ? 'warn' : ''}"><span class="eyebrow">Surge alerts</span><span class="v">${surging.length}</span><span class="s">Rising ${Math.round(CFG.surge_alert * 100)}% or more in 30 min</span></div>`;

  // surge alerts, biggest MW rise first
  const alerts = surging.sort((a, b) => (S.pred[b.id] - S.now[b.id]) - (S.pred[a.id] - S.now[a.id])).slice(0, 8);
  setList('alerts', alerts.length ? alerts.map(l => `<li data-key="p${l.id}"><span class="dot ${l.essential ? 'lock' : 'hot'}"></span><span>${esc(l.name)}<small>${esc(areaOf(l))} · ${pct(change(l.id))}</small></span><span class="mw">${fmt(S.now[l.id])} → ${fmt(S.pred[l.id])} MW</span></li>`).join('')
    : '<li class="empty">No place is about to surge.</li>');

  renderDetail(); renderCircuit(); renderPlaces(); renderFacts();
}

// Only touch a list when its content changes, so scrolling is not disturbed.
function setList(id, html){ const el = $(id); if (el.dataset.html !== html){ el.innerHTML = html; el.dataset.html = html; } }

function renderDetail(){
  const ids = idsFor(selected), {name, what} = nameFor(selected);
  const now = sum(ids, S.now), pred = sum(ids, S.pred), ch = pred / now - 1;
  const isPlace = selected[0] === 'p';
  let st = '', extra = '';
  if (isPlace){
    const s = status(+selected.slice(1)), l = CFG.loads[+selected.slice(1)];
    st = s === 'lock' ? '<span class="pill lock">Essential, locked ON</span>' : s === 'on' ? `<span class="pill on">ON · switch-off order #${l.rank}</span>` : `<span class="pill off">Switched off · order #${l.rank}</span>`;
    extra = `<div class="spark" id="spark"></div>`;
  } else {
    const off = ids.filter(i => !S.relays[i]);
    st = `<span class="pill ${off.length ? 'off' : 'on'}">${off.length} of ${ids.length} places off</span>`;
    if (selected[0] === 'a') extra = `<ul class="places">${ids.map(i => `<li data-key="p${i}" class="${status(i)}"><span class="dot ${status(i)}"></span><span class="name">${esc(CFG.loads[i].name)}</span><span class="mw">${fmt(S.pred[i])} MW</span></li>`).join('')}</ul>`;
  }
  $('detail').innerHTML = `
    <div><span class="eyebrow">${esc(what)}</span><h2 style="font-size:18px">${esc(name)}</h2></div>
    <div>${st}</div>
    <div class="detail-grid">
      <div class="stat"><b>${fmt(now)} MW</b>Now</div>
      <div class="stat"><b class="${ch >= 0 ? 'up' : 'down'}">${fmt(pred)} MW</b>In 30 min (${pct(ch)})</div>
    </div>${extra}`;
  if (isPlace) drawSpark();
}

async function drawSpark(){
  const key = selected, stale = !history || historyKey !== key || Date.now() - history.at > 15000;
  if (stale){
    const h = await api('/api/history/' + key.slice(1));
    history = {...h, at: Date.now()}; historyKey = key;
  }
  const el = $('spark'); if (!el || key !== selected) return;
  const W = 300, H = 110, L = 34, T = 8, B = 18;
  const pts = [...history.past, ...history.ahead];
  const t0 = history.past[0][0], t1 = history.ahead[history.ahead.length - 1][0];
  const vals = pts.map(p => p[1]), lo = Math.min(...vals) * 0.9, hi = Math.max(...vals) * 1.05;
  const x = t => L + (t - t0) / (t1 - t0) * (W - L - 4), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = arr => 'M' + arr.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' L');
  const nowX = x(history.past[history.past.length - 1][0]);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Last 2 hours and next 30 minutes">
    <line x1="${nowX}" x2="${nowX}" y1="${T}" y2="${H - B}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <path d="${path(history.past)}" fill="none" stroke="var(--b-cool)" stroke-width="2"/>
    <path d="${path(history.ahead)}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-dasharray="5 3"/>
    <circle cx="${x(history.ahead[history.ahead.length - 1][0])}" cy="${y(history.ahead[history.ahead.length - 1][1])}" r="3.5" fill="var(--accent)"/>
    <text x="${L - 4}" y="${y(hi) + 8}" text-anchor="end">${fmt(hi)}</text><text x="${L - 4}" y="${y(lo)}" text-anchor="end">${fmt(lo)}</text>
    <text x="${L}" y="${H - 4}">−2 h</text><text x="${nowX}" y="${H - 4}" text-anchor="middle">now</text><text x="${W - 4}" y="${H - 4}" text-anchor="end">+30 min</text>
  </svg><p class="note">Blue: readings. Dashed peach: model forecast.</p>`;
}

const led = (on, label, cls = '') => `<span class="led ${cls} ${on ? 'on' : ''}"><i></i>${label}</span>`;
function renderCircuit(){
  const last = S.ticks[S.ticks.length - 1];
  $('cmp').innerHTML = `<span>A · Load in 30 min</span><b>${fmt(S.load)} MW</b><span>B · Available</span><b>${fmt(S.supply)} MW</b>`;
  $('cmpLeds').innerHTML = led(last.over, 'OVER', 'red') + led(last.spare, 'SPARE', 'green');
  const nb = S.level_bits.length;
  $('levelLeds').innerHTML = [...S.level_bits].map((b, i) => led(b === '1', 'L' + (nb - 1 - i))).join('') + `<span class="big" style="margin-left:6px">L = ${S.level}</span>`;
  const ups = S.ticks.filter(t => t.action === 'up'), downs = S.ticks.filter(t => t.action === 'down');
  const names = ts => ts.slice(0, 3).map(t => CFG.loads[t.place].name).join(', ') + (ts.length > 3 ? ` and ${ts.length - 3} more` : '');
  $('cWhat').textContent = ups.length ? `This second: switched off ${names(ups)}.`
    : downs.length ? `This second: switched back on ${names(downs)}.` : `This second: no change, holding at L = ${S.level}.`;
}

function renderPlaces(){
  const q = $('search').value.trim().toLowerCase();
  let ls = CFG.loads.filter(l => filter === 'all' || (filter === 'surge' ? status(l.id) !== 'off' && change(l.id) >= CFG.surge_alert : status(l.id) === filter));
  if (q) ls = ls.filter(l => `${l.name} ${areaOf(l)} ${l.group} ${CFG.regions[l.region].name}`.toLowerCase().includes(q));
  if (filter === 'off') ls.sort((a, b) => a.rank - b.rank);
  $('listCount').textContent = `${ls.length} place${ls.length === 1 ? '' : 's'}`;
  const row = l => { const s = status(l.id), what = s === 'lock' ? 'Essential' : s === 'on' ? `ON · #${l.rank}` : `Off · #${l.rank}`;
    return `<li data-key="p${l.id}" class="${s}"><span class="dot ${s}"></span><span><span class="name">${esc(l.name)}</span><small>${esc(areaOf(l))} · ${what} · ${pct(change(l.id))} in 30 min</small></span><span class="mw">${fmt(S.now[l.id])} MW</span></li>`; };
  setList('places', ls.length ? ls.map(row).join('') : `<li class="empty">${filter === 'off' && !q ? 'Nothing is switched off right now.' : 'No place matches.'}</li>`);
  $('tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === filter));
}

function renderFacts(){
  const m = CFG.model, errs = Object.values(m.error_percent), avg = errs.reduce((a, b) => a + b, 0) / errs.length;
  let msedcl;
  if (window.LOCAL_ENGINE) msedcl = 'Not loaded in this online demo. In the project, run <b>python -m backend.pipeline.fetch_msedcl</b> to download them.';
  else if (!CFG.msedcl) msedcl = 'Not downloaded yet. Run <b>python -m backend.pipeline.fetch_msedcl</b> (needs internet), then restart the server.';
  else msedcl = `Loaded. Pune rows found in ${CFG.msedcl.length} report${CFG.msedcl.length === 1 ? '' : 's'}:` + CFG.msedcl.slice(0, 4).map(r => `<div class="rows">${esc(r.report)} ${esc(r.title)}: ${esc(r.rows[0].row.join(' | '))}</div>`).join('');
  const html = `
    <li><b>Clock:</b> real time from your device, shown in Pune time (IST).</li>
    <li><b>Readings now:</b> simulated for each place. There is no public live meter feed for single places in Pune.</li>
    <li><b>30-minute forecast:</b> ${esc(m.type)}, run every second for all 82 places. Trained on ${m.trained_days} days of simulated history, tested on ${m.tested_days} unseen days: about ${avg.toFixed(1)}% average error.</li>
    <li><b>Switching off:</b> the digital circuit acts on the forecast, so places go off before an overload, not after.</li>
    <li><b>MSEDCL Go-Live Town Reports:</b> monthly PDFs per town (AT&amp;C loss, reliability, complaints, collections). They have no hourly or per-place load, so they cannot train the forecast. ${msedcl}</li>`;
  setList('facts', html);
}

async function start(){
  try { const t = localStorage.getItem('ppb-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
  $('themeBtn').textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode';
  $('themeBtn').onclick = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  tickClock();
  try { CFG = await api('/api/config'); }
  catch { $('kpis').innerHTML = '<div class="kpi warn" style="grid-column:1/-1"><span class="eyebrow">Server not reachable</span><span class="s">Start it with <b>python run.py</b>, then open http://127.0.0.1:8000</span></div>'; return; }
  $('supply').value = CFG.defaults.supply;
  $('supplyOut').textContent = fmt(CFG.defaults.supply) + ' MW';
  $('faultNote').textContent = `Lose ${CFG.fault_loss} MW`;
  const choose = key => { selected = key; brain.select(key); if (S) renderDetail(); };
  brain = Brain3D.create($('brain'), CFG, choose);
  brain.select(selected);
  $('supply').oninput = e => { $('supplyOut').textContent = fmt(e.target.value) + ' MW'; tick(); };
  $('fault').onchange = tick;
  $('search').oninput = () => S && renderPlaces();
  $('tabs').onclick = e => { const b = e.target.closest('button'); if (b){ filter = b.dataset.f; renderPlaces(); } };
  document.addEventListener('click', e => { const li = e.target.closest('li[data-key]'); if (li) choose(li.dataset.key); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => brain.recolor());
  await tick();
  // line the ticks up with the start of each real second
  setTimeout(() => { tick(); setInterval(tick, 1000); }, 1000 - Date.now() % 1000);
}
start();
})();

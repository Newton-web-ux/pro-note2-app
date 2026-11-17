/* Pro Document — Dashboard Pro add-on.
   Add as the LAST script in dashboard.html, just before </body>:
   <script src="dashboard-pro-addon.js"></script>
   Existing features (auth, Firestore sync, folders, sharing, upgrade flow,
   trash, install button) are untouched. */
(function () {
  'use strict';
  if (window.DP) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lget = (k, d) => { try { return JSON.parse(localStorage.getItem('pd.dash.' + k)) ?? d; } catch (e) { return d; } };
  const lset = (k, v) => { try { localStorage.setItem('pd.dash.' + k, JSON.stringify(v)); } catch (e) {} };
  const docsRef = () => db.collection('users').doc(currentUser.uid).collection('docs');
  const TS = () => firebase.firestore.FieldValue.serverTimestamp();
  const COLORS = { red: '#d9534f', orange: '#f0933b', green: '#3fa66b', blue: '#2b79d6', purple: '#8a5cc8' };
  let sort = lget('sort', 'modified'), sel = new Set(), dark = lget('dark', false);

  /* ── styles ── */
  const st = document.createElement('style');
  st.textContent = `
  .dp-hello{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
  .dp-hello h2{font-family:'Outfit',sans-serif;font-size:24px;font-weight:600}
  .dp-hello p{color:var(--muted);margin-top:2px}
  .dp-tools{display:flex;gap:8px;align-items:center}
  .dp-sel{padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--white);color:var(--text);font:inherit;font-size:12px}
  .dp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
  .dp-stat{background:var(--white);border:1px solid var(--border);border-radius:6px;padding:12px 14px;cursor:pointer;transition:border-color .15s}
  .dp-stat:hover{border-color:var(--accent)}
  .dp-stat b{display:block;font-family:'Outfit',sans-serif;font-size:24px;font-weight:600;color:var(--accent)}
  .dp-stat span{font-size:12px;color:var(--muted)}
  .dp-meter{height:5px;background:var(--border);border-radius:3px;margin-top:6px;overflow:hidden}
  .dp-meter i{display:block;height:100%;background:var(--accent)}
  .dp-meter i.full{background:#e0a800}
  .dp-chk{position:absolute;top:8px;left:8px;z-index:3;width:16px;height:16px;cursor:pointer;accent-color:var(--accent)}
  .doc-card .dp-chk{opacity:0;transition:opacity .12s}.doc-card:hover .dp-chk,.doc-card .dp-chk:checked{opacity:1}
  .doc-list-item .dp-chk{position:static;flex:none}
  .doc-card.dp-on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-light)}
  .dp-bulk{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);background:#16305a;color:#fff;border-radius:8px;padding:8px 12px;display:none;align-items:center;gap:8px;box-shadow:0 8px 28px rgba(0,0,0,.35);z-index:900;font-size:12px}
  .dp-bulk.show{display:flex}
  .dp-bulk button{background:rgba(255,255,255,.14);border:none;color:#fff;border-radius:4px;padding:5px 10px;cursor:pointer;font:inherit;font-size:12px}
  .dp-bulk button:hover{background:rgba(255,255,255,.28)}.dp-bulk button.d:hover{background:#c0392b}
  .dp-menu{position:fixed;display:none;background:var(--white);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 28px rgba(0,0,0,.25);z-index:1500;min-width:190px;padding:4px;color:var(--text)}
  .dp-menu button{display:block;width:100%;text-align:left;border:none;background:none;padding:7px 10px;border-radius:4px;cursor:pointer;font:inherit;font-size:12px;color:inherit}
  .dp-menu button:hover{background:var(--accent-light);color:var(--accent)}
  .dp-menu hr{border:none;border-top:1px solid var(--border);margin:4px 0}
  .dp-dots{display:flex;gap:6px;padding:6px 10px}
  .dp-dots i{width:16px;height:16px;border-radius:50%;cursor:pointer;border:2px solid transparent}
  .dp-dots i:hover{border-color:var(--text)}
  .dp-pal{position:fixed;inset:0;background:rgba(10,22,40,.5);display:none;align-items:flex-start;justify-content:center;padding-top:14vh;z-index:3000}
  .dp-pal.open{display:flex}
  .dp-pal>div{width:min(560px,92vw);background:var(--white);border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.45);overflow:hidden;color:var(--text)}
  .dp-pal input{width:100%;border:none;border-bottom:1px solid var(--border);padding:14px 16px;font:inherit;font-size:15px;outline:none;background:transparent;color:inherit}
  .dp-pal ul{list-style:none;max-height:320px;overflow-y:auto;padding:4px}
  .dp-pal li{padding:9px 12px;border-radius:5px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;font-size:13px}
  .dp-pal li small{color:var(--muted)}.dp-pal li.on{background:var(--accent-light);color:var(--accent)}
  .dp-toast{position:fixed;right:18px;bottom:40px;background:#16305a;color:#fff;padding:9px 14px;border-radius:6px;font-size:12px;z-index:4000;box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;transform:translateY(8px);transition:all .2s;pointer-events:none}
  .dp-toast.show{opacity:1;transform:none}
  .dp-kbd{font-size:10px;border:1px solid var(--border);border-radius:3px;padding:0 4px;color:var(--muted)}
  body.dp-dark{--bg:#14181f;--white:#1c222c;--text:#e6e9ef;--muted:#9aa4b5;--border:#323b4a;--toolbar-bg:#1a2029;--card-hover:#243044;--accent-light:#22344f}
  body.dp-dark .doc-card-preview{background:linear-gradient(135deg,#222b3a,#1c2432)}
  body.dp-dark .doc-card-actions{background:#19202a}
  body.dp-dark .doc-action-btn,body.dp-dark .view-btn,body.dp-dark .search-bar,body.dp-dark .modal,body.dp-dark .btn-secondary{background:var(--white);color:var(--text)}
  body.dp-dark .modal-body input,body.dp-dark .search-bar input{background:transparent;color:var(--text)}
  body.dp-dark .ribbon-btn{color:var(--text)}body.dp-dark .ribbon-btn.primary,body.dp-dark .ribbon-btn.gold{color:inherit}
  body.dp-dark .ribbon-btn.primary{color:#fff}body.dp-dark .ribbon-btn.gold{color:#3a2c00}
  body.dp-dark .user-dropdown{background:var(--white)}body.dp-dark .user-dropdown-item{color:var(--text)}`;
  document.head.appendChild(st);

  /* ── security + ordering wrappers around the existing render functions ──
     The original render() inserts titles into innerHTML unescaped. We escape
     them for the duration of the call, then restore the real values. */
  function withEscaped(fn) {
    const un = [];
    Object.values(cachedIndex.docs).forEach(d => { un.push([d, 'title', d.title]); d.title = esc(d.title); });
    Object.values(cachedIndex.folders).forEach(f => { un.push([f, 'name', f.name]); f.name = esc(f.name); });
    Object.values(cachedSharedWithMe).forEach(s => { un.push([s, 'title', s.title], [s, 'ownerEmail', s.ownerEmail]); s.title = esc(s.title); s.ownerEmail = esc(s.ownerEmail); });
    try { fn(); } finally { un.forEach(([o, k, v]) => { o[k] = v; }); }
  }
  function sortDocs() {
    const arr = Object.values(cachedIndex.docs);
    const by = { name: (a, b) => (a.title || '').localeCompare(b.title || ''), modified: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0), created: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) }[sort];
    arr.sort((a, b) => (b.starred - a.starred && sort === 'starred') || by(a, b));
    const o = {}; arr.forEach(d => { o[d.id] = d; }); cachedIndex.docs = o;
  }
  const _render = window.render, _folders = window.renderFolders;
  window.render = function () { sortDocs(); withEscaped(_render); decorate(); };
  window.renderFolders = function () { withEscaped(_folders); };

  /* ── header + stats ── */
  const main = document.querySelector('.main'), box = document.createElement('div');
  box.innerHTML = `<div class="dp-hello"><div><h2 id="dpHi">Welcome</h2><p id="dpSub"></p></div>
    <div class="dp-tools"><select class="dp-sel" id="dpSort" title="Sort documents"><option value="modified">Last modified</option><option value="created">Date created</option><option value="name">Name A–Z</option><option value="starred">Starred first</option></select>
    <button class="dp-sel" id="dpDark" title="Toggle dark mode">🌙</button>
    <button class="dp-sel" id="dpPalBtn" title="Command palette">Search & commands <span class="dp-kbd">Ctrl K</span></button></div></div>
    <div class="dp-stats" id="dpStats"></div>`;
  main.insertBefore(box, main.firstChild);
  $('dpSort').value = sort;
  $('dpSort').onchange = e => { sort = e.target.value; lset('sort', sort); render(); };
  $('dpDark').onclick = () => { dark = !dark; lset('dark', dark); applyDark(); };
  $('dpPalBtn').onclick = () => openPal();
  function applyDark() { document.body.classList.toggle('dp-dark', dark); $('dpDark').textContent = dark ? '☀️' : '🌙'; }
  applyDark();

  function stats() {
    if (!currentUser) return;
    const all = Object.values(cachedIndex.docs), live = all.filter(d => !d.deleted), wk = Date.now() - 7 * 864e5;
    const week = live.filter(d => new Date(d.updatedAt || 0) > wk).length;
    const h = new Date().getHours(), g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('dpHi').textContent = g + ', ' + esc((currentUser.name || '').split(' ')[0] || 'there');
    $('dpSub').textContent = live.length ? `You edited ${week} document${week === 1 ? '' : 's'} this week.` : 'Create your first document to get started.';
    const pro = isProUser(), pct = Math.min(100, live.length / FREE_MAX_DOCS * 100);
    const card = (n, l, f, extra) => `<div class="dp-stat" onclick="${f}"><b>${n}</b><span>${l}</span>${extra || ''}</div>`;
    $('dpStats').innerHTML =
      card(live.length, 'Documents', "setFilter('all')", pro ? '' : `<div class="dp-meter"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i></div>`) +
      card(live.filter(d => d.starred).length, 'Starred', "setFilter('starred')") +
      card(week, 'Edited this week', "setFilter('recent')") +
      card(Object.keys(cachedSharedWithMe).length, 'Shared with me', "setFilter('shared')") +
      card(all.length - live.length, 'In trash', "setFilter('trash')");
  }

  /* ── post-render: checkboxes, colour labels, selection ── */
  function idOf(el) { const m = el.outerHTML.match(/openDoc\('([^']+)'\)/); return m && m[1]; }
  function decorate() {
    stats();
    document.querySelectorAll('.doc-card,.doc-list-item').forEach(el => {
      const id = idOf(el); if (!id) return;
      el.dataset.id = id;
      const d = cachedIndex.docs[id];
      if (d && d.color && COLORS[d.color]) el.style.borderTop = '3px solid ' + COLORS[d.color];
      const c = document.createElement('input'); c.type = 'checkbox'; c.className = 'dp-chk'; c.checked = sel.has(id);
      c.onclick = e => { e.stopPropagation(); c.checked ? sel.add(id) : sel.delete(id); el.classList.toggle('dp-on', c.checked); bulk(); };
      el.classList.contains('doc-card') ? el.appendChild(c) : el.prepend(c);
      el.classList.toggle('dp-on', sel.has(id));
    });
    [...sel].forEach(id => { if (!cachedIndex.docs[id]) sel.delete(id); }); bulk();
  }

  /* ── bulk actions ── */
  const bar = document.createElement('div'); bar.className = 'dp-bulk';
  document.body.appendChild(bar);
  function bulk() {
    bar.classList.toggle('show', sel.size > 0);
    const trash = currentFilter === 'trash';
    bar.innerHTML = `<b>${sel.size} selected</b>` + (trash ? '<button data-a="restore">Restore</button><button class="d" data-a="purge">Delete forever</button>' : '<button data-a="star">⭐ Star</button><button data-a="trash" class="d">🗑 Trash</button>') + '<button data-a="clear">✕</button>';
  }
  bar.onclick = async e => {
    const a = e.target.dataset.a; if (!a) return;
    if (a === 'clear') { sel.clear(); return render(); }
    if (a === 'purge' && !confirm(`Permanently delete ${sel.size} document(s)? This cannot be undone.`)) return;
    try {
      const b = db.batch();
      sel.forEach(id => {
        const r = docsRef().doc(id);
        if (a === 'star') b.update(r, { starred: true });
        else if (a === 'trash') b.update(r, { deleted: true, updatedAt: TS() });
        else if (a === 'restore') b.update(r, { deleted: false, updatedAt: TS() });
        else if (a === 'purge') b.delete(r);
      });
      await b.commit(); toast(`${sel.size} document(s) updated.`); sel.clear();
    } catch (err) { console.warn(err); toast('Action failed — try again.'); }
  };

  /* ── right-click menu ── */
  const menu = document.createElement('div'); menu.className = 'dp-menu'; document.body.appendChild(menu);
  document.addEventListener('contextmenu', e => {
    const el = e.target.closest('.doc-card,.doc-list-item'); if (!el || !el.dataset.id) return;
    e.preventDefault();
    const id = el.dataset.id, d = cachedIndex.docs[id], tr = d.deleted;
    menu.innerHTML = tr
      ? `<button data-a="restoreDoc">Restore</button><button data-a="deletePermanent">Delete forever</button>`
      : `<button data-a="openDoc">Open</button><button data-a="openRenameModal">Rename</button><button data-a="toggleStar">${d.starred ? 'Unstar' : 'Star'}</button><button data-a="openShareModal">Share…</button><button data-a="moveDoc">Move to folder…</button><hr><div class="dp-dots">${Object.entries(COLORS).map(([k, c]) => `<i data-c="${k}" style="background:${c}" title="${k}"></i>`).join('')}<i data-c="" style="background:var(--border)" title="No label"></i></div><hr><button data-a="trashDoc">Move to Trash</button>`;
    menu.dataset.id = id; menu.style.display = 'block';
    menu.style.left = Math.min(e.clientX, innerWidth - 210) + 'px'; menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 8) + 'px';
  });
  menu.onclick = async e => {
    const id = menu.dataset.id, a = e.target.dataset.a, c = e.target.dataset.c;
    menu.style.display = 'none';
    if (a && typeof window[a] === 'function') window[a](id);
    else if (c !== undefined && e.target.tagName === 'I') { try { await docsRef().doc(id).update({ color: c || firebase.firestore.FieldValue.delete() }); } catch (err) { toast('Could not set label.'); } }
  };
  document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.style.display = 'none'; });

  /* ── command palette (Ctrl/Cmd+K) ── */
  const pal = document.createElement('div'); pal.className = 'dp-pal';
  pal.innerHTML = '<div><input id="dpPalIn" placeholder="Search documents or type a command…" autocomplete="off"><ul id="dpPalList"></ul></div>';
  document.body.appendChild(pal);
  let items = [], pi = 0;
  const ACTIONS = [
    ['New document', 'N', () => openCreateDocModal()], ['New folder', '', () => openCreateFolderModal()],
    ['Go to All documents', '', () => setFilter('all')], ['Go to Starred', '', () => setFilter('starred')], ['Go to Shared with me', '', () => setFilter('shared')], ['Go to Trash', '', () => setFilter('trash')],
    ['Switch grid / list view', 'G', () => setView(currentView === 'grid' ? 'list' : 'grid')], ['Toggle dark mode', '', () => $('dpDark').click()], ['Upgrade to Pro', '', () => openUpgradeModal()]
  ];
  function openPal() { pal.classList.add('open'); $('dpPalIn').value = ''; build(''); $('dpPalIn').focus(); }
  function closePal() { pal.classList.remove('open'); }
  function build(q) {
    q = q.toLowerCase();
    const docs = Object.values(cachedIndex.docs).filter(d => !d.deleted && (d.title || '').toLowerCase().includes(q)).slice(0, 8).map(d => [esc(d.title), 'Document', () => openDoc(d.id)]);
    const acts = ACTIONS.filter(a => a[0].toLowerCase().includes(q)).map(a => [a[0], a[1] ? 'Shortcut ' + a[1] : 'Command', a[2]]);
    items = [...docs, ...acts]; pi = 0; paint();
  }
  function paint() { $('dpPalList').innerHTML = items.length ? items.map((it, i) => `<li class="${i === pi ? 'on' : ''}" data-i="${i}"><span>${it[0]}</span><small>${it[1]}</small></li>`).join('') : '<li><small>No matches</small></li>'; }
  function run(i) { const it = items[i]; if (it) { closePal(); it[2](); } }
  $('dpPalIn').oninput = e => build(e.target.value);
  $('dpPalList').onclick = e => { const li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); };
  pal.onclick = e => { if (e.target === pal) closePal(); };
  $('dpPalIn').onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); pi = Math.min(items.length - 1, pi + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pi = Math.max(0, pi - 1); paint(); }
    else if (e.key === 'Enter') run(pi); else if (e.key === 'Escape') closePal();
  };

  /* ── global shortcuts ── */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.classList.contains('open') ? closePal() : openPal(); return; }
    if (e.key === 'Escape') { sel.clear(); menu.style.display = 'none'; if (currentUser) render(); }
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey || e.altKey || !currentUser) return;
    if (e.key === 'n') { e.preventDefault(); openCreateDocModal(); }
    else if (e.key === 'g') setView(currentView === 'grid' ? 'list' : 'grid');
    else if (e.key === '/') { e.preventDefault(); $('searchInput').focus(); }
  });

  /* ── toasts (wraps the existing status-bar messages) ── */
  const tEl = document.createElement('div'); tEl.className = 'dp-toast'; document.body.appendChild(tEl);
  let tT; function toast(m) { tEl.textContent = m; tEl.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => tEl.classList.remove('show'), 2600); }
  const _set = window.setStatus;
  window.setStatus = function (m) { _set(m); if (m && m !== 'Ready') toast(m); };
  window.DP = { toast, openPal };
})();

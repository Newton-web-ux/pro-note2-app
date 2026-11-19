/* ==========================================================================
   Pro Document — word-icons.js
   Replaces the emoji icons on the ribbon with a flat, Word-style SVG icon set
   and adds Word's "Collapse the Ribbon" behaviour.

   Load it LAST, after the other add-on scripts:
       <script src="word-icons.js?v=1"></script>
   Buttons added later by other scripts (File tab, Website tab, Draw mode
   toggle…) are converted automatically.
   ========================================================================== */
(function () {
  'use strict';
  if (window.WordIcons) return;

  /* ── Icon set: 24×24, drawn with shared classes so colours live in the CSS ──
     p  = outline        f  = light-blue fill + outline     s  = solid blue
     fy = yellow fill    fo = orange fill   g  = green line  r  = red line   o = orange line */
  const I = {
    undo: '<path class="p" d="M9 6 4 11l5 5"/><path class="p" d="M4 11h10a5.5 5.5 0 0 1 0 11h-3"/>',
    redo: '<path class="p" d="m15 6 5 5-5 5"/><path class="p" d="M20 11H10a5.5 5.5 0 0 0 0 11h3"/>',
    find: '<circle class="f" cx="10.5" cy="10.5" r="6.5"/><path class="p" d="m15.5 15.5 5.5 5.5"/>',
    zoomin: '<circle class="f" cx="10.5" cy="10.5" r="6.5"/><path class="p" d="m15.5 15.5 5.5 5.5M8 10.5h5M10.5 8v5"/>',
    zoomout: '<circle class="f" cx="10.5" cy="10.5" r="6.5"/><path class="p" d="m15.5 15.5 5.5 5.5M8 10.5h5"/>',
    page: '<path class="f" d="M6 3h8l4 4v14H6z"/><path class="p" d="M14 3v4h4M9 13h6M9 17h6"/>',
    pageadd: '<path class="f" d="M5 3h8l4 4v6"/><path class="p" d="M13 3v4h4"/><circle class="fo" cx="17" cy="17" r="5"/><path class="p" d="M17 14.5v5M14.5 17h5"/>',
    trash: '<path class="r" d="M4.5 7h15M9.5 7V4h5v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
    table: '<rect class="f" x="3" y="5" width="18" height="14" rx="1.5"/><path class="p" d="M3 10h18M3 14.5h18M9 5v14M15 5v14"/>',
    image: '<rect class="f" x="3" y="5" width="18" height="14" rx="1.5"/><circle class="s" cx="8.5" cy="10" r="1.6"/><path class="p" d="m4 18 5-5 4 4 3-3 4 4"/>',
    scissors: '<circle class="p" cx="7" cy="17.5" r="2.5"/><circle class="p" cx="7" cy="6.5" r="2.5"/><path class="p" d="m9 8 11 9M9 16 20 7"/>',
    line: '<path class="p" d="M4 12h16"/><path class="p" opacity=".4" d="M4 7h16M4 17h10"/>',
    chartline: '<path class="p" d="M4 4v16h16"/><path class="o" d="m7 15 4-5 3 3 5-6"/>',
    chartbar: '<path class="p" d="M4 4v16h16"/><rect class="f" x="7" y="12" width="3" height="7"/><rect class="fo" x="12" y="7" width="3" height="12"/><rect class="f" x="17" y="14" width="2.5" height="5"/>',
    shapes: '<rect class="f" x="3" y="11" width="9" height="9" rx="1"/><circle class="fo" cx="16.5" cy="16.5" r="4.5"/><path class="f" d="m12 3 5 8H7z"/>',
    cube: '<path class="f" d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path class="p" d="m12 12 8-4.5M12 12 4 7.5M12 12v9"/>',
    star: '<path class="fy" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    pencil: '<path class="f" d="m4 20 1-4L16 5l3 3L8 19z"/><path class="p" d="m14 7 3 3"/>',
    pen: '<path class="f" d="m14 4 6 6-8 8-5 1 1-5z"/><path class="p" d="m4 20 3-3"/>',
    highlighter: '<path class="fy" d="m13 4 7 7-6 6-7-7z"/><path class="p" d="m7 10-3 7 3-1 3-3"/><path class="o" d="M4 21h9"/>',
    eraser: '<path class="f" d="m4 15 9-9 6 6-6 6H8z"/><path class="p" d="m9 10 6 6M12 18h8"/>',
    check: '<path class="g" d="m5 12.5 4.5 4.5L19 7"/>',
    skipback: '<path class="p" d="M6 5v14"/><path class="s" d="M19 5v14L8 12z"/>',
    play: '<path class="s" d="m7 4 13 8-13 8z"/>',
    stop: '<rect class="s" x="6" y="6" width="12" height="12" rx="1.5"/>',
    save: '<path class="f" d="M4 4h13l3 3v13H4z"/><path class="p" d="M7 4v5h8V4M7 20v-7h10v7"/>',
    folder: '<path class="f" d="M3 6h6l2 2h10v11H3z"/><path class="p" d="M3 10h18"/>',
    clipboard: '<rect class="f" x="5" y="5" width="14" height="16" rx="1.5"/><rect class="p" x="9" y="3" width="6" height="4" rx="1"/><path class="p" d="M8 12h8M8 16h8"/>',
    sparkle: '<path class="fy" d="m10 3 1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z"/><path class="fo" d="m18 14 .9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/>',
    sigma: '<path class="p" d="M18 5H6l6 7-6 7h12"/>',
    code: '<path class="p" d="m9 7-5 5 5 5M15 7l5 5-5 5"/>',
    gear: '<circle class="f" cx="12" cy="12" r="6"/><circle class="p" cx="12" cy="12" r="2.4"/><path class="p" d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2"/>',
    pages: '<rect class="f" x="4" y="8" width="14" height="12" rx="1.5"/><path class="p" d="M7 8V5h13v12h-2"/>',
    link: '<path class="p" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path class="p" d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    palette: '<path class="f" d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.3.3-2.5 1.7-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3z"/><circle class="s" cx="7.5" cy="11.5" r="1.2"/><circle class="s" cx="10.5" cy="7.5" r="1.2"/><circle class="s" cx="15" cy="8" r="1.2"/>',
    plug: '<path class="p" d="M9 3v5M15 3v5M12 18v3"/><path class="f" d="M6 8h12v4a6 6 0 0 1-12 0z"/>',
    mail: '<rect class="f" x="3" y="6" width="18" height="13" rx="1.5"/><path class="p" d="m3 7 9 7 9-7"/>',
    eye: '<path class="f" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle class="s" cx="12" cy="12" r="2.8"/>',
    globe: '<circle class="f" cx="12" cy="12" r="9"/><path class="p" d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    box: '<path class="f" d="m3 8 9-4 9 4v9l-9 4-9-4z"/><path class="p" d="m3 8 9 4 9-4M12 12v9"/>',
    rocket: '<path class="f" d="M12 3c4 2 6 6 5 11l-3 3h-4l-3-3c-1-5 1-9 5-11z"/><circle class="p" cx="12" cy="10" r="1.8"/><path class="o" d="m8 17-3 4M16 17l3 4"/>',
    help: '<circle class="f" cx="12" cy="12" r="9"/><path class="p" d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><circle class="s" cx="12" cy="17" r=".9"/>',
    print: '<path class="f" d="M7 3h10v5H7z"/><rect class="f" x="3" y="8" width="18" height="9" rx="1.5"/><path class="p" d="M7 14h10v7H7z"/>',
    download: '<path class="p" d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
    upload: '<path class="p" d="M12 16V5M7 9l5-5 5 5M4 20h16"/>',
    comment: '<path class="f" d="M4 5h16v11H10l-4 4v-4H4z"/>',
    lock: '<rect class="f" x="5" y="11" width="14" height="10" rx="1.5"/><path class="p" d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    plus: '<path class="p" d="M12 5v14M5 12h14"/>',
    refresh: '<path class="p" d="M20 11a8 8 0 0 0-14-4M4 13a8 8 0 0 0 14 4"/><path class="p" d="M5 3v4h4M19 21v-4h-4"/>',
    mic: '<rect class="f" x="9" y="3" width="6" height="11" rx="3"/><path class="p" d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    note: '<path class="f" d="M5 3h14v18H5z"/><path class="p" d="M8 8h8M8 12h8M8 16h5"/>',
    close: '<path class="r" d="m6 6 12 12M18 6 6 18"/>',
    chevup: '<path class="p" d="m6 15 6-6 6 6"/>',
    chevdown: '<path class="p" d="m6 9 6 6 6-6"/>'
  };

  /* emoji / glyph → icon name */
  const G = {
    '↶': 'undo', '↷': 'redo', '🔍': 'find', '🔎': 'zoomout', '📄': 'pageadd', '🗑': 'trash', '⊞': 'table', '🖼': 'image', '✂': 'scissors', '—': 'line',
    '📈': 'chartline', '📊': 'chartbar', '◆': 'shapes', '⬣': 'cube', '⭐': 'star', '✏': 'pencil', '🖊': 'pen', '🖍': 'highlighter', '🧽': 'eraser', '✔': 'check', '✅': 'check',
    '⏮': 'skipback', '▶': 'play', '⏹': 'stop', '💾': 'save', '📂': 'folder', '📁': 'folder', '📋': 'clipboard', '✨': 'sparkle', '∑': 'sigma', '🧾': 'code',
    '⚙': 'gear', '🗂': 'pages', '🔗': 'link', '🎨': 'palette', '🔌': 'plug', '✉': 'mail', '📧': 'mail', '👁': 'eye', '🌐': 'globe', '📦': 'box', '🚀': 'rocket', '❓': 'help',
    '🖨': 'print', '📥': 'download', '⬇': 'download', '📤': 'upload', '⬆': 'upload', '💬': 'comment', '🔒': 'lock', '➕': 'plus', '🔄': 'refresh', '🔁': 'refresh',
    '🎤': 'mic', '📝': 'note', '📑': 'pages', '✕': 'close', '❌': 'close', '✖': 'close', '🏠': 'page'
  };
  /* label keywords win over the glyph (the same emoji is used for several commands) */
  const K = [[/zoom in/, 'zoomin'], [/zoom out/, 'zoomout'], [/add page|new page/, 'pageadd'], [/pages? panel/, 'pages'], [/del(ete)? image/, 'scissors'], [/^\s*find\b/, 'find']];

  const svg = n => `<svg class="wi" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${I[n]}</svg>`;
  const norm = s => s.replace(/[︎️‍]/g, '').trim();

  function convert(root) {
    (root || document).querySelectorAll('.tb-icon:not(.text):not([data-wi])').forEach(el => {
      const g = norm(el.textContent), btn = el.closest('button'), label = btn ? ((btn.textContent || '') + ' ' + (btn.title || '')).toLowerCase().replace(g.toLowerCase(), '') : '';
      let name = null; for (const [re, n] of K) if (re.test(label)) { name = n; break; }
      if (!name) name = G[g];
      if (name && I[name]) { el.innerHTML = svg(name); el.setAttribute('data-wi', name); } else el.setAttribute('data-wi', '');   // '' = unmapped glyph, left as text
    });
  }
  let t = null;
  const queue = () => { if (t) return; t = requestAnimationFrame(() => { t = null; convert(); }); };
  new MutationObserver(m => { if (m.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('.tb-icon') || n.querySelector('.tb-icon'))))) queue(); }).observe(document.body, { childList: true, subtree: true });

  /* ── Collapse / pin the ribbon, like Word ── */
  const KEY = 'wi_ribbon_collapsed';
  const tabs = document.querySelector('.ribbon-tabs');
  function setCollapsed(on, save) {
    document.body.classList.toggle('rb-collapsed', on); document.body.classList.remove('rb-peek');
    const b = document.getElementById('rbCollapse'); if (b) { b.innerHTML = svg(on ? 'chevdown' : 'chevup'); b.title = on ? 'Pin the Ribbon (Ctrl+F1)' : 'Collapse the Ribbon (Ctrl+F1)'; }
    if (save !== false) try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }
  if (tabs) {
    const b = document.createElement('button'); b.id = 'rbCollapse'; b.className = 'rb-collapse'; b.type = 'button'; tabs.appendChild(b);
    b.addEventListener('click', () => setCollapsed(!document.body.classList.contains('rb-collapsed')));
    tabs.addEventListener('click', e => { const tb = e.target.closest('.tab-btn'); if (tb && document.body.classList.contains('rb-collapsed')) document.body.classList.add('rb-peek'); });
    tabs.addEventListener('dblclick', e => { if (e.target.closest('.tab-btn')) setCollapsed(!document.body.classList.contains('rb-collapsed')); });
    document.addEventListener('mousedown', e => { if (document.body.classList.contains('rb-peek') && !e.target.closest('.ribbon-toolbar,.ribbon-tabs')) document.body.classList.remove('rb-peek'); });
    document.addEventListener('click', e => { if (document.body.classList.contains('rb-peek') && e.target.closest('.ribbon-toolbar .tb-btn')) setTimeout(() => document.body.classList.remove('rb-peek'), 0); });
    document.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'F1') { e.preventDefault(); setCollapsed(!document.body.classList.contains('rb-collapsed')); } });
    let saved = false; try { saved = localStorage.getItem(KEY) === '1'; } catch (e) {}
    setCollapsed(saved, false);
  }

  convert();
  window.WordIcons = { convert, icons: I, svg };
})();

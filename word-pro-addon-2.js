/* Pro Document — Editor add-on #2 (Tools + File tabs) — v2.
   Add AFTER word-pro-addon.js, as the last script before </body>:
   <script src="word-pro-addon-2.js"></script>

   Keeps everything from v1 (outline, highlight, effects, list styles, checklist, image tools,
   signature, dictation, autocorrect, fit width, templates, exports, backup, import) and adds:
   Find & Replace dialog (case / whole word / regex), Go To, Command palette (Ctrl+/),
   Track Changes (accept / reject), comment list, readability stats, document check,
   table formulas / sort / borders / text<->table, real .docx export, CSV + Markdown import,
   drag-drop & clean paste, Tab navigation, smarter autocorrect (smart quotes, typos, caps),
   page tools (insert / duplicate / move), page-number styles, cover page, symbols panel,
   citations + bibliography, callouts, dividers, more templates, document info.            */
(function () {
  'use strict';
  if (window.WP2) return;

  /* ───────────────────────── helpers ───────────────────────── */
  const $ = id => document.getElementById(id);
  const ro = () => typeof isReadOnly !== 'undefined' && isReadOnly;
  const pg = () => pages[currentPage];
  const say = m => typeof setStatus === 'function' && setStatus(m);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pd.wp2.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pd.wp2.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  let saved = null, rec = null, listening = false, outlineT, track = false, onClose = null;
  let autocorrect = store.get('auto', true), smartQ = store.get('smartq', true), numFmt = store.get('numfmt', 'plain');
  const fnd = { marks: [], i: -1, key: '' };

  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && pages.some(p => p.contains(s.anchorNode))) saved = s.getRangeAt(0).cloneRange();
    const w = s.toString().trim(), el = $('wp2Sel');
    if (el) el.textContent = w ? `Selected: ${w.split(/\s+/).length} words · ${w.length} chars · ` : '';
  });
  const restore = () => {
    let r = saved;
    if (!r || !r.startContainer.isConnected || !pages.some(p => p.contains(r.startContainer))) {
      r = document.createRange(); r.selectNodeContents(pg()); r.collapse(false);
    }
    const p = pages.find(x => x.contains(r.startContainer));
    if (p && document.activeElement !== p) p.focus({ preventScroll: true });
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  const guard = f => (...a) => {
    if (ro()) return say('This document is view-only.');
    restore();
    try { return f(...a); } catch (e) { console.warn(e); say('Action failed: ' + (e.message || e)); }
  };
  const el0 = () => { const n = getSelection().anchorNode; return n && (n.nodeType === 1 ? n : n.parentNode); };
  const blk = () => { let n = el0(); const root = pg(); while (n && n !== root) { if (/^(P|H[1-6]|LI|DIV|BLOCKQUOTE|PRE|TD|TH)$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
  const cell = () => { const e = el0(); return e && e.closest ? e.closest('td,th') : null; };
  const inTag = (n, sel) => { n = n && (n.nodeType === 1 ? n : n.parentNode); return n && n.closest ? n.closest(sel) : null; };
  const BLOCK_SEL = 'p,div,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,pre';
  const blockOf = n => inTag(n, BLOCK_SEL);
  const dirty = el => { const p = el && pages.find(x => x.contains(el)); (p || pg()).dispatchEvent(new Event('input', { bubbles: true })); };
  const wrap = css => {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) return say('Select some text first.');
    const r = s.getRangeAt(0), sp = document.createElement('span');
    sp.style.cssText = css; sp.appendChild(r.extractContents()); r.insertNode(sp);
    s.removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(sp); s.addRange(nr);
  };
  const dl = (name, data, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const title = () => ($('docTitleDisplay').textContent.replace(/^—\s*/, '').trim() || 'document').replace(/[\\/:*?"<>|]/g, '_');
  const clean = html => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,iframe,object,embed,link,meta,style,form,base,o\\:p,img[src^="file:"],img[src^="cid:"]').forEach(n => n.remove());
    d.querySelectorAll('*').forEach(n => {
      [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); });
      if (n.hasAttribute('class') && /^Mso/i.test(n.getAttribute('class'))) n.removeAttribute('class');
      const st = n.getAttribute('style');
      if (st) { const k = st.split(';').filter(x => x.trim() && !/^\s*mso-/i.test(x)).join(';'); k ? n.setAttribute('style', k) : n.removeAttribute('style'); }
    });
    return d.body.innerHTML;
  };
  const cleanCopy = () => pages.map(p => {
    const c = p.cloneNode(true);
    c.querySelectorAll('mark.wp-hit').forEach(m => m.replaceWith(...m.childNodes));
    c.querySelectorAll('.img-handle,#drawCanvasOverlay').forEach(m => m.remove());
    return c;
  });
  const loadScript = (url, test) => new Promise((ok, no) => {
    if (test()) return ok();
    const s = document.createElement('script'); s.src = url; s.onload = ok;
    s.onerror = () => no(new Error('Could not load ' + url.split('/').pop() + ' (needs internet)'));
    document.head.appendChild(s);
  });
  const setZoom = z => {
    currentZoom = Math.max(.4, Math.min(2, z));
    $('contentArea').style.zoom = currentZoom; $('zoomLabel').textContent = Math.round(currentZoom * 100) + '%';
    const zs = $('wpZoom'); if (zs) zs.value = Math.round(currentZoom * 100);
  };
  const eachText = fn => pages.forEach(p => {
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), list = [];
    while (w.nextNode()) { const n = w.currentNode; if (n.parentNode && !n.parentNode.closest('.wp-math,.lai-math,script,style,pre,code')) list.push(n); }
    list.forEach(fn);
  });
  const toText = n => {
    if (n.nodeType === 3) return n.data.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const t = n.tagName;
    if (/^(SCRIPT|STYLE)$/.test(t) || n.classList.contains('wp-wm')) return '';
    if (t === 'BR') return '\n';
    if (t === 'INPUT') return n.checked ? '[x] ' : '[ ] ';
    if (n.classList.contains('lai-math')) return n.dataset.tex || n.textContent;
    const s = [...n.childNodes].map(toText).join('');
    if (t === 'TR') return s + '\n';
    if (/^(TD|TH)$/.test(t)) return s.trim() + '\t';
    if (t === 'LI') return '\n' + (n.parentNode && n.parentNode.tagName === 'OL' ? (([...n.parentNode.children].indexOf(n) + 1) + '. ') : '• ') + s.trim() + '\n';
    if (/^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|HR)$/.test(t)) return '\n' + s + '\n';
    return s;
  };
  const textOf = n => toText(n).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const docText = () => pages.map(textOf).join('\n\n');
  const wordCount = t => { t = t.trim(); return t ? t.split(/\s+/).length : 0; };
  const roman = n => { const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let r = ''; m.forEach(([v, s]) => { while (n >= v) { r += s; n -= v; } }); return r; };
  const headings = () => { const hs = []; pages.forEach((p, i) => p.querySelectorAll('h1,h2,h3').forEach(h => { if (h.textContent.trim() && !h.closest('.wp-toc')) hs.push([+h.tagName[1], h.textContent.trim(), i + 1, h]); })); return hs; };

  /* ───────────────────────── styles ───────────────────────── */
  const css = document.createElement('style');
  css.textContent = `
  .wp2-ov{position:fixed;inset:0;z-index:10050;display:flex;align-items:flex-start;justify-content:center;background:rgba(15,30,60,.35);padding-top:10vh}
  .wp2-ov.side{background:none;pointer-events:none;justify-content:flex-end;padding:96px 24px 0 0}
  .wp2-dlg{background:#fff;border-radius:10px;box-shadow:0 18px 48px rgba(15,30,60,.32);pointer-events:auto;max-width:96vw;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;font-size:13px;color:var(--text)}
  .wp2-dh{background:var(--accent);color:#fff;padding:9px 12px;display:flex;justify-content:space-between;align-items:center;font-size:13px}
  .wp2-dh button{background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer}
  .wp2-db{padding:12px;overflow:auto}
  .wp2-db input[type=text],.wp2-db input[type=search],.wp2-db textarea,.wp2-db select{width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;font:inherit}
  .wp2-db label{display:inline-flex;align-items:center;gap:5px;margin:0 10px 6px 0;font-size:12px;cursor:pointer}
  .wp2-act{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}
  .wp2-act button{border:1px solid var(--border);background:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;font:inherit}
  .wp2-act button:hover{background:var(--accent-light);border-color:var(--accent)}
  .wp2-act button.pri{background:var(--accent);color:#fff;border-color:var(--accent)}
  .wp2-act span{color:var(--muted);font-size:11px}
  .wp2-row{padding:8px 0;border-bottom:1px solid #eee}.wp2-q{font-style:italic;color:var(--muted);margin-bottom:2px}
  .wp2-tbl{border-collapse:collapse;width:100%}.wp2-tbl td{padding:4px 8px 4px 0;vertical-align:top;border-bottom:1px solid #f0f0f0}.wp2-tbl td:first-child{color:var(--muted);white-space:nowrap}
  .wp2-sym{display:grid;grid-template-columns:repeat(10,1fr);gap:3px;margin-bottom:8px}
  .wp2-sym button{height:30px;border:1px solid var(--border);background:#fff;border-radius:4px;cursor:pointer;font-size:16px;padding:0}
  .wp2-sym button:hover{background:var(--accent-light);border-color:var(--accent)}
  .wp2-sh{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin:6px 0 4px}
  .wp2-pi{padding:7px 10px;cursor:pointer;display:flex;justify-content:space-between;border-radius:6px;gap:12px}.wp2-pi.on{background:var(--accent-light)}.wp2-pi small{color:var(--muted)}
  .wp2-cv{border:1px dashed #999;border-radius:6px;margin:4px 0 8px;touch-action:none;width:100%;background:#fff}
  mark.wp-hit{background:#ffe066;color:inherit}mark.wp-cur{background:#ff9f43;outline:2px solid #e67e22}
  ins.wp-ins{color:#1a7f37;text-decoration:underline;background:rgba(26,127,55,.08)}
  del.wp-del{color:#c0392b;text-decoration:line-through;background:rgba(192,57,43,.08)}
  #wp2Trk{font-weight:700;color:#ffd27a}
  .page code{background:#f1f3f7;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:.92em}
  @media print{mark.wp-hit,mark.wp-cur{background:none!important;outline:none!important}.wp2-ov{display:none!important}}`;
  document.head.appendChild(css);

  /* ───────────────────────── modal helper ───────────────────────── */
  function closeModal() { const m = $('wp2Modal'); if (m) m.remove(); const f = onClose; onClose = null; if (typeof f === 'function') f(); }
  function modal(ttl, body, o = {}) {
    closeModal();
    const ov = document.createElement('div'); ov.id = 'wp2Modal'; ov.className = 'wp2-ov' + (o.side ? ' side' : '');
    ov.innerHTML = `<div class="wp2-dlg" style="width:${o.w || 460}px" role="dialog" aria-label="${esc(ttl)}"><div class="wp2-dh"><b>${esc(ttl)}</b><button data-x aria-label="Close">✕</button></div><div class="wp2-db">${body}</div></div>`;
    document.body.appendChild(ov);
    onClose = o.onClose || null;
    if (!o.side) ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
    ov.querySelector('[data-x]').onclick = closeModal;
    return ov;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('wp2Modal')) closeModal(); });

  /* ───────────────────────── ribbon ───────────────────────── */
  const b = (ic, l, fn, t) => `<button class="tb-btn" onmousedown="event.preventDefault()" onclick="${fn}" title="${t || l}"><span class="tb-icon">${ic}</span>${l}</button>`;
  const sbt = (l, fn, t) => `<button class="tb-btn small" onmousedown="event.preventDefault()" onclick="${fn}" title="${t || l}">${l}</button>`;
  const sl = (label, opts, fn, w) => `<select class="tb-select" style="width:${w || 120}px" onchange="${fn}(this.value);this.selectedIndex=0" title="${label}"><option value="">${label}</option>${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
  const ci = (fn, val, t) => `<input type="color" class="tb-color" value="${val}" onchange="${fn}(this.value)" title="${t}">`;
  function addTab(id, label, groups) {
    const t = document.createElement('button'); t.className = 'tab-btn'; t.dataset.tab = id; t.textContent = label; t.onclick = () => switchTab(id);
    document.querySelector('.ribbon-tabs').appendChild(t);
    const d = document.createElement('div'); d.id = id; d.className = 'ribbon-toolbar';
    d.innerHTML = groups.map(g => `<div class="ribbon-group"><div class="ribbon-group-row">${g[1]}</div>${g[2] ? `<div class="ribbon-group-row">${g[2]}</div>` : ''}<div class="ribbon-group-label">${g[0]}</div></div>`).join('');
    document.querySelector('.find-bar').before(d);
  }
  function addGroup(tabId, label, row1, row2) {
    const host = $(tabId) || $('wp2tools'), g = document.createElement('div'); g.className = 'ribbon-group';
    g.innerHTML = `<div class="ribbon-group-row">${row1}</div>${row2 ? `<div class="ribbon-group-row">${row2}</div>` : ''}<div class="ribbon-group-label">${label}</div>`;
    host.appendChild(g);
  }

  addTab('wp2tools', 'Tools', [
    ['Navigate', b('🧭', 'Outline', 'WP2.outline()') + b('🔎', 'Highlight All', 'WP2.hitAll()') + b('🧼', 'Clear', 'WP2.hitClear()') + b('🔍', 'Find & Replace', 'WP2.findDlg()', 'Find and replace (Ctrl+H)') + b('🎯', 'Go To', 'WP2.goto()', 'Go to page or heading (Ctrl+G)') + b('⌘', 'Commands', 'WP2.palette()', 'Command palette (Ctrl+/)')],
    ['Text effects', sl('Effects', [['shadow', 'Shadow'], ['caps', 'Small caps'], ['strong', 'Bold + caps'], ['clear', 'Clear effects']], 'WP2.effect', 100) + sl('Letter spacing', [['0', 'Normal'], ['1px', 'Wide'], ['3px', 'Wider'], ['-0.5px', 'Tight']], 'WP2.spacing', 110),
      sl('List style', [['disc', '• Disc'], ['circle', '○ Circle'], ['square', '■ Square'], ['decimal', '1. 2. 3.'], ['lower-alpha', 'a. b. c.'], ['upper-alpha', 'A. B. C.'], ['lower-roman', 'i. ii. iii.'], ['upper-roman', 'I. II. III.']], 'WP2.listStyle', 100) + b('☑', 'Checklist', 'WP2.checklist()')],
    ['Paragraph', sl('Border', [['box', 'Box'], ['bottom', 'Bottom line'], ['left', 'Left bar'], ['none', 'No border']], 'WP2.pBorder', 96) + ci('WP2.pShade', '#fff3b0', 'Paragraph shading') + sl('Callout', [['info', 'ℹ️ Info'], ['tip', '💡 Tip'], ['warn', '⚠️ Warning'], ['ok', '✅ Success'], ['note', '📝 Note']], 'WP2.callout', 96),
      sbt('A→Z', "WP2.sortLines('asc')", 'Sort selected lines / list A→Z') + sbt('Z→A', "WP2.sortLines('desc')", 'Sort selected lines / list Z→A') + sl('Direction', [['ltr', 'Left → right'], ['rtl', 'Right → left']], 'WP2.dir', 100) + sbt('[ ]▸', 'WP2.nextPh()', 'Jump to next [placeholder] (Alt+])')],
    ['Image', b('⟳', 'Rotate', "WP2.img('rot')") + b('⇋', 'Flip', "WP2.img('flip')") + b('🔲', 'Border', "WP2.img('border')"), sl('Filter', [['none', 'None'], ['grayscale(1)', 'Grayscale'], ['sepia(.8)', 'Sepia'], ['brightness(1.3)', 'Brighter'], ['contrast(1.4)', 'Contrast'], ['invert(1)', 'Invert'], ['blur(2px)', 'Blur']], 'WP2.imgFilter', 90) + sl('Opacity', [['1', '100%'], ['.75', '75%'], ['.5', '50%'], ['.25', '25%']], 'WP2.imgOpacity', 80)],
    ['Image size & style', sl('Size', [['25', '25% of page'], ['50', '50%'], ['75', '75%'], ['100', 'Full width']], 'WP2.imgSize', 96) + sl('Align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], 'WP2.imgAlign', 80) + sl('Crop', [['none', 'None'], ['inset(10%)', 'Trim 10%'], ['inset(20%)', 'Trim 20%'], ['circle(50%)', 'Circle'], ['ellipse(50% 40%)', 'Ellipse']], 'WP2.imgCrop', 80),
      sbt('Shadow', "WP2.img('shadow')") + sbt('Round', "WP2.img('round')", 'Rounded corners') + sbt('Duplicate', "WP2.img('dup')") + sbt('Reset', "WP2.img('reset')", 'Remove all image effects') + sbt('From URL', 'WP2.imgUrl()', 'Insert image from a web address')],
    ['Arrange', b('⬆', 'Bring Front', "WP2.img('front')") + b('⬇', 'Send Back', "WP2.img('back')") + b('♿', 'Alt Text', "WP2.img('alt')")],
    ['Productivity', b('✍', 'Signature', 'WP2.sign()') + b('🎤', 'Dictate', 'WP2.dictate()') + b('⚡', 'Autocorrect', 'WP2.toggleAuto()') + b('❝', 'Smart Quotes', 'WP2.toggleQuotes()') + b('↔', 'Fit Width', 'WP2.fit()')],
    ['Insert', b('📕', 'Cover Page', 'WP2.cover()') + b('Ω', 'Symbols', 'WP2.symbols()') + sl('Divider', [['line', '────── Line'], ['thick', '━━━━━━ Thick'], ['dotted', '······ Dotted'], ['double', '══════ Double'], ['fancy', '✦ ✦ ✦ Fancy']], 'WP2.divider', 110)],
    ['Templates', sl('Insert template', [['invoice', 'Invoice'], ['minutes', 'Meeting minutes'], ['cover', 'Cover letter'], ['plan', 'Project plan'], ['memo', 'Memo'], ['resume', 'Resume'], ['agenda', 'Meeting agenda'], ['weekly', 'Weekly planner'], ['certificate', 'Certificate'], ['press', 'Press release'], ['report', 'Report outline']], 'WP2.template', 130)]
  ]);

  addTab('wp2file', 'File', [
    ['Export', b('📘', 'Word (.docx)', "WP2.exp('docx')", 'Real Word document') + b('📝', 'Word (.doc)', "WP2.exp('doc')") + b('🌐', 'HTML', "WP2.exp('html')") + b('Ⓜ', 'Markdown', "WP2.exp('md')") + b('🗒', 'Text', "WP2.exp('txt')")],
    ['Backup', b('💾', 'JSON Backup', "WP2.exp('json')") + b('🖨', 'Print', 'window.print()')],
    ['Import', b('📂', 'Import File', 'WP2.imp()', 'Word .docx, .html, .md, .txt, .csv, .tsv, JSON backup (or drag a file onto the page)')],
    ['Document', b('☁', 'Save Now', 'WP2.saveNow()') + b('🕘', 'Save Version', 'WP2.saveVer()') + b('ℹ', 'Info', 'WP2.info()', 'Document statistics') + b('🏠', 'Dashboard', 'goDashboard()')]
  ]);

  /* extra groups appended to the tabs from add-on #1 (fall back to Tools if absent) */
  addGroup('wpedit', 'Pages', b('➕', 'Insert Page', 'WP2.pageHere()', 'Insert a page after this one (Ctrl+Enter)') + b('⧉', 'Duplicate', 'WP2.dupPage()') + b('▲', 'Move Up', 'WP2.movePage(-1)') + b('▼', 'Move Down', 'WP2.movePage(1)'),
    sl('Page numbers', [['plain', '1, 2, 3'], ['page', 'Page 1'], ['of', 'Page 1 of N'], ['roman', 'i, ii, iii'], ['dash', '– 1 –']], 'WP2.numfmt', 110));
  addGroup('wptable', 'Calculate & data', sl('Formula', [['sumCol', 'Sum above'], ['avgCol', 'Average above'], ['minCol', 'Min above'], ['maxCol', 'Max above'], ['sumRow', 'Sum left'], ['avgRow', 'Average left']], 'WP2.tcalc', 110) + sbt('Sort A→Z', "WP2.tsort('asc')", 'Sort rows by this column') + sbt('Sort Z→A', "WP2.tsort('desc')") + sbt('Header row', 'WP2.theader()', 'Toggle header row'),
    sl('Autofit', [['content', 'To contents'], ['window', 'To window'], ['equal', 'Equal columns']], 'WP2.tfit', 100) + sl('Borders', [['all', 'All borders'], ['outside', 'Outside only'], ['rows', 'Row lines'], ['dashed', 'Dashed'], ['none', 'No borders']], 'WP2.tborder', 100) + sl('Vertical align', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], 'WP2.valign', 100));
  addGroup('wptable', 'Convert', sbt('Text → Table', 'WP2.t2tbl()', 'Turn selected lines (tab / comma / ; / | separated) into a table') + sbt('Table → Text', 'WP2.tbl2text()'));
  addGroup('wpref', 'Update & cite', b('🔄', 'Update TOC', 'WP2.tocUpdate()') + b('❞', 'Cite', 'WP2.cite()', 'Insert an APA citation') + b('📚', 'Bibliography', 'WP2.biblio()'));
  addGroup('wpreview', 'Track changes', b('📝', 'Track', 'WP2.trackToggle()', 'Track changes (Ctrl+Shift+E)') + b('⏭', 'Next', "WP2.chg('next')") + b('✅', 'Accept', "WP2.chg('accept')") + b('❌', 'Reject', "WP2.chg('reject')"), sbt('Accept all', "WP2.chg('acceptAll')") + sbt('Reject all', "WP2.chg('rejectAll')"));
  addGroup('wpreview', 'Insights', b('📈', 'Readability', 'WP2.readability()') + b('🩺', 'Check Doc', 'WP2.check()', 'Double spaces, repeated words, empty paragraphs, quotes') + b('🗨', 'Comment List', 'WP2.comments()'));

  /* status bar: selection counter + tracking badge */
  const sbr = document.querySelector('.status-bar-right');
  const trk = document.createElement('span'); trk.id = 'wp2Trk'; sbr.prepend(trk);
  const cnt = document.createElement('span'); cnt.id = 'wp2Sel'; sbr.prepend(cnt);

  /* ───────────────────────── outline pane ───────────────────────── */
  const side = $('pagesPanel'), od = document.createElement('div');
  od.innerHTML = '<div class="panel-section-title">Outline</div><div id="wp2Out" style="font-size:11px"></div>';
  side.insertBefore(od, side.children[1]);
  function buildOutline() {
    const box = $('wp2Out'), rows = [];
    pages.forEach((p, i) => p.querySelectorAll('h1,h2,h3').forEach((h, j) => { if (h.textContent.trim() && !h.closest('.wp-toc')) rows.push([+h.tagName[1], h.textContent.trim(), i, j]); }));
    box.innerHTML = rows.length ? rows.map((r, k) => `<div data-k="${k}" style="padding:3px 4px 3px ${4 + (r[0] - 1) * 10}px;cursor:pointer;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(r[1])}">${esc(r[1])}</div>`).join('') : '<div style="color:var(--muted)">Use Heading styles to build an outline.</div>';
    box._rows = rows;
  }
  $('wp2Out').onclick = e => {
    const k = e.target.dataset.k; if (k == null) return; const r = $('wp2Out')._rows[k];
    switchPage(r[2]); const t = [...pages[r[2]].querySelectorAll('h1,h2,h3')].filter(x => !x.closest('.wp-toc'))[r[3]];
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  $('contentArea').addEventListener('input', () => { clearTimeout(outlineT); outlineT = setTimeout(buildOutline, 400); });
  setTimeout(buildOutline, 1500); setInterval(buildOutline, 10000);

  /* ───────────────────────── autocorrect ───────────────────────── */
  const TYPOS = { teh: 'the', adn: 'and', recieve: 'receive', wich: 'which', taht: 'that', thier: 'their', becuase: 'because', seperate: 'separate', definately: 'definitely', occured: 'occurred', untill: 'until', wierd: 'weird', alot: 'a lot', accomodate: 'accommodate', acheive: 'achieve', beleive: 'believe', calender: 'calendar', goverment: 'government', enviroment: 'environment', tommorow: 'tomorrow', freind: 'friend', publically: 'publicly', neccessary: 'necessary', occassion: 'occasion', existance: 'existence', responsability: 'responsibility', dont: "don't", didnt: "didn't", doesnt: "doesn't", isnt: "isn't", ive: "I've" };
  const SYMS = { '(c)': '©', '(r)': '®', '(tm)': '™', '--': '—', '...': '…', '->': '→', '<-': '←', '=>': '⇒', '!=': '≠', '<=': '≤', '>=': '≥', '+-': '±', '1/2': '½', '1/4': '¼', '3/4': '¾' };
  const preText = (n, off) => { const bl = blockOf(n) || n.parentNode, r = document.createRange(); r.selectNodeContents(bl); r.setEnd(n, off); return r.toString(); };
  function smart(n, off, ch) {
    const prev = preText(n, off - 1).slice(-1);
    const rep = ch === '"' ? (!prev || /[\s(\[{\u2014\u2013\-\u2018]/.test(prev) ? '“' : '”') : (!prev || /[\s(\[{\u2014\u2013\-\u201C]/.test(prev) ? '‘' : '’');
    const s = getSelection(), r = document.createRange(); r.setStart(n, off - 1); r.setEnd(n, off); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertText', false, rep);
  }
  $('contentArea').addEventListener('input', e => {
    if (!autocorrect || ro() || track || e.isComposing || e.inputType !== 'insertText' || !e.data) return;
    const s = getSelection(); if (!s.rangeCount) return;
    const n = s.anchorNode; if (!n || n.nodeType !== 3 || !pages.some(p => p.contains(n)) || n.parentNode.closest('pre,code')) return;
    const off = s.anchorOffset;
    if (e.data === '"' || e.data === "'") { if (smartQ) smart(n, off, e.data); return; }
    if (e.data !== ' ') return;
    const before = n.data.slice(0, off - 1), blockText = (blockOf(n) || n.parentNode).textContent;
    const cut = len => { const r = document.createRange(); r.setStart(n, off - 1 - len); r.setEnd(n, off); s.removeAllRanges(); s.addRange(r); };
    let m;
    if ((m = before.match(/^(#{1,3})$/)) && blockText.trim() === m[1]) { cut(m[1].length); document.execCommand('delete'); document.execCommand('formatBlock', false, 'h' + m[1].length); return; }
    if (/^[-*]$/.test(before) && blockText.trim() === before) { cut(1); document.execCommand('delete'); document.execCommand('insertUnorderedList'); return; }
    if (/^1[.)]$/.test(before) && blockText.trim() === before) { cut(2); document.execCommand('delete'); document.execCommand('insertOrderedList'); return; }
    if (before === '>' && blockText.trim() === '>') { cut(1); document.execCommand('delete'); document.execCommand('formatBlock', false, 'blockquote'); return; }
    if (before === '[]' && blockText.trim() === '[]') { cut(2); document.execCommand('delete'); document.execCommand('insertHTML', false, '<ul style="list-style:none;padding-left:4px"><li><input type="checkbox"> </li></ul>'); return; }
    if ((m = before.match(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/))) { cut(m[0].length); document.execCommand('insertHTML', false, '<b>' + esc(m[1]) + '</b>&nbsp;'); return; }
    if ((m = before.match(/(^|[\s(])\*([^*\s](?:[^*]*[^*\s])?)\*$/))) { cut(m[0].length - m[1].length); document.execCommand('insertHTML', false, '<i>' + esc(m[2]) + '</i>&nbsp;'); return; }
    if ((m = before.match(/`([^`]+)`$/))) { cut(m[0].length); document.execCommand('insertHTML', false, '<code>' + esc(m[1]) + '</code>&nbsp;'); return; }
    for (const k in SYMS) if (before.endsWith(k)) { cut(k.length); document.execCommand('insertText', false, SYMS[k] + ' '); return; }
    const pre = preText(n, off - 1), wm = pre.match(/([A-Za-z']+)$/);
    if (wm && before.endsWith(wm[1])) {
      const w = wm[1], lw = w.toLowerCase(), prior = pre.slice(0, pre.length - w.length); let nw = w;
      if (TYPOS[lw]) nw = /^[A-Z]/.test(w) ? cap(TYPOS[lw]) : TYPOS[lw]; else if (w === 'i') nw = 'I';
      if (/^[a-z]/.test(nw) && (/^\s*$/.test(prior) || /[.!?]["')\]”’]?\s+$/.test(prior)) && !/\b(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|no|fig|approx)\.\s+$/i.test(prior)) nw = cap(nw);
      if (nw !== w) { const r = document.createRange(); r.setStart(n, off - 1 - w.length); r.setEnd(n, off); s.removeAllRanges(); s.addRange(r); document.execCommand('insertText', false, nw + ' '); }
    }
  });

  /* Tab key: next/previous table cell (adds a row at the end), list indent, or a tab-sized gap */
  $('contentArea').addEventListener('keydown', e => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || ro()) return;
    const t = el0(); if (!t || !pages.some(p => p.contains(t))) return;
    const c = t.closest('td,th'), li = t.closest('li');
    const selCell = x => { const r = document.createRange(); r.selectNodeContents(x); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
    if (c) {
      e.preventDefault();
      const cells = [...c.closest('table').querySelectorAll('td,th')], i = cells.indexOf(c);
      if (e.shiftKey) { if (i > 0) selCell(cells[i - 1]); return; }
      if (i < cells.length - 1) return selCell(cells[i + 1]);
      const tr = c.parentNode, nr = document.createElement('tr');
      for (let k = 0; k < tr.cells.length; k++) { const x = document.createElement('td'); x.style.cssText = 'border:1px solid #999;padding:6px 10px'; x.innerHTML = '&nbsp;'; nr.appendChild(x); }
      tr.after(nr); selCell(nr.cells[0]); dirty(nr);
    } else if (li) { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); }
    else { e.preventDefault(); document.execCommand('insertText', false, '\u00a0\u00a0\u00a0\u00a0'); }
  });

  /* checklist toggle persistence */
  $('contentArea').addEventListener('change', e => {
    const c = e.target; if (c.type !== 'checkbox') return;
    c.checked ? c.setAttribute('checked', '') : c.removeAttribute('checked');
    if (c.parentNode) { c.parentNode.style.textDecoration = c.checked ? 'line-through' : ''; c.parentNode.style.opacity = c.checked ? .6 : ''; }
  });

  /* Ctrl+wheel zoom */
  $('contentArea').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(currentZoom * (e.deltaY < 0 ? 1.05 : .95)); }, { passive: false });

  /* clean paste (Word / web) and pasted screenshots */
  $('contentArea').addEventListener('paste', e => {
    if (ro()) return;
    const cd = e.clipboardData; if (!cd) return;
    const html = cd.getData('text/html');
    if (html) { if (/(mso-|<o:p|class="?Mso|urn:schemas-microsoft-com|<script|\son\w+=)/i.test(html)) { e.preventDefault(); document.execCommand('insertHTML', false, clean(html)); } return; }
    const files = [...(cd.files || [])].filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(f => { const r = new FileReader(); r.onload = () => { restore(); document.execCommand('insertHTML', false, `<img src="${r.result}" style="max-width:100%">`); }; r.readAsDataURL(f); });
  });
  /* drag & drop files onto the page */
  $('contentArea').addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  $('contentArea').addEventListener('drop', e => {
    const fl = e.dataTransfer && [...e.dataTransfer.files]; if (!fl || !fl.length) return;
    e.preventDefault(); if (ro()) return say('This document is view-only.');
    fl.forEach(f => {
      if (/^image\//.test(f.type)) { const r = new FileReader(); r.onload = () => typeof insertDraggableImage === 'function' && insertDraggableImage(r.result, 260); r.readAsDataURL(f); }
      else importFile(f);
    });
  });

  /* clear find highlights before every save / version snapshot */
  ['saveDocument', 'saveVersion'].forEach(fn => {
    if (typeof window[fn] === 'function') { const _o = window[fn]; window[fn] = function () { WP2.hitClear(); return _o.apply(this, arguments); }; }
  });

  /* page-number styles */
  function updateNums() {
    pages.forEach((p, i) => {
      const n = i + 1;
      p.setAttribute('data-page-num', { plain: n, page: 'Page ' + n, of: `Page ${n} of ${pages.length}`, roman: roman(n).toLowerCase(), dash: `– ${n} –` }[numFmt] || n);
    });
  }
  new MutationObserver(() => { if (numFmt !== 'plain') updateNums(); }).observe($('contentArea'), { childList: true });
  if (numFmt !== 'plain') setTimeout(updateNums, 1500);

  /* ───────────────────────── find & replace ───────────────────────── */
  const rxEsc = q => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const buildRe = o => { let src = o.rx ? o.q : rxEsc(o.q); if (o.ww) src = '\\b(?:' + src + ')\\b'; return new RegExp(src, o.cs ? 'g' : 'gi'); };
  function markAll(re) {
    WP2.hitClear(); let n = 0;
    eachText(t => {
      re.lastIndex = 0; let m, last = 0, f = null;
      while ((m = re.exec(t.data))) {
        if (!m[0]) { re.lastIndex++; continue; }
        f = f || document.createDocumentFragment();
        f.append(t.data.slice(last, m.index));
        const k = document.createElement('mark'); k.className = 'wp-hit'; k.textContent = m[0]; f.append(k);
        last = m.index + m[0].length; n++;
      }
      if (f) { f.append(t.data.slice(last)); t.replaceWith(f); }
    });
    return n;
  }
  function findDlg() {
    const pre = getSelection().toString().trim();
    const m = modal('Find and replace', `<input type="text" id="wp2f" placeholder="Find" value="${esc(pre.length < 80 && !/\n/.test(pre) ? pre : '')}"><input type="text" id="wp2r" placeholder="Replace with">
      <label><input type="checkbox" id="wp2cs"> Match case</label><label><input type="checkbox" id="wp2ww"> Whole words</label><label><input type="checkbox" id="wp2rx"> Regex</label>
      <div class="wp2-act"><button data-a="prev">◀ Prev</button><button data-a="next" class="pri">Find next ▶</button><button data-a="rep">Replace</button><button data-a="all">Replace all</button><button data-a="hl">Highlight all</button></div>
      <div class="wp2-act"><span id="wp2fs">Enter = next · Shift+Enter = previous</span></div>`, { side: true, w: 360, onClose: () => WP2.hitClear() });
    const st = t => { $('wp2fs').textContent = t; };
    const opts = () => ({ q: $('wp2f').value, cs: $('wp2cs').checked, ww: $('wp2ww').checked, rx: $('wp2rx').checked });
    const search = () => {
      const o = opts(); if (!o.q) { WP2.hitClear(); st('Type something to find.'); return 0; }
      let re; try { re = buildRe(o); } catch (e) { st('Invalid pattern.'); return 0; }
      const n = markAll(re); fnd.marks = pages.flatMap(p => [...p.querySelectorAll('mark.wp-hit')]); fnd.key = JSON.stringify(o); fnd.i = -1; return n;
    };
    const show = () => {
      fnd.marks.forEach(x => x.classList.remove('wp-cur'));
      const cur = fnd.marks[fnd.i]; cur.classList.add('wp-cur');
      const pi = pages.findIndex(p => p.contains(cur)); if (pi !== currentPage) switchPage(pi);
      cur.scrollIntoView({ block: 'center', behavior: 'smooth' }); st(`${fnd.i + 1} of ${fnd.marks.length}`); $('wp2f').focus();
    };
    const step = d => {
      if (fnd.key !== JSON.stringify(opts()) || !fnd.marks.every(x => x.isConnected)) search();
      if (!fnd.marks.length) return st('No matches.');
      if (fnd.i < 0) fnd.i = d > 0 ? -1 : 0;
      fnd.i = (fnd.i + d + fnd.marks.length) % fnd.marks.length; show();
    };
    const repText = mk => {
      const o = opts(), r = $('wp2r').value; if (!o.rx) return r;
      try { const re = buildRe(o); return mk.textContent.replace(new RegExp(re.source, re.flags.replace('g', '')), r); } catch (e) { return r; }
    };
    const rep1 = () => {
      if (ro()) return st('This document is view-only.');
      if (!fnd.marks.length || fnd.i < 0 || !fnd.marks[fnd.i] || !fnd.marks[fnd.i].isConnected) return step(1);
      const cur = fnd.marks[fnd.i], pp = pages.find(p => p.contains(cur));
      cur.replaceWith(document.createTextNode(repText(cur))); fnd.marks.splice(fnd.i, 1); fnd.i--; dirty(pp);
      if (fnd.marks.length) step(1); else st('Done — no more matches.');
    };
    const repAll = () => {
      if (ro()) return st('This document is view-only.');
      const n = search(); if (!n) return st('No matches.');
      fnd.marks.forEach(mk => { const pp = pages.find(p => p.contains(mk)); mk.replaceWith(document.createTextNode(repText(mk))); dirty(pp); });
      pages.forEach(p => p.normalize()); fnd.marks = []; fnd.i = -1; st(`Replaced ${n} occurrence${n === 1 ? '' : 's'}.`);
    };
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'next') step(1); else if (a === 'prev') step(-1); else if (a === 'rep') rep1(); else if (a === 'all') repAll();
      else if (a === 'hl') { const n = search(); st(n + ' match' + (n === 1 ? '' : 'es') + ' highlighted.'); }
    };
    m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.type === 'text') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } });
    $('wp2f').focus(); $('wp2f').select();
  }

  /* ───────────────────────── track changes ───────────────────────── */
  const author = () => { try { return sessionStorage.getItem('pd_active_user') || 'Author'; } catch (e) { return 'Author'; } };
  const stamp = el => { el.dataset.a = author(); el.dataset.t = new Date().toISOString(); el.title = (el.tagName === 'INS' ? 'Inserted' : 'Deleted') + ' by ' + el.dataset.a + ' · ' + new Date().toLocaleString(); };
  const sameBlock = r => blockOf(r.startContainer) === blockOf(r.endContainer);
  function markDel(r, dir) {
    const s = getSelection();
    if (inTag(r.commonAncestorContainer, 'del.wp-del')) { const c = r.cloneRange(); c.collapse(dir !== 'forward'); s.removeAllRanges(); s.addRange(c); return; }
    const d = document.createElement('del'); d.className = 'wp-del'; stamp(d);
    try { r.surroundContents(d); } catch (err) { d.appendChild(r.extractContents()); r.insertNode(d); }
    const nr = document.createRange(); nr.selectNode(d); nr.collapse(dir !== 'forward'); s.removeAllRanges(); s.addRange(nr);
  }
  $('contentArea').addEventListener('beforeinput', e => {
    if (!track || ro() || e.isComposing) return;
    const s = getSelection(); if (!s.rangeCount || !pages.some(p => p.contains(s.anchorNode))) return;
    const t = e.inputType; let r = s.getRangeAt(0);
    if (t === 'insertText' && e.data) {
      if (r.collapsed && inTag(r.startContainer, 'ins.wp-ins')) return;
      if (!r.collapsed && !sameBlock(r)) return;
      e.preventDefault();
      if (!r.collapsed) { markDel(r, 'forward'); r = s.getRangeAt(0); }
      const d = inTag(r.startContainer, 'del.wp-del'); if (d) { r = document.createRange(); r.setStartAfter(d); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
      document.execCommand('insertHTML', false, `<ins class="wp-ins" id="wp2-new">${e.data === ' ' ? '&nbsp;' : esc(e.data)}</ins>`);
      const ins = $('wp2-new');
      if (ins) { ins.removeAttribute('id'); stamp(ins); const nr = document.createRange(); nr.selectNodeContents(ins); nr.collapse(false); s.removeAllRanges(); s.addRange(nr); }
      return;
    }
    if (/^delete/.test(t)) {
      const dir = /Forward/.test(t) ? 'forward' : 'backward', unit = /Word/.test(t) ? 'word' : /Line/.test(t) ? 'line' : 'character';
      let rr = r;
      if (r.collapsed) {
        if (inTag(r.startContainer, 'ins.wp-ins') || typeof s.modify !== 'function') return;
        s.modify('extend', dir, unit); rr = s.getRangeAt(0); if (rr.collapsed) return;
      } else if (inTag(rr.commonAncestorContainer, 'ins.wp-ins')) return;
      if (!sameBlock(rr)) return;
      e.preventDefault(); markDel(rr, dir);
    }
  });
  function trackUI() { trk.textContent = track ? '● Tracking changes' : ''; }
  function chg(a) {
    if (ro()) return say('This document is view-only.');
    const all = () => pages.flatMap(p => [...p.querySelectorAll('ins.wp-ins,del.wp-del')]);
    const unwrap = x => { const p = x.parentNode; x.replaceWith(...x.childNodes); p && p.normalize(); };
    const apply = (x, acc) => { const pp = pages.find(p => p.contains(x)), isIns = x.tagName === 'INS'; (acc ? isIns : !isIns) ? unwrap(x) : x.remove(); dirty(pp); };
    if (a === 'acceptAll' || a === 'rejectAll') { const l = all(); if (!l.length) return say('No tracked changes.'); l.forEach(x => x.isConnected && apply(x, a === 'acceptAll')); return say(`${l.length} change${l.length === 1 ? '' : 's'} ${a === 'acceptAll' ? 'accepted' : 'rejected'}.`); }
    const list = all(); if (!list.length) return say('No tracked changes.');
    const s = getSelection(), cur = s.rangeCount ? inTag(s.anchorNode, 'ins.wp-ins,del.wp-del') : null;
    if (a === 'accept' || a === 'reject') { if (cur) { apply(cur, a === 'accept'); return say('Change ' + a + 'ed.'); } }
    let target = list.find(x => s.rangeCount && s.getRangeAt(0).comparePoint(x, 0) > 0 && x !== cur) || list[0];
    if (a === 'accept' || a === 'reject') { say('Click a change first, or use Next.'); }
    const pi = pages.findIndex(p => p.contains(target)); if (pi !== currentPage) switchPage(pi);
    const nr = document.createRange(); nr.selectNodeContents(target); s.removeAllRanges(); s.addRange(nr); target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    say(`${target.tagName === 'INS' ? 'Insertion' : 'Deletion'} by ${target.dataset.a || 'author'} — ${list.length} change${list.length === 1 ? '' : 's'} in total.`);
  }

  /* ───────────────────────── command palette ───────────────────────── */
  const W = (k, ...a) => (window.WP && WP[k]) ? WP[k](...a) : say('This command needs word-pro-addon.js.');
  const CMDS = () => [
    ['Find and replace', () => findDlg(), 'Ctrl+H'], ['Go to page or heading', () => WP2.goto(), 'Ctrl+G'], ['Outline', () => WP2.outline()],
    ['Insert page after this one', () => WP2.pageHere(), 'Ctrl+Enter'], ['Duplicate page', () => WP2.dupPage()], ['Move page up', () => WP2.movePage(-1)], ['Move page down', () => WP2.movePage(1)],
    ['Insert cover page', () => WP2.cover()], ['Insert symbols', () => WP2.symbols()], ['Insert checklist', () => WP2.checklist()], ['Insert table', () => W('newTable')],
    ['Insert table of contents', () => W('toc')], ['Update table of contents', () => WP2.tocUpdate()], ['Insert footnote', () => W('footnote')], ['Insert header / footer', () => W('hf')],
    ['Insert citation', () => WP2.cite()], ['Insert bibliography', () => WP2.biblio()], ['Insert comment', () => W('comment'), 'Ctrl+Alt+M'], ['Comment list', () => WP2.comments()],
    ['Toggle track changes', () => WP2.trackToggle(), 'Ctrl+Shift+E'], ['Next tracked change', () => chg('next')], ['Accept all changes', () => chg('acceptAll')], ['Reject all changes', () => chg('rejectAll')],
    ['Readability statistics', () => WP2.readability()], ['Check document', () => WP2.check()], ['Word count', () => W('count')], ['Document info', () => WP2.info()],
    ['Draw signature', () => WP2.sign()], ['Dictate', () => WP2.dictate()], ['Read aloud', () => W('speak')], ['Next [placeholder]', () => WP2.nextPh(), 'Alt+]'],
    ['Toggle autocorrect', () => WP2.toggleAuto()], ['Toggle smart quotes', () => WP2.toggleQuotes()], ['Fit page to window width', () => WP2.fit()],
    ['Sort selection A→Z', () => WP2.sortLines('asc')], ['Sort selection Z→A', () => WP2.sortLines('desc')], ['Highlight all matches', () => WP2.hitAll()], ['Clear highlights', () => WP2.hitClear()],
    ['Export as Word (.docx)', () => WP2.exp('docx')], ['Export as HTML', () => WP2.exp('html')], ['Export as Markdown', () => WP2.exp('md')], ['Export as text', () => WP2.exp('txt')], ['Export JSON backup', () => WP2.exp('json')],
    ['Export as PDF', () => typeof exportPDF === 'function' && exportPDF()], ['Import file', () => WP2.imp()], ['Print', () => window.print(), 'Ctrl+P'], ['Save now', () => WP2.saveNow(), 'Ctrl+S'], ['Save version', () => WP2.saveVer()],
    ['Focus mode', () => W('focus')], ['Show / hide ruler', () => W('ruler')], ['Print layout (all pages)', () => W('multi')], ['Show formatting marks', () => W('marks')]
  ];
  function palette() {
    const list = CMDS(); let sel = 0, shown = list;
    const m = modal('Command palette', '<input type="search" id="wp2pq" placeholder="Type a command…" autocomplete="off"><div id="wp2pl"></div>', { w: 480 });
    const draw = () => {
      $('wp2pl').innerHTML = shown.slice(0, 12).map((c, i) => `<div class="wp2-pi${i === sel ? ' on' : ''}" data-i="${i}"><span>${esc(c[0])}</span><small>${c[2] || ''}</small></div>`).join('') || '<div style="color:var(--muted);padding:6px">No matching command.</div>';
    };
    const run = i => { const c = shown[i]; if (!c) return; closeModal(); setTimeout(() => c[1](), 20); };
    $('wp2pq').oninput = e => { const q = e.target.value.toLowerCase().split(/\s+/).filter(Boolean); shown = list.filter(c => q.every(w => c[0].toLowerCase().includes(w))); sel = 0; draw(); };
    $('wp2pq').onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, Math.min(shown.length, 12) - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    };
    m.onclick = e => { const r = e.target.closest('[data-i]'); if (r) run(+r.dataset.i); };
    draw(); $('wp2pq').focus();
  }

  /* ───────────────────────── page tools ───────────────────────── */
  function reorder(from, to) {
    const p = pages.splice(from, 1)[0]; pages.splice(to, 0, p);
    const area = $('contentArea'); pages.forEach(pp => area.appendChild(pp));
    updateNums(); if (typeof updateThumbnails === 'function') updateThumbnails(); switchPage(to);
  }

  /* ───────────────────────── templates ───────────────────────── */
  const TD = 'border:1px solid #999;padding:6px;';
  const TH = TD + 'background:#f0f4ff;text-align:left';
  const TPL = {
    invoice: `<h1 style="color:#2b579a">INVOICE</h1><p>Invoice no: <b>[0001]</b> &nbsp; Date: [date]<br>Bill to: [Client name, address]</p><table style="border-collapse:collapse;width:100%"><tr><th style="${TH}">Item</th><th style="${TH}">Qty</th><th style="${TH}">Rate</th><th style="${TH}">Amount</th></tr><tr><td style="${TD}">&nbsp;</td><td style="${TD}">&nbsp;</td><td style="${TD}">&nbsp;</td><td style="${TD}">&nbsp;</td></tr></table><p style="text-align:right"><b>Total: ₹ [amount]</b></p><p>Payment terms: [e.g. due in 15 days]</p>`,
    minutes: '<h1>Meeting Minutes</h1><p><b>Date:</b> [date] &nbsp; <b>Venue:</b> [place]</p><h2>Attendees</h2><ul><li>[Name]</li></ul><h2>Agenda</h2><ol><li>[Item]</li></ol><h2>Decisions</h2><ul><li>[Decision]</li></ul><h2>Action items</h2><ul style="list-style:none"><li><input type="checkbox"> [Task] — [Owner] — [Due]</li></ul>',
    cover: '<p>[Your name]<br>[Address] · [Phone] · [Email]</p><p>[Date]</p><p>[Hiring manager]<br>[Company]</p><p>Dear [Name],</p><p>I am writing to apply for the [position] role at [company]. [One sentence on your strongest relevant achievement.]</p><p>[Two or three sentences on skills and why this company.]</p><p>Thank you for your time. I would welcome the chance to discuss my application.</p><p>Sincerely,<br>[Your name]</p>',
    plan: `<h1>Project Plan</h1><p><b>Owner:</b> [name] &nbsp; <b>Start:</b> [date] &nbsp; <b>End:</b> [date]</p><h2>Goals</h2><ul><li>[Goal]</li></ul><h2>Milestones</h2><table style="border-collapse:collapse;width:100%"><tr><th style="${TH}">Milestone</th><th style="${TH}">Owner</th><th style="${TH}">Due</th><th style="${TH}">Status</th></tr><tr><td style="${TD}">&nbsp;</td><td style="${TD}">&nbsp;</td><td style="${TD}">&nbsp;</td><td style="${TD}">&nbsp;</td></tr></table><h2>Risks</h2><ul><li>[Risk and mitigation]</li></ul>`,
    memo: '<h1 style="letter-spacing:4px">MEMO</h1><p><b>To:</b> [Recipient]<br><b>From:</b> [Your name]<br><b>Date:</b> [date]<br><b>Subject:</b> [Subject]</p><hr><p>[Purpose of the memo in one or two sentences.]</p><h2>Details</h2><p>[Key information, dates and figures.]</p><h2>Action required</h2><ul><li>[Who does what by when]</li></ul>',
    resume: '<h1 style="margin-bottom:0">[Your Full Name]</h1><p style="color:#555">[City] · [Phone] · [Email] · [LinkedIn]</p><h2>Summary</h2><p>[Two or three sentences on your strengths and goals.]</p><h2>Experience</h2><p><b>[Job title]</b> — [Company] <span style="float:right">[Start – End]</span></p><ul><li>[Achievement with a number]</li><li>[Responsibility or result]</li></ul><h2>Education</h2><p><b>[Degree]</b> — [Institution] <span style="float:right">[Year]</span></p><h2>Skills</h2><p>[Skill 1] · [Skill 2] · [Skill 3] · [Skill 4]</p>',
    agenda: '<h1>Meeting Agenda</h1><p><b>Date:</b> [date] &nbsp; <b>Time:</b> [time] &nbsp; <b>Location:</b> [place / link]</p><h2>Objectives</h2><ul><li>[Objective]</li></ul><h2>Agenda</h2><ol><li>[Topic] — [Presenter] — [10 min]</li><li>[Topic] — [Presenter] — [15 min]</li><li>Open discussion — [10 min]</li></ol><h2>Preparation</h2><ul style="list-style:none"><li><input type="checkbox"> [Read / bring]</li></ul>',
    weekly: `<h1>Weekly Planner</h1><p><b>Week of:</b> [date]</p><table style="border-collapse:collapse;width:100%"><tr><th style="${TH}">Day</th><th style="${TH}">Priorities</th><th style="${TH}">Notes</th></tr>${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => `<tr><td style="${TD}"><b>${d}</b></td><td style="${TD}">&nbsp;</td><td style="${TD}">&nbsp;</td></tr>`).join('')}</table>`,
    certificate: '<div style="border:6px double #c9a14a;padding:50px 30px;text-align:center"><p style="letter-spacing:6px;color:#777">CERTIFICATE</p><h1 style="font-size:34pt;font-weight:300;color:#1f3864">of Achievement</h1><p>This certificate is proudly presented to</p><h2 style="font-size:26pt;color:#2b579a">[Recipient name]</h2><p>for [reason / achievement]</p><p style="margin-top:50px">[Date] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [Signature, title]</p></div>',
    press: '<p style="color:#777">FOR IMMEDIATE RELEASE</p><h1>[Headline that states the news]</h1><h2 style="font-weight:400;color:#555">[Supporting sub-headline]</h2><p><b>[City, Date]</b> — [Opening paragraph: who, what, when, where, why.]</p><p>[Second paragraph: detail and a quote from a spokesperson.]</p><p>[Third paragraph: background and availability.]</p><h3>About [Organisation]</h3><p>[Boilerplate paragraph.]</p><p><b>Media contact:</b> [Name] · [Email] · [Phone]</p>',
    report: '<h1>[Report Title]</h1><p><b>Prepared by:</b> [Name] &nbsp; <b>Date:</b> [date]</p><h2>1. Executive summary</h2><p>[Summarise the purpose, findings and recommendation.]</p><h2>2. Introduction</h2><p>[Background and scope.]</p><h2>3. Findings</h2><ul><li>[Finding]</li></ul><h2>4. Analysis</h2><p>[What the findings mean.]</p><h2>5. Recommendations</h2><ol><li>[Recommendation]</li></ol><h2>6. Conclusion</h2><p>[Closing summary.]</p>'
  };

  /* ───────────────────────── markdown / csv / text conversion ───────────────────────── */
  const toMd = n => {
    if (n.nodeType === 3) return n.data.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const t = n.tagName, c = () => [...n.childNodes].map(toMd).join('');
    if (n.classList.contains('wp-wm')) return '';
    if (n.classList.contains('lai-math')) return '$' + (n.dataset.tex || '') + '$';
    if (t === 'TABLE') return '\n' + [...n.rows].map((r, i) => '| ' + [...r.cells].map(x => x.textContent.trim().replace(/\|/g, '\\|')).join(' | ') + ' |' + (i === 0 ? '\n|' + [...r.cells].map(() => ' --- |').join('') : '')).join('\n') + '\n\n';
    if (t === 'UL' || t === 'OL') { let i = 0; return '\n' + [...n.children].map(li => { i++; return (t === 'OL' ? i + '. ' : '- ') + toMd(li).trim().replace(/\n/g, '\n  '); }).join('\n') + '\n\n'; }
    if (t === 'INPUT') return n.checked ? '[x] ' : '[ ] ';
    if (t === 'IMG') { const s = n.getAttribute('src') || ''; return /^data:/.test(s) ? '*[image]*' : `![${n.alt || ''}](${s})`; }
    return ({ H1: () => '\n# ' + c() + '\n\n', H2: () => '\n## ' + c() + '\n\n', H3: () => '\n### ' + c() + '\n\n', H4: () => '\n#### ' + c() + '\n\n', P: () => c() + '\n\n', DIV: () => c() + '\n', BR: () => '  \n', B: () => '**' + c() + '**', STRONG: () => '**' + c() + '**', I: () => '*' + c() + '*', EM: () => '*' + c() + '*', S: () => '~~' + c() + '~~', DEL: () => '~~' + c() + '~~', CODE: () => '`' + c() + '`', PRE: () => '\n```\n' + n.textContent + '\n```\n\n', LI: () => c(), A: () => `[${c()}](${n.getAttribute('href') || ''})`, BLOCKQUOTE: () => '> ' + c().trim() + '\n\n', HR: () => '\n---\n' }[t] || c)();
  };
  const mdInline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  const tableHtml = (rows, header, f) => {
    f = f || esc; const cols = Math.max(...rows.map(r => r.length));
    return '<table style="border-collapse:collapse;width:100%"><tbody>' + rows.map((r, i) => '<tr>' + Array.from({ length: cols }, (_, j) => {
      const v = f(r[j] == null ? '' : r[j]);
      return header && i === 0 ? `<th style="border:1px solid #999;padding:6px 10px;background:#f0f4ff;text-align:left">${v}</th>` : `<td style="border:1px solid #999;padding:6px 10px">${v || '&nbsp;'}</td>`;
    }).join('') + '</tr>').join('') + '</tbody></table><p><br></p>';
  };
  function mdToHtml(text) {
    const L = text.replace(/\r/g, '').split('\n'), out = []; let i = 0, list = null, para = [];
    const flushP = () => { if (para.length) { out.push('<p>' + para.map(mdInline).join(' ') + '</p>'); para = []; } };
    const endList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
    const isSep = l => /^\s*\|[\s:|-]+\|\s*$/.test(l), isRow = l => /^\s*\|.*\|\s*$/.test(l);
    while (i < L.length) {
      const l = L[i]; let m;
      if (/^\s*```/.test(l)) { flushP(); endList(); const buf = []; i++; while (i < L.length && !/^\s*```/.test(L[i])) buf.push(L[i++]); i++; out.push('<pre>' + esc(buf.join('\n')) + '</pre>'); continue; }
      if (isRow(l) && i + 1 < L.length && isSep(L[i + 1])) { flushP(); endList(); const rows = []; while (i < L.length && isRow(L[i])) { if (!isSep(L[i])) rows.push(L[i].trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim())); i++; } out.push(tableHtml(rows, true, mdInline)); continue; }
      if (!l.trim()) { flushP(); endList(); i++; continue; }
      if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { flushP(); endList(); const n = Math.min(m[1].length, 4); out.push(`<h${n}>${mdInline(m[2])}</h${n}>`); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flushP(); endList(); out.push('<hr style="border:1px solid #ccc;margin:12px 0;">'); i++; continue; }
      if ((m = l.match(/^\s*>\s?(.*)$/))) { flushP(); endList(); out.push('<blockquote>' + mdInline(m[1]) + '</blockquote>'); i++; continue; }
      if ((m = l.match(/^\s*[-*+]\s+(?:\[( |x|X)\]\s+)?(.*)$/))) { flushP(); if (list !== 'ul') { endList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + (m[1] != null ? `<input type="checkbox"${m[1] !== ' ' ? ' checked' : ''}> ` : '') + mdInline(m[2]) + '</li>'); i++; continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (list !== 'ol') { endList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + mdInline(m[1]) + '</li>'); i++; continue; }
      endList(); para.push(l.trim()); i++;
    }
    flushP(); endList(); return out.join('');
  }
  const parseCSV = (t, d) => {
    const rows = []; let row = [], c = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true; else if (ch === d) { row.push(c); c = ''; }
      else if (ch === '\n') { row.push(c.replace(/\r$/, '')); rows.push(row); row = []; c = ''; } else c += ch;
    }
    if (c || row.length) { row.push(c.replace(/\r$/, '')); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  };

  /* ───────────────────────── .docx writer (WordprocessingML via JSZip) ───────────────────────── */
  async function toDocx(cp, name) {
    await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => window.JSZip);
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const st = { pb: 0, id: 1 }, media = [], imap = new Map();
    const xe = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const hex = c => {
      if (!c) return ''; let m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) return [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('').toUpperCase();
      if ((m = c.match(/^#([0-9a-f]{6})$/i))) return m[1].toUpperCase();
      if ((m = c.match(/^#([0-9a-f]{3})$/i))) return m[1].split('').map(ch => ch + ch).join('').toUpperCase();
      return '';
    };
    const lum = h => h ? parseInt(h.slice(0, 2), 16) * .299 + parseInt(h.slice(2, 4), 16) * .587 + parseInt(h.slice(4, 6), 16) * .114 : 255;
    const parseLen = v => { const m = String(v || '').match(/^(-?[\d.]+)\s*(in|pt|px|cm|mm)?$/); if (!m) return null; return Math.round(parseFloat(m[1]) * ({ in: 1440, pt: 20, px: 15, cm: 567, mm: 56.7 }[m[2] || 'px'])); };
    const px = v => /px$/.test(v || '') ? parseFloat(v) : NaN;

    /* images: pre-pass so XML generation can stay synchronous */
    const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const toBytes = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    for (const im of cp.flatMap(p => [...p.querySelectorAll('img')])) {
      try {
        const src = im.getAttribute('src') || '', el = await loadImg(src); if (!el) continue;
        const nw = el.naturalWidth || 300, nh = el.naturalHeight || 300, ratio = nw / nh;
        let w = px(im.style.width) || parseFloat(im.getAttribute('width')) || nw; if (w > 600) w = 600;
        const hh = px(im.style.height); let h = !isNaN(hh) && hh > 0 && !isNaN(px(im.style.width)) ? hh : w / ratio;
        if (!isNaN(hh) && hh > 0 && im.style.width && !/px$/.test(im.style.width)) h = w / ratio;
        let ext, bytes; const m = src.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/i);
        if (m) { ext = m[1].toLowerCase().replace('jpeg', 'jpg'); bytes = toBytes(m[2]); }
        else { const c = document.createElement('canvas'); c.width = Math.min(2400, Math.round(w * 2)); c.height = Math.min(2400, Math.round(h * 2)); c.getContext('2d').drawImage(el, 0, 0, c.width, c.height); ext = 'png'; bytes = toBytes(c.toDataURL('image/png').split(',')[1]); }
        media.push({ n: media.length + 1, ext, bytes }); imap.set(im, { n: media.length, cx: Math.round(w * 9525), cy: Math.round(h * 9525) });
      } catch (e) { /* skip images that cannot be read (e.g. cross-origin) */ }
    }

    const rPr = s => {
      let o = '';
      if (s.font) o += `<w:rFonts w:ascii="${xe(s.font)}" w:hAnsi="${xe(s.font)}" w:cs="${xe(s.font)}"/>`;
      if (s.b) o += '<w:b/>'; if (s.i) o += '<w:i/>'; if (s.sc) o += '<w:smallCaps/>'; if (s.s) o += '<w:strike/>';
      if (s.color) o += `<w:color w:val="${s.color}"/>`;
      if (s.sz) o += `<w:sz w:val="${s.sz}"/><w:szCs w:val="${s.sz}"/>`;
      if (s.u) o += '<w:u w:val="single"/>';
      if (s.hl) o += `<w:shd w:val="clear" w:color="auto" w:fill="${s.hl}"/>`;
      if (s.sup) o += '<w:vertAlign w:val="superscript"/>'; if (s.sub) o += '<w:vertAlign w:val="subscript"/>';
      return o ? `<w:rPr>${o}</w:rPr>` : '';
    };
    const stOf = (el, s0) => {
      const s = { ...s0 }, t = el.tagName, c = el.style || {};
      if (/^(B|STRONG)$/.test(t)) s.b = 1; if (/^(I|EM|CITE)$/.test(t)) s.i = 1; if (/^(U|INS|A)$/.test(t)) s.u = 1; if (/^(S|STRIKE|DEL)$/.test(t)) s.s = 1;
      if (t === 'SUP') s.sup = 1; if (t === 'SUB') s.sub = 1; if (/^(CODE|KBD|PRE)$/.test(t)) s.font = 'Consolas'; if (t === 'PRE') s.pre = 1;
      if (t === 'A') s.color = '0563C1'; if (t === 'INS') s.color = '1A7F37'; if (t === 'DEL') s.color = 'C0392B';
      if (t === 'TH' && !c.fontWeight) s.b = 1;
      if (c.fontWeight) s.b = (c.fontWeight === 'bold' || +c.fontWeight >= 600) ? 1 : 0;
      if (c.fontStyle) s.i = c.fontStyle === 'italic' ? 1 : 0;
      const td = c.textDecorationLine || c.textDecoration || ''; if (/underline/.test(td)) s.u = 1; if (/line-through/.test(td)) s.s = 1;
      if (/small-caps/.test(c.fontVariant || '')) s.sc = 1;
      const col = hex(c.color); if (col) s.color = col;
      const fs = (c.fontSize || '').match(/^([\d.]+)(pt|px)$/); if (fs) s.sz = Math.round((fs[2] === 'pt' ? +fs[1] : fs[1] * .75) * 2);
      if (c.fontFamily) s.font = c.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (t !== 'TD' && t !== 'TH') { const bg = hex(c.backgroundColor); if (bg && /^(SPAN|MARK|FONT|B|I|U|A|CODE)$/.test(t)) s.hl = bg; }
      return s;
    };
    const run = (txt, s) => {
      if (s.pre) return txt.split('\n').map(l => `<w:r>${rPr(s)}<w:t xml:space="preserve">${xe(l)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');
      return `<w:r>${rPr(s)}<w:t xml:space="preserve">${xe(txt)}</w:t></w:r>`;
    };
    const drawing = im => {
      const d = imap.get(im); if (!d) return im.alt ? run('[' + im.alt + ']', {}) : '';
      const id = st.id++, nm = 'Picture ' + id;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${d.cx}" cy="${d.cy}"/><wp:docPr id="${id}" name="${nm}" descr="${xe(im.alt || '')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${nm}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${d.n + 10}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${d.cx}" cy="${d.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    };
    const inl = (node, s) => {
      if (node.nodeType === 3) { const t = s.pre ? node.data : node.data.replace(/[ \t\r\n]+/g, ' '); return t ? run(t, s) : ''; }
      if (node.nodeType !== 1) return '';
      const t = node.tagName;
      if (/^(SCRIPT|STYLE)$/.test(t) || node.classList.contains('wp-wm')) return '';
      if (t === 'BR') return '<w:r><w:br/></w:r>';
      if (t === 'IMG') return drawing(node);
      if (t === 'INPUT') return run(node.checked || node.hasAttribute('checked') ? '☑ ' : '☐ ', s);
      if (node.classList.contains('lai-math') || node.classList.contains('wp-math')) return run(node.dataset.tex || node.textContent, { ...s, i: 1 });
      const n = stOf(node, s);
      return [...node.childNodes].map(c => inl(c, n)).join('');
    };
    const kids = (el, s) => (el.childNodes.length === 1 && el.firstChild.nodeType === 1 && el.firstChild.tagName === 'BR') ? '' : [...el.childNodes].map(c => inl(c, s)).join('');
    const para = (el, content, o = {}) => {
      const c = (el && el.style) || {}; let p = '';
      if (o.style) p += `<w:pStyle w:val="${o.style}"/>`;
      if (st.pb) { p += '<w:pageBreakBefore/>'; st.pb = 0; }
      if (o.bdr) p += o.bdr;
      const bg = hex(c.backgroundColor) || o.shd; if (bg) p += `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>`;
      const mt = parseLen(c.marginTop), mb = parseLen(c.marginBottom), lh = c.lineHeight || st.lh, lhn = /^[\d.]+$/.test(lh || '') ? parseFloat(lh) : 0;
      if (mt != null || mb != null || lhn) p += `<w:spacing${mt != null ? ` w:before="${Math.max(0, mt)}"` : ''}${mb != null ? ` w:after="${Math.max(0, mb)}"` : ''}${lhn ? ` w:line="${Math.round(lhn * 240)}" w:lineRule="auto"` : ''}/>`;
      const left = (o.left || 0) + (parseLen(c.marginLeft) || 0) + (parseLen(c.paddingLeft) || 0), first = parseLen(c.textIndent);
      if (left > 0 || o.hang || first) p += `<w:ind w:left="${Math.max(0, left)}"${o.hang ? ` w:hanging="${o.hang}"` : first ? ` w:firstLine="${first}"` : ''}/>`;
      const j = { left: 'left', center: 'center', right: 'right', justify: 'both' }[c.textAlign || o.jc]; if (j) p += `<w:jc w:val="${j}"/>`;
      return `<w:p>${p ? `<w:pPr>${p}</w:pPr>` : ''}${content}</w:p>`;
    };
    const BLOCK = /^(P|H[1-6]|DIV|BLOCKQUOTE|PRE|UL|OL|TABLE|HR|LI|SECTION|ARTICLE|HEADER|FOOTER|FIGURE)$/;
    const letter = n => String.fromCharCode(97 + ((n - 1) % 26));
    const marker = (i, ls) => ({ 'lower-alpha': letter(i) + '.', 'upper-alpha': letter(i).toUpperCase() + '.', 'lower-roman': roman(i).toLowerCase() + '.', 'upper-roman': roman(i) + '.' }[ls] || i + '.');
    function blocks(parent, ctx) {
      let out = '', buf = [];
      const flush = () => {
        if (!buf.length) return;
        const content = buf.map(n => inl(n, ctx.s || {})).join(''); buf = [];
        if (content.replace(/<[^>]*>/g, '').trim() || /<w:drawing|<w:br/.test(content)) out += para(null, content, { jc: ctx.jc, left: ctx.left });
      };
      for (const n of parent.childNodes) {
        if (n.nodeType === 1 && n.classList.contains('wp-wm')) continue;
        if (n.nodeType === 1 && BLOCK.test(n.tagName)) { flush(); out += block(n, ctx); } else buf.push(n);
      }
      flush(); return out;
    }
    function list(el, ctx, lvl) {
      let out = '', i = 0; const ls = (el.style.listStyleType || '').toLowerCase(), ord = el.tagName === 'OL';
      for (const li of el.children) {
        if (li.tagName !== 'LI') continue; i++;
        const parts = [], nested = [];
        li.childNodes.forEach(c => (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName) ? nested : parts).push(c));
        const s = stOf(li, ctx.s || {});
        const mk = ls === 'none' ? '' : (ord || /decimal|alpha|roman/.test(ls)) ? marker(i, ls) : ({ circle: '◦', square: '▪' }[ls] || '•');
        out += para(li, (mk ? run(mk + '\u00a0', s) : '') + parts.map(c => inl(c, s)).join(''), { left: 720 * (lvl + 1) + (ctx.left || 0), hang: 360, jc: ctx.jc });
        nested.forEach(nl => { out += list(nl, ctx, lvl + 1); });
      }
      return out;
    }
    function table(t, ctx) {
      let pre = ''; if (st.pb) { pre = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; st.pb = 0; }
      const rows = [...t.rows]; if (!rows.length) return pre;
      const cols = Math.max(1, ...rows.map(r => [...r.cells].reduce((a, c) => a + (c.colSpan || 1), 0))), cw = Math.floor(9360 / cols);
      const first = rows[0].cells[0], none = first && first.style.borderTopStyle === 'none';
      const B = (n, v) => `<w:${n} w:val="${v}" w:sz="4" w:space="0" w:color="999999"/>`;
      const borders = none ? ['top', 'left', 'bottom', 'right', 'insideV'].map(n => B(n, 'nil')).join('') + B('insideH', 'single') : ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(n => B(n, 'single')).join('');
      const body = rows.map(r => '<w:tr>' + [...r.cells].map(c => {
        const span = c.colSpan || 1, fill = hex(c.style.backgroundColor), va = { middle: 'center', bottom: 'bottom', top: 'top' }[c.style.verticalAlign];
        const inner = blocks(c, { s: stOf(c, ctx.s || {}), jc: c.style.textAlign }) || '<w:p/>';
        return `<w:tc><w:tcPr><w:tcW w:w="${cw * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}${va ? `<w:vAlign w:val="${va}"/>` : ''}</w:tcPr>${inner}</w:tc>`;
      }).join('') + '</w:tr>').join('');
      return pre + `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${cw}"/>`.repeat(cols)}</w:tblGrid>${body}</w:tbl><w:p/>`;
    }
    function block(el, ctx) {
      const t = el.tagName, s = stOf(el, ctx.s || {}), c2 = { ...ctx, s };
      if (t === 'TABLE') return table(el, ctx);
      if (t === 'HR') return para(null, '', { bdr: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>' });
      if (t === 'UL' || t === 'OL') return list(el, ctx, 0);
      if (/^H[1-6]$/.test(t)) return para(el, kids(el, s), { style: 'Heading' + Math.min(+t[1], 4), jc: ctx.jc });
      if (t === 'PRE') return para(el, kids(el, s), { shd: 'F4F6FA', left: ctx.left });
      const hasBlock = [...el.children].some(c => BLOCK.test(c.tagName));
      if (t === 'BLOCKQUOTE') {
        const bq = { ...c2, s: { ...s, i: 1 }, left: (ctx.left || 0) + 720 };
        return hasBlock ? blocks(el, bq) : para(el, kids(el, bq.s), { left: bq.left, bdr: '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="2B579A"/></w:pBdr>' });
      }
      if (t === 'DIV' || t === 'SECTION' || t === 'ARTICLE' || t === 'HEADER' || t === 'FOOTER' || t === 'FIGURE') {
        if (hasBlock) return blocks(el, { ...c2, jc: el.style.textAlign || ctx.jc });
        let bdr = '';
        if (el.classList.contains('wp-box')) bdr = '<w:pBdr>' + ['top', 'left', 'bottom', 'right'].map(n => `<w:${n} w:val="single" w:sz="8" w:space="6" w:color="2B579A"/>`).join('') + '</w:pBdr>';
        else if (el.style.borderLeftWidth) bdr = `<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${hex(el.style.borderLeftColor) || '2B579A'}"/></w:pBdr>`;
        return para(el, kids(el, s), { bdr, jc: ctx.jc, left: ctx.left });
      }
      return para(el, kids(el, s), { jc: ctx.jc, left: ctx.left });   // P, LI and the rest
    }

    st.lh = cp[0] && cp[0].style.lineHeight;
    let body = '';
    cp.forEach((p, i) => {
      st.pb = i > 0 ? 1 : 0; st.lh = p.style.lineHeight || st.lh;
      const base = stOf(p, {}); if (lum(hex(p.style.backgroundColor)) < 110) delete base.color;
      body += blocks(p, { s: base, jc: '' });
      if (st.pb) { body += '<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>'; st.pb = 0; }
    });
    const p0 = cp[0], pw = (p0 && parseLen(p0.style.width)) || 12240, ph = (p0 && parseLen(p0.style.minHeight)) || 15840;
    const mg = k => (p0 && parseLen(p0.style['padding' + k])) || 1440;
    const sect = `<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"${pw > ph ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${mg('Top')}" w:right="${mg('Right')}" w:bottom="${mg('Bottom')}" w:left="${mg('Left')}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
    const H = (id, nm, sz, before) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nm}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${+id.slice(-1) - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="2B579A"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${H('Heading1', 'heading 1', 36, 360)}${H('Heading2', 'heading 2', 28, 280)}${H('Heading3', 'heading 3', 24, 200)}${H('Heading4', 'heading 4', 22, 160)}</w:styles>`;
    const types = [...new Set(media.map(m => m.ext))];
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${types.map(e => `<Default Extension="${e}" ContentType="image/${e === 'jpg' ? 'jpeg' : e}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map(m => `<Relationship Id="rId${m.n + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${m.n}.${m.ext}"/>`).join('')}</Relationships>`);
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`);
    zip.file('word/styles.xml', styles);
    media.forEach(m => zip.file(`word/media/image${m.n}.${m.ext}`, m.bytes));
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ───────────────────────── import ───────────────────────── */
  function addPageFrom(html, style) {
    const p = addPage(clean(html));
    if (style) { p.style.cssText = style; p.style.removeProperty('display'); p.style.display = 'block'; }
    p.querySelectorAll('img.draggable').forEach(i => typeof makeDraggableResizable === 'function' && makeDraggableResizable(i));
    return p;
  }
  async function importFile(f) {
    if (ro()) return say('This document is view-only.');
    const ext = f.name.split('.').pop().toLowerCase(); let html = '';
    try {
      if (ext === 'docx') {
        await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', () => window.mammoth);
        html = clean((await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() })).value);
      } else if (ext === 'json') {
        const j = JSON.parse(await f.text()); if (!Array.isArray(j.pages)) throw new Error('Not a Pro Document backup');
        if (!confirm('Add the ' + j.pages.length + ' page(s) from this backup as new pages?')) return;
        j.pages.forEach((h, i) => addPageFrom(h, j.styles && j.styles[i]));
        return say('Backup imported.');
      } else if (ext === 'csv' || ext === 'tsv') {
        const t = await f.text(); html = tableHtml(parseCSV(t, ext === 'tsv' || (t.split('\n')[0].match(/\t/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? '\t' : ','), true);
      } else {
        const t = await f.text();
        if (ext === 'html' || ext === 'htm') html = clean(t);
        else if (ext === 'md' || ext === 'markdown') html = mdToHtml(t);
        else html = t.split(/\r?\n/).map(l => l.trim() ? `<p>${esc(l)}</p>` : '').join('');
      }
      addPage(html); say('Imported ' + f.name + ' as a new page.');
    } catch (e) { console.warn(e); say('Import failed: ' + (e.message || 'unknown error')); }
  }

  /* ───────────────────────── image helpers ───────────────────────── */
  const simg = () => { const i = typeof selectedImage !== 'undefined' && selectedImage; if (!i || !i.isConnected) { say('Click an image first.'); return null; } return i; };
  const refreshHandles = () => { if (typeof positionAllHandles === 'function') positionAllHandles(); };
  const imgPage = i => i.closest('.page') || pg();

  /* ───────────────────────── cite / bibliography ───────────────────────── */
  function tocHtml(hs) {
    return '<p><b style="font-size:16pt">Contents</b></p>' + hs.map(h => `<p class="wp-toc-i" data-t="${esc(h[1])}" data-p="${h[2]}" style="margin:2px 0 2px ${(h[0] - 1) * 20}px;cursor:pointer" title="Ctrl+click to jump">${esc(h[1])} <span style="float:right">${h[2]}</span></p>`).join('');
  }
  $('contentArea').addEventListener('click', e => {
    const it = e.target.closest && e.target.closest('.wp-toc p'); if (!it || !(e.ctrlKey || e.metaKey || ro())) return;
    const txt = it.dataset.t || (it.firstChild && it.firstChild.textContent.trim()); if (!txt) return;
    const h = headings().find(x => x[1] === txt); if (!h) return;
    switchPage(h[2] - 1); h[3].scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ───────────────────────── public API ───────────────────────── */
  const WP2 = window.WP2 = {
    version: '2.0',
    /* navigate */
    outline: () => { const p = $('pagesPanel'); p.style.display = ''; buildOutline(); say('Outline updated.'); },
    hitAll() {
      const q = prompt('Highlight all matches of:'); if (!q) return;
      const n = markAll(buildRe({ q, cs: false, ww: false, rx: false }));
      say(n + ' match' + (n === 1 ? '' : 'es') + ' highlighted.');
    },
    hitClear() {
      pages.forEach(p => { const ms = p.querySelectorAll('mark.wp-hit'); ms.forEach(m => m.replaceWith(document.createTextNode(m.textContent))); if (ms.length) p.normalize(); });
      fnd.marks = []; fnd.i = -1;
    },
    findDlg, palette, chg,
    goto() {
      const hs = headings();
      const q = prompt(`Go to page (1–${pages.length}) or heading text:` + (hs.length ? '\n\nHeadings: ' + hs.slice(0, 8).map(h => h[1]).join(' · ') : ''));
      if (!q) return;
      if (/^\d+$/.test(q.trim())) { const n = +q; if (n >= 1 && n <= pages.length) return switchPage(n - 1); return say('There is no page ' + n + '.'); }
      const h = hs.find(x => x[1].toLowerCase().includes(q.trim().toLowerCase()));
      if (!h) return say('No heading matches “' + q + '”.');
      switchPage(h[2] - 1); h[3].scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    /* text */
    effect: guard(v => ({ shadow: () => wrap('text-shadow:1px 1px 3px rgba(0,0,0,.35)'), caps: () => wrap('font-variant:small-caps'), strong: () => wrap('font-weight:700;text-transform:uppercase;letter-spacing:1px'), clear: () => document.execCommand('removeFormat') }[v])()),
    spacing: guard(v => wrap('letter-spacing:' + v)),
    listStyle: guard(v => {
      let l = el0().closest('ul,ol');
      if (!l) { document.execCommand(/decimal|alpha|roman/.test(v) ? 'insertOrderedList' : 'insertUnorderedList'); l = el0().closest('ul,ol'); }
      if (l) l.style.listStyleType = v;
    }),
    checklist: guard(() => document.execCommand('insertHTML', false, '<ul style="list-style:none;padding-left:4px"><li><input type="checkbox"> Task</li></ul>')),
    pBorder: guard(v => {
      const bl = blk(); if (!bl) return say('Click in a paragraph first.');
      bl.style.border = ''; bl.style.padding = ''; bl.style.borderBottom = ''; bl.style.borderLeft = '';
      if (v === 'box') { bl.style.border = '1px solid #2b579a'; bl.style.padding = '6px 10px'; }
      else if (v === 'bottom') { bl.style.borderBottom = '1px solid #2b579a'; bl.style.paddingBottom = '4px'; }
      else if (v === 'left') { bl.style.borderLeft = '4px solid #2b579a'; bl.style.paddingLeft = '10px'; }
    }),
    pShade: guard(v => { const bl = blk(); if (bl) bl.style.background = v; }),
    dir: guard(v => { const bl = blk(); if (bl) { bl.setAttribute('dir', v); bl.style.textAlign = v === 'rtl' ? 'right' : 'left'; } }),
    callout: guard(v => {
      const C = { info: ['ℹ️', 'Info', '#e8f1fd', '#2b579a'], tip: ['💡', 'Tip', '#fff9e0', '#d4a900'], warn: ['⚠️', 'Warning', '#fff1e6', '#e67e22'], ok: ['✅', 'Success', '#e8f7ee', '#2e9b5f'], note: ['📝', 'Note', '#f3f3f3', '#777'] }[v];
      const txt = getSelection().toString().trim() || 'Type here…';
      document.execCommand('insertHTML', false, `<div style="border-left:5px solid ${C[3]};background:${C[2]};padding:10px 14px;margin:10px 0;border-radius:3px"><b>${C[0]} ${C[1]}</b><br>${esc(txt)}</div><p><br></p>`);
    }),
    divider: guard(v => document.execCommand('insertHTML', false, ({
      line: '<hr style="border:none;border-top:1px solid #999;margin:14px 0">', thick: '<hr style="border:none;border-top:4px solid #2b579a;margin:14px 0">',
      dotted: '<hr style="border:none;border-top:2px dotted #999;margin:14px 0">', double: '<hr style="border:none;border-top:3px double #777;margin:14px 0">',
      fancy: '<p style="text-align:center;color:#999;letter-spacing:8px">✦ ✦ ✦</p>'
    }[v]) + '<p><br></p>')),
    sortLines: guard(dir => {
      const s = getSelection(), r = s.getRangeAt(0), cmp = (a, b) => a.textContent.trim().localeCompare(b.textContent.trim(), undefined, { numeric: true, sensitivity: 'base' }) * (dir === 'desc' ? -1 : 1);
      const l = el0().closest('ul,ol');
      let items = l ? [...l.children].filter(x => x.tagName === 'LI') : [...pg().children].filter(c => /^(P|DIV|H[1-6])$/.test(c.tagName) && r.intersectsNode(c));
      if (items.length < 2) return say('Select two or more lines or list items to sort.');
      const anchor = document.createComment(''); items[0].before(anchor); items.sort(cmp).forEach(c => anchor.before(c)); anchor.remove();
      say('Sorted ' + items.length + ' items.');
    }),
    nextPh() {
      if (ro()) return say('This document is view-only.');
      const p = pg(), w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), s = getSelection(), caret = s.rangeCount && p.contains(s.anchorNode) ? s.getRangeAt(0) : null;
      let first = null, found = null, n;
      while ((n = w.nextNode())) {
        const re = /\[[^\]\n]{1,80}\]/g; let m;
        while ((m = re.exec(n.data))) {
          const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
          if (!first) first = r; if (!found && caret && caret.comparePoint(n, m.index) > 0) found = r;
        }
        if (found) break;
      }
      const r = found || first; if (!r) return say('No [placeholders] on this page.');
      p.focus({ preventScroll: true }); s.removeAllRanges(); s.addRange(r);
      const e = r.startContainer.parentElement; e && e.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    /* images */
    img(a) {
      if (ro()) return say('This document is view-only.');
      const i = simg(); if (!i) return;
      if (a === 'rot') i.style.rotate = ((parseFloat(i.style.rotate) || 0) + 90) % 360 + 'deg';
      else if (a === 'flip') i.style.scale = i.style.scale === '-1 1' ? '' : '-1 1';
      else if (a === 'border') i.style.border = i.style.border ? '' : '2px solid #2b579a';
      else if (a === 'front') i.style.zIndex = 50;
      else if (a === 'back') i.style.zIndex = 0;
      else if (a === 'shadow') i.style.boxShadow = i.style.boxShadow ? '' : '0 4px 14px rgba(0,0,0,.35)';
      else if (a === 'round') i.style.borderRadius = i.style.borderRadius ? '' : '14px';
      else if (a === 'reset') ['filter', 'opacity', 'rotate', 'scale', 'border', 'boxShadow', 'borderRadius', 'clipPath'].forEach(k => { i.style[k] = ''; });
      else if (a === 'dup') {
        const c = i.cloneNode(true); c.classList.remove('img-selected');
        const x = (parseFloat(i.getAttribute('data-x')) || 0) + 24, y = (parseFloat(i.getAttribute('data-y')) || 0) + 24;
        c.setAttribute('data-x', x); c.setAttribute('data-y', y); c.style.transform = `translate(${x}px,${y}px)`;
        i.parentNode.appendChild(c); if (typeof makeDraggableResizable === 'function') makeDraggableResizable(c);
      }
      else if (a === 'alt') { const t = prompt('Alt text for screen readers:', i.alt || ''); if (t !== null) i.alt = t; }
      refreshHandles(); dirty(i);
    },
    imgFilter(v) { const i = typeof selectedImage !== 'undefined' && selectedImage; if (!ro() && i) { i.style.filter = v === 'none' ? '' : v; dirty(i); } },
    imgOpacity(v) { const i = typeof selectedImage !== 'undefined' && selectedImage; if (!ro() && i) { i.style.opacity = v; dirty(i); } },
    imgSize(v) {
      if (ro()) return say('This document is view-only.'); const i = simg(); if (!i) return;
      const p = imgPage(i), cs = getComputedStyle(p), w = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      i.style.width = Math.round(w * v / 100) + 'px'; i.style.height = 'auto'; refreshHandles(); dirty(i);
    },
    imgAlign(v) {
      if (ro()) return say('This document is view-only.'); const i = simg(); if (!i) return;
      const p = imgPage(i), cs = getComputedStyle(p), w = i.offsetWidth, y = parseFloat(i.getAttribute('data-y')) || 0;
      i.style.left = (v === 'left' ? parseFloat(cs.paddingLeft) : v === 'right' ? p.clientWidth - parseFloat(cs.paddingRight) - w : (p.clientWidth - w) / 2) + 'px';
      i.style.transform = `translate(0px,${y}px)`; i.setAttribute('data-x', 0); refreshHandles(); dirty(i);
    },
    imgCrop(v) { if (ro()) return; const i = simg(); if (!i) return; i.style.clipPath = v === 'none' ? '' : v; dirty(i); },
    imgUrl() {
      if (ro()) return say('This document is view-only.');
      const u = prompt('Image address (https://…):'); if (!u || !/^https?:\/\//i.test(u.trim())) return u && say('Enter a full web address starting with http(s)://');
      if (typeof insertDraggableImage === 'function') insertDraggableImage(u.trim(), 300); say('Image inserted from URL.');
    },
    /* productivity */
    sign: guard(() => {
      const m = modal('Draw your signature', '<canvas class="wp2-cv" width="408" height="160"></canvas><label><input type="checkbox" id="wp2sr"> Remember on this device</label><div class="wp2-act"><button data-a="saved">Use saved</button><button data-a="c">Clear</button><button data-a="x">Cancel</button><button data-a="i" class="pri">Insert</button></div>', { w: 440 });
      const cv = m.querySelector('canvas'), cx = cv.getContext('2d'); let d = false;
      cx.lineWidth = 2.5; cx.lineCap = 'round'; cx.strokeStyle = '#102a5c';
      const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
      cv.onpointerdown = e => { d = true; cv.setPointerCapture(e.pointerId); cx.beginPath(); cx.moveTo(...pt(e)); e.preventDefault(); };
      cv.onpointermove = e => { if (d) { cx.lineTo(...pt(e)); cx.stroke(); e.preventDefault(); } };
      cv.onpointerup = cv.onpointercancel = () => { d = false; };
      const blank = () => !cx.getImageData(0, 0, cv.width, cv.height).data.some((v, i) => i % 4 === 3 && v);
      const put = url => { if (typeof insertDraggableImage === 'function') insertDraggableImage(url, 180); else { restore(); document.execCommand('insertHTML', false, `<img src="${url}" style="width:180px">`); } closeModal(); };
      m.onclick = e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'c') cx.clearRect(0, 0, cv.width, cv.height);
        else if (a === 'x') closeModal();
        else if (a === 'saved') { const s = store.get('sig', null); s ? put(s) : say('No saved signature yet.'); }
        else if (a === 'i') { if (blank()) return say('Draw your signature first.'); const url = cv.toDataURL('image/png'); if ($('wp2sr').checked) store.set('sig', url); put(url); }
      };
    }),
    dictate() {
      if (ro()) return say('This document is view-only.');
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return say('Dictation is not supported in this browser (try Chrome or Edge).');
      if (listening) { listening = false; try { rec.stop(); } catch (e) {} rec = null; return say('Dictation stopped.'); }
      rec = new SR(); rec.continuous = true; rec.interimResults = false; rec.lang = navigator.language || 'en-IN'; listening = true;
      const fix = t => t.replace(/\s+(comma)\b/gi, ',').replace(/\s+(full stop|period)\b/gi, '.').replace(/\s+question mark\b/gi, '?').replace(/\s+(exclamation mark|exclamation point)\b/gi, '!').replace(/\s+colon\b/gi, ':').replace(/\s+semicolon\b/gi, ';');
      rec.onresult = e => {
        restore();
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue;
          fix(e.results[i][0].transcript.trim()).split(/\b(new paragraph|new line)\b/i).forEach(part => {
            if (/^new paragraph$/i.test(part)) document.execCommand('insertParagraph');
            else if (/^new line$/i.test(part)) document.execCommand('insertLineBreak');
            else if (part.trim()) document.execCommand('insertText', false, part.trim() + ' ');
          });
        }
      };
      rec.onerror = e => { if (e.error === 'not-allowed') { listening = false; say('Microphone access was blocked.'); } };
      rec.onend = () => { if (listening) { try { rec.start(); } catch (e) { listening = false; } } };
      rec.start(); say('🎤 Listening… say “comma”, “full stop”, “new paragraph”. Click Dictate again to stop.');
    },
    toggleAuto() { autocorrect = !autocorrect; store.set('auto', autocorrect); say('Autocorrect ' + (autocorrect ? 'on (# heading, - list, > quote, [] checklist, **bold**, typos, capitals, (c) → ©)' : 'off') + '.'); },
    toggleQuotes() { smartQ = !smartQ; store.set('smartq', smartQ); say('Smart quotes ' + (smartQ ? 'on' : 'off') + '.'); },
    fit() { setZoom(($('contentArea').clientWidth - 60) / 816); },
    template: guard(k => { document.execCommand('insertHTML', false, TPL[k] + '<p><br></p>'); setTimeout(() => WP2.nextPh(), 30); }),
    /* pages */
    pageHere() { if (ro()) return say('This document is view-only.'); const at = currentPage + 1; addPage(); reorder(pages.length - 1, at); say('Page inserted after page ' + at + '.'); },
    dupPage() {
      if (ro()) return say('This document is view-only.');
      if (typeof clearImageHandles === 'function') clearImageHandles();
      const src = pg(), at = currentPage + 1, np = addPage(src.innerHTML);
      np.style.cssText = src.style.cssText; np.style.display = 'block';
      np.querySelectorAll('img.draggable').forEach(i => typeof makeDraggableResizable === 'function' && makeDraggableResizable(i));
      reorder(pages.length - 1, at); say('Page duplicated.');
    },
    movePage(d) { if (ro()) return say('This document is view-only.'); const to = currentPage + d; if (to < 0 || to >= pages.length) return say('Cannot move the page further.'); reorder(currentPage, to); },
    numfmt(v) { if (!v) return; numFmt = v; store.set('numfmt', v); updateNums(); say('Page numbers: ' + v + '.'); },
    cover() {
      if (ro()) return say('This document is view-only.');
      const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const m = modal('Cover page', `<input type="text" id="wp2ct" placeholder="Title" value="${esc(title() === 'document' ? '' : title())}"><input type="text" id="wp2cs2" placeholder="Subtitle (optional)"><input type="text" id="wp2ca" placeholder="Author"><input type="text" id="wp2cd" value="${today}"><div class="wp2-act"><button data-a="x">Cancel</button><button data-a="i" class="pri">Insert as first page</button></div>`, { w: 380 });
      m.onclick = e => {
        const a = e.target.dataset.a; if (!a) return; if (a === 'x') return closeModal();
        const v = id => esc($(id).value.trim());
        const html = `<div style="text-align:center;padding-top:180px"><h1 style="font-size:36pt;font-weight:300;color:#1f3864;margin:0 0 10px">${v('wp2ct') || 'Title'}</h1>${v('wp2cs2') ? `<h2 style="font-size:16pt;font-weight:400;color:#5a6b85;margin:0">${v('wp2cs2')}</h2>` : ''}<hr style="width:120px;border:none;border-top:3px solid #2b579a;margin:36px auto"><p style="font-size:14pt;margin:0">${v('wp2ca')}</p><p style="color:#666">${v('wp2cd')}</p></div>`;
        closeModal(); addPage(html); reorder(pages.length - 1, 0); say('Cover page added.');
      };
    },
    symbols() {
      if (ro()) return say('This document is view-only.');
      const G = {
        Common: '© ® ™ ° § ¶ † ‡ • … – — ‘ ’ “ ” « » ¿ ¡ № ✓ ✗ ★ ☆ ☎ ✉ ♥ ♦ ♣ ♠ ☀ ☁ ☂ ✂ ✈ ♫'.split(' '),
        Math: '± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ ∇ ∈ ∉ ⊂ ⊃ ∪ ∩ ∅ ∀ ∃ ∴ ∵ ‰ ° ′ ″ ² ³ ¹ ½ ¼ ¾ ⅓ ⅔'.split(' '),
        Greek: 'α β γ δ ε ζ η θ ι κ λ μ ν ξ π ρ σ τ φ χ ψ ω Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω'.split(' '),
        Arrows: '← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔ ↩ ↪ ↺ ↻ ➔ ➜ ➤ ▲ ▼ ◀ ▶'.split(' '),
        Currency: '₹ $ € £ ¥ ¢ ₩ ₽ ₿ ฿ ₫ ₪ ₺ ₦'.split(' '),
        Emoji: '😀 😊 😉 😍 🤔 😎 😢 😮 👍 👎 👏 🙏 💪 🎉 🔥 ⭐ ✅ ❌ ⚠️ ❓ ❗ 💡 📌 📎 📅 📞 📧 🔒 🔑 🏆 🎯 📈 📉 🕒 🌍'.split(' ')
      };
      const m = modal('Symbols', Object.keys(G).map(k => `<div class="wp2-sh">${k}</div><div class="wp2-sym">${G[k].map(c => `<button data-c="${c}">${c}</button>`).join('')}</div>`).join(''), { side: true, w: 380 });
      m.onmousedown = e => { if (e.target.dataset.c) e.preventDefault(); };
      m.onclick = e => { const c = e.target.dataset.c; if (c) { restore(); document.execCommand('insertText', false, c); } };
    },
    /* tables */
    tcalc: guard(a => {
      const c = cell(); if (!c) return say('Click inside the table cell where the result should go.');
      const tr = c.parentNode, idx = c.cellIndex, t = c.closest('table'), vals = [];
      const num = x => { const v = x.textContent.replace(/[,\s\u00a0₹$€£%]/g, ''); return v !== '' && !isNaN(v) ? parseFloat(v) : null; };
      if (/Col$/.test(a)) { for (const r of t.rows) { if (r === tr) break; const x = r.cells[idx]; if (x && x.tagName !== 'TH') { const v = num(x); if (v !== null) vals.push(v); } } }
      else for (const x of tr.cells) { if (x === c) break; const v = num(x); if (v !== null) vals.push(v); }
      if (!vals.length) return say('No numbers found ' + (/Col$/.test(a) ? 'above' : 'to the left of') + ' this cell.');
      const sum = vals.reduce((p, q) => p + q, 0);
      const r = /^sum/.test(a) ? sum : /^avg/.test(a) ? sum / vals.length : /^min/.test(a) ? Math.min(...vals) : Math.max(...vals);
      c.textContent = String(Math.round(r * 100) / 100); dirty(c);
    }),
    tsort: guard(dir => {
      const c = cell(); if (!c) return say('Click inside the column to sort by.');
      const t = c.closest('table'), idx = c.cellIndex, rows = [...t.rows], head = rows[0] && rows[0].cells[0] && rows[0].cells[0].tagName === 'TH' ? 1 : 0, body = rows.slice(head);
      if (body.length < 2) return say('Not enough rows to sort.');
      const key = r => (r.cells[idx] ? r.cells[idx].textContent.replace(/[,\s\u00a0₹$€£%]/g, '') : ''), numeric = body.every(r => key(r) !== '' && !isNaN(key(r)));
      body.sort((a, b) => (numeric ? key(a) - key(b) : (a.cells[idx] ? a.cells[idx].textContent.trim() : '').localeCompare(b.cells[idx] ? b.cells[idx].textContent.trim() : '', undefined, { numeric: true, sensitivity: 'base' })) * (dir === 'desc' ? -1 : 1));
      const par = body[0].parentNode; body.forEach(r => par.appendChild(r)); dirty(c); say('Table sorted.');
    }),
    theader: guard(() => {
      const c = cell(); if (!c) return say('Click inside a table first.');
      const r0 = c.closest('table').rows[0], toTh = r0.cells[0].tagName !== 'TH';
      [...r0.cells].forEach(x => {
        const n = document.createElement(toTh ? 'th' : 'td'); [...x.attributes].forEach(a => n.setAttribute(a.name, a.value)); n.innerHTML = x.innerHTML;
        n.style.background = toTh ? '#f0f4ff' : ''; n.style.fontWeight = toTh ? '600' : ''; if (toTh && !n.style.textAlign) n.style.textAlign = 'left'; x.replaceWith(n);
      });
      dirty(r0);
    }),
    tfit: guard(v => {
      const c = cell(); if (!c) return say('Click inside a table first.');
      const t = c.closest('table'), cols = t.rows[0].cells.length;
      t.style.width = v === 'content' ? 'auto' : '100%'; t.style.tableLayout = v === 'equal' ? 'fixed' : 'auto';
      [...t.rows].forEach(r => [...r.cells].forEach(x => { x.style.width = v === 'equal' ? (100 / cols) + '%' : ''; })); dirty(t);
    }),
    tborder: guard(v => {
      const c = cell(); if (!c) return say('Click inside a table first.');
      const t = c.closest('table'); t.style.borderCollapse = 'collapse'; t.style.border = v === 'outside' ? '1px solid #999' : '';
      [...t.rows].forEach(r => [...r.cells].forEach(x => {
        x.style.border = v === 'all' ? '1px solid #999' : v === 'dashed' ? '1px dashed #999' : 'none';
        if (v === 'rows') x.style.borderBottom = '1px solid #999';
      })); dirty(t);
    }),
    valign: guard(v => { const c = cell(); if (c) c.style.verticalAlign = v; }),
    t2tbl: guard(() => {
      const txt = getSelection().toString(); if (!txt.trim()) return say('Select the lines to convert first (tab, comma, semicolon or | separated).');
      const lines = txt.split(/\r?\n/).filter(l => l.trim()), d = ['\t', '|', ';', ','].find(ch => lines.every(l => l.includes(ch)));
      document.execCommand('insertHTML', false, tableHtml(lines.map(l => d ? l.split(d).map(x => x.trim()) : [l.trim()]), false));
    }),
    tbl2text: guard(() => {
      const c = cell(); if (!c) return say('Click inside the table to convert.');
      const t = c.closest('table'); t.replaceWith(...[...t.rows].map(r => { const p = document.createElement('p'); p.innerHTML = [...r.cells].map(x => x.innerHTML).join(' &emsp; '); return p; })); dirty(pg());
    }),
    /* references */
    tocUpdate: guard(() => {
      const boxes = pages.flatMap(p => [...p.querySelectorAll('.wp-toc')]); if (!boxes.length) return say('No table of contents found — insert one first.');
      const hs = headings(); boxes.forEach(bx => { bx.innerHTML = tocHtml(hs); }); say('Table of contents updated.');
    }),
    cite: guard(() => {
      const a = prompt('Author (e.g. Smith, J.):'); if (!a) return;
      const y = prompt('Year:', String(new Date().getFullYear())) || 'n.d.', t = prompt('Title of the work:') || '', p = prompt('Publisher / journal / website (optional):') || '';
      const ref = `${a} (${y}). ${t}${t && !/[.?!]$/.test(t) ? '.' : ''}${p ? ' ' + p + '.' : ''}`;
      document.execCommand('insertHTML', false, `<span class="wp-cite" data-ref="${esc(ref)}">(${esc(a.split(',')[0].trim())}, ${esc(y)})</span>&nbsp;`);
    }),
    biblio: guard(() => {
      const refs = [...new Set(pages.flatMap(p => [...p.querySelectorAll('.wp-cite')].map(x => x.dataset.ref).filter(Boolean)))].sort((x, y) => x.localeCompare(y));
      if (!refs.length) return say('Insert citations first (References ▸ Cite).');
      document.execCommand('insertHTML', false, '<h2>References</h2>' + refs.map(r => `<p style="padding-left:.5in;text-indent:-.5in">${esc(r)}</p>`).join('') + '<p><br></p>');
    }),
    /* review */
    trackToggle() { if (ro()) return say('This document is view-only.'); track = !track; trackUI(); say('Track changes ' + (track ? 'on — edits are marked as insertions / deletions.' : 'off.')); },
    comments() {
      const list = []; pages.forEach((p, i) => p.querySelectorAll('.wp-comment').forEach(c => list.push({ c, i })));
      if (!list.length) return say('No comments in this document.');
      const m = modal('Comments (' + list.length + ')', list.map((x, k) => `<div class="wp2-row" data-k="${k}"><div class="wp2-q">“${esc(x.c.textContent.slice(0, 60))}”</div><div>${esc((x.c.title || '').replace(/^💬\s*/, ''))}</div><div class="wp2-act"><button data-a="go">Go to</button><button data-a="edit">Edit</button><button data-a="del">Delete</button><span>Page ${x.i + 1}</span></div></div>`).join(''), { side: true, w: 380 });
      m.onclick = e => {
        const a = e.target.dataset.a; if (!a) return; const row = e.target.closest('[data-k]'), x = list[+row.dataset.k];
        if (a === 'go') { switchPage(x.i); x.c.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        else if (ro()) say('This document is view-only.');
        else if (a === 'edit') { const t = prompt('Comment:', (x.c.title || '').replace(/^💬\s*/, '')); if (t) { x.c.title = '💬 ' + t; row.children[1].textContent = t; dirty(x.c); } }
        else { x.c.replaceWith(...x.c.childNodes); row.remove(); }
      };
    },
    readability() {
      const t = docText(), words = t.match(/[A-Za-z\u00C0-\u024F']+/g) || [], total = wordCount(t);
      if (!total) return say('Nothing to analyse yet.');
      const sents = t.split(/[.!?।]+["')\]]*(?:\s|$)|\n{2,}/).filter(s => s.trim()), S = Math.max(1, sents.length), Wd = Math.max(1, words.length);
      const syl = w => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return m ? m.length : 1; };
      const sy = words.reduce((a, w) => a + syl(w), 0), fre = 206.835 - 1.015 * (Wd / S) - 84.6 * (sy / Wd), fk = .39 * (Wd / S) + 11.8 * (sy / Wd) - 15.59;
      const band = fre >= 90 ? 'Very easy' : fre >= 70 ? 'Easy' : fre >= 60 ? 'Plain English' : fre >= 50 ? 'Fairly difficult' : fre >= 30 ? 'Difficult' : 'Very difficult';
      const stop = new Set('the a an and or of to in on for with is are was were be been it its this that these those as at by from not but if then so we you he she they i have has had will would can could should do does did our your their my his her'.split(' '));
      const freq = {}; words.forEach(w => { const k = w.toLowerCase(); if (k.length > 3 && !stop.has(k)) freq[k] = (freq[k] || 0) + 1; });
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${esc(k)} (${v})`).join(', ') || '—';
      const longest = Math.max(...sents.map(wordCount));
      modal('Readability', `<table class="wp2-tbl"><tr><td>Words</td><td>${total}</td></tr><tr><td>Sentences</td><td>${S}</td></tr><tr><td>Words per sentence</td><td>${(Wd / S).toFixed(1)} (longest ${longest})</td></tr><tr><td>Average word length</td><td>${(words.join('').length / Wd).toFixed(1)} letters</td></tr><tr><td>Flesch reading ease</td><td><b>${fre.toFixed(0)}</b> — ${band}</td></tr><tr><td>Grade level</td><td>${Math.max(0, fk).toFixed(1)}</td></tr><tr><td>Reading time</td><td>~${Math.max(1, Math.round(total / 200))} min · speaking ~${Math.max(1, Math.round(total / 130))} min</td></tr><tr><td>Most used words</td><td>${top}</td></tr></table><div class="wp2-act"><span>Scores are tuned for English text.</span></div>`, { w: 420 });
    },
    check() {
      const raw = pages.map(p => p.textContent).join('\n');
      const dbl = (raw.match(/ {2,}/g) || []).length, rep = (raw.match(/\b([A-Za-z']+)\s+\1\b/gi) || []).length, straight = (raw.match(/["']/g) || []).length;
      const empty = pages.reduce((a, p) => a + [...p.querySelectorAll('p,div')].filter(x => !x.children.length ? !x.textContent.trim() : (x.children.length === 1 && x.firstElementChild.tagName === 'BR' && !x.textContent.trim())).length, 0);
      const m = modal('Check document', `<table class="wp2-tbl"><tr><td>Double spaces</td><td>${dbl}</td></tr><tr><td>Repeated words (“the the”)</td><td>${rep}</td></tr><tr><td>Empty paragraphs</td><td>${empty}</td></tr><tr><td>Straight quotes</td><td>${straight}</td></tr></table><div class="wp2-act"><button data-a="sp">Fix double spaces</button><button data-a="rp">Highlight repeats</button><button data-a="em">Remove empty paragraphs</button><button data-a="qt">Curl quotes</button></div><div class="wp2-act"><span id="wp2cks"></span></div>`, { w: 440 });
      const st = t => { $('wp2cks').textContent = t; };
      m.onclick = e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'rp') { const n = markAll(/\b([A-Za-z']+)\s+\1\b/gi); return st(n + ' repeat' + (n === 1 ? '' : 's') + ' highlighted — close this window to clear them.'); }
        if (ro()) return st('This document is view-only.');
        if (a === 'sp') { let n = 0; eachText(t => { const v = t.data.replace(/ {2,}/g, () => { n++; return ' '; }); if (v !== t.data) t.data = v; }); st('Fixed ' + n + ' double space' + (n === 1 ? '' : 's') + '.'); }
        else if (a === 'qt') { let n = 0; eachText(t => { const v = t.data.replace(/(^|[\s(\[{\u2014\u2013-])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s(\[{\u2014\u2013-])'/g, '$1‘').replace(/'/g, '’'); if (v !== t.data) { n++; t.data = v; } }); st('Curled quotes in ' + n + ' text run' + (n === 1 ? '' : 's') + '.'); }
        else if (a === 'em') {
          let n = 0;
          pages.forEach(p => [...p.querySelectorAll('p,div')].forEach(x => {
            const blank = !x.textContent.trim() && !x.querySelector('img,table,input,hr') && (!x.children.length || (x.children.length === 1 && x.firstElementChild.tagName === 'BR'));
            if (blank && x.nextElementSibling && !x.classList.contains('wp-wm') && !x.matches('.wp-hdr,.wp-ftr')) { x.remove(); n++; }
          }));
          st('Removed ' + n + ' empty paragraph' + (n === 1 ? '' : 's') + '.');
        }
        dirty(pg());
      };
    },
    /* file */
    saveNow() { typeof saveDocument === 'function' && saveDocument(); },
    saveVer() { typeof saveVersion === 'function' && saveVersion(); },
    info() {
      const t = docText(), imgs = pages.reduce((a, p) => a + p.querySelectorAll('img').length, 0), tbls = pages.reduce((a, p) => a + p.querySelectorAll('table').length, 0);
      const cm = pages.reduce((a, p) => a + p.querySelectorAll('.wp-comment').length, 0), tc = pages.reduce((a, p) => a + p.querySelectorAll('ins.wp-ins,del.wp-del').length, 0);
      modal('Document info', `<table class="wp2-tbl"><tr><td>Title</td><td>${esc(title())}</td></tr><tr><td>Pages</td><td>${pages.length}</td></tr><tr><td>Words</td><td>${wordCount(t)}</td></tr><tr><td>Characters</td><td>${t.length} (${t.replace(/\s/g, '').length} without spaces)</td></tr><tr><td>Headings</td><td>${headings().length}</td></tr><tr><td>Images / tables</td><td>${imgs} / ${tbls}</td></tr><tr><td>Comments</td><td>${cm}</td></tr><tr><td>Tracked changes</td><td>${tc}</td></tr><tr><td>Versions saved</td><td>${typeof versions !== 'undefined' ? versions.length : 0}</td></tr><tr><td>Access</td><td>${ro() ? 'View only' : 'Editable'}</td></tr></table>`, { w: 400 });
    },
    async exp(f) {
      try {
        const cp = cleanCopy(), name = title();
        if (f === 'txt') dl(name + '.txt', cp.map(textOf).join('\n\n--- page break ---\n\n'), 'text/plain');
        else if (f === 'md') dl(name + '.md', cp.map(p => toMd(p)).join('\n\n---\n\n').replace(/\n{3,}/g, '\n\n').trim(), 'text/markdown');
        else if (f === 'json') { cp.forEach(p => p.style.removeProperty('display')); dl(name + '.pdoc.json', JSON.stringify({ title: name, pages: cp.map(p => p.innerHTML), styles: cp.map(p => p.style.cssText), versions: typeof versions !== 'undefined' ? versions : [], exported: new Date().toISOString() }), 'application/json'); }
        else if (f === 'docx') { say('Building .docx…'); dl(name + '.docx', await toDocx(cp, name)); }
        else {
          const body = cp.map(p => { p.querySelectorAll('img.draggable').forEach(i => { i.style.position = 'static'; i.style.transform = ''; }); return `<div style="page-break-after:always;font-family:${p.style.fontFamily || 'Calibri'};line-height:${p.style.lineHeight || 1.5}">${p.innerHTML}</div>`; }).join('');
          const head = `<meta charset="utf-8"><title>${esc(name)}</title>`;
          if (f === 'html') dl(name + '.html', `<!DOCTYPE html><html><head>${head}<style>body{max-width:816px;margin:40px auto;font-family:Calibri,sans-serif}table{border-collapse:collapse}</style></head><body>${body}</body></html>`, 'text/html');
          else dl(name + '.doc', `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head>${head}<style>table{border-collapse:collapse}</style></head><body>${body}</body></html>`, 'application/msword');
        }
        say('Exported ' + f.toUpperCase() + '.');
      } catch (e) { console.warn(e); say('Export failed: ' + (e.message || e)); }
    },
    imp() {
      if (ro()) return say('This document is view-only.');
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.docx,.html,.htm,.md,.markdown,.txt,.json,.csv,.tsv';
      i.onchange = () => { const f = i.files[0]; if (f) importFile(f); };
      i.click();
    }
  };

  /* ───────────────────────── keyboard shortcuts ───────────────────────── */
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const inPage = pages.some(p => p.contains(document.activeElement));
    if (mod && !e.shiftKey && !e.altKey && k === 'h') { e.preventDefault(); findDlg(); }
    else if (mod && !e.shiftKey && !e.altKey && k === 'g') { e.preventDefault(); WP2.goto(); }
    else if ((mod && k === '/') || (e.altKey && !mod && k === 'q')) { e.preventDefault(); palette(); }
    else if (mod && e.shiftKey && k === 'e') { e.preventDefault(); WP2.trackToggle(); }
    else if (e.altKey && !mod && e.key === ']' && inPage) { e.preventDefault(); WP2.nextPh(); }
    else if (mod && e.key === 'Enter' && inPage && !ro()) { e.preventDefault(); WP2.pageHere(); }
    else if (mod && e.altKey && k === 'm' && inPage) { e.preventDefault(); W('comment'); }
  });

  trackUI();
  say('Tools & File tabs loaded.');
})();

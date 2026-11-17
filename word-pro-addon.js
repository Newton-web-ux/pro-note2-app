/* Pro Document — Word-style add-on.
   Add as the LAST script in document-editor.html (just before </body>):
   <script src="word-pro-addon.js"></script>
   Nothing existing is removed or changed: Draw, Insert Studio, graphs, LaTeX,
   AI, versions, sharing, export, slideshow all keep working. */
(function () {
  'use strict';
  if (window.WP) return;
  const $ = id => document.getElementById(id);
  const ro = () => typeof isReadOnly !== 'undefined' && isReadOnly;
  const pg = () => pages[currentPage];
  const say = m => typeof setStatus === 'function' && setStatus(m);
  let saved = null, multi = false, painter = null, dirty = false;

  /* ── selection helpers (ribbon selects/inputs steal focus) ── */
  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && pages.some(p => p.contains(s.anchorNode))) saved = s.getRangeAt(0).cloneRange();
  });
  const restore = () => {
    if (!saved) return;
    const s = getSelection(); s.removeAllRanges(); s.addRange(saved);
  };
  const ex = (c, v) => { if (ro()) return; restore(); document.execCommand(c, false, v == null ? null : v); };
  const ins = h => ex('insertHTML', h);
  const el0 = () => { const n = getSelection().anchorNode; return n && (n.nodeType === 1 ? n : n.parentNode); };
  const blk = () => { let n = el0(); while (n && n !== pg()) { if (/^(P|H[1-6]|LI|DIV|BLOCKQUOTE|PRE|TD|TH)$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
  const cell = () => { const e = el0(); return e && e.closest ? e.closest('td,th') : null; };
  const guard = f => (...a) => { if (ro()) return say('This document is view-only.'); restore(); try { return f(...a); } catch (e) { console.warn(e); } };

  /* ── styles ── */
  const css = document.createElement('style');
  css.textContent = `
  body{font-family:'Segoe UI',system-ui,sans-serif}
  .title-bar{background:#1f4e9c}.ribbon-tabs{background:#1f4e9c}
  .ribbon-toolbar{min-height:84px;box-shadow:0 1px 3px rgba(0,0,0,.08);align-items:stretch}
  .ribbon-group{justify-content:space-between;padding:0 8px}
  .ribbon-group-label{font-size:10px;text-transform:none;letter-spacing:0;padding-top:2px}
  .tb-btn .tb-icon{font-size:20px}
  .wp-ruler{width:816px;height:18px;flex-shrink:0;margin:-12px 0 -8px;background:#f3f3f3 repeating-linear-gradient(90deg,#999 0 1px,transparent 1px 96px),repeating-linear-gradient(90deg,#bbb 0 1px,transparent 1px 12px);background-size:100% 100%,100% 40%;background-repeat:no-repeat,repeat-x;background-position:0 0,0 100%;border-radius:2px;opacity:.95}
  .wp-ruler.hide{display:none}
  .wp-mini{position:fixed;display:none;z-index:10000;background:#fff;border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.22);padding:3px;gap:2px}
  .wp-mini button{border:none;background:none;width:28px;height:26px;border-radius:4px;cursor:pointer;font-size:13px}
  .wp-mini button:hover{background:var(--accent-light)}
  .wp-hdr,.wp-ftr{position:absolute;left:96px;right:96px;font-size:10pt;color:#777;outline:none;min-height:16px}
  .wp-hdr{top:40px;border-bottom:1px solid #ddd;padding-bottom:3px}
  .wp-ftr{bottom:62px;border-top:1px solid #ddd;padding-top:3px;text-align:center}
  .wp-wm{position:absolute;top:42%;left:0;right:0;text-align:center;font-size:84px;font-weight:700;color:rgba(0,0,0,.08);transform:rotate(-30deg);pointer-events:none;user-select:none}
  .wp-fn{margin-top:24px;border-top:1px solid #999;padding-top:6px;font-size:10pt;width:40%}
  .wp-box{border:1.5px solid #2b579a;padding:10px 12px;margin:8px 0;border-radius:3px}
  .wp-comment{background:#fff2a8;border-bottom:2px solid #e0b400;cursor:help}
  .wp-toc a{color:inherit;text-decoration:none}
  .wp-zoom{display:flex;align-items:center;gap:6px}.wp-zoom input{width:110px;accent-color:#fff}
  .wp-dirty{font-weight:600}
  body.wp-focus .ribbon-tabs,body.wp-focus .ribbon-toolbar,body.wp-focus .pages-panel,body.wp-focus .title-bar{display:none}
  .page img,.page table{max-width:100%}
  .page blockquote{border-left:4px solid #2b579a;margin:10px 0;padding:4px 14px;color:#444;font-style:italic}
  .page pre{background:#f4f6fa;padding:8px 10px;border-radius:4px;font-family:Consolas,monospace;font-size:10.5pt}
  @media print{
    .title-bar,.ribbon-tabs,.ribbon-toolbar,.find-bar,.pages-panel,.status-bar,.wp-ruler,.wp-mini,#sharedBanner,.img-handle{display:none!important}
    body{height:auto;overflow:visible;display:block;background:#fff}
    .editor-layout,.canvas-area{display:block;overflow:visible;background:#fff;padding:0;zoom:1!important}
    .page{display:block!important;box-shadow:none;margin:0 auto;page-break-after:always}
    .page::before{color:#777}
  }`;
  document.head.appendChild(css);

  /* ── ribbon builders ── */
  const tabs = document.querySelector('.ribbon-tabs');
  const b = (ic, l, fn, t) => `<button class="tb-btn" onmousedown="event.preventDefault()" onclick="${fn}" title="${t || l}"><span class="tb-icon">${ic}</span>${l}</button>`;
  const sb = (ic, fn, t) => `<button class="tb-btn small" onmousedown="event.preventDefault()" onclick="${fn}" title="${t}"><span class="tb-icon">${ic}</span></button>`;
  const sl = (label, opts, fn, w) => `<select class="tb-select" style="width:${w || 120}px" onchange="${fn}(this.value);this.selectedIndex=0" title="${label}"><option value="">${label}</option>${opts.map(o => Array.isArray(o) ? `<option value="${o[0]}">${o[1]}</option>` : `<option>${o}</option>`).join('')}</select>`;
  function addTab(id, label, groups) {
    const t = document.createElement('button');
    t.className = 'tab-btn'; t.dataset.tab = id; t.textContent = label;
    t.onclick = () => switchTab(id);
    tabs.appendChild(t);
    const d = document.createElement('div');
    d.id = id; d.className = 'ribbon-toolbar';
    d.innerHTML = groups.map(g => `<div class="ribbon-group"><div class="ribbon-group-row">${g[1]}</div>${g[2] ? `<div class="ribbon-group-row">${g[2]}</div>` : ''}<div class="ribbon-group-label">${g[0]}</div></div>`).join('');
    document.querySelector('.find-bar').before(d);
  }

  const STYLES = {
    normal: ['p', 'font-size:12pt;font-weight:400;margin:0 0 8px;color:inherit;font-style:normal'],
    title: ['h1', 'font-size:28pt;font-weight:300;margin:0 0 6px;color:#1f3864'],
    subtitle: ['h2', 'font-size:14pt;font-weight:400;margin:0 0 12px;color:#5a6b85'],
    h1: ['h1', 'font-size:18pt;font-weight:600;margin:18px 0 6px;color:#2b579a'],
    h2: ['h2', 'font-size:14pt;font-weight:600;margin:14px 0 4px;color:#2b579a'],
    h3: ['h3', 'font-size:12pt;font-weight:600;margin:10px 0 4px;color:#1f3864'],
    quote: ['blockquote', ''],
    code: ['pre', ''],
    nospace: ['p', 'margin:0;font-size:12pt']
  };

  const tableOpts = ['Grid', 'Striped', 'Minimal', 'Blue header'];
  const SPECIAL = ['©', '®', '™', '°', '§', '¶', '†', '‡', '•', '…', '€', '₹', '£', '¥', '½', '¼', '¾', '‰', '✓', '✗', '→', '⇒', '★', '☎'];

  addTab('wpedit', 'Layout', [
    ['Page setup', sl('Columns', [['1', 'One'], ['2', 'Two'], ['3', 'Three']], 'WP.cols', 90) + sl('Spacing before/after', [['0 0', '0 / 0 pt'], ['0 8', '0 / 8 pt'], ['6 6', '6 / 6 pt'], ['12 12', '12 / 12 pt']], 'WP.pspace', 130),
      b('📄', 'Page Break', 'WP.pageBreak()') + b('💧', 'Watermark', 'WP.watermark()') + b('🔲', 'Page Border', 'WP.pageBorder()')],
    ['Paragraph', sl('First-line indent', [['0', 'None'], ['0.5in', '0.5"'], ['1in', '1"']], 'WP.indent1', 120) + sl('Line spacing', [['1', '1.0'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', '2.0'], ['2.5', '2.5']], 'WP.lspace', 100),
      sb('⇤', "WP.ex('outdent')", 'Decrease indent') + sb('⇥', "WP.ex('indent')", 'Increase indent') + sb('🔤', "WP.drop()", 'Drop cap') + sb('¶', 'WP.marks()', 'Show/hide formatting marks')]
  ]);

  addTab('wptable', 'Table', [
    ['Insert', b('⊞', 'New Table', 'WP.newTable()') + sl('Table style', tableOpts, 'WP.tstyle', 110)],
    ['Rows & columns', b('⬆', 'Row Above', "WP.tbl('rowUp')") + b('⬇', 'Row Below', "WP.tbl('rowDown')") + b('⬅', 'Col Left', "WP.tbl('colL')") + b('➡', 'Col Right', "WP.tbl('colR')")],
    ['Delete & merge', b('➖', 'Del Row', "WP.tbl('delRow')") + b('✖', 'Del Column', "WP.tbl('delCol')") + b('🗑', 'Del Table', "WP.tbl('delTbl')") + b('⧉', 'Merge Right', "WP.tbl('merge')")],
    ['Cell', '<input type="color" class="tb-color" value="#dce6f7" onchange="WP.shadeCell(this.value)" title="Cell shading">' + sl('Align cell', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], 'WP.cellAlign', 90)]
  ]);

  addTab('wpref', 'References', [
    ['Contents', b('📑', 'Table of Contents', 'WP.toc()')],
    ['Footnotes', b('¹', 'Footnote', 'WP.footnote()') + b('🔖', 'Bookmark', 'WP.bookmark()')],
    ['Header & footer', b('🔝', 'Header/Footer', 'WP.hf()') + b('#️⃣', 'Page Number', 'WP.pageNumToggle()')],
    ['Captions', b('🏷', 'Caption', 'WP.caption()')]
  ]);

  addTab('wpreview', 'Review', [
    ['Proofing', b('✔', 'Spelling', 'WP.spell()') + b('🔢', 'Word Count', 'WP.count()')],
    ['Comments', b('💬', 'New Comment', 'WP.comment()') + b('🧹', 'Delete Comments', 'WP.delComments()')],
    ['Speech', b('🔊', 'Read Aloud', 'WP.speak()') + b('⏹', 'Stop', 'speechSynthesis.cancel()')],
    ['Protect', b('🖨', 'Print', 'WP.print()')]
  ]);

  /* extra Home groups, appended to the existing Home ribbon */
  const home = $('home');
  const hg = (label, row1, row2) => {
    const g = document.createElement('div'); g.className = 'ribbon-group';
    g.innerHTML = `<div class="ribbon-group-row">${row1}</div>${row2 ? `<div class="ribbon-group-row">${row2}</div>` : ''}<div class="ribbon-group-label">${label}</div>`;
    home.appendChild(g);
  };
  hg('Styles', sl('Styles', [['normal', 'Normal'], ['title', 'Title'], ['subtitle', 'Subtitle'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['quote', 'Quote'], ['code', 'Code'], ['nospace', 'No Spacing']], 'WP.style', 130));
  hg('Clipboard+', sb('✂', "WP.ex('cut')", 'Cut') + sb('⧉', "WP.ex('copy')", 'Copy') + sb('📋', 'WP.paste()', 'Paste as plain text') + b('🖌', 'Format Painter', 'WP.painter()') + sb('☑', "WP.ex('selectAll')", 'Select all'));
  hg('Font+', sb('A⁺', 'WP.size(2)', 'Grow font') + sb('A⁻', 'WP.size(-2)', 'Shrink font') + sl('Aa', [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Capitalize Each Word'], ['sentence', 'Sentence case']], 'WP.kase', 70),
    '<input type="color" class="tb-color" value="#ffff00" onchange="WP.shade(this.value)" title="Text shading">' + sb('▤', "WP.ex('insertHorizontalRule')", 'Horizontal line'));

  /* extra Insert group */
  const insTb = $('insert');
  const ig = document.createElement('div'); ig.className = 'ribbon-group';
  ig.innerHTML = `<div class="ribbon-group-row">${b('📅', 'Date/Time', 'WP.date()') + b('🔣', 'Symbols', 'WP.symbols()') + b('🗒', 'Text Box', 'WP.textbox()') + b('🔗', 'Hyperlink', 'WP.link()')}</div><div class="ribbon-group-label">Text</div>`;
  insTb.appendChild(ig);

  /* extra View items */
  const vw = $('view');
  const vg = document.createElement('div'); vg.className = 'ribbon-group';
  vg.innerHTML = `<div class="ribbon-group-row">${b('📏', 'Ruler', 'WP.ruler()') + b('📚', 'Print Layout', 'WP.multi()', 'Show all pages') + b('🎯', 'Focus', 'WP.focus()')}</div><div class="ribbon-group-label">Show</div>`;
  vw.appendChild(vg);

  /* ── ruler ── */
  const ruler = document.createElement('div'); ruler.className = 'wp-ruler';
  $('contentArea').prepend(ruler);

  /* ── status bar: zoom slider + save indicator ── */
  const sbr = document.querySelector('.status-bar-right');
  const zl = document.createElement('span'); zl.className = 'wp-zoom';
  zl.innerHTML = '<span id="wpDirty" class="wp-dirty"></span><input type="range" min="40" max="200" value="100" id="wpZoom" title="Zoom">';
  sbr.prepend(zl);
  $('wpZoom').oninput = e => { currentZoom = e.target.value / 100; $('contentArea').style.zoom = currentZoom; $('zoomLabel').textContent = e.target.value + '%'; };

  /* ── mini floating toolbar ── */
  const mini = document.createElement('div'); mini.className = 'wp-mini';
  mini.innerHTML = ['bold:<b>B</b>', 'italic:<i>I</i>', 'underline:<u>U</u>', 'hl:🖍', 'ul:•', 'link:🔗', 'clear:🧹'].map(x => { const [k, l] = x.split(':'); return `<button data-k="${k}" onmousedown="event.preventDefault()">${l}</button>`; }).join('');
  document.body.appendChild(mini);
  mini.onclick = e => {
    const k = e.target.closest('button')?.dataset.k; if (!k) return;
    if (k === 'hl') highlightText(); else if (k === 'ul') ex('insertUnorderedList'); else if (k === 'link') WP.link(); else if (k === 'clear') ex('removeFormat'); else ex(k);
  };
  document.addEventListener('mouseup', () => setTimeout(() => {
    const s = getSelection();
    if (ro() || !s.rangeCount || s.isCollapsed || !pages.some(p => p.contains(s.anchorNode))) { mini.style.display = 'none'; return; }
    const r = s.getRangeAt(0).getBoundingClientRect();
    mini.style.display = 'flex';
    mini.style.left = Math.max(8, r.left + r.width / 2 - 100) + 'px';
    mini.style.top = Math.max(8, r.top - 40) + 'px';
    if (painter) { applyPainter(); }
  }, 10));
  document.addEventListener('mousedown', e => { if (!mini.contains(e.target)) mini.style.display = 'none'; });

  /* ── format painter ── */
  function applyPainter() {
    const p = painter; painter = null; document.body.style.cursor = '';
    document.execCommand('styleWithCSS', false, true);
    if (p.b !== document.queryCommandState('bold')) document.execCommand('bold');
    if (p.i !== document.queryCommandState('italic')) document.execCommand('italic');
    if (p.u !== document.queryCommandState('underline')) document.execCommand('underline');
    document.execCommand('foreColor', false, p.c);
    document.execCommand('fontName', false, p.f);
    say('Format applied.');
  }

  /* ── public API ── */
  const WP = window.WP = {
    ex,
    style: guard(k => {
      const [tag, st] = STYLES[k]; document.execCommand('formatBlock', false, tag);
      const bl = blk(); if (bl) bl.style.cssText = st;
    }),
    pspace: guard(v => { const [a, c] = v.split(' '); const bl = blk(); if (bl) { bl.style.marginTop = a + 'pt'; bl.style.marginBottom = c + 'pt'; } }),
    lspace: guard(v => { const bl = blk(); if (bl) bl.style.lineHeight = v; else pg().style.lineHeight = v; }),
    indent1: guard(v => { const bl = blk(); if (bl) bl.style.textIndent = v; }),
    cols: guard(n => { pg().style.columnCount = n; pg().style.columnGap = '36px'; }),
    drop: guard(() => { const bl = blk(); if (!bl) return; bl.classList.toggle('wp-dc'); bl.style.setProperty('--x', 1); const on = bl.classList.contains('wp-dc'); bl.innerHTML = on ? bl.innerHTML.replace(/^(\s*)(\S)/, '$1<span style="float:left;font-size:44pt;line-height:.85;padding:2px 6px 0 0;font-weight:600;color:#2b579a">$2</span>') : bl.innerHTML.replace(/<span style="float:left[^>]*>(.)<\/span>/, '$1'); }),
    pageBreak: () => { if (ro()) return say('This document is view-only.'); addPage(); },
    watermark: guard(() => {
      const t = prompt('Watermark text (leave empty to remove):', 'CONFIDENTIAL'); if (t === null) return;
      pages.forEach(p => { p.querySelectorAll('.wp-wm').forEach(x => x.remove()); if (t) p.insertAdjacentHTML('afterbegin', `<div class="wp-wm" contenteditable="false">${esc(t)}</div>`); });
    }),
    pageBorder: guard(() => { const p = pg(); p.style.outline = p.style.outline ? '' : '2px solid #2b579a'; p.style.outlineOffset = '-36px'; }),
    marks: () => { document.body.classList.toggle('wp-marks'); const on = document.body.classList.contains('wp-marks'); pages.forEach(p => p.style.backgroundImage = on ? 'linear-gradient(transparent 95%,rgba(43,87,154,.12) 95%)' : ''); },

    paste: async () => { if (ro()) return; try { ins(esc(await navigator.clipboard.readText()).replace(/\n/g, '<br>')); } catch (e) { say('Press Ctrl+Shift+V to paste.'); } },
    painter: guard(() => {
      const e = el0(), cs = getComputedStyle(e);
      painter = { b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline'), c: cs.color, f: cs.fontFamily.split(',')[0].replace(/"/g, '') };
      document.body.style.cursor = 'copy'; say('Format Painter: now select the text to format.');
    }),
    size: guard(d => {
      const s = getSelection(); if (s.isCollapsed) return;
      const cur = parseFloat(getComputedStyle(el0()).fontSize) * .75;
      const sp = document.createElement('span'); sp.style.fontSize = Math.max(6, Math.min(96, Math.round(cur + d))) + 'pt';
      const r = s.getRangeAt(0); sp.appendChild(r.extractContents()); r.insertNode(sp);
      s.removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(sp); s.addRange(nr);
    }),
    kase: guard(m => {
      const s = getSelection(), t = s.toString(); if (!t) return;
      const f = { upper: x => x.toUpperCase(), lower: x => x.toLowerCase(), title: x => x.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), sentence: x => x.toLowerCase().replace(/(^\s*|[.!?]\s+)(\w)/g, (_, a, c) => a + c.toUpperCase()) }[m];
      document.execCommand('insertText', false, f(t));
    }),
    shade: v => ex('hiliteColor', v),

    newTable: guard(() => {
      const r = +prompt('Rows', 3) || 3, c = +prompt('Columns', 3) || 3;
      let h = '<table style="border-collapse:collapse;width:100%"><tbody>';
      for (let i = 0; i < r; i++) { h += '<tr>'; for (let j = 0; j < c; j++) h += i ? '<td style="border:1px solid #999;padding:6px 10px">&nbsp;</td>' : `<th style="border:1px solid #999;padding:6px 10px;background:#f0f4ff;text-align:left">Header ${j + 1}</th>`; h += '</tr>'; }
      ins(h + '</tbody></table><p><br></p>');
    }),
    tbl: guard(a => {
      const c = cell(); if (!c) return say('Click inside a table cell first.');
      const tr = c.parentNode, t = c.closest('table'), idx = c.cellIndex;
      const mk = () => { const x = document.createElement('td'); x.style.cssText = 'border:1px solid #999;padding:6px 10px'; x.innerHTML = '&nbsp;'; return x; };
      if (a === 'rowUp' || a === 'rowDown') { const n = document.createElement('tr'); for (let i = 0; i < tr.cells.length; i++) n.appendChild(mk()); a === 'rowUp' ? tr.before(n) : tr.after(n); }
      else if (a === 'colL' || a === 'colR') [...t.rows].forEach(r => { const x = mk(); const ref = r.cells[idx]; if (ref) a === 'colL' ? ref.before(x) : ref.after(x); else r.appendChild(x); });
      else if (a === 'delRow') tr.remove();
      else if (a === 'delCol') [...t.rows].forEach(r => r.cells[idx] && r.cells[idx].remove());
      else if (a === 'delTbl') t.remove();
      else if (a === 'merge') { const nx = c.nextElementSibling; if (nx) { c.colSpan = (c.colSpan || 1) + (nx.colSpan || 1); c.innerHTML += ' ' + nx.innerHTML; nx.remove(); } }
      if (t.isConnected && !t.rows.length) t.remove();
    }),
    tstyle: guard(s => {
      const c = cell(); if (!c) return say('Click inside a table first.');
      const t = c.closest('table');
      [...t.rows].forEach((r, i) => [...r.cells].forEach(x => {
        const bd = s === 'Minimal' ? 'none;border-bottom:1px solid #ddd' : '1px solid #999';
        x.style.border = bd.startsWith('none') ? 'none' : bd; if (bd.startsWith('none')) x.style.borderBottom = '1px solid #ddd';
        x.style.background = i === 0 ? (s === 'Blue header' ? '#2b579a' : '#f0f4ff') : (s === 'Striped' && i % 2 ? '#f5f8fd' : '');
        x.style.color = i === 0 && s === 'Blue header' ? '#fff' : '';
      }));
    }),
    shadeCell: guard(v => { const c = cell(); if (c) c.style.background = v; }),
    cellAlign: guard(v => { const c = cell(); if (c) c.style.textAlign = v; }),

    toc: guard(() => {
      const hs = []; pages.forEach((p, i) => p.querySelectorAll('h1,h2,h3').forEach(h => { if (!h.closest('.wp-toc')) hs.push([+h.tagName[1], h.textContent.trim(), i + 1]); }));
      if (!hs.length) return say('Add headings (Styles ▸ Heading 1) first.');
      ins('<div class="wp-toc"><p><b style="font-size:16pt">Contents</b></p>' + hs.map(h => `<p style="margin:2px 0 2px ${(h[0] - 1) * 20}px">${esc(h[1])} <span style="float:right">${h[2]}</span></p>`).join('') + '</div><p><br></p>');
    }),
    footnote: guard(() => {
      const t = prompt('Footnote text:'); if (!t) return;
      const p = pg(); let box = p.querySelector('.wp-fn');
      if (!box) { box = document.createElement('div'); box.className = 'wp-fn'; p.appendChild(box); }
      const n = box.querySelectorAll('p').length + 1;
      ins(`<sup>${n}</sup>`); box.insertAdjacentHTML('beforeend', `<p style="margin:0"><sup>${n}</sup> ${esc(t)}</p>`);
    }),
    bookmark: guard(() => { const n = prompt('Bookmark name:'); if (n) ins(`<span id="bm-${n.replace(/\W+/g, '-')}" title="Bookmark: ${esc(n)}">🔖</span>`); }),
    hf: guard(() => {
      const h = prompt('Header text (empty = none):', ''), f = prompt('Footer text (empty = none):', ''); if (h === null || f === null) return;
      pages.forEach(p => {
        p.querySelectorAll('.wp-hdr,.wp-ftr').forEach(x => x.remove());
        if (h) p.insertAdjacentHTML('afterbegin', `<div class="wp-hdr" contenteditable="true">${esc(h)}</div>`);
        if (f) p.insertAdjacentHTML('beforeend', `<div class="wp-ftr" contenteditable="true">${esc(f)}</div>`);
      });
    }),
    pageNumToggle: guard(() => { const on = css.dataset.nonum !== '1'; css.dataset.nonum = on ? '1' : ''; const s = document.getElementById('wpNoNum') || Object.assign(document.createElement('style'), { id: 'wpNoNum' }); s.textContent = on ? '.page::before{display:none}' : ''; document.head.appendChild(s); say(on ? 'Page numbers hidden.' : 'Page numbers shown.'); }),
    caption: guard(() => { const t = prompt('Caption:'); if (t) ins(`<p style="font-size:10pt;color:#555;text-align:center"><i>${esc(t)}</i></p>`); }),

    date: guard(() => ins(new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }))),
    symbols: guard(() => { const c = prompt('Type or paste a symbol, or choose by number:\n' + SPECIAL.map((s, i) => (i + 1) + ' ' + s).join('   ')); if (!c) return; ins(esc(+c >= 1 && +c <= SPECIAL.length ? SPECIAL[+c - 1] : c)); }),
    textbox: guard(() => ins('<div class="wp-box">Type here…</div><p><br></p>')),
    link: guard(() => {
      const u = prompt('Link address:', 'https://'); if (!u || u === 'https://') return;
      if (getSelection().isCollapsed) ins(`<a href="${esc(u)}" target="_blank">${esc(u)}</a>`); else document.execCommand('createLink', false, u);
    }),

    spell: () => { const on = !(pages[0] && pages[0].spellcheck); pages.forEach(p => p.spellcheck = on); say('Spell check ' + (on ? 'on' : 'off') + '.'); },
    count: () => {
      const t = pages.map(p => p.innerText).join('\n'), w = t.trim() ? t.trim().split(/\s+/).length : 0;
      alert(`Pages: ${pages.length}\nWords: ${w}\nCharacters (with spaces): ${t.length}\nCharacters (no spaces): ${t.replace(/\s/g, '').length}\nParagraphs: ${t.split(/\n+/).filter(x => x.trim()).length}\nReading time: ~${Math.max(1, Math.round(w / 200))} min`);
    },
    comment: guard(() => {
      const s = getSelection(); if (s.isCollapsed) return say('Select text to comment on.');
      const t = prompt('Comment:'); if (!t) return;
      const sp = document.createElement('span'); sp.className = 'wp-comment'; sp.title = '💬 ' + t;
      const r = s.getRangeAt(0); sp.appendChild(r.extractContents()); r.insertNode(sp);
    }),
    delComments: guard(() => pages.forEach(p => p.querySelectorAll('.wp-comment').forEach(c => c.replaceWith(...c.childNodes)))),
    speak: () => {
      const t = getSelection().toString() || pg().innerText;
      speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t));
    },
    print: () => {
      if (!pages.length) return;
      window.print();
    },

    ruler: () => ruler.classList.toggle('hide'),
    multi: () => { multi = !multi; pages.forEach((p, i) => p.style.display = multi || i === currentPage ? 'block' : 'none'); say(multi ? 'Print layout: all pages' : 'Single page view'); },
    focus: () => document.body.classList.toggle('wp-focus')
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* keep multi-page view when pages switch */
  const _sw = window.switchPage;
  window.switchPage = function (i) { _sw(i); if (multi) pages.forEach(p => p.style.display = 'block'); };
  window.addEventListener('beforeprint', () => pages.forEach(p => p.style.display = 'block'));
  window.addEventListener('afterprint', () => { if (!multi) _sw(currentPage); });

  /* ── rename title ── */
  const tt = $('docTitleDisplay');
  tt.style.cursor = 'text'; tt.title = 'Click to rename';
  tt.onclick = () => {
    if (ro()) return;
    const n = prompt('Document name:', tt.textContent.replace(/^—\s*/, '')); if (n && n.trim()) { tt.textContent = '— ' + n.trim(); dirty = true; indicate(); }
  };

  /* ── autosave + unsaved indicator ── */
  const indicate = () => { const d = $('wpDirty'); if (d) d.textContent = dirty ? '● Unsaved' : ''; };
  $('contentArea').addEventListener('input', () => { dirty = true; indicate(); });
  if (typeof window.saveDocument === 'function') {
    const _save = window.saveDocument;
    window.saveDocument = function () { _save.apply(this, arguments); dirty = false; indicate(); };
  }
  setInterval(() => { if (dirty && !ro() && typeof docId !== 'undefined' && docId) { window.saveDocument(); say('Autosaved ☁️'); } }, 60000);
  window.addEventListener('beforeunload', e => { if (dirty && !ro()) { e.preventDefault(); e.returnValue = ''; } });

  /* ── keyboard shortcuts (Word-style) ── */
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || ro() || !pages.some(p => p.contains(document.activeElement))) return;
    const k = e.key.toLowerCase(), map = { e: 'justifyCenter', l: 'justifyLeft', r: 'justifyRight', j: 'justifyFull' };
    if (e.altKey && '123'.includes(k)) { e.preventDefault(); WP.style('h' + k); }
    else if (k === 'p') { e.preventDefault(); WP.print(); }
    else if (k === 'k') { e.preventDefault(); WP.link(); }
    else if (k === ']') { e.preventDefault(); WP.size(2); }
    else if (k === '[') { e.preventDefault(); WP.size(-2); }
    else if (e.shiftKey && k === 'l') { e.preventDefault(); ex('insertUnorderedList'); }
    else if (map[k] && !e.shiftKey) { e.preventDefault(); ex(map[k]); }
    else if (e.shiftKey && k === 'x') { e.preventDefault(); ex('strikeThrough'); }
  });

  if (ro()) document.querySelectorAll('#wpedit button,#wpedit select,#wptable button,#wptable select,#wptable input,#wpref button').forEach(x => x.disabled = true);
  say('Word-style tools loaded.');
})();

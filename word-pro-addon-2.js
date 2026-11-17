/* Pro Document — Editor add-on #2 (Tools + File tabs).
   Add AFTER word-pro-addon.js, as the last script before </body>:
   <script src="word-pro-addon-2.js"></script> */
(function () {
  'use strict';
  if (window.WP2) return;
  const $ = id => document.getElementById(id);
  const ro = () => typeof isReadOnly !== 'undefined' && isReadOnly;
  const pg = () => pages[currentPage];
  const say = m => typeof setStatus === 'function' && setStatus(m);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let saved = null, rec = null, autocorrect = true, outlineT;

  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && pages.some(p => p.contains(s.anchorNode))) saved = s.getRangeAt(0).cloneRange();
    const w = s.toString().trim(), el = $('wp2Sel');
    if (el) el.textContent = w ? `Selected: ${w.split(/\s+/).length} words · ` : '';
  });
  const restore = () => { if (!saved) return; const s = getSelection(); s.removeAllRanges(); s.addRange(saved); };
  const guard = f => (...a) => { if (ro()) return say('This document is view-only.'); restore(); try { return f(...a); } catch (e) { console.warn(e); } };
  const el0 = () => { const n = getSelection().anchorNode; return n && (n.nodeType === 1 ? n : n.parentNode); };
  const wrap = css => { const s = getSelection(); if (s.isCollapsed) return say('Select some text first.'); const r = s.getRangeAt(0), sp = document.createElement('span'); sp.style.cssText = css; sp.appendChild(r.extractContents()); r.insertNode(sp); };
  const dl = (name, data, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const title = () => ($('docTitleDisplay').textContent.replace(/^—\s*/, '').trim() || 'document').replace(/[\\/:*?"<>|]/g, '_');
  const clean = html => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,iframe,object,embed,link,meta,style,form,base').forEach(n => n.remove());
    d.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return d.body.innerHTML;
  };
  const cleanCopy = () => pages.map(p => { const c = p.cloneNode(true); c.querySelectorAll('mark.wp-hit').forEach(m => m.replaceWith(...m.childNodes)); return c; });

  /* ── ribbon ── */
  const b = (ic, l, fn, t) => `<button class="tb-btn" onmousedown="event.preventDefault()" onclick="${fn}" title="${t || l}"><span class="tb-icon">${ic}</span>${l}</button>`;
  const sl = (label, opts, fn, w) => `<select class="tb-select" style="width:${w || 120}px" onchange="${fn}(this.value);this.selectedIndex=0"><option value="">${label}</option>${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
  function addTab(id, label, groups) {
    const t = document.createElement('button'); t.className = 'tab-btn'; t.dataset.tab = id; t.textContent = label; t.onclick = () => switchTab(id);
    document.querySelector('.ribbon-tabs').appendChild(t);
    const d = document.createElement('div'); d.id = id; d.className = 'ribbon-toolbar';
    d.innerHTML = groups.map(g => `<div class="ribbon-group"><div class="ribbon-group-row">${g[1]}</div>${g[2] ? `<div class="ribbon-group-row">${g[2]}</div>` : ''}<div class="ribbon-group-label">${g[0]}</div></div>`).join('');
    document.querySelector('.find-bar').before(d);
  }
  addTab('wp2tools', 'Tools', [
    ['Navigate', b('🧭', 'Outline', 'WP2.outline()') + b('🔎', 'Highlight All', 'WP2.hitAll()') + b('🧼', 'Clear', 'WP2.hitClear()')],
    ['Text effects', sl('Effects', [['shadow', 'Shadow'], ['caps', 'Small caps'], ['strong', 'Bold + caps'], ['clear', 'Clear effects']], 'WP2.effect', 100) + sl('Letter spacing', [['0', 'Normal'], ['1px', 'Wide'], ['3px', 'Wider'], ['-0.5px', 'Tight']], 'WP2.spacing', 110),
      sl('List style', [['disc', '• Disc'], ['circle', '○ Circle'], ['square', '■ Square'], ['decimal', '1. 2. 3.'], ['lower-alpha', 'a. b. c.'], ['upper-roman', 'I. II. III.']], 'WP2.listStyle', 100) + b('☑', 'Checklist', 'WP2.checklist()')],
    ['Image', b('⟳', 'Rotate', 'WP2.img("rot")') + b('⇋', 'Flip', 'WP2.img("flip")') + b('🔲', 'Border', 'WP2.img("border")'), sl('Filter', [['none', 'None'], ['grayscale(1)', 'Grayscale'], ['sepia(.8)', 'Sepia'], ['brightness(1.3)', 'Brighter'], ['blur(2px)', 'Blur']], 'WP2.imgFilter', 90) + sl('Opacity', [['1', '100%'], ['.75', '75%'], ['.5', '50%'], ['.25', '25%']], 'WP2.imgOpacity', 80)],
    ['Arrange', b('⬆', 'Bring Front', 'WP2.img("front")') + b('⬇', 'Send Back', 'WP2.img("back")') + b('♿', 'Alt Text', 'WP2.img("alt")')],
    ['Productivity', b('✍', 'Signature', 'WP2.sign()') + b('🎤', 'Dictate', 'WP2.dictate()') + b('⚡', 'Autocorrect', 'WP2.toggleAuto()') + b('↔', 'Fit Width', 'WP2.fit()')],
    ['Templates', sl('Insert template', [['invoice', 'Invoice'], ['minutes', 'Meeting minutes'], ['cover', 'Cover letter'], ['plan', 'Project plan']], 'WP2.template', 130)]
  ]);
  addTab('wp2file', 'File', [
    ['Export', b('📝', 'Word (.doc)', 'WP2.exp("doc")') + b('🌐', 'HTML', 'WP2.exp("html")') + b('Ⓜ', 'Markdown', 'WP2.exp("md")') + b('🗒', 'Text', 'WP2.exp("txt")')],
    ['Backup', b('💾', 'JSON Backup', 'WP2.exp("json")') + b('🖨', 'Print', 'window.print()')],
    ['Import', b('📂', 'Import File', 'WP2.imp()', 'Word .docx, .html, .md, .txt, JSON backup')]
  ]);

  /* ── status bar selection counter ── */
  const sbr = document.querySelector('.status-bar-right'), cnt = document.createElement('span'); cnt.id = 'wp2Sel'; sbr.prepend(cnt);

  /* ── outline pane in the left sidebar ── */
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
    switchPage(r[2]); const h = pages[r[2]].querySelectorAll('h1,h2,h3');
    const t = [...h].filter(x => !x.closest('.wp-toc'))[r[3]]; if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  $('contentArea').addEventListener('input', () => { clearTimeout(outlineT); outlineT = setTimeout(buildOutline, 400); });
  setTimeout(buildOutline, 1500); setInterval(buildOutline, 10000);

  /* ── markdown-style autocorrect ── */
  $('contentArea').addEventListener('input', e => {
    if (!autocorrect || ro() || e.inputType !== 'insertText' || e.data !== ' ') return;
    const s = getSelection(), n = s.anchorNode; if (!n || n.nodeType !== 3) return;
    const before = n.data.slice(0, s.anchorOffset - 1), blockText = (n.parentNode.closest('p,div,li,h1,h2,h3') || n.parentNode).textContent;
    const cut = len => { const r = document.createRange(); r.setStart(n, s.anchorOffset - 1 - len); r.setEnd(n, s.anchorOffset); s.removeAllRanges(); s.addRange(r); };
    let m;
    if ((m = before.match(/^(#{1,3})$/)) && blockText.trim() === m[1]) { cut(m[1].length); document.execCommand('delete'); document.execCommand('formatBlock', false, 'h' + m[1].length); return; }
    if (/^[-*]$/.test(before) && blockText.trim() === before) { cut(1); document.execCommand('delete'); document.execCommand('insertUnorderedList'); return; }
    if (/^1\.$/.test(before) && blockText.trim() === before) { cut(2); document.execCommand('delete'); document.execCommand('insertOrderedList'); return; }
    const rep = { '(c)': '©', '(r)': '®', '(tm)': '™', '--': '—', '...': '…', '->': '→', '<-': '←', '1/2': '½', '1/4': '¼' };
    for (const k in rep) if (before.endsWith(k)) { cut(k.length); document.execCommand('insertText', false, rep[k] + ' '); return; }
  });

  /* ── checklist toggle persistence ── */
  $('contentArea').addEventListener('change', e => {
    const c = e.target; if (c.type !== 'checkbox') return;
    c.checked ? c.setAttribute('checked', '') : c.removeAttribute('checked');
    if (c.parentNode) c.parentNode.style.textDecoration = c.checked ? 'line-through' : '', c.parentNode.style.opacity = c.checked ? .6 : '';
  });

  /* ── Ctrl+wheel zoom ── */
  $('contentArea').addEventListener('wheel', e => {
    if (!e.ctrlKey) return; e.preventDefault();
    currentZoom = Math.max(.4, Math.min(2, currentZoom * (e.deltaY < 0 ? 1.05 : .95)));
    $('contentArea').style.zoom = currentZoom; $('zoomLabel').textContent = Math.round(currentZoom * 100) + '%';
    const z = $('wpZoom'); if (z) z.value = Math.round(currentZoom * 100);
  }, { passive: false });

  /* ── clear find highlights before every save ── */
  if (typeof window.saveDocument === 'function') {
    const _s = window.saveDocument;
    window.saveDocument = function () { WP2.hitClear(); return _s.apply(this, arguments); };
  }

  const TPL = {
    invoice: '<h1 style="color:#2b579a">INVOICE</h1><p>Invoice no: <b>[0001]</b> &nbsp; Date: [date]<br>Bill to: [Client name, address]</p><table style="border-collapse:collapse;width:100%"><tr><th style="border:1px solid #999;padding:6px;background:#f0f4ff;text-align:left">Item</th><th style="border:1px solid #999;padding:6px;background:#f0f4ff">Qty</th><th style="border:1px solid #999;padding:6px;background:#f0f4ff">Rate</th><th style="border:1px solid #999;padding:6px;background:#f0f4ff">Amount</th></tr><tr><td style="border:1px solid #999;padding:6px">&nbsp;</td><td style="border:1px solid #999;padding:6px">&nbsp;</td><td style="border:1px solid #999;padding:6px">&nbsp;</td><td style="border:1px solid #999;padding:6px">&nbsp;</td></tr></table><p style="text-align:right"><b>Total: ₹ [amount]</b></p><p>Payment terms: [e.g. due in 15 days]</p>',
    minutes: '<h1>Meeting Minutes</h1><p><b>Date:</b> [date] &nbsp; <b>Venue:</b> [place]</p><h2>Attendees</h2><ul><li>[Name]</li></ul><h2>Agenda</h2><ol><li>[Item]</li></ol><h2>Decisions</h2><ul><li>[Decision]</li></ul><h2>Action items</h2><ul style="list-style:none"><li><input type="checkbox"> [Task] — [Owner] — [Due]</li></ul>',
    cover: '<p>[Your name]<br>[Address] · [Phone] · [Email]</p><p>[Date]</p><p>[Hiring manager]<br>[Company]</p><p>Dear [Name],</p><p>I am writing to apply for the [position] role at [company]. [One sentence on your strongest relevant achievement.]</p><p>[Two or three sentences on skills and why this company.]</p><p>Thank you for your time. I would welcome the chance to discuss my application.</p><p>Sincerely,<br>[Your name]</p>',
    plan: '<h1>Project Plan</h1><p><b>Owner:</b> [name] &nbsp; <b>Start:</b> [date] &nbsp; <b>End:</b> [date]</p><h2>Goals</h2><ul><li>[Goal]</li></ul><h2>Milestones</h2><table style="border-collapse:collapse;width:100%"><tr><th style="border:1px solid #999;padding:6px;background:#f0f4ff;text-align:left">Milestone</th><th style="border:1px solid #999;padding:6px;background:#f0f4ff">Owner</th><th style="border:1px solid #999;padding:6px;background:#f0f4ff">Due</th><th style="border:1px solid #999;padding:6px;background:#f0f4ff">Status</th></tr><tr><td style="border:1px solid #999;padding:6px">&nbsp;</td><td style="border:1px solid #999;padding:6px">&nbsp;</td><td style="border:1px solid #999;padding:6px">&nbsp;</td><td style="border:1px solid #999;padding:6px">&nbsp;</td></tr></table><h2>Risks</h2><ul><li>[Risk and mitigation]</li></ul>'
  };
  const toMd = n => {
    if (n.nodeType === 3) return n.data; if (n.nodeType !== 1) return '';
    const t = n.tagName, c = () => [...n.childNodes].map(toMd).join('');
    if (t === 'TABLE') return '\n' + [...n.rows].map((r, i) => '| ' + [...r.cells].map(x => x.textContent.trim()).join(' | ') + ' |' + (i === 0 ? '\n|' + [...r.cells].map(() => ' --- |').join('') : '')).join('\n') + '\n\n';
    return ({ H1: () => '\n# ' + c() + '\n\n', H2: () => '\n## ' + c() + '\n\n', H3: () => '\n### ' + c() + '\n\n', P: () => c() + '\n\n', DIV: () => c() + '\n', BR: () => '\n', B: () => '**' + c() + '**', STRONG: () => '**' + c() + '**', I: () => '*' + c() + '*', EM: () => '*' + c() + '*', LI: () => '- ' + c() + '\n', UL: () => c() + '\n', OL: () => c() + '\n', A: () => `[${c()}](${n.getAttribute('href') || ''})`, BLOCKQUOTE: () => '> ' + c() + '\n\n', HR: () => '\n---\n', IMG: () => '' }[t] || c)();
  };

  /* ── public API ── */
  const WP2 = window.WP2 = {
    outline: () => { const p = $('pagesPanel'); p.style.display = ''; buildOutline(); say('Outline updated.'); },
    hitAll() {
      const q = prompt('Highlight all matches of:'); if (!q) return; WP2.hitClear();
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); let n = 0;
      pages.forEach(p => {
        const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), list = []; while (w.nextNode()) { if (!w.currentNode.parentNode.closest('mark,.wp-math,.lai-math')) list.push(w.currentNode); }
        list.forEach(t => { if (!re.test(t.data)) return; re.lastIndex = 0; const f = document.createDocumentFragment(); let last = 0, m; while ((m = re.exec(t.data))) { f.append(t.data.slice(last, m.index)); const k = document.createElement('mark'); k.className = 'wp-hit'; k.style.background = '#ffe066'; k.textContent = m[0]; f.append(k); last = m.index + m[0].length; n++; } f.append(t.data.slice(last)); t.replaceWith(f); });
      });
      say(n + ' match' + (n === 1 ? '' : 'es') + ' highlighted.');
    },
    hitClear() { pages.forEach(p => p.querySelectorAll('mark.wp-hit').forEach(m => { m.replaceWith(document.createTextNode(m.textContent)); p.normalize(); })); },
    effect: guard(v => ({ shadow: () => wrap('text-shadow:1px 1px 3px rgba(0,0,0,.35)'), caps: () => wrap('font-variant:small-caps'), strong: () => wrap('font-weight:700;text-transform:uppercase;letter-spacing:1px'), clear: () => document.execCommand('removeFormat') }[v])()),
    spacing: guard(v => wrap('letter-spacing:' + v)),
    listStyle: guard(v => {
      let l = el0().closest('ul,ol');
      if (!l) { document.execCommand(/decimal|alpha|roman/.test(v) ? 'insertOrderedList' : 'insertUnorderedList'); l = el0().closest('ul,ol'); }
      if (l) l.style.listStyleType = v;
    }),
    checklist: guard(() => document.execCommand('insertHTML', false, '<ul style="list-style:none;padding-left:4px"><li><input type="checkbox"> Task</li></ul>')),
    img(a) {
      if (ro()) return say('This document is view-only.');
      const i = typeof selectedImage !== 'undefined' && selectedImage; if (!i || !i.isConnected) return say('Click an image first.');
      if (a === 'rot') i.style.rotate = ((parseFloat(i.style.rotate) || 0) + 90) % 360 + 'deg';
      else if (a === 'flip') i.style.scale = i.style.scale === '-1 1' ? '' : '-1 1';
      else if (a === 'border') i.style.border = i.style.border ? '' : '2px solid #2b579a';
      else if (a === 'front') i.style.zIndex = 50;
      else if (a === 'back') i.style.zIndex = 0;
      else if (a === 'alt') { const t = prompt('Alt text for screen readers:', i.alt || ''); if (t !== null) i.alt = t; }
      if (typeof positionAllHandles === 'function') positionAllHandles();
    },
    imgFilter(v) { const i = typeof selectedImage !== 'undefined' && selectedImage; if (!ro() && i) i.style.filter = v === 'none' ? '' : v; },
    imgOpacity(v) { const i = typeof selectedImage !== 'undefined' && selectedImage; if (!ro() && i) i.style.opacity = v; },
    sign: guard(() => {
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center';
      o.innerHTML = '<div style="background:#fff;border-radius:10px;padding:16px;width:440px;max-width:94vw"><b>Draw your signature</b><canvas width="408" height="160" style="border:1px dashed #999;border-radius:6px;margin:10px 0;touch-action:none;width:100%;background:#fff"></canvas><div style="display:flex;gap:8px;justify-content:flex-end"><button class="graph-btn" data-a="c">Clear</button><button data-a="x">Cancel</button><button data-a="i" style="background:#2b579a;color:#fff;border:none;border-radius:4px;padding:5px 12px">Insert</button></div></div>';
      document.body.appendChild(o);
      const cv = o.querySelector('canvas'), cx = cv.getContext('2d'); let d = false;
      cx.lineWidth = 2.5; cx.lineCap = 'round'; cx.strokeStyle = '#102a5c';
      const pt = e => { const r = cv.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [(t.clientX - r.left) * cv.width / r.width, (t.clientY - r.top) * cv.height / r.height]; };
      const down = e => { d = true; cx.beginPath(); cx.moveTo(...pt(e)); e.preventDefault(); }, move = e => { if (d) { cx.lineTo(...pt(e)); cx.stroke(); e.preventDefault(); } };
      cv.onpointerdown = down; cv.onpointermove = move; window.addEventListener('pointerup', () => d = false, { once: false });
      o.onclick = e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'c') cx.clearRect(0, 0, cv.width, cv.height);
        else { if (a === 'i') insertDraggableImage(cv.toDataURL('image/png'), 180); o.remove(); }
      };
    }),
    dictate() {
      if (ro()) return say('This document is view-only.');
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return say('Dictation is not supported in this browser (try Chrome or Edge).');
      if (rec) { rec.stop(); rec = null; return say('Dictation stopped.'); }
      rec = new SR(); rec.continuous = true; rec.interimResults = false; rec.lang = navigator.language || 'en-IN';
      rec.onresult = e => { restore(); for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) document.execCommand('insertText', false, e.results[i][0].transcript + ' '); };
      rec.onend = () => { if (rec) rec = null; }; rec.start(); say('🎤 Listening… click Dictate again to stop.');
    },
    toggleAuto() { autocorrect = !autocorrect; say('Autocorrect ' + (autocorrect ? 'on (# heading, - list, (c) → ©)' : 'off') + '.'); },
    fit() { currentZoom = Math.max(.4, Math.min(2, ($('contentArea').clientWidth - 60) / 816)); $('contentArea').style.zoom = currentZoom; $('zoomLabel').textContent = Math.round(currentZoom * 100) + '%'; const z = $('wpZoom'); if (z) z.value = Math.round(currentZoom * 100); },
    template: guard(k => document.execCommand('insertHTML', false, TPL[k] + '<p><br></p>')),
    exp(f) {
      const cp = cleanCopy(), name = title();
      if (f === 'txt') dl(name + '.txt', pages.map(p => p.innerText).join('\n\n--- page break ---\n\n'), 'text/plain');
      else if (f === 'md') dl(name + '.md', cp.map(p => toMd(p)).join('\n\n---\n\n').replace(/\n{3,}/g, '\n\n').trim(), 'text/markdown');
      else if (f === 'json') dl(name + '.pdoc.json', JSON.stringify({ title: name, pages: cp.map(p => p.innerHTML), versions: typeof versions !== 'undefined' ? versions : [], exported: new Date().toISOString() }), 'application/json');
      else {
        const body = cp.map(p => { p.querySelectorAll('img.draggable').forEach(i => { i.style.position = 'static'; i.style.transform = ''; }); return `<div style="page-break-after:always;font-family:${p.style.fontFamily || 'Calibri'};line-height:${p.style.lineHeight || 1.5}">${p.innerHTML}</div>`; }).join('');
        const head = `<meta charset="utf-8"><title>${esc(name)}</title>`;
        if (f === 'html') dl(name + '.html', `<!DOCTYPE html><html><head>${head}<style>body{max-width:816px;margin:40px auto;font-family:Calibri,sans-serif}table{border-collapse:collapse}</style></head><body>${body}</body></html>`, 'text/html');
        else dl(name + '.doc', `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head>${head}</head><body>${body}</body></html>`, 'application/msword');
      }
      say('Exported ' + f.toUpperCase() + '.');
    },
    imp() {
      if (ro()) return say('This document is view-only.');
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.docx,.html,.htm,.md,.txt,.json';
      i.onchange = async () => {
        const f = i.files[0]; if (!f) return; const ext = f.name.split('.').pop().toLowerCase(); let html = '';
        try {
          if (ext === 'docx') {
            if (!window.mammoth) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the .docx reader')); document.head.appendChild(s); });
            html = clean((await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() })).value);
          } else if (ext === 'json') {
            const j = JSON.parse(await f.text()); if (!Array.isArray(j.pages)) throw new Error('Not a Pro Document backup');
            if (!confirm('Add the ' + j.pages.length + ' page(s) from this backup as new pages?')) return;
            j.pages.forEach(h => addPage(clean(h))); return say('Backup imported.');
          } else {
            const t = await f.text();
            html = ext === 'html' || ext === 'htm' ? clean(t) : t.split(/\n/).map(l => { const m = l.match(/^(#{1,3})\s+(.*)/); return m ? `<h${m[1].length}>${esc(m[2])}</h${m[1].length}>` : l.trim() ? `<p>${esc(l.replace(/^[-*]\s+/, '• '))}</p>` : ''; }).join('');
          }
          addPage(html); say('Imported ' + f.name + ' as a new page.');
        } catch (e) { console.warn(e); say('Import failed: ' + (e.message || 'unknown error')); }
      };
      i.click();
    }
  };
  say('Tools & File tabs loaded.');
})();

/* fillts HR — 기본안내: 회사 기본 소개 + 기본 서류(사업자등록증 등). 서류는 파일 직접 업로드 또는 Google Drive 링크.
   소개·서류는 로그인한 구성원만 열람(hr_about · hr_about_docs · hr_about_files), 편집은 관리자. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var MAX_BYTES = 700 * 1024;   // Firestore 문서 1MiB 한도 (base64 팽창 감안)
  var TYPES = { 'application/pdf': 'PDF', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WEBP' };
  var editing = false, mode = 'file';

  function size(n) { return n < 1024 ? n + 'B' : n < 1048576 ? Math.round(n / 1024) + 'KB' : (n / 1048576).toFixed(1) + 'MB'; }
  function toB64(buf) {
    var bytes = new Uint8Array(buf), bin = '', step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(bin);
  }
  function fromB64(b64) { var bin = atob(b64), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function pairs(info) { return (info.items || []).map(function (x) { return Array.isArray(x) ? x : [x.k, x.v]; }); }
  function isDrive(u) { return /^https:\/\/(drive|docs)\.google\.com\//.test(u); }

  function openDoc(d) {
    if (d.kind === 'link') {
      // 팝업 창으로 Google Drive 열기 (모바일은 새 탭)
      var w = window.open(d.url, 'fillts_drive', 'popup=yes,width=1100,height=820,noopener=no');
      if (w) { try { w.opener = null; } catch (e) { /* 무시 */ } } else location.href = d.url;
      return;
    }
    var w2 = window.open('', '_blank');
    db.doc('hr_about_files/' + d.id).get().then(function (s) {
      if (!s.exists) throw { user: '파일을 찾을 수 없습니다.' };
      var f = s.data(), url = URL.createObjectURL(new Blob([fromB64(f.data)], { type: f.type || 'application/pdf' }));
      if (w2) w2.location.href = url; else location.href = url;
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (x) { if (w2) w2.close(); x && x.user ? ui.toast(x.user) : ui.fail(x); });
  }

  function editForm(info) {
    var intro = h('textarea', { rows: '8', maxlength: '4000', placeholder: '회사 소개, 비전, 브랜드, 근무 장소·출입 안내 등' });
    intro.value = info.intro || '';
    var items = h('textarea', { rows: '6', maxlength: '2000', placeholder: '한 줄에 하나씩  예) 설립일: 2024-12-02' });
    items.value = pairs(info).map(function (x) { return x[0] + ': ' + x[1]; }).join('\n');
    var m = ui.msg();
    var f = h('form', { class: 'panel' }, ui.label('Edit · 관리자'), ui.field('회사 소개', intro), ui.field('추가 항목 (라벨: 값)', items),
      h('p', { class: 'muted small', text: '회사명·대표자·사업자등록번호·주소는 설정 › 회사 기준 값을 그대로 보여 줍니다.' }), m,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'submit', text: '저장' }), ui.btn('취소', function () { editing = false; HR.refresh(); }, 'btn-line btn-sm')));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var list = items.value.split('\n').map(function (l) { var i = l.indexOf(':'); return i > 0 ? { k: l.slice(0, i).trim(), v: l.slice(i + 1).trim() } : null; }).filter(function (x) { return x && x.k && x.v; }).slice(0, 30);   // Firestore는 배열 안 배열 불가 → {k, v}
      db.doc('hr_about/main').set({ intro: intro.value.trim(), items: list, updatedAt: FV.serverTimestamp(), by: S.mid })
        .then(function () { editing = false; HR.invalidate('hr_about'); ui.toast('저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    });
    return f;
  }

  function addDoc() {
    var title = ui.input({ maxlength: '80', placeholder: '예: 사업자등록증, 법인등기부등본, 통장사본' });
    var tabs = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '등록 방식' });
    [['file', '파일 직접 업로드'], ['link', 'Google Drive 링크']].forEach(function (x) {
      tabs.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(mode === x[0]), class: mode === x[0] ? 'on' : '', text: x[1], onclick: function () { mode = x[0]; HR.refresh(); } }));
    });
    var file = h('input', { type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp' });
    var url = ui.input({ type: 'url', placeholder: 'https://drive.google.com/file/d/… (회사 계정 공유 링크)' });
    var m = ui.msg(), go = h('button', { class: 'btn btn-sm', type: 'submit', text: '등록' });
    var f = h('form', { class: 'panel' }, ui.label('Add document · 관리자'), ui.field('서류 이름', title), tabs,
      mode === 'file' ? ui.field('파일 (PDF·이미지, 700KB 이하)', file) : ui.field('Google Drive 링크', url), m, go,
      h('p', { class: 'muted small', text: mode === 'file' ? '파일은 로그인한 구성원만 열 수 있습니다. 700KB가 넘는 파일은 Google Drive에 올리고 링크로 등록하세요.'
        : 'Drive 파일의 공유 범위를 「(주)필츠 내 링크가 있는 모든 사용자」로 두면 구성원이 바로 열 수 있습니다. 누르면 팝업 창으로 열립니다.' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = title.value.trim();
      if (!t) return ui.err(m, '서류 이름을 입력하세요.');
      var ref = db.collection('hr_about_docs').doc(), base = { title: t, by: S.mid, at: FV.serverTimestamp(), order: Date.now() };
      if (mode === 'link') {
        var u = url.value.trim();
        if (!isDrive(u)) return ui.err(m, 'https://drive.google.com 또는 https://docs.google.com 링크만 등록할 수 있습니다.');
        go.disabled = true;
        return ref.set(Object.assign(base, { kind: 'link', url: u })).then(function () { HR.invalidate('hr_about_docs'); ui.toast('등록했습니다.'); }).catch(function (x) { go.disabled = false; ui.fail(x, m); });
      }
      var fl = file.files[0];
      if (!fl) return ui.err(m, '파일을 고르세요.');
      if (!TYPES[fl.type]) return ui.err(m, 'PDF 또는 이미지(PNG·JPG·WEBP) 파일만 올릴 수 있습니다.');
      if (fl.size > MAX_BYTES) return ui.err(m, '파일이 ' + size(fl.size) + '입니다. 700KB 이하만 올릴 수 있습니다 — Google Drive 링크로 등록하세요.');
      go.disabled = true; m.textContent = '올리는 중…';
      fl.arrayBuffer().then(function (buf) {
        var b = db.batch();
        b.set(ref, Object.assign(base, { kind: 'file', fileName: fl.name.slice(0, 120), size: fl.size, type: fl.type }));
        b.set(db.doc('hr_about_files/' + ref.id), { data: toB64(buf), type: fl.type });
        return b.commit();
      }).then(function () { HR.invalidate('hr_about_docs'); ui.toast('등록했습니다.'); }).catch(function (x) { go.disabled = false; ui.fail(x, m); });
    });
    return f;
  }

  // 기본 링크 (바로가기): 이름 · 설명 · 주소 — 구성원 열람, 관리자 등록 · 「편집」에서 순서·내용 수정
  var linkOpen = false, linkDraft = null;   // linkDraft: 편집 중 사본 (다시 그려도 유지)
  function linkEditor(links) {
    if (!linkDraft) linkDraft = links.map(function (l) { return { id: l.id, title: l.title, desc: l.desc || '', url: l.url, del: false }; });
    var m = ui.msg(), list = h('ol', { class: 'link-edit' });
    linkDraft.forEach(function (d, i) {
      var move = function (k) { return function () { var j = i + k; if (j < 0 || j >= linkDraft.length) return; var t = linkDraft[i]; linkDraft[i] = linkDraft[j]; linkDraft[j] = t; HR.refresh(); }; };
      var bind = function (k) { return function () { d[k] = this.value; }; };
      list.appendChild(h('li', { class: d.del ? 'is-del' : '' },
        h('div', { class: 'link-edit-order' }, h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↑', 'aria-label': '위로', disabled: i === 0, onclick: move(-1) }),
          h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↓', 'aria-label': '아래로', disabled: i === linkDraft.length - 1, onclick: move(1) })),
        h('div', { class: 'link-edit-fields' },
          h('input', { type: 'text', value: d.title, maxlength: '40', 'aria-label': '이름', oninput: bind('title') }),
          h('input', { type: 'text', value: d.desc, maxlength: '80', placeholder: '설명', 'aria-label': '설명', oninput: bind('desc') }),
          h('input', { type: 'url', value: d.url, 'aria-label': '주소', oninput: bind('url') })),
        h('button', { type: 'button', class: 'btn btn-line btn-xs' + (d.del ? '' : ' danger'), text: d.del ? '되살리기' : '삭제', onclick: function () { d.del = !d.del; HR.refresh(); } })));
    });
    var save = ui.btn('저장', function () {
      var keep = linkDraft.filter(function (d) { return !d.del; });
      for (var k = 0; k < keep.length; k++) {
        if (!keep[k].title.trim()) return ui.err(m, (k + 1) + '번째 링크의 이름을 입력하세요.');
        if (!/^https:\/\/[^\s]+$/.test(keep[k].url.trim())) return ui.err(m, (k + 1) + '번째 링크 주소는 https:// 로 시작해야 합니다.');
      }
      var b = db.batch();
      linkDraft.forEach(function (d) { if (d.del) b.delete(db.doc('hr_about_links/' + d.id)); });
      keep.forEach(function (d, n) { b.update(db.doc('hr_about_links/' + d.id), { title: d.title.trim(), desc: d.desc.trim(), url: d.url.trim(), order: n + 1 }); });
      b.commit().then(function () { linkDraft = null; HR.invalidate('hr_about_links'); ui.toast('기본 링크를 저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    }, 'btn-sm');
    return h('div', { class: 'stack' }, h('p', { class: 'muted small', text: '↑ ↓로 순서를 바꾸고 이름·설명·주소를 고친 뒤 저장하세요. 위에 있을수록 먼저 보입니다.' }), list, m,
      h('div', { class: 'row' }, save, ui.btn('취소', function () { linkDraft = null; HR.refresh(); }, 'btn-line btn-sm')));
  }
  function linksPanel() {
    var links = (HR.load('hr_about_links', function () { return db.collection('hr_about_links').get().then(HR.rows); }) || [])
      .slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var head = S.isAdmin && links.length && !linkDraft ? ui.btn('기본링크 편집', function () { linkOpen = false; linkDraft = null; linkDraft = links.map(function (l) { return { id: l.id, title: l.title, desc: l.desc || '', url: l.url, del: false }; }); HR.refresh(); }, 'btn-line btn-xs') : null;
    if (S.isAdmin && linkDraft) return ui.panel('Links · 기본 링크 편집', null, linkEditor(links));
    var grid = h('div', { class: 'link-grid' });
    links.forEach(function (l) {
      grid.appendChild(h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', class: 'link-card link-main' },
        h('span', { class: 'link-title', text: l.title + ' ↗' }), l.desc ? h('span', { class: 'meta', text: l.desc }) : null,
        h('span', { class: 'link-host', text: (l.url.match(/^https?:\/\/([^\/]+)/) || [])[1] || '' })));
    });
    if (!links.length) grid.appendChild(h('p', { class: 'empty', text: S.isAdmin ? '자주 쓰는 사이트를 등록하세요. 예: 회사 Google Drive · 브랜드 가이드 · 자사몰 관리자 · 모두싸인 · 회사 캘린더' : '등록된 링크가 없습니다.' }));
    var form = null;
    if (S.isAdmin) {
      if (!linkOpen) form = ui.btn('+ 링크 추가', function () { linkOpen = true; HR.refresh(); }, 'btn-line btn-sm');
      else {
        var title = ui.input({ maxlength: '40', placeholder: '예: 회사 Google Drive' }), desc = ui.input({ maxlength: '80', placeholder: '예: 브랜드 자료 · 계약서 원본 폴더' });
        var url = ui.input({ type: 'url', placeholder: 'https://…' }), m = ui.msg();
        form = h('form', { class: 'link-form' }, h('div', { class: 'row' }, ui.field('이름', title), ui.field('주소', url)), ui.field('설명', desc), m,
          h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'submit', text: '등록' }), ui.btn('취소', function () { linkOpen = false; HR.refresh(); }, 'btn-line btn-sm')));
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!title.value.trim()) return ui.err(m, '이름을 입력하세요.');
          if (!/^https:\/\/[^\s]+$/.test(url.value.trim())) return ui.err(m, 'https:// 로 시작하는 주소를 입력하세요.');
          var last = links.length ? (links[links.length - 1].order || 0) : 0;
          db.collection('hr_about_links').add({ title: title.value.trim(), desc: desc.value.trim(), url: url.value.trim(), order: last + 1, by: S.mid, at: FV.serverTimestamp() })
            .then(function () { linkOpen = false; HR.invalidate('hr_about_links'); ui.toast('링크를 추가했습니다.'); }).catch(function (x) { ui.fail(x, m); });
        });
      }
    }
    return ui.panel('Links · 기본 링크', head, grid, form);
  }

  var ABOUT_TABS = [['', '기본안내'], ['onboarding', '온보딩 가이드'], ['qa', '필츠 Q&A']];
  function render(view, parts) {
    var sub = ['qa', 'onboarding'].indexOf((parts || [])[0]) >= 0 ? parts[0] : '';
    if (sub === 'onboarding') { ui.put(view, ui.head('About', '기본안내'), ui.tabs(ABOUT_TABS, sub, 'about')); return HR.onboard.render(view); }
    if (sub === 'qa') { ui.put(view, ui.head('About', '기본안내'), ui.tabs(ABOUT_TABS, sub, 'about')); return HR.qa.render(view); }
    var info = HR.load('hr_about', function () { return db.doc('hr_about/main').get().then(function (s) { return s.exists ? s.data() : {}; }); }) || {};
    var docs = HR.load('hr_about_docs', function () { return db.collection('hr_about_docs').get().then(HR.rows); }) || [];
    var c = S.cfg;
    var rows = [['회사명', c.companyName], ['대표자', c.ceoName], ['사업자등록번호', c.bizNo], ['주소', c.companyAddress]].filter(function (x) { return x[1]; }).concat(pairs(info));
    ui.put(view, ui.head('About', '기본안내', S.isAdmin && !editing ? ui.btn('소개 편집', function () { editing = true; HR.refresh(); }, 'btn-line btn-sm') : null), ui.tabs(ABOUT_TABS, sub, 'about'));
    if (editing && S.isAdmin) ui.put(view, editForm(info));
    var dl = h('ul', { class: 'list' });
    docs.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function (d) {
      dl.appendChild(h('li', null,
        h('div', { class: 'grow' }, h('div', null, ui.tag(d.kind === 'link' ? 'Google Drive' : (TYPES[d.type] || '파일'), d.kind === 'link' ? 'ok' : 'mute'), ' ', d.title),
          h('div', { class: 'meta', text: (d.kind === 'file' ? d.fileName + ' · ' + size(d.size || 0) + ' · ' : '') + fmt.ts(d.at) })),
        ui.btn('열기', function () { openDoc(d); }, 'btn-line btn-xs'),
        S.isAdmin ? ui.confirmBtn('삭제', function () {
          var b = db.batch(); b.delete(db.doc('hr_about_docs/' + d.id)); if (d.kind === 'file') b.delete(db.doc('hr_about_files/' + d.id));
          b.commit().then(function () { HR.invalidate('hr_about_docs'); }).catch(ui.fail);
        }) : null));
    });
    if (!dl.children.length) dl.appendChild(h('li', { class: 'empty', text: S.isAdmin ? '등록된 서류가 없습니다. 추천: 사업자등록증 · 법인 등기사항전부증명서 · 법인 통장 사본 · 4대보험 사업장 가입자명부 · 취업규칙 · 회사 로고(CI)' : '등록된 서류가 없습니다.' }));
    ui.put(view, h('div', { class: 'two-col about-grid' },
      ui.panel('Company · 회사 소개', null,
        info.intro ? h('div', { class: 'about-intro', text: info.intro }) : h('p', { class: 'empty', text: S.isAdmin ? '「소개 편집」으로 회사 소개를 작성하세요.' : '아직 회사 소개가 없습니다.' }),
        rows.length ? ui.kv(rows, 'kv wide') : null),
      h('div', { class: 'stack' }, linksPanel(), ui.panel('Documents · 기본 서류', null, dl), S.isAdmin ? addDoc() : null)));
  }

  HR.register('about', { render: render });
})();

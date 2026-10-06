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
    items.value = (info.items || []).map(function (x) { return x[0] + ': ' + x[1]; }).join('\n');
    var m = ui.msg();
    var f = h('form', { class: 'panel' }, ui.label('Edit · 관리자'), ui.field('회사 소개', intro), ui.field('추가 항목 (라벨: 값)', items),
      h('p', { class: 'muted small', text: '회사명·대표자·사업자등록번호·주소는 설정 › 회사 기준 값을 그대로 보여 줍니다.' }), m,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'submit', text: '저장' }), ui.btn('취소', function () { editing = false; HR.refresh(); }, 'btn-line btn-sm')));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var list = items.value.split('\n').map(function (l) { var i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(function (x) { return x && x[0] && x[1]; }).slice(0, 30);
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

  function render(view) {
    var info = HR.load('hr_about', function () { return db.doc('hr_about/main').get().then(function (s) { return s.exists ? s.data() : {}; }); }) || {};
    var docs = HR.load('hr_about_docs', function () { return db.collection('hr_about_docs').get().then(HR.rows); }) || [];
    var c = S.cfg;
    var rows = [['회사명', c.companyName], ['대표자', c.ceoName], ['사업자등록번호', c.bizNo], ['주소', c.companyAddress]].filter(function (x) { return x[1]; }).concat(info.items || []);
    ui.put(view, ui.head('About', '기본안내', S.isAdmin && !editing ? ui.btn('소개 편집', function () { editing = true; HR.refresh(); }, 'btn-line btn-sm') : null));
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
    if (!dl.children.length) dl.appendChild(h('li', { class: 'empty', text: '등록된 서류가 없습니다.' }));
    ui.put(view, h('div', { class: 'two-col about-grid' },
      ui.panel('Company · 회사 소개', null,
        info.intro ? h('div', { class: 'about-intro', text: info.intro }) : h('p', { class: 'empty', text: S.isAdmin ? '「소개 편집」으로 회사 소개를 작성하세요.' : '아직 회사 소개가 없습니다.' }),
        rows.length ? ui.kv(rows, 'kv wide') : null),
      h('div', { class: 'stack' }, ui.panel('Documents · 기본 서류', null, dl), S.isAdmin ? addDoc() : null)));
  }

  HR.register('about', { render: render });
})();

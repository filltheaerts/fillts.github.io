/* fillts HR — +AI › AI교육 게시판
   대표(관리자)가 공통 AI 교육 강의를 올리고 자료(파일 · 링크 · 유튜브)를 붙인다. 구성원은 읽고 내려받는다.
   글: hr_aiedu, 파일: hr_aiedu_files(900KB 조각). 쓰기는 관리자만. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var MAX_FILE = 8 * 1024 * 1024, MAX_FILES = 8, CHUNK = 900000;
  var TYPES = {
    'application/pdf': 'PDF', 'image/png': '이미지', 'image/jpeg': '이미지', 'image/webp': '이미지',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPT',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel'
  };
  var draft = null;

  function size(n) { return n < 1024 * 1024 ? Math.round(n / 1024) + 'KB' : (n / 1048576).toFixed(1) + 'MB'; }
  function toB64(buf) { var b = new Uint8Array(buf), s = '', st = 0x8000; for (var i = 0; i < b.length; i += st) s += String.fromCharCode.apply(null, b.subarray(i, i + st)); return btoa(s); }
  function fromB64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function ms(t) { return t && t.toMillis ? t.toMillis() : 0; }
  function posts() { return HR.load('hr_aiedu', function () { return db.collection('hr_aiedu').get().then(HR.rows); }); }
  function done() { HR.invalidate('hr_aiedu'); }
  function ytId(u) { var m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/.exec(u || ''); return m ? m[1] : ''; }
  function kindOf(u) {
    if (ytId(u)) return ['유튜브', 'lk-yt'];
    if (/docs\.google\.com\/presentation/.test(u)) return ['슬라이드', 'lk-slide'];
    if (/docs\.google\.com\/spreadsheets/.test(u)) return ['시트', 'lk-sheet'];
    if (/docs\.google\.com\/document/.test(u)) return ['문서', 'lk-doc'];
    if (/drive\.google\.com/.test(u)) return ['드라이브', 'lk-drive'];
    if (/notion\.(so|site)/.test(u)) return ['노션', 'lk-notion'];
    return ['링크', ''];
  }

  function openFile(f) {
    var w = window.open('', '_blank');
    db.doc('hr_aiedu_files/' + f.id).get().then(function (s) {
      if (!s.exists) throw { user: '파일을 찾을 수 없습니다.' };
      var d = s.data(), jobs = [];
      for (var k = 1; k < (d.parts || 1); k++) jobs.push(db.doc('hr_aiedu_files/' + f.id + 'p' + k).get());
      return Promise.all(jobs).then(function (rest) { return { type: d.type, data: d.data + rest.map(function (r) { return r.exists ? r.data().data : ''; }).join('') }; });
    }).then(function (x) {
      var blob = new Blob([fromB64(x.data)], { type: x.type }), url = URL.createObjectURL(blob);
      if (/pdf|image/.test(x.type)) { if (w) w.location.href = url; else location.href = url; }
      else { if (w) w.close(); var a = h('a', { href: url, download: f.name }); document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (x) { if (w) w.close(); x && x.user ? ui.toast(x.user) : ui.fail(x); });
  }
  function writeFiles(postId, arr) {
    var docs = [], meta = [];
    arr.forEach(function (x, i) {
      if (x.id) { meta.push(x); return; }   // 이미 올라간 파일
      var id = postId + '_' + Date.now().toString(36) + i, parts = x.data.match(new RegExp('[\\s\\S]{1,' + CHUNK + '}', 'g')) || [''];
      parts.forEach(function (part, k) { var d = { postId: postId, name: x.name, type: x.type, data: part }; if (k === 0) d.parts = parts.length; docs.push([k === 0 ? id : id + 'p' + k, d]); });
      meta.push({ id: id, name: x.name, type: x.type, size: x.size });
    });
    var chain = Promise.resolve();
    for (var n = 0; n < docs.length; n += 8) (function (slice) {
      chain = chain.then(function () { var b = db.batch(); slice.forEach(function (dd) { b.set(db.doc('hr_aiedu_files/' + dd[0]), dd[1]); }); return b.commit(); });
    })(docs.slice(n, n + 8));
    return chain.then(function () { return meta; });
  }
  function dropFiles(files) {
    var b = db.batch(), n = 0;
    files.forEach(function (f) { if (!f.id) return; b.delete(db.doc('hr_aiedu_files/' + f.id)); n++; for (var k = 1; k < Math.ceil((f.size * 4 / 3) / CHUNK) + 1; k++) { b.delete(db.doc('hr_aiedu_files/' + f.id + 'p' + k)); n++; } });
    return n ? b.commit() : Promise.resolve();
  }
  function linkChip(l) {
    var k = kindOf(l.url);
    return h('a', { class: 'ws-link ' + k[1], href: l.url, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'lk-kind', text: k[0] }), h('span', { class: 'lk-name', text: l.t || l.url.replace(/^https?:\/\//, '').slice(0, 40) }));
  }
  function fileChip(f) {
    return h('button', { type: 'button', class: 'ws-link edu-file', title: f.name, onclick: function (e) { e.preventDefault(); e.stopPropagation(); openFile(f); } },
      h('span', { class: 'lk-kind', text: TYPES[f.type] || '파일' }), h('span', { class: 'lk-name', text: f.name + ' · ' + size(f.size || 0) }));
  }
  function textView(t) { return h('div', { class: 'edu-text' }, String(t || '').split('\n').map(function (l) { return l.trim() ? h('p', { text: l }) : h('br'); })); }

  /* ---------- 글쓰기 (관리자) ---------- */
  function form(view, cur) {
    if (!draft || draft.id !== (cur ? cur.id : null)) draft = cur ? { id: cur.id, title: cur.title, date: cur.date, body: cur.body || '', links: (cur.links || []).map(function (x) { return Object.assign({}, x); }), files: (cur.files || []).slice(), removed: [] }
      : { id: null, title: '', date: fmt.today(), body: '', links: [{ t: '', url: '' }], files: [], removed: [] };
    var d = draft, m = ui.msg();
    var linkRows = h('div', { class: 'stack sm' }, d.links.map(function (l, i) {
      return h('div', { class: 'row edu-link-row' }, ui.input({ value: l.t, maxlength: '60', placeholder: '이름 (예: 1강 녹화본)', oninput: function () { l.t = this.value; } }),
        ui.input({ type: 'url', value: l.url, placeholder: 'https://youtu.be/… · docs.google.com/presentation/…', oninput: function () { l.url = this.value; } }),
        ui.btn('빼기', function () { d.links.splice(i, 1); HR.refresh(); }, 'btn-line btn-xs'));
    }), d.links.length < 10 ? ui.btn('+ 링크 추가 (유튜브 · 슬라이드 · 드라이브 · 노션)', function () { d.links.push({ t: '', url: '' }); HR.refresh(); }, 'btn-line btn-sm') : null);
    var fm = ui.msg(), file = h('input', { type: 'file', multiple: true, hidden: true, accept: Object.keys(TYPES).join(',') + ',.pptx,.docx,.xlsx' });
    file.addEventListener('change', function () {
      var fs = Array.prototype.slice.call(file.files); file.value = '';
      if (d.files.length + fs.length > MAX_FILES) return ui.err(fm, '파일은 최대 ' + MAX_FILES + '개입니다.');
      fm.textContent = '파일을 준비하는 중…';
      Promise.all(fs.map(function (f) {
        if (!TYPES[f.type]) return Promise.reject({ user: f.name + ': PDF · PPT · Word · Excel · 이미지만 올릴 수 있습니다.' });
        if (f.size > MAX_FILE) return Promise.reject({ user: f.name + ' — 파일당 8MB까지입니다. 큰 파일은 Google Drive에 올리고 링크로 붙이세요.' });
        return f.arrayBuffer().then(function (buf) { return { name: f.name.slice(0, 120), type: f.type, size: f.size, data: toB64(buf) }; });
      })).then(function (arr) { arr.forEach(function (x) { d.files.push(x); }); ui.err(fm, ''); HR.refresh(); })
        .catch(function (x) { ui.err(fm, x && x.user ? x.user : '파일을 읽지 못했습니다.'); });
    });
    var fileList = h('ul', { class: 'pay-att' }, d.files.map(function (f, i) {
      return h('li', null, ui.tag(TYPES[f.type] || '파일', 'mute'), h('span', { class: 'grow', text: f.name + ' · ' + size(f.size || 0) }),
        ui.btn('빼기', function () { if (f.id) d.removed.push(f); d.files.splice(i, 1); HR.refresh(); }, 'btn-line btn-xs'));
    }));
    var body = h('textarea', { rows: '10', maxlength: '20000', placeholder: '강의 요약 · 오늘 배운 것 · 실습 과제 · 참고할 점', oninput: function () { d.body = this.value; } }); body.value = d.body;
    var save = h('button', { class: 'btn', type: 'submit', text: cur ? '수정 저장' : '올리기' });
    return h('form', { class: 'panel edu-form', onsubmit: function (e) {
      e.preventDefault();
      if (!d.title.trim()) return ui.err(m, '제목을 입력하세요.');
      var links = d.links.filter(function (l) { return l.url.trim(); }).map(function (l) { return { t: l.t.trim(), url: l.url.trim() }; });
      if (links.some(function (l) { return !/^https:\/\/\S+$/.test(l.url); })) return ui.err(m, '링크는 https:// 로 시작해야 합니다.');
      save.disabled = true; m.textContent = d.files.some(function (f) { return !f.id; }) ? '파일을 올리는 중…' : '';
      var ref = cur ? db.doc('hr_aiedu/' + cur.id) : db.collection('hr_aiedu').doc();
      writeFiles(ref.id, d.files).then(function (meta) {
        var data = { title: d.title.trim(), date: d.date || fmt.today(), body: d.body, links: links, files: meta, updatedAt: FV.serverTimestamp() };
        return (cur ? ref.update(data) : ref.set(Object.assign(data, { by: S.mid, at: FV.serverTimestamp() }))).then(function () { return dropFiles(d.removed); });
      }).then(function () { var id = ref.id; draft = null; done(); ui.toast(cur ? '수정했습니다.' : '올렸습니다. 구성원에게 알림이 갑니다.'); HR.go('ai/edu/' + id); })
        .catch(function (x) { save.disabled = false; ui.fail(x, m); });
    } }, ui.label(cur ? 'Edit · 강의 수정' : 'New · 강의 올리기'),
      h('div', { class: 'form-grid' }, ui.field('제목 *', ui.input({ value: d.title, maxlength: '100', placeholder: '예: 1강 — 프롬프트 5칸 공식', oninput: function () { d.title = this.value; } })),
        ui.field('강의일', h('input', { type: 'date', value: d.date, onchange: function () { d.date = this.value; } }))),
      ui.field('내용', body),
      h('div', { class: 'field' }, h('label', { text: '자료 링크' }), linkRows),
      h('div', { class: 'field' }, h('label', { text: '자료 파일 (PDF · PPT · Word · Excel · 이미지, 파일당 8MB · 최대 8개)' }), fileList, file,
        ui.btn('파일 고르기', function () { file.click(); }, 'btn-line btn-sm'), fm),
      m, h('div', { class: 'row' }, save, ui.btn('취소', function () { draft = null; HR.go('ai/edu' + (cur ? '/' + cur.id : '')); }, 'btn-line')));
  }

  /* ---------- 글 보기 ---------- */
  function detail(view, p) {
    var yts = (p.links || []).map(function (l) { return ytId(l.url); }).filter(Boolean);
    ui.put(view, h('a', { href: '#ai/edu', class: 'back', text: '← AI교육 게시판' }),
      h('article', { class: 'panel edu-article' },
        h('div', { class: 'edu-meta' }, h('span', { class: 'edu-date', text: fmt.dot(p.date || '') }), h('span', { class: 'meta', text: HR.name(p.by) + ' · ' + fmt.ts(p.updatedAt || p.at) }),
          S.isAdmin ? h('a', { href: '#ai/edu/' + p.id + '/edit', class: 'link', text: '수정' }) : null,
          S.isAdmin ? ui.confirmBtn('삭제', function () { dropFiles(p.files || []).then(function () { return db.doc('hr_aiedu/' + p.id).delete(); }).then(function () { done(); HR.go('ai/edu'); }).catch(ui.fail); }) : null),
        h('h1', { class: 'edu-title', text: p.title }),
        yts.map(function (id) { return h('div', { class: 'edu-video' }, h('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0', title: p.title, allow: 'encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' })); }),
        (p.files || []).length || (p.links || []).length ? h('div', { class: 'edu-att' }, h('b', { text: '자료' }), h('div', { class: 'ws-links big' }, (p.files || []).map(fileChip), (p.links || []).map(linkChip))) : null,
        p.body ? textView(p.body) : null));
  }

  function render(view, parts) {
    var list = posts();
    if (parts[0] === 'new') return S.isAdmin ? ui.put(view, form(view, null)) : HR.go('ai/edu');
    if (!list) return ui.put(view, ui.empty('불러오는 중…'));
    if (parts[0]) {
      var p = list.filter(function (x) { return x.id === parts[0]; })[0];
      if (!p) return ui.put(view, ui.empty('글을 찾을 수 없습니다.'));
      return parts[1] === 'edit' && S.isAdmin ? ui.put(view, form(view, p)) : detail(view, p);
    }
    var rows = list.slice().sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : (b.date || '') > (a.date || '') ? 1 : ms(b.at) - ms(a.at); });
    ui.put(view, h('section', { class: 'edu-hero' }, h('div', null, h('span', { class: 'edu-kicker', text: 'AI 공통 교육' }),
        h('p', { text: '공통 AI 교육 강의와 자료를 모아 둡니다. 놓친 강의는 여기서 다시 보고, 자료를 내려받아 바로 실습하세요.' })),
        S.isAdmin ? ui.btn('+ 강의 올리기', function () { draft = null; HR.go('ai/edu/new'); }, 'btn-sm') : null),
      rows.length ? h('ol', { class: 'edu-list' }, rows.map(function (p, i) {
        var n = (p.files || []).length + (p.links || []).length, yt = (p.links || []).some(function (l) { return ytId(l.url); });
        return h('li', null, h('a', { class: 'edu-row', href: '#ai/edu/' + p.id },
          h('span', { class: 'edu-no', text: String(rows.length - i) }),
          h('div', { class: 'edu-row-main' }, h('b', { text: p.title }), p.body ? h('span', { class: 'meta', text: String(p.body).replace(/\s+/g, ' ').slice(0, 90) }) : null),
          h('span', { class: 'edu-badges' }, yt ? h('span', { class: 'edu-badge yt', text: '▶ 영상' }) : null, n ? h('span', { class: 'edu-badge', text: '자료 ' + n }) : null),
          h('span', { class: 'edu-date', text: fmt.dot(p.date || '').slice(2) })));
      })) : ui.empty(S.isAdmin ? '아직 올린 강의가 없습니다. 「+ 강의 올리기」로 첫 강의를 올려 보세요.' : '아직 올라온 강의가 없습니다.'));
  }
  HR.aiEdu = { render: render };
})();

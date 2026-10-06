/* fillts HR — 문서 · 증명서 요청: 구성원이 재직·경력증명서를 요청 → 관리자 승인 → 생성(인쇄·PDF) → 모두싸인 직인 → 발급본 업로드 → 구성원이 내려받기.
   요청·처리 이력은 지우지 않는다. 누가 요청했는지는 관리자 화면에서만 보인다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var MAX_BYTES = 700 * 1024;
  var KINDS = [
    ['재직증명서', '현재 (주)필츠에 재직 중임을 증명합니다.', '금융기관(대출·카드) · 관공서 · 비자 · 어린이집 등'],
    ['경력증명서', '근무 기간 · 소속 · 직위 · 담당 업무를 증명합니다.', '이직 · 경력 인정 · 자격 응시 등']
  ];
  var ST = { pending: ['승인 대기', 'warn'], approved: ['발급 준비 중', 'ok'], issued: ['발급 완료', 'ok'], rejected: ['반려', 'red'], canceled: ['취소', 'mute'] };
  var openKind = null, upFor = null;

  function size(n) { return n < 1024 ? n + 'B' : n < 1048576 ? Math.round(n / 1024) + 'KB' : (n / 1048576).toFixed(1) + 'MB'; }
  function toB64(buf) { var b = new Uint8Array(buf), s = '', k = 0x8000; for (var i = 0; i < b.length; i += k) s += String.fromCharCode.apply(null, b.subarray(i, i + k)); return btoa(s); }
  function fromB64(x) { var bin = atob(x), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
  function squash(s) { return String(s || '').replace(/\s+/g, ''); }
  function reqs(mid) {
    if (S.isAdmin) return (HR.load('hr_docreq@all', function () { return db.collection('hr_docreq').get().then(HR.rows); }) || []).filter(function (r) { return !mid || r.memberId === mid; });
    return HR.load('hr_docreq:' + S.mid, function () { return db.collection('hr_docreq').where('memberId', '==', S.mid).get().then(HR.rows); }) || [];
  }
  function sorted(list) { return list.slice().sort(function (a, b) { return (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0); }); }
  function done() { HR.invalidate('hr_docreq'); }

  function openFile(r, download) {
    var w = download ? null : window.open('', '_blank');
    db.doc('hr_docreq_files/' + r.id).get().then(function (s) {
      if (!s.exists) throw { user: '발급본을 찾을 수 없습니다.' };
      var url = URL.createObjectURL(new Blob([fromB64(s.data().data)], { type: 'application/pdf' }));
      if (download) { var a = h('a', { href: url, download: r.fileName || (r.kind + '.pdf') }); document.body.appendChild(a); a.click(); a.remove(); }
      else if (w) w.location.href = url; else location.href = url;
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      if (r.memberId === S.mid && !r.downloadedAt) db.doc('hr_docreq/' + r.id).update({ downloadedAt: FV.serverTimestamp() }).then(done).catch(function () {});
    }).catch(function (x) { if (w) w.close(); x && x.user ? ui.toast(x.user) : ui.fail(x); });
  }

  /* ---------- 구성원: 요청 ---------- */
  function requestForm(kind) {
    var purpose = ui.input({ maxlength: '60', placeholder: '예: 금융기관 제출용, 비자 신청' }), to = ui.input({ maxlength: '60', placeholder: '선택 · 예: ○○은행' });
    var note = ui.input({ maxlength: '120', placeholder: '선택 · 영문 발급, 필요 기한 등' }), m = ui.msg();
    var f = h('form', { class: 'cert-req' }, h('div', { class: 'row' }, ui.field('용도 *', purpose), ui.field('제출처', to)), ui.field('요청 사항', note), m,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'submit', text: kind + ' 요청 보내기' }), ui.btn('취소', function () { openKind = null; HR.refresh(); }, 'btn-line btn-sm')));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!purpose.value.trim()) return ui.err(m, '용도를 입력하세요.');
      db.collection('hr_docreq').add({ memberId: S.mid, kind: kind, purpose: purpose.value.trim(), to: to.value.trim(), note: note.value.trim(), status: 'pending', createdAt: FV.serverTimestamp() })
        .then(function () { openKind = null; done(); ui.toast(kind + ' 요청을 보냈습니다. 발급되면 여기서 내려받을 수 있습니다.'); }).catch(function (x) { ui.fail(x, m); });
    });
    return f;
  }

  /* ---------- 관리자: 발급본 업로드 (PDF 본문에 대상자 이름이 있는지 확인) ---------- */
  function uploader(r) {
    var m0 = S.members[r.memberId] || {}, file = h('input', { type: 'file', accept: 'application/pdf,.pdf' }), msg = ui.msg(), box = h('div', { class: 'stack' });
    var go = h('button', { type: 'button', class: 'btn btn-sm', text: m0.name + '님에게 발급', disabled: true }), state = null;
    file.addEventListener('change', function () {
      ui.clear(box); go.disabled = true; state = null;
      var f = file.files[0]; if (!f) return;
      if (f.size > MAX_BYTES) return ui.err(msg, '파일이 ' + size(f.size) + '입니다. 700KB 이하 PDF만 올릴 수 있습니다.');
      msg.textContent = '파일 내용을 확인하는 중…';
      f.arrayBuffer().then(function (buf) {
        if (String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 5))) !== '%PDF-') throw { user: 'PDF 파일이 아닙니다.' };
        return (HR.pdfText ? HR.pdfText(buf).catch(function () { return ''; }) : Promise.resolve('')).then(function (t) { return { buf: buf, text: squash(t) }; });
      }).then(function (x) {
        state = { f: f, buf: x.buf };
        var nameOk = x.text && x.text.indexOf(squash(m0.name)) >= 0, kindOk = x.text && x.text.indexOf(squash(r.kind)) >= 0;
        ui.err(msg, '');
        if (nameOk && kindOk) { box.appendChild(h('p', { class: 'ok-text', text: '✓ 문서에 「' + m0.name + '」 · 「' + r.kind + '」가 있습니다.' })); go.disabled = false; return; }
        var typed = ui.input({ placeholder: m0.name, autocomplete: 'off' });
        typed.addEventListener('input', function () { go.disabled = squash(typed.value) !== squash(m0.name); });
        box.appendChild(h('div', { class: 'slip-confirm ' + (x.text ? 'bad' : 'warn') },
          h('strong', { text: !x.text ? '문서 글자를 읽지 못했습니다 (스캔본). 직접 확인하세요.' : !nameOk ? '⚠ 문서에서 「' + m0.name + '」 이름을 찾지 못했습니다. 다른 사람 문서일 수 있습니다.' : '문서에서 「' + r.kind + '」 표기를 찾지 못했습니다.' }),
          h('p', { text: '확인했다면 대상자 이름을 입력하세요. 올리는 즉시 ' + m0.name + '님이 내려받을 수 있습니다.' }), ui.field('대상자 이름', typed)));
      }).catch(function (x) { ui.err(msg, x && x.user ? x.user : '파일을 읽지 못했습니다.'); });
    });
    go.addEventListener('click', function () {
      if (!state || go.disabled) return;
      go.disabled = true; msg.textContent = '올리는 중…';
      var b = db.batch();
      b.set(db.doc('hr_docreq_files/' + r.id), { memberId: r.memberId, data: toB64(state.buf) });
      b.update(db.doc('hr_docreq/' + r.id), { status: 'issued', fileName: state.f.name.slice(0, 120), size: state.f.size, issuedBy: S.mid, issuedAt: FV.serverTimestamp() });
      b.commit().then(function () { upFor = null; done(); ui.toast(m0.name + '님 ' + r.kind + '을 발급했습니다.'); }).catch(function (x) { go.disabled = false; ui.fail(x, msg); });
    });
    return h('div', { class: 'cert-upload' }, ui.field('도장 찍은 발급본 (PDF)', file), msg, box, go);
  }

  function decide(r, st) {
    db.doc('hr_docreq/' + r.id).update({ status: st, decidedBy: S.mid, decidedAt: FV.serverTimestamp() })
      .then(function () { done(); ui.toast(st === 'approved' ? '승인했습니다. 생성 → 직인 → 업로드 순서로 발급하세요.' : '반려했습니다.'); }).catch(ui.fail);
  }
  function generate(r) {
    var no = r.no || ('F' + fmt.today().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase());
    var go = function () { HR.info.printCert(r.kind, S.members[r.memberId] || {}, HR.info.privOf(r.memberId) || {}, r.purpose, no); };
    if (r.no) return go();
    db.doc('hr_docreq/' + r.id).update({ no: no }).then(function () { r.no = no; done(); go(); }).catch(ui.fail);
  }

  function row(r, admin) {
    var st = ST[r.status] || ['', 'mute'], who = admin ? HR.name(r.memberId) + ' · ' : '';
    var meta = [fmt.ts(r.createdAt) + ' 요청', r.to ? '제출처 ' + r.to : '', r.note, r.no ? '발급번호 ' + r.no : '', r.issuedAt ? fmt.ts(r.issuedAt) + ' 발급' : '', admin && r.downloadedAt ? '열람 ' + fmt.ts(r.downloadedAt) : ''].filter(Boolean).join(' · ');
    var acts = [];
    if (r.status === 'issued') { acts.push(ui.btn('열기', function () { openFile(r, false); }, 'btn-line btn-xs'), ui.btn('저장', function () { openFile(r, true); }, 'btn-line btn-xs')); }
    if (admin && r.status === 'pending') acts.push(ui.btn('승인', function () { decide(r, 'approved'); }, 'btn-xs'), ui.btn('반려', function () { decide(r, 'rejected'); }, 'btn-line btn-xs'));
    if (admin && (r.status === 'approved' || r.status === 'issued')) acts.push(ui.btn('생성하기', function () { generate(r); }, 'btn-line btn-xs'),
      ui.btn(upFor === r.id ? '닫기' : r.status === 'issued' ? '재업로드' : '발급본 업로드', function () { upFor = upFor === r.id ? null : r.id; HR.refresh(); }, 'btn-xs' + (r.status === 'issued' ? ' btn-line' : '')));
    if (!admin && r.status === 'pending' && r.memberId === S.mid) acts.push(ui.btn('취소', function () { db.doc('hr_docreq/' + r.id).update({ status: 'canceled' }).then(done).catch(ui.fail); }, 'btn-line btn-xs'));
    return h('li', { class: 'cert-row' },
      h('div', { class: 'grow' }, h('div', null, ui.tag(st[0], st[1]), ' ', who + r.kind + ' · ' + r.purpose), h('div', { class: 'meta', text: meta })),
      h('div', { class: 'actions' }, acts),
      admin && upFor === r.id ? uploader(r) : null);
  }

  // INFO › 문서 · 증명서
  function tab(view, mid) {
    var self = mid === S.mid, admin = S.isAdmin, list = sorted(reqs(admin && self ? null : mid));
    var guide = h('div', { class: 'cert-kinds' }, KINDS.map(function (k) {
      return h('div', { class: 'cert-kind' }, h('div', { class: 'cert-kind-name', text: k[0] }), h('p', { text: k[1] }), h('p', { class: 'meta', text: '주로 쓰는 곳: ' + k[2] }),
        self ? (openKind === k[0] ? requestForm(k[0]) : ui.btn(k[0] + ' 요청하기', function () { openKind = k[0]; HR.refresh(); }, 'btn-sm')) : null);
    }));
    ui.put(view, ui.panel('Certificates · 요청할 수 있는 문서', null, guide,
      h('p', { class: 'note', text: '요청 → 관리자 승인 → 대표 직인 날인 → 발급본 업로드 순서로 처리되며, 발급되면 이 화면에서 PDF로 내려받습니다. 보통 1~2 영업일 걸립니다. 그 밖의 서류(원천징수영수증 등)는 관리자에게 문의하세요.' })));
    var mine = list.filter(function (r) { return r.memberId === mid; }), ul = h('ul', { class: 'list' });
    if (admin && self) {
      var q = h('ul', { class: 'list' }), hist = h('ul', { class: 'list' });
      list.forEach(function (r) { (r.status === 'pending' || r.status === 'approved' ? q : hist).appendChild(row(r, true)); });
      if (!q.children.length) q.appendChild(h('li', { class: 'empty', text: '처리할 요청이 없습니다.' }));
      if (!hist.children.length) hist.appendChild(h('li', { class: 'empty', text: '처리 이력이 없습니다.' }));
      ui.put(view, ui.panel('Requests · 처리할 요청 (관리자)', null, q), ui.panel('History · 전체 이력', null, hist));
      return;
    }
    (admin ? list : mine).forEach(function (r) { ul.appendChild(row(r, admin && !self)); });
    if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '요청한 증명서가 없습니다.' }));
    ui.put(view, ui.panel(self ? 'My requests · 내 요청 이력' : 'Requests · 요청 이력', null, ul));
  }
  // INFO 첫 화면 할 일 (관리자)
  function todo() { return S.isAdmin ? sorted(reqs(null)).filter(function (r) { return r.status === 'pending' || r.status === 'approved'; }).map(function (r) { return row(r, true); }) : []; }

  HR.certs = { tab: tab, todo: todo };
})();

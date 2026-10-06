/* fillts HR — 입금요청 (지출결의)
   기안 작성(증빙 첨부) → 대표 승인 / 반려 → 입금 처리(입금일 · 입금액 · 이체확인증) → 입금 완료.
   신청자는 본인 요청만, 관리자는 전체를 본다. 이력은 지우지 않는다. (hr_payreq · hr_payreq_files) */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var MAX_BYTES = 700 * 1024, MAX_FILES = 5;
  // 지급 유형별로 준비해야 하는 서류
  var TYPES = {
    vendor: { name: '거래처 대금', docs: ['세금계산서 또는 계산서', '거래명세서 또는 견적서', '통장 사본 (첫 거래 · 계좌 변경 시)'] },
    expense: { name: '경비 정산 (개인 카드 · 현금)', docs: ['영수증 · 카드 전표 · 현금영수증', '사용 내역 (참석자 · 목적)'] },
    advance: { name: '선급금 · 계약금', docs: ['계약서 또는 발주서', '견적서', '통장 사본'] },
    tax: { name: '세금 · 공과금 · 보험료', docs: ['고지서 · 납부서'] },
    etc: { name: '기타', docs: ['지출 근거 서류'] }
  };
  var ACCOUNTS = ['원재료 · 부자재', '외주 · 용역비', '광고선전비', '디자인 · 촬영비', '지급수수료', '소모품비', '복리후생비', '여비교통비', '임차료', '통신비', '세금과공과', '기타'];
  var VAT = [['incl', '부가세 포함'], ['excl', '부가세 별도'], ['none', '해당 없음 (면세 · 간이 · 경비)']];
  var ST = { pending: ['승인 대기', 'warn'], approved: ['승인 · 입금 대기', 'ok'], paid: ['입금 완료', 'ok'], rejected: ['반려', 'red'], canceled: ['취소', 'mute'] };
  var BANKS = ['국민', '신한', '우리', '하나', '기업', '농협', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일', '씨티', '수협', '대구', '부산', '경남', '광주', '전북', '새마을금고', '신협', '우체국', '기타'];
  var draft = null, filter = 'open';

  function size(n) { return n < 1024 ? n + 'B' : n < 1048576 ? Math.round(n / 1024) + 'KB' : (n / 1048576).toFixed(1) + 'MB'; }
  function toB64(buf) { var b = new Uint8Array(buf), s = '', k = 0x8000; for (var i = 0; i < b.length; i += k) s += String.fromCharCode.apply(null, b.subarray(i, i + k)); return btoa(s); }
  function fromB64(x) { var bin = atob(x), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
  function won(n) { return fmt.won(n); }
  function list() {
    if (S.isAdmin) return HR.load('hr_payreq@all', function () { return db.collection('hr_payreq').get().then(HR.rows); }) || [];
    return HR.load('hr_payreq:' + S.mid, function () { return db.collection('hr_payreq').where('memberId', '==', S.mid).get().then(HR.rows); }) || [];
  }
  function sorted(a) { return a.slice().sort(function (x, y) { return (y.createdAt && y.createdAt.toMillis ? y.createdAt.toMillis() : 0) - (x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : 0); }); }
  function done() { HR.invalidate('hr_payreq'); }
  function openFile(f) {
    var w = window.open('', '_blank');
    db.doc('hr_payreq_files/' + f.id).get().then(function (s) {
      if (!s.exists) throw { user: '파일을 찾을 수 없습니다.' };
      var d = s.data(), url = URL.createObjectURL(new Blob([fromB64(d.data)], { type: d.type || 'application/pdf' }));
      if (w) w.location.href = url; else location.href = url;
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (x) { if (w) w.close(); x && x.user ? ui.toast(x.user) : ui.fail(x); });
  }
  function readFiles(files) {
    return Promise.all(Array.prototype.map.call(files, function (f) {
      if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type)) return Promise.reject({ user: f.name + ': PDF 또는 이미지 파일만 올릴 수 있습니다.' });
      if (f.size > MAX_BYTES) return Promise.reject({ user: f.name + ': ' + size(f.size) + ' — 700KB 이하로 줄여 주세요 (스캔 해상도를 낮추거나 PDF 압축).' });
      return f.arrayBuffer().then(function (buf) { return { name: f.name.slice(0, 120), type: f.type, size: f.size, data: toB64(buf) }; });
    }));
  }

  /* ---------- 기안 작성 ---------- */
  function newForm(view) {
    var d = draft || (draft = { type: 'vendor', title: '', payee: '', amount: '', vat: 'incl', account: ACCOUNTS[0], due: L.addDays(fmt.today(), 3), bank: '국민', acct: '', holder: '', purpose: '', checks: {} });
    var bind = function (k) { return function () { d[k] = this.value; }; };
    var type = ui.select(Object.keys(TYPES).map(function (k) { return [k, TYPES[k].name]; }), d.type, { onchange: function () { d.type = this.value; d.checks = {}; HR.refresh(); } });
    var amount = h('input', { type: 'text', inputmode: 'numeric', value: d.amount ? (+d.amount).toLocaleString('ko-KR') : '', placeholder: '0', oninput: function () { var v = this.value.replace(/[^\d]/g, ''); d.amount = v; this.value = v ? (+v).toLocaleString('ko-KR') : ''; hint.textContent = v ? won(+v) + (d.vat === 'excl' ? ' + 부가세 ' + won(Math.round(+v * 0.1)) + ' = ' + won(Math.round(+v * 1.1)) : '') : ''; } });
    var hint = h('span', { class: 'meta', text: d.amount ? won(+d.amount) : '' });
    var docs = TYPES[d.type].docs, checks = h('ul', { class: 'pay-docs' }, docs.map(function (x, i) {
      var cb = h('input', { type: 'checkbox', checked: !!d.checks[i], onchange: function () { d.checks[i] = this.checked; } });
      return h('li', null, h('label', { class: 'check' }, cb, ' ' + x));
    }));
    var files = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/png,image/jpeg,image/webp' }), m = ui.msg();
    var go = h('button', { class: 'btn', type: 'submit', text: '입금요청 올리기' });
    var f = h('form', { class: 'panel pay-form' }, ui.label('New request · 입금요청 기안'),
      h('div', { class: 'form-grid' },
        ui.field('지급 유형 *', type), ui.field('계정 과목', ui.select(ACCOUNTS.map(function (a) { return [a, a]; }), d.account, { onchange: bind('account') })),
        ui.field('제목 *', h('input', { type: 'text', value: d.title, maxlength: '60', placeholder: '예: 10월 단상자 인쇄 잔금', oninput: bind('title') })),
        ui.field('거래처 · 받는 분 *', h('input', { type: 'text', value: d.payee, maxlength: '60', placeholder: '예: (주)○○인쇄', oninput: bind('payee') })),
        ui.field('입금할 금액 (원) *', h('div', { class: 'stack' }, amount, hint)),
        ui.field('부가세', ui.select(VAT, d.vat, { onchange: function () { d.vat = this.value; amount.dispatchEvent(new Event('input')); } })),
        ui.field('입금 희망일 *', h('input', { type: 'date', value: d.due, onchange: bind('due') }))),
      h('div', { class: 'form-grid' },
        ui.field('은행 *', ui.select(BANKS.map(function (b) { return [b, b]; }), d.bank, { onchange: bind('bank') })),
        ui.field('계좌번호 *', h('input', { type: 'text', inputmode: 'numeric', value: d.acct, maxlength: '30', placeholder: '숫자와 - 만', oninput: bind('acct') })),
        ui.field('예금주 *', h('input', { type: 'text', value: d.holder, maxlength: '40', placeholder: '통장 사본의 예금주명', oninput: bind('holder') }))),
      ui.field('지출 목적 · 내용 *', (function () { var t = h('textarea', { rows: '3', maxlength: '1000', placeholder: '무엇을 왜 사는지, 수량 · 단가, 관련 프로젝트', oninput: bind('purpose') }); t.value = d.purpose; return t; })()),
      h('div', { class: 'field' }, h('label', { text: '준비 서류 (' + TYPES[d.type].name + ')' }), checks),
      ui.field('증빙 첨부 (PDF · 이미지, 파일당 700KB · 최대 5개) *', files), m, go,
      h('p', { class: 'note', text: '올리면 대표에게 승인 요청이 갑니다. 승인 후 입금되면 입금일 · 금액이 기록되고 알림이 옵니다. 계좌 정보와 증빙은 본인과 관리자만 볼 수 있습니다.' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var amt = +d.amount || 0;
      if (!d.title.trim() || !d.payee.trim()) return ui.err(m, '제목과 거래처 · 받는 분을 입력하세요.');
      if (amt <= 0) return ui.err(m, '입금할 금액을 입력하세요.');
      if (!d.due) return ui.err(m, '입금 희망일을 고르세요.');
      if (!/^[\d-]{6,30}$/.test(d.acct.trim()) || !d.holder.trim()) return ui.err(m, '계좌번호(숫자 · -)와 예금주를 확인하세요.');
      if (!d.purpose.trim()) return ui.err(m, '지출 목적 · 내용을 입력하세요.');
      if (!files.files.length) return ui.err(m, '증빙 서류를 1개 이상 첨부하세요.');
      if (files.files.length > MAX_FILES) return ui.err(m, '첨부는 최대 ' + MAX_FILES + '개입니다.');
      go.disabled = true; m.textContent = '올리는 중…';
      readFiles(files.files).then(function (arr) {
        var ref = db.collection('hr_payreq').doc(), b = db.batch(), total = d.vat === 'excl' ? Math.round(amt * 1.1) : amt;
        var fileMeta = arr.map(function (x, i) { return { id: ref.id + '_' + i, name: x.name, type: x.type, size: x.size, kind: 'evidence' }; });
        b.set(ref, { memberId: S.mid, type: d.type, title: d.title.trim(), payee: d.payee.trim(), amount: amt, vat: d.vat, total: total, account: d.account, due: d.due,
          bank: d.bank, acct: d.acct.trim(), holder: d.holder.trim(), purpose: d.purpose.trim(), docs: TYPES[d.type].docs.filter(function (_, i) { return d.checks[i]; }),
          files: fileMeta, status: 'pending', createdAt: FV.serverTimestamp() });
        arr.forEach(function (x, i) { b.set(db.doc('hr_payreq_files/' + ref.id + '_' + i), { memberId: S.mid, reqId: ref.id, name: x.name, type: x.type, data: x.data }); });
        return b.commit().then(function () { return ref.id; });
      }).then(function (id) { draft = null; done(); ui.toast('입금요청을 올렸습니다. 대표 승인을 기다립니다.'); HR.go('payreq/r/' + id); })
        .catch(function (x) { go.disabled = false; x && x.user ? ui.err(m, x.user) : ui.fail(x, m); });
    });
    ui.put(view, f);
  }

  /* ---------- 상세 · 처리 ---------- */
  function detail(view, id) {
    var r = list().filter(function (x) { return x.id === id; })[0];
    if (!r) return ui.put(view, ui.empty('요청을 찾을 수 없습니다.'));
    var st = ST[r.status] || ['', 'mute'], admin = S.isAdmin;
    var rows = [['지급 유형', (TYPES[r.type] || TYPES.etc).name], ['요청자', HR.name(r.memberId)], ['거래처 · 받는 분', r.payee],
      ['입금할 금액', won(r.total) + (r.vat === 'excl' ? ' (공급가 ' + won(r.amount) + ' + 부가세)' : r.vat === 'incl' ? ' (부가세 포함)' : '')],
      ['입금 희망일', fmt.dateLong(r.due)], ['계좌', r.bank + ' ' + r.acct + ' · ' + r.holder], ['계정 과목', r.account], ['요청일', fmt.ts(r.createdAt)]];
    if (r.decidedAt) rows.push([r.status === 'rejected' ? '반려' : '승인', HR.name(r.decidedBy) + ' · ' + fmt.ts(r.decidedAt) + (r.reason ? ' · ' + r.reason : '')]);
    if (r.status === 'paid') rows.push(['입금 완료', fmt.dateLong(r.paidDate) + ' · ' + won(r.paidAmount) + (r.paidNote ? ' · ' + r.paidNote : '')]);
    var fl = h('ul', { class: 'list' }, (r.files || []).map(function (f) {
      return h('li', null, h('div', { class: 'grow' }, h('div', null, ui.tag(f.kind === 'receipt' ? '이체확인증' : '증빙', f.kind === 'receipt' ? 'ok' : 'mute'), ' ', f.name), h('div', { class: 'meta', text: size(f.size || 0) })),
        ui.btn('열기', function () { openFile(f); }, 'btn-line btn-xs'));
    }));
    var acts = null;
    if (admin && r.status === 'pending') {
      var reason = ui.input({ maxlength: '200', placeholder: '반려 사유 (반려할 때 필수)' }), am = ui.msg();
      acts = ui.panel('Approve · 대표 승인', null, h('div', { class: 'row' },
        ui.btn('승인', function () { db.doc('hr_payreq/' + id).update({ status: 'approved', decidedBy: S.mid, decidedAt: FV.serverTimestamp() }).then(function () { done(); ui.toast('승인했습니다. 입금 후 「입금 완료」를 기록하세요.'); }).catch(function (x) { ui.fail(x, am); }); }),
        reason, ui.btn('반려', function () { if (!reason.value.trim()) return ui.err(am, '반려 사유를 입력하세요.'); db.doc('hr_payreq/' + id).update({ status: 'rejected', reason: reason.value.trim(), decidedBy: S.mid, decidedAt: FV.serverTimestamp() }).then(function () { done(); ui.toast('반려했습니다.'); }).catch(function (x) { ui.fail(x, am); }); }, 'btn-line')), am);
    } else if (admin && r.status === 'approved') {
      var pd = h('input', { type: 'date', value: fmt.today() }), pa = h('input', { type: 'text', inputmode: 'numeric', value: (r.total || 0).toLocaleString('ko-KR') }), pn = ui.input({ maxlength: '120', placeholder: '예: 기업은행 법인계좌에서 이체' });
      var rc = h('input', { type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp' }), pm = ui.msg();
      acts = ui.panel('Pay · 입금 완료 기록', null, h('div', { class: 'form-grid' }, ui.field('입금일', pd), ui.field('입금액 (원)', pa), ui.field('메모', pn), ui.field('이체확인증 (선택)', rc)), pm,
        ui.btn('입금 완료로 기록', function () {
          var amt = +pa.value.replace(/[^\d]/g, '');
          if (!pd.value || !amt) return ui.err(pm, '입금일과 입금액을 입력하세요.');
          var upd = { status: 'paid', paidDate: pd.value, paidAmount: amt, paidNote: pn.value.trim(), paidBy: S.mid, paidAt: FV.serverTimestamp() };
          (rc.files[0] ? readFiles([rc.files[0]]) : Promise.resolve([])).then(function (arr) {
            var b = db.batch();
            if (arr.length) {
              var fid = id + '_r' + Date.now().toString(36);
              b.set(db.doc('hr_payreq_files/' + fid), { memberId: r.memberId, reqId: id, name: arr[0].name, type: arr[0].type, data: arr[0].data });
              upd.files = (r.files || []).concat([{ id: fid, name: arr[0].name, type: arr[0].type, size: arr[0].size, kind: 'receipt' }]);
            }
            b.update(db.doc('hr_payreq/' + id), upd);
            return b.commit();
          }).then(function () { done(); ui.toast('입금 완료로 기록했습니다. 요청자에게 알림이 갑니다.'); }).catch(function (x) { x && x.user ? ui.err(pm, x.user) : ui.fail(x, pm); });
        }), h('p', { class: 'note', text: '금액이 다르게 나갔다면 실제 입금액을 적고 메모에 이유를 남기세요.' }));
    } else if (!admin && r.status === 'pending' && r.memberId === S.mid) {
      acts = h('div', { class: 'row' }, ui.confirmBtn('요청 취소', function () { db.doc('hr_payreq/' + id).update({ status: 'canceled' }).then(function () { done(); ui.toast('요청을 취소했습니다.'); }).catch(ui.fail); }));
    }
    ui.put(view, h('a', { href: '#payreq', class: 'back', text: '← 입금요청' }),
      h('div', { class: 'pay-head' }, ui.tag(st[0], st[1]), h('h2', { class: 'pay-title', text: r.title })),
      h('div', { class: 'two-col' }, ui.panel('Request · 요청 내용', null, ui.kv(rows, 'kv wide'), h('div', { class: 'pay-purpose', text: r.purpose }),
        r.docs && r.docs.length ? h('p', { class: 'meta', text: '준비 서류 체크: ' + r.docs.join(' · ') }) : null),
        h('div', { class: 'stack' }, ui.panel('Files · 증빙', null, fl), acts)));
  }

  /* ---------- 목록 ---------- */
  function listView(view) {
    var all = sorted(list()), mine = !S.isAdmin;
    var shown = all.filter(function (r) { return filter === 'all' ? true : filter === 'open' ? (r.status === 'pending' || r.status === 'approved') : r.status === filter; });
    var sum = function (st) { return all.filter(function (r) { return r.status === st; }).reduce(function (a, r) { return a + (r.total || 0); }, 0); };
    var tb = h('table', { class: 'table pay-table' });
    tb.appendChild(h('thead', null, h('tr', null, ['요청일', mine ? null : '요청자', '제목', '거래처', '금액', '희망일', '상태'].filter(Boolean).map(function (x, i) { return h('th', { class: x === '금액' ? 'num' : '', text: x }); }))));
    var body = h('tbody');
    shown.forEach(function (r) {
      var st = ST[r.status] || ['', 'mute'], late = (r.status === 'pending' || r.status === 'approved') && r.due && r.due < fmt.today();
      body.appendChild(h('tr', { class: 'clickable', onclick: function () { HR.go('payreq/r/' + r.id); } },
        h('td', { text: fmt.ts(r.createdAt) }), mine ? null : h('td', { text: HR.name(r.memberId) }), h('td', { text: r.title }), h('td', { text: r.payee }),
        h('td', { class: 'num', text: won(r.total) }), h('td', { class: late ? 'red-text' : '', text: fmt.date(r.due) + (late ? ' 지남' : '') }), h('td', null, ui.tag(st[0], st[1]))));
    });
    if (!shown.length) body.appendChild(h('tr', null, h('td', { colspan: mine ? '6' : '7', class: 'empty', text: '해당하는 입금요청이 없습니다.' })));
    tb.appendChild(body);
    var chips = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '상태' });
    [['open', '진행 중'], ['pending', '승인 대기'], ['approved', '입금 대기'], ['paid', '입금 완료'], ['rejected', '반려'], ['all', '전체']].forEach(function (x) {
      chips.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(filter === x[0]), class: filter === x[0] ? 'on' : '', text: x[1], onclick: function () { filter = x[0]; HR.refresh(); } }));
    });
    ui.put(view,
      S.isAdmin ? h('dl', { class: 'summary' }, [['승인 대기', won(sum('pending'))], ['입금 대기', won(sum('approved'))], ['이번 달 입금 완료', won(all.filter(function (r) { return r.status === 'paid' && (r.paidDate || '').slice(0, 7) === fmt.today().slice(0, 7); }).reduce(function (a, r) { return a + (r.paidAmount || 0); }, 0))]].map(function (p) { return h('div', null, h('dt', { text: p[0] }), h('dd', { text: p[1] })); })) : null,
      h('div', { class: 'toolbar' }, chips, ui.btn('+ 입금요청 쓰기', function () { HR.go('payreq/new'); })),
      h('div', { class: 'table-wrap' }, tb),
      h('p', { class: 'note', text: '흐름: 기안 작성 · 증빙 첨부 → 대표 승인(또는 반려) → 입금 → 입금 완료 기록. 단계마다 요청자와 대표에게 알림이 갑니다.' }));
  }

  HR.register('payreq', {
    render: function (view, parts) {
      ui.put(view, ui.head('Payment', '입금요청'));
      if (parts[0] === 'new') return newForm(view);
      if (parts[0] === 'r' && parts[1]) return detail(view, parts[1]);
      listView(view);
    }
  });
  HR.payreq = { todo: function () { return S.isAdmin ? sorted(list()).filter(function (r) { return r.status === 'pending' || r.status === 'approved'; }) : []; } };
})();

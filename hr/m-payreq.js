/* fillts HR — 입금요청 (지출결의)
   기안 작성(증빙 첨부) → 대표 승인 / 반려 → 입금 처리(입금일 · 입금액 · 이체확인증) → 입금 완료.
   신청자는 본인 요청만, 관리자는 전체를 본다. 이력은 지우지 않는다. (hr_payreq · hr_payreq_files) */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var MAX_FILE = 3 * 1024 * 1024, MAX_TOTAL = 10 * 1024 * 1024, MAX_FILES = 5, CHUNK = 900000;   // 큰 파일은 900KB 조각으로 나눠 저장
  // 지급 유형별로 준비해야 하는 서류
  var TYPES = {
    vendor: { name: '거래처 대금', docs: ['세금계산서 또는 계산서', '거래명세서 또는 견적서', '사업자등록증 (첫 거래 시 필수)', '통장 사본 (첫 거래 · 계좌 변경 시 필수)'], first: [2, 3] },
    expense: { name: '경비 정산 (개인 카드 · 현금)', docs: ['영수증 · 카드 전표 · 현금영수증', '사용 내역 (참석자 · 목적)'] },
    advance: { name: '선급금 · 계약금', docs: ['계약서 또는 발주서', '견적서', '사업자등록증 (첫 거래 시 필수)', '통장 사본 (첫 거래 · 계좌 변경 시 필수)'], first: [2, 3] },
    tax: { name: '세금 · 공과금 · 보험료', docs: ['고지서 · 납부서'] },
    etc: { name: '기타', docs: ['지출 근거 서류'] }
  };
  var ACCOUNTS = ['원재료 · 부자재', '외주 · 용역비', '광고선전비', '디자인 · 촬영비', '지급수수료', '소모품비', '복리후생비', '여비교통비', '임차료', '통신비', '세금과공과', '기타'];
  var VAT = [['incl', '부가세 포함'], ['excl', '부가세 별도'], ['none', '해당 없음 (면세 · 간이 · 경비)']];
  var ST = { pending: ['승인 대기', 'warn'], approved: ['승인 · 입금 대기', 'ok'], paid: ['입금 완료', 'ok'], rejected: ['반려', 'red'], canceled: ['취소', 'mute'] };
  var BANKS = ['국민', '신한', '우리', '하나', '기업', '농협', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일', '씨티', '수협', '대구', '부산', '경남', '광주', '전북', '새마을금고', '신협', '우체국', '기타'];
  // 빠른 작성 — 누르면 유형 · 계정 · 부가세 · 제목 · 내용 틀을 채운다 (note는 서류 칸 아래 안내)
  var PRESETS = [
    { k: 'influencer', name: '인플루언서 대금지급', type: 'vendor', account: '광고선전비', vat: 'none', title: '인플루언서 협찬 대금 · ',
      purpose: '채널 · 계정: \n게시물 수 · 게시(예정)일: \n계약 금액 · 조건: \n캠페인 / 제품: ',
      note: '개인 인플루언서는 사업소득 3.3% 원천징수 후 지급합니다 — 금액은 원천징수 전 총액을 적고 메모로 남겨 주세요. 사업자(에이전시)면 세금계산서를 받습니다. 신분증 · 주민등록번호는 이곳에 올리지 말고 대표에게 따로 전달하세요.' },
    { k: 'media', name: '매체사 게재 비용', type: 'vendor', account: '광고선전비', vat: 'excl', title: '매체 게재 비용 · ',
      purpose: '매체 · 지면: \n게재 기간: \n광고 상품 · 단가: \n캠페인: ',
      note: '세금계산서와 견적서(또는 광고 신청서)를 첨부하고, 게재 후 결과 리포트는 마케팅 폴더에 보관하세요.' },
    { k: 'shoot', name: '촬영 · 모델료', type: 'vendor', account: '디자인 · 촬영비', vat: 'excl', title: '촬영비 · ',
      purpose: '촬영 일자 · 장소: \n촬영 범위(컷 수 · 영상): \n참여 인원(포토 · 모델 · 헤어메이크업): \n용도: ',
      note: '개인 모델 · 스태프는 3.3% 원천징수 대상입니다. 초상권 사용 범위가 들어간 계약서를 함께 첨부하세요.' },
    { k: 'material', name: '원부자재 · 패키지', type: 'vendor', account: '원재료 · 부자재', vat: 'excl', title: '원부자재 구매 · ',
      purpose: '품목 · 규격: \n수량 · 단가: \n관련 제품 · 생산 일정: ', note: '' },
    { k: 'oem', name: 'OEM 생산 대금', type: 'advance', account: '외주 · 용역비', vat: 'excl', title: 'OEM 생산 대금 · ',
      purpose: '제품 · 차수: \n생산 수량: \n계약금 / 중도금 / 잔금 구분: \n입고 예정일: ', note: '계약금 · 잔금 비율은 계약서 기준으로 적고, 잔금은 입고 · 검수 후 요청하세요.' },
    { k: 'design', name: '디자인 · 외주', type: 'vendor', account: '외주 · 용역비', vat: 'excl', title: '외주 용역비 · ',
      purpose: '작업 범위: \n납품물 · 일정: \n계약 금액: ', note: '개인 프리랜서는 3.3% 원천징수 대상입니다.' },
    { k: 'logistics', name: '택배 · 물류비', type: 'vendor', account: '지급수수료', vat: 'excl', title: '물류비 · ',
      purpose: '기간: \n건수 · 단가: \n업체: ', note: '' },
    { k: 'expense', name: '개인 경비 정산', type: 'expense', account: '복리후생비', vat: 'none', title: '경비 정산 · ',
      purpose: '사용일 · 장소: \n사용 목적: \n참석자: ', note: '영수증 사진을 그대로 올리면 자동으로 크기를 줄입니다. 받는 분 · 계좌는 본인 것으로 적어 주세요.' }
  ];
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
  function isDrive(u) { return /^https:\/\/(drive|docs)\.google\.com\//.test(u || ''); }
  function openFile(f) {
    if (f.kind === 'link') { var pw = window.open(f.url, 'fillts_drive', 'popup=yes,width=1100,height=820'); if (!pw) location.href = f.url; return; }
    var w = window.open('', '_blank');
    db.doc('hr_payreq_files/' + f.id).get().then(function (s) {
      if (!s.exists) throw { user: '파일을 찾을 수 없습니다.' };
      var d = s.data(), n = d.parts || 1, jobs = [];
      for (var k = 1; k < n; k++) jobs.push(db.doc('hr_payreq_files/' + f.id + 'p' + k).get());
      return Promise.all(jobs).then(function (rest) { return { type: d.type, data: d.data + rest.map(function (r) { return r.exists ? r.data().data : ''; }).join('') }; });
    }).then(function (x) {
      var url = URL.createObjectURL(new Blob([fromB64(x.data)], { type: x.type || 'application/pdf' }));
      if (w) w.location.href = url; else location.href = url;
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (x) { if (w) w.close(); x && x.user ? ui.toast(x.user) : ui.fail(x); });
  }
  // 사진은 긴 변 2200px · JPEG로 줄인다 (영수증 · 세금계산서 촬영본이 대부분 1MB 아래로)
  function shrink(f) {
    if (!/^image\//.test(f.type) || f.size <= 700 * 1024) return Promise.resolve(null);
    return new Promise(function (ok) {
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () {
        var k = Math.min(1, 2200 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { ok(b && b.size < f.size ? b : null); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(null); };
      img.src = url;
    });
  }
  function prepFile(f) {
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type)) return Promise.reject({ user: f.name + ': PDF 또는 이미지 파일만 올릴 수 있습니다.' });
    return shrink(f).then(function (small) {
      var src = small || f, name = small ? f.name.replace(/\.[^.]+$/, '') + '.jpg' : f.name;
      if (src.size > MAX_FILE) throw { user: f.name + ': ' + size(src.size) + ' — 파일당 3MB까지입니다. 더 큰 파일은 Google Drive에 올리고 링크로 첨부하세요.' };
      return src.arrayBuffer().then(function (buf) { return { name: name.slice(0, 120), type: small ? 'image/jpeg' : f.type, size: src.size, data: toB64(buf) }; });
    });
  }
  // 파일을 조각으로 나눠 저장하고 요청서에 넣을 목록을 돌려준다 (배치 하나에 8조각까지)
  function writeFiles(reqId, ownerMid, arr, tag, kind) {
    var docs = [], meta = [];
    arr.forEach(function (x, i) {
      if (x.kind === 'link') { meta.push({ id: '', kind: 'link', url: x.url, name: x.name }); return; }
      var id = reqId + '_' + tag + i, parts = x.data.match(new RegExp('[\\s\\S]{1,' + CHUNK + '}', 'g')) || [''];
      parts.forEach(function (part, k) {
        var doc = { memberId: ownerMid, reqId: reqId, name: x.name, type: x.type, data: part };
        if (k === 0) doc.parts = parts.length;
        docs.push([k === 0 ? id : id + 'p' + k, doc]);
      });
      meta.push({ id: id, name: x.name, type: x.type, size: x.size, kind: kind });
    });
    var chain = Promise.resolve();
    for (var n = 0; n < docs.length; n += 8) (function (slice) {
      chain = chain.then(function () { var b = db.batch(); slice.forEach(function (dd) { b.set(db.doc('hr_payreq_files/' + dd[0]), dd[1]); }); return b.commit(); });
    })(docs.slice(n, n + 8));
    return chain.then(function () { return meta; });
  }
  // 첨부 목록 (파일 + Google Drive 링크) — 다시 그려도 draft에 남는다
  function attachBox(att, onChange, max) {
    var m = ui.msg(), list = h('ul', { class: 'pay-att' }, att.map(function (x, i) {
      return h('li', null, ui.tag(x.kind === 'link' ? 'Google Drive' : (x.type === 'application/pdf' ? 'PDF' : '이미지'), x.kind === 'link' ? 'ok' : 'mute'),
        h('span', { class: 'grow', text: x.name + (x.size ? ' · ' + size(x.size) : '') }),
        h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '빼기', onclick: function () { att.splice(i, 1); onChange(); } }));
    }));
    var file = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/png,image/jpeg,image/webp', hidden: true });
    file.addEventListener('change', function () {
      var fs = Array.prototype.slice.call(file.files); file.value = '';
      if (att.length + fs.length > max) return ui.err(m, '첨부는 최대 ' + max + '개입니다.');
      m.textContent = '파일을 준비하는 중…';
      Promise.all(fs.map(prepFile)).then(function (arr) {
        var total = att.concat(arr).reduce(function (a, x) { return a + (x.size || 0); }, 0);
        if (total > MAX_TOTAL) throw { user: '첨부 합계가 10MB를 넘습니다. 큰 파일은 Google Drive 링크로 첨부하세요.' };
        arr.forEach(function (x) { att.push(x); }); ui.err(m, ''); onChange();
      }).catch(function (x) { ui.err(m, x && x.user ? x.user : '파일을 읽지 못했습니다.'); });
    });
    var link = ui.input({ type: 'url', placeholder: 'https://drive.google.com/… (공유 링크)' }), lname = ui.input({ maxlength: '60', placeholder: '이름 (예: 세금계산서)' });
    var addLink = ui.btn('링크 추가', function () {
      var u = link.value.trim();
      if (!isDrive(u)) return ui.err(m, 'https://drive.google.com 또는 docs.google.com 링크만 첨부할 수 있습니다.');
      if (att.length >= max) return ui.err(m, '첨부는 최대 ' + max + '개입니다.');
      att.push({ kind: 'link', url: u, name: lname.value.trim() || 'Google Drive 파일' }); onChange();
    }, 'btn-line btn-sm');
    return h('div', { class: 'stack pay-attach' }, list,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-sm', text: '파일 선택', onclick: function () { file.click(); } }), file,
        h('span', { class: 'meta', text: 'PDF · 이미지 · 파일당 3MB (사진은 자동으로 줄임)' })),
      h('div', { class: 'row pay-link' }, lname, link, addLink), m,
      h('p', { class: 'meta', text: 'Google Drive 파일은 공유 범위를 「(주)필츠 내 링크가 있는 사용자」로 두면 대표가 바로 열 수 있습니다.' }));
  }

  /* ---------- 기안 작성 ---------- */
  function newForm(view) {
    var d = draft || (draft = { type: 'vendor', title: '', payee: '', amount: '', vat: 'incl', account: ACCOUNTS[0], due: L.addDays(fmt.today(), 3), bank: '국민', acct: '', holder: '', purpose: '', checks: {}, att: [] });
    var bind = function (k) { return function () { d[k] = this.value; }; };
    var type = ui.select(Object.keys(TYPES).map(function (k) { return [k, TYPES[k].name]; }), d.type, { onchange: function () { d.type = this.value; d.checks = {}; d.first = false; HR.refresh(); } });
    var amount = h('input', { type: 'text', inputmode: 'numeric', value: d.amount ? (+d.amount).toLocaleString('ko-KR') : '', placeholder: '0', oninput: function () { var v = this.value.replace(/[^\d]/g, ''); d.amount = v; this.value = v ? (+v).toLocaleString('ko-KR') : ''; hint.textContent = v ? won(+v) + (d.vat === 'excl' ? ' + 부가세 ' + won(Math.round(+v * 0.1)) + ' = ' + won(Math.round(+v * 1.1)) : '') : ''; } });
    var hint = h('span', { class: 'meta', text: d.amount ? won(+d.amount) : '' });
    var T = TYPES[d.type], docs = T.docs, req = d.first && T.first ? T.first : [], pre = PRESETS.filter(function (x) { return x.k === d.preset; })[0];
    var quick = h('div', { class: 'pay-quick' }, h('span', { class: 'meta', text: '빠른 작성' }), PRESETS.map(function (x) {
      return h('button', { type: 'button', class: 'chip' + (d.preset === x.k ? ' on' : ''), text: x.name, onclick: function () {
        d.preset = x.k; d.type = x.type; d.account = x.account; d.vat = x.vat; d.checks = {}; d.first = false;
        if (!d.title.trim() || PRESETS.some(function (p) { return d.title === p.title; })) d.title = x.title;
        if (!d.purpose.trim() || PRESETS.some(function (p) { return d.purpose === p.purpose; })) d.purpose = x.purpose;
        HR.refresh();
      } });
    }));
    var checks = h('ul', { class: 'pay-docs' },
      T.first ? h('li', { class: 'pay-first' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!d.first, onchange: function () { d.first = this.checked; HR.refresh(); } }), ' 이 거래처와 첫 거래입니다')) : null,
      docs.map(function (x, i) {
        var must = req.indexOf(i) >= 0, cb = h('input', { type: 'checkbox', checked: !!d.checks[i], onchange: function () { d.checks[i] = this.checked; } });
        return h('li', { class: must ? 'must' : '' }, h('label', { class: 'check' }, cb, ' ' + x, must ? h('span', { class: 'red-text', text: ' *필수' }) : null));
      }));
    var m = ui.msg();
    var go = h('button', { class: 'btn', type: 'submit', text: '입금요청 올리기' });
    var f = h('form', { class: 'panel pay-form' }, h('div', { class: 'panel-head' }, ui.label('New request · 입금요청 기안'), h('a', { href: '#payreq/guide', class: 'link', text: '처리 가이드 보기 →' })), quick,
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
      ui.field('지출 목적 · 내용 *', (function () { var t = h('textarea', { rows: '5', maxlength: '1000', placeholder: '무엇을 왜 사는지, 수량 · 단가, 관련 프로젝트', oninput: bind('purpose') }); t.value = d.purpose; return t; })()),
      h('div', { class: 'field' }, h('label', { text: '준비 서류 (' + TYPES[d.type].name + ')' }), checks, pre && pre.note ? h('p', { class: 'pay-note', text: pre.note }) : null),
      h('div', { class: 'field' }, h('label', { text: '증빙 첨부 * (파일 또는 Google Drive 링크, 최대 5개)' }), attachBox(d.att, function () { HR.refresh(); }, MAX_FILES)), m, go,
      h('p', { class: 'note', text: '올리면 대표에게 승인 요청이 갑니다. 승인 후 입금되면 입금일 · 금액이 기록되고 알림이 옵니다. 계좌 정보와 증빙은 본인과 관리자만 볼 수 있습니다.' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var amt = +d.amount || 0;
      if (!d.title.trim() || !d.payee.trim()) return ui.err(m, '제목과 거래처 · 받는 분을 입력하세요.');
      if (amt <= 0) return ui.err(m, '입금할 금액을 입력하세요.');
      if (!d.due) return ui.err(m, '입금 희망일을 고르세요.');
      if (!/^[\d-]{6,30}$/.test(d.acct.trim()) || !d.holder.trim()) return ui.err(m, '계좌번호(숫자 · -)와 예금주를 확인하세요.');
      if (!d.purpose.trim()) return ui.err(m, '지출 목적 · 내용을 입력하세요.');
      if (!d.att.length) return ui.err(m, '증빙 서류를 1개 이상 첨부하세요 (파일 또는 Google Drive 링크).');
      var miss = (d.first && TYPES[d.type].first ? TYPES[d.type].first : []).filter(function (i) { return !d.checks[i]; });
      if (miss.length) return ui.err(m, '첫 거래는 ' + miss.map(function (i) { return TYPES[d.type].docs[i].replace(/ \(.*\)$/, ''); }).join(' · ') + '을(를) 첨부하고 체크해야 합니다.');
      go.disabled = true; m.textContent = '올리는 중…';
      var ref = db.collection('hr_payreq').doc(), total = d.vat === 'excl' ? Math.round(amt * 1.1) : amt;
      writeFiles(ref.id, S.mid, d.att, 'e', 'evidence').then(function (fileMeta) {
        var b = db.batch();
        b.set(ref, { memberId: S.mid, type: d.type, title: d.title.trim(), payee: d.payee.trim(), amount: amt, vat: d.vat, total: total, account: d.account, due: d.due,
          bank: d.bank, acct: d.acct.trim(), holder: d.holder.trim(), purpose: d.purpose.trim(), docs: TYPES[d.type].docs.filter(function (_, i) { return d.checks[i]; }),
          first: !!(d.first && TYPES[d.type].first), files: fileMeta, status: 'pending', createdAt: FV.serverTimestamp() });
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
    var rows = [['지급 유형', (TYPES[r.type] || TYPES.etc).name + (r.first ? ' · 첫 거래' : '')], ['요청자', HR.name(r.memberId)], ['거래처 · 받는 분', r.payee],
      ['입금할 금액', won(r.total) + (r.vat === 'excl' ? ' (공급가 ' + won(r.amount) + ' + 부가세)' : r.vat === 'incl' ? ' (부가세 포함)' : '')],
      ['입금 희망일', fmt.dateLong(r.due)], ['계좌', r.bank + ' ' + r.acct + ' · ' + r.holder], ['계정 과목', r.account], ['요청일', fmt.ts(r.createdAt)]];
    if (r.decidedAt) rows.push([r.status === 'rejected' ? '반려' : '승인', HR.name(r.decidedBy) + ' · ' + fmt.ts(r.decidedAt) + (r.reason ? ' · ' + r.reason : '')]);
    if (r.status === 'paid') rows.push(['입금 완료', fmt.dateLong(r.paidDate) + ' · ' + won(r.paidAmount) + (r.paidNote ? ' · ' + r.paidNote : '')]);
    var fl = h('ul', { class: 'list' }, (r.files || []).map(function (f) {
      return h('li', null, h('div', { class: 'grow' }, h('div', null, ui.tag(f.kind === 'receipt' ? '이체확인증' : f.kind === 'link' ? 'Google Drive' : '증빙', f.kind === 'receipt' || f.kind === 'link' ? 'ok' : 'mute'), ' ', f.name), h('div', { class: 'meta', text: f.kind === 'link' ? '팝업으로 열기' : size(f.size || 0) })),
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
          (rc.files[0] ? prepFile(rc.files[0]).then(function (x) { return writeFiles(id, r.memberId, [x], 'r' + Date.now().toString(36), 'receipt'); }) : Promise.resolve([])).then(function (meta) {
            if (meta.length) upd.files = (r.files || []).concat(meta);
            return db.doc('hr_payreq/' + id).update(upd);
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

  /* ---------- 처리 가이드 ---------- */
  function guide(view) {
    var steps = [['기안 작성', '「+ 입금요청 쓰기」 → 빠른 작성 버튼으로 틀을 고르고 금액 · 계좌 · 내용을 채웁니다.'],
      ['증빙 첨부', '유형별 준비 서류를 파일 또는 Google Drive 링크로 붙입니다. 첫 거래면 사업자등록증 · 통장 사본이 필수입니다.'],
      ['대표 승인', '대표에게 알림이 가고, 승인 또는 반려(사유 포함)됩니다. 반려되면 고쳐서 새로 올립니다.'],
      ['입금 · 완료', '대표가 입금 후 입금일 · 금액 · 이체확인증을 기록하면 요청자에게 완료 알림이 갑니다.']];
    var tb = h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', { text: '지급 유형' }), h('th', { text: '준비 서류' }))),
      h('tbody', null, Object.keys(TYPES).map(function (k) { return h('tr', null, h('td', { text: TYPES[k].name }), h('td', { text: TYPES[k].docs.join(' · ') })); })));
    var faq = [['입금 희망일은 언제로?', '승인 · 이체에 시간이 걸리니 최소 2영업일 뒤로 잡아 주세요. 급한 건은 제목 앞에 [긴급]을 붙이고 이유를 내용에 적습니다.'],
      ['부가세 포함 / 별도', '세금계산서 금액이 공급가 + 부가세면 「별도」를 고르고 공급가를 적으면 합계가 자동 계산됩니다. 견적이 이미 합계면 「포함」.'],
      ['개인에게 지급 (인플루언서 · 모델 · 프리랜서)', '사업소득 3.3% 원천징수 후 지급합니다. 금액은 원천징수 전 총액을 적고, 신분증 · 주민등록번호는 HR에 올리지 말고 대표에게 따로 전달합니다.'],
      ['파일이 크거나 여러 개일 때', '파일당 3MB · 최대 5개까지 올릴 수 있고, 사진은 자동으로 줄어듭니다. 더 크면 Google Drive에 올리고 링크로 첨부하세요.'],
      ['잘못 올렸을 때', '승인 전이면 요청 상세에서 「요청 취소」 후 다시 올립니다. 승인 뒤에는 대표에게 직접 말해 주세요.']];
    ui.put(view, h('a', { href: '#payreq/new', class: 'back', text: '← 입금요청 쓰기' }),
      ui.panel('Guide · 입금요청 처리 순서', null, h('ol', { class: 'pay-steps' }, steps.map(function (x, i) { return h('li', null, h('span', { class: 'pay-step-no', text: String(i + 1) }), h('div', null, h('b', { text: x[0] }), h('p', { class: 'meta', text: x[1] }))); }))),
      ui.panel('Documents · 유형별 준비 서류', null, h('div', { class: 'table-wrap flat' }, tb)),
      ui.panel('FAQ · 자주 묻는 것', null, h('dl', { class: 'pay-faq' }, faq.map(function (x) { return [h('dt', { text: x[0] }), h('dd', { text: x[1] })]; }))),
      h('div', { class: 'row' }, ui.btn('+ 입금요청 쓰기', function () { HR.go('payreq/new'); })));
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
      h('div', { class: 'toolbar' }, chips, h('a', { href: '#payreq/guide', class: 'link', text: '처리 가이드' }), ui.btn('+ 입금요청 쓰기', function () { HR.go('payreq/new'); })),
      h('div', { class: 'table-wrap' }, tb),
      h('p', { class: 'note', text: '흐름: 기안 작성 · 증빙 첨부 → 대표 승인(또는 반려) → 입금 → 입금 완료 기록. 단계마다 요청자와 대표에게 알림이 갑니다.' }));
  }

  HR.register('payreq', {
    render: function (view, parts) {
      ui.put(view, ui.head('Payment', '입금요청'));
      if (parts[0] === 'new') return newForm(view);
      if (parts[0] === 'guide') return guide(view);
      if (parts[0] === 'r' && parts[1]) return detail(view, parts[1]);
      listView(view);
    }
  });
  HR.payreq = { todo: function () { return S.isAdmin ? sorted(list()).filter(function (r) { return r.status === 'pending' || r.status === 'approved'; }) : []; } };
})();

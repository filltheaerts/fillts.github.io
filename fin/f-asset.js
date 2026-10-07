/* fillts Finance — [자산관리] 자산 · 투자
   자산 = fin_assets: 비품 · 기기(유형) / 특허 · 상표(무형) / 보증금. 실제 결제(통장 · 카드)에서 옮겨 적은 관리 목록이며 장부(감가상각)와는 별개.
   투자 = fin_invest: 주식 · 펀드 · 예금 등 현금을 굴린 것. 없으면 법인 현금 100%로 포트폴리오를 보여준다. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  F.assets = []; F.invest = [];
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    prevStart && prevStart(sub);
    sub(db.collection('fin_assets'), function (s) { F.assets = HR.rows(s); });
    sub(db.collection('fin_invest'), function (s) { F.invest = HR.rows(s); });
  };

  var ATYPE = [['equip', '비품 · 기기', '책상 · 의자 · 모니터 · 측정기처럼 회사가 들고 있는 물건'], ['ip', '특허 · 상표', '출원 · 등록한 지식재산 (무형자산)'], ['deposit', '보증금', '돌려받을 돈 — 임차 보증금 등'], ['book', '도서', '업무 관련 도서 — 권별 · 주문번호']];
  var AST = [['own', '보유'], ['pending', '출원 · 진행 중'], ['done', '처분 · 만료']];
  var aName = function (k) { return (ATYPE.filter(function (t) { return t[0] === k; })[0] || ['', k])[1]; };
  var V = { type: '', q: '' };

  // 도서: 카드 결제(예스24 등)와 권별 목록 대조 — 주문(결제일 · 금액) 단위
  function books() {
    var pays = F.card.filter(function (x) { return /도서/.test(x.sub || '') || /예스이십사|교보|알라딘|yes24/i.test(x.merchant || ''); });
    var list = F.assets.filter(function (a) { return a.type === 'book'; });
    var orders = pays.map(function (x) {
      var bs = list.filter(function (a) { return a.payRef === x.id || (!a.payRef && a.date === x.date); }), got = bs.filter(function (a) { return !a.placeholder; }).reduce(function (s, a) { return s + (+a.cost || 0); }, 0);
      return { x: x, books: bs.filter(function (a) { return !a.placeholder; }), got: got, gap: x.amount - got };
    }).sort(function (a, b) { return a.x.date < b.x.date ? 1 : -1; });
    var paid = pays.reduce(function (s, x) { return s + x.amount; }, 0);
    return { orders: orders, paid: paid, missing: orders.reduce(function (s, o) { return s + Math.max(0, o.gap); }, 0) };
  }
  function bookCheck(bk) {
    return ui.panel('도서 구매 대조 — 카드 결제 vs 권별 목록', null, h('div', { class: 'table-wrap flat' }, h('table', { class: 'table fin-table fin-narrow' },
      h('thead', null, h('tr', null, ['결제일', '서점', '카드 결제', '목록에 있는 책', '목록 합계', '상태'].map(function (x, i) { return h('th', { class: i === 2 || i === 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, bk.orders.map(function (o) {
        return h('tr', null, h('td', { class: 'meta', text: fmt.dot(o.x.date).slice(2) }), h('td', { text: o.x.merchant.replace(/\(SEYPAY\)|_문화비/g, '') }), h('td', { class: 'num', text: F.won(o.x.amount) }),
          h('td', { class: 'meta', text: o.books.length ? o.books.length + '권' : '—' }), h('td', { class: 'num', text: F.won(o.got) }),
          h('td', { class: o.gap > 0 ? 'red' : '', text: o.gap > 0 ? F.won(o.gap) + ' 목록 없음 — 주문 내역 필요' : o.gap < 0 ? '일치 (포인트 · 할인 ' + F.won(-o.gap) + ')' : '일치' }));
      })))), h('p', { class: 'meta', text: '서점 주문 내역(책 제목 · 가격)을 알려주시거나 아래 「자산 추가」에서 구분을 「도서」로 넣으면 대조됩니다. 결제일이 같은 책끼리 한 주문으로 묶습니다.' }));
  }

  // 검색 — 입력 중 다시 그리면 포커스가 날아가므로 커서 위치를 지켜 다시 붙인다
  var searchEl = null;
  function searchBox() {
    if (!searchEl) {
      searchEl = ui.input({ type: 'search', placeholder: '검색 — 책 제목 · 출판사 · 메모 · 업체', 'aria-label': '자산 검색', class: 'fin-asearch' });
      searchEl.addEventListener('input', function () { V.q = searchEl.value; var pos = searchEl.selectionStart; HR.refresh(); setTimeout(function () { searchEl.focus(); try { searchEl.setSelectionRange(pos, pos); } catch (e) {} }, 0); });
    }
    searchEl.value = V.q;
    return searchEl;
  }
  // 도서 독후감 링크 — 노션 · 구글 문서 · 블로그 등 주소
  function reviewCell(a, ed) {
    var wrap = h('div', { class: 'fin-review' });
    if (a.review) wrap.appendChild(h('a', { href: a.review, target: '_blank', rel: 'noopener', class: 'fin-rlink', text: '독후감 ↗' }));
    else wrap.appendChild(h('span', { class: 'meta', text: '독후감 없음' }));
    if (ed) {
      var inp = ui.input({ type: 'url', value: a.review || '', placeholder: '독후감 링크 붙여넣기 (https://…)', 'aria-label': '독후감 링크' });
      inp.addEventListener('change', function () {
        var v = inp.value.trim();
        if (v && !/^https?:\/\//i.test(v)) { ui.toast('https:// 로 시작하는 주소를 넣어 주세요.'); return; }
        db.doc('fin_assets/' + a.id).update({ review: v }).then(function () { ui.toast(v ? '독후감 링크를 저장했습니다.' : '링크를 지웠습니다.'); }).catch(ui.fail);
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
      wrap.appendChild(inp);
    }
    return wrap;
  }

  /* ---------- 자산 ---------- */
  function assetView(view) {
    var ed = F.canEdit();
    var all = F.assets.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    var live = all.filter(function (a) { return a.status !== 'done'; });
    var sum = function (k) { return live.filter(function (a) { return a.type === k; }).reduce(function (s, a) { return s + (+a.cost || 0); }, 0); };
    var qq = (V.q || '').trim().toLowerCase();
    var list = all.filter(function (a) { return (!V.type || a.type === V.type) && !a.placeholder && (!qq || [a.name, a.memo, a.vendor, a.author, a.publisher, a.category].join(' ').toLowerCase().indexOf(qq) >= 0); });
    var bk = books();
    var upd = function (a, patch) { db.doc('fin_assets/' + a.id).update(patch).catch(ui.fail); };
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['취득일', '구분', '저자', '자산', '취득가', '상태', '어디서 · 결제', ''].map(function (x, i) { return h('th', { class: i === 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, list.map(function (a) {
        var st = ui.select(AST, a.status || 'own', { 'aria-label': '상태', class: 'fin-cat', disabled: ed ? null : true, onchange: function () { upd(a, { status: this.value }); } });
        return h('tr', { class: a.status === 'done' ? 'muted' : '' }, h('td', { class: 'meta', text: a.date ? fmt.dot(a.date).slice(2) : '' }), h('td', null, h('div', { class: 'meta', text: aName(a.type) }), a.category ? h('span', { class: 'tag mute', text: a.category }) : null), h('td', { class: 'meta', text: a.author || '' }),
          h('td', null, h('div', { text: a.name }), a.publisher || a.memo ? h('div', { class: 'meta', text: [a.publisher, a.memo].filter(Boolean).join(' · ') }) : null, a.type === 'book' ? reviewCell(a, ed) : null), h('td', { class: 'num', text: F.won(+a.cost || 0) }), h('td', null, st),
          h('td', { class: 'meta', text: [a.vendor, a.pay].filter(Boolean).join(' · ') }),
          h('td', null, ed ? ui.confirmBtn('삭제', function () { db.doc('fin_assets/' + a.id).delete().catch(ui.fail); }) : null));
      })));
    // 추가 폼
    var form = null;
    if (ed) {
      var ty = ui.select(ATYPE.map(function (t) { return [t[0], t[1]]; }), 'equip', { 'aria-label': '구분' });
      var nm = ui.input({ placeholder: '자산 이름 (예: 델 모니터 24인치)' }), dt = ui.input({ type: 'date', value: fmt.today() }), cs = ui.input({ inputmode: 'numeric', placeholder: '취득가 (원)' });
      var au = ui.input({ placeholder: '저자 (도서)' }), vd = ui.input({ placeholder: '어디서 (업체)' }), mm = ui.input({ placeholder: '메모 (출원번호 · 위치 등)' }), msg = ui.msg();
      form = ui.panel('자산 추가', null, h('div', { class: 'fin-inline-form' }, ui.field('구분', ty), ui.field('저자', au), ui.field('자산', nm), ui.field('취득일', dt), ui.field('취득가', cs), ui.field('업체', vd), ui.field('메모', mm),
        ui.btn('추가', function () {
          if (!nm.value.trim()) return ui.fail('자산 이름을 적어 주세요.', msg);
          db.collection('fin_assets').add({ type: ty.value, name: nm.value.trim(), date: dt.value, cost: F.parseWon(cs.value), vendor: vd.value.trim(), author: au.value.trim(), memo: mm.value.trim(), status: ty.value === 'ip' ? 'pending' : 'own', pay: '직접 입력', createdAt: FV.serverTimestamp() })
            .then(function () { ui.toast('추가했습니다.'); HR.refresh(); }).catch(function (e) { ui.fail(e, msg); });
        })), msg);
    }
    ui.put(view, ui.head('자산관리', '자산'),
      F.kpi([['자산 합계 (보유)', F.man(sum('equip') + sum('ip') + sum('deposit') + sum('book')), '', live.length + '건 · 취득가 기준'], ['비품 · 기기', F.man(sum('equip')), '', '유형자산'], ['특허 · 상표', F.man(sum('ip')), '', '무형자산 · 출원 비용'], ['보증금', F.man(sum('deposit')), '', '돌려받을 돈'],
        ['도서 (누적)', F.man(bk.paid), bk.missing ? 'red' : '', live.filter(function (a) { return a.type === 'book' && !a.placeholder; }).length + '권 · 목록 ' + (bk.missing ? F.man(bk.missing) + ' 미입력' : '전부 있음')]], 'five'),
      V.type === 'book' ? bookCheck(bk) : null,
      h('div', { class: 'toolbar' }, F.seg([['', '전체']].concat(ATYPE.map(function (t) { return [t[0], t[1]]; })), V.type, function (k) { V.type = k; }, '구분'), searchBox()),
      ui.panel('보유 자산 목록', h('span', { class: 'meta', text: list.length + '건' }), list.length ? h('div', { class: 'table-wrap flat' }, tb) : ui.empty('아직 등록한 자산이 없습니다.')),
      form || F.readOnlyNote(),
      h('p', { class: 'note', text: '통장 · 법인카드로 실제 결제한 것을 관리용으로 모은 목록입니다. 세무 장부에서는 소액 비품을 비용(소모품비)으로 처리하기도 하므로, 장부상 자산과 다를 수 있습니다. 특허 · 상표는 출원 대리 비용 기준입니다.' }));
  }

  /* ---------- 투자 ---------- */
  var ITYPE = [['stock', '주식'], ['fund', '펀드 · ETF'], ['deposit', '예금 · 적금'], ['bond', '채권'], ['etc', '기타']];
  var iName = function (k) { return (ITYPE.filter(function (t) { return t[0] === k; })[0] || ['', k])[1]; };
  function investView(view) {
    var ed = F.canEdit(), bal = F.balance(), cash = bal.amount || 0;
    var live = F.invest.filter(function (x) { return x.status !== 'closed'; });
    var inv = live.reduce(function (a, x) { return a + (+x.value || +x.cost || 0); }, 0), total = cash + inv;
    var pct = function (v) { return total ? Math.round(v / total * 1000) / 10 + '%' : '—'; };
    var parts = [{ label: '현금 (통장)', v: cash }].concat(ITYPE.map(function (t) { return { label: t[1], v: live.filter(function (x) { return x.type === t[0]; }).reduce(function (a, x) { return a + (+x.value || +x.cost || 0); }, 0) }; })).filter(function (p) { return p.v; });
    var bar = h('div', { class: 'inv-bar' }, parts.map(function (p, i) { var s = h('span', { class: 'inv-seg inv-seg' + i, title: p.label + ' ' + F.won(p.v) + '원 · ' + pct(p.v) }); s.style.width = (total ? p.v / total * 100 : 0) + '%'; return s; }));
    var legend = h('div', { class: 'inv-legend' }, parts.map(function (p, i) { return h('span', null, h('i', { class: 'inv-dot inv-seg' + i }), p.label + ' ' + pct(p.v) + ' · ' + F.man(p.v)); }));
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['매수일', '종류', '종목 · 상품', '투입 원금', '평가액', '수익률', ''].map(function (x, i) { return h('th', { class: i >= 3 && i <= 5 ? 'num' : '', text: x }); }))),
      h('tbody', null, F.invest.map(function (x) {
        var val = ui.input({ inputmode: 'numeric', value: x.value ? String(x.value) : '', placeholder: '평가액', disabled: ed ? null : true });
        val.addEventListener('change', function () { db.doc('fin_invest/' + x.id).update({ value: F.parseWon(val.value), valuedAt: fmt.today() }).catch(ui.fail); });
        var r = x.value && x.cost ? (x.value - x.cost) / x.cost * 100 : null;
        return h('tr', null, h('td', { class: 'meta', text: x.date ? fmt.dot(x.date).slice(2) : '' }), h('td', { class: 'meta', text: iName(x.type) }), h('td', { text: x.name }),
          h('td', { class: 'num', text: F.won(+x.cost || 0) }), h('td', { class: 'num' }, val), h('td', { class: 'num' + (r < 0 ? ' red' : ''), text: r == null ? '' : r.toFixed(1) + '%' }),
          h('td', null, ed ? ui.confirmBtn('삭제', function () { db.doc('fin_invest/' + x.id).delete().catch(ui.fail); }) : null));
      })));
    var form = null;
    if (ed) {
      var ty = ui.select(ITYPE, 'fund', { 'aria-label': '종류' }), nm = ui.input({ placeholder: '종목 · 상품 이름' }), dt = ui.input({ type: 'date', value: fmt.today() }), cs = ui.input({ inputmode: 'numeric', placeholder: '투입 원금 (원)' }), msg = ui.msg();
      form = ui.panel('투자 추가', null, h('div', { class: 'fin-inline-form' }, ui.field('종류', ty), ui.field('종목 · 상품', nm), ui.field('매수일', dt), ui.field('원금', cs),
        ui.btn('추가', function () {
          if (!nm.value.trim() || !F.parseWon(cs.value)) return ui.fail('이름과 원금을 적어 주세요.', msg);
          db.collection('fin_invest').add({ type: ty.value, name: nm.value.trim(), date: dt.value, cost: F.parseWon(cs.value), value: F.parseWon(cs.value), status: 'open', createdAt: FV.serverTimestamp() })
            .then(function () { ui.toast('추가했습니다.'); HR.refresh(); }).catch(function (e) { ui.fail(e, msg); });
        })), msg);
    }
    ui.put(view, ui.head('자산관리', '투자'),
      F.kpi([['운용 자산 합계', F.man(total), '', '통장 현금 + 투자 평가액'], ['현금 비중', pct(cash), '', F.man(cash) + ' · 통장 잔액'], ['투자 비중', pct(inv), '', live.length + '건 · ' + F.man(inv)]], 'three'),
      ui.panel('포트폴리오', null, bar, legend, inv ? null : h('p', { class: 'meta', text: '아직 투자한 자산이 없어 법인 현금 100%입니다. 주식 · 펀드 · 예금 등으로 굴리면 아래에 추가하세요.' })),
      F.invest.length ? ui.panel('투자 목록', null, h('div', { class: 'table-wrap flat' }, tb)) : null,
      form || F.readOnlyNote(),
      h('p', { class: 'note', text: '현금은 통장 잔액(설정 › 계좌 · 잔액 + 거래내역 마지막 잔액) 기준이며, 정책자금 전용통장도 포함됩니다. 평가액은 직접 고쳐 적으면 수익률이 계산됩니다.' }));
  }

  HR.register('asset', { render: assetView });
  HR.register('invest', { render: investView });
})();

/* fillts Finance — 재고: 품목(완제품 · 원료 · 부자재 · 판촉물) · 입고/매입 · 출고/사용 · 단위 원가(개당 마진)
   컬렉션: fin_inv_items(품목) · fin_inv_moves(입고 · 출고 기록) · fin_config/main.inv(판매가 · 배송비 등 단위 원가 가정, 월 판매 예상)
   재고 수량 = 입고 완료 − 출고. 발주만 된 것은 「입고 예정」으로 따로 본다. 금액은 공급가(부가세 별도) 기준, 화면에서 부가세 포함으로 바꿔 볼 수 있다. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  F.inv = { items: [], moves: [] };
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    prevStart(sub);
    sub(db.collection('fin_inv_items'), function (s) { F.inv.items = HR.rows(s); });
    sub(db.collection('fin_inv_moves'), function (s) { F.inv.moves = HR.rows(s); });
  };
  var TYPE = [['product', '완제품'], ['raw', '원료'], ['pack', '부자재 · 포장'], ['promo', '샘플 · 판촉물'], ['setup', '초도 제작비 (동판 · 목형)']];
  var OUT_REASON = [['sale', '판매 출고'], ['sample', '샘플 · 증정 · 촬영'], ['produce', '생산 투입'], ['loss', '폐기 · 불량'], ['adjust', '실사 조정']];
  var PAY = [['unknown', '결제 확인 필요'], ['sched', '지출예정에서 관리'], ['unpaid', '미지급'], ['paid', '지급 완료']];
  var V = { vat: true, tab: '' };
  var nm = function (list, k) { return (list.filter(function (x) { return x[0] === k; })[0] || [k, k || ''])[1]; };
  var econ = function () { return Object.assign({ price: 35000, ship: 4100, box: 605, pgRate: 3.5, adRate: 30 }, (F.cfg.inv || {}).econ || {}); };
  var invCfg = function () { return F.cfg.inv || {}; };
  var saveInv = function (patch) { return F.cfgSet({ inv: Object.assign({}, invCfg(), patch) }); };

  /* ---------- 계산 ---------- */
  F.invStock = function () {
    var by = {};
    F.inv.items.forEach(function (it) { by[it.id] = { it: it, recv: 0, ordered: 0, out: 0, buyQty: 0, buyAmt: 0, buyVat: 0 }; });
    F.inv.moves.forEach(function (m) {
      var x = by[m.itemId]; if (!x) return;
      var q = +m.qty || 0;
      if (m.kind === 'in') {
        if (m.status === 'received') x.recv += q; else x.ordered += q;
        if (m.reason !== 'adjust') { x.buyQty += q; x.buyAmt += +m.amount || 0; x.buyVat += +m.vat || 0; }
      } else x.out += q;
    });
    Object.keys(by).forEach(function (k) {
      var x = by[k];
      x.onHand = x.recv - x.out;
      x.unit = x.buyQty ? x.buyAmt / x.buyQty : 0;                  // 평균 단가 (공급가)
      x.unitVat = x.buyQty ? (x.buyAmt + x.buyVat) / x.buyQty : 0;   // 부가세 포함
      var setup = x.it.type === 'setup';
      x.value = setup ? 0 : x.onHand * x.unit; x.valueIn = setup ? 0 : x.ordered * x.unit;
      var per = +x.it.perProduct || 0;
      x.covers = per > 0 ? Math.floor((x.onHand + x.ordered) / per) : null;   // 완제품 몇 개분
    });
    return by;
  };
  F.invUnitCost = function (vat) {
    var st = F.invStock(), parts = [];
    Object.keys(st).forEach(function (k) {
      var x = st[k], per = +x.it.perProduct || 0;
      if (per > 0) parts.push({ it: x.it, per: per, cost: (vat ? x.unitVat : x.unit) * per });
    });
    parts.sort(function (a, b) { return b.cost - a.cost; });
    return { parts: parts, total: parts.reduce(function (a, p) { return a + p.cost; }, 0) };
  };
  // 미지급 매입 → 런웨이 일회성 지출 (결제 예정일이 있는 것만)
  F.extraOut = function (from, to) {
    return F.inv.moves.filter(function (m) { return m.kind === 'in' && m.pay === 'unpaid' && m.dueDate && m.dueDate >= from && m.dueDate <= to; })
      .map(function (m) { return { date: m.dueDate, amount: (+m.amount || 0) + (+m.vat || 0), title: '매입 · ' + ((F.inv.items.filter(function (i) { return i.id === m.itemId; })[0] || {}).name || '') }; });
  };
  var money = function (amt, vat) { return F.won(V.vat ? (amt || 0) + (vat || 0) : (amt || 0)); };
  var itemName = function (id) { return (F.inv.items.filter(function (i) { return i.id === id; })[0] || {}).name || '(삭제된 품목)'; };
  var sortedItems = function () { var o = { product: 0, raw: 1, pack: 2, promo: 3, setup: 4 }; return F.inv.items.slice().sort(function (a, b) { return (o[a.type] - o[b.type]) || ((a.order || 0) - (b.order || 0)) || (a.name < b.name ? -1 : 1); }); };

  /* ---------- 현황 ---------- */
  function overview(view) {
    var st = F.invStock(), items = sortedItems(), ic = invCfg(), uc = F.invUnitCost(V.vat);
    var sum = function (f) { return Object.keys(st).reduce(function (a, k) { return a + f(st[k]); }, 0); };
    var vatRate = function (x) { return x.buyAmt ? x.buyVat / x.buyAmt : 0; };
    var val = sum(function (x) { return x.value * (V.vat ? 1 + vatRate(x) : 1); }), valIn = sum(function (x) { return x.valueIn * (V.vat ? 1 + vatRate(x) : 1); });
    var pend = F.inv.moves.filter(function (m) { return m.kind === 'in' && m.pay !== 'paid' && m.reason !== 'adjust'; });
    var setupSum = F.inv.moves.filter(function (m) { var it = F.inv.items.filter(function (i) { return i.id === m.itemId; })[0]; return m.kind === 'in' && it && it.type === 'setup'; }).reduce(function (a, m) { return a + (+m.amount || 0) + (V.vat ? +m.vat || 0 : 0); }, 0);
    var pendSum = pend.reduce(function (a, m) { return a + (+m.amount || 0) + (V.vat ? +m.vat || 0 : 0); }, 0);
    var prod = items.filter(function (i) { return i.type === 'product'; })[0], px = prod && st[prod.id];
    var cap = Object.keys(st).map(function (k) { return st[k]; }).filter(function (x) { return x.covers != null && x.it.type !== 'product'; }).sort(function (a, b) { return a.covers - b.covers; })[0];
    var mu = +ic.monthlyUnits || 0, lead = +ic.leadDays || 60;
    var finished = px ? px.onHand + px.ordered : 0;
    var months = mu ? finished / mu : null;
    var outDate = months != null ? HR.L.addDays(fmt.today(), Math.round(months * 30.4)) : '';
    var reorder = outDate ? HR.L.addDays(outDate, -lead) : '';

    // 결제 기준으로 나눈다: 매입이 전부 「지급 완료」인 품목 = 보유 재고(보관 장소 관리) / 하나라도 남은 품목 = 대기열
    var movesOf = function (it) { return F.inv.moves.filter(function (m) { return m.kind === 'in' && m.itemId === it.id; }); };
    var isPaid = function (it) { var ms = movesOf(it); return ms.length && ms.every(function (m) { return m.pay === 'paid'; }); };
    var owned = items.filter(isPaid), queue = items.filter(function (it) { return !isPaid(it); });
    var row = function (it, q) {
      var x = st[it.id], r = vatRate(x), mult = V.vat ? 1 + r : 1, ms = movesOf(it);
      var left = ms.filter(function (m) { return m.pay !== 'paid'; }), leftSum = left.reduce(function (a, m) { return a + (+m.amount || 0) + (+m.vat || 0); }, 0);
      var payTxt = left.map(function (m) { return nm(PAY, m.pay || 'unknown') + (m.dueDate ? ' · ' + fmt.dot(m.dueDate).slice(2) : ''); }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(' / ');
      return h('tr', { class: F.canEdit() ? 'clickable' : '', onclick: F.canEdit() ? function () { HR.go('inv/items/' + it.id); } : null },
        h('td', null, ui.tag(nm(TYPE, it.type), it.type === 'product' ? 'red' : 'mute')), h('td', null, h('div', { class: 'strong', text: it.name }), it.memo ? h('div', { class: 'meta', text: it.memo }) : null),
        q ? h('td', { class: 'meta', text: it.vendor || '' }) : h('td', null, h('div', { text: it.location || '— 보관 장소 미지정' }), it.vendor ? h('div', { class: 'meta', text: it.vendor }) : null),
        h('td', { class: 'num strong', text: (x.onHand + x.ordered).toLocaleString('ko-KR') + (it.unit || '') }),
        h('td', { class: 'meta', text: x.onHand ? '입고 ' + x.onHand.toLocaleString('ko-KR') + (x.ordered ? ' · 입고 예정 ' + x.ordered.toLocaleString('ko-KR') : '') : x.ordered ? '입고 예정' : '' }),
        q ? h('td', { class: 'meta', text: payTxt || '매입 기록 없음' }) : h('td', { class: 'num', text: x.unit ? Math.round(x.unit * mult).toLocaleString('ko-KR') + '원' : '' }),
        h('td', { class: 'num', text: q ? (leftSum ? F.won(leftSum) : '') : F.won((x.value + x.valueIn) * mult) }),
        q ? null : h('td', { class: 'num' + (cap && x === cap ? ' red' : ''), text: x.covers != null ? x.covers.toLocaleString('ko-KR') + '개분' : '' }));
    };
    var table = function (list, q) {
      var hd = q ? ['구분', '품목', '거래처', '수량', '입고', '결제 상태', '남은 금액'] : ['구분', '품목', '보관 장소', '수량', '입고', '평균 단가', '재고 금액', '몇 개분'];
      return h('table', { class: 'table fin-table fin-inv-tb' }, h('thead', null, h('tr', null, hd.map(function (x, i) { return h('th', { class: x === '수량' || x === '평균 단가' || x === '재고 금액' || x === '남은 금액' || x === '몇 개분' ? 'num' : '', text: x }); }))),
        h('tbody', null, list.length ? list.map(function (it) { return row(it, q); }) : h('tr', null, h('td', { colspan: String(hd.length), class: 'empty', text: q ? '대기 중인 품목이 없습니다.' : '결제가 끝난 품목이 없습니다.' }))));
    };
    var tb = h('div', null,
      ui.panel('보유 재고 — 결제 완료 · 보관 장소', h('span', { class: 'meta', text: owned.length + '개 품목' }), h('div', { class: 'table-wrap flat' }, table(owned, false)),
        h('p', { class: 'meta', text: '수량 = 입고 완료 + 입고 예정. 「몇 개분」 = 수량 ÷ 제품 1개당 사용량, 빨간 숫자가 다음 생산의 병목. 줄을 누르면 품목 · 보관 장소를 고칩니다.' })),
      ui.panel('대기열 — 결제가 남은 품목', h('span', { class: 'meta', text: queue.length + '개 품목' }), h('div', { class: 'table-wrap flat' }, table(queue, true)),
        h('p', { class: 'meta', text: '선금 · 잔금이 남았거나 결제 확인이 필요한 품목입니다. 매입 탭에서 「지급 완료」로 바꾸면 위 보유 재고로 올라갑니다.' })));

    var muIn = ui.input({ type: 'number', min: '0', value: mu ? String(mu) : '', placeholder: '예: 800', disabled: F.canEdit() ? null : true });
    muIn.addEventListener('change', function () { saveInv({ monthlyUnits: +muIn.value || null }).then(function () { ui.toast('저장했습니다.'); }).catch(ui.fail); });
    var ldIn = ui.input({ type: 'number', min: '0', value: String(lead), disabled: F.canEdit() ? null : true });
    ldIn.addEventListener('change', function () { saveInv({ leadDays: +ldIn.value || 60 }).catch(ui.fail); });

    ui.put(view, F.kpi([['재고 자산', F.man(val), '', '입고 완료분 · ' + (V.vat ? '부가세 포함' : '공급가')], ['입고 예정 (발주)', F.man(valIn), '', '아직 입고 확인 전'],
      ['지급 완료 아닌 매입', F.man(pendSum), '', pend.length + '건 · 결제 일정은 지출예정' + (setupSum ? ' · 초도비 ' + F.man(setupSum) : '')], ['완제품', finished.toLocaleString('ko-KR') + '개', '', px ? '재고 ' + px.onHand + ' · 예정 ' + px.ordered : '품목 없음'],
      ['제품 1개 원가', F.won(Math.round(uc.total)), '', '원료 · 부자재 포함'], ['생산 한도', cap ? cap.covers.toLocaleString('ko-KR') + '개' : '-', '', cap ? '가장 먼저 떨어지는 것: ' + cap.it.name : '']]),
      tb,
      null);
  }

  /* ---------- 입고 · 매입 ---------- */
  function inForm(done) {
    var items = sortedItems(), item = ui.select(items.map(function (i) { return [i.id, i.name]; }), items[0] && items[0].id);
    var qty = ui.input({ type: 'number', min: '0', step: 'any' }), amt = F.moneyInput({}), vat = F.moneyInput({});
    var date = ui.input({ type: 'date', value: fmt.today() }), st = ui.select([['ordered', '발주 (입고 전)'], ['received', '입고 완료']], 'ordered');
    var inv = ui.select([['issued', '세금계산서 발행'], ['none', '미발행']], 'issued'), pay = ui.select(PAY, 'unpaid'), due = ui.input({ type: 'date' });
    var memo = ui.input({ maxlength: 200 }), msg = ui.msg();
    amt.addEventListener('blur', function () { if (!vat.value) { var v = Math.round(F.parseWon(amt.value) * 0.1); vat.value = v ? v.toLocaleString('ko-KR') : ''; } });
    return h('div', { class: 'stack fin-form' },
      h('div', { class: 'row' }, ui.field('품목', item, 'grow'), ui.field('수량', qty), ui.field('공급가 (원)', amt), ui.field('부가세', vat)),
      h('div', { class: 'row' }, ui.field('발주 · 입고일', date), ui.field('상태', st), ui.field('세금계산서', inv), ui.field('결제', pay), ui.field('결제 예정일', due)),
      ui.field('메모', memo), msg,
      h('div', { class: 'row' }, ui.btn('매입 추가', function () {
        var it = F.inv.items.filter(function (i) { return i.id === item.value; })[0];
        var d = { itemId: item.value, kind: 'in', reason: 'purchase', qty: +qty.value || 0, amount: F.parseWon(amt.value), vat: F.parseWon(vat.value), date: date.value, status: st.value,
          invoice: inv.value, pay: pay.value, dueDate: due.value, vendor: (it && it.vendor) || '', memo: memo.value.trim(), by: S.mid, createdAt: FV.serverTimestamp() };
        if (!d.qty || !d.date) return ui.err(msg, '수량과 날짜를 입력하세요.');
        db.collection('fin_inv_moves').add(d).then(function () { ui.toast('추가했습니다.'); done && done(); }).catch(function (e) { ui.fail(e, msg); });
      }), ui.btn('취소', function () { done && done(); }, 'btn-line')));
  }
  function purchases(view, parts) {
    var ed = F.canEdit();
    if (parts[0] === 'new' && ed) { ui.put(view, ui.panel('New · 매입 추가', null, inForm(function () { HR.go('inv/in'); }))); return; }
    var list = F.inv.moves.filter(function (m) { return m.kind === 'in'; }).sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    var tot = list.reduce(function (a, m) { return a + (+m.amount || 0); }, 0), totV = list.reduce(function (a, m) { return a + (+m.vat || 0); }, 0);
    var sel = function (opts, val, field, m) {
      return ui.select(opts, val, { disabled: ed ? null : true, class: 'fin-cat', onchange: function () { var p = {}; p[field] = this.value; db.doc('fin_inv_moves/' + m.id).update(p).catch(ui.fail); } });
    };
    // 결제 기준으로 두 표: 결제 남음(예정 · 확인 필요 · 미지급 · 지출예정 관리) / 지급 완료
    var itemCell = function (m) {
      return h('td', null, h('div', { class: 'strong', text: itemName(m.itemId) }),
        h('div', { class: 'meta', text: [m.vendor, m.invoice === 'issued' ? '세금계산서' : '', m.memo].filter(Boolean).join(' · ') }),
        ed ? h('div', { class: 'fin-rowact' }, ui.confirmBtn('삭제', function () { db.doc('fin_inv_moves/' + m.id).delete().catch(ui.fail); }, 'btn-link btn-xs')) : null);
    };
    var sum = function (m) { return (+m.amount || 0) + (+m.vat || 0); };
    var stSel = function (m) { return sel([['ordered', '발주'], ['received', '입고 완료']], m.status || 'ordered', 'status', m); };
    var open = list.filter(function (m) { return m.pay !== 'paid'; }), paid = list.filter(function (m) { return m.pay === 'paid'; });
    var openTb = h('table', { class: 'table fin-table fin-inv-tb' }, h('thead', null, h('tr', null, ['발주일', '품목 · 거래처', '수량', '금액 (부가세 포함)', '결제', '결제 예정일', '입고'].map(function (x, i) { return h('th', { class: i === 2 || i === 3 ? 'num' : '', text: x }); }))),
      h('tbody', null, open.length ? open.map(function (m) {
        var due = ui.input({ type: 'date', value: m.dueDate || '', disabled: ed ? null : true });
        due.addEventListener('change', function () { db.doc('fin_inv_moves/' + m.id).update({ dueDate: due.value }).catch(ui.fail); });
        return h('tr', null, h('td', { class: 'fin-date', text: fmt.dot(m.date).slice(2) }), itemCell(m), h('td', { class: 'num', text: (+m.qty || 0).toLocaleString('ko-KR') }),
          h('td', { class: 'num' }, h('div', { class: 'strong', text: F.won(sum(m)) }), h('div', { class: 'meta', text: '공급가 ' + F.won(m.amount) })),
          h('td', null, sel(PAY, m.pay || 'unknown', 'pay', m)), h('td', null, due), h('td', null, stSel(m)));
      }) : h('tr', null, h('td', { colspan: '7', class: 'empty', text: '결제가 남은 매입이 없습니다.' }))));
    var paidTb = h('table', { class: 'table fin-table fin-inv-tb' }, h('thead', null, h('tr', null, ['발주일', '품목 · 거래처', '수량', '공급가', '부가세', '합계', '입고', '결제'].map(function (x, i) { return h('th', { class: i >= 2 && i <= 5 ? 'num' : '', text: x }); }))),
      h('tbody', null, paid.length ? paid.map(function (m) {
        return h('tr', null, h('td', { class: 'fin-date', text: fmt.dot(m.date).slice(2) }), itemCell(m), h('td', { class: 'num', text: (+m.qty || 0).toLocaleString('ko-KR') }),
          h('td', { class: 'num', text: F.won(m.amount) }), h('td', { class: 'num meta', text: F.won(m.vat) }), h('td', { class: 'num strong', text: F.won(sum(m)) }),
          h('td', null, stSel(m)), h('td', null, sel(PAY, 'paid', 'pay', m)));
      }) : h('tr', null, h('td', { colspan: '8', class: 'empty', text: '지급 완료한 매입이 없습니다.' }))));
    var openSum = open.reduce(function (a, m) { return a + sum(m); }, 0), paidSum = paid.reduce(function (a, m) { return a + sum(m); }, 0);
    var tb = h('div', null,
      ui.panel('결제 남음 — 예정 · 확인 필요', h('span', { class: 'meta', text: open.length + '건 · ' + F.won(openSum) }), h('div', { class: 'table-wrap flat' }, openTb),
        h('p', { class: 'meta', text: '「지출예정에서 관리」는 선금 · 잔금처럼 나눠 내는 건(예: 에코먼트 선금 50% 9/22 지급 · 잔금 50% 11/5 예정)입니다. 다 내면 「지급 완료」로 바꾸면 아래로 내려갑니다.' })),
      ui.panel('지급 완료', h('span', { class: 'meta', text: paid.length + '건 · ' + F.won(paidSum) }), h('div', { class: 'table-wrap flat' }, paidTb)));
    ui.put(view, F.kpi([['매입 합계 (공급가)', F.man(tot)], ['부가세', F.man(totV), '', '매입세액 공제 대상'], ['합계', F.man(tot + totV)],
      ['결제 미확인', list.filter(function (m) { return (m.pay || 'unknown') === 'unknown'; }).length + '건', '', ''], ['미지급', F.man(list.filter(function (m) { return m.pay === 'unpaid'; }).reduce(function (a, m) { return a + (+m.amount || 0) + (+m.vat || 0); }, 0))],
      ['입고 전', list.filter(function (m) { return m.status !== 'received'; }).length + '건']], 'fin-kpi-sm'),
      ed ? h('div', { class: 'toolbar' }, ui.btn('+ 매입 추가', function () { HR.go('inv/in/new'); }, 'btn-sm')) : null,
      tb,
      h('p', { class: 'note', text: '입고 완료로 바꾸면 재고 수량에 들어갑니다. 결제를 「미지급」으로 두고 결제 예정일을 넣으면 런웨이의 일회성 지출로 들어갑니다(지급 완료 · 결제 확인 필요는 런웨이에서 제외). 재고 매입은 비용이 아니라 재고 자산이고, 팔리는 시점에 매출원가가 됩니다.' }));
  }

  /* ---------- 출고 · 사용 ---------- */
  function outs(view) {
    var ed = F.canEdit(), items = sortedItems();
    var item = ui.select(items.map(function (i) { return [i.id, i.name]; }), items[0] && items[0].id), reason = ui.select(OUT_REASON, 'sale');
    var qty = ui.input({ type: 'number', min: '0', step: 'any' }), date = ui.input({ type: 'date', value: fmt.today() }), memo = ui.input({ maxlength: 200, placeholder: '예: 자사몰 10월 판매분 · 촬영용' }), msg = ui.msg();
    var withParts = h('input', { type: 'checkbox', checked: true }); var wpLabel = h('label', { class: 'check' }, withParts, ' 완제품 판매면 함께 나가는 부자재(제품 1개당 사용량 기준)도 같이 출고 — 생산 전 부자재만 따로 관리할 때는 해제');
    var list = F.inv.moves.filter(function (m) { return m.kind === 'out'; }).sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['날짜', '품목', '사유', '수량', '메모', ''].map(function (x, i) { return h('th', { class: i === 3 ? 'num' : '', text: x }); }))),
      h('tbody', null, list.length ? list.map(function (m) {
        return h('tr', null, h('td', { class: 'fin-date', text: fmt.dot(m.date).slice(2) }), h('td', { text: itemName(m.itemId) }), h('td', { text: nm(OUT_REASON, m.reason) }),
          h('td', { class: 'num', text: (+m.qty || 0).toLocaleString('ko-KR') }), h('td', { class: 'meta', text: m.memo || '' }),
          ed ? h('td', null, ui.confirmBtn('삭제', function () { db.doc('fin_inv_moves/' + m.id).delete().catch(ui.fail); })) : h('td'));
      }) : h('tr', null, h('td', { colspan: '6', class: 'empty', text: '출고 기록이 없습니다.' }))));
    ui.put(view, ed ? ui.panel('Out · 출고 · 사용 기록', null, h('div', { class: 'stack fin-form' },
      h('div', { class: 'row' }, ui.field('품목', item, 'grow'), ui.field('사유', reason), ui.field('수량', qty), ui.field('날짜', date)), ui.field('메모', memo), wpLabel, msg,
      ui.btn('출고 기록', function () {
        var q = +qty.value || 0; if (!q) return ui.err(msg, '수량을 입력하세요.');
        var b = db.batch(), base = { kind: 'out', reason: reason.value, date: date.value, memo: memo.value.trim(), by: S.mid, createdAt: FV.serverTimestamp() };
        b.set(db.collection('fin_inv_moves').doc(), Object.assign({ itemId: item.value, qty: q }, base));
        var it = F.inv.items.filter(function (i) { return i.id === item.value; })[0];
        if (it && it.type === 'product' && reason.value === 'sale' && withParts.checked) {
          F.inv.items.filter(function (i) { return i.type === 'promo' && +i.perProduct > 0 && i.withSale; }).forEach(function (p) {
            b.set(db.collection('fin_inv_moves').doc(), Object.assign({ itemId: p.id, qty: q * (+p.perProduct), auto: true }, base, { memo: '판매 동봉 · ' + base.memo }));
          });
        }
        b.commit().then(function () { qty.value = ''; ui.ok(msg, '기록했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
      }))) : F.readOnlyNote(), ui.panel('History · 출고 기록', h('span', { class: 'meta', text: list.length + '건' }), h('div', { class: 'table-wrap flat' }, tb)),
      h('p', { class: 'note', text: '튜브 · 단상자 · 원료처럼 생산 때 들어가는 것은 생산이 끝나면 「생산 투입」으로 출고하세요. 샘플 · 브랜드카드처럼 판매 때 같이 나가는 판촉물은 품목에서 「판매 시 동봉」을 켜 두면 완제품 판매 출고와 함께 자동으로 빠집니다.' }));
  }

  /* ---------- 단위 원가 ---------- */
  function contribution() {
    var e = econ(), uc = F.invUnitCost(true);
    var pg = e.price * (+e.pgRate || 0) / 100, ad = e.price * (+e.adRate || 0) / 100;
    var varCost = uc.total + (+e.ship || 0) + (+e.box || 0) + pg;
    return { e: e, uc: uc, pg: pg, ad: ad, varCost: varCost, unit: e.price - varCost - ad };
  }
  function unitView(view) {
    var c = contribution(), e = c.e, ed = F.canEdit();
    var field = function (label, key, suffix) {
      var i = ui.input({ type: 'number', step: 'any', value: e[key] != null ? String(e[key]) : '', disabled: ed ? null : true });
      i.addEventListener('change', function () { var ne = Object.assign({}, e); ne[key] = +i.value || 0; saveInv({ econ: ne }).then(function () { ui.toast('저장했습니다.'); }).catch(ui.fail); });
      return ui.field(label + (suffix ? ' (' + suffix + ')' : ''), i);
    };
    var rows = c.uc.parts.map(function (p) { return [p.it.name + (p.per !== 1 ? ' × ' + p.per + (p.it.unit || '') : ''), p.cost]; })
      .concat([['배송비', +e.ship || 0], ['박스비', +e.box || 0], ['결제수수료 ' + e.pgRate + '%', c.pg]]);
    var tb = h('table', { class: 'table fin-table fin-narrow' }, h('tbody', null,
      rows.map(function (r) { return h('tr', null, h('td', { text: r[0] }), h('td', { class: 'num', text: F.won(Math.round(r[1])) }), h('td', { class: 'num meta', text: (r[1] / e.price * 100).toFixed(1) + '%' })); }),
      h('tr', { class: 'fin-sum' }, h('td', { text: '변동비 합계' }), h('td', { class: 'num', text: F.won(Math.round(c.varCost)) }), h('td', { class: 'num', text: (c.varCost / e.price * 100).toFixed(1) + '%' })),
      h('tr', null, h('td', { text: '광고비 ' + e.adRate + '%' }), h('td', { class: 'num', text: F.won(Math.round(c.ad)) }), h('td', { class: 'num meta', text: e.adRate + '%' })),
      h('tr', { class: 'fin-sum' }, h('td', { text: '판매가' }), h('td', { class: 'num', text: F.won(e.price) }), h('td')),
      h('tr', { class: 'fin-sum fin-mine' }, h('td', { text: '개당 이익 (공헌이익)' }), h('td', { class: 'num' + (c.unit < 0 ? ' red' : ''), text: F.won(Math.round(c.unit)) }), h('td', { class: 'num', text: (c.unit / e.price * 100).toFixed(1) + '%' }))));
    var buy = F.inv.moves.filter(function (m) { return m.kind === 'in' && m.reason !== 'adjust'; }).reduce(function (a, m) { return a + (+m.amount || 0) + (+m.vat || 0); }, 0);
    var bep = c.unit > 0 ? Math.ceil(buy / c.unit) : null;
    var steps = [1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000];
    var sc = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, h('th', { text: '판매 수량' }), steps.map(function (n) { return h('th', { class: 'num', text: n.toLocaleString('ko-KR') }); }))),
      h('tbody', null, [['매출', function (n) { return e.price * n; }], ['변동비', function (n) { return c.varCost * n; }], ['광고비', function (n) { return c.ad * n; }], ['공헌이익', function (n) { return c.unit * n; }]].map(function (r, i) {
        return h('tr', { class: i === 3 ? 'fin-sum' : '' }, h('td', { text: r[0] }), steps.map(function (n) { return h('td', { class: 'num', text: F.man(r[1](n)) }); }));
      })));
    ui.put(view, F.kpi([['판매가', F.won(e.price)], ['제품 원가', F.won(Math.round(c.uc.total)), '', '부가세 포함 단가 기준'], ['변동비율', (c.varCost / e.price * 100).toFixed(1) + '%'],
      ['개당 이익', F.won(Math.round(c.unit)), c.unit < 0 ? 'red' : ''], ['이익률', (c.unit / e.price * 100).toFixed(1) + '%'], ['매입 회수 수량', bep ? bep.toLocaleString('ko-KR') + '개' : '-', '', '매입 합계 ' + F.man(buy) + ' ÷ 개당 이익']]),
      h('div', { class: 'two-col fin-two' }, ui.panel('Unit · 1개 팔면', null, h('div', { class: 'table-wrap flat' }, tb)),
        ui.panel('Assumptions · 가정', null, h('div', { class: 'stack fin-form' }, h('div', { class: 'row' }, field('판매가', 'price', '원'), field('배송비', 'ship', '원'), field('박스비', 'box', '원')),
          h('div', { class: 'row' }, field('결제수수료', 'pgRate', '%'), field('광고비', 'adRate', '% of 판매가'))),
          h('p', { class: 'meta', text: '제품 원가는 품목의 「제품 1개당 사용량」 × 평균 매입 단가(부가세 포함)로 자동 계산합니다. 시트 「발주견적 체크」의 1개당 원가 5,246원과 같은 방식입니다.' }))),
      ui.panel('Scenario · 판매 수량별', null, h('div', { class: 'table-wrap flat' }, sc)));
  }

  /* ---------- 품목 ---------- */
  function itemsView(view, parts) {
    var ed = F.canEdit(), cur = parts[0] ? F.inv.items.filter(function (i) { return i.id === parts[0]; })[0] : null;
    if (parts[0] && (cur || parts[0] === 'new') && ed) {
      var it = cur || { type: 'pack', unit: '개', perProduct: 1 };
      var n = ui.input({ value: it.name || '', maxlength: 60 }), ty = ui.select(TYPE, it.type), un = ui.input({ value: it.unit || '개', maxlength: 6 });
      var vd = ui.input({ value: it.vendor || '', maxlength: 30 }), lc = ui.input({ value: it.location || '', maxlength: 30, placeholder: '예: 에코먼트 · 품고' });
      var per = ui.input({ type: 'number', step: 'any', min: '0', value: it.perProduct != null ? String(it.perProduct) : '0' });
      var ws = h('input', { type: 'checkbox', checked: !!it.withSale }), mm = ui.input({ value: it.memo || '', maxlength: 120 }), msg = ui.msg();
      ui.put(view, ui.panel(cur ? 'Item · 품목 수정' : 'Item · 품목 추가', null, h('div', { class: 'stack fin-form' },
        h('div', { class: 'row' }, ui.field('품목명', n, 'grow'), ui.field('구분', ty), ui.field('단위', un)),
        h('div', { class: 'row' }, ui.field('거래처', vd), ui.field('보관처', lc), ui.field('제품 1개당 사용량', per)),
        h('label', { class: 'check' }, ws, ' 판매 시 동봉 (완제품 판매 출고 때 자동으로 함께 출고)'), ui.field('메모', mm), msg,
        h('div', { class: 'row' }, ui.btn('저장', function () {
          var d = { name: n.value.trim(), type: ty.value, unit: un.value.trim(), vendor: vd.value.trim(), location: lc.value.trim(), perProduct: +per.value || 0, withSale: ws.checked, memo: mm.value.trim() };
          if (!d.name) return ui.err(msg, '품목명을 입력하세요.');
          (cur ? db.doc('fin_inv_items/' + cur.id).set(d, { merge: true }) : db.collection('fin_inv_items').add(d)).then(function () { HR.go('inv'); }).catch(function (e) { ui.fail(e, msg); });
        }), ui.btn('취소', function () { HR.go('inv'); }, 'btn-line'),
          cur ? ui.confirmBtn('품목 삭제', function () { db.doc('fin_inv_items/' + cur.id).delete().then(function () { HR.go('inv'); }).catch(ui.fail); }) : null))));
      return;
    }
    var ul = h('ul', { class: 'list' }, sortedItems().map(function (i) {
      return h('li', null, ui.tag(nm(TYPE, i.type), 'mute'), h('a', { class: 'grow', href: ed ? '#inv/items/' + i.id : null, text: i.name }),
        h('span', { class: 'meta', text: [i.vendor, i.location, +i.perProduct ? '1개당 ' + i.perProduct + (i.unit || '') : '', i.withSale ? '판매 동봉' : ''].filter(Boolean).join(' · ') }));
    }));
    ui.put(view, ed ? h('div', { class: 'toolbar' }, ui.btn('+ 품목 추가', function () { HR.go('inv/items/new'); }, 'btn-sm')) : null, ui.panel('Items · 품목', null, ul));
  }

  function render(view, parts) {
    var sub = parts[0] || '';
    ui.put(view, ui.head('Inventory', '재고', h('div', { class: 'row' }, F.seg([[true, '부가세 포함'], [false, '공급가']], V.vat, function (k) { V.vat = k; }, '금액 기준'))),
      ui.tabs([['', '현황'], ['in', '입고 · 매입'], ['out', '출고 · 사용'], ['items', '품목']], sub, 'inv'));
    if (sub === 'in') purchases(view, parts.slice(1));
    else if (sub === 'out') outs(view);
    else if (sub === 'unit') { HR.go('unit'); return; }
    else if (sub === 'items') itemsView(view, parts.slice(1));
    else overview(view);
  }
  HR.register('inv', { render: render });
})();

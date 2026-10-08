/* fillts Logistics — 화면
   재고 = 마지막 실사 수량 + 이후 입고 − 이후 출고 (logis_moves). 소진 속도 = 실측(최근 90일 출고 + 실사 차이) 우선, 없으면 계획(월 출고 예상 ÷ 30)
   재발주점 = 하루 소진 × (리드타임 + 안전일수) · 1회 발주량 = max(MOQ, 하루 소진 × 커버 일수 → 발주 단위 올림) · 발주 주기 = 1회 발주량 ÷ 하루 소진
   부자재는 기준 품목(base)의 하루 소진 × 제품 1개당 사용량(usePer)으로 따라간다 */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, L = HR.L;
  var FV = firebase.firestore.FieldValue;
  var G = { items: [], moves: [], vendors: [], specs: [], doc: null, loaded: 0 };
  HR.APP.onStart = function (sub) {
    var done = function () { G.loaded++; };
    sub(db.collection('logis_items'), function (s) { G.items = HR.rows(s).sort(bySort); done(); });
    sub(db.collection('logis_moves'), function (s) { G.moves = HR.rows(s); });
    sub(db.collection('logis_vendors'), function (s) { G.vendors = HR.rows(s).sort(bySort); });
    sub(db.collection('logis_specs'), function (s) { G.specs = HR.rows(s).sort(bySort); });
    sub(db.doc('logis_docs/main'), function (s) { try { G.doc = s.exists ? JSON.parse(s.data().json || '{}') : {}; } catch (e) { G.doc = {}; } });
  };
  function bySort(a, b) { return (a.sort || 999) - (b.sort || 999) || String(a.name || a.label || '').localeCompare(String(b.name || b.label || '')); }
  var canEdit = function () { return S.isAdmin || HR.appLevel('logis') === 'edit'; };
  var D = function () { return G.doc || {}; };
  var today = function () { return fmt.today(); };
  var n0 = function (v) { return Math.round(+v || 0).toLocaleString('ko-KR'); };
  var addDays = function (d, n) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + Math.round(n)); return t.toISOString().slice(0, 10); };
  var wait = function (view) { if (G.loaded) return false; ui.put(view, ui.empty('불러오는 중…')); return true; };
  var head = function (view, title, right) { ui.put(view, ui.head('Logistics · 물류', title, right)); };
  var KIND = [['product', '완제품'], ['pack', '부자재'], ['raw', '원료'], ['promo', '샘플 · 판촉물']];
  var WHERE = [['wekeep', '위킵 화성센터'], ['oem', 'OEM (에코먼트)'], ['office', '(주)필츠']];
  var nm = function (list, k) { return (list.filter(function (x) { return x[0] === k; })[0] || [k, k || ''])[1]; };
  var vendor = function (id) { return G.vendors.filter(function (v) { return v.id === id; })[0] || null; };
  var item = function (id) { return G.items.filter(function (i) { return i.id === id; })[0] || null; };

  /* ---------- 복사 ---------- */
  function copy(text, btn, label) {
    var done = function () { if (!btn) return ui.toast('복사했습니다.'); var t = label || btn.textContent; btn.textContent = '복사됨 ✓'; btn.classList.add('lg-copied'); setTimeout(function () { btn.textContent = t; btn.classList.remove('lg-copied'); }, 1400); };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done).catch(fallback);
    fallback();
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { ui.toast('복사하지 못했습니다 — 직접 선택해 복사하세요.'); }
      ta.remove();
    }
  }
  function copyBtn(getText, label, cls) {
    var b = h('button', { type: 'button', class: 'btn btn-line btn-xs lg-copy ' + (cls || ''), text: label || '복사' });
    b.addEventListener('click', function () { copy(typeof getText === 'function' ? getText() : getText, b, label || '복사'); });
    return b;
  }

  /* ---------- 계산 ---------- */
  function ledger(it) {
    var ms = G.moves.filter(function (m) { return m.itemId === it.id; })
      .sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : ((a.at && a.at.seconds) || 0) - ((b.at && b.at.seconds) || 0); });
    var stock = 0, counted = false, lastCount = '', used = 0, from = addDays(today(), -90), first = '';
    ms.forEach(function (m) {
      var q = +m.qty || 0, inWin = (m.date || '') >= from;
      if (inWin && !first) first = m.date;
      if (m.type === 'count') { if (counted && inWin && stock > q) used += stock - q; stock = q; counted = true; lastCount = m.date; }
      else if (m.type === 'in') stock += q;
      else if (m.type === 'out') { stock -= q; if (inWin) used += q; }
    });
    var span = first ? L.daysBetween(first, today()) : 0;
    return { stock: stock, moves: ms, lastCount: lastCount, measured: span >= 14 && used > 0 ? used / span : 0, span: span };
  }
  function daily(it, seen) {
    seen = seen || {};
    if (it.base && it.base !== it.id && !seen[it.base]) { var b = item(it.base); if (b) { seen[it.id] = 1; var r = daily(b, seen); return { d: r.d * (+it.usePer || 1), src: '「' + b.name + '」 × ' + (+it.usePer || 1) }; } }
    var lg = ledger(it);
    if (lg.measured) return { d: lg.measured, src: '실측 ' + lg.span + '일' };
    if (+it.monthly) return { d: +it.monthly / 30, src: '계획 월 ' + n0(it.monthly) };
    return { d: 0, src: '' };
  }
  function plan(it) {
    var lg = ledger(it), r = daily(it), d = r.d;
    var lead = +it.leadDays || 0, safety = it.safetyDays != null && it.safetyDays !== '' ? +it.safetyDays : 14, cover = +it.coverDays || 60;
    var moq = +it.moq || 0, step = +it.step || moq || 1;
    var onOrder = it.order && +it.order.qty ? +it.order.qty : 0;
    var p = { it: it, stock: lg.stock, lastCount: lg.lastCount, d: d, src: r.src, lead: lead, safety: safety, onOrder: onOrder };
    if (!d) { p.state = 'nodata'; return p; }
    p.rop = Math.ceil(d * (lead + safety));
    p.daysLeft = lg.stock / d;
    var want = Math.max(moq, Math.ceil(d * cover / step) * step);
    p.qty = want; p.cycle = want / d;
    var gap = (lg.stock + onOrder - p.rop) / d;
    p.orderBy = addDays(today(), Math.floor(gap));
    p.state = gap <= 0 ? 'now' : gap <= 14 ? 'soon' : 'ok';
    p.runout = addDays(today(), Math.floor(p.daysLeft));
    if (onOrder && it.order.eta && lg.stock > 0 && p.runout < it.order.eta) p.state = 'gap';   // 입고 예정일 전에 바닥난다
    return p;
  }
  var ST = { gap: ['입고 전 품절 위험', 'lg-st-now'], now: ['지금 발주', 'lg-st-now'], soon: ['2주 안 발주', 'lg-st-soon'], ok: ['여유', 'lg-st-ok'], nodata: ['소진 속도 입력 필요', 'lg-st-none'] };
  var stTag = function (p) { var s = ST[p.state]; return h('span', { class: 'lg-st ' + s[1], text: s[0] }); };
  var days = function (n) { return n == null || !isFinite(n) ? '—' : Math.floor(n) + '일'; };

  /* ---------- 저장 ---------- */
  function save(ref, data, msg) {
    data.updatedAt = FV.serverTimestamp(); data.updatedBy = S.mid || '';
    return ref.set(data, { merge: true }).then(function () { if (msg) ui.toast(msg); HR.refresh(); }).catch(function (e) { ui.toast('저장하지 못했습니다 — ' + (e.code || e.message)); });
  }
  function addMove(itemId, type, qty, date, note) {
    return db.collection('logis_moves').add({ itemId: itemId, type: type, qty: +qty || 0, date: date || today(), note: note || '', by: S.mid || '', at: FV.serverTimestamp() })
      .then(function () { ui.toast({ count: '실사 수량을 기록했습니다.', in: '입고를 기록했습니다.', out: '출고를 기록했습니다.' }[type]); })
      .catch(function (e) { ui.toast('기록하지 못했습니다 — ' + (e.code || e.message)); });
  }

  /* ================= [home] 한판 ================= */
  function home(view) {
    if (wait(view)) return;
    var ps = G.items.map(plan), urgent = ps.filter(function (p) { return p.state === 'now' || p.state === 'soon' || p.state === 'gap'; });
    var d = D(), open = (d.open || []).slice().sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
    var inbound = G.items.filter(function (i) { return i.order && +i.order.qty; });
    var quick = G.specs.filter(function (s) { return s.pin; });
    head(view, '물류 한판', h('span', { class: 'meta', text: d.asOf ? '기본사항 기준 ' + fmt.dot(d.asOf) : '' }));
    ui.put(view,
      h('dl', { class: 'summary four' },
        sumBox('지금 발주 · 품절 위험', ps.filter(function (p) { return p.state === 'now' || p.state === 'gap'; }).length + '건', urgent.length ? 'red' : ''),
        sumBox('2주 안 발주', ps.filter(function (p) { return p.state === 'soon'; }).length + '건'),
        sumBox('입고 대기', inbound.length + '건'),
        sumBox('물류 미결', open.length + '건', open.length ? 'red' : '')),
      h('div', { class: 'lg-grid' },
        ui.panel('① 재고 · 재발주 시점', h('a', { class: 'link', href: '#stock', text: '재고 실사 →' }),
          ps.length ? stockMini(ps) : ui.empty('품목이 없습니다. 「재고 · 재발주」에서 추가하세요.')),
        ui.panel('② 위킵 입고 — 바로 복사', h('a', { class: 'link', href: '#spec', text: '사양 전체 →' }),
          quick.length ? h('div', { class: 'lg-specs' }, quick.map(specRow)) : ui.empty('「위킵 사양」에서 핀(★)을 꽂은 항목이 여기 나옵니다.')),
        ui.panel('③ 발주 메일', h('a', { class: 'link', href: '#mail', text: '메일 쓰기 →' }),
          urgent.length ? h('ul', { class: 'list' }, urgent.map(function (p) {
            var v = vendor(p.it.vendorId);
            return h('li', null, h('div', { class: 'grow' }, h('div', { class: 'strong', text: p.it.name }), h('div', { class: 'meta', text: (v ? v.name : '발주처 미지정') + ' · 권장 ' + n0(p.qty) + (p.it.unit || '개') + ' · 리드타임 ' + p.lead + '일' })),
              h('a', { class: 'btn btn-xs', href: '#mail/' + (p.it.vendorId || ''), text: '메일 쓰기' }));
          })) : h('p', { class: 'meta', text: '지금 재발주할 품목이 없습니다. 발주처를 골라 언제든 메일을 쓸 수 있습니다.' })),
        ui.panel('④ 런칭 전 물류 미결', h('a', { class: 'link', href: '#order', text: '발주 현황 →' }),
          open.length ? h('ol', { class: 'lg-open' }, open.map(function (o) {
            return h('li', null, h('div', { class: 'lg-open-h' }, dueTag(o.due), h('span', { class: 'strong', text: o.t })), o.why ? h('p', { class: 'meta', text: o.why }) : null);
          })) : ui.empty('미결이 없습니다.'))),
      inbound.length ? ui.panel('입고 대기 — 발주했고 아직 안 들어온 것', null, inboundTable(inbound)) : null);
  }
  function sumBox(t, v, cls) { return h('div', null, h('dt', { text: t }), h('dd', { class: cls || '', text: v })); }
  function dueTag(dt) {
    if (!dt) return h('span', { class: 'lg-d lg-d-none', text: '상시' });
    var n = L.daysBetween(today(), dt);
    return h('span', { class: 'lg-d' + (n < 0 ? ' lg-d-over' : n <= 14 ? ' lg-d-near' : ''), text: n < 0 ? 'D+' + (-n) : n === 0 ? 'D-DAY' : 'D-' + n });
  }
  function stockMini(ps) {
    return h('div', { class: 'table-wrap flat' }, h('table', { class: 'table lg-table' },
      h('thead', null, h('tr', null, ['품목', '현재고', '남은 일수', '발주 시점', ''].map(function (c, i) { return h('th', { class: i && i < 3 ? 'num' : '', text: c }); }))),
      h('tbody', null, ps.map(function (p) {
        return h('tr', null, h('td', null, h('div', { class: 'strong', text: p.it.name }), h('div', { class: 'meta', text: nm(WHERE, p.it.where) })),
          h('td', { class: 'num', text: n0(p.stock) }), h('td', { class: 'num', text: days(p.daysLeft) }),
          h('td', { class: 'nowrap', text: p.orderBy ? fmt.dot(p.orderBy) : '—' }), h('td', null, stTag(p)));
      }))));
  }
  function inboundTable(list) {
    return h('div', { class: 'table-wrap flat' }, h('table', { class: 'table lg-table' },
      h('thead', null, h('tr', null, ['품목', '발주처', '수량', '발주일', '입고 예정', ''].map(function (c, i) { return h('th', { class: i === 2 ? 'num' : '', text: c }); }))),
      h('tbody', null, list.map(function (it) {
        var o = it.order, v = vendor(it.vendorId);
        return h('tr', null, h('td', { class: 'strong', text: it.name }), h('td', { text: v ? v.name : '' }), h('td', { class: 'num', text: n0(o.qty) }),
          h('td', { class: 'nowrap', text: fmt.dot(o.date || '') }), h('td', { class: 'nowrap' }, o.eta ? fmt.dot(o.eta) + ' ' : '', o.eta ? dueTag(o.eta) : null),
          h('td', null, canEdit() ? ui.btn('입고 처리', function () { receive(it); }, 'btn-xs') : null));
      }))));
  }
  function receive(it) {
    var o = it.order || {};   // 발주 수량 그대로 입고 처리 — 실제 차이는 실사 수량으로 맞춘다
    addMove(it.id, 'in', o.qty, today(), '발주 ' + fmt.dot(o.date || '') + ' 입고').then(function () {
      save(db.collection('logis_items').doc(it.id), { order: FV.delete(), lastOrder: Object.assign({}, o, { recv: today() }) });
    });
  }

  /* ================= [stock] 재고 · 재발주 ================= */
  function stock(view, parts) {
    if (wait(view)) return;
    if (parts[0] === 'edit') return itemForm(view, parts[1] === 'new' ? null : item(parts[1]));
    var ps = G.items.map(plan);
    head(view, '재고 · 재발주 주기', canEdit() ? h('a', { class: 'btn btn-sm', href: '#stock/edit/new', text: '+ 품목' }) : null);
    ui.put(view,
      h('p', { class: 'lg-lead' }, '① 실사 수량을 넣는다 → ② 소진 속도가 자동 계산된다(기록이 2주 넘게 쌓이기 전에는 「월 출고 예상」을 씁니다) → ③ 리드타임 · 안전일수로 ', h('b', { text: '발주해야 하는 날' }), '과 ', h('b', { text: '1회 발주량 · 발주 주기' }), '가 나온다.'),
      ps.length ? ps.map(stockCard) : ui.empty('품목이 없습니다.'),
      h('p', { class: 'note' }, '재발주점 = 하루 소진 × (리드타임 + 안전일수). 발주 시점 = (현재고 + 입고 대기 − 재발주점) ÷ 하루 소진 뒤. 1회 발주량 = 하루 소진 × 커버 일수를 발주 단위로 올림, MOQ 이상. 부자재는 기준 품목 소진 × 제품 1개당 사용량을 따라갑니다.'));
  }
  function stockCard(p) {
    var it = p.it, v = vendor(it.vendorId), lg = ledger(it), ed = canEdit();
    var qIn = ui.input({ type: 'number', min: '0', inputmode: 'numeric', placeholder: '수량', 'aria-label': it.name + ' 수량' });
    var dIn = ui.input({ type: 'date', value: today(), 'aria-label': '날짜' });
    var act = function (type) { return function () { var q = qIn.value; if (q === '' || +q < 0) return ui.toast('수량을 넣어 주세요.'); addMove(it.id, type, q, dIn.value); qIn.value = ''; }; };
    return h('section', { class: 'panel lg-card' },
      h('div', { class: 'lg-card-h' },
        h('div', null, h('div', { class: 'lg-card-name', text: it.name }), h('div', { class: 'meta', text: [nm(KIND, it.kind), nm(WHERE, it.where), v ? v.name : '', it.spec].filter(Boolean).join(' · ') })),
        h('div', { class: 'lg-card-r' }, stTag(p), ed ? h('a', { class: 'btn btn-line btn-xs', href: '#stock/edit/' + it.id, text: '설정' }) : null)),
      h('dl', { class: 'lg-nums' },
        num('현재고', n0(p.stock) + (it.unit || '개'), p.lastCount ? '실사 ' + fmt.dot(p.lastCount) : '실사 기록 없음'),
        num('하루 소진', p.d ? (p.d < 10 ? p.d.toFixed(1) : n0(p.d)) : '—', p.src || '월 출고 예상을 넣으세요'),
        num('남은 일수', days(p.daysLeft), p.runout ? '소진 ' + fmt.dot(p.runout) : ''),
        num('재발주점', p.rop != null ? n0(p.rop) : '—', '리드 ' + p.lead + ' + 안전 ' + p.safety + '일'),
        num('발주할 날', p.orderBy ? fmt.dot(p.orderBy) : '—', p.onOrder ? '입고 대기 ' + n0(p.onOrder) + ' 포함' : '', p.state === 'now' ? 'red' : ''),
        num('1회 발주량 · 주기', p.qty ? n0(p.qty) : '—', p.cycle ? '약 ' + Math.round(p.cycle) + '일마다 (' + (p.cycle / 30).toFixed(1) + '개월)' : '')),
      ed ? h('div', { class: 'lg-move' }, qIn, dIn,
        ui.btn('실사 수량', act('count'), 'btn-xs'), ui.btn('입고 +', act('in'), 'btn-line btn-xs'), ui.btn('출고 −', act('out'), 'btn-line btn-xs'),
        p.state === 'now' || p.state === 'soon' ? h('a', { class: 'btn btn-xs lg-mail-go', href: '#mail/' + (it.vendorId || ''), text: '발주 메일 →' }) : null) : null,
      lg.moves.length ? h('details', { class: 'lg-hist' }, h('summary', { text: '기록 ' + lg.moves.length + '건' }),
        h('ul', { class: 'list' }, lg.moves.slice().reverse().slice(0, 30).map(function (m) {
          return h('li', null, h('span', { class: 'nowrap meta', text: fmt.dot(m.date || '') }), h('span', { class: 'grow', text: { count: '실사 = ', in: '입고 + ', out: '출고 − ' }[m.type] + n0(m.qty) + (m.note ? ' · ' + m.note : '') }),
            ed ? ui.confirmBtn('삭제', function () { db.collection('logis_moves').doc(m.id).delete(); }) : null);
        }))) : null);
  }
  function num(t, v, sub, cls) { return h('div', null, h('dt', { text: t }), h('dd', { class: cls || '', text: v }), sub ? h('span', { class: 'meta', text: sub }) : null); }

  function itemForm(view, it) {
    if (!canEdit()) return HR.go('stock');
    it = it || {};
    var f = {
      name: ui.input({ value: it.name || '', maxlength: 80 }), spec: ui.input({ value: it.spec || '', maxlength: 160 }),
      kind: ui.select(KIND, it.kind || 'product'), where: ui.select(WHERE, it.where || 'wekeep'),
      vendorId: ui.select([['', '(미지정)']].concat(G.vendors.map(function (v) { return [v.id, v.name]; })), it.vendorId || ''),
      unit: ui.input({ value: it.unit || '개', maxlength: 8 }),
      monthly: ui.input({ type: 'number', min: '0', value: it.monthly || '' }),
      base: ui.select([['', '(없음 — 직접 입력)']].concat(G.items.filter(function (x) { return x.id !== it.id; }).map(function (x) { return [x.id, x.name]; })), it.base || ''),
      usePer: ui.input({ type: 'number', min: '0', step: 'any', value: it.usePer || 1 }),
      leadDays: ui.input({ type: 'number', min: '0', value: it.leadDays || '' }), safetyDays: ui.input({ type: 'number', min: '0', value: it.safetyDays != null ? it.safetyDays : 14 }),
      coverDays: ui.input({ type: 'number', min: '1', value: it.coverDays || 60 }), moq: ui.input({ type: 'number', min: '0', value: it.moq || '' }),
      step: ui.input({ type: 'number', min: '0', value: it.step || '' }), price: ui.input({ type: 'number', min: '0', step: 'any', value: it.price || '' }),
      note: h('textarea', { rows: 3, maxlength: 2000 }, it.note || ''), sort: ui.input({ type: 'number', value: it.sort || '' }),
      oQty: ui.input({ type: 'number', min: '0', value: it.order ? it.order.qty || '' : '' }), oDate: ui.input({ type: 'date', value: it.order ? it.order.date || '' : '' }), oEta: ui.input({ type: 'date', value: it.order ? it.order.eta || '' : '' })
    };
    head(view, it.id ? '품목 설정 — ' + it.name : '품목 추가', h('a', { class: 'btn btn-line btn-sm', href: '#stock', text: '← 목록' }));
    ui.put(view, ui.panel('기본', null, h('div', { class: 'lg-form' },
      ui.field('품목명', f.name), ui.field('규격', f.spec), ui.field('구분', f.kind), ui.field('보관처', f.where), ui.field('발주처', f.vendorId), ui.field('단위', f.unit), ui.field('단가 (원 · VAT 별도)', f.price), ui.field('정렬 순서', f.sort))),
      ui.panel('소진 속도', null, h('div', { class: 'lg-form' },
        ui.field('월 출고 예상 (계획값)', f.monthly), ui.field('기준 품목 (부자재면 완제품 선택)', f.base), ui.field('제품 1개당 사용량', f.usePer)),
        h('p', { class: 'note', text: '실사 · 출고 기록이 14일 넘게 쌓이면 실측값이 계획값보다 우선합니다. 기준 품목을 고르면 그 품목 소진 × 사용량을 따라갑니다.' })),
      ui.panel('재발주 기준', null, h('div', { class: 'lg-form' },
        ui.field('리드타임 (발주→입고, 일)', f.leadDays), ui.field('안전일수', f.safetyDays), ui.field('1회 발주로 버틸 기간 (일)', f.coverDays), ui.field('MOQ', f.moq), ui.field('발주 단위 (비우면 MOQ)', f.step))),
      ui.panel('진행 중 발주 (입고 전)', null, h('div', { class: 'lg-form' }, ui.field('발주 수량', f.oQty), ui.field('발주일', f.oDate), ui.field('입고 예정일', f.oEta))),
      ui.panel('메모', null, f.note),
      h('div', { class: 'lg-actions' },
        ui.btn('저장', function () {
          if (!f.name.value.trim()) return ui.toast('품목명을 넣어 주세요.');
          var numv = function (el) { return el.value === '' ? null : +el.value; };
          var data = { name: f.name.value.trim(), spec: f.spec.value.trim(), kind: f.kind.value, where: f.where.value, vendorId: f.vendorId.value, unit: f.unit.value.trim() || '개',
            monthly: numv(f.monthly), base: f.base.value, usePer: numv(f.usePer) || 1, leadDays: numv(f.leadDays), safetyDays: numv(f.safetyDays), coverDays: numv(f.coverDays) || 60,
            moq: numv(f.moq), step: numv(f.step), price: numv(f.price), note: f.note.value, sort: numv(f.sort),
            order: +f.oQty.value ? { qty: +f.oQty.value, date: f.oDate.value || today(), eta: f.oEta.value || '' } : FV.delete() };
          var ref = it.id ? db.collection('logis_items').doc(it.id) : db.collection('logis_items').doc();
          save(ref, data, '저장했습니다.').then(function () { HR.go('stock'); });
        }),
        it.id ? ui.confirmBtn('품목 삭제', function () { db.collection('logis_items').doc(it.id).delete().then(function () { HR.go('stock'); }); }) : null));
  }

  /* ================= [mail] 발주 메일 ================= */
  var M = { vid: '', qty: {}, eta: '', note: null };
  function mail(view, parts) {
    if (wait(view)) return;
    if (parts[0] === 'vendor') return vendorForm(view, parts[1] === 'new' ? null : vendor(parts[1]));
    if (parts[0] !== undefined && parts[0] !== M.vid) { M.vid = parts[0]; M.qty = {}; M.eta = ''; }
    var v = vendor(M.vid);
    head(view, '발주 메일', canEdit() ? h('a', { class: 'btn btn-line btn-sm', href: '#mail/vendor/new', text: '+ 발주처' }) : null);
    var pick = h('div', { class: 'lg-vendors' }, G.vendors.map(function (x) {
      var cnt = G.items.filter(function (i) { return i.vendorId === x.id; }).map(plan).filter(function (p) { return p.state === 'now' || p.state === 'soon'; }).length;
      return h('a', { class: 'lg-vchip' + (x.id === M.vid ? ' on' : ''), href: '#mail/' + x.id }, x.name, cnt ? h('span', { class: 'lg-vchip-n', text: String(cnt) }) : null);
    }));
    ui.put(view, h('p', { class: 'lg-lead', text: '발주처를 고르면 그 업체 품목이 권장 수량으로 채워집니다. 수량 · 희망 입고일만 확인하고 제목 · 본문을 복사해 보내세요. 보낸 뒤 「발주 기록」을 누르면 입고 대기에 올라갑니다.' }), pick);
    if (!v) return ui.put(view, G.vendors.length ? ui.empty('위에서 발주처를 고르세요.') : ui.empty('발주처가 없습니다.'));
    var its = G.items.filter(function (i) { return i.vendorId === v.id; });
    var ps = its.map(plan);
    var maxLead = Math.max.apply(null, [0].concat(its.map(function (i) { return +i.leadDays || 0; })));
    if (!M.eta) M.eta = addDays(today(), maxLead || 30);
    ps.forEach(function (p) { if (M.qty[p.it.id] == null) M.qty[p.it.id] = p.state === 'now' || p.state === 'soon' || its.length === 1 ? (p.qty || +p.it.moq || 0) : 0; });
    var etaIn = ui.input({ type: 'date', value: M.eta, 'aria-label': '희망 입고일', onchange: function () { M.eta = this.value; HR.refresh(); } });
    var rows = ps.map(function (p) {
      var qi = ui.input({ type: 'number', min: '0', value: M.qty[p.it.id] || '', class: 'lg-qty', 'aria-label': p.it.name + ' 발주 수량', onchange: function () { M.qty[p.it.id] = +this.value || 0; HR.refresh(); } });
      return h('tr', null, h('td', null, h('div', { class: 'strong', text: p.it.name }), h('div', { class: 'meta', text: p.it.spec || '' })),
        h('td', null, stTag(p)), h('td', { class: 'num', text: n0(p.stock) }), h('td', { class: 'num', text: p.qty ? n0(p.qty) : '—' }), h('td', null, qi),
        h('td', { class: 'num', text: p.it.price ? n0(p.it.price * (M.qty[p.it.id] || 0)) : '—' }));
    });
    var text = buildMail(v, ps);
    ui.put(view,
      ui.panel(v.name + ' — 이번 발주', canEdit() ? h('a', { class: 'link', href: '#mail/vendor/' + v.id, text: '발주처 정보 수정' }) : null,
        ui.kv([['담당', [v.person, v.phone].filter(Boolean).join(' · ') || '—'], ['메일', v.email || '— (발주처 정보에서 입력)'], ['결제 조건', v.terms || '—'], ['기본 입고지', v.ship || '품목 보관처 기준']]),
        its.length ? h('div', { class: 'table-wrap flat' }, h('table', { class: 'table lg-table' },
          h('thead', null, h('tr', null, ['품목', '상태', '현재고', '권장', '발주 수량', '금액(VAT 별도)'].map(function (c, i) { return h('th', { class: i >= 2 && i !== 4 ? 'num' : '', text: c }); }))),
          h('tbody', null, rows))) : ui.empty('이 발주처에 연결된 품목이 없습니다. 「재고 · 재발주 › 설정」에서 발주처를 지정하세요.'),
        h('div', { class: 'lg-move' }, h('label', { class: 'meta', text: '희망 입고일' }), etaIn)),
      ui.panel('메일', h('div', { class: 'lg-btns' }, copyBtn(function () { return text.subject; }, '제목 복사'), copyBtn(function () { return text.body; }, '본문 복사', 'lg-copy-main'),
          v.email ? h('a', { class: 'btn btn-line btn-xs', href: 'mailto:' + encodeURIComponent(v.email) + '?subject=' + encodeURIComponent(text.subject) + '&body=' + encodeURIComponent(text.body), text: '메일 앱으로 열기' }) : null),
        h('div', { class: 'lg-mail-subj', text: text.subject }), h('pre', { class: 'lg-mail', text: text.body })),
      canEdit() && its.length ? h('div', { class: 'lg-actions' }, ui.btn('보냈음 — 발주 기록', function () {
        var b = db.batch(), n = 0;
        ps.forEach(function (p) { var q = M.qty[p.it.id]; if (q > 0) { n++; b.set(db.collection('logis_items').doc(p.it.id), { order: { qty: q, date: today(), eta: M.eta }, updatedAt: FV.serverTimestamp(), updatedBy: S.mid || '' }, { merge: true }); } });
        if (!n) return ui.toast('발주 수량이 0입니다.');
        b.commit().then(function () { ui.toast(n + '개 품목을 입고 대기에 올렸습니다.'); M.qty = {}; HR.go('home'); }).catch(function (e) { ui.toast('기록하지 못했습니다 — ' + (e.code || e.message)); });
      }), h('span', { class: 'meta', text: '입고되면 한판 › 입고 대기에서 「입고 처리」를 누르면 재고에 더해집니다.' })) : null);
  }
  function buildMail(v, ps) {
    var me = S.members[S.mid] || {}, lines = [], total = 0, wh = {};
    ps.forEach(function (p) {
      var q = M.qty[p.it.id] || 0; if (!q) return;
      var amt = (+p.it.price || 0) * q; total += amt; wh[p.it.where || 'wekeep'] = 1;
      lines.push((lines.length + 1) + '. ' + p.it.name + (p.it.spec ? ' (' + p.it.spec + ')' : '') + ' — ' + n0(q) + (p.it.unit || '개') + (p.it.price ? ' × ' + n0(p.it.price) + '원 = ' + n0(amt) + '원' : ''));
    });
    var names = ps.filter(function (p) { return M.qty[p.it.id]; }).map(function (p) { return p.it.name; });
    var subject = '[(주)필츠] 발주 요청 — ' + (names[0] || '품목') + (names.length > 1 ? ' 외 ' + (names.length - 1) + '건' : '') + ' (' + today().slice(2).replace(/-/g, '') + ')';
    var dest = v.ship || Object.keys(wh).map(destText).join('\n');
    var body = [
      (v.person ? v.person + '님, ' : '') + '안녕하세요.',
      '(주)필츠 바인그라피 ' + (me.name || '') + '입니다. 아래와 같이 발주드립니다.',
      '',
      '■ 발주 내역',
      lines.length ? lines.join('\n') : '(수량을 입력하세요)',
      total ? '   합계 ' + n0(total) + '원 (VAT 별도) / VAT 포함 ' + n0(total * 1.1) + '원' : '',
      '',
      '■ 희망 입고일: ' + (M.eta ? fmt.dateLong(M.eta) + ' (' + '일월화수목금토'[L.weekday(M.eta)] + ')' : '협의'),
      '■ 입고지:', dest,
      v.terms ? '■ 결제 조건: ' + v.terms : '',
      '',
      '■ 회신 부탁드립니다',
      '1) 발주 접수 확인  2) 확정 납기(입고일)  3) 견적 단가 변동 여부  4) 세금계산서 발행일',
      v.mailNote ? '\n■ 요청사항\n' + v.mailNote : '',
      '',
      '감사합니다.',
      '(주)필츠 ' + (me.name || '') + (me.title ? ' ' + me.title : ''),
      [S.user && S.user.email, me.phone].filter(Boolean).join(' · ')
    ].filter(function (x, i, a) { return x !== '' || (a[i - 1] !== '' && i > 0); }).join('\n').replace(/\n{3,}/g, '\n\n');
    return { subject: subject, body: body };
  }
  function destText(w) {
    if (w === 'wekeep') {
      var g = function (label) { var s = G.specs.filter(function (x) { return x.label === label; })[0]; return s ? s.value : ''; };
      return ['위킵 화성센터 — ' + (g('입고 주소') || '경기도 화성시 장안면 장안공단로 161-31 위킵주식회사 화성센터'),
        '입고 연락처: ' + (g('입고 연락처') || '화성센터 입고팀 070-7709-0623'),
        '· 입고 시간 10:00~16:00 (시간 외 하차는 사전 협의)', '· 운송기사에게 화주명 「(주)필츠」 전달 필수 (미전달 시 회송)', '· 박스 겉면 표기: (주)필츠 / 품목명 / 박스당 ○개 / ○번째 박스(1/N)'].join('\n');
    }
    if (w === 'oem') return '에코먼트 (OEM 충전처) — 주소는 발주처 정보 「기본 입고지」에 입력';
    return '(주)필츠';
  }
  function vendorForm(view, v) {
    if (!canEdit()) return HR.go('mail');
    v = v || {};
    var f = { name: ui.input({ value: v.name || '', maxlength: 60 }), person: ui.input({ value: v.person || '', maxlength: 40 }), phone: ui.input({ value: v.phone || '', maxlength: 40 }),
      email: ui.input({ type: 'email', value: v.email || '', maxlength: 120 }), terms: ui.input({ value: v.terms || '', maxlength: 200 }),
      ship: h('textarea', { rows: 3, maxlength: 600 }, v.ship || ''), mailNote: h('textarea', { rows: 4, maxlength: 1500 }, v.mailNote || ''), note: h('textarea', { rows: 3, maxlength: 2000 }, v.note || ''), sort: ui.input({ type: 'number', value: v.sort || '' }) };
    head(view, v.id ? '발주처 — ' + v.name : '발주처 추가', h('a', { class: 'btn btn-line btn-sm', href: '#mail/' + (v.id || ''), text: '← 메일' }));
    ui.put(view, ui.panel(null, null, h('div', { class: 'lg-form' },
      ui.field('업체명', f.name), ui.field('담당자', f.person), ui.field('연락처', f.phone), ui.field('메일', f.email), ui.field('결제 조건', f.terms), ui.field('정렬 순서', f.sort)),
      ui.field('기본 입고지 (비우면 품목 보관처 기준 — 위킵이면 위킵 입고 조건이 자동으로 들어감)', f.ship), ui.field('메일 요청사항 (매번 본문 끝에 들어감)', f.mailNote), ui.field('메모 (메일에 안 들어감)', f.note)),
      h('div', { class: 'lg-actions' }, ui.btn('저장', function () {
        if (!f.name.value.trim()) return ui.toast('업체명을 넣어 주세요.');
        var ref = v.id ? db.collection('logis_vendors').doc(v.id) : db.collection('logis_vendors').doc();
        save(ref, { name: f.name.value.trim(), person: f.person.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), terms: f.terms.value.trim(), ship: f.ship.value, mailNote: f.mailNote.value, note: f.note.value, sort: f.sort.value === '' ? null : +f.sort.value }, '저장했습니다.')
          .then(function () { HR.go('mail/' + ref.id); });
      }), v.id ? ui.confirmBtn('발주처 삭제', function () { db.collection('logis_vendors').doc(v.id).delete().then(function () { HR.go('mail'); }); }) : null));
  }

  /* ================= [spec] 위킵 사양 — 복사 ================= */
  var SP = { edit: false };
  function specRow(s) {
    return h('div', { class: 'lg-spec' }, h('div', { class: 'lg-spec-l' }, s.pin ? h('span', { class: 'lg-pin', text: '★' }) : null, s.label),
      h('div', { class: 'lg-spec-v', text: s.value || '' }), copyBtn(s.value || ''));
  }
  function spec(view) {
    if (wait(view)) return;
    var groups = [];
    G.specs.forEach(function (s) { var g = s.group || '기타'; if (groups.indexOf(g) < 0) groups.push(g); });
    head(view, '위킵 사양 — 복사해서 붙여넣기', canEdit() ? ui.btn(SP.edit ? '편집 끝' : '편집', function () { SP.edit = !SP.edit; HR.refresh(); }, 'btn-line btn-sm') : null);
    ui.put(view, h('p', { class: 'lg-lead', text: 'FBW 입고 신청 · 상품 등록 · 운송장 · 박스 라벨에 들어갈 값을 모아 두었습니다. 「복사」를 누르고 붙여넣으면 됩니다. ★은 한판에도 나옵니다.' }),
      labelMaker(),
      groups.map(function (g) {
        var list = G.specs.filter(function (s) { return (s.group || '기타') === g; });
        return ui.panel(g, copyBtn(function () { return list.map(function (s) { return s.label + ': ' + s.value; }).join('\n'); }, '묶음 전체 복사'),
          h('div', { class: 'lg-specs' }, list.map(function (s) { return SP.edit ? specEdit(s) : specRow(s); })));
      }),
      SP.edit ? specEdit({ group: groups[0] || '위킵 입고' }) : null,
      !G.specs.length ? ui.empty('사양이 없습니다.') : null);
  }
  function specEdit(s) {
    var g = ui.input({ value: s.group || '', placeholder: '묶음', 'aria-label': '묶음' }), l = ui.input({ value: s.label || '', placeholder: '항목', 'aria-label': '항목' });
    var v = h('textarea', { rows: 2, placeholder: '값', 'aria-label': '값' }, s.value || ''), o = ui.input({ type: 'number', value: s.sort || '', placeholder: '순서', class: 'lg-qty', 'aria-label': '순서' });
    var pin = h('input', { type: 'checkbox', 'aria-label': '한판에 표시' }); pin.checked = !!s.pin;
    return h('div', { class: 'lg-spec lg-spec-ed' }, h('div', { class: 'lg-spec-l' }, g, l), v,
      h('div', { class: 'lg-btns' }, o, h('label', { class: 'check' }, pin, '★'),
        ui.btn(s.id ? '저장' : '+ 추가', function () {
          if (!l.value.trim()) return ui.toast('항목 이름을 넣어 주세요.');
          var ref = s.id ? db.collection('logis_specs').doc(s.id) : db.collection('logis_specs').doc();
          save(ref, { group: g.value.trim() || '기타', label: l.value.trim(), value: v.value, sort: o.value === '' ? null : +o.value, pin: pin.checked }, '저장했습니다.');
        }, 'btn-xs'),
        s.id ? ui.confirmBtn('삭제', function () { db.collection('logis_specs').doc(s.id).delete(); }) : null));
  }
  // 박스 겉면 표기 라벨: 총 수량 · 박스당 개수 → 박스마다 「○번째 박스(1/N)」 문구
  var LB = { name: '', per: '', total: '' };
  function labelMaker() {
    var products = G.items.filter(function (i) { return i.kind === 'product'; }).concat(G.items.filter(function (i) { return i.kind !== 'product' && i.where === 'wekeep'; }));
    if (!LB.name) LB.name = products[0] ? products[0].name : '';
    var name = ui.input({ value: LB.name, 'aria-label': '품목명', oninput: function () { LB.name = this.value; } });
    var per = ui.input({ type: 'number', min: '1', value: LB.per, placeholder: '박스당 개수', class: 'lg-qty', 'aria-label': '박스당 개수', oninput: function () { LB.per = this.value; } });
    var tot = ui.input({ type: 'number', min: '1', value: LB.total, placeholder: '총 수량', class: 'lg-qty', 'aria-label': '총 수량', oninput: function () { LB.total = this.value; } });
    var out = h('pre', { class: 'lg-mail lg-labels' });
    var make = function () {
      var p = +LB.per, t = +LB.total; if (!p || !t || !LB.name) { out.textContent = '품목명 · 박스당 개수 · 총 수량을 넣고 「만들기」를 누르세요.'; return ''; }
      var n = Math.ceil(t / p), rows = [];
      for (var i = 1; i <= n; i++) { var q = i < n ? p : t - p * (n - 1); rows.push('(주)필츠 / ' + LB.name + ' / 박스당 ' + n0(q) + '개 / ' + i + '번째 박스(' + i + '/' + n + ')'); }
      out.textContent = rows.join('\n'); return out.textContent;
    };
    make();
    return ui.panel('박스 겉면 표기 라벨 만들기', null,
      h('div', { class: 'lg-move' }, name, per, tot, ui.btn('만들기', make, 'btn-xs'), copyBtn(function () { return make(); }, '전체 복사'), ui.btn('인쇄', function () { make(); document.body.classList.add('lg-print-labels'); window.print(); setTimeout(function () { document.body.classList.remove('lg-print-labels'); }, 500); }, 'btn-line btn-xs')),
      out, h('p', { class: 'note', text: '박스마다 위킵 입하라벨(FBW › 입고 › 입하 라벨 출력)과 이 표기 라벨을 함께 붙입니다. 마지막 박스는 남은 수량으로 계산됩니다.' }));
  }

  /* ================= [order] 발주 현황 · 기본사항 ================= */
  function order(view) {
    if (wait(view)) return;
    var d = D();
    head(view, '발주 현황 · 물류 기본사항');
    ui.put(view,
      (d.basics || []).length ? ui.panel('물류 기본사항', null, h('dl', { class: 'lg-kv' }, d.basics.map(function (r) { return h('div', null, h('dt', { text: r[0] }), h('dd', { text: r[1] })); }))) : null,
      (d.flow || []).length ? ui.panel('발주 → 출고 흐름', null, h('ol', { class: 'lg-flow' }, d.flow.map(function (t) { return h('li', { text: t }); }))) : null,
      (d.orders || []).length ? ui.panel('품목별 발주 현황', h('span', { class: 'meta', text: d.asOf ? fmt.dot(d.asOf) + ' 기준' : '' }),
        h('div', { class: 'table-wrap flat' }, h('table', { class: 'table lg-table' },
          h('thead', null, h('tr', null, ['상태', '발주처 · 품목', '수량', '금액(VAT 포함)', '지급', '입고(예정)', '입고처'].map(function (c, i) { return h('th', { class: i === 2 || i === 3 ? 'num' : '', text: c }); }))),
          h('tbody', null, d.orders.map(function (o) {
            return h('tr', { class: o.status === '완료' ? 'lg-done' : '' }, h('td', null, h('span', { class: 'lg-st ' + ({ 완료: 'lg-st-ok', 진행: 'lg-st-soon', 미발주: 'lg-st-now', 확인필요: 'lg-st-now' }[o.status] || 'lg-st-none'), text: o.status || '' })),
              h('td', null, h('div', { class: 'strong', text: (o.vendor || '') + ' · ' + (o.item || '') }), o.note ? h('div', { class: 'meta', text: o.note }) : null),
              h('td', { class: 'num nowrap', text: o.qty || '' }), h('td', { class: 'num nowrap', text: o.amount || '' }), h('td', { class: 'nowrap', text: o.paid || '' }), h('td', { class: 'nowrap', text: o.eta || '' }), h('td', { text: o.dest || '' }));
          }))))) : null,
      (d.leadtimes || []).length ? ui.panel('리드타임 · MOQ (재발주 계산 근거)', null, h('div', { class: 'table-wrap flat' }, h('table', { class: 'table lg-table' },
        h('thead', null, h('tr', null, ['품목', '발주처', '리드타임', 'MOQ', '근거'].map(function (c) { return h('th', { text: c }); }))),
        h('tbody', null, d.leadtimes.map(function (r) { return h('tr', null, h('td', { class: 'strong', text: r.item }), h('td', { text: r.vendor || '' }), h('td', { class: 'nowrap', text: r.lead_days ? r.lead_days + '일' : '—' }), h('td', { text: r.moq || '' }), h('td', { class: 'meta', text: r.note || '' })); }))))) : null,
      (d.policy || []).length ? ui.panel('재발주 자금 · 결제 기준 (효경)', null, h('dl', { class: 'lg-kv' }, d.policy.map(function (r) { return h('div', null, h('dt', { text: r[0] }), h('dd', { text: r[1] })); }))) : null,
      (d.payTerms || []).length ? ui.panel('업체별 결제 조건', null, h('ul', { class: 'list' }, d.payTerms.map(function (p) { return h('li', null, h('span', { class: 'strong', text: p.vendor }), h('span', { class: 'grow', text: p.terms }), p.note ? h('span', { class: 'meta', text: p.note }) : null); }))) : null,
      (d.checks || []).length ? ui.panel('발주 메일 보내기 전 체크', null, h('ol', { class: 'lg-flow' }, d.checks.map(function (t) { return h('li', { text: t }); }))) : null,
      d.source ? h('p', { class: 'note', text: '출처 · ' + d.source }) : null,
      !d.basics && !d.orders ? ui.empty('기본사항을 불러오는 중이거나 아직 입력되지 않았습니다.') : null);
  }

  HR.register('home', { render: home });
  HR.register('stock', { render: stock });
  HR.register('mail', { render: mail });
  HR.register('spec', { render: spec });
  HR.register('order', { render: order });
})();

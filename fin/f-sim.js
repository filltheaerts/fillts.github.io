/* fillts Finance — 개당 손익(D2C: 1개 팔면 얼마 들고 얼마 남나 · 고정비 · 마케팅 비중별) · 런웨이 시뮬레이션(실데이터와 분리된 가정 시트)
   개당 손익: 정가(부가세 포함) → 할인 → 실결제 → 부가세 1/11 제외 = 순매출. 원가 · 비용은 공급가(부가세 별도) 기준.
   주문 단위 비용(택배 · 출고 작업 · 박스)은 「주문당 평균 수량」으로 나눠 개당으로 본다.
   고정비는 시뮬레이션의 고정비 · 채용 목록(fin_config/main.sim)을 같이 쓴다. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt;

  /* ============ 개당 손익 (D2C) ============ */
  // 기본 입력 세트 — 자사몰(카페24 + 품고 3PL) 단품 기준 가정값. 화면에서 바꾸면 fin_config/main.inv.econ에 저장
  var ECON0 = {
    price: 35000, discount: 10, upo: 1.3, returnRate: 2,
    ship: 3000, pick: 1100, box: 605, storage: 50,
    pgRate: 3.5, review: 200, adRate: 30
  };
  // 입력 세트 (엑셀처럼 세로 한 표) — [키, 구분, 항목, 단위, 가이드]
  var ECON_ROWS = [
    ['price', '매출', '정가', '원 (부가세 포함)', '자사몰 판매가. 고객이 보는 가격 그대로 (부가세 포함).'],
    ['discount', '매출', '평균 할인', '%', '쿠폰 · 적립금 · 첫구매 할인을 평균 낸 비율. 런칭 초기 15~25%, 안정기 5~10%.'],
    ['upo', '매출', '주문당 평균 수량', '개', '주문 1건에 평균 몇 개 사는지. 단품 1.0~1.3, 2+1 · 세트를 팔면 1.5 이상 → 택배비가 개당으로 줄어듦.'],
    ['returnRate', '매출', '반품 · 환불률', '%', '순매출 중 돌려주는 비율. 화장품 자사몰 보통 1~3%.'],
    ['ship', '물류', '택배비', '원 / 주문', '3PL 계약 택배 단가(공급가). 소형 박스 기준 보통 2,500~3,300원.'],
    ['pick', '물류', '출고 작업 (피킹 · 포장)', '원 / 주문', '3PL이 주문 1건을 꺼내 포장하는 작업비. 보통 1,000~1,500원. 합포장 추가비는 계약서 확인.'],
    ['box', '물류', '박스 · 완충재', '원 / 주문', '택배 박스 · 완충재 · 테이프. 보통 400~800원.'],
    ['storage', '물류', '보관비', '원 / 개', '3PL 보관비를 개당으로 나눈 값. 팔레트 월 2~4만 원 기준이면 개당 수십 원.'],
    ['pgRate', '판매 비용', '결제수수료 (PG)', '% (실결제 기준)', '카드 3.3~3.5% 수준(부가세 별도 기준으로 입력). 간편결제 일부는 더 높음.'],
    ['review', '판매 비용', '리뷰 적립 · CS 사은', '원 / 개', '리뷰 적립금 × 리뷰 작성률 + CS 사은품. 예: 적립 1,000원 × 작성률 20% = 200원.'],
    ['adRate', '마케팅', '광고비 비중', '% (실결제 기준)', '실결제 100원 중 광고에 쓰는 돈. 런칭기 30~50%, 안정기 15~25%. 필요 ROAS = 100 ÷ 비중.']
  ];
  F.econ = function () { return Object.assign({}, ECON0, (F.cfg.inv || {}).econ || {}); };
  F.unitPnl = function (e) {
    e = e || F.econ();
    var uc = F.invUnitCost ? F.invUnitCost(false) : { parts: [], total: 0 };
    var price = +e.price || 0, paid = price * (1 - (+e.discount || 0) / 100), disc = price - paid;
    var vat = paid / 11, net = paid - vat;
    var ret = net * (+e.returnRate || 0) / 100;
    var cogs = uc.total;
    if (+e.cogsOverride > 0) { cogs = +e.cogsOverride; uc = { parts: [{ it: { name: '제품 원가 (단가 계산기 적용값)', unit: '' }, per: 1, cost: cogs }], total: cogs }; }
    var gross = net - ret - cogs;
    var upo = Math.max(1, +e.upo || 1);
    var ship = (+e.ship || 0) / upo, pick = (+e.pick || 0) / upo, box = (+e.box || 0) / upo, storage = +e.storage || 0;
    var logi = ship + pick + box + storage;
    var pg = paid * (+e.pgRate || 0) / 100, review = +e.review || 0;
    var pre = gross - logi - pg - review, ad = paid * (+e.adRate || 0) / 100, contrib = pre - ad;
    var varNoAd = ret + logi + pg + review;   // 원가 · 광고 제외 변동비
    return { e: e, parts: uc.parts, price: price, disc: disc, paid: paid, vat: vat, net: net, ret: ret, cogs: cogs, gross: gross, ship: ship, pick: pick, box: box, storage: storage,
      logi: logi, pg: pg, review: review, pre: pre, ad: ad, contrib: contrib, varNoAd: varNoAd,
      // 현금 기준 (원가는 재고 매입 때 이미 나감)
      cashPerUnit: net - varNoAd - ad };
  };
  // 광고비 비중만 바꿔 다시 계산
  F.unitAt = function (adRate) { return F.unitPnl(Object.assign({}, F.econ(), { adRate: adRate })); };
  function saveEcon(patch) { var inv = Object.assign({}, F.cfg.inv || {}); inv.econ = Object.assign({}, F.econ(), patch); return F.cfgSet({ inv: inv }); }
  var pct = function (v, base) { return base ? (v / base * 100).toFixed(1) + '%' : ''; };
  var won = function (v) { return F.won(Math.round(v)); };



  /* ---------- 단가 계산기: 견적서 · 실제 결제 금액 → 개당 단가 → 제품 1개 원가 ---------- */
  // 행: { name, qty, amount, vat: 'incl'|'excl', per, kind: 'unit'|'setup' } — fin_config/main.costCalc
  // kind 'setup'(동판 · 목형 등 초도비)은 「이번 생산 수량」으로 나눠 제품 1개에 얹는다.
  function calcSeed() {
    var rows = [];
    (F.inv.items || []).forEach(function (it) {
      F.inv.moves.filter(function (m) { return m.kind === 'in' && m.itemId === it.id && m.reason !== 'adjust'; }).forEach(function (m) {
        rows.push({ name: it.name, qty: +m.qty || 0, amount: (+m.amount || 0) + (+m.vat || 0), vat: 'incl', per: it.type === 'setup' ? 1 : (+it.perProduct || 0), kind: it.type === 'setup' ? 'setup' : 'unit' });
      });
    });
    return rows;
  }
  function calcPanel(u) {
    var ed = F.canEdit(), saved = F.cfg.costCalc, rows = saved && saved.rows ? saved.rows : calcSeed(), batch = saved && +saved.batch ? +saved.batch : 5000;
    var put = function (list, b) { return F.cfgSet({ costCalc: { rows: list, batch: b != null ? b : batch } }).catch(ui.fail); };
    var calc = function (r) {
      var amt = +r.amount || 0, qty = +r.qty || 0, sup = r.vat === 'incl' ? amt / 1.1 : amt;
      var unitSup = r.kind === 'setup' ? (batch ? sup / batch : 0) : (qty ? sup / qty : 0);
      var per = r.kind === 'setup' ? 1 : (+r.per || 0);
      return { sup: sup, unitSup: unitSup, unitVat: unitSup * 1.1, cost: unitSup * per };
    };
    var total = 0, totalPay = 0;
    var body = h('tbody');
    rows.forEach(function (r, idx) {
      var x = calc(r); total += x.cost; totalPay += r.vat === 'incl' ? +r.amount || 0 : (+r.amount || 0) * 1.1;
      var set = function (patch) { var list = rows.slice(); list[idx] = Object.assign({}, list[idx], patch); put(list); };
      var cell = function (val, key, cls, money) {
        var i = h('input', { type: 'text', inputmode: money ? 'numeric' : null, class: 'fin-cell ' + (cls || ''), value: val == null ? '' : (money && val !== '' ? Number(val).toLocaleString('ko-KR') : String(val)), disabled: ed ? null : true });
        i.addEventListener('focus', function () { i.select(); });
        i.addEventListener('change', function () { var p = {}; p[key] = money ? F.parseWon(i.value) : (key === 'per' ? +i.value || 0 : i.value.trim()); set(p); });
        return i;
      };
      var vat = ui.select([['incl', '포함'], ['excl', '별도']], r.vat || 'incl', { class: 'fin-cell', disabled: ed ? null : true, onchange: function () { set({ vat: this.value }); } });
      var kind = ui.select([['unit', '개당'], ['setup', '초도비']], r.kind || 'unit', { class: 'fin-cell', disabled: ed ? null : true, onchange: function () { set({ kind: this.value }); } });
      body.appendChild(h('tr', null,
        h('td', null, cell(r.name, 'name', 'fin-cell-text')), h('td', null, kind),
        h('td', { class: 'fin-in' }, r.kind === 'setup' ? h('span', { class: 'meta', text: '÷ ' + batch.toLocaleString('ko-KR') + '개' }) : cell(r.qty, 'qty', '', true)),
        h('td', { class: 'fin-in' }, cell(r.amount, 'amount', '', true)), h('td', null, vat),
        h('td', { class: 'num' }, F.won(Math.round(x.unitSup))), h('td', { class: 'num meta' }, F.won(Math.round(x.unitVat))),
        h('td', { class: 'fin-in' }, r.kind === 'setup' ? h('span', { class: 'meta', text: '1' }) : cell(r.per, 'per', 'fin-cell-sm')),
        h('td', { class: 'num strong' }, F.won(Math.round(x.cost))),
        ed ? h('td', null, ui.btn('×', function () { var list = rows.slice(); list.splice(idx, 1); put(list); }, 'btn-line btn-xs')) : h('td')));
    });
    var auto = F.invUnitCost ? F.invUnitCost(false).total : 0, applied = +F.econ().cogsOverride || 0;
    var foot = h('tr', { class: 'fin-result' }, h('td', { colspan: '8', class: 'strong', text: '제품 1개 원가 (공급가)' }), h('td', { class: 'num strong', text: F.won(Math.round(total)) }), h('td'));
    var foot2 = h('tr', { class: 'fin-auto' }, h('td', { colspan: '8', text: '부가세 포함으로 보면 · 결제 금액 합계 ' + F.man(totalPay) }), h('td', { class: 'num', text: F.won(Math.round(total * 1.1)) }), h('td'));
    // 표 맨 아래에서 바로 추가 (견적서 품목 · 촬영 소품 · 동봉물 등)
    if (ed) body.appendChild(h('tr', { class: 'fin-addline' }, h('td', { colspan: '10' },
      ui.btn('+ 품목 추가 (개당)', function () { put(rows.concat([{ name: '', qty: 0, amount: 0, vat: 'incl', per: 1, kind: 'unit' }])); }, 'btn-line btn-sm'),
      ui.btn('+ 초도비 추가 (동판 · 목형 등)', function () { put(rows.concat([{ name: '', qty: 0, amount: 0, vat: 'incl', per: 1, kind: 'setup' }])); }, 'btn-line btn-sm'),
      h('span', { class: 'meta', text: '  추가한 줄의 품목 이름 · 수량 · 결제 금액 · 1개당 사용량을 적으면 바로 합계에 들어갑니다. 빼려면 줄 끝 ×.' }))));
    body.appendChild(foot); body.appendChild(foot2);
    var tb = h('table', { class: 'table fin-table fin-inputs fin-calc' }, h('thead', null, h('tr', null,
      ['품목', '구분', '수량', '결제 금액 (원)', '부가세', '개당 단가 (공급가)', '부가세 포함', '제품 1개당 사용량', '제품 1개 원가에 들어가는 돈', ''].map(function (t, i) { return h('th', { class: i >= 5 && i <= 8 && i !== 7 ? 'num' : '', text: t }); }))), body);
    var batchIn = ui.input({ type: 'number', min: '1', value: String(batch), disabled: ed ? null : true });
    batchIn.addEventListener('change', function () { put(rows, +batchIn.value || 1); });
    var diff = total - auto;
    return ui.panel('Calculator · 단가 계산기 (견적서 · 실제 결제 금액 → 제품 1개 원가)', ed ? h('div', { class: 'row' },
        ui.btn('+ 품목 추가', function () { put(rows.concat([{ name: '', qty: 0, amount: 0, vat: 'incl', per: 1, kind: 'unit' }])); }, 'btn-line btn-sm'),
        ui.confirmBtn('재고 매입 내역으로 다시 채우기', function () { put(calcSeed()); }, 'btn-line btn-sm')) : null,
      h('p', { class: 'meta', text: '견적서나 거래명세서의 품목 · 수량 · 결제 금액을 그대로 적으면 개당 단가가 나오고, 「제품 1개당 사용량」(예: 튜브 1개, 포도수 0.12kg, 샘플 2개)을 곱해 제품 1개 원가가 됩니다. 동판 · 목형 같은 초도비는 「초도비」로 두면 이번 생산 수량으로 나눠 얹습니다. 칸을 고치면 바로 저장됩니다.' }),
      h('div', { class: 'row fin-form' }, ui.field('이번 생산 수량 (초도비를 나눌 수량)', batchIn)),
      h('div', { class: 'table-wrap flat' }, tb),
      F.kpi([['계산기 원가', F.won(Math.round(total)), '', '공급가 · 초도비 포함'], ['재고 탭 자동 원가', F.won(Math.round(auto)), '', '초도비 제외 · 평균 매입 단가'],
        ['차이', (diff >= 0 ? '+' : '−') + F.won(Math.abs(Math.round(diff))), Math.abs(diff) > 1 ? 'red' : ''], ['개당 손익에 쓰는 원가', applied ? F.won(applied) : '자동 (' + F.won(Math.round(auto)) + ')', '', applied ? '계산기 값 적용 중' : '재고 탭 값']], 'four'),
      ed ? h('div', { class: 'row' }, ui.btn('이 원가(' + F.won(Math.round(total)) + ')를 개당 손익에 적용', function () { saveEcon({ cogsOverride: Math.round(total) }).then(function () { ui.toast('개당 손익 원가를 계산기 값으로 바꿨습니다.'); }); }, 'btn-sm'),
        applied ? ui.btn('자동(재고 탭) 원가로 되돌리기', function () { saveEcon({ cogsOverride: 0 }).then(function () { ui.toast('재고 탭 원가로 되돌렸습니다.'); }); }, 'btn-line btn-sm') : null) : null);
  }

  /* ---------- 실제 주문 값으로 계산 ---------- */
  // [키, 항목, 단위, 가이드] — 주문 화면 · 3PL 청구서 · PG 정산 · 광고 관리자에서 그대로 옮겨 적는 값(기간 합계)
  var ACT_ROWS = [
    ['orders', '주문 건수', '건', '카페24 주문 관리 › 기간 내 결제 완료 주문 수'],
    ['units', '판매 수량', '개', '같은 기간 판매된 본품 수 (세트는 본품 개수로)'],
    ['paid', '실결제 금액 합계', '원 (부가세 포함)', '할인 · 적립금 사용 후 고객이 실제 낸 돈의 합계. 배송비 받은 게 있으면 빼고 입력'],
    ['refund', '반품 · 환불 금액', '원 (부가세 포함)', '같은 기간 환불해 준 금액'],
    ['ship', '택배비 청구액', '원', '3PL(품고) 청구서의 택배비 합계 (공급가)'],
    ['pick', '출고 작업비 청구액', '원', '3PL 청구서의 피킹 · 포장 · 합포장 작업비 합계'],
    ['box', '박스 · 자재비', '원', '3PL 청구서의 박스 · 완충재 · 테이프'],
    ['storage', '보관비', '원', '3PL 청구서의 보관비'],
    ['pg', '결제수수료', '원', 'PG 정산 내역의 수수료 합계 (공급가)'],
    ['review', '리뷰 적립 · 사은품', '원', '지급한 리뷰 적립금 + CS 사은품 원가'],
    ['ad', '광고비', '원', '메타 · 네이버 · 구글 등 광고 관리자 결제액 합계 (공급가)']
  ];
  function actualPanel(u, e, fx) {
    var A = Object.assign({ label: '', orders: '', units: '', paid: '', refund: '', ship: '', pick: '', box: '', storage: '', pg: '', review: '', ad: '' }, F.cfg.actual || {});
    var ed = F.canEdit(), n = function (k) { return +A[k] || 0; };
    var units = n('units'), orders = n('orders') || units, paid = n('paid');
    var ok = units > 0 && paid > 0;
    // 실적 → 입력 세트 형태로 환산 (정가는 그대로, 나머지 비율 · 단가를 실제 값으로)
    var der = ok ? {
      price: +e.price, discount: Math.max(0, (1 - paid / (units * +e.price)) * 100), upo: orders ? units / orders : 1,
      returnRate: paid ? n('refund') / paid * 100 : 0,
      ship: orders ? n('ship') / orders : 0, pick: orders ? n('pick') / orders : 0, box: orders ? n('box') / orders : 0, storage: units ? n('storage') / units : 0,
      pgRate: paid ? n('pg') / (paid / 1.1) * 100 : 0, review: units ? n('review') / units : 0, adRate: paid ? n('ad') / (paid / 1.1) * 100 : 0
    } : null;
    // 비율 기준 맞추기: 가정 세트는 실결제(부가세 포함) 기준 비율 → 실적도 같은 기준으로
    if (der) { der.pgRate = n('pg') / paid * 100; der.adRate = n('ad') / paid * 100; }
    var x = der ? F.unitPnl(der) : null;
    var body = h('tbody');
    ACT_ROWS.forEach(function (f, i) {
      var inp = F.moneyInput({ value: A[f[0]] }); inp.className = 'fin-cell'; if (!ed) inp.disabled = true;
      inp.addEventListener('change', function () { var o = Object.assign({}, F.cfg.actual || {}); o[f[0]] = F.parseWon(inp.value) || ''; F.cfgSet({ actual: o }).catch(ui.fail); });
      body.appendChild(h('tr', { class: i === 2 || i === 4 || i === 10 ? 'fin-grp-first' : '' }, h('td', { class: 'strong', text: f[1] }), h('td', { class: 'fin-in' }, inp), h('td', { class: 'meta', text: f[2] }), h('td', { class: 'meta fin-guide', text: f[3] })));
    });
    var label = ui.input({ value: A.label || '', placeholder: '예: 2026년 11월 · 런칭 첫 달', maxlength: 40, disabled: ed ? null : true });
    label.addEventListener('change', function () { F.cfgSet({ actual: Object.assign({}, F.cfg.actual || {}, { label: label.value.trim() }) }).catch(ui.fail); });
    var cmp = null;
    if (x) {
      var R = [['실결제 (1개)', x.paid, u.paid, 1], ['순매출', x.net, u.net, 1], ['반품 · 환불', -x.ret, -u.ret], ['제품 원가', -x.cogs, -u.cogs], ['택배비', -x.ship, -u.ship], ['출고 작업', -x.pick, -u.pick],
        ['박스 · 자재', -x.box, -u.box], ['보관비', -x.storage, -u.storage], ['결제수수료', -x.pg, -u.pg], ['리뷰 적립 · 사은', -x.review, -u.review], ['광고 전 이익', x.pre, u.pre, 1], ['광고비', -x.ad, -u.ad], ['개당 남는 돈', x.contrib, u.contrib, 2]];
      cmp = h('table', { class: 'table fin-table fin-narrow fin-inputs' }, h('thead', null, h('tr', null, ['1개당', '실제', '가정', '차이'].map(function (t, k) { return h('th', { class: k ? 'num' : '', text: t }); }))),
        h('tbody', null, R.map(function (r) {
          var d = r[1] - r[2];
          return h('tr', { class: r[3] === 2 ? 'fin-result' : r[3] ? 'fin-grp-first' : '' }, h('td', { class: r[3] ? 'strong' : '', text: r[0] }), h('td', { class: 'num strong', text: (r[1] < 0 ? '−' : '') + won(Math.abs(r[1])) }),
            h('td', { class: 'num meta', text: (r[2] < 0 ? '−' : '') + won(Math.abs(r[2])) }), h('td', { class: 'num' + (Math.round(d) < 0 ? ' red' : ''), text: Math.round(d) ? (d > 0 ? '+' : '−') + won(Math.abs(d)) : '—' }));
        })));
    }
    var rates = der ? [['평균 할인', der.discount.toFixed(1) + '%', e.discount + '%'], ['주문당 수량', der.upo.toFixed(2) + '개', e.upo + '개'], ['반품률', der.returnRate.toFixed(1) + '%', e.returnRate + '%'],
      ['택배비 / 주문', won(der.ship), won(e.ship)], ['결제수수료', der.pgRate.toFixed(2) + '%', e.pgRate + '%'], ['광고비 비중', der.adRate.toFixed(1) + '%', e.adRate + '%'], ['ROAS', der.adRate ? (100 / der.adRate).toFixed(2) + '배' : '-', e.adRate ? (100 / e.adRate).toFixed(2) + '배' : '-']] : [];
    var monthly = x ? units * x.contrib - fx.total : null;
    return ui.panel('Actual · 실제 주문 값으로 계산', ed && der ? ui.confirmBtn('이 실적으로 입력 세트 바꾸기', function () {
        var p = {}; Object.keys(der).forEach(function (k) { p[k] = Math.round(der[k] * 100) / 100; });
        saveEcon(p).then(function () { ui.toast('입력 세트를 실적 값으로 바꿨습니다.'); }).catch(ui.fail);
      }, 'btn-sm') : null,
      h('p', { class: 'meta', text: '한 달(또는 원하는 기간) 실제 숫자를 주문 화면 · 3PL 청구서 · PG 정산 · 광고 관리자에서 그대로 옮겨 적으면, 1개당 실제 손익이 계산되고 위 가정과 나란히 비교됩니다. 값은 바로 저장됩니다.' }),
      h('div', { class: 'row fin-form' }, ui.field('기간 이름', label, 'grow')),
      h('div', { class: 'table-wrap flat' }, h('table', { class: 'table fin-table fin-narrow fin-inputs' }, h('thead', null, h('tr', null, ['항목', '입력 (기간 합계)', '단위', '어디서 보나'].map(function (t) { return h('th', { text: t }); }))), body)),
      x ? F.kpi([['실제 개당 남는 돈', won(x.contrib), x.contrib < 0 ? 'red' : '', '가정 ' + won(u.contrib)], ['이 기간 영업이익', F.man(monthly), monthly < 0 ? 'red' : '', units.toLocaleString('ko-KR') + '개 × 개당 − 월 고정비 ' + F.man(fx.total)],
        ['실제 광고비 비중', der.adRate.toFixed(1) + '%', '', 'ROAS ' + (der.adRate ? (100 / der.adRate).toFixed(2) + '배' : '-')], ['실제 평균 할인', der.discount.toFixed(1) + '%', '', '정가 ' + F.won(e.price) + ' 기준']], 'four') : h('p', { class: 'empty', text: '판매 수량과 실결제 금액을 넣으면 1개당 실제 손익이 여기에 나옵니다.' }),
      x ? h('div', { class: 'two-col fin-two' },
        h('div', { class: 'table-wrap flat' }, cmp),
        h('div', { class: 'stack' }, h('div', { class: 'label', text: '실적에서 나온 비율 · 단가' }), h('ul', { class: 'list' }, rates.map(function (r) { return h('li', null, h('span', { class: 'grow', text: r[0] }), h('span', { class: 'num strong', text: r[1] }), h('span', { class: 'meta', text: '가정 ' + r[2] })); })),
          h('p', { class: 'meta', text: '「이 실적으로 입력 세트 바꾸기」를 누르면 이 비율 · 단가가 위 입력 세트에 들어가고, 손익분기 · 시뮬레이션이 실적 기준으로 다시 계산됩니다.' }))) : null);
  }

  function unit(view) {
    var u = F.unitPnl(), ed = F.canEdit(), e = u.e, fx = F.fixedAt(F.thisYm());
    // 입력: 세로 한 표 — 값 · 단위 · 1개당 영향 · 가이드
    var effect = {
      price: ['실결제 ' + won(u.paid), ''], discount: ['−' + won(u.disc), 'minus'], upo: ['주문당 비용 ÷ ' + e.upo, ''], returnRate: ['−' + won(u.ret), 'minus'],
      ship: ['−' + won(u.ship), 'minus'], pick: ['−' + won(u.pick), 'minus'], box: ['−' + won(u.box), 'minus'], storage: ['−' + won(u.storage), 'minus'],
      pgRate: ['−' + won(u.pg), 'minus'], review: ['−' + won(u.review), 'minus'], adRate: ['−' + won(u.ad), 'minus']
    };
    var lastGroup = '';
    var inBody = h('tbody');
    ECON_ROWS.forEach(function (f) {
      var i = ui.input({ type: 'number', step: 'any', value: String(e[f[0]]), class: 'fin-cell', 'aria-label': f[2], disabled: ed ? null : true });
      i.addEventListener('change', function () { var p = {}; p[f[0]] = +i.value || 0; saveEcon(p).then(function () { ui.toast(f[2] + ' 저장'); }).catch(ui.fail); });
      inBody.appendChild(h('tr', { class: f[1] !== lastGroup ? 'fin-grp-first' : '' }, h('td', { class: 'fin-grp', text: f[1] !== lastGroup ? f[1] : '' }), h('td', { class: 'strong', text: f[2] }),
        h('td', { class: 'fin-in' }, i), h('td', { class: 'meta', text: f[3] }), h('td', { class: 'num ' + effect[f[0]][1], text: effect[f[0]][0] }), h('td', { class: 'meta fin-guide', text: f[4] })));
      lastGroup = f[1];
    });
    // 자동으로 오는 값 · 결과
    inBody.appendChild(h('tr', { class: 'fin-grp-first fin-auto' }, h('td', { class: 'fin-grp', text: '자동' }), h('td', { class: 'strong', text: '제품 원가' }),
      h('td', { class: 'fin-in num', text: won(u.cogs) }), h('td', { class: 'meta', text: '원 / 개 (공급가)' }), h('td', { class: 'num minus', text: '−' + won(u.cogs) }),
      h('td', { class: 'meta fin-guide' }, '재고 탭 품목의 「제품 1개당 사용량 × 평균 매입 단가」 합계. ', h('a', { href: '#inv', text: '재고 → 품목' }), '에서 바뀌면 여기도 바뀝니다.')));
    inBody.appendChild(h('tr', { class: 'fin-auto' }, h('td', { class: 'fin-grp' }), h('td', { class: 'strong', text: '부가세' }),
      h('td', { class: 'fin-in num', text: '1/11' }), h('td', { class: 'meta', text: '실결제 기준' }), h('td', { class: 'num minus', text: '−' + won(u.vat) }),
      h('td', { class: 'meta fin-guide', text: '고객이 낸 돈 안의 부가세는 분기마다 나라에 냅니다 — 회사 매출이 아님.' })));
    inBody.appendChild(h('tr', { class: 'fin-result' }, h('td', { class: 'fin-grp', text: '결과' }), h('td', { class: 'strong', text: '개당 남는 돈' }),
      h('td', { class: 'fin-in num strong' + (u.contrib < 0 ? ' red' : ''), text: won(u.contrib) }), h('td', { class: 'meta', text: '실결제의 ' + pct(u.contrib, u.paid) }),
      h('td', { class: 'num', text: '광고 전 ' + won(u.pre) }), h('td', { class: 'meta fin-guide', text: '이 돈으로 월 고정비 ' + F.man(fx.total) + '를 갚습니다 → 손익분기 ' + (u.contrib > 0 ? Math.ceil(fx.total / u.contrib).toLocaleString('ko-KR') + '개/월' : '불가') })));
    var inputs = h('table', { class: 'table fin-table fin-narrow fin-inputs' },
      h('thead', null, h('tr', null, ['구분', '항목', '입력값', '단위', '1개당 영향', '가이드'].map(function (x, k) { return h('th', { class: k === 4 ? 'num' : '', text: x }); }))), inBody);

    // 워터폴: [이름, 금액, 종류, 설명]
    var R = [['정가 (부가세 포함)', u.price, 'top', '']];
    if (u.disc) R.push(['− 평균 할인 ' + e.discount + '%', -u.disc, 'minus', '쿠폰 · 적립금 · 첫구매']);
    R.push(['= 실결제', u.paid, 'sum', '고객이 실제 낸 돈']);
    R.push(['− 부가세 (1/11)', -u.vat, 'minus', '나라에 낼 돈 — 회사 매출 아님']);
    R.push(['= 순매출', u.net, 'sum', '']);
    if (u.ret) R.push(['− 반품 · 환불 ' + e.returnRate + '%', -u.ret, 'minus', '순매출 기준']);
    u.parts.forEach(function (p) { R.push(['− ' + p.it.name + (p.per !== 1 ? ' × ' + p.per + (p.it.unit || '') : ''), -p.cost, 'minus', '제품 원가 · 공급가']); });
    R.push(['= 매출총이익', u.gross, 'sum', '원가율 ' + pct(u.cogs, u.net)]);
    R.push(['− 택배비', -u.ship, 'minus', F.won(e.ship) + '/주문 ÷ ' + e.upo + '개']);
    R.push(['− 출고 작업 (피킹 · 포장)', -u.pick, 'minus', F.won(e.pick) + '/주문 ÷ ' + e.upo + '개']);
    R.push(['− 박스 · 완충재', -u.box, 'minus', F.won(e.box) + '/주문 ÷ ' + e.upo + '개']);
    if (u.storage) R.push(['− 보관비', -u.storage, 'minus', '3PL 개당']);
    R.push(['− 결제수수료 ' + e.pgRate + '%', -u.pg, 'minus', '실결제 기준']);
    if (u.review) R.push(['− 리뷰 적립 · CS 사은', -u.review, 'minus', '개당 평균']);
    R.push(['= 광고 전 이익', u.pre, 'sum', '1개를 만들고 · 보내고 · 결제받는 데까지']);
    R.push(['− 광고비 ' + e.adRate + '%', -u.ad, 'minus', '실결제 기준 · 필요 ROAS ' + (e.adRate ? (100 / e.adRate).toFixed(2) + '배' : '-')]);
    R.push(['= 개당 남는 돈 (공헌이익)', u.contrib, 'final', '이 돈으로 고정비를 갚는다']);
    var max = u.price;
    var wf = h('table', { class: 'table fin-table fin-narrow fin-water' }, h('tbody', null, R.map(function (r) {
      var bar = h('span', { class: 'fw-fill' + (r[1] < 0 ? ' neg' : '') }); bar.style.width = Math.max(1, Math.round(Math.abs(r[1]) / max * 100)) + '%';
      return h('tr', { class: 'fw-' + r[2] }, h('td', { class: 'fw-name', text: r[0] }), h('td', { class: 'num', text: (r[1] < 0 ? '−' : '') + won(Math.abs(r[1])) }),
        h('td', { class: 'num meta', text: pct(Math.abs(r[1]), u.paid) }), h('td', { class: 'fw-bar' }, h('span', { class: 'fw-track' }, bar)), h('td', { class: 'meta', text: r[3] }));
    })));
    // 비용 구조 요약 (개당)
    var mix = [['제품 원가', u.cogs], ['물류 (택배 · 출고 · 박스 · 보관)', u.logi], ['결제 · 반품 · 리뷰', u.pg + u.ret + u.review], ['부가세', u.vat], ['광고비', u.ad], ['남는 돈', u.contrib]];
    // 고정비
    var fxList = h('ul', { class: 'list' }, fx.rows.map(function (r) { return h('li', null, h('span', { class: 'grow', text: r[0] }), h('span', { class: 'num', text: F.won(r[1]) })); }));
    fxList.appendChild(h('li', { class: 'fin-owner' }, h('span', { class: 'grow strong', text: '월 고정비 합계 (지금)' }), h('span', { class: 'num strong', text: F.won(fx.total) })));
    // 마케팅 비중별
    var rates = [0, 10, 15, 20, 25, 30, 35, 40, 50], vols = [300, 500, 1000, 2000, 3000, 5000];
    var mk = h('table', { class: 'table fin-table fin-narrow fin-mk' }, h('thead', null, h('tr', null, ['광고비 비중', '필요 ROAS', '개당 광고비', '개당 남는 돈', '손익분기 판매량', '그때 월 매출(실결제)', '그때 월 광고비'].map(function (x, i) { return h('th', { class: i ? 'num' : '', text: x }); }))),
      h('tbody', null, rates.map(function (r) {
        var x = F.unitAt(r), bep = x.contrib > 0 ? Math.ceil(fx.total / x.contrib) : null;
        return h('tr', { class: r === +e.adRate ? 'fin-mine' : '' }, h('td', { text: r + '%' + (r === +e.adRate ? ' ← 지금' : '') }), h('td', { class: 'num', text: r ? (100 / r).toFixed(2) + '배' : '-' }),
          h('td', { class: 'num', text: won(x.ad) }), h('td', { class: 'num strong' + (x.contrib <= 0 ? ' red' : ''), text: won(x.contrib) }),
          h('td', { class: 'num', text: bep ? bep.toLocaleString('ko-KR') + '개/월' : '불가' }), h('td', { class: 'num', text: bep ? F.man(bep * x.paid) : '' }), h('td', { class: 'num', text: bep ? F.man(bep * x.ad) : '' }));
      })));
    var mx = h('table', { class: 'table fin-table fin-narrow fin-mk' }, h('thead', null, h('tr', null, h('th', { text: '광고비 비중 \\ 월 판매' }), vols.map(function (v) { return h('th', { class: 'num', text: v.toLocaleString('ko-KR') + '개' }); }))),
      h('tbody', null, rates.map(function (r) {
        var x = F.unitAt(r);
        return h('tr', { class: r === +e.adRate ? 'fin-mine' : '' }, h('td', { text: r + '%' }), vols.map(function (v) {
          var p = v * x.contrib - fx.total; return h('td', { class: 'num' + (p < 0 ? ' red' : ''), text: F.man(p) });
        }));
      })));
    var bepNow = u.contrib > 0 ? Math.ceil(fx.total / u.contrib) : null;
    ui.put(view, ui.head('Unit economics', '개당 손익 (D2C)'),
      F.kpi([['실결제 (1개)', won(u.paid), '', '정가 ' + F.won(u.price) + ' − 할인 ' + e.discount + '%'], ['제품 원가', won(u.cogs), '', '순매출의 ' + pct(u.cogs, u.net)],
        ['광고 전 이익', won(u.pre), '', '실결제의 ' + pct(u.pre, u.paid)], ['개당 남는 돈', won(u.contrib), u.contrib < 0 ? 'red' : '', '광고 ' + e.adRate + '% 기준 · 실결제의 ' + pct(u.contrib, u.paid)],
        ['월 고정비', F.man(fx.total), '', fx.rows.length + '개 항목 · 지출 흐름 고정비'], ['손익분기', bepNow ? bepNow.toLocaleString('ko-KR') + '개/월' : '불가', bepNow ? '' : 'red', bepNow ? '월 실결제 ' + F.man(bepNow * u.paid) : '광고비를 낮춰야 함']]),
      ui.panel('Inputs · 입력 세트', h('span', { class: 'meta', text: '자사몰 단품 기준 가정값 — 실제 계약 조건으로 고쳐 주세요 · 값을 바꾸면 바로 저장 · 다시 계산' }),
        h('div', { class: 'table-wrap flat' }, inputs)),
      calcPanel(u),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Waterfall · 1개 팔면', null, h('div', { class: 'table-wrap flat' }, wf)),
        h('div', { class: 'stack' },
          ui.panel('Mix · 실결제 ' + won(u.paid) + '는 어디로 가나', null, h('ul', { class: 'list' }, mix.map(function (m) {
            var bar = h('span', { class: 'fw-fill' + (m[0] === '남는 돈' ? ' red' : '') }); bar.style.width = Math.max(1, Math.round(Math.abs(m[1]) / u.paid * 100)) + '%';
            return h('li', null, h('span', { class: 'grow', text: m[0] }), h('span', { class: 'fw-track fin-mixbar' }, bar), h('span', { class: 'num', text: won(m[1]) + ' · ' + pct(m[1], u.paid) }));
          }))),
          ui.panel('Fixed · 월 고정비', h('a', { href: '#cost', class: 'meta', text: '지출 흐름에서 수정 →' }), fxList))),
      ui.panel('Marketing · 광고비 비중별로 어떻게 굴러가나', null, h('div', { class: 'table-wrap flat' }, mk),
        h('p', { class: 'meta', text: '필요 ROAS = 광고비 1원으로 만들어야 하는 매출(실결제). 손익분기 판매량 = 월 고정비 ÷ 개당 남는 돈.' })),
      h('p', { class: 'note', text: '다음 단계로 나눌 것: 채널별(쿠팡 · 스마트스토어 · 올리브영) 수수료와 정산 주기, 묶음 · 세트 객단가, 재구매율, 무료배송 기준, 신규/재구매 광고비 차이.' }));
  }

  /* ============ 시뮬레이션 ============ */
  var SIM0 = {
    start: '2026-10', months: 24, launch: '2026-11',
    cash0: null, ownerTotal: 150000000, ownerStep: 10000000, minCash: 10000000,
    units: { first: 300, growth: 20, cap: 6000 }, unitsOver: {},
    stock0: null, reorder: { lot: 5000, lead: 2, upfront: 50, safety: 2 },
    committed: true, loan: { on: false, ym: '2027-07', amount: 230000000, label: '기보 · 중진공 추가 대출 (2027)' },
    fixed: [
      { name: '인건비 · 콘텐츠 리더 (4대보험 포함)', amount: 4500000, from: '2026-10', to: '' },
      { name: '대표 급여', amount: 0, from: '2027-01', to: '' },
      { name: '사무실 임대료 · 관리비 (성수 SKV1)', amount: 1000000, from: '2026-10', to: '' },
      { name: '자사몰 운영 툴 (카페24 · 리뷰 · 채널톡 · 알림톡)', amount: 500000, from: '2026-10', to: '' },
      { name: '업무 툴 (워크스페이스 · 노션 · 슬랙 · AI)', amount: 400000, from: '2026-10', to: '' },
      { name: '3PL 기본료 · 보관 최소료 (품고)', amount: 300000, from: '2026-11', to: '' },
      { name: '브랜드 콘텐츠 · 시딩 (광고비 외 고정 마케팅)', amount: 2000000, from: '2026-11', to: '' },
      { name: '세무 기장료', amount: 300000, from: '2026-10', to: '' },
      { name: '정책자금 이자 (혁신청년 7,000만 · 연 3% 가정)', amount: 175000, from: '2026-10', to: '' },
      { name: '기타 (통신 · 소모품 · 교통 · 보험)', amount: 700000, from: '2026-10', to: '' }
    ],
    hires: [
      { role: '브랜드 디자인 리더', monthly: 4000000, from: '2027-02' },
      { role: 'D2C 국내 리더', monthly: 4000000, from: '2027-04' },
      { role: '콘텐츠 팀원', monthly: 3200000, from: '2027-05' },
      { role: 'D2C 해외 리더', monthly: 4500000, from: '2027-08' },
      { role: '연구개발 전담 매니저', monthly: 4000000, from: '2027-09' }
    ]
  };
  function simCfg() { var s = F.cfg.sim || {}; var o = JSON.parse(JSON.stringify(SIM0)); Object.keys(s).forEach(function (k) { o[k] = s[k]; }); return o; }
  var draft = null;   // 저장 전 편집본
  function cur() { if (!draft) draft = simCfg(); return draft; }
  function simFixedAt(c, ym) {
    var rows = [], total = 0;
    (c.fixed || []).forEach(function (f) { if ((!f.from || ym >= f.from) && (!f.to || ym <= f.to) && +f.amount) { rows.push([f.name, +f.amount]); total += +f.amount; } });
    (c.hires || []).forEach(function (x) { if (x.from && ym >= x.from && +x.monthly) { rows.push([x.role, +x.monthly]); total += +x.monthly; } });
    return { rows: rows, total: total };
  }
  F.simulate = function (c) {
    c = c || simCfg();
    var u = F.unitPnl(), cogs = u.cogs;
    var bal = F.balance(), cash = c.cash0 != null && c.cash0 !== '' ? +c.cash0 : bal.amount;
    var st = F.invStock ? F.invStock() : {}, prod = Object.keys(st).map(function (k) { return st[k]; }).filter(function (x) { return x.it.type === 'product'; })[0];
    var stock = c.stock0 != null && c.stock0 !== '' ? +c.stock0 : (prod ? prod.onHand + prod.ordered : 5000);
    var committed = c.committed ? F.sched.filter(function (s) { return s.kind !== 'monthly' && !s.paid && s.date >= fmt.today(); }) : [];
    var ownerLeft = +c.ownerTotal || 0, ownerUsed = 0, rows = [], q = 0, pending = [], firstNeg = null, profitable = null, lowest = { v: Infinity, ym: '' };
    for (var i = 0; i < (+c.months || 24); i++) {
      var ym = fmt.ymShift(c.start, i), r = { ym: ym };
      // 판매 계획
      var planned = 0;
      if (ym >= c.launch) {
        q = ym === c.launch ? +c.units.first : Math.min(+c.units.cap || Infinity, Math.round(q * (1 + (+c.units.growth || 0) / 100)));
        planned = c.unitsOver && c.unitsOver[ym] != null ? +c.unitsOver[ym] : q;
      }
      // 재고 도착
      pending.filter(function (p) { return p.arrive === ym; }).forEach(function (p) { stock += p.lot; r.arrived = (r.arrived || 0) + p.lot; });
      var sold = Math.min(planned, stock); stock -= sold;
      r.planned = planned; r.sold = sold; r.lost = planned - sold; r.stock = stock;
      r.rev = sold * u.net; r.varc = sold * u.varNoAd; r.ad = sold * u.ad; r.contrib = sold * u.contrib;
      var fx = simFixedAt(c, ym); r.fixed = fx.total;
      // 재발주: 남은 재고가 앞으로 safety개월 판매 예상보다 적고 진행 중 발주가 없으면 lot 발주 (선금 → 도착 시 잔금)
      r.inv = 0;
      pending.filter(function (p) { return p.payRest === ym; }).forEach(function (p) { r.inv += p.rest; });
      var nextNeed = Math.max(planned, q) * (+c.reorder.safety || 2);
      if (ym >= c.launch && stock < nextNeed && !pending.some(function (p) { return p.arrive > ym; })) {
        var lot = +c.reorder.lot || 5000, cost = lot * cogs, up = cost * (+c.reorder.upfront || 0) / 100, arrive = fmt.ymShift(ym, +c.reorder.lead || 2);
        pending.push({ lot: lot, arrive: arrive, payRest: arrive, rest: cost - up }); r.inv += up; r.order = lot;
      }
      r.committed = committed.filter(function (s) { return s.date.slice(0, 7) === ym; }).reduce(function (a, s) { return a + (+s.amount || 0); }, 0);
      r.loan = c.loan && c.loan.on && c.loan.ym === ym ? +c.loan.amount || 0 : 0;
      r.flow = r.rev - r.varc - r.ad - r.fixed - r.inv - r.committed + r.loan;
      cash += r.flow;
      // 대표 자금: 월말 잔액이 최소 보유액 아래로 내려가면 필요한 만큼(단위 반올림)만 투입
      r.owner = 0;
      if (cash < +c.minCash && ownerLeft > 0) {
        var step = +c.ownerStep || 1, need = Math.min(ownerLeft, Math.ceil((+c.minCash - cash) / step) * step);
        r.owner = need; cash += need; ownerLeft -= need; ownerUsed += need;
      }
      r.cash = cash; r.op = r.contrib - r.fixed;
      if (cash < 0 && firstNeg == null) firstNeg = i;
      if (profitable == null && sold && r.op >= 0) profitable = ym;
      if (cash < lowest.v) lowest = { v: cash, ym: ym };
      rows.push(r);
    }
    return { rows: rows, u: u, start: c.cash0 != null && c.cash0 !== '' ? +c.cash0 : bal.amount, stock0: stock, ownerUsed: ownerUsed, ownerLeft: ownerLeft, firstNeg: firstNeg, profitable: profitable, lowest: lowest,
      bepUnits: u.contrib > 0 ? Math.ceil(simFixedAt(c, c.launch).total / u.contrib) : null };
  };

  function sim(view) {
    var c = cur(), ed = F.canEdit(), R = F.simulate(c), dirty = JSON.stringify(c) !== JSON.stringify(simCfg());
    var set = function (path, v) { var o = c; var ks = path.split('.'); ks.slice(0, -1).forEach(function (k) { o = o[k]; }); o[ks[ks.length - 1]] = v; HR.refresh(); };
    var inp = function (label, path, type, cls) {
      var v = path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, c);
      var i = type === 'money' ? F.moneyInput({ value: v != null && v !== '' ? v : '' }) : ui.input({ type: type || 'number', step: 'any', value: v != null ? String(v) : '' });
      if (!ed) i.disabled = true;
      i.addEventListener('change', function () { set(path, type === 'money' ? (i.value.trim() === '' ? null : F.parseWon(i.value)) : type === 'month' ? i.value : (i.value === '' ? null : +i.value)); });
      return ui.field(label, i, cls);
    };
    var chk = function (label, path) {
      var v = path.split('.').reduce(function (o, k) { return o[k]; }, c), b = h('input', { type: 'checkbox', checked: !!v, disabled: ed ? null : true, onchange: function () { set(path, this.checked); } });
      return h('label', { class: 'check' }, b, ' ' + label);
    };
    // 고정비 · 채용 표 (편집)
    var listEditor = function (key, cols, blank) {
      var box = h('div', { class: 'stack' });
      (c[key] || []).forEach(function (row, idx) {
        box.appendChild(h('div', { class: 'row fin-acct-row' }, cols.map(function (col) {
          var i = col[2] === 'money' ? F.moneyInput({ value: row[col[0]] || '' }) : ui.input({ type: col[2] || 'text', value: row[col[0]] || '' });
          if (!ed) i.disabled = true;
          i.addEventListener('change', function () { row[col[0]] = col[2] === 'money' ? F.parseWon(i.value) : i.value; HR.refresh(); });
          return ui.field(col[1], i, col[3]);
        }), ed ? ui.btn('삭제', function () { c[key].splice(idx, 1); HR.refresh(); }, 'btn-line btn-xs') : null));
      });
      if (ed) box.appendChild(ui.btn('+ 추가', function () { c[key].push(JSON.parse(JSON.stringify(blank))); HR.refresh(); }, 'btn-line btn-sm'));
      return box;
    };
    var last = R.rows[R.rows.length - 1] || {};
    var bars = R.rows.map(function (r, i) { return { label: F.ymLabel(r.ym), v: r.cash, cls: i === 11 ? 'gate' : '', title: r.ym + ' 월말 ' + F.won(r.cash) }; });
    var tb = h('table', { class: 'table fin-table fin-sim' }, h('thead', null, h('tr', null, ['월', '판매', '재고', '순매출', '변동비', '광고비', '고정비', '재고 매입', '확정 지급', '조달', '대표 투입', '월 현금흐름', '월말 현금'].map(function (x, i) { return h('th', { class: i ? 'num' : '', text: x }); }))),
      h('tbody', null, R.rows.map(function (r) {
        var m = function (v) { return v ? F.man(v) : ''; };
        return h('tr', { class: r.cash < 0 ? 'fin-zero' : '' }, h('td', { text: r.ym.replace('-', '.') + (r.ym === c.launch ? ' 런칭' : '') }),
          h('td', { class: 'num' + (r.lost ? ' red' : ''), text: r.sold ? r.sold.toLocaleString('ko-KR') + (r.lost ? ' (−' + r.lost + ')' : '') : '' }),
          h('td', { class: 'num meta', text: r.stock.toLocaleString('ko-KR') + (r.arrived ? ' +' + r.arrived.toLocaleString('ko-KR') : '') + (r.order ? ' ▲발주' : '') }),
          h('td', { class: 'num', text: m(r.rev) }), h('td', { class: 'num', text: m(r.varc) }), h('td', { class: 'num', text: m(r.ad) }), h('td', { class: 'num', text: m(r.fixed) }),
          h('td', { class: 'num', text: m(r.inv) }), h('td', { class: 'num', text: m(r.committed) }), h('td', { class: 'num', text: m(r.loan) }), h('td', { class: 'num strong', text: m(r.owner) }),
          h('td', { class: 'num' + (r.flow < 0 ? ' red' : ''), text: F.man(r.flow) }), h('td', { class: 'num strong' + (r.cash < 0 ? ' red' : ''), text: F.man(r.cash) }));
      })));
    var fx0 = simFixedAt(c, c.launch).total, fxEnd = simFixedAt(c, last.ym || c.start).total;
    ui.put(view, ui.head('Simulation', '런웨이 시뮬레이션', ed ? h('div', { class: 'row' },
        dirty ? h('span', { class: 'meta red', text: '저장 안 된 변경' }) : null,
        ui.btn('되돌리기', function () { draft = null; HR.refresh(); }, 'btn-line btn-sm'),
        ui.confirmBtn('기본값으로', function () { draft = JSON.parse(JSON.stringify(SIM0)); HR.refresh(); }, 'btn-line btn-sm'),
        ui.btn('저장', function () { F.cfgSet({ sim: JSON.parse(JSON.stringify(c)) }).then(function () { ui.toast('시뮬레이션을 저장했습니다.'); HR.refresh(); }).catch(ui.fail); }, 'btn-sm')) : null),
      h('p', { class: 'note fin-sim-note', text: '실제 통장 · 장부와 분리된 가정 시트입니다. 숫자를 바꾸면 아래 결과가 바로 다시 계산되고, 「저장」을 눌러야 남습니다. 개당 손익은 「개당 손익」 메뉴 값을 그대로 씁니다.' }),
      F.kpi([['시작 현금', F.man(R.start), '', c.cash0 != null && c.cash0 !== '' ? '직접 입력' : '법인 통장 실잔액'],
        ['손익분기 판매량', R.bepUnits ? R.bepUnits.toLocaleString('ko-KR') + '개/월' : '-', '', '런칭 시점 고정비 ' + F.man(fx0) + ' ÷ 개당 ' + F.won(Math.round(R.u.contrib))],
        ['월 흑자 전환', R.profitable ? R.profitable.replace('-', '.') : '기간 내 없음', R.profitable ? '' : 'red', '공헌이익 ≥ 고정비'],
        ['대표 자금 필요', F.man(R.ownerUsed), R.ownerUsed > (+c.ownerTotal || 0) * 0.8 ? 'red' : '', '한도 ' + F.man(+c.ownerTotal || 0) + ' 중 · 남음 ' + F.man(R.ownerLeft)],
        ['최저 현금', F.man(R.lowest.v), R.lowest.v < 0 ? 'red' : '', R.lowest.ym.replace('-', '.')],
        ['현금 바닥', R.firstNeg != null ? R.rows[R.firstNeg].ym.replace('-', '.') : '없음', R.firstNeg != null ? 'red' : '', R.firstNeg != null ? '대표 자금까지 다 써도 부족' : (+c.months) + '개월 안']]),
      ui.panel('Cash · 월말 현금', null, F.bars(bars), h('p', { class: 'meta', text: '대표 자금은 월말 현금이 최소 보유액(' + F.man(+c.minCash) + ') 아래로 내려가는 달에만 필요한 만큼 넣는 것으로 계산합니다.' })),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Sales · 판매 가정', null, h('div', { class: 'stack fin-form' },
          h('div', { class: 'row' }, inp('시뮬레이션 시작', 'start', 'month'), inp('런칭 월', 'launch', 'month'), inp('기간 (개월)', 'months')),
          h('div', { class: 'row' }, inp('런칭 첫 달 판매 (개)', 'units.first'), inp('월 성장률 (%)', 'units.growth'), inp('월 판매 상한 (개)', 'units.cap')),
          h('p', { class: 'meta', text: '개당 남는 돈 ' + F.won(Math.round(R.u.contrib)) + ' (순매출 ' + F.won(Math.round(R.u.net)) + ' − 원가 ' + F.won(Math.round(R.u.cogs)) + ' − 물류 · 수수료 · 반품 · 리뷰 · 광고 ' + R.u.e.adRate + '%) — 개당 손익 메뉴 값. 광고비 비중을 바꾸려면 개당 손익에서.' }))),
        ui.panel('Cash · 현금 · 자금', null, h('div', { class: 'stack fin-form' },
          h('div', { class: 'row' }, inp('시작 현금 (비우면 실잔액)', 'cash0', 'money'), inp('최소 보유 현금', 'minCash', 'money')),
          h('div', { class: 'row' }, inp('대표 자금 한도', 'ownerTotal', 'money'), inp('투입 단위', 'ownerStep', 'money')),
          chk('이미 정해진 지급 반영 (지출예정의 미래 일회성: 담아 튜브 · 에코먼트 잔금 등)', 'committed'),
          chk('추가 대출 반영', 'loan.on'), h('div', { class: 'row' }, inp('대출 입금 월', 'loan.ym', 'month'), inp('대출 금액', 'loan.amount', 'money'))))),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Fixed · 월 고정비 ' + F.man(simFixedAt(c, F.thisYm()).total) + ' (지금)', null, listEditor('fixed', [['name', '항목', 'text', 'grow'], ['amount', '월 금액', 'money'], ['from', '시작', 'month'], ['to', '끝 (비우면 계속)', 'month']], { name: '', amount: 0, from: c.start, to: '' })),
        ui.panel('Hires · 채용 계획 (월 인건비, 4대보험 포함)', null, listEditor('hires', [['role', '역할', 'text', 'grow'], ['monthly', '월 인건비', 'money'], ['from', '입사 월', 'month']], { role: '', monthly: 0, from: '' }),
          h('p', { class: 'meta', text: '조직도 채용 일정(천우재 260915판) 기준 · 금액은 가정입니다. 마지막 달 고정비 ' + F.man(fxEnd) + '.' }))),
      ui.panel('Inventory · 재발주 규칙', null, h('div', { class: 'stack fin-form' }, h('div', { class: 'row' },
        inp('시작 재고 (비우면 재고 탭)', 'stock0'), inp('1회 발주 수량', 'reorder.lot'), inp('리드타임 (개월)', 'reorder.lead'), inp('선금 (%)', 'reorder.upfront'), inp('안전재고 (개월분)', 'reorder.safety')),
        h('p', { class: 'meta', text: '남은 재고가 「안전재고 × 월 판매」보다 적어지면 그 달에 발주(선금 지급), 리드타임 뒤 입고되며 잔금을 냅니다. 발주 단가는 제품 원가(공급가) ' + F.won(Math.round(R.u.cogs)) + '/개. 재고가 모자라 못 판 수량은 판매 칸에 빨간 (−)로 표시합니다.' }))),
      ui.panel('Monthly · 월별 결과', null, h('div', { class: 'table-wrap flat' }, tb)),
      h('p', { class: 'note', text: '현금 기준 단순 모형입니다: 매출 · 비용 모두 부가세 별도, 정산은 판매한 달에 들어온다고 가정(자사몰 PG). 쿠팡 등 정산이 늦은 채널, 부가세 납부 시차, 대출 상환, 반품은 다음 단계에서 분리합니다.' }));
  }

  HR.register('unit', { render: unit });
  HR.register('sim', { render: sim });
})();

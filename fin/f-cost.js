/* fillts Finance — 지출 흐름: 고정비(회사 운영) · 변동비(판매에 따라) · 일회성 · 예정
   고정비 = fin_sched의 「매월 반복」 항목 → 런웨이의 고정 지출로 바로 들어간다.
   변동비 = 개당 손익의 1개당 값 × 월 판매 예상(fin_config/main.runSales) → 런웨이의 매출 · 변동비.
   일회성 = 기존 지출예정 화면(fin_sched 「한 번」 + HR 입금요청). */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  // 고정비 분류 — 거래내역 분류와 같은 이름을 써서 실제 통장 출금과 맞춰 볼 수 있게
  var FCATS = [
    ['급여', '인건비', '급여 · 4대보험 회사 부담분 · 퇴직금 적립. 사람별로 한 줄씩.'],
    ['임대료 · 관리비', '임대 · 관리', '사무실 · 창고 임대료, 관리비, 공용 공과금.'],
    ['소프트웨어 · 구독', '툴 · 구독', '카페24 · 리뷰 앱 · 채널톡 · 알림톡, 워크스페이스 · 노션 · 슬랙 · AI 구독.'],
    ['물류 · 배송', '물류 기본료', '3PL 기본료 · 보관 최소료처럼 판매량과 상관없이 나가는 것.'],
    ['세무 · 법무 · 자문', '세무 · 자문', '기장료 · 노무 · 변리 · 법률 자문 정기 비용.'],
    ['이자 · 수수료', '금융 비용', '대출 이자, 계좌 · 카드 정기 수수료.'],
    ['마케팅 · 광고', '마케팅(고정)', '판매량과 별개로 매달 쓰는 콘텐츠 제작 · 시딩 · 에이전시 월정액. 매출 비례 광고비는 「변동비」에서.'],
    ['기타 지출', '기타', '통신 · 소모품 · 교통 · 보험 등.']
  ];
  var catLabel = function (c) { return (FCATS.filter(function (x) { return x[0] === c; })[0] || [c, c])[1]; };
  var won = function (v) { return F.won(Math.round(v || 0)); };

  /* ---------- 고정비 ---------- */
  function fixedTab(view) {
    var ed = F.canEdit(), ym = F.thisYm(), next = fmt.ymShift(ym, 1);
    var list = F.sched.filter(function (s) { return s.kind === 'monthly'; });
    var order = FCATS.map(function (x) { return x[0]; });
    list.sort(function (a, b) { return (order.indexOf(a.cat) - order.indexOf(b.cat)) || ((a.title || '') < (b.title || '') ? -1 : 1); });
    var upd = function (s, patch) { return db.doc('fin_sched/' + s.id).update(Object.assign({ updatedAt: FV.serverTimestamp() }, patch)).catch(ui.fail); };
    var body = h('tbody'), lastCat = null;
    list.forEach(function (s) {
      var ended = s.end && ym > s.end, future = s.start && ym < s.start;
      var nm = ui.input({ value: s.title || '', maxlength: 60, class: 'fin-cell fin-cell-text', disabled: ed ? null : true });
      nm.addEventListener('change', function () { upd(s, { title: nm.value.trim() }); });
      var cat = ui.select(FCATS.map(function (x) { return [x[0], x[1]]; }), s.cat || '기타 지출', { class: 'fin-cell', disabled: ed ? null : true, onchange: function () { upd(s, { cat: this.value }); } });
      var amt = F.moneyInput({ value: s.amount || '' }); amt.className = 'fin-cell'; if (!ed) amt.disabled = true;
      amt.addEventListener('change', function () { upd(s, { amount: F.parseWon(amt.value), assumed: false }); });
      var day = ui.input({ type: 'number', min: '1', max: '31', value: String(s.day || 25), class: 'fin-cell fin-cell-sm', disabled: ed ? null : true });
      day.addEventListener('change', function () { upd(s, { day: Math.max(1, Math.min(31, +day.value || 1)) }); });
      var st = ui.input({ type: 'month', value: s.start || '', class: 'fin-cell', disabled: ed ? null : true });
      st.addEventListener('change', function () { upd(s, { start: st.value }); });
      var en = ui.input({ type: 'month', value: s.end || '', class: 'fin-cell', disabled: ed ? null : true });
      en.addEventListener('change', function () { upd(s, { end: en.value }); });
      var memo = ui.input({ value: s.memo || '', maxlength: 200, class: 'fin-cell fin-cell-text', placeholder: '계약 · 담당 · 메모', disabled: ed ? null : true });
      memo.addEventListener('change', function () { upd(s, { memo: memo.value.trim() }); });
      body.appendChild(h('tr', { class: (s.cat !== lastCat ? 'fin-grp-first ' : '') + (ended ? 'fin-off' : '') },
        h('td', { class: 'fin-grp', text: s.cat !== lastCat ? catLabel(s.cat) : '' }), h('td', { class: 'fin-name' }, nm, h('div', { class: 'fin-flags' }, s.assumed ? ui.tag('가정값', 'warn') : null, future ? ui.tag(+s.start.slice(5) + '월부터', 'mute') : null, ended ? ui.tag('종료', 'mute') : null)), h('td', null, cat), h('td', { class: 'fin-in' }, amt),
        h('td', null, day), h('td', null, st), h('td', null, en), h('td', null, memo),
        ed ? h('td', null, ui.confirmBtn('삭제', function () { db.doc('fin_sched/' + s.id).delete().catch(ui.fail); })) : h('td')));
      lastCat = s.cat;
    });
    if (!list.length) body.appendChild(h('tr', null, h('td', { colspan: '9', class: 'empty', text: '고정비가 없습니다. 아래 「+ 고정비 추가」로 임대료 · 인건비부터 넣으세요.' })));
    var tb = h('table', { class: 'table fin-table fin-inputs fin-fixed' }, h('thead', null, h('tr', null, ['분류', '항목', '분류', '월 금액 (원)', '매월 며칠', '시작 월', '끝 월 (비우면 계속)', '메모', ''].map(function (x, i) { return h('th', { class: i === 3 ? 'num' : '', text: x }); }))), body);
    // 분류별 합계
    var byCat = {}, total = 0, totalNext = 0, assumed = 0;
    list.forEach(function (s) {
      if ((!s.start || ym >= s.start) && (!s.end || ym <= s.end)) { byCat[s.cat] = (byCat[s.cat] || 0) + (+s.amount || 0); total += +s.amount || 0; if (s.assumed) assumed++; }
      if ((!s.start || next >= s.start) && (!s.end || next <= s.end)) totalNext += +s.amount || 0;
    });
    var sum = h('ul', { class: 'list' }, FCATS.filter(function (x) { return byCat[x[0]]; }).map(function (x) {
      var bar = h('span', { class: 'fw-fill' }); bar.style.width = Math.max(2, Math.round(byCat[x[0]] / (total || 1) * 100)) + '%';
      return h('li', null, h('span', { class: 'grow', text: x[1] }), h('span', { class: 'fw-track fin-mixbar' }, bar), h('span', { class: 'num', text: won(byCat[x[0]]) + ' · ' + (byCat[x[0]] / (total || 1) * 100).toFixed(0) + '%' }));
    }));
    var guide = h('ul', { class: 'list fin-guide-list' }, FCATS.map(function (x) { return h('li', null, h('span', { class: 'strong fin-guide-k', text: x[1] }), h('span', { class: 'meta', text: x[2] })); }));
    var u = F.unitPnl ? F.unitPnl() : null, bep = u && u.contrib > 0 ? Math.ceil(total / u.contrib) : null;
    var p = F.project('base', 24);
    ui.put(view, F.kpi([['월 고정비 (이번 달)', F.man(total), '', list.filter(function (s) { return (!s.start || ym >= s.start) && (!s.end || ym <= s.end); }).length + '개 항목'],
      ['다음 달', F.man(totalNext), totalNext > total ? 'red' : '', totalNext !== total ? (totalNext > total ? '+' : '') + F.man(totalNext - total) : '변동 없음'],
      ['연간 환산', F.man(total * 12)],
      ['가정값 남음', assumed + '개', assumed ? 'red' : '', assumed ? '노란 「가정값」 표시 — 실제 금액으로 수정' : '모두 실제 값'],
      ['판매와 무관', '매달 고정', '', '판매 · 광고에 따라 바뀌는 돈은 시뮬레이션에서']]),
      ui.panel('Fixed · 회사 운영 고정비 (매달 판매와 상관없이 나가는 돈)', ed ? ui.btn('+ 고정비 추가', function () {
        db.collection('fin_sched').add({ title: '새 고정비', kind: 'monthly', amount: 0, cat: '기타 지출', day: 25, start: F.thisYm(), end: '', vendor: '', memo: '', paid: false, paidYms: [], by: S.mid, createdAt: FV.serverTimestamp() }).catch(ui.fail);
      }, 'btn-sm') : null, h('div', { class: 'table-wrap flat' }, tb),
        h('p', { class: 'meta', text: '엑셀처럼 칸을 바로 고치면 저장됩니다. 끝 월을 넣으면 그 달 이후엔 빠지고(흐리게 표시), 시작 월이 미래면 그때부터 런웨이에 들어갑니다. 채용 예정 인건비는 입사 월을 시작 월로 넣으세요.' })),
      h('div', { class: 'two-col fin-two' }, ui.panel('Mix · 분류별 (이번 달)', null, list.length ? sum : ui.empty('없음')), ui.panel('Guide · 무엇을 고정비로 넣나', null, guide)));
  }

  /* ---------- 변동비 ---------- */
  function varTab(view) {
    var ed = F.canEdit(), u = F.unitPnl(), e = u.e, rs = Object.assign({ units: '', from: '2026-11', growth: 0, cap: '' }, F.cfg.runSales || {});
    var rows = [['반품 · 환불', u.ret, '순매출의 ' + e.returnRate + '%'], ['택배비', u.ship, F.won(e.ship) + '/주문 ÷ ' + e.upo + '개'], ['출고 작업', u.pick, F.won(e.pick) + '/주문 ÷ ' + e.upo + '개'],
      ['박스 · 완충재', u.box, F.won(e.box) + '/주문 ÷ ' + e.upo + '개'], ['보관비', u.storage, '개당'], ['결제수수료', u.pg, '실결제의 ' + e.pgRate + '%'], ['리뷰 적립 · 사은', u.review, '개당'],
      ['광고비', u.ad, '실결제의 ' + e.adRate + '%']];
    var tot = rows.reduce(function (a, r) { return a + r[1]; }, 0);
    var tb = h('table', { class: 'table fin-table fin-narrow fin-inputs' }, h('thead', null, h('tr', null, ['1개 팔 때마다', '금액', '기준'].map(function (x, i) { return h('th', { class: i === 1 ? 'num' : '', text: x }); }))),
      h('tbody', null, rows.map(function (r) { return h('tr', null, h('td', { text: r[0] }), h('td', { class: 'num', text: won(r[1]) }), h('td', { class: 'meta', text: r[2] })); }),
        h('tr', { class: 'fin-result' }, h('td', { class: 'strong', text: '변동비 합계 (원가 제외)' }), h('td', { class: 'num strong', text: won(tot) }), h('td', { class: 'meta', text: '순매출 ' + won(u.net) + '의 ' + (tot / u.net * 100).toFixed(1) + '%' })),
        h('tr', { class: 'fin-auto' }, h('td', { text: '제품 원가 (재고)' }), h('td', { class: 'num', text: won(u.cogs) }), h('td', { class: 'meta', text: '재고 매입 때 이미 나간 돈 — 현금 런웨이에서는 재고 매입(지출예정)으로 계산' }))));
    var field = function (label, key, type) {
      var i = type === 'month' ? ui.input({ type: 'month', value: rs[key] || '' }) : ui.input({ type: 'number', min: '0', step: 'any', value: rs[key] !== '' && rs[key] != null ? String(rs[key]) : '' });
      if (!ed) i.disabled = true;
      i.addEventListener('change', function () { var o = Object.assign({}, F.cfg.runSales || {}); o[key] = type === 'month' ? i.value : (i.value === '' ? '' : +i.value); F.cfgSet({ runSales: o }).then(function () { ui.toast('런웨이에 반영했습니다.'); }).catch(ui.fail); });
      return ui.field(label, i);
    };
    var vols = [300, 500, 1000, 2000, 3000];
    var sc = h('table', { class: 'table fin-table fin-narrow' }, h('thead', null, h('tr', null, h('th', { text: '월 판매' }), vols.map(function (v) { return h('th', { class: 'num', text: v.toLocaleString('ko-KR') + '개' }); }))),
      h('tbody', null, [['순매출', u.net], ['변동비 (원가 제외)', tot], ['제품 원가', u.cogs], ['남는 돈 (공헌이익)', u.contrib]].map(function (r, i) {
        return h('tr', { class: i === 3 ? 'fin-sum fin-mine' : '' }, h('td', { text: r[0] }), vols.map(function (v) { return h('td', { class: 'num', text: F.man(r[1] * v) }); }));
      })));
    ui.put(view, F.kpi([['1개당 변동비', won(tot), '', '원가 제외 · 광고 포함'], ['1개당 제품 원가', won(u.cogs)], ['1개당 남는 돈', won(u.contrib), u.contrib < 0 ? 'red' : ''],
      ['런웨이 판매 반영', +rs.units ? (+rs.units).toLocaleString('ko-KR') + '개/월~' : '안 함', '', +rs.units ? (rs.from || '').replace('-', '.') + '부터 · 월 +' + (rs.growth || 0) + '%' : '아래에 월 판매 예상을 넣으면 반영']]),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Variable · 판매할 때마다 나가는 돈', h('a', { href: '#unit', class: 'meta', text: '개당 손익에서 수정 →' }), h('div', { class: 'table-wrap flat' }, tb)),
        ui.panel('Runway · 런웨이에 판매 반영', null, h('div', { class: 'stack fin-form' },
          h('div', { class: 'row' }, field('월 판매 예상 (개)', 'units'), field('시작 월', 'from', 'month')), h('div', { class: 'row' }, field('월 성장률 (%)', 'growth'), field('월 상한 (개)', 'cap'))),
          h('p', { class: 'meta', text: '넣으면 런웨이가 「월 판매 × 순매출」을 매출로, 「월 판매 × 1개당 변동비」를 변동비로 계산합니다. 비우면 통장 거래내역의 최근 3개월 평균을 씁니다. 실험용 가정 시나리오는 시뮬레이션 메뉴에서.' }))),
      ui.panel('Scale · 판매량별 한 달', null, h('div', { class: 'table-wrap flat' }, sc)));
  }

  function render(view, parts) {
    var sub = parts[0] || '';
    ui.put(view, ui.head('Cost flow', '지출 흐름'), ui.tabs([['', '고정비'], ['once', '일회성 · 예정']], sub, 'cost'));
    if (sub === 'once') { var tmp = h('div'); HR.modules.sched.render(tmp, parts.slice(1)); Array.prototype.slice.call(tmp.childNodes).forEach(function (n, i) { if (i) view.appendChild(n); }); }   // 지출예정 화면 재사용 (제목 줄 제외)
    else fixedTab(view);
  }
  HR.register('cost', { render: render });
})();

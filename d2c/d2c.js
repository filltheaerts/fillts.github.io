/* fillts D2C — 화면
   원고(전략 항목) = d2c_docs/main json { launch, north, flow, musts, areas:[{ id, name, lead, focus, items:[{ id, t, why, how, when, metric, tool, src }] }], kpis, source }
   진행 상태 = d2c_state/{항목id} { status, owner, note } · 직접 추가한 항목 = d2c_items (상태 · 담당 · 메모를 같은 문서에 둔다)
   LTV 계산 입력값 = d2c_docs/kpi — 시뮬레이션이다. 실제 숫자 화면과 섞지 않는다 */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, L = HR.L;
  var FV = firebase.firestore.FieldValue;
  var G = { doc: null, state: {}, mine: [], kpi: null, loaded: 0 };
  HR.APP.onStart = function (sub) {
    sub(db.doc('d2c_docs/main'), function (s) { try { G.doc = s.exists ? JSON.parse(s.data().json || '{}') : {}; } catch (e) { G.doc = {}; } G.loaded++; });
    sub(db.doc('d2c_docs/kpi'), function (s) { G.kpi = s.exists ? s.data() : {}; });
    sub(db.collection('d2c_state'), function (s) { var m = {}; HR.rows(s).forEach(function (r) { m[r.id] = r; }); G.state = m; });
    sub(db.collection('d2c_items'), function (s) { G.mine = HR.rows(s).sort(function (a, b) { return ((a.at && a.at.seconds) || 0) - ((b.at && b.at.seconds) || 0); }); });
  };
  var canEdit = function () { return S.isAdmin || HR.appLevel('d2c') === 'edit'; };
  var D = function () { return G.doc || {}; };
  var today = function () { return fmt.today(); };
  var wait = function (view) { if (G.loaded) return false; ui.put(view, ui.empty('불러오는 중…')); return true; };
  var head = function (view, title, right) { ui.put(view, ui.head('D2C · 자사몰 성장', title, right)); };
  var won = function (v) { return Math.round(+v || 0).toLocaleString('ko-KR') + '원'; };

  var PHASE = [['pre', '런칭 전', '~ 11/11'], ['launch', '런칭 직후', '첫 30일'], ['m1', 'M+1~3', '2~4개월'], ['m3', 'M+3 이후', '5개월~']];
  var STATUS = [['', '검토 전'], ['doing', '진행 중'], ['done', '완료'], ['hold', '보류'], ['skip', '안 함']];
  var phaseName = function (k) { var p = PHASE.filter(function (x) { return x[0] === k; })[0]; return p ? p[1] : '상시'; };
  var ORDER = ['store', 'aov', 'retain', 'crm', 'cs', 'cohort'];   // 메뉴 묶음 순서: 매출 > CRM > CS > 지표
  var areas = function () { return (D().areas || []).slice().sort(function (a, b) { return ORDER.indexOf(a.id) - ORDER.indexOf(b.id); }); };
  var area = function (id) { return areas().filter(function (a) { return a.id === id; })[0] || null; };
  // 원고 항목 + 직접 추가한 항목 (상태는 d2c_state 또는 자기 문서)
  function itemsOf(aid) {
    var a = area(aid), base = a ? (a.items || []).map(function (it) { return Object.assign({ area: aid }, it, G.state[it.id] || {}, { id: it.id, seed: true }); }) : [];
    return base.concat(G.mine.filter(function (m) { return m.area === aid; }));
  }
  function allItems() { return areas().reduce(function (acc, a) { return acc.concat(itemsOf(a.id)); }, []); }
  function prog(list) {
    var live = list.filter(function (i) { return i.status !== 'skip'; });
    var done = live.filter(function (i) { return i.status === 'done'; }).length;
    return { done: done, doing: live.filter(function (i) { return i.status === 'doing'; }).length, total: live.length, pct: live.length ? Math.round(done / live.length * 100) : 0 };
  }

  /* ---------- 저장 ---------- */
  function saveState(it, patch) {
    patch.updatedAt = FV.serverTimestamp(); patch.updatedBy = S.mid || '';
    var ref = it.seed ? db.collection('d2c_state').doc(it.id) : db.collection('d2c_items').doc(it.id);
    return ref.set(patch, { merge: true }).then(function () { HR.refresh(); }).catch(function (e) { ui.toast('저장하지 못했습니다 — ' + (e.code || e.message)); });
  }

  /* ---------- 공용 조각 ---------- */
  function stTag(s) { var n = (STATUS.filter(function (x) { return x[0] === (s || ''); })[0] || STATUS[0])[1]; return h('span', { class: 'dc-st dc-st-' + (s || 'none'), text: n }); }
  function phTag(k) { return h('span', { class: 'dc-ph dc-ph-' + (k || 'any'), text: phaseName(k) }); }
  function bar(p) { return h('div', { class: 'dc-bar', title: p.done + ' / ' + p.total + ' 완료' }, h('span', { style: 'width:' + p.pct + '%' })); }
  function dday() {
    var l = D().launch; if (!l) return '';
    var n = L.daysBetween(today(), l);
    return n > 0 ? 'D-' + n : n === 0 ? 'D-DAY' : 'D+' + (-n);
  }
  function srcLinks(src) {
    if (!src || !src.length) return null;
    return h('div', { class: 'dc-src' }, '출처 ', src.map(function (u, i) {
      var label = String(u).replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      return /^https?:/.test(u) ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: (i ? ' · ' : '') + label }) : h('span', { text: (i ? ' · ' : '') + u });
    }));
  }

  /* ---------- 항목 카드 ---------- */
  function card(it, opts) {
    opts = opts || {};
    var ed = canEdit();
    var sel = ui.select(STATUS, it.status || '', { class: 'dc-sel', disabled: !ed, 'aria-label': '상태' });
    sel.addEventListener('change', function () { saveState(it, { status: sel.value }); });
    var owner = ui.input({ class: 'dc-owner', value: it.owner || '', placeholder: '담당', maxlength: 20, disabled: !ed, 'aria-label': '담당' });
    owner.addEventListener('change', function () { saveState(it, { owner: owner.value.trim() }); });
    var note = h('textarea', { class: 'dc-note', rows: 2, placeholder: ed ? '메모 — 결정 · 실제 세팅값 · 남은 일' : '', maxlength: 2000, disabled: !ed });
    note.value = it.note || '';
    note.addEventListener('change', function () { saveState(it, { note: note.value.trim() }); });
    var body = h('div', { class: 'dc-body' },
      it.why ? h('div', { class: 'dc-row' }, h('div', { class: 'dc-k', text: '왜' }), h('p', { class: 'dc-v', text: it.why })) : null,
      it.how ? h('div', { class: 'dc-row' }, h('div', { class: 'dc-k', text: '어떻게' }), h('p', { class: 'dc-v', text: it.how })) : null,
      it.tool ? h('div', { class: 'dc-row' }, h('div', { class: 'dc-k', text: '카페24' }), h('p', { class: 'dc-v', text: it.tool })) : null,
      it.metric ? h('div', { class: 'dc-row' }, h('div', { class: 'dc-k', text: '지표' }), h('p', { class: 'dc-v dc-metric', text: it.metric })) : null,
      srcLinks(it.src),
      h('div', { class: 'dc-edit' }, sel, owner, note,
        !it.seed && ed ? ui.confirmBtn('삭제', function () { db.collection('d2c_items').doc(it.id).delete().then(HR.refresh).catch(function (e) { ui.toast('삭제하지 못했습니다 — ' + (e.code || e.message)); }); }) : null));
    var d = h('details', { class: 'dc-card' + (it.status === 'done' ? ' dc-done' : it.status === 'skip' ? ' dc-skip' : ''), id: 'i-' + it.id },
      h('summary', null,
        h('span', { class: 'dc-t' }, it.t || '(제목 없음)', !it.seed ? h('span', { class: 'dc-mine', text: '직접 추가' }) : null),
        h('span', { class: 'dc-tags' }, opts.area ? h('span', { class: 'dc-area', text: (area(it.area) || {}).name || '' }) : null, phTag(it.when), it.owner ? h('span', { class: 'dc-who', text: it.owner }) : null, stTag(it.status))),
      body);
    if (opts.open) d.open = true;
    return d;
  }

  function addForm(aid) {
    if (!canEdit()) return null;
    var t = ui.input({ placeholder: '새 항목 — 예: 첫 구매 D+25 재구매 알림톡', maxlength: 120 });
    var when = ui.select(PHASE.map(function (p) { return [p[0], p[1]]; }), 'launch');
    var how = h('textarea', { rows: 2, placeholder: '어떻게 (선택)', maxlength: 2000 });
    var go = function () {
      var v = t.value.trim(); if (!v) return t.focus();
      db.collection('d2c_items').add({ area: aid, t: v, when: when.value, how: how.value.trim(), status: '', owner: '', note: '', by: S.mid || '', at: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(), updatedBy: S.mid || '' })
        .then(function () { ui.toast('추가했습니다.'); t.value = ''; how.value = ''; HR.refresh(); }).catch(function (e) { ui.toast('추가하지 못했습니다 — ' + (e.code || e.message)); });
    };
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
    return ui.panel('항목 추가', null, h('div', { class: 'dc-add' }, t, when, ui.btn('추가', go, 'btn-sm')), how);
  }

  /* ================= [home] 한판 ================= */
  function home(view) {
    if (wait(view)) return;
    var d = D(), all = allItems(), p = prog(all);
    head(view, 'D2C 한판', h('span', { class: 'meta', text: d.launch ? '자사몰(카페24) 오픈 ' + fmt.dot(d.launch) + ' · ' + dday() : '' }));
    if (!areas().length) { ui.put(view, ui.empty('전략 원고가 아직 올라오지 않았습니다 — hr_backend/data/seed_d2c.py')); return; }
    var pre = all.filter(function (i) { return i.when === 'pre' && i.status !== 'done' && i.status !== 'skip'; });
    var doing = all.filter(function (i) { return i.status === 'doing'; });
    ui.put(view,
      d.north ? h('section', { class: 'dc-north' }, h('div', { class: 'label', text: 'North Star · 북극성 지표' }), h('div', { class: 'dc-north-t', text: d.north.t }), d.north.why ? h('p', { class: 'dc-north-w', text: d.north.why }) : null) : null,
      h('dl', { class: 'summary four' },
        sumBox('전체 진행', p.done + ' / ' + p.total), sumBox('진행 중', doing.length + '건'),
        sumBox('런칭 전 남은 일', pre.length + '건', pre.length ? 'red' : ''), sumBox('오픈까지', dday() || '—')),
      (d.flow || []).length ? ui.panel('D2C 순환 — 고객이 지나가는 길', null, h('ol', { class: 'dc-flow' }, d.flow.map(function (f, i) {
        var a = area(f.area);
        return h('li', null, h('a', { href: '#' + (f.area || 'home') },
          h('span', { class: 'dc-flow-n', text: String(i + 1).padStart(2, '0') }), h('span', { class: 'dc-flow-t', text: f.t }), h('span', { class: 'dc-flow-d', text: f.d || '' }),
          a ? h('span', { class: 'dc-flow-a', text: '→ ' + a.name }) : null));
      }))) : null,
      ui.panel('분야별 진행', h('a', { class: 'link', href: '#plan', text: '로드맵 →' }), h('ul', { class: 'dc-areas' }, areas().map(function (a) {
        var ap = prog(itemsOf(a.id));
        return h('li', null, h('a', { href: '#' + a.id },
          h('div', { class: 'dc-areas-h' }, h('span', { class: 'strong', text: a.name }), h('span', { class: 'meta', text: ap.done + ' / ' + ap.total })),
          bar(ap), a.lead ? h('p', { class: 'meta', text: a.lead }) : null));
      }))),
      (d.musts || []).length ? ui.panel('런칭 전에 반드시 — 나중에 소급할 수 없는 것', null, h('ol', { class: 'dc-musts' }, d.musts.map(function (m) {
        return h('li', null, h('span', { class: 'strong', text: m.t }), m.d ? h('span', { class: 'meta', text: ' — ' + m.d }) : null, m.area ? h('a', { class: 'link dc-musts-a', href: '#' + m.area, text: (area(m.area) || {}).name || '' }) : null);
      }))) : null,
      doing.length ? ui.panel('진행 중', null, h('div', { class: 'dc-list' }, doing.map(function (i) { return card(i, { area: true }); }))) : null,
      d.source ? h('p', { class: 'note', text: '근거 · ' + d.source + (d.asOf ? ' (' + fmt.dot(d.asOf) + ' 기준)' : '') }) : null);
  }
  function sumBox(t, v, cls) { return h('div', null, h('dt', { text: t }), h('dd', { class: cls || '', text: v })); }

  /* ================= 분야 화면 (재구매 · CS · 크로스/업셀 · 코호트 · CRM · 자사몰) ================= */
  function areaView(aid) {
    return function (view, parts) {
      if (wait(view)) return;
      var a = area(aid);
      if (!a) { head(view, aid); ui.put(view, ui.empty('이 분야 원고가 아직 없습니다.')); return; }
      var f = parts[0] || 'all', list = itemsOf(aid), p = prog(list);
      head(view, a.name, h('span', { class: 'meta', text: p.done + ' / ' + p.total + ' 완료 · ' + p.pct + '%' }));
      var shown = f === 'all' ? list : f === 'open' ? list.filter(function (i) { return i.status !== 'done' && i.status !== 'skip'; }) : list.filter(function (i) { return i.when === f; });
      ui.put(view,
        a.lead ? h('p', { class: 'dc-lead', text: a.lead }) : null,
        (a.focus || []).length ? h('dl', { class: 'dc-focus' }, a.focus.map(function (x) { return h('div', null, h('dt', { text: x[0] }), h('dd', { text: x[1] })); })) : null,
        ui.tabs([['all', '전체 ' + list.length], ['open', '남은 일']].concat(PHASE.map(function (ph) { return [ph[0], ph[1] + ' ' + list.filter(function (i) { return i.when === ph[0]; }).length]; })), f, aid),
        h('div', { class: 'dc-tools' }, ui.btn('모두 펼치기', function () { view.querySelectorAll('.dc-card').forEach(function (d) { d.open = true; }); }, 'btn-line btn-xs'),
          ui.btn('모두 접기', function () { view.querySelectorAll('.dc-card').forEach(function (d) { d.open = false; }); }, 'btn-line btn-xs')),
        shown.length ? h('div', { class: 'dc-list' }, shown.map(function (i) { return card(i); })) : ui.empty('해당 항목이 없습니다.'),
        addForm(aid));
    };
  }

  /* ================= [plan] 로드맵 — 시기 × 분야 ================= */
  function plan(view) {
    if (wait(view)) return;
    head(view, '로드맵 — 언제 무엇을', h('span', { class: 'meta', text: '칸을 누르면 해당 항목으로 갑니다' }));
    var as = areas();
    ui.put(view,
      h('p', { class: 'dc-lead', text: '런칭 전 = 세팅(나중에 소급 불가) · 런칭 직후 30일 = 첫 구매 경험 · M+1~3 = 2회차 전환 · M+3 이후 = 코호트로 검증하고 키우기.' }),
      h('div', { class: 'table-wrap flat' }, h('table', { class: 'table dc-plan' },
        h('thead', null, h('tr', null, h('th', { text: '' }), PHASE.map(function (ph) { return h('th', null, ph[1], h('div', { class: 'meta', text: ph[2] })); }))),
        h('tbody', null, as.map(function (a) {
          var list = itemsOf(a.id);
          return h('tr', null, h('th', { scope: 'row' }, h('a', { href: '#' + a.id, text: a.name })),
            PHASE.map(function (ph) {
              return h('td', null, h('ul', { class: 'dc-plan-l' }, list.filter(function (i) { return i.when === ph[0]; }).map(function (i) {
                return h('li', { class: 'dc-plan-' + (i.status || 'none') }, h('a', { href: '#' + a.id + '/' + ph[0], text: i.t }));
              })));
            }));
        })))),
      h('p', { class: 'note' }, '굵은 빨강 = 진행 중 · 취소선 = 완료 · 흐림 = 보류/안 함.'));
  }

  /* ================= [kpi] 지표 정의 + LTV 계산(시뮬) ================= */
  var KF = [
    ['price', '판매가 (원)', 39000], ['cogs', '원가 — 내용물 + 튜브 + 박스 (원/개)', 0], ['ship', '배송 · 3PL 비용 (원/주문)', 0], ['pg', 'PG · 카페24 수수료 (%)', 3.5],
    ['disc', '평균 할인 · 적립금 (%)', 10], ['qty', '주문당 개수', 1.2], ['rep', '재구매 확률 — 주문 후 다음 주문 (%)', 30], ['cycle', '구매 주기 (일)', 60], ['cac', 'CAC — 첫 구매 1건 획득 비용 (원)', 0]
  ];
  function kpi(view) {
    if (wait(view)) return;
    var d = D(), k = Object.assign({}, G.kpi || {}), ed = canEdit();
    KF.forEach(function (f) { if (k[f[0]] == null || k[f[0]] === '') k[f[0]] = f[2]; });
    head(view, '지표 · LTV 계산', h('span', { class: 'meta', text: '계산기는 시뮬레이션 — 실제 숫자는 카페24 주문 데이터로 코호트를 만든 뒤 바꿉니다' }));
    var out = h('div');
    var inputs = KF.map(function (f) {
      var i = ui.input({ type: 'number', step: 'any', value: k[f[0]], disabled: !ed });
      i.addEventListener('input', function () { k[f[0]] = i.value; calc(); });
      i.addEventListener('change', function () { var o = { updatedAt: FV.serverTimestamp(), updatedBy: S.mid || '' }; o[f[0]] = +i.value || 0; db.doc('d2c_docs/kpi').set(o, { merge: true }).catch(function (e) { ui.toast('저장하지 못했습니다 — ' + (e.code || e.message)); }); });
      return ui.field(f[1], i);
    });
    function calc() {
      var price = +k.price || 0, qty = +k.qty || 1, rev = price * qty * (1 - (+k.disc || 0) / 100);
      var cm = rev - (+k.cogs || 0) * qty - (+k.ship || 0) - rev * (+k.pg || 0) / 100;   // 주문 1건 공헌이익
      var r = Math.min(Math.max((+k.rep || 0) / 100, 0), 0.95), orders = 1 / (1 - r);   // 기대 주문 수 = 1 + r + r² + …
      var ltv = cm * orders, cac = +k.cac || 0, yr = Math.min(orders, 1 + r * Math.min(365 / (+k.cycle || 60) - 1, 50));
      var rows = [
        ['주문 1건 매출 (할인 반영)', won(rev)], ['주문 1건 공헌이익', won(cm), cm < 0 ? 'red' : ''], ['공헌이익률', rev ? Math.round(cm / rev * 100) + '%' : '—'],
        ['고객 1명 기대 주문 수', orders.toFixed(2) + '회'], ['LTV (공헌이익 기준)', won(ltv)], ['LTV : CAC', cac ? (ltv / cac).toFixed(2) + ' : 1' : 'CAC 입력 필요', cac && ltv / cac < 3 ? 'red' : ''],
        ['첫 주문만으로 회수?', cac ? (cm >= cac ? '예 — 첫 주문에 CAC 회수' : '아니오 — ' + won(cac - cm) + ' 모자람') : '—', cac && cm < cac ? 'red' : ''],
        ['CAC 회수에 필요한 주문 수', cac && cm > 0 ? (cac / cm).toFixed(1) + '회' : '—'], ['1년 안 기대 주문 수 (대략)', yr.toFixed(2) + '회']
      ];
      ui.clear(out); ui.put(out, h('dl', { class: 'dc-calc' }, rows.map(function (x) { return h('div', null, h('dt', { text: x[0] }), h('dd', { class: x[2] || '', text: x[1] })); })));
    }
    calc();
    ui.put(view,
      ui.panel('LTV · CAC 계산기 (시뮬레이션)', null, h('div', { class: 'dc-kf' }, inputs), out,
        h('p', { class: 'note', text: '기대 주문 수 = 1 ÷ (1 − 재구매 확률). LTV는 매출이 아니라 공헌이익(매출 − 원가 − 배송 − 수수료) 기준으로 본다. 일반 기준선: LTV:CAC 3:1 이상, CAC 회수 12개월 이내. 원가 · 배송비 · CAC는 실제 값을 넣어야 의미가 있다.' })),
      (d.kpis || []).length ? ui.panel('꼭 보는 지표 — 정의 · 공식', null, h('div', { class: 'table-wrap flat' }, h('table', { class: 'table dc-kpis' },
        h('thead', null, h('tr', null, ['지표', '공식', '왜 보나', '참고 기준'].map(function (c) { return h('th', { text: c }); }))),
        h('tbody', null, d.kpis.map(function (x) { return h('tr', null, h('td', { class: 'strong', text: x.k }), h('td', { class: 'dc-f', text: x.f || '' }), h('td', { text: x.why || '' }), h('td', { class: 'meta', text: x.bench || '' })); }))))) : null);
  }

  HR.register('home', { render: home });
  ['retain', 'cs', 'aov', 'cohort', 'crm', 'store'].forEach(function (id) { HR.register(id, { render: areaView(id) }); });
  HR.register('plan', { render: plan });
  HR.register('kpi', { render: kpi });
})();

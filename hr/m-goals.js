/* fillts HR — 5) 목표관리: OKR(전사·팀·개인 정렬, 핵심결과, 체크인) · 원온원 */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var G = { period: null, level: '*', sel: null, creating: false, editing: null, draft: null, oneSel: null };
  function num(n) { return (+n || 0).toLocaleString('ko-KR'); }
  var LEVEL = { company: ['전사', 'red'], team: ['팀', 'warn'], personal: ['개인', 'mute'] };
  var STAT = { on: ['순항', 'ok'], risk: ['주의', 'warn'], off: ['위험', 'red'], done: ['완료', 'mute'] };

  function periodName(v) { var m = /^(\d{4})-(Q|H)(\d)$/.exec(v || ''); return !m ? (v ? v + '년' : '') : String(m[1]).slice(2) + '년 ' + (m[2] === 'Q' ? m[3] + '분기' : (m[3] === '1' ? '상반기' : '하반기')); }
  function periods() {
    var t = fmt.today(), y = +t.slice(0, 4), q = Math.floor((+t.slice(5, 7) - 1) / 3) + 1, out = [];
    for (var i = -2; i <= 2; i++) { var qq = q + i, yy = y; while (qq < 1) { qq += 4; yy--; } while (qq > 4) { qq -= 4; yy++; } out.push([yy + '-Q' + qq, yy + '년 ' + qq + '분기']); }
    out.push([y + '-H' + (q <= 2 ? 1 : 2), y + '년 ' + (q <= 2 ? '상' : '하') + '반기'], [String(y), y + '년']);
    return out;
  }
  function curPeriod() { var t = fmt.today(); return t.slice(0, 4) + '-Q' + (Math.floor((+t.slice(5, 7) - 1) / 3) + 1); }
  // 달성률 표기: 아주 작은 값도 0%로 뭉개지지 않게 (예: 10 / 30000 → 0.03%)
  function pctText(v) { var p = v * 100; return (p > 0 && p < 1 ? Math.round(p * 100) / 100 : Math.round(p * 10) / 10) + '%'; }
  function krPct(k) { var span = (+k.target) - (+k.start || 0); if (!span) return +k.current >= +k.target ? 1 : 0; return Math.max(0, Math.min(1, ((+k.current || 0) - (+k.start || 0)) / span)); }
  function pct(g) { var ks = g.krs || []; if (!ks.length) return g.status === 'done' ? 1 : 0; return ks.reduce(function (s, k) { return s + krPct(k); }, 0) / ks.length; }
  function canEdit(g) { return S.isAdmin || g.ownerMid === S.mid || (S.role === 'manager' && g.level === 'team'); }
  function bar(p) { var f = h('div', { class: 'bar-fill' }); f.style.width = Math.round(p * 100) + '%'; return h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(Math.round(p * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, f); }

  function mini(g) {
    var p = pct(g), st = STAT[g.status] || STAT.on;
    return h('li', null, h('a', { class: 'grow goal-mini', href: '#goals/g/' + g.id },
      h('div', null, ui.tag(LEVEL[g.level][0], LEVEL[g.level][1]), ' ', g.title),
      h('div', { class: 'row' }, bar(p), h('span', { class: 'mono small', text: pctText(p) }), ui.tag(st[0], st[1]))));
  }
  HR.goals = { mini: mini };

  /* ---------- 목표 목록 + 상세 ---------- */
  function goalsView(view, selId) {
    G.period = G.period || curPeriod();
    var every = G.period === '*', all = S.goals.filter(function (g) { return every || g.period === G.period; });   // '*' = 전체 기간
    var byParent = {};
    all.forEach(function (g) { var k = g.parentId && all.some(function (x) { return x.id === g.parentId; }) ? g.parentId : ''; (byParent[k] = byParent[k] || []).push(g); });
    var order = { company: 0, team: 1, personal: 2 };
    function card(g, depth) {
      var p = pct(g), st = STAT[g.status] || STAT.on, kids = (byParent[g.id] || []).sort(function (a, b) { return order[a.level] - order[b.level]; });
      if (G.level !== '*' && g.level !== G.level && !kids.length) return null;
      return h('li', { class: 'goal-node' },
        h('a', { class: 'goal-card' + (g.id === selId ? ' active' : ''), href: '#goals/g/' + g.id },
          h('div', { class: 'goal-top' }, ui.tag(LEVEL[g.level][0], LEVEL[g.level][1]), h('span', { class: 'meta', text: (every ? periodName(g.period) + ' · ' : '') + HR.name(g.ownerMid) + ' · 핵심결과 ' + (g.krs || []).length + '개' }), ui.tag(st[0], st[1])),
          h('div', { class: 'goal-title', text: g.title }),
          h('div', { class: 'row' }, bar(p), h('span', { class: 'mono', text: pctText(p) }))),
        kids.length ? h('ul', { class: 'goal-children' }, kids.map(function (k) { return card(k, depth + 1); })) : null);
    }
    var mine = (S.priv && S.priv.goalOrder) || [], rk = function (g) { var i = mine.indexOf(g.id); return i < 0 ? 999 : i; };   // 내 순서(INFO 첫 화면과 같음)
    var roots = (byParent[''] || []).sort(function (a, b) { return order[a.level] - order[b.level] || rk(a) - rk(b) || (a.title || '').localeCompare(b.title || '', 'ko'); });
    var tree = h('ul', { class: 'goal-tree' }, roots.map(function (g) { return card(g, 0); }));
    if (!roots.length) tree.appendChild(h('li', { class: 'empty', text: '이 기간의 목표가 없습니다. 전사 목표부터 세우고, 팀·개인 목표를 연결해 보세요.' }));

    var sel = all.filter(function (g) { return g.id === selId; })[0] || S.goals.filter(function (g) { return g.id === selId; })[0];
    var right = G.ordering ? orderPanel() : G.creating ? goalForm(null) : sel && G.editing === sel.id ? goalForm(sel) : sel ? detail(sel) : ui.panel('How it works', null,
      h('ul', { class: 'plain' }, ['전사 목표(관리자) → 팀 목표(리더) → 개인 목표(구성원) 순으로 연결합니다.', '목표마다 측정 가능한 핵심결과(KR)를 1~5개 둡니다. 진척도는 KR 달성률 평균입니다.', '매주 금요일 체크인 리마인드가 Slack으로 갑니다. 진척도와 한 줄 회고를 남기세요.', '모든 목표는 전 구성원에게 공개됩니다.'].map(function (x) { return h('li', { text: x }); })));

    ui.put(view,
      h('div', { class: 'toolbar' },
        ui.field('기간', ui.select([['*', '전체 기간']].concat(periods()), G.period, { id: 'glPeriod', onchange: function () { G.period = this.value; HR.refresh(); } }), 'inline'),
        ui.field('수준', ui.select([['*', '전체'], ['company', '전사'], ['team', '팀'], ['personal', '개인']], G.level, { id: 'glLevel', onchange: function () { G.level = this.value; HR.refresh(); } }), 'inline'),
        ui.btn('내 목표 순서', function () { G.ordering = !G.ordering; G.creating = false; HR.refresh(); }, 'btn-line btn-sm'),
        ui.btn('목표 추가', function () { G.creating = true; G.ordering = false; G.editing = null; G.draft = null; HR.go('goals'); HR.refresh(); }, 'btn-sm')),
      h('div', { class: 'one-grid' }, h('div', null, tree), right));
  }

  // 내 목표 순서 — INFO 첫 화면 My goals에 보이는 순서 (hr_private.goalOrder)
  function orderPanel() {
    var order = (S.priv && S.priv.goalOrder) || [], rank = function (g) { var i = order.indexOf(g.id); return i < 0 ? 1e6 : i; };
    var goals = S.goals.filter(function (g) { return g.ownerMid === S.mid && g.status !== 'done'; }).sort(function (a, b) { return rank(a) - rank(b); });
    var save = function (ids) { S.priv = Object.assign({}, S.priv, { goalOrder: ids }); db.doc('hr_private/' + S.mid).set({ goalOrder: ids, updatedAt: FV.serverTimestamp() }, { merge: true }).catch(ui.fail); HR.refresh(); };
    var ul = h('ol', { class: 'list goal-order-list' }, goals.map(function (g, i) {
      var move = function (k) { return function () { var ids = goals.map(function (x) { return x.id; }), j = i + k; if (j < 0 || j >= ids.length) return; var t = ids[i]; ids[i] = ids[j]; ids[j] = t; save(ids); }; };
      return h('li', { class: 'goal-order' }, h('div', { class: 'link-edit-order' },
        h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↑', 'aria-label': '위로', disabled: i === 0, onclick: move(-1) }),
        h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↓', 'aria-label': '아래로', disabled: i === goals.length - 1, onclick: move(1) })),
        h('div', { class: 'grow' }, ui.tag(LEVEL[g.level][0], LEVEL[g.level][1]), ' ', g.title));
    }));
    if (!goals.length) ul.appendChild(h('li', { class: 'empty', text: '내가 담당한 진행 중 목표가 없습니다.' }));
    return ui.panel('My order · 내 목표 순서', h('a', { href: '#', class: 'link', text: '닫기', onclick: function (e) { e.preventDefault(); G.ordering = false; HR.refresh(); } }), ul,
      h('p', { class: 'note', text: '↑ ↓로 바꾸면 바로 저장됩니다. INFO 첫 화면 My goals에도 이 순서로 보입니다.' }));
  }

  function detail(g) {
    var edit = canEdit(g), p = pct(g), msgEl = ui.msg();
    var krs = (g.krs || []).map(function (k) { return Object.assign({}, k); });
    var tb = h('table', { class: 'table kr-table' });
    tb.appendChild(h('thead', null, h('tr', null, ['핵심결과', '시작', edit ? '최종 목표값' : '목표', edit ? '현재 (누적)값' : '현재', edit ? '단위' : null, '달성'].filter(function (x) { return x !== null; }).map(function (x, i) { return h('th', { class: i ? 'num' : '', text: x }); }))));
    var body = h('tbody');
    // 목표 · 현재 · 단위를 여기서 바로 고친다 — 예: 매출 최종 목표 30000 / 현재 누적 20000 → 67%
    krs.forEach(function (k, i) {
      var pc = h('td', { class: 'num kr-pct' }), bar = h('span', { class: 'kr-bar' }, h('i'));
      var redraw = function () {
        var v = krPct(krs[i]); ui.clear(pc);
        pc.appendChild(h('b', { text: pctText(v) }));
        pc.appendChild(h('span', { class: 'kr-of', text: num(krs[i].current || 0) + ' / ' + num(krs[i].target || 0) + (krs[i].unit || '') }));
        bar.firstChild.style.width = Math.max(v > 0 ? 1 : 0, Math.round(v * 100)) + '%';
      };
      var numIn = function (key, label) { return ui.input({ type: 'number', step: 'any', inputmode: 'decimal', class: 'kr-in', value: k[key] == null ? '' : k[key], 'aria-label': k.t + ' ' + label, oninput: function () {
        krs[i][key] = this.value === '' ? 0 : +this.value;
        // 금액 목표인데 단위가 기본값 %로 남아 있으면 비운다 (30000% 같은 표기 방지)
        if (key === 'target' && krs[i].unit === '%' && +this.value > 100) { krs[i].unit = ''; unitIn.value = ''; }
        redraw();
      } }); };
      var unitIn = ui.input({ class: 'kr-unit-in', value: k.unit || '', maxlength: '10', placeholder: '만원', 'aria-label': k.t + ' 단위', oninput: function () { krs[i].unit = this.value.trim(); redraw(); } });
      body.appendChild(h('tr', null, h('td', null, h('div', { text: k.t }), bar), h('td', { class: 'num', text: num(k.start) + (edit ? '' : (k.unit || '')) }),
        h('td', { class: 'num' }, edit ? numIn('target', '최종 목표값') : num(k.target) + (k.unit || '')),
        h('td', { class: 'num' }, edit ? numIn('current', '현재 누적값') : num(k.current) + (k.unit || '')),
        edit ? h('td', { class: 'num' }, unitIn) : null, pc));
      redraw();
    });
    if (edit) body.appendChild(h('tr', { class: 'kr-tip' }, h('td', { colspan: '6', text: '매출처럼 쌓이는 값은 「최종 목표값」에 목표 금액, 「현재 (누적)값」에 지금까지의 합계를 넣으면 달성률이 바로 계산됩니다. 아래 저장을 눌러야 반영됩니다.' })));
    tb.appendChild(body);
    var status = ui.select([['on', '순항'], ['risk', '주의'], ['off', '위험'], ['done', '완료']], g.status || 'on', { id: 'ciStatus' });
    var note = h('textarea', { id: 'ciNote', rows: '3', maxlength: '1000', placeholder: '이번 주 진척, 막힌 점, 다음 주 계획' });
    var checkin = edit ? h('form', { class: 'one-section' }, ui.label('Check-in'), h('div', { class: 'row' }, ui.field('상태', status)), ui.field('회고', note), msgEl,
      h('button', { class: 'btn btn-sm', type: 'submit', text: '목표값 · 현재값 · 체크인 저장' })) : null;
    if (checkin) checkin.addEventListener('submit', function (e) {
      e.preventDefault();
      if (krs.some(function (k) { return isNaN(+k.target) || +k.target === (+k.start || 0); })) return ui.err(msgEl, '최종 목표값은 시작값과 달라야 합니다.');
      var np = krs.length ? krs.reduce(function (s, k) { return s + krPct(k); }, 0) / krs.length : (status.value === 'done' ? 1 : 0);
      var b = db.batch();
      b.update(db.doc('hr_goals/' + g.id), { krs: krs, status: status.value, progress: np, lastCheckinAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
      b.set(db.collection('hr_goals/' + g.id + '/checkins').doc(), { by: S.mid, at: FV.serverTimestamp(), progress: np, status: status.value, text: note.value.trim() });
      b.commit().then(function () { HR.invalidate('ci:' + g.id); ui.toast('체크인을 저장했습니다.'); }).catch(function (x) { ui.fail(x, msgEl); });
    });
    var cis = HR.load('ci:' + g.id, function () { return db.collection('hr_goals/' + g.id + '/checkins').orderBy('at', 'desc').limit(20).get().then(HR.rows); }) || [];
    var cl = h('ul', { class: 'list' });
    cis.forEach(function (c) {
      var st = STAT[c.status] || STAT.on;
      cl.appendChild(h('li', null, h('div', { class: 'grow' }, h('div', null, ui.tag(st[0], st[1]), ' ', pctText(c.progress || 0)), c.text ? h('div', { class: 'body', text: c.text }) : null, h('div', { class: 'meta', text: HR.name(c.by) + ' · ' + fmt.ts(c.at) }))));
    });
    if (!cl.children.length) cl.appendChild(h('li', { class: 'empty', text: '아직 체크인이 없습니다.' }));
    var parent = g.parentId ? S.goals.filter(function (x) { return x.id === g.parentId; })[0] : null;
    return h('section', { class: 'panel one-detail' },
      h('div', { class: 'panel-head' }, h('div', null, h('div', { class: 'label', text: LEVEL[g.level][0] + ' 목표 · ' + g.period + ' · ' + HR.name(g.ownerMid) }), h('h3', { text: g.title })),
        edit ? h('div', { class: 'row' },
          ui.btn('수정', function () { G.editing = g.id; G.creating = false; G.draft = null; HR.refresh(); }, 'btn-line btn-xs'),
          ui.confirmBtn('삭제', function () { db.doc('hr_goals/' + g.id).delete().then(function () { HR.go('goals'); }).catch(ui.fail); })) : null),
      g.desc ? h('p', { class: 'body', text: g.desc }) : null,
      parent ? h('p', { class: 'meta' }, '상위 목표 · ', h('a', { class: 'link', href: '#goals/g/' + parent.id, text: parent.title })) : null,
      h('div', { class: 'row' }, bar(p), h('span', { class: 'mono', text: pctText(p) })),
      h('div', { class: 'table-wrap flat' }, tb), checkin,
      h('div', { class: 'one-section' }, ui.label('History'), cl));
  }

  // 목표 만들기 · 수정 (g가 있으면 수정). 입력 중인 내용은 G.draft에 보관해 화면이 다시 그려져도 유지
  function goalForm(g) {
    var key = g ? g.id : 'new';
    if (!G.draft || G.draft.key !== key) {
      G.draft = g ? {
        key: key, level: g.level, title: g.title || '', desc: g.desc || '', period: g.period, parentId: g.parentId || '',
        rows: (g.krs || []).map(function (k) { return { t: k.t, start: k.start || 0, target: k.target, current: k.current == null ? (k.start || 0) : k.current, unit: k.unit || '' }; })
      } : { key: key, level: S.isAdmin ? 'company' : 'personal', title: '', desc: '', period: G.period && G.period !== '*' ? G.period : curPeriod(), parentId: '', rows: [{ t: '', start: 0, target: 100, current: 0, unit: '%' }] };
    }
    var D = G.draft;
    var levels = [['personal', '개인'], S.isLead ? ['team', '팀'] : null, S.isAdmin ? ['company', '전사'] : null].filter(Boolean);
    if (g && !levels.some(function (x) { return x[0] === D.level; })) levels.push([D.level, LEVEL[D.level][0]]);
    var level = ui.select(levels, D.level, { id: 'ngLevel', onchange: function () { D.level = this.value; } });
    var title = ui.input({ id: 'ngTitle', maxlength: '120', value: D.title, placeholder: '예: 2027년 1분기 매출 3억 원', oninput: function () { D.title = this.value; } });
    var desc = h('textarea', { id: 'ngDesc', rows: '2', maxlength: '1000', placeholder: '왜 중요한가 (선택)', oninput: function () { D.desc = this.value; } }); desc.value = D.desc;
    var period = ui.select(periods().concat(periods().some(function (p) { return p[0] === D.period; }) ? [] : [[D.period, D.period]]), D.period, { id: 'ngPeriod', onchange: function () { D.period = this.value; } });
    var parent = ui.select([['', '(연결 안 함)']].concat(S.goals.filter(function (x) { return x.level !== 'personal' && (!g || x.id !== g.id); }).map(function (x) { return [x.id, '[' + LEVEL[x.level][0] + '] ' + x.title]; })), D.parentId, { id: 'ngParent', onchange: function () { D.parentId = this.value; } });
    var krBox = h('div', { class: 'stack sm' }), m = ui.msg();
    function drawKr() {
      ui.clear(krBox);
      krBox.appendChild(h('div', { class: 'kr-row kr-head' }, ['핵심결과', '시작', '목표', g ? '현재' : '단위', g ? '단위' : ''].map(function (x) { return h('span', { text: x }); })));
      D.rows.forEach(function (r, i) {
        var cells = [
          ui.input({ value: r.t, placeholder: '예: 매출', 'aria-label': '핵심결과 ' + (i + 1), oninput: function () { r.t = this.value; } }),
          ui.input({ type: 'number', step: 'any', value: r.start, 'aria-label': '시작값', oninput: function () { r.start = +this.value; } }),
          ui.input({ type: 'number', step: 'any', value: r.target, 'aria-label': '목표값', oninput: function () { r.target = +this.value; } })];
        if (g) cells.push(ui.input({ type: 'number', step: 'any', value: r.current, 'aria-label': '현재값', oninput: function () { r.current = +this.value; } }));
        cells.push(ui.input({ value: r.unit, maxlength: '6', placeholder: '원, %, 건', 'aria-label': '단위', oninput: function () { r.unit = this.value; } }));
        cells.push(h('button', { type: 'button', class: 'x-del', text: '삭제', onclick: function () { D.rows.splice(i, 1); drawKr(); } }));
        krBox.appendChild(h('div', { class: 'kr-row' + (g ? ' with-cur' : '') }, cells));
      });
      if (D.rows.length < 5) krBox.appendChild(h('button', { type: 'button', class: 'link', text: '핵심결과 추가', onclick: function () { D.rows.push({ t: '', start: 0, target: 100, current: 0, unit: '%' }); drawKr(); } }));
    }
    drawKr();
    var close = function (e) { if (e) e.preventDefault(); G.draft = null; if (g) G.editing = null; else G.creating = false; HR.refresh(); };
    var form = h('form', { class: 'panel' },
      h('div', { class: 'panel-head' }, ui.label(g ? 'Edit goal' : 'New goal'), h('a', { href: '#', class: 'link', text: g ? '취소' : '닫기', onclick: close })),
      h('div', { class: 'row' }, ui.field('수준', level), ui.field('기간', period)), ui.field('목표', title), ui.field('설명', desc), ui.field('상위 목표', parent),
      h('div', { class: 'field' }, h('label', { text: '핵심결과' }), krBox),
      h('p', { class: 'muted small', text: '예) 매출 · 시작 0 · 목표 300000000 · 단위 원 → 진척도는 (현재 − 시작) ÷ (목표 − 시작)으로 계산합니다.' }), m,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'submit', text: g ? '수정 저장' : '목표 만들기' }), g ? h('a', { href: '#', class: 'btn btn-line btn-sm', text: '취소', onclick: close }) : null));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var krs = D.rows.filter(function (r) { return String(r.t).trim(); }).map(function (r) {
        return { t: String(r.t).trim(), start: +r.start || 0, target: +r.target, current: g ? (+r.current || 0) : (+r.start || 0), unit: String(r.unit || '').trim() };
      });
      if (!D.title.trim()) return ui.err(m, '목표를 입력하세요.');
      if (!krs.length) return ui.err(m, '핵심결과를 1개 이상 입력하세요.');
      if (krs.some(function (k) { return isNaN(k.target) || k.target === k.start; })) return ui.err(m, '목표값은 시작값과 달라야 합니다.');
      var prog = krs.reduce(function (s, k) { return s + krPct(k); }, 0) / krs.length;
      var data = { level: D.level, title: D.title.trim(), desc: D.desc.trim(), period: D.period, parentId: D.parentId, krs: krs, progress: prog, updatedAt: FV.serverTimestamp() };
      var job = g ? db.doc('hr_goals/' + g.id).update(data)
        : db.collection('hr_goals').add(Object.assign(data, { ownerMid: S.mid, orgId: (S.members[S.mid] || {}).orgId || '', status: 'on', createdAt: FV.serverTimestamp() }));
      job.then(function (ref) {
        G.draft = null; if (G.period !== '*') G.period = D.period;
        if (g) { G.editing = null; ui.toast('목표를 수정했습니다.'); HR.refresh(); }
        else { G.creating = false; HR.go('goals/g/' + ref.id); }
      }).catch(function (x) { ui.fail(x, m); });
    });
    return form;
  }

  /* ---------- 원온원 ---------- */
  var AGENDA = ['지난 액션 아이템 점검', '요즘 컨디션과 일의 몰입도', '막혀 있는 일, 필요한 도움', '성장과 커리어', '서로에게 주는 피드백'];
  var saveTimers = {};
  function ones(view, selId) {
    var list = HR.myOnes(), t = fmt.today(), side = h('div', { class: 'one-side' });
    if (S.isLead) {
      var who = ui.select(HR.memberList(false).filter(function (m) { return m.id !== S.mid; }).map(function (m) { return [m.id, m.name]; }), null, { id: 'oneWho' });
      var date = ui.input({ id: 'oneDate', type: 'date', value: L.addDays(t, 1) }), time = ui.input({ id: 'oneTime', type: 'time', value: '10:00' }), m = ui.msg();
      var f = h('form', { class: 'panel' }, ui.label('New 1:1'), ui.field('구성원', who), h('div', { class: 'row' }, ui.field('날짜', date), ui.field('시간', time)), m, h('button', { class: 'btn btn-sm', type: 'submit', text: '일정 만들기' }));
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!who.value) return;
        var mem = S.members[who.value] || {}, leader = S.isAdmin && mem.leaderId && mem.leaderId !== who.value ? mem.leaderId : S.mid;
        db.collection('hr_11').add({ memberId: who.value, leaderId: leader, date: date.value, time: time.value, status: 'scheduled',
          agenda: AGENDA.map(function (x) { return { t: x, done: false }; }), actions: [], notes: '', memberNote: '', createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() })
          .then(function (ref) { ui.toast('원온원을 만들었습니다. 구성원에게 알림이 갑니다.'); HR.go('goals/one/' + ref.id); }).catch(function (x) { ui.fail(x, m); });
      });
      side.appendChild(f);
    }
    var ul = h('ul', { class: 'one-list' });
    list.forEach(function (o) {
      var other = o.leaderId === S.mid ? o.memberId : o.memberId === S.mid ? o.leaderId : null;
      var st = o.status === 'done' ? ['완료', 'mute'] : o.date < t ? ['지남', 'red'] : ['예정', 'ok'];
      ul.appendChild(h('li', { class: o.id === selId ? 'active' : '' }, h('a', { href: '#goals/one/' + o.id, class: 'grow' },
        h('div', { class: 'who', text: other ? HR.name(other) : HR.name(o.leaderId) + ' ↔ ' + HR.name(o.memberId) }), h('div', { class: 'meta', text: fmt.date(o.date) + ' ' + (o.time || '') })), ui.tag(st[0], st[1])));
    });
    if (!list.length) ul.appendChild(h('li', { class: 'empty', text: S.isLead ? '첫 원온원을 만들어 보세요.' : '예정된 원온원이 없습니다.' }));
    side.appendChild(ul);
    // 🔒 원온원 회의록 (회의미팅에서 올린 것) — 본인 · 리더 · 관리자만 (보안 규칙이 같은 조건으로 막는다)
    var notes = HR.meetList ? (HR.meetList() || []).filter(function (x) { return x.published && x.type === 'one'; }) : [];
    side.appendChild(h('div', { class: 'one-notes' }, h('div', { class: 'label', text: '🔒 원온원 회의록 ' + notes.length }),
      notes.length ? h('ul', { class: 'one-list' }, notes.slice(0, 12).map(function (x) {
        return h('li', null, h('a', { href: '#meet/' + x.id, class: 'grow' }, h('div', { class: 'who', text: x.title }),
          h('div', { class: 'meta', text: fmt.dot(x.date || '') + (x.memberId && x.memberId !== S.mid ? ' · ' + HR.name(x.memberId) : '') })));
      })) : h('p', { class: 'meta', text: '클로바노트로 기록한 원온원을 회의미팅에서 올리면 여기 모입니다.' })));
    var sel = list.filter(function (o) { return o.id === selId; })[0];
    ui.put(view, h('div', { class: 'one-grid' }, side, sel ? oneDetail(sel) : ui.panel('1:1', null, h('p', { class: 'muted', text: '원온원을 선택하세요. 아젠다와 액션 아이템은 리더와 구성원이 함께 쓰고, 비공개 메모는 리더만 봅니다.' }))));
  }
  function oneDetail(o) {
    var isLeader = o.leaderId === S.mid || S.isAdmin, isMember = o.memberId === S.mid, ref = db.doc('hr_11/' + o.id);
    var save = function (key, val) { clearTimeout(saveTimers[key]); saveTimers[key] = setTimeout(function () { var u = { updatedAt: FV.serverTimestamp() }; u[key] = val; ref.update(u).catch(ui.fail); }, 700); };
    var put = function (key, items) { var u = { updatedAt: FV.serverTimestamp() }; u[key] = items; return ref.update(u).catch(ui.fail); };
    function checklist(key, title) {
      var items = (o[key] || []).slice(), ul = h('ul', { class: 'check-list' });
      items.forEach(function (it, i) {
        var cb = h('input', { type: 'checkbox', id: key + i, checked: !!it.done, onchange: function () { items[i] = { t: it.t, done: this.checked }; put(key, items); } });
        ul.appendChild(h('li', null, cb, h('label', { for: key + i }, h('span', { class: it.done ? 'done' : '', text: it.t })),
          h('button', { class: 'x-del', type: 'button', text: '삭제', onclick: function () { items.splice(i, 1); put(key, items); } })));
      });
      var inp = ui.input({ id: key + 'Add', maxlength: '200', placeholder: '항목 추가' });
      var add = h('form', { class: 'add-row', onsubmit: function (e) { e.preventDefault(); var v = inp.value.trim(); if (!v) return; items.push({ t: v, done: false }); put(key, items).then(function () { inp.value = ''; }); } }, inp, h('button', { class: 'btn btn-line btn-xs', type: 'submit', text: '추가' }));
      return h('div', { class: 'one-section' }, ui.label(title), ul, add);
    }
    var notes = h('textarea', { id: 'oneNotes', rows: '6', maxlength: '8000', placeholder: '리더가 기록하는 공유 메모 (구성원도 볼 수 있습니다)' });
    notes.value = o.notes || ''; notes.readOnly = !isLeader; notes.addEventListener('input', function () { save('notes', notes.value); });
    var mnote = h('textarea', { id: 'oneMemberNote', rows: '4', maxlength: '4000', placeholder: '구성원이 미리 남기는 이야기' });
    mnote.value = o.memberNote || ''; mnote.readOnly = !isMember && !S.isAdmin; mnote.addEventListener('input', function () { save('memberNote', mnote.value); });
    var priv = null;
    if (isLeader) {
      var pt = h('textarea', { id: 'onePriv', rows: '4', maxlength: '4000', placeholder: '리더만 보는 비공개 메모 (구성원에게 보이지 않습니다)' });
      var pv = HR.load('priv11:' + o.id, function () { return db.doc('hr_11priv/' + o.id).get().then(function (s) { return s.exists ? s.data().text || '' : ''; }); });
      pt.value = pv || '';
      pt.addEventListener('input', function () {
        clearTimeout(saveTimers.priv);
        saveTimers.priv = setTimeout(function () { db.doc('hr_11priv/' + o.id).set({ text: pt.value, leaderId: o.leaderId, updatedAt: FV.serverTimestamp() }).then(function () { HR.cache['priv11:' + o.id] = { at: Date.now(), data: pt.value }; }).catch(ui.fail); }, 700);
      });
      priv = h('div', { class: 'one-section private' }, ui.label('Private · leader only'), pt);
    }
    return h('section', { class: 'panel one-detail' },
      h('div', { class: 'panel-head' },
        h('div', null, h('div', { class: 'label', text: HR.name(o.leaderId) + ' ↔ ' + HR.name(o.memberId) }), h('h3', { text: fmt.date(o.date) + ' ' + (o.time || '') })),
        isLeader ? h('div', { class: 'row' },
          o.status !== 'done' ? ui.btn('완료', function () { ref.update({ status: 'done', updatedAt: FV.serverTimestamp() }).catch(ui.fail); }, 'btn-xs') : null,
          ui.btn('2주 뒤 다음 일정', function () {
            db.collection('hr_11').add({ memberId: o.memberId, leaderId: o.leaderId, date: L.addDays(o.date, 14), time: o.time || '', status: 'scheduled',
              agenda: AGENDA.map(function (x) { return { t: x, done: false }; }), actions: (o.actions || []).filter(function (a) { return !a.done; }), notes: '', memberNote: '', createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() })
              .then(function (r) { ui.toast('다음 원온원을 만들었습니다. 미완료 액션은 이어집니다.'); HR.go('goals/one/' + r.id); }).catch(ui.fail);
          }, 'btn-line btn-xs'),
          ui.confirmBtn('삭제', function () { db.doc('hr_11priv/' + o.id).delete().catch(function () {}); ref.delete().then(function () { HR.go('goals/one'); }).catch(ui.fail); })) : null),
      checklist('agenda', 'Agenda'),
      h('div', { class: 'one-section' }, ui.label('Member note'), mnote),
      h('div', { class: 'one-section' }, ui.label('Shared notes'), notes),
      checklist('actions', 'Action items'),
      priv);
  }

  HR.register('goals', {
    render: function (view, parts) {
      var sub = parts[0] || '';
      ui.put(view, ui.head('Goals', '목표관리'), ui.tabs([['', '목표'], ['one', '원온원']], sub === 'g' ? '' : sub, 'goals'));
      if (sub === 'one') ones(view, parts[1]);
      else { if (sub === 'g') { G.creating = false; if (G.editing && G.editing !== parts[1]) { G.editing = null; G.draft = null; } } goalsView(view, sub === 'g' ? parts[1] : null); }
    }
  });
})();

/* fillts Finance — [행정] 체크일정
   fin_admin: 법인 행정상 꼭 해야 하는 점검 · 신고 · 갱신 목록. 마감일 기준 D-day, 「임박」은 항목마다 정한 일수(alert) 안에 들어오면.
   반복 항목(repeat = 개월 수)은 「완료」를 누르면 다음 마감일로 넘어가고, 처리 기록(log)이 남는다. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV, L = HR.L;
  F.chk = [];   // kind 'ref' = 정관 조항 요약(일정 아님) — [행정] 정관 화면에만
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    prevStart && prevStart(sub);
    sub(db.collection('fin_admin'), function (s) { var all = HR.rows(s); F.chk = all.filter(function (c) { return !c.kind; }); F.jgRef = all.filter(function (c) { return c.kind === 'ref'; }); F.jgGoal = all.filter(function (c) { return c.kind === 'goal'; }); F.jgMemo = all.filter(function (c) { return c.kind === 'memo'; }); F.profile = all.filter(function (c) { return c.kind === 'profile'; }); });
  };

  var CATS = ['화장품법', '연구개발', '세무 · 회계', '인사 · 노무', '법인 · 등기', '정관', '특허', '기타'];
  var REPEAT = [['0', '한 번'], ['1', '매월'], ['6', '반기마다'], ['12', '매년']];
  var V = { showDone: false };
  // 목록 앞 짧은 분류 표시
  var CAT_SHORT = { '화장품법': '화장품', '연구개발': '연구개발', '세무 · 회계': '세무', '인사 · 노무': '인사', '법인 · 등기': '법인', '정관': '정관', '특허': '특허' };
  var catShort = function (c) { return CAT_SHORT[c] || c || '기타'; };
  // 분야 탭: 주소 #chk/<key>
  var CAT_TABS = [['cos', '화장품법'], ['tax', '세무 · 회계'], ['hr', '인사 · 노무'], ['rnd', '연구개발'], ['corp', '법인 · 등기'], ['ip', '특허'], ['etc', '기타']];

  // 상태: done 완료 · nodate 날짜 미정 · over 지남 · near 임박 · plan 예정
  function state(c, t) {
    if (c.done) return { k: 'done', d: null };
    if (!c.due) return { k: 'nodate', d: null };
    var d = L.daysBetween(t, c.due), alert = c.alert != null ? +c.alert : 30;
    return { k: d < 0 ? 'over' : d <= alert ? 'near' : 'plan', d: d };
  }
  var dLabel = function (d) { return d == null ? '—' : d === 0 ? 'D-DAY' : d > 0 ? 'D-' + d : 'D+' + (-d); };
  var repName = function (r) { return (REPEAT.filter(function (x) { return x[0] === String(r || 0); })[0] || REPEAT[0])[1]; };

  function complete(c) {
    var t = fmt.today(), rep = +c.repeat || 0, log = FV.arrayUnion({ due: c.due || '', on: t, by: S.mid || '' });
    var d = rep && c.due ? { due: L.addMonths(c.due, rep), log: log } : { done: true, doneOn: t, log: log };
    d.updatedAt = FV.serverTimestamp();
    return db.doc('fin_admin/' + c.id).update(d);
  }

  function form(c, done) {
    c = c || { repeat: 0, alert: 30, cat: arguments[2] || '기타' };
    var title = ui.input({ maxlength: 80, value: c.title || '', placeholder: '예: 중소기업확인서 갱신' });
    var cat = ui.select(CATS.map(function (x) { return [x, x]; }), c.cat || '기타');
    var due = ui.input({ type: 'date', value: c.due || '' });
    var rep = ui.select(REPEAT, String(c.repeat || 0));
    var alert = ui.input({ type: 'number', min: '0', max: '365', value: String(c.alert != null ? c.alert : 30) });
    var owner = ui.input({ maxlength: 40, value: c.owner || '', placeholder: '예: 대표 · 세무사' });
    var cond = h('textarea', { rows: '3', maxlength: '600', placeholder: '조건 · 근거 — 언제까지, 무엇을, 놓치면 어떻게 되는지' }); cond.value = c.cond || '';
    var how = h('textarea', { rows: '2', maxlength: '400', placeholder: '처리 방법 · 준비물' }); how.value = c.how || '';
    var url = ui.input({ type: 'url', value: c.url || '', placeholder: 'https://… (신청 사이트)' });
    var msg = ui.msg();
    var save = function () {
      var d = { title: title.value.trim(), cat: cat.value, due: due.value || '', repeat: +rep.value || 0, alert: Math.max(0, Math.min(365, +alert.value || 0)),
        owner: owner.value.trim(), cond: cond.value.trim(), how: how.value.trim(), url: url.value.trim(), updatedAt: FV.serverTimestamp() };
      if (!d.title) return ui.err(msg, '이름을 입력하세요.');
      if (d.url && !/^https:\/\/\S+$/.test(d.url)) return ui.err(msg, '주소는 https:// 로 시작해야 합니다.');
      if (d.repeat && !d.due) return ui.err(msg, '반복 항목은 마감일이 필요합니다.');
      var ref = c.id ? db.doc('fin_admin/' + c.id) : db.collection('fin_admin').doc();
      if (!c.id) { d.done = false; d.createdAt = FV.serverTimestamp(); d.by = S.mid || ''; }
      ref.set(d, { merge: true }).then(function () { ui.toast('저장했습니다.'); done && done(); }).catch(function (e) { ui.fail(e, msg); });
    };
    return h('div', { class: 'stack fin-form' },
      h('div', { class: 'row' }, ui.field('이름', title, 'grow'), ui.field('분류', cat)),
      h('div', { class: 'row' }, ui.field('마감일 (비우면 날짜 미정)', due), ui.field('반복', rep), ui.field('임박 알림 (마감 며칠 전부터)', alert), ui.field('담당', owner, 'grow')),
      ui.field('조건 · 근거', cond), ui.field('처리 방법', how), ui.field('신청 사이트', url), msg,
      h('div', { class: 'row' }, ui.btn(c.id ? '저장' : '추가', save), ui.btn('취소', function () { done && done(); }, 'btn-line'),
        c.id ? (c.done ? ui.btn('다시 진행 중으로', function () { db.doc('fin_admin/' + c.id).update({ done: false, doneOn: '' }).then(function () { done && done(); }).catch(ui.fail); }, 'btn-line') : null) : null,
        c.id ? ui.confirmBtn('삭제', function () { db.doc('fin_admin/' + c.id).delete().then(function () { done && done(); }).catch(ui.fail); }) : null));
  }

  function row(c, st, ed, base) {
    var dCls = 'chk-d chk-' + st.k;
    // [행정] 정관: 체크 = 진행예정 / 해제 = 대기 (fin_admin.go)
    var pick = base === 'jg' && !c.done ? h('label', { class: 'jg-go', title: c.go ? '체크 해제 → 대기로' : '체크 → 진행예정으로' },
      h('input', { type: 'checkbox', checked: !!c.go, disabled: !ed, onchange: function () {
        var on = this.checked;
        db.doc('fin_admin/' + c.id).update({ go: on, updatedAt: FV.serverTimestamp() }).then(function () { ui.toast(on ? '진행예정으로 옮겼습니다.' : '대기로 옮겼습니다.'); }).catch(ui.fail);
      } }), h('span', { text: '진행' })) : null;
    return h('li', { class: 'chk-row chk-row-' + st.k }, pick,
      h('span', { class: dCls, text: st.k === 'done' ? '완료' : st.k === 'nodate' ? '미정' : dLabel(st.d) }),
      h('div', { class: 'grow' },
        h('div', { class: 'chk-title' }, h('span', { class: 'chk-cat', text: catShort(c.cat) }), h('a', { href: ed ? '#' + (base || 'chk') + '/edit/' + c.id : null, class: 'strong', text: c.title }),
          st.k === 'over' ? ui.tag('지남', 'red') : st.k === 'near' ? ui.tag('임박', 'red') : null),
        h('div', { class: 'meta', text: [c.due ? fmt.dot(c.due) + ' (' + '일월화수목금토'[L.weekday(c.due)] + ')' : '날짜 미정', repName(c.repeat), c.owner ? '담당 ' + c.owner : '', c.done && c.doneOn ? fmt.dot(c.doneOn) + ' 처리' : ''].filter(Boolean).join(' · ') }),
        c.cond ? h('p', { class: 'chk-cond', text: c.cond }) : null,
        c.how ? h('p', { class: 'chk-how', text: '▸ ' + c.how }) : null),
      h('div', { class: 'actions' },
        c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-line btn-xs', text: '사이트 ↗' }) : null,
        ed && !c.done ? ui.btn(+c.repeat ? '이번 회차 완료' : '완료', function () {
          complete(c).then(function () { ui.toast(+c.repeat && c.due ? '완료 — 다음 마감 ' + fmt.dot(L.addMonths(c.due, +c.repeat)) : '완료로 표시했습니다.'); }).catch(ui.fail);
        }, 'btn-line btn-xs') : null));
  }

  /* 회사 기준 정보 (kind 'profile' {label, value, note, calc, order}) — 체크일정 맨 위
     calc: 'since:날짜' 업력 · 'age:생일' 만 나이 · 'until:날짜:이름' 남은 날 · 'hr' HR 구성원 수(대표 제외), '|'로 여러 개 */
  var V2 = { profEdit: null };
  function calcChips(calc, t) {
    return String(calc || '').split('|').filter(Boolean).map(function (c) {
      var a = c.split(':'), k = a[0], dt = a[1], txt = '', hot = false;
      if (k === 'since') { var m = (+t.slice(0, 4) - +dt.slice(0, 4)) * 12 + (+t.slice(5, 7) - +dt.slice(5, 7)) - (t.slice(8) < dt.slice(8) ? 1 : 0); txt = '업력 ' + Math.floor(m / 12) + '년 ' + (m % 12) + '개월'; }
      else if (k === 'age') { var y = +t.slice(0, 4) - +dt.slice(0, 4) - (t.slice(5) < dt.slice(5) ? 1 : 0); txt = '만 ' + y + '세'; }
      else if (k === 'until') { var d = L.daysBetween(t, dt); txt = (a[2] || '') + ' ' + fmt.dot(dt) + ' · ' + (d >= 0 ? 'D-' + d : '지남'); hot = d >= 0 && d <= 180; }
      else if (k === 'hr') { var n = HR.memberList().filter(function (m) { return !/대표/.test(m.title || m.position || '') && m.role !== 'owner'; }).length; txt = 'HR 등록 ' + n + '명 (대표 제외)'; }
      return txt ? h('span', { class: 'prof-chip' + (hot ? ' hot' : ''), text: txt }) : null;
    });
  }
  function profilePanel(ed, t) {
    var rows = (F.profile || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!rows.length) return null;
    if (V2.profEdit) {
      var msg = ui.msg(), inputs = rows.map(function (r) {
        var v = h('textarea', { rows: '2', maxlength: '300' }); v.value = r.value || '';
        var n = h('textarea', { rows: '2', maxlength: '400' }); n.value = r.note || '';
        return { r: r, v: v, n: n };
      });
      return ui.panel('회사 기준 정보 · 편집', null, h('div', { class: 'stack' }, inputs.map(function (x) {
        return h('div', { class: 'row prof-edit' }, h('div', { class: 'strong prof-label', text: x.r.label }), ui.field('현재', x.v, 'grow'), ui.field('기준 · 영향', x.n, 'grow'));
      }), msg, h('div', { class: 'row' }, ui.btn('저장', function () {
        var b = db.batch();
        inputs.forEach(function (x) { b.update(db.doc('fin_admin/' + x.r.id), { value: x.v.value.trim(), note: x.n.value.trim(), updatedAt: FV.serverTimestamp() }); });
        b.commit().then(function () { V2.profEdit = null; ui.toast('저장했습니다.'); HR.refresh(); }).catch(function (e) { ui.fail(e, msg); });
      }, 'btn-sm'), ui.btn('취소', function () { V2.profEdit = null; HR.refresh(); }, 'btn-line btn-sm'))));
    }
    var tb = h('table', { class: 'table fin-table prof-table' }, h('thead', null, h('tr', null, ['항목', '현재', '기준 · 영향'].map(function (x) { return h('th', { text: x }); }))),
      h('tbody', null, rows.map(function (r) {
        return h('tr', null, h('td', { class: 'strong nowrap', text: r.label }),
          h('td', null, h('div', { class: 'prof-val', text: r.value || '' }), h('div', { class: 'prof-chips' }, calcChips(r.calc, t))),
          h('td', { class: 'prof-note', text: r.note || '' }));
      })));
    return ui.panel('회사 기준 정보', ed ? ui.btn('편집', function () { V2.profEdit = true; HR.refresh(); }, 'btn-line btn-xs') : null, h('div', { class: 'table-wrap flat' }, tb));
  }

  function render(view, parts) {
    var ed = F.canEdit(), t = fmt.today();
    if (parts[0] === 'new' || parts[0] === 'edit') {
      var cur = parts[0] === 'edit' ? F.chk.filter(function (c) { return c.id === parts[1]; })[0] : null;
      if (!ed || (parts[0] === 'edit' && !cur)) return HR.go('chk');
      ui.put(view, ui.head('[행정] 체크일정', cur ? '항목 수정' : '항목 추가'), ui.panel(null, null, form(cur, function () { HR.go('chk'); })));
      return;
    }
    var tab = CAT_TABS.filter(function (x) { return x[0] === parts[0]; })[0];
    var src = F.chk.filter(function (c) { return c.cat !== '정관'; });   // 정관 변경은 선택 사항 — [행정] 정관 화면에서만
    var catOf = function (c) { return CATS.indexOf(c.cat) >= 0 ? c.cat : '기타'; };
    var openN = function (cat) { return src.filter(function (c) { return !c.done && (!cat || catOf(c) === cat); }).length; };
    var tabs = ui.tabs([['', '전체 ' + openN()]].concat(CAT_TABS.filter(function (x) { return src.some(function (c) { return catOf(c) === x[1]; }); })
      .map(function (x) { return [x[0], catShort(x[1]) + ' ' + openN(x[1])]; })), tab ? tab[0] : '', 'chk');
    var all = src.filter(function (c) { return !tab || catOf(c) === tab[1]; }).map(function (c) { return { c: c, s: state(c, t) }; });
    var byDue = function (a, b) { return (a.c.due || '9999') < (b.c.due || '9999') ? -1 : (a.c.due || '9999') > (b.c.due || '9999') ? 1 : (a.c.title < b.c.title ? -1 : 1); };
    var pick = function (ks) { return all.filter(function (x) { return ks.indexOf(x.s.k) >= 0; }).sort(byDue); };
    var hot = pick(['over', 'near']), plan = pick(['plan']), nodate = pick(['nodate']), done = pick(['done']).reverse();
    var within = function (n) { return all.filter(function (x) { return x.s.d != null && x.s.d >= 0 && x.s.d <= n; }).length; };
    var list = function (xs, empty) { return h('ul', { class: 'list chk-list' }, xs.length ? xs.map(function (x) { return row(x.c, x.s, ed); }) : h('li', { class: 'empty', text: empty })); };
    var next = hot.concat(plan)[0];
    ui.put(view, ui.head('[행정] 체크일정', '법인 행정 체크리스트', ed ? ui.btn('+ 항목 추가', function () { HR.go('chk/new'); }, 'btn-sm') : null), tab ? null : profilePanel(ed, t), tabs,
      F.kpi([['지남', String(pick(['over']).length) + '건', pick(['over']).length ? 'red' : '', '마감일이 지났는데 완료 안 함'],
        ['임박', String(pick(['near']).length) + '건', pick(['near']).length ? 'red' : '', '항목별 알림 기간 안'],
        ['90일 안', String(within(90)) + '건', '', next ? '다음: ' + next.c.title + ' ' + dLabel(next.s.d) : '예정 없음'],
        ['날짜 미정', String(nodate.length) + '건', '', '조건이 생기면 날짜를 넣을 것']]),
      ui.panel('지금 챙길 것 · 지남 + 임박', null, list(hot, '임박한 항목이 없습니다.')),
      ui.panel('예정', null, list(plan, '예정된 항목이 없습니다.')),
      nodate.length ? ui.panel('날짜 미정 · 조건부', null, list(nodate, '')) : null,
      ui.panel('완료 ' + done.length + '건', done.length ? ui.btn(V.showDone ? '접기' : '펼치기', function () { V.showDone = !V.showDone; HR.refresh(); }, 'btn-line btn-xs') : null,
        V.showDone ? list(done, '') : null),
      F.readOnlyNote(),
      h('p', { class: 'note', text: '반복 항목은 「이번 회차 완료」를 누르면 다음 마감일로 넘어갑니다. 임박 기준은 항목마다 다릅니다(예: 특허 정규출원 120일 전, 월 신고 7일 전). 근거 조문 · 기한은 법령 개정으로 바뀔 수 있으니 처리 전 신청 사이트에서 한 번 더 확인하세요.' }));
  }

  HR.register('chk', { render: render });

  /* ============ [행정] 정관 — 정관 기준 「언제까지 해야 하는가」 ============
     일정 = fin_admin cat '정관' (체크일정 정관 탭과 같은 데이터) · 현행 조항 요약 = fin_admin kind 'ref' {art, title, body, note, order} · 원본 링크 = fin_config.bylawUrl */
  function bylaw(view, parts) {
    var ed = F.canEdit(), t = fmt.today();
    if (parts[0] === 'new' || parts[0] === 'edit') {
      var cur = parts[0] === 'edit' ? F.chk.filter(function (c) { return c.id === parts[1]; })[0] : null;
      if (!ed || (parts[0] === 'edit' && !cur)) return HR.go('jg');
      ui.put(view, ui.head('[행정] 정관', cur ? '항목 수정' : '정관 일정 추가'), ui.panel(null, null, form(cur, function () { HR.go('jg'); }, '정관')));
      return;
    }
    var items = F.chk.filter(function (c) { return c.cat === '정관'; }).map(function (c) { return { c: c, s: state(c, t) }; })
      .sort(function (a, b) { return (a.s.k === 'done') - (b.s.k === 'done') || ((a.c.due || '9999') < (b.c.due || '9999') ? -1 : 1); });
    var live = items.filter(function (x) { return x.s.k !== 'done'; }), done = items.filter(function (x) { return x.s.k === 'done'; });
    var go = live.filter(function (x) { return x.c.go; });
    // 대기 = 아직 하기로 안 한 것 → 마감이 가까워도 빨간 경고 대신 날짜만
    var wait = live.filter(function (x) { return !x.c.go; }).map(function (x) { return { c: x.c, s: x.s.k === 'near' || x.s.k === 'over' ? { k: 'plan', d: x.s.d } : x.s }; });
    var refs = (F.jgRef || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var next = go.filter(function (x) { return x.s.d != null; })[0];
    var url = (F.cfg && F.cfg.bylawUrl) || '';
    var list = function (xs, empty) { return h('ul', { class: 'list chk-list' }, xs.length ? xs.map(function (x) { return row(x.c, x.s, ed, 'jg'); }) : h('li', { class: 'empty', text: empty })); };
    // 맨 위: 하고자 하는 일 → 필요한 결의 · 정관 반영 여부 (kind 'goal' {task, resol, bylaw, st: ok|todo|none, when, note, order})
    var goals = (F.jgGoal || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var ST = { ok: ['반영됨', 'jg-st-ok'], todo: ['미반영', 'jg-st-todo'], none: ['변경 불필요', 'jg-st-none'] };
    var goalTb = h('table', { class: 'table fin-table jg-table jg-goal' }, h('thead', null, h('tr', null, ['하고자 하는 일', '필요한 결의', '정관', '언제'].map(function (x) { return h('th', { text: x }); }))),
      h('tbody', null, goals.length ? goals.map(function (g) {
        var st = ST[g.st] || ST.none;
        // 솔루션 한 줄씩: proc = 프로세스(단계를 > 로), todo = 해야 하는 것(줄바꿈)
        var sol = g.proc || g.todo ? h('div', { class: 'jg-sol' },
          g.proc ? h('div', null, h('span', { class: 'jg-sol-k', text: '프로세스' }), h('span', { text: g.proc })) : null,
          g.todo ? h('div', null, h('span', { class: 'jg-sol-k jg-sol-todo', text: '해야 하는 것' }), h('span', { class: 'jg-sol-v', text: g.todo })) : null) : null;
        return h('tr', null, h('td', null, h('div', { class: 'strong', text: g.task || '' }), g.note ? h('div', { class: 'jg-gnote', text: g.note }) : null, sol),
          h('td', { class: 'jg-body', text: g.resol || '' }),
          h('td', null, h('span', { class: 'jg-st ' + st[1], text: st[0] }), g.bylaw ? h('div', { class: 'jg-gnote', text: g.bylaw }) : null),
          h('td', { class: 'nowrap', text: g.when || '' }));
      }) : h('tr', null, h('td', { colspan: '4', class: 'empty', text: '정리된 일이 없습니다.' }))));
    var refTb = h('table', { class: 'table fin-table jg-table' }, h('thead', null, h('tr', null, ['조항', '지금 정관', '앞으로 영향'].map(function (x) { return h('th', { text: x }); }))),
      h('tbody', null, refs.length ? refs.map(function (r) {
        return h('tr', null, h('td', { class: 'strong nowrap', text: (r.art || '') + (r.title ? ' ' + r.title : '') }), h('td', { class: 'jg-body', text: r.body || '' }), h('td', { class: 'jg-note', text: r.note || '' }));
      }) : h('tr', null, h('td', { colspan: '3', class: 'empty', text: '정관 요약이 아직 없습니다.' }))));
    ui.put(view, ui.head('[행정] 정관', '정관 신설 · 변경 조항',
        h('div', { class: 'row' }, F.cfg && F.cfg.bylawDate ? h('span', { class: 'meta jg-date', text: '현행 정관 ' + fmt.dot(F.cfg.bylawDate) + ' 작성' }) : null,
          url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-line btn-sm', text: '정관 원본 ↗' }) : null,
          ed ? ui.btn('+ 조항 추가', function () { HR.go('jg/new'); }, 'btn-sm') : null)),
      ui.panel('하고자 하는 일 · 무엇으로 결의하고 정관에 있나', null, h('div', { class: 'table-wrap flat' }, goalTb)),
      // 설계 메모 (kind 'memo' {title, sub, rows: JSON [[항목, 내용], …]}) — 예: 스톡옵션 설계안
      (F.jgMemo || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).map(function (m) {
        var rows = []; try { rows = JSON.parse(m.rows || '[]'); } catch (e) { rows = []; }
        return ui.panel(m.title || '설계 메모', m.sub ? h('span', { class: 'meta', text: m.sub }) : null,
          h('dl', { class: 'jg-memo' }, rows.map(function (r) { return h('div', { class: r[2] ? 'jg-memo-warn' : '' }, h('dt', { text: r[0] }), h('dd', { text: r[1] })); })));
      }),
      F.kpi([['진행예정', go.length + '건', '', '하기로 정한 것'], ['대기', wait.length + '건', '', '아직 결정 안 함 · 필수 아님'],
        ['다음 마감', next ? dLabel(next.s.d) : '—', next && (next.s.k === 'near' || next.s.k === 'over') ? 'red' : '', next ? next.c.title : '진행예정 중 날짜 있는 항목 없음']], 'three'),
      ui.panel('진행예정 ' + go.length + '건', null, list(go, '아직 진행하기로 한 조항이 없습니다. 아래 대기에서 「진행」을 체크하세요.')),
      ui.panel('대기 ' + wait.length + '건', h('span', { class: 'meta', text: '「진행」 체크 → 진행예정으로' }), list(wait, '대기 중인 조항이 없습니다.')),
      done.length ? ui.panel('완료 ' + done.length + '건', null, list(done, '')) : null,
      ui.panel('지금 정관 · 날짜와 절차가 걸린 조항', url ? h('span', { class: 'meta', text: '원본 기준 요약' }) : null, h('div', { class: 'table-wrap flat' }, refTb)),
      F.readOnlyNote(),
      h('p', { class: 'note', text: '정관에 새로 넣거나 바꿀 조항 목록입니다. 필수가 아니며, 하기로 한 것만 날짜까지 정하면 됩니다. 조문 문구 · 결의서 · 등기 · 공고는 법무대리인이 처리합니다. 꼭 해야 하는 신고 · 정기주총은 [행정] 체크일정에 있습니다.' }));
  }
  HR.register('jg', { render: bylaw });
})();

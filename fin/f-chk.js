/* fillts Finance — [행정] 체크일정
   fin_admin: 법인 행정상 꼭 해야 하는 점검 · 신고 · 갱신 목록. 마감일 기준 D-day, 「임박」은 항목마다 정한 일수(alert) 안에 들어오면.
   반복 항목(repeat = 개월 수)은 「완료」를 누르면 다음 마감일로 넘어가고, 처리 기록(log)이 남는다. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV, L = HR.L;
  F.chk = [];
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    prevStart && prevStart(sub);
    sub(db.collection('fin_admin'), function (s) { F.chk = HR.rows(s); });
  };

  var CATS = ['화장품법', '연구개발', '세무 · 회계', '인사 · 노무', '법인 · 등기', '특허', '기타'];
  var REPEAT = [['0', '한 번'], ['1', '매월'], ['6', '반기마다'], ['12', '매년']];
  var V = { showDone: false };

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
    c = c || { repeat: 0, alert: 30, cat: '기타' };
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

  function row(c, st, ed) {
    var dCls = 'chk-d chk-' + st.k;
    return h('li', { class: 'chk-row chk-row-' + st.k },
      h('span', { class: dCls, text: st.k === 'done' ? '완료' : st.k === 'nodate' ? '미정' : dLabel(st.d) }),
      h('div', { class: 'grow' },
        h('div', { class: 'chk-title' }, h('a', { href: ed ? '#chk/edit/' + c.id : null, class: 'strong', text: c.title }),
          st.k === 'over' ? ui.tag('지남', 'red') : st.k === 'near' ? ui.tag('임박', 'red') : null, ui.tag(c.cat || '기타', 'mute')),
        h('div', { class: 'meta', text: [c.due ? fmt.dot(c.due) + ' (' + '일월화수목금토'[L.weekday(c.due)] + ')' : '날짜 미정', repName(c.repeat), c.owner ? '담당 ' + c.owner : '', c.done && c.doneOn ? fmt.dot(c.doneOn) + ' 처리' : ''].filter(Boolean).join(' · ') }),
        c.cond ? h('p', { class: 'chk-cond', text: c.cond }) : null,
        c.how ? h('p', { class: 'chk-how', text: '▸ ' + c.how }) : null),
      h('div', { class: 'actions' },
        c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-line btn-xs', text: '사이트 ↗' }) : null,
        ed && !c.done ? ui.btn(+c.repeat ? '이번 회차 완료' : '완료', function () {
          complete(c).then(function () { ui.toast(+c.repeat && c.due ? '완료 — 다음 마감 ' + fmt.dot(L.addMonths(c.due, +c.repeat)) : '완료로 표시했습니다.'); }).catch(ui.fail);
        }, 'btn-line btn-xs') : null));
  }

  function render(view, parts) {
    var ed = F.canEdit(), t = fmt.today();
    if (parts[0] === 'new' || parts[0] === 'edit') {
      var cur = parts[0] === 'edit' ? F.chk.filter(function (c) { return c.id === parts[1]; })[0] : null;
      if (!ed || (parts[0] === 'edit' && !cur)) return HR.go('chk');
      ui.put(view, ui.head('[행정] 체크일정', cur ? '항목 수정' : '항목 추가'), ui.panel(null, null, form(cur, function () { HR.go('chk'); })));
      return;
    }
    var all = F.chk.map(function (c) { return { c: c, s: state(c, t) }; });
    var byDue = function (a, b) { return (a.c.due || '9999') < (b.c.due || '9999') ? -1 : (a.c.due || '9999') > (b.c.due || '9999') ? 1 : (a.c.title < b.c.title ? -1 : 1); };
    var pick = function (ks) { return all.filter(function (x) { return ks.indexOf(x.s.k) >= 0; }).sort(byDue); };
    var hot = pick(['over', 'near']), plan = pick(['plan']), nodate = pick(['nodate']), done = pick(['done']).reverse();
    var within = function (n) { return all.filter(function (x) { return x.s.d != null && x.s.d >= 0 && x.s.d <= n; }).length; };
    var list = function (xs, empty) { return h('ul', { class: 'list chk-list' }, xs.length ? xs.map(function (x) { return row(x.c, x.s, ed); }) : h('li', { class: 'empty', text: empty })); };
    var next = hot.concat(plan)[0];
    ui.put(view, ui.head('[행정] 체크일정', '법인 행정 체크리스트', ed ? ui.btn('+ 항목 추가', function () { HR.go('chk/new'); }, 'btn-sm') : null),
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
})();

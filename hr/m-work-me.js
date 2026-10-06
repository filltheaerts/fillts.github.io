/* fillts HR — INFO › Work: 나의 목표 · 목표를 이루기 위해 가장 중요한 일 5가지 · 나의 강점(1~10) · 나의 날개강점(1~10)
   본인이 작성하고, 본인과 관리자가 본다 (hr_work/{memberId}). */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var draft = {};   // 다시 그려도 입력 중인 내용이 남도록

  function load(mid) { return HR.load('hr_work:' + mid, function () { return db.doc('hr_work/' + mid).get().then(function (s) { return s.exists ? s.data() : {}; }); }); }
  function blank(d) {
    d = d || {};
    var top5 = (d.top5 || []).slice(0, 5), st = (d.strengths || []).slice(0, 10), wi = (d.wings || []).slice(0, 10);
    while (top5.length < 5) top5.push({ t: '', d: '' });
    while (st.length < 10) st.push('');
    while (wi.length < 10) wi.push('');
    return { goal: d.goal || '', top5: top5.map(function (x) { return { t: x.t || '', d: x.d || '' }; }), strengths: st, wings: wi, dirty: false };
  }
  function input(val, ph, max, on) { return h('input', { type: 'text', value: val, placeholder: ph, maxlength: String(max), oninput: function () { on(this.value); } }); }
  function area(val, ph, max, rows, on) { var t = h('textarea', { rows: String(rows), maxlength: String(max), placeholder: ph, oninput: function () { on(this.value); } }); t.value = val; return t; }

  function viewOnly(d, name) {
    var list = function (arr) { var a = arr.filter(Boolean); return a.length ? h('ol', { class: 'work-chips' }, a.map(function (x) { return h('li', { text: x }); })) : h('p', { class: 'empty', text: '아직 적지 않았습니다.' }); };
    var t5 = (d.top5 || []).filter(function (x) { return x.t || x.d; });
    return h('div', { class: 'stack' },
      ui.panel('My goal · 나의 목표', null, d.goal ? h('p', { class: 'work-goal', text: d.goal }) : h('p', { class: 'empty', text: name + '님이 아직 적지 않았습니다.' })),
      ui.panel('Top 5 · 목표를 이루기 위해 가장 중요한 일', null, t5.length ? h('ol', { class: 'work-top5' }, t5.map(function (x) { return h('li', null, h('b', { text: x.t }), x.d ? h('p', { class: 'meta', text: x.d }) : null); })) : h('p', { class: 'empty', text: '아직 적지 않았습니다.' })),
      h('div', { class: 'two-col' }, ui.panel('Strengths · 나의 강점', null, list(d.strengths || [])), ui.panel('Wing strengths · 나의 날개강점', null, list(d.wings || []))),
      d.updatedAt ? h('p', { class: 'note', text: '마지막 수정 ' + fmt.ts(d.updatedAt) }) : null);
  }

  function tab(view, mid) {
    var data = load(mid), m = S.members[mid] || {};
    if (data == null) return ui.put(view, ui.empty('불러오는 중…'));
    if (mid !== S.mid) return ui.put(view, viewOnly(data, m.name || ''));
    var d = draft[mid] || (draft[mid] = blank(data)), msg = ui.msg();
    var touch = function () { d.dirty = true; };
    var top5 = h('ol', { class: 'work-top5 edit' }, d.top5.map(function (x, i) {
      return h('li', null, input(x.t, (i + 1) + '번째로 중요한 일 (제목)', 60, function (v) { x.t = v; touch(); }), area(x.d, '세부 내용 — 무엇을, 언제까지, 어떻게', 400, 2, function (v) { x.d = v; touch(); }));
    }));
    var grid = function (arr, ph) { return h('ol', { class: 'work-grid' }, arr.map(function (v, i) { return h('li', null, input(v, ph + ' ' + (i + 1), 40, function (nv) { arr[i] = nv; touch(); })); })); };
    var save = ui.btn('저장', function () {
      var body = { goal: d.goal.trim(), top5: d.top5.map(function (x) { return { t: x.t.trim(), d: x.d.trim() }; }).filter(function (x) { return x.t || x.d; }),
        strengths: d.strengths.map(function (x) { return x.trim(); }).filter(Boolean), wings: d.wings.map(function (x) { return x.trim(); }).filter(Boolean), updatedAt: FV.serverTimestamp() };
      save.disabled = true;
      db.doc('hr_work/' + mid).set(body).then(function () { delete draft[mid]; HR.invalidate('hr_work:' + mid); ui.toast('저장했습니다.'); })
        .catch(function (x) { save.disabled = false; ui.fail(x, msg); });
    });
    ui.put(view,
      ui.panel('My goal · 나의 목표', null, area(d.goal, '예: 2027년까지 공식몰 월 매출 1억을 만드는 퍼포먼스 마케터가 된다', 1000, 3, function (v) { d.goal = v; touch(); })),
      ui.panel('Top 5 · 목표를 이루기 위해 가장 중요한 일 5가지', null, top5),
      h('div', { class: 'two-col work-two' },
        ui.panel('Strengths · 나의 강점', h('span', { class: 'meta small', text: '1~10개 · 내가 가장 잘하는 것' }), grid(d.strengths, '강점')),
        ui.panel('Wing strengths · 나의 날개강점', h('span', { class: 'meta small', text: '1~10개 · 강점을 더 멀리 날게 하는 보조 강점' }), grid(d.wings, '날개강점'))),
      h('div', { class: 'row work-save' }, save, d.dirty ? h('span', { class: 'meta', text: '저장하지 않은 변경이 있습니다' }) : (data.updatedAt ? h('span', { class: 'meta', text: '마지막 저장 ' + fmt.ts(data.updatedAt) }) : null), msg),
      h('p', { class: 'note', text: '나와 관리자만 볼 수 있습니다. 빈칸은 저장할 때 빠집니다.' }));
  }
  HR.workMe = { tab: tab };
})();

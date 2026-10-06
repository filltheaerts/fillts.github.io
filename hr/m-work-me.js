/* fillts HR — INFO › Work: 나의 목표 · 목표를 이루기 위해 가장 중요한 일 5가지 · 나의 강점(1~10) · 나의 날개강점(1~10)
   본인이 작성하고, 본인과 관리자가 본다 (hr_work/{memberId}). */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var draft = {};   // 다시 그려도 입력 중인 내용이 남도록

  function load(mid) { return HR.load('hr_work:' + mid, function () { return db.doc('hr_work/' + mid).get().then(function (s) { return s.exists ? s.data() : {}; }); }); }
  function blank(d) {
    d = d || {};
    var top5 = (d.top5 || []).slice(0, 5);
    while (top5.length < 5) top5.push({ t: '', d: '' });
    // 강점 · 날개강점은 {제목, 세부 내용}. 처음엔 1칸만 열고 「+ 추가」로 최대 10개 (예전 글자만 저장된 값도 읽는다)
    var items = function (arr) { var a = (arr || []).slice(0, 10).map(function (x) { return typeof x === 'string' ? { t: x, d: '' } : { t: x.t || '', d: x.d || '' }; }); if (!a.length) a.push({ t: '', d: '' }); return a; };
    return { goal: d.goal || '', top5: top5.map(function (x) { return { t: x.t || '', d: x.d || '' }; }), strengths: items(d.strengths), wings: items(d.wings), dirty: false };
  }
  function input(val, ph, max, on) { return h('input', { type: 'text', value: val, placeholder: ph, maxlength: String(max), oninput: function () { on(this.value); } }); }
  function area(val, ph, max, rows, on) { var t = h('textarea', { rows: String(rows), maxlength: String(max), placeholder: ph, oninput: function () { on(this.value); } }); t.value = val; return t; }

  function viewOnly(d, name) {
    var list = function (arr) {
      var a = arr.map(function (x) { return typeof x === 'string' ? { t: x, d: '' } : x; }).filter(function (x) { return x && (x.t || x.d); });
      return a.length ? h('ol', { class: 'work-strengths' }, a.map(function (x) { return h('li', null, h('b', { text: x.t }), x.d ? h('p', { class: 'meta', text: x.d }) : null); })) : h('p', { class: 'empty', text: '아직 적지 않았습니다.' });
    };
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
    var grid = function (arr, ph, hint) {
      var ol = h('ol', { class: 'work-strengths edit' }, arr.map(function (x, i) {
        return h('li', null, h('div', { class: 'ws-row' }, input(x.t, ph, 40, function (v) { x.t = v; touch(); }),
          arr.length > 1 ? h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '삭제', onclick: function () { arr.splice(i, 1); touch(); HR.refresh(); } }) : null),
          area(x.d, hint, 300, 2, function (v) { x.d = v; touch(); }));
      }));
      return h('div', { class: 'stack' }, ol, arr.length < 10 ? h('button', { type: 'button', class: 'btn btn-line btn-sm', text: '+ ' + ph + ' 추가 (' + arr.length + '/10)', onclick: function () { arr.push({ t: '', d: '' }); touch(); HR.refresh(); } }) : h('p', { class: 'meta', text: '최대 10개까지 적을 수 있습니다.' }));
    };
    var save = ui.btn('저장', function () {
      var body = { goal: d.goal.trim(), top5: d.top5.map(function (x) { return { t: x.t.trim(), d: x.d.trim() }; }).filter(function (x) { return x.t || x.d; }),
        strengths: d.strengths.map(function (x) { return { t: x.t.trim(), d: x.d.trim() }; }).filter(function (x) { return x.t || x.d; }),
        wings: d.wings.map(function (x) { return { t: x.t.trim(), d: x.d.trim() }; }).filter(function (x) { return x.t || x.d; }), updatedAt: FV.serverTimestamp() };
      save.disabled = true;
      db.doc('hr_work/' + mid).set(body).then(function () { delete draft[mid]; HR.invalidate('hr_work:' + mid); ui.toast('저장했습니다.'); })
        .catch(function (x) { save.disabled = false; ui.fail(x, msg); });
    });
    ui.put(view,
      ui.panel('My goal · 나의 목표', null, area(d.goal, '예: 2027년까지 공식몰 월 매출 1억을 만드는 퍼포먼스 마케터가 된다', 1000, 3, function (v) { d.goal = v; touch(); })),
      ui.panel('Top 5 · 목표를 이루기 위해 가장 중요한 일 5가지', null, top5),
      h('div', { class: 'two-col work-two' },
        ui.panel('Strengths · 나의 강점', h('span', { class: 'meta small', text: '내가 가장 잘하는 것 · 1개부터' }), grid(d.strengths, '강점', '세부 내용 — 어떤 상황에서, 어떤 결과를 냈는지')),
        ui.panel('Wing strengths · 나의 날개강점', h('span', { class: 'meta small', text: '강점을 더 멀리 날게 하는 보조 강점 · 1개부터' }), grid(d.wings, '날개강점', '세부 내용 — 강점과 어떻게 함께 쓰이는지'))),
      h('div', { class: 'row work-save' }, save, d.dirty ? h('span', { class: 'meta', text: '저장하지 않은 변경이 있습니다' }) : (data.updatedAt ? h('span', { class: 'meta', text: '마지막 저장 ' + fmt.ts(data.updatedAt) }) : null), msg),
      h('p', { class: 'note', text: '나와 관리자만 볼 수 있습니다. 빈칸은 저장할 때 빠집니다.' }));
  }
  HR.workMe = { tab: tab };
})();

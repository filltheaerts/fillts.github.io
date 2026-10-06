/* fillts HR — INFO › Work: 나의 목표 · 목표를 이루기 위해 가장 중요한 일 5가지 · 나의 강점(1~10) · 나의 날개강점(1~10)
   본인이 작성하고, 본인과 관리자가 본다 (hr_work/{memberId}). */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var draft = {};   // 다시 그려도 입력 중인 내용이 남도록
  var editing = {};   // 저장된 내용이 있으면 완료된 글처럼 보여 주고, 「수정하기」를 눌렀을 때만 입력칸

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
      h('div', { class: 'two-col work-two' }, ui.panel('Strengths · 나의 강점', null, list(d.strengths || [])), ui.panel('Wing strengths · 나의 날개강점', null, list(d.wings || []))),
      d.updatedAt ? h('p', { class: 'note', text: '마지막 수정 ' + fmt.ts(d.updatedAt) }) : null);
  }

  /* ---------- 하단: 대표 메시지 · 히스토리 · PDF ---------- */
  var MESSAGE = ['여러분이 회사에서 일하면서 본인의 캐릭터와 강점을 조금 더 알아가기를 바랍니다.', '자신을 더 명확하게 이해한 사람만이 행복한 인생을 성취할 것이라고 믿습니다. 필츠에서 도와드리겠습니다.',
    '치열한 업무 속에서 본인에 대해 새롭게 알게 된 것이 있다면 중간중간 업데이트해 주세요. 아래 히스토리를 통해 나의 변화 과정을 알아 가면 좋겠습니다.'];
  function history(mid) { return HR.load('hr_workh:' + mid, function () { return db.collection('hr_work/' + mid + '/history').get().then(HR.rows); }); }
  function ms(t) { return t && t.toMillis ? t.toMillis() : 0; }
  function records(mid, data) {
    var hs = (history(mid) || []).slice().sort(function (a, b) { return ms(b.at) - ms(a.at); });
    // 히스토리를 쌓기 전에 저장한 내용은 「현재 기록」으로 보여 준다
    if (!hs.length && (data.goal || (data.top5 || []).length || (data.strengths || []).length || (data.wings || []).length)) hs = [Object.assign({ current: true, at: data.updatedAt }, data)];
    return hs;
  }
  function recBody(r) {
    var li = function (arr) { return (arr || []).filter(function (x) { return x && (x.t || x.d); }).map(function (x) { return h('li', null, h('b', { text: x.t || '' }), x.d ? h('span', { text: ' — ' + x.d }) : null); }); };
    var sec = function (label, arr) { var items = li(arr); return items.length ? h('div', { class: 'wh-sec' }, h('h5', { text: label }), h('ol', null, items)) : null; };
    return h('div', { class: 'wh-body' }, r.goal ? h('div', { class: 'wh-sec' }, h('h5', { text: '나의 목표' }), h('p', { text: r.goal })) : null,
      sec('가장 중요한 일 Top 5', r.top5), sec('나의 강점', r.strengths), sec('나의 날개강점', r.wings));
  }
  var openRec = {};
  function bottom(mid, data, name) {
    var recs = records(mid, data);
    var list = h('ol', { class: 'wh-list' }, recs.map(function (r, i) {
      var key = r.id || 'cur', open = openRec[key] !== undefined ? openRec[key] : i === 0;
      var li = h('li', { class: 'wh-item' + (open ? ' open' : '') },
        h('button', { type: 'button', class: 'wh-head', onclick: function () { openRec[key] = !li.classList.contains('open'); li.classList.toggle('open'); } },
          h('span', { class: 'wh-no', text: String(recs.length - i) }), h('b', { text: r.at ? fmt.ts(r.at) : '기록' }),
          i === 0 ? ui.tag(r.current ? '현재 기록' : '최신', 'ok') : null, h('span', { class: 'wh-sum', text: (r.goal || '').slice(0, 60) }), h('span', { class: 'wh-arrow', text: '▾' })),
        recBody(r));
      return li;
    }));
    var loading = history(mid) == null;
    return h('div', { class: 'stack wh-wrap' },
      h('section', { class: 'wh-msg' }, h('span', { class: 'wh-kicker', text: 'FROM FILLTS' }), MESSAGE.map(function (x) { return h('p', { text: x }); })),
      ui.panel('History · 나의 변화 기록', h('span', { class: 'meta', text: recs.length ? recs.length + '개 · 저장할 때마다 쌓입니다' : '' }),
        loading ? ui.empty('불러오는 중…') : recs.length ? list : ui.empty('아직 기록이 없습니다. 위에서 저장하면 첫 기록이 남습니다.')),
      h('div', { class: 'wh-pdf' }, ui.btn('PDF로 모든 히스토리 다운받기', function () { printHistory(name, recs); }, recs.length ? 'btn' : 'btn btn-disabled'),
        h('span', { class: 'meta', text: '인쇄 창에서 「PDF로 저장」을 고르세요.' })));
  }
  function printHistory(name, recs) {
    if (!recs.length) return ui.toast('아직 기록이 없습니다.');
    var area = document.getElementById('printArea'); if (area) area.remove();
    area = h('div', { id: 'printArea', class: 'print-area' },
      h('div', { class: 'wh-doc' },
        h('div', { class: 'wh-doc-head' }, h('span', { text: (S.cfg.companyName || '(주)필츠') + ' · 비전 · 강점 히스토리' }), h('span', { text: '출력 ' + fmt.dot(fmt.today()) })),
        h('h1', { text: name + '님의 변화 기록' }),
        h('p', { class: 'wh-doc-msg', text: MESSAGE.join(' ') }),
        recs.map(function (r, i) {
          return h('section', { class: 'wh-doc-rec' }, h('h2', null, h('span', { text: '#' + (recs.length - i) }), ' ' + (r.at && r.at.toDate ? fmt.dot(HR.L.kstDate(r.at.toDate())) + ' ' + HR.L.kstHM(r.at.toDate()) : '기록') + (r.current ? ' (현재 기록)' : '')), recBody(r));
        })),
      h('div', { class: 'print-actions' }, ui.btn('인쇄 · PDF 저장', function () { window.print(); }), ui.btn('닫기', function () { area.remove(); }, 'btn-line')));
    document.body.appendChild(area); document.body.classList.add('printing-hist');
    // 여러 쪽 문서라 인쇄하는 동안만 쪽 여백을 준다 (증명서는 여백 0 · 한 장) — CSP 때문에 <style> 대신 CSSOM
    var sheet = [].slice.call(document.styleSheets).filter(function (x) { return /hr-v2\.css/.test(x.href || ''); })[0], ri = -1;
    try { if (sheet) ri = sheet.insertRule('@page { size: A4; margin: 16mm; }', sheet.cssRules.length); } catch (e) { /* 무시 */ }
    window.addEventListener('afterprint', function done() { document.body.classList.remove('printing-hist'); try { if (ri >= 0) sheet.deleteRule(ri); } catch (e) { /* 무시 */ } ri = -1; window.removeEventListener('afterprint', done); });
    setTimeout(function () { window.print(); }, 300);
  }

  function tab(view, mid) {
    var data = load(mid), m = S.members[mid] || {};
    if (data == null) return ui.put(view, ui.empty('불러오는 중…'));
    if (mid !== S.mid) return ui.put(view, viewOnly(data, m.name || ''), bottom(mid, data, m.name || ''));
    var filled = !!(data.goal || (data.top5 || []).length || (data.strengths || []).length || (data.wings || []).length);
    if (filled && !editing[mid]) {
      return ui.put(view, h('div', { class: 'row work-actions' }, ui.btn('수정하기', function () { editing[mid] = true; delete draft[mid]; HR.refresh(); }, 'btn-line btn-sm'),
        h('span', { class: 'meta', text: '나와 관리자만 볼 수 있습니다.' })), viewOnly(data, m.name || ''), bottom(mid, data, m.name || ''));
    }
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
      var b = db.batch(), snap = Object.assign({}, body, { at: FV.serverTimestamp() }); delete snap.updatedAt;
      b.set(db.doc('hr_work/' + mid), body); b.set(db.collection('hr_work/' + mid + '/history').doc(), snap);
      b.commit().then(function () { delete draft[mid]; editing[mid] = false; HR.invalidate('hr_work:' + mid); HR.invalidate('hr_workh:' + mid); ui.toast('저장했습니다. 히스토리에도 남았습니다.'); })
        .catch(function (x) { save.disabled = false; ui.fail(x, msg); });
    });
    ui.put(view,
      ui.panel('My goal · 나의 목표', null, area(d.goal, '예: 2027년까지 공식몰 월 매출 1억을 만드는 퍼포먼스 마케터가 된다', 1000, 3, function (v) { d.goal = v; touch(); })),
      ui.panel('Top 5 · 목표를 이루기 위해 가장 중요한 일 5가지', null, top5),
      h('div', { class: 'two-col work-two' },
        ui.panel('Strengths · 나의 강점', h('span', { class: 'meta small', text: '내가 가장 잘하는 것 · 1개부터' }), grid(d.strengths, '강점', '세부 내용 — 어떤 상황에서, 어떤 결과를 냈는지')),
        ui.panel('Wing strengths · 나의 날개강점', h('span', { class: 'meta small', text: '강점을 더 멀리 날게 하는 보조 강점 · 1개부터' }), grid(d.wings, '날개강점', '세부 내용 — 강점과 어떻게 함께 쓰이는지'))),
      h('div', { class: 'row work-save' }, save, filled ? ui.btn('취소', function () { editing[mid] = false; delete draft[mid]; HR.refresh(); }, 'btn-line') : null, d.dirty ? h('span', { class: 'meta', text: '저장하지 않은 변경이 있습니다' }) : (data.updatedAt ? h('span', { class: 'meta', text: '마지막 저장 ' + fmt.ts(data.updatedAt) }) : null), msg),
      h('p', { class: 'note', text: '나와 관리자만 볼 수 있습니다. 빈칸은 저장할 때 빠집니다.' }), bottom(mid, data, m.name || ''));
  }
  HR.workMe = { tab: tab };
})();

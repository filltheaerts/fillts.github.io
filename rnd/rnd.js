/* fillts R&D — 화면. 데이터 = rnd_docs/main.json (rnd.json + rnd_extra.json 합본) · rnd_docs/status */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, L = HR.L;
  var R = { d: null, st: {}, loaded: false };
  HR.APP.onStart = function (sub) {
    sub(db.doc('rnd_docs/main'), function (s) { try { R.d = s.exists ? JSON.parse(s.data().json || '{}') : {}; } catch (e) { R.d = {}; } R.loaded = true; });
    sub(db.doc('rnd_docs/status'), function (s) { R.st = (s.exists && s.data().checks) || {}; });
  };
  var canEdit = function () { return S.isAdmin || HR.appLevel('rnd') === 'edit'; };
  var D = function () { return R.d || {}; };
  var today = function () { return fmt.today(); };
  var dday = function (dt) { if (!dt) return ''; var n = L.daysBetween(today(), dt); return n === 0 ? 'D-DAY' : n > 0 ? 'D-' + n : 'D+' + (-n); };
  var dot = function (dt) { return dt ? fmt.dot(dt) : ''; };
  // 묶음 화면(R.sub)에서는 각 부분의 큰 제목 대신 구분선 달린 소제목으로
  var head = function (view, title, right) { ui.put(view, R.sub ? h('div', { class: 'rd-sec' }, h('h2', { class: 'rd-q-h', text: title }), right || null) : ui.head('R&D센터 · 연구개발전담부서', title, right)); };
  var wait = function (view) { if (R.loaded) return false; ui.put(view, ui.empty('불러오는 중…')); return true; };
  var empty = function (t) { return h('p', { class: 'empty', text: t }); };
  var src = function () { var d = D(); return d.asOf && !R.sub ? h('p', { class: 'note', text: '자료 기준 ' + fmt.dot(d.asOf) + (d.source ? ' · ' + d.source : '') }) : null; };
  var kv = function (rows) { return h('dl', { class: 'rd-kv' }, rows.map(function (r) { return h('div', null, h('dt', { text: r[0] }), h('dd', { text: r[1] })); })); };
  var table = function (cols, rows) {
    return h('div', { class: 'table-wrap flat' }, h('table', { class: 'table rd-table' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: /^(수량|금액|인건비|실비|신고)/.test(c) ? 'num' : '', text: c }); }))), h('tbody', null, rows)));
  };

  // 남은 날 배지: 지남 · 90일 안(빨강) · 그 외 · 날짜 없음(상시)
  function badge(dt) {
    if (!dt) return h('span', { class: 'rd-d rd-none', text: '상시' });
    var n = L.daysBetween(today(), dt);
    return h('span', { class: 'rd-d' + (n < 0 ? ' rd-over' : n <= 90 ? ' rd-near' : ''), text: n < 0 ? '지남' : dday(dt) });
  }

  /* ---------- [quick] 가장 시급한 것 + 인쇄 · 편철할 문서 ----------
     quick = { root, urgent: [{t, due, why, path}], print: [{no, name, file, pages, bind, sign, note}] } — 경로는 '/'로 저장, 화면은 Windows 형식
     브라우저는 보안상 https 페이지에서 내 PC 폴더(file://)를 직접 열 수 없다 → 「경로 복사」 후 탐색기 주소창(Win+E → Ctrl+L)에 붙여넣기 */
  var win = function (p) { return String(p || '').replace(/\//g, '\\'); };
  function pathRow(root, rel) {
    var full = win(root + (rel ? '/' + rel : ''));
    return h('div', { class: 'rd-path' }, h('code', { text: full }),
      h('button', { type: 'button', class: 'btn btn-line btn-xs no-print', text: '경로 복사', onclick: function () {
        var b = this;
        (navigator.clipboard ? navigator.clipboard.writeText(full) : Promise.reject()).then(function () { b.textContent = '복사됨 ✓'; setTimeout(function () { b.textContent = '경로 복사'; }, 1500); })
          .catch(function () { ui.toast('복사하지 못했습니다 — 경로를 직접 선택해 복사하세요.'); });
      } }));
  }
  function quick(view) {
    if (wait(view)) return;
    var q = D().quick || {}, root = q.root || '';
    var urgent = (q.urgent || []).slice().sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
    head(view, 'Quick — 지금 가장 시급한 것', h('button', { type: 'button', class: 'btn btn-sm no-print', text: '인쇄', onclick: function () { window.print(); } }));
    ui.put(view,
      h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: '1. 시급한 일 ' + urgent.length + '건' }),
        h('ol', { class: 'rd-q-list' }, urgent.map(function (u) {
          return h('li', null, h('div', { class: 'rd-q-head' }, badge(u.due), h('span', { class: 'strong', text: u.t }), u.due ? h('span', { class: 'meta', text: dot(u.due) }) : null),
            u.why ? h('p', { class: 'rd-q-why', text: u.why }) : null, u.path ? pathRow(root, u.path) : null);
        }))),
      // 2 = 인쇄할 것만 (문서 · 쪽 · 경로), 3 = 출력 전후 확인 체크리스트 (□ 인쇄해서 체크)
      h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: '2. 인쇄할 것' }),
        h('ol', { class: 'rd-q-list' }, (q.print || []).map(function (p) {
          return h('li', null, h('div', { class: 'rd-q-head' }, h('span', { class: 'strong', text: p.name }), p.pages ? h('span', { class: 'rd-d', text: p.pages + '쪽' }) : null), pathRow(root, p.file));
        }))),
      (q.check || []).length ? h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: '3. 확인 체크리스트' }),
        h('ul', { class: 'rd-chk' }, q.check.map(function (c) {
          return h('li', null, h('span', { class: 'rd-box', 'aria-hidden': 'true', text: '□' }), h('div', { class: 'grow' }, h('span', { class: 'strong', text: c.t }), c.d ? h('div', { class: 'meta', text: c.d }) : null, c.path ? pathRow(root, c.path) : null));
        }))) : null,
      root ? h('p', { class: 'note no-print' }, '폴더 열기: 「경로 복사」 → Win+E → Ctrl+L → 붙여넣기 (브라우저는 보안상 내 PC 폴더를 직접 못 엶)') : null);
  }

  /* ---------- 현황 ---------- */
  function home(view) {
    if (wait(view)) return;
    var d = D(), next = (d.deadlines || []).filter(function (x) { return x[0] && x[0] >= today(); }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    head(view, '현황');
    ui.put(view,
      next.length ? h('dl', { class: 'summary three' }, next.slice(0, 3).map(function (x) {
        return h('div', null, h('dt', { text: x[1] }), h('dd', { class: L.daysBetween(today(), x[0]) <= 90 ? 'red' : '', text: dday(x[0]) }), h('span', { class: 'meta', text: dot(x[0]) }));
      })) : null,
      (d.now || []).length ? ui.panel('지금 해야 할 일', null, h('ol', { class: 'rd-now' }, d.now.map(function (t) { return h('li', { text: t }); }))) : null,
      ui.panel('인정 정보', null, kv(d.info || [])),
      src());
  }

  /* ---------- 진행 (설립부터 지금까지) ---------- */
  function timeline(view) {
    if (wait(view)) return;
    var t = (D().timeline || []).slice().sort(function (a, b) { return (a.date || '9') < (b.date || '9') ? -1 : 1; });
    var K = { done: '완료', now: '진행 중', next: '다음' };
    head(view, '진행 — 설립부터 지금까지');
    ui.put(view, ui.panel(null, null, t.length ? h('ol', { class: 'rd-tl' }, t.map(function (x) {
      return h('li', { class: 'rd-tl-' + (x.kind || 'done') }, h('div', { class: 'rd-tl-date', text: x.date ? fmt.dot(x.date) : '' }),
        h('div', { class: 'rd-tl-body' }, h('div', { class: 'strong' }, x.title || '', ' ', ui.tag(K[x.kind] || '완료', x.kind === 'now' ? 'red' : x.kind === 'next' ? '' : 'mute')),
          x.body ? h('p', { class: 'meta', text: x.body }) : null));
    })) : empty('진행 기록을 정리하는 중입니다.')), src());
  }

  /* ---------- 비품 (연구공간 · 기자재) ---------- */
  function equip(view) {
    if (wait(view)) return;
    var d = D(), eq = d.equipment || [], sp = d.space || {};
    var total = eq.reduce(function (s, e) { return s + (+e.price || 0) * (+e.qty || 1); }, 0);
    head(view, '비품 — 연구공간 · 기자재');
    ui.put(view,
      ui.panel('연구공간', null, kv([['면적', sp.area], ['구획', sp.partition], ['현판', sp.sign], ['사진 증빙', sp.photos], ['메모', sp.note]].filter(function (r) { return r[1]; }))),
      ui.panel('연구기자재 ' + eq.length + '종', total ? h('span', { class: 'meta', text: '합계 ' + total.toLocaleString() + '원' }) : null,
        eq.length ? table(['기자재', '규격', '수량', '금액', '수령', '용도', '상태'], eq.map(function (e) {
          return h('tr', null, h('td', { class: 'strong', text: e.name || '' }), h('td', { text: e.spec || '' }), h('td', { class: 'num', text: e.qty != null ? String(e.qty) : '' }),
            h('td', { class: 'num', text: e.price != null ? (+e.price).toLocaleString() : '' }), h('td', { class: 'nowrap', text: dot(e.date) }), h('td', { text: e.use || '' }),
            h('td', null, e.status ? ui.tag(e.status, /필요|미/.test(e.status) ? 'red' : 'mute') : null));
        })) : empty('기자재 목록을 정리하는 중입니다.')),
      src());
  }

  /* ---------- 연구과제 ---------- */
  function tasks(view) {
    if (wait(view)) return;
    var d = D(), b = d.budget || {};
    head(view, '연구과제 — 신고한 1년 과제 3건');
    ui.put(view, (d.tasks || []).map(function (t) {
      return ui.panel('과제 ' + t.no + ' · ' + (t.tag || ''), h('span', { class: 'meta', text: t.period + ' · ' + t.budget + '백만 · 바인더 ' + t.binder }),
        h('div', { class: 'rd-task-name', text: t.name }), h('p', { class: 'rd-pre', text: t.body }));
    }), d.taskNote ? h('p', { class: 'note', text: d.taskNote }) : null,
      (b.rows || []).length ? ui.panel('연구개발비 계획 45백만', null,
        table(['과제', '인건비(만)', '실비(만)', '신고(백만)'], b.rows.map(function (r) {
          return h('tr', null, h('td', { text: r[0] }), h('td', { class: 'num', text: r[1].toLocaleString() }), h('td', { class: 'num', text: r[2].toLocaleString() }), h('td', { class: 'num strong', text: String(r[3]) }));
        })),
        kv((b.split || []).map(function (r) { return [r[0] + ' ' + r[1] + '백만', r[2]]; })),
        b.note ? h('p', { class: 'note', text: b.note }) : null) : null,
      src());
  }

  /* ---------- 일정 (무엇을 언제까지) ---------- */
  function due(view) {
    if (wait(view)) return;
    var x = (D().deadlines || []).slice().sort(function (a, b) { return (a[0] || '0') < (b[0] || '0') ? -1 : 1; });
    head(view, '일정 — 무엇을 언제까지');
    ui.put(view, ui.panel(null, null, h('ul', { class: 'list rd-due' }, x.map(function (r) {
      return h('li', null, badge(r[0]), h('div', { class: 'grow' }, h('div', { class: 'strong', text: r[1] }), h('div', { class: 'meta', text: (r[0] ? dot(r[0]) + ' · ' : '') + (r[2] || '') })));
    }))), src());
  }

  /* ---------- 27.4 연장 · 28.4 조사표 (항목별 서류 · 할 일) ---------- */
  function steps(view, key, title, lead) {
    if (wait(view)) return;
    var x = D()[key] || [];
    head(view, title);
    ui.put(view, h('p', { class: 'rd-lead', text: lead }),
      ui.panel(null, null, x.length ? h('ol', { class: 'rd-steps' }, x.map(function (r) {
        return h('li', null, h('div', { class: 'rd-step-head' }, h('span', { class: 'strong', text: r.item || '' }), r.due ? badge(r.due) : null, r.due ? h('span', { class: 'meta', text: dot(r.due) }) : null),
          r.detail ? h('p', { class: 'rd-pre', text: r.detail }) : null,
          h('div', { class: 'meta', text: [r.owner ? '담당 ' + r.owner : '', r.where ? '제출 ' + r.where : '', r.source ? '자료 ' + r.source : ''].filter(Boolean).join(' · ') }));
      })) : empty('항목을 정리하는 중입니다.')), src());
  }
  function renew(view) { steps(view, 'renewal2027', '2027.4 유효기간 연장', '인정서 유효기간(27.3.31)은 중소기업확인서 만료일에 묶여 있습니다. 법인세 신고 → 확인서 갱신 → 4월 변경신고 순서로 연장합니다. 경과하면 취소 대상이고 자동 연장은 없습니다.'); }
  function report(view) { steps(view, 'report', '연구개발활동 조사표 — 매년 4월 말', '전년도 연구개발 활동 · 비용을 매년 4월 말까지 보고합니다. 미제출 시 인정 취소. 26.8.31 인정분도 대상이라 첫 제출은 2027년 4월(2026년분 — 설립 비용 · 인건비 포함), 그다음은 2028년 4월(2027년분 — 3과제 1년 실적)입니다. 유효기간 연장 변경신고와는 별개입니다.'); }

  /* ---------- 서류 · 바인더 ---------- */
  function docs(view) {
    if (wait(view)) return;
    var d = D(), x = d.docs || [];
    head(view, '서류 · 바인더');
    ui.put(view,
      ui.panel('증빙 서류 ' + x.length + '건', null, x.length ? table(['서류', '상태', '위치', '메모'], x.map(function (r) {
        return h('tr', null, h('td', { class: 'strong', text: r.name }), h('td', null, ui.tag(r.status || '', r.status === '보유' ? 'mute' : 'red')), h('td', { text: r.where || '' }), h('td', { class: 'meta', text: r.note || '' }));
      })) : empty('서류 목록을 정리하는 중입니다.')),
      ui.panel('연구 바인더 5권', null, table(['바인더', '채우는 과제', '상태'], (d.binders || []).map(function (r) {
        return h('tr', null, h('td', { class: 'strong nowrap', text: r[0] }), h('td', { text: r[1] }), h('td', { class: /구멍|0건/.test(r[2]) ? 'red' : '', text: r[2] }));
      }))),
      src());
  }

  /* ---------- 2027.4 검증 체크리스트 (상태 변경 가능) ---------- */
  var ST = [['', '— 상태'], ['done', '완료'], ['doing', '진행 중'], ['todo', '미착수'], ['check', '확인 필요']];
  function check(view) {
    if (wait(view)) return;
    var d = D(), ed = canEdit(), all = d.checks || [];
    var cnt = function (k) { return all.filter(function (c) { return (R.st[c[0]] || {}).st === k; }).length; };
    head(view, '2027.4 검증 체크리스트');
    ui.put(view, h('dl', { class: 'summary' }, [['완료', cnt('done')], ['진행 중', cnt('doing')], ['미착수', cnt('todo')], ['상태 미지정', all.length - cnt('done') - cnt('doing') - cnt('todo') - cnt('check')]].map(function (p) {
        return h('div', null, h('dt', { text: p[0] }), h('dd', { text: p[1] + '건' }));
      })),
      (d.tracks || []).map(function (tr) {
        var rows = all.filter(function (c) { return c[1] === tr[0]; });
        return ui.panel('트랙 ' + tr[0] + ' · ' + tr[1], h('span', { class: 'meta', text: tr[2] }),
          table(['#', '항목', '판정 기준', '현재 (' + (d.checksAsOf ? fmt.dot(d.checksAsOf) : '') + ')', '담당', '상태'], rows.map(function (c) {
            var cur = R.st[c[0]] || {}, sel = ui.select(ST, cur.st || '', ed ? { 'aria-label': c[2] + ' 상태' } : { disabled: true, 'aria-label': c[2] + ' 상태' });
            sel.addEventListener('change', function () {
              var upd = {}; upd[c[0]] = { st: sel.value, by: S.mid || '', at: fmt.today() };
              db.doc('rnd_docs/status').set({ checks: upd }, { merge: true }).then(function () { ui.toast('저장했습니다.'); }).catch(ui.fail);
            });
            return h('tr', { class: cur.st === 'done' ? 'rd-done' : '' }, h('td', { class: 'nowrap', text: c[0] }), h('td', { class: 'strong', text: c[2] }), h('td', { text: c[3] }),
              h('td', { class: 'meta', text: c[4] }), h('td', { class: 'nowrap', text: c[5] }), h('td', null, sel, cur.at ? h('div', { class: 'meta', text: fmt.dot(cur.at) }) : null));
          })));
      }), src());
  }

  /* ---------- [기보/벤처] 체크리스트 — 상태는 rnd_docs/status.checks(K번호)에 같이 저장 ---------- */
  var KST = { ok: '충족', doing: '진행 중', todo: '해야 함', check: '확인 필요' };
  function kibo(view) {
    if (wait(view)) return;
    var k = D().kibo || {}, ed = canEdit(), root = k.root || '';
    var all = [].concat.apply([], (k.sections || []).map(function (s) { return s.items; }));
    var stOf = function (it) { return (R.st[it.id] || {}).st || it.st; };
    var cnt = function (x) { return all.filter(function (it) { return stOf(it) === x; }).length; };
    ui.put(view, ui.head('기보 · 벤처', '기술평가 · 벤처확인 체크리스트', h('button', { type: 'button', class: 'btn btn-sm no-print', text: '인쇄', onclick: function () { window.print(); } })),
      k.lead ? h('p', { class: 'rd-lead', text: k.lead }) : null,
      h('dl', { class: 'summary' }, [['충족', 'ok'], ['진행 중', 'doing'], ['해야 함', 'todo'], ['확인 필요', 'check']].map(function (p) {
        return h('div', null, h('dt', { text: p[0] }), h('dd', { class: p[1] === 'todo' && cnt('todo') ? 'red' : '', text: cnt(p[1]) + '건' }));
      })),
      (k.sections || []).map(function (sec) {
        return h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: sec.name }), h('ul', { class: 'list rd-k' }, sec.items.map(function (it) {
          var st = stOf(it), sel = ui.select([['ok', '충족'], ['doing', '진행 중'], ['todo', '해야 함'], ['check', '확인 필요']], st, ed ? { class: 'no-print', 'aria-label': it.t + ' 상태' } : { class: 'no-print', disabled: true });
          sel.addEventListener('change', function () { var u = {}; u[it.id] = { st: sel.value, by: S.mid || '', at: fmt.today() }; db.doc('rnd_docs/status').set({ checks: u }, { merge: true }).then(function () { ui.toast('저장했습니다.'); }).catch(ui.fail); });
          return h('li', { class: 'rd-k-' + st }, h('span', { class: 'rd-k-st', text: KST[st] || st }),
            h('div', { class: 'grow' }, h('div', { class: 'rd-q-head' }, h('span', { class: 'strong', text: it.t }), it.due ? badge(it.due) : null),
              h('div', { class: 'meta', text: it.now || '' }), it.path ? pathRow(root, it.path) : null), sel);
        })));
      }),
      (k.ask || []).length ? h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: '기보에 직접 물어볼 것' }), h('ol', { class: 'rd-now' }, k.ask.map(function (t) { return h('li', { text: t }); }))) : null);
  }

  // [R&D센터] 핵심 4화면 = 기존 화면을 한 화면에 묶음 (구분선 소제목)
  function combo(title, parts) {
    return function (view, p) {
      if (wait(view)) return;
      ui.put(view, ui.head('R&D센터 · 연구개발전담부서', title));
      R.sub = true;
      try { parts.forEach(function (fn) { fn(view, p || []); }); } finally { R.sub = false; }
      ui.put(view, src());
    };
  }
  /* ---------- [임상] 클렌징 젤 · 클렌징 오일 — 특허(지오특허)와 약속한 시험을 임상 항목별로 ----------
     clinical.{gel|oil} = { name, patent, claims, hypothesis[], tests[{kind: human|lab, area, item, method, compare, use, decision, why, status, who, due, source}], timeline[[날짜, 무엇]], notes[] } */
  var DEC = { '하기로 함': 'go', '보류': 'hold', '안 하기로 함': 'no', '미정': 'tbd' };
  function clinical(key) {
    return function (view) {
      if (wait(view)) return;
      var c = (D().clinical || {})[key] || {}, tests = c.tests || [];
      var kinds = [['human', '인체적용시험'], ['lab', '실험실 · 기기 시험']];
      var dc = function (d) { return tests.filter(function (t) { return (t.decision || '미정') === d; }).length; };
      ui.put(view, ui.head('임상 · ' + (c.name || ''), (c.name || '') + ' — 시험 항목',
          h('button', { type: 'button', class: 'btn btn-sm no-print', text: '인쇄', onclick: function () { window.print(); } })),
        c.patent ? h('div', { class: 'rd-cl-pat' }, h('span', { class: 'rd-k-st', text: '특허' }), h('span', { class: 'strong', text: c.patent }), c.claims ? h('p', { class: 'meta', text: c.claims }) : null) : null,
        h('dl', { class: 'summary' }, [['하기로 함', dc('하기로 함')], ['보류', dc('보류')], ['안 하기로 함', dc('안 하기로 함')], ['미정', dc('미정')]].map(function (p) {
          return h('div', null, h('dt', { text: p[0] }), h('dd', { text: p[1] + '건' }));
        })),
        c.samples ? h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: '검체 — 실시예 · 비교예 · 대조 (괄호 = 중량비)' }), h('dl', { class: 'rd-kv' }, Object.keys(c.samples).map(function (k) {
          return h('div', null, h('dt', { text: k + ' ' + c.samples[k].length }), h('dd', { text: c.samples[k].join(' · ') }));
        }))) : null,
        (c.hypothesis || []).length ? h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: '검증할 가설' }), h('ol', { class: 'rd-now' }, c.hypothesis.map(function (x) { return h('li', { text: x }); }))) : null,
        kinds.map(function (k) {
          var xs = tests.filter(function (t) { return (t.kind || 'human') === k[0]; });
          if (!xs.length) return null;
          return h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: k[1] + ' ' + xs.length + '건' }), h('ol', { class: 'rd-cl' }, xs.map(function (t) {
            var d = t.decision || '미정';
            return h('li', { class: 'rd-cl-' + (DEC[d] || 'tbd') },
              h('div', { class: 'rd-q-head' }, h('span', { class: 'rd-cl-dec', text: d }), t.area ? h('span', { class: 'rd-cl-area', text: t.area }) : null, h('span', { class: 'strong', text: t.item || '' }), t.due ? badge(t.due) : null),
              t.why ? h('p', { class: 'rd-q-why', text: t.why }) : null,
              h('dl', { class: 'rd-cl-kv' }, [['방법', t.method], ['비교', t.compare], ['쓰임', t.use], ['상태', [t.status, t.who].filter(Boolean).join(' · ')], ['근거', t.source]].filter(function (r) { return r[1]; }).map(function (r) {
                return h('div', null, h('dt', { text: r[0] }), h('dd', { text: r[1] }));
              })));
          })));
        }),
        (c.timeline || []).length ? h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: '일정' }), h('ul', { class: 'list rd-due' }, c.timeline.map(function (r) {
          var dt = /^\d{4}-\d{2}-\d{2}$/.test(r[0]) ? r[0] : '';
          return h('li', null, dt ? badge(dt) : h('span', { class: 'rd-d rd-none', text: r[0] || '—' }), h('div', { class: 'grow' }, h('div', { text: r[1] }), dt ? h('div', { class: 'meta', text: dot(dt) }) : null));
        }))) : null,
        (c.notes || []).length ? h('section', { class: 'rd-q' }, h('h2', { class: 'rd-q-h', text: '주의 · 미결' }), h('ul', { class: 'rd-now' }, c.notes.map(function (x) { return h('li', { text: x }); }))) : null,
        tests.length ? null : empty('시험 항목을 정리하는 중입니다.'));
    };
  }
  HR.register('gel', { render: clinical('gel') });
  HR.register('oil', { render: clinical('oil') });
  HR.register('kibo', { render: kibo });
  HR.register('home', { render: combo('현황 — 인정 정보 · 진행', [home, timeline]) });
  HR.register('research', { render: combo('연구 — 과제 · 연구비 · 비품', [tasks, equip]) });
  HR.register('due', { render: combo('기한 — 일정 · 27.4 연장 · 조사표', [due, renew, report]) });
  HR.register('docs', { render: combo('서류 · 검증', [docs, check]) });
  HR.register('quick', { render: quick });
})();

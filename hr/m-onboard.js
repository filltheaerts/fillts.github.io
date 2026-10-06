/* fillts HR — 기본안내 › 온보딩 가이드
   첫날 → 첫 주 → 첫 2주 → 첫 달 체크리스트(hr_plan/onboarding). 체크는 본인 hr_private.onboard에 저장되어 어느 기기에서든 이어진다.
   관리자는 구성원별 진행률을 본다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;

  function plan() {
    if (HR.cache.hr_plan_onb && !HR.cache.hr_plan_onb.loading && Date.now() - HR.cache.hr_plan_onb.at > 15000) delete HR.cache.hr_plan_onb;
    return HR.load('hr_plan_onb', function () { return db.doc('hr_plan/onboarding').get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : null; }); });
  }
  function ids(P) { var a = []; P.stages.forEach(function (st) { st.items.forEach(function (x) { a.push(x.id); }); }); return a; }
  function rate(P, map) { var a = ids(P), n = a.filter(function (k) { return map && map[k]; }).length; return { n: n, total: a.length, p: a.length ? n / a.length : 0 }; }
  function mine() { return (S.priv && S.priv.onboard) || {}; }
  function save(map) {
    S.priv = Object.assign({}, S.priv, { onboard: map });
    db.doc('hr_private/' + S.mid).set({ onboard: map, updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { HR.invalidate('hr_onb_all'); }).catch(ui.fail);
  }

  function overview(P) {
    var rows = HR.load('hr_onb_all', function () { return db.collection('hr_private').get().then(HR.rows); });
    if (!rows) return ui.panel('Team · 구성원별 온보딩 진행 (관리자)', null, ui.empty('불러오는 중…'));
    var by = {}; rows.forEach(function (r) { by[r.id] = r.onboard || {}; });
    var list = HR.memberList(false).map(function (m) { var r = rate(P, by[m.id]); return { m: m, r: r }; }).sort(function (a, b) { return a.r.p - b.r.p; });
    return ui.panel('Team · 구성원별 온보딩 진행 (관리자)', null, h('ul', { class: 'onb-team' }, list.map(function (x) {
      var f = h('i'); f.style.width = Math.round(x.r.p * 100) + '%';
      return h('li', null, h('b', { text: x.m.name }), h('span', { class: 'meta', text: x.m.hireDate ? '입사 ' + fmt.dot(x.m.hireDate) : '' }),
        h('span', { class: 'onb-bar' }, f), h('span', { class: 'mono', text: x.r.n + ' / ' + x.r.total }));
    })));
  }

  // 상세판 PDF — 로그인한 구성원만 받는다 (hr_about_files/onboarding_pdf_0, _1 … 조각)
  function downloadPdf(btn) {
    btn.disabled = true; var label = btn.textContent; btn.textContent = '내려받는 중…';
    var parts = [];
    (function next(k) {
      db.doc('hr_about_files/onboarding_pdf_' + k).get().then(function (s) {
        if (s.exists && k < 8) { parts.push(s.data().data); return next(k + 1); }
        if (!parts.length) throw { user: 'PDF가 아직 준비되지 않았습니다.' };
        var bin = atob(parts.join('')), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([u], { type: 'application/pdf' })), a = h('a', { href: url, download: '필츠_온보딩가이드_상세판.pdf' });
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        btn.disabled = false; btn.textContent = label;
      }).catch(function (x) { btn.disabled = false; btn.textContent = label; x && x.user ? ui.toast(x.user) : ui.fail(x); });
    })(0);
  }

  function render(view) {
    var P = plan();
    if (!P) { var c = HR.cache.hr_plan_onb; return ui.put(view, ui.empty(c && c.at && !c.loading ? '아직 내용이 없습니다.' : '불러오는 중…')); }
    var map = Object.assign({}, mine()), total = rate(P, map);
    var head = h('div', { class: 'onb-progress' }), fill = h('i');
    function redraw() {
      var r = rate(P, map); fill.style.width = Math.round(r.p * 100) + '%';
      head.firstChild.textContent = r.n === r.total ? '온보딩 완료! 🎉 이제 필츠의 리듬으로 일하고 있습니다.' : '진행 ' + r.n + ' / ' + r.total + ' · ' + Math.round(r.p * 100) + '%';
      [].forEach.call(view.querySelectorAll('.onb-stage'), function (sec) {
        var all = sec.querySelectorAll('.onb-item'), ok = sec.querySelectorAll('.onb-item.done');
        sec.querySelector('.onb-count').textContent = ok.length + ' / ' + all.length; sec.classList.toggle('complete', all.length === ok.length);
      });
    }
    head.appendChild(h('b')); head.appendChild(h('span', { class: 'onb-bar big' }, fill));
    ui.put(view,
      h('section', { class: 'onb-hero' }, h('div', { class: 'onb-hero-top' }, h('span', { class: 'onb-kicker', text: 'ONBOARDING · 첫 한 달 가이드' }),
        ui.btn('↓ PDF 다운로드 (상세판 16쪽)', function () { downloadPdf(this); }, 'btn-sm onb-pdf')), h('h2', { text: P.title }), h('p', { text: P.lead }), head),
      h('ol', { class: 'onb-stages' }, P.stages.map(function (st, si) {
        return h('li', { class: 'onb-stage' },
          h('div', { class: 'onb-stage-head' }, h('span', { class: 'onb-when', text: st.when }), h('h3', { text: st.title }), h('span', { class: 'onb-count' })),
          h('p', { class: 'onb-why', text: st.why }),
          h('ul', { class: 'onb-items' }, st.items.map(function (x) {
            var li = h('li', { class: 'onb-item' + (map[x.id] ? ' done' : '') },
              h('label', { class: 'onb-check' }, h('input', { type: 'checkbox', checked: !!map[x.id], onchange: function () {
                if (this.checked) map[x.id] = true; else delete map[x.id];
                li.classList.toggle('done', this.checked); redraw(); save(map);
              } }), h('span', { class: 'onb-box' })),
              h('div', { class: 'onb-body' }, h('b', { text: x.t }), h('p', { text: x.d }), x.link ? h('a', { class: 'link onb-go', href: x.link, text: x.lt + ' 바로가기 →' }) : null));
            return li;
          })));
      })),
      ui.panel('Rules · ' + P.rules.title, null, h('ul', { class: 'onb-rules' }, P.rules.items.map(function (t) { return h('li', { text: t }); }))),
      h('p', { class: 'onb-help', text: P.help }),
      S.isAdmin ? overview(P) : null);
    redraw();
  }
  HR.onboard = { render: render };
})();

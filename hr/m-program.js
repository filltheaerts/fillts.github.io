/* fillts HR — 기본안내 › 필츠 프로그램
   정기 업무미팅 · 프로젝트 미팅 · 원온원처럼 필츠가 루틴하게 운영하는 자리를 소개한다(hr_plan/program).
   문서가 없으면 기본안을 보여 주고, 관리자가 화면에서 바로 고쳐 저장하면 그때부터 저장본을 쓴다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;

  var DEFAULT = {
    title: '필츠 프로그램',
    lead: '필츠는 정해진 리듬으로 만나고, 맞추고, 함께 성장합니다. 아래는 구성원이라면 누구나 참여하는 정기 프로그램입니다. 주기와 세부 운영은 상황에 맞춰 관리자가 업데이트합니다.',
    programs: [
      { name: '정기 업무미팅', en: 'Regular Meeting', cycle: '매주 1회', who: '전 구성원', time: '',
        purpose: '현황을 바탕으로 스케줄을 이해하고, 회사 전체 현황을 공유하는 자리입니다.',
        agenda: ['회사 전체 현황과 주요 일정 공유', '팀·개인별 진행 현황과 이번 주 스케줄 확인', '일정 충돌·지연 이슈 조율, 도움이 필요한 일 요청'],
        prep: ['내 업무 현황(진행·완료·막힌 것)을 한 줄씩 정리', 'WORK 프로젝트 현황 업데이트'], note: '' },
      { name: '프로젝트 미팅', en: 'Project Meeting', cycle: '프로젝트별 수시', who: '프로젝트 참여자', time: '',
        purpose: '개별 프로젝트를 자세히 설명하고, 함께 디벨롭하는 자리입니다.',
        agenda: ['프로젝트 배경·목표·현재 단계 설명', '아이디어 확장과 방향 디벨롭', '다음 단계 · 담당 · 마감 정리'],
        prep: ['관련 자료(시트·슬라이드) 링크 준비', '함께 논의하고 싶은 질문 2~3개'], note: '' },
      { name: '원온원', en: '1 on 1', cycle: '2주에 1회 또는 1달에 1회', who: '구성원 · 관리자 1:1', time: '',
        purpose: '강점을 탐색하고, 업무 피드백을 주고받는 자리입니다.',
        agenda: ['강점 탐색 — 내가 잘하고 즐기는 일 찾기', '업무 피드백 — 잘된 점과 더 나아질 점 주고받기', '강점 스피치 — 자신이 잘하는 것을 10분간 설명하기'],
        prep: ['최근 업무 중 잘된 일 · 어려웠던 일 1가지씩', '강점 스피치 주제 (내 차례일 때)'], note: '원온원 기록은 목표관리 › 원온원에 남습니다.' }
    ]
  };
  var MAX = 12, draft = null;

  function plan() {
    if (HR.cache.hr_plan_prg && !HR.cache.hr_plan_prg.loading && Date.now() - HR.cache.hr_plan_prg.at > 15000) HR.cache.hr_plan_prg.at = 0;
    return HR.load('hr_plan_prg', function () {
      return db.doc('hr_plan/program').get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : { _none: true }; });
    });
  }
  function copy(P) { return JSON.parse(JSON.stringify(P)); }
  function lines(t) { return String(t || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12); }
  function blank() { return { name: '', en: '', cycle: '', who: '', time: '', purpose: '', agenda: [], prep: [], note: '' }; }
  function two(n) { return n < 10 ? '0' + n : String(n); }

  /* ---------- 보기 ---------- */
  function card(p, i) {
    var meta = [['참석', p.who], ['시간', p.time]].filter(function (x) { return x[1]; });
    return h('li', { class: 'prg-card' },
      h('div', { class: 'prg-card-head' }, h('span', { class: 'prg-no', text: two(i + 1) }),
        h('div', { class: 'prg-name' }, h('h3', { text: p.name }), p.en ? h('span', { class: 'prg-en', text: p.en }) : null),
        p.cycle ? h('span', { class: 'prg-cycle', text: p.cycle }) : null),
      p.purpose ? h('p', { class: 'prg-purpose', text: p.purpose }) : null,
      meta.length ? h('dl', { class: 'prg-meta' }, meta.map(function (x) { return h('div', null, h('dt', { text: x[0] }), h('dd', { text: x[1] })); })) : null,
      (p.agenda || []).length || (p.prep || []).length ? h('div', { class: 'prg-cols' },
        (p.agenda || []).length ? h('div', null, h('b', { class: 'prg-sub', text: '이런 걸 해요' }), h('ul', { class: 'prg-list' }, p.agenda.map(function (t) { return h('li', { text: t }); }))) : null,
        (p.prep || []).length ? h('div', null, h('b', { class: 'prg-sub', text: '준비할 것' }), h('ul', { class: 'prg-list prg-prep' }, p.prep.map(function (t) { return h('li', { text: t }); }))) : null) : null,
      p.note ? h('p', { class: 'prg-note', text: p.note }) : null);
  }

  /* ---------- 편집 (관리자) ---------- */
  function editor() {
    var m = ui.msg();
    function bind(o, k) { return function () { o[k] = this.value; }; }
    function bindList(o, k) { return function () { o[k] = this.value.split('\n'); }; }
    function txt(o, k, label, max, ph) { return ui.field(label, ui.input({ value: o[k] || '', maxlength: String(max), placeholder: ph || '', oninput: bind(o, k) })); }
    function area(o, k, label, ph) {
      var t = h('textarea', { rows: '4', maxlength: '1200', placeholder: ph, oninput: bindList(o, k) }); t.value = (o[k] || []).join('\n');
      return ui.field(label, t);
    }
    var lead = h('textarea', { rows: '3', maxlength: '600', oninput: bind(draft, 'lead') }); lead.value = draft.lead || '';
    var list = h('ol', { class: 'prg-edit' });
    draft.programs.forEach(function (p, i) {
      var move = function (k) { return function () { var j = i + k; if (j < 0 || j >= draft.programs.length) return; var t = draft.programs[i]; draft.programs[i] = draft.programs[j]; draft.programs[j] = t; HR.refresh(); }; };
      list.appendChild(h('li', { class: 'panel prg-edit-item' + (p._del ? ' is-del' : '') },
        h('div', { class: 'prg-edit-top' }, h('span', { class: 'prg-no', text: two(i + 1) }),
          h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↑', 'aria-label': '위로', disabled: i === 0, onclick: move(-1) }),
          h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↓', 'aria-label': '아래로', disabled: i === draft.programs.length - 1, onclick: move(1) }),
          h('button', { type: 'button', class: 'btn btn-line btn-xs' + (p._del ? '' : ' danger'), text: p._del ? '되살리기' : '삭제', onclick: function () { p._del = !p._del; HR.refresh(); } })),
        h('div', { class: 'prg-edit-grid' },
          txt(p, 'name', '이름', 30, '예: 정기 업무미팅'), txt(p, 'en', '영문 (선택)', 40, '예: Regular Meeting'),
          txt(p, 'cycle', '주기', 40, '예: 매주 월요일 10시 · 2주에 1회'), txt(p, 'who', '참석', 40, '예: 전 구성원'),
          txt(p, 'time', '시간 · 장소 (선택)', 60, '예: 30분 · 회의실 / Google Meet')),
        txt(p, 'purpose', '어떤 자리인가요', 200, '한두 문장으로'),
        h('div', { class: 'prg-edit-grid' }, area(p, 'agenda', '이런 걸 해요 (한 줄에 하나)', '예: 회사 전체 현황 공유'), area(p, 'prep', '준비할 것 (한 줄에 하나)', '예: 내 업무 현황 정리')),
        txt(p, 'note', '메모 (선택)', 200, '예: 기록은 목표관리 › 원온원에 남습니다.')));
    });
    var save = ui.btn('저장', function () {
      var keep = draft.programs.filter(function (p) { return !p._del; }).map(function (p) {
        return { name: (p.name || '').trim(), en: (p.en || '').trim(), cycle: (p.cycle || '').trim(), who: (p.who || '').trim(), time: (p.time || '').trim(),
          purpose: (p.purpose || '').trim(), agenda: lines((p.agenda || []).join('\n')), prep: lines((p.prep || []).join('\n')), note: (p.note || '').trim() };
      });
      for (var k = 0; k < keep.length; k++) if (!keep[k].name) return ui.err(m, (k + 1) + '번째 프로그램의 이름을 입력하세요.');
      if (!keep.length) return ui.err(m, '프로그램이 하나 이상 있어야 합니다.');
      var out = { title: (draft.title || '').trim() || DEFAULT.title, lead: (draft.lead || '').trim(), programs: keep };
      db.doc('hr_plan/program').set({ json: JSON.stringify(out), updatedAt: FV.serverTimestamp(), by: S.mid })
        .then(function () { draft = null; HR.invalidate('hr_plan_prg'); ui.toast('필츠 프로그램을 저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    }, 'btn-sm');
    return h('div', { class: 'stack' },
      ui.panel('Edit · 필츠 프로그램 (관리자)', null,
        ui.field('제목', ui.input({ value: draft.title || '', maxlength: '40', oninput: bind(draft, 'title') })), ui.field('소개 문구', lead),
        h('p', { class: 'muted small', text: '↑ ↓로 순서를 바꾸고, 목록 칸은 한 줄에 하나씩 적으세요. 저장하면 구성원 화면에 바로 반영됩니다.' })),
      list,
      draft.programs.length < MAX ? ui.btn('+ 프로그램 추가', function () { draft.programs.push(blank()); HR.refresh(); }, 'btn-line btn-sm') : null,
      m, h('div', { class: 'row' }, save, ui.btn('취소', function () { draft = null; HR.refresh(); }, 'btn-line btn-sm')));
  }

  function render(view) {
    var P = plan();
    if (!P) return ui.put(view, ui.empty('불러오는 중…'));
    if (P._none) P = DEFAULT;
    if (S.isAdmin && draft) return ui.put(view, editor());
    var progs = P.programs || [];
    ui.put(view,
      h('section', { class: 'onb-hero' }, h('div', { class: 'onb-hero-top' }, h('span', { class: 'onb-kicker', text: 'FILLTS PROGRAM · 함께 일하는 리듬' }),
        S.isAdmin ? ui.btn('편집', function () { draft = copy(P); HR.refresh(); }, 'btn-sm onb-pdf') : null),
        h('h2', { text: P.title }), P.lead ? h('p', { text: P.lead }) : null,
        progs.length ? h('ul', { class: 'prg-rhythm' }, progs.map(function (p, i) {
          return h('li', null, h('span', { class: 'prg-rhythm-no', text: two(i + 1) }), h('b', { text: p.name }), p.cycle ? h('span', { text: p.cycle }) : null);
        })) : null),
      progs.length ? h('ol', { class: 'prg-cards' }, progs.map(card)) : ui.empty('아직 등록된 프로그램이 없습니다.'));
  }
  HR.program = { render: render };
})();

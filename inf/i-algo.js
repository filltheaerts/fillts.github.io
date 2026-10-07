/* fillts Influencer — 알고리즘: 점수 가중치 · 라이징 조건 · 카테고리 프리셋 · 소속 판정 규칙 · 커스텀 상담 메모
   저장: inf_config/main.algos{similar,rising} · presets[] · algoNotes[] — 서버(infYt)가 다음 탐색부터 가중치 · 조건을 읽어 쓴다 */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var V = I.V.algo = { editPreset: '' };
  function cfgSet(patch) { return db.doc('inf_config/main').set(Object.assign(patch, { updatedAt: FV.serverTimestamp(), updatedBy: S.mid }), { merge: true }); }

  var ALGOS = [
    { id: 'similar', name: '비슷한 채널', en: 'Similar', desc: '씨드 유튜버와 주제 · 규모 · 시청자 반응이 닮은 채널. 구독자 범위(1/3~3배 · 1/10~10배 · 전체)는 탐색 화면에서 고른다.',
      parts: [['kw', '키워드 일치', 32, '고른 컨셉 키워드가 채널 제목 · 설명 · 최근 영상 제목 · 태그에 있는 비율(65%) + 씨드 상위 키워드와 겹침(35%)'],
        ['sub', '구독자 규모', 22, '씨드와 구독자 수 차이 (로그 기준 — 20배 이상 차이면 0)'],
        ['tone', '댓글 톤', 20, '최근 영상 상위 댓글의 존댓말 · 반말 · 질문 · 칭찬 · ㅋㅋ · 이모지 · 부정 비율을 씨드와 비교'],
        ['topic', '주제', 14, '유튜브 주제 분류 · 영상 카테고리 일치'],
        ['eng', '참여율', 12, '중앙 조회수 ÷ 구독자 비율이 씨드와 비슷한 정도']] },
    { id: 'rising', name: '라이징', en: 'Rising', desc: '구독자는 작지만 지금 크고 있는 채널. 최근 N일 안에 올라온 영상만 검색하고, 구독 상한 아래 · 최소 구독 이상만 본다.',
      parts: [['kw', '키워드 일치', 30, '고른 컨셉 키워드 일치 + 씨드 키워드 겹침'],
        ['growth', '조회 추세', 25, '최근 5편 중앙 조회수 ÷ 그 이전 영상 중앙 조회수 (본편 · 올라온 지 14일 지난 영상 기준, 1배 ≈ 40점 · 2배 ≈ 80점 · 2.8배 이상 만점)'],
        ['cmt', '댓글 활발', 20, '영상당 중앙 댓글 수(200개 만점) + 조회 1천 회당 댓글 수(10개 만점)'],
        ['reach', '구독 대비 조회', 15, '중앙 조회수 ÷ 구독자 — 구독자 밖으로 노출되는 정도 (60% 이상 만점)'],
        ['tone', '댓글 톤', 10, '씨드와 댓글 말투 · 반응 비슷한 정도']] }
  ];
  I.ALGOS = ALGOS;
  I.algoCfg = function (id) { return ((I.cfg.algos || {})[id]) || {}; };
  I.algoWeights = function (id) {
    var a = ALGOS.filter(function (x) { return x.id === id; })[0], w = I.algoCfg(id).w || {};
    return a.parts.map(function (p) { return [p[0], p[1], w[p[0]] != null ? +w[p[0]] : p[2]]; });
  };

  function algoPanel(a) {
    var cfg = I.algoCfg(a.id), w = cfg.w || {}, msg = ui.msg();
    var inputs = {};
    var sumEl = h('b');
    var updSum = function () { var t = 0; Object.keys(inputs).forEach(function (k) { t += +inputs[k].value || 0; }); sumEl.textContent = t + '%'; sumEl.className = t === 100 ? '' : 'red'; };
    var rows = a.parts.map(function (p) {
      var inp = ui.input({ type: 'number', min: '0', max: '100', step: '1', value: String(w[p[0]] != null ? w[p[0]] : p[2]), class: 'in-w', oninput: updSum });
      inputs[p[0]] = inp;
      return h('tr', null, h('td', { class: 'strong', text: p[1] }), h('td', null, inp, ' %'), h('td', { class: 'meta', text: p[3] }), h('td', { class: 'meta', text: '기본 ' + p[2] + '%' }));
    });
    updSum();
    var extra = [];
    var maxSubs, minSubs, days;
    if (a.id === 'rising') {
      maxSubs = ui.input({ type: 'number', min: '1000', step: '1000', value: String(cfg.maxSubs || 100000) });
      minSubs = ui.input({ type: 'number', min: '0', step: '100', value: String(cfg.minSubs != null ? cfg.minSubs : 1000) });
      days = ui.input({ type: 'number', min: '7', max: '365', value: String(cfg.days || 90) });
      extra.push(h('div', { class: 'row' }, ui.field('기본 구독 상한 (미만)', maxSubs), ui.field('최소 구독', minSubs), ui.field('영상 검색 기간 (최근 N일)', days)));
    }
    var save = function () {
      var nw = {}, t = 0;
      Object.keys(inputs).forEach(function (k) { nw[k] = Math.max(0, Math.round(+inputs[k].value || 0)); t += nw[k]; });
      if (!t) return ui.err(msg, '가중치 합이 0입니다.');
      var d = { w: nw };
      if (a.id === 'rising') { d.maxSubs = Math.max(1000, +maxSubs.value || 100000); d.minSubs = Math.max(0, +minSubs.value || 0); d.days = Math.max(7, Math.min(365, +days.value || 90)); }
      var algos = {}; algos[a.id] = d;
      cfgSet({ algos: algos }).then(function () { ui.ok(msg, '저장했습니다. 다음 탐색부터 적용됩니다' + (t !== 100 ? ' (합계 ' + t + '% → 비율대로 100%로 맞춰 계산)' : '') + '.'); }).catch(function (e) { ui.fail(e, msg); });
    };
    var reset = function () { var algos = {}; algos[a.id] = {}; db.doc('inf_config/main').update(new firebase.firestore.FieldPath('algos', a.id), FV.delete()).then(function () { ui.toast('기본값으로 되돌렸습니다.'); }).catch(function () { cfgSet({ algos: algos }).catch(ui.fail); }); };
    return ui.panel(a.name + ' · ' + a.en, cfg.w ? ui.tag('커스텀 적용 중', 'red') : ui.tag('기본값', 'mute'),
      h('p', { class: 'note', text: a.desc }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table in-table in-algo' }, h('thead', null, h('tr', null, ['항목', '가중치', '측정 방법', ''].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, rows))),
      h('p', { class: 'meta' }, '합계 ', sumEl, ' — 100이 아니어도 비율대로 맞춰 계산합니다.'),
      extra, msg, h('div', { class: 'row' }, ui.btn('저장', save, 'btn-sm'), ui.confirmBtn('기본값으로', reset, 'btn-line btn-xs')));
  }

  function presetForm(p, list) {
    var name = ui.input({ value: p.name || '', maxlength: '30', placeholder: '예: 임신 · 육아' });
    var mode = ui.select(ALGOS.map(function (a) { return [a.id, a.name]; }), p.mode || 'rising');
    var maxSubs = ui.input({ type: 'number', min: '1000', step: '1000', value: String(p.maxSubs || 100000) });
    var kws = ui.input({ value: (p.keywords || []).join(', '), maxlength: '200', placeholder: '쉼표로 구분, 5개까지' });
    var desc = ui.input({ value: p.desc || '', maxlength: '200', placeholder: '이 프리셋이 찾는 채널 한 줄 설명' });
    var msg = ui.msg();
    var save = function () {
      var k = kws.value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5);
      if (!name.value.trim() || !k.length) return ui.err(msg, '이름과 키워드(1~5개)를 넣으세요.');
      var np = { id: p.id || 'p' + Date.now().toString(36), name: name.value.trim(), mode: mode.value, maxSubs: String(Math.max(1000, +maxSubs.value || 100000)), keywords: k, desc: desc.value.trim() };
      var next = list.filter(function (x) { return x.id !== np.id; }), i = list.map(function (x) { return x.id; }).indexOf(np.id);
      if (i >= 0) next.splice(i, 0, np); else next.push(np);
      cfgSet({ presets: next.slice(0, 20) }).then(function () { V.editPreset = ''; ui.toast('프리셋을 저장했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
    };
    return h('div', { class: 'stack sm in-form in-tpl' },
      h('div', { class: 'row' }, ui.field('카테고리 이름', name, 'grow'), ui.field('알고리즘', mode), ui.field('구독 상한 (라이징)', maxSubs)),
      ui.field('컨셉 키워드', kws), ui.field('설명', desc), msg,
      h('div', { class: 'row' }, ui.btn('저장', save, 'btn-sm'), ui.btn('취소', function () { V.editPreset = ''; HR.refresh(); }, 'btn-line btn-sm'),
        p.id ? ui.confirmBtn('삭제', function () { cfgSet({ presets: list.filter(function (x) { return x.id !== p.id; }) }).then(function () { V.editPreset = ''; }).catch(ui.fail); }) : null));
  }
  function presetPanel() {
    var list = I.presetList().slice();
    var body = list.map(function (p) {
      if (V.editPreset === p.id) return presetForm(p, list);
      return h('div', { class: 'in-tpl' }, h('div', { class: 'row' }, h('b', { class: 'grow', text: p.name }), ui.tag(p.mode === 'rising' ? '라이징 · 구독 ' + I.cnt(+p.maxSubs) + ' 미만' : '비슷한 채널'),
        ui.btn('수정', function () { V.editPreset = p.id; HR.refresh(); }, 'btn-line btn-xs')),
        I.chips(p.keywords, 'light'), p.desc ? h('p', { class: 'meta', text: p.desc }) : null);
    });
    if (V.editPreset === 'new') body.push(presetForm({}, list));
    return ui.panel('카테고리 프리셋', V.editPreset ? null : ui.btn('+ 카테고리', function () { V.editPreset = 'new'; HR.refresh(); }, 'btn-sm'),
      h('p', { class: 'note', text: '탐색 화면 「카테고리 프리셋」 버튼 하나로 알고리즘 · 구독 상한 · 컨셉 키워드를 한 번에 채웁니다. 뷰티 · 클렌징 · 육아템 리뷰처럼 자주 찾는 주제를 만들어 두세요.' }),
      !(I.cfg.presets && I.cfg.presets.length) ? h('p', { class: 'meta', text: '지금은 기본 프리셋입니다. 하나라도 저장하면 이 목록이 팀 공용이 됩니다.' }) : null, body);
  }
  function agencyPanel() {
    var rows = [['소속 100% (확실)', 'MCN · 소속사 이름(샌드박스 · 레페리 · 트레져헌터 · 다이아티비 등)이 설명란 · 메일에 있음 / 회사 도메인 메일(ent · agency · creator · media · studio 등) / 설명란에 소속사 · 매니지먼트 · 엔터테인먼트 · (주) · 주식회사 · Inc.'],
      ['소속 50% (애매)', '개인 메일(gmail · naver · daum 등)이 아닌 도메인 메일만 있음 — 본인 도메인일 수도 / 「비즈니스 · 광고 · 협찬 문의」 「담당자」 「매니저」 표현만 있음'],
      ['개인', '개인 메일만 있음, 또는 설명란에 연락처 · 회사 정보가 없음 (유튜브 정보 탭의 비공개 메일은 탐색으로 읽을 수 없어 직접 확인)']];
    return ui.panel('소속 / 개인 판정 규칙', null, h('ul', { class: 'list' }, rows.map(function (r) { return h('li', null, h('b', { class: 'in-algo-k', text: r[0] }), h('span', { class: 'grow meta', text: r[1] })); })),
      h('p', { class: 'note', text: '근거는 채널 설명란(앞 600자)과 메일 주소입니다. 판정 단어를 더하거나 빼려면 아래 상담 메모에 남겨 주세요.' }));
  }
  function notesPanel() {
    var notes = (I.cfg.algoNotes || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var t = h('textarea', { rows: '3', maxlength: '1000', placeholder: '예: 육아 채널은 엄마 시청자 비율이 보이는 「육아템 질문」 댓글을 더 높게 쳐 줘 · 구독 5천 미만은 빼 줘 · 인스타 팔로워도 같이 보고 싶어' });
    var msg = ui.msg();
    var add = function () {
      var v = t.value.trim(); if (!v) return;
      cfgSet({ algoNotes: FV.arrayUnion({ t: v, by: S.mid, at: Date.now(), done: false }) }).then(function () { t.value = ''; ui.ok(msg, '남겼습니다. Claude와 상담할 때 이 목록을 보고 알고리즘에 반영합니다.'); }).catch(function (e) { ui.fail(e, msg); });
    };
    return ui.panel('커스텀 요청 · 상담 메모', h('span', { class: 'meta', text: notes.length + '건' }),
      h('p', { class: 'note', text: '알고리즘에 더하고 싶은 기준 · 조건을 적어 두세요. 가중치 · 조건 · 프리셋은 위에서 바로 바꿀 수 있고, 새 측정 항목(예: 인스타 팔로워, 영상 길이, 특정 단어가 들어간 댓글 비율)은 상담 후 서버 알고리즘에 추가합니다.' }),
      ui.field('요청', t), msg, h('div', { class: 'row' }, ui.btn('남기기', add, 'btn-sm')),
      notes.length ? h('ul', { class: 'in-timeline' }, notes.map(function (n) {
        return h('li', { class: n.done ? 'k-stage' : 'k-mail' }, h('span', { class: 'in-tl-dot' }),
          h('div', { class: 'grow' }, h('div', { text: n.t }), h('div', { class: 'meta', text: HR.name(n.by) + ' · ' + fmt.dot(new Date(n.at + 9 * 3600000).toISOString().slice(0, 10)) + (n.done ? ' · 반영 완료' : ' · 상담 대기') })));
      })) : null);
  }
  HR.register('algo', { render: function (view) {
    ui.put(view, ui.head('Algorithm', '알고리즘'),
      h('p', { class: 'note in-algo-intro', text: '탐색 점수가 어떻게 매겨지는지 한 곳에 모았습니다. 가중치 · 조건 · 카테고리를 바꾸면 다음 탐색부터 반영되고, 이미 저장된 탐색 결과는 그대로입니다.' }),
      h('div', { class: 'in-two' }, h('div', { class: 'stack' }, algoPanel(ALGOS[1]), algoPanel(ALGOS[0])), h('div', { class: 'stack' }, presetPanel(), agencyPanel(), notesPanel())));
  } });
})();

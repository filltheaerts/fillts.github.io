/* fillts Influencer — 구조화: 소구점 줄기별로 어떤 키워드를 타고 들어가 찾을지 · 무엇을 제외할지
   · 줄기(branches): 기본값은 바인그라피 브랜드(hr_plan/brand) 기준, 고치면 inf_config/main.branches (팀 공용)
   · 「이 줄기로 찾기」 → 조건 탐색 탭에 키워드를 채워 이동
   · 제외 주제(blockTopics) · 제외 유튜버(blockCh) → 서버(infYt scan)가 모든 탐색에서 뺀다 */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var V = I.V.tree = { edit: '', topic: '', ch: '', msg: '', err: false };

  var BRANCHES = [
    { id: 'cleanse', name: '클렌징 · 세안', tag: '본품', msg: '「포드득 — 떼어내되, 남긴다」 · 60초 세안법 · 스킨케어 0단계',
      chain: ['클렌징 루틴', '약산성 클렌저', '이중세안', '세안법', '클렌징젤 추천'], who: '세안 습관을 바꾸려는 30~50대, 「뽀드득」이 손상 신호인 걸 모르는 사람', note: '본품 카테고리 — 가장 먼저, 가장 많이' },
    { id: 'procedure', name: '시술 · 피부과', tag: '진정 · 장벽', msg: '시술 뒤 예민한 피부에 자극 없이 — 남길 것은 남기는 리저브 클렌징',
      chain: ['피부과 시술 후기', '레이저 후 관리', '시술 후 세안', '피부 장벽', '홈케어 루틴'], who: '리프팅 · 레이저 등 시술을 받고 관리하는 30~40대', note: '「치료 · 재생」 같은 의약품 오인 표현 금지 — 사용감 · 순함으로만 말하기' },
    { id: 'mom', name: '육아 · 엄마', tag: '나만의 시간', msg: '「그녀를 행복하게!」 — 육퇴 후 하루 두 번, 나를 위한 60초',
      chain: ['육아맘 일상', '육퇴 후 루틴', '엄마 자기관리', '워킹맘 브이로그', '둥이맘'], who: '아이를 키우며 자기 시간을 아끼는 30~40대 엄마', note: '육아만 하는 채널보다 엄마 본인의 뷰티 · 관리 영상이 있는 채널 (뷰티 마크 확인)' },
    { id: 'empathy', name: '공감 · 자기 돌봄', tag: '정서', msg: '사치가 아니라 자기 돌봄 — 「1년에 700번 넘게 하는 일인데 여기에만 무신경했네」',
      chain: ['30대 일상 브이로그', '나를 위한 루틴', '셀프케어', '번아웃 회복', '나이트루틴'], who: '공감형 댓글이 많은 일상 채널의 30~50대 여성 시청자', note: '공감 ㅠㅠ · 칭찬 댓글 비율이 높은 채널이 잘 맞음 (댓글 톤 확인)' },
    { id: 'ingredient', name: '성분 · 클린뷰티', tag: '증명', msg: '전성분 1번이 포도 — 포도과실수 48% 젤 · 포도씨오일 1번 오일',
      chain: ['전성분 분석', '화장품 성분', '클린뷰티', '순한 화장품', '성분 리뷰'], who: '성분표를 읽고 따지는 소비자', note: '처방표 · 시험 결과를 먼저 보내면 설득력이 크다' },
    { id: 'premium', name: '프리미엄 · 감도', tag: '3~5만원', msg: '1~2만원의 권태와 10만원대 동경 사이 — 감도 있는 데일리 프리미엄',
      chain: ['화장대 소개', '내돈내산 인생템', '백화점 화장품', '미니멀 라이프', '스킨케어 하울'], who: '좋은 걸 골라 사는, 미감 있는 30~55세', note: '자연광 · 미니멀 톤의 채널과 브랜드 무대가 잘 맞는다' },
    { id: 'sensitive', name: '민감 · 트러블', tag: '순함', msg: '세안 후 당기지 않는 약산성 — 예민한 날에도 쓰는 클렌저',
      chain: ['민감성 피부', '저자극 클렌저', '홍조 피부', '피부 당김', '약산성 세안'], who: '민감 · 건조 · 홍조 고민이 있는 사람', note: '「여드름 개선」 등 기능성 효능 표현 금지' }
  ];
  var DEF_TOPICS = ['재테크', '짠테크', '가계부', '주식', '부동산', '코인', '도박'];   // 서버 기본값과 같게 (「투자 · 절약」은 재테크 필터가 비율로 판단)
  var RULES = ['뒷광고 · 광고 미표시 이력', '정치 · 혐오 · 선정적 콘텐츠', '경쟁 클렌저 브랜드 전속 · 장기 계약 중', '과장된 비포 · 애프터, 의약품 오인 표현을 반복', '구독자 대비 조회가 지나치게 낮음(구매 구독 의심)', '댓글이 막혀 있거나 반응이 거의 없음'];

  function cfgSet(patch) { return db.doc('inf_config/main').set(Object.assign(patch, { updatedAt: FV.serverTimestamp(), updatedBy: S.mid }), { merge: true }).catch(ui.fail); }
  I.branchList = function () { return I.cfg.branches && I.cfg.branches.length ? I.cfg.branches : BRANCHES; };
  function topics() { return I.cfg.blockTopics || DEF_TOPICS; }
  function blocked() { return I.cfg.blockCh || []; }
  I.blockChannel = function (c, why) {
    var list = blocked().filter(function (x) { return x.id !== c.id; });
    list.push({ id: c.id, handle: c.handle || '', title: c.title || '', why: why || '', by: S.mid, at: Date.now() });
    return cfgSet({ blockCh: list.slice(-300) }).then(function () { ui.toast('「' + (c.title || c.handle) + '」을(를) 제외 유튜버에 넣었습니다 — 다음 탐색부터 빠집니다.'); });
  };
  function goFind(br) {
    var F = I.V.find; if (!F) return;
    F.cond.kw = br.chain.slice(0, 5); F.cond.preset = ''; F.cond.fitOn = true;
    HR.go('find/cond');
    ui.toast('「' + br.name + '」 줄기 키워드를 조건 탐색에 넣었습니다 — 조건을 확인하고 찾으세요.');
  }

  function branchCard(br, list) {
    if (V.edit === br.id) return branchForm(br, list);
    return h('section', { class: 'in-br' },
      h('div', { class: 'in-br-head' }, h('b', { class: 'in-br-name', text: br.name }), br.tag ? h('span', { class: 'tag in-br-tag', text: br.tag }) : null,
        h('span', { class: 'grow' }), ui.btn('수정', function () { V.edit = br.id; HR.refresh(); }, 'btn-line btn-xs')),
      h('p', { class: 'in-br-msg', text: br.msg }),
      h('div', { class: 'in-br-chain' }, br.chain.map(function (k, i) { return [i ? h('span', { class: 'in-br-arrow', text: '→' }) : null, h('span', { class: 'in-chip', text: k })]; })),
      br.who ? h('p', { class: 'meta', text: '누구에게: ' + br.who }) : null,
      br.note ? h('p', { class: 'meta in-br-note', text: '주의 · 팁: ' + br.note }) : null,
      h('div', { class: 'row' }, ui.btn('🔎 이 줄기로 찾기', function () { goFind(br); }, 'btn-sm'),
        h('button', { type: 'button', class: 'btn btn-line btn-sm', text: '+ 랜덤 탐색 커스텀에 넣기', onclick: function () {
          var cur = (I.cfg.randomKw || []).slice(); br.chain.forEach(function (k) { if (cur.indexOf(k) < 0) cur.push(k); });
          db.doc('inf_config/main').set({ randomKw: cur.slice(0, 60) }, { merge: true }).then(function () { ui.toast('랜덤 탐색 커스텀 키워드에 넣었습니다.'); }).catch(ui.fail);
        } })));
  }
  function branchForm(br, list) {
    var name = ui.input({ value: br.name || '', maxlength: '30' });
    var tag = ui.input({ value: br.tag || '', maxlength: '20', placeholder: '예: 진정 · 장벽' });
    var msg = ui.input({ value: br.msg || '', maxlength: '200', placeholder: '이 줄기에서 전할 소구 메시지' });
    var chain = ui.input({ value: (br.chain || []).join(' → '), maxlength: '300', placeholder: '키워드를 → 또는 쉼표로 — 앞에서 뒤로 타고 들어갈 순서' });
    var who = ui.input({ value: br.who || '', maxlength: '200' });
    var note = ui.input({ value: br.note || '', maxlength: '300' });
    var m = ui.msg();
    var save = function () {
      var ch = chain.value.split(/→|,|，/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 8);
      if (!name.value.trim() || !ch.length) return ui.err(m, '이름과 키워드를 넣으세요.');
      var nb = { id: br.id || 'b' + Date.now().toString(36), name: name.value.trim(), tag: tag.value.trim(), msg: msg.value.trim(), chain: ch, who: who.value.trim(), note: note.value.trim() };
      var next = list.filter(function (x) { return x.id !== nb.id; }), i = list.map(function (x) { return x.id; }).indexOf(nb.id);
      if (i >= 0) next.splice(i, 0, nb); else next.push(nb);
      cfgSet({ branches: next.slice(0, 30) }).then(function () { V.edit = ''; ui.toast('줄기를 저장했습니다.'); });
    };
    return h('section', { class: 'in-br in-br-edit' }, h('div', { class: 'stack sm in-form' },
      h('div', { class: 'row' }, ui.field('줄기 이름', name, 'grow'), ui.field('태그', tag)), ui.field('소구 메시지', msg), ui.field('키워드 줄기 (순서대로)', chain),
      ui.field('누구에게', who), ui.field('주의 · 팁', note), m,
      h('div', { class: 'row' }, ui.btn('저장', save, 'btn-sm'), ui.btn('취소', function () { V.edit = ''; HR.refresh(); }, 'btn-line btn-sm'),
        br.id ? ui.confirmBtn('삭제', function () { cfgSet({ branches: list.filter(function (x) { return x.id !== br.id; }) }).then(function () { V.edit = ''; }); }) : null)));
  }

  function excludePanel() {
    var tp = topics(), bl = blocked();
    var tIn = ui.input({ value: V.topic, maxlength: '60', placeholder: '제외할 주제 단어 — Enter (쉼표로 여러 개) 예: 다이어트 보조제, 명품 하울',
      oninput: function () { V.topic = this.value; }, onkeydown: function (e) {
        if (e.key === 'Enter' && this.value.trim()) { var cur = tp.slice(); this.value.split(/[,，]/).forEach(function (w) { w = w.trim(); if (w && cur.indexOf(w) < 0) cur.push(w); }); V.topic = ''; cfgSet({ blockTopics: cur.slice(0, 60) }); }
      } });
    var cIn = ui.input({ value: V.ch, maxlength: '120', placeholder: '제외할 유튜버 @핸들 또는 채널 ID(UC…) — Enter', oninput: function () { V.ch = this.value; },
      onkeydown: function (e) {
        if (e.key !== 'Enter' || !this.value.trim()) return;
        var v = this.value.trim(), m = v.match(/(UC[\w-]{22})/), hd = v.match(/(@[^\s/?#]+)/);
        var it = m ? { id: m[1] } : hd ? { id: '', handle: decodeURIComponent(hd[1]) } : null;
        if (!it) return ui.toast('@핸들이나 채널 ID(UC…)를 넣으세요. 탐색 결과에서는 「제외」 버튼으로 바로 넣을 수 있습니다.');
        V.ch = ''; cfgSet({ blockCh: bl.concat([Object.assign(it, { title: it.handle || it.id, why: '직접 입력', by: S.mid, at: Date.now() })]).slice(-300) });
      } });
    return ui.panel('제외 — 이런 유튜버는 탐색에 안 들어오게', h('span', { class: 'meta', text: '모든 탐색(비슷한 · 조건 · 랜덤)에 서버가 적용' }),
      h('div', { class: 'label in-sub', text: '1 · 제외 주제 — 채널 이름 · 소개에 있거나 최근 영상 제목에 2번 이상 나오면 뺌' }),
      h('div', { class: 'in-chips' }, tp.map(function (w) {
        return h('button', { type: 'button', class: 'in-chip in-ex-chip', title: '누르면 제외 목록에서 지움', text: w + ' ×', onclick: function () { cfgSet({ blockTopics: tp.filter(function (x) { return x !== w; }) }); } });
      })), tIn,
      h('p', { class: 'meta', text: '재테크 · 절약 · 투자 채널은 이 목록과 별개로 「재테크 · 절약 채널 빼기」(조건 · 랜덤 탐색 기본 켬)로도 걸러집니다.' }),
      h('div', { class: 'label in-sub', text: '2 · 제외 유튜버 (' + bl.length + ')' }),
      bl.length ? h('ul', { class: 'list' }, bl.slice().reverse().map(function (x) {
        return h('li', null, h('div', { class: 'grow' }, h('div', { class: 'strong', text: x.title || x.handle || x.id }), h('div', { class: 'meta', text: [x.handle, x.why, x.by ? HR.name(x.by) : '', x.at ? fmt.dot(new Date(x.at + 9 * 3600000).toISOString().slice(0, 10)) : ''].filter(Boolean).join(' · ') })),
          x.id ? I.extLink('https://www.youtube.com/channel/' + x.id, '▶', 'in-yt') : null,
          h('button', { type: 'button', class: 'in-mv', text: '풀기', onclick: function () { cfgSet({ blockCh: bl.filter(function (y) { return y !== x; }) }); } }));
      })) : h('p', { class: 'meta', text: '아직 없습니다. 탐색 결과에서 행을 펼쳐 「제외 유튜버로」를 누르거나 아래에 @핸들을 넣으세요.' }), cIn,
      h('div', { class: 'label in-sub', text: '3 · 제외 기준 — 컨택 전에 확인' }),
      h('ul', { class: 'in-rules' }, RULES.map(function (r) { return h('li', { text: r }); })));
  }

  function render(view) {
    var list = I.branchList();
    ui.put(view,
      ui.head('Structure', '구조화', h('span', { class: 'meta', text: '소구점 줄기 → 키워드 → 탐색 · 그리고 제외' })),
      h('p', { class: 'note in-st-intro', text: '바인그라피의 소구점마다 어떤 키워드를 타고 들어가 유튜버를 찾을지 줄기로 정리했습니다. 「이 줄기로 찾기」를 누르면 조건 탐색으로 바로 넘어가고, 아래 제외 목록은 모든 탐색에 자동으로 적용됩니다.' }),
      h('div', { class: 'in-br-grid' }, list.map(function (br) { return branchCard(br, list); }),
        V.edit === 'new' ? branchForm({ chain: [] }, list) : h('button', { type: 'button', class: 'in-br in-br-add', text: '+ 줄기 추가', onclick: function () { V.edit = 'new'; HR.refresh(); } })),
      !(I.cfg.branches && I.cfg.branches.length) ? h('p', { class: 'meta', text: '지금은 브랜드 정보 기준 기본 줄기 7개입니다. 하나라도 고쳐 저장하면 그때부터 팀 공용 목록이 됩니다.' }) : null,
      excludePanel());
  }
  HR.register('tree', { render: function (view) { render(view); } });
})();

/* fillts D2C — [CRM] 구조설계 · 메시지
   구조설계(crmdesign): 한 화면에 한 문항(심리테스트처럼) 10문항 → 답에 맞춘 메시지 퍼널(단계 · 시점 · 채널 · 정보성/광고성 · 목적 · 지표)
   메시지(crmmsg): 퍼널 단계별 문안 — 답에서 자동 생성, 고치면 d2c_msgs/{단계id}에 저장, 복사 버튼 · (광고) 표기 · 수신거부 · 글자 수 · 금지어 검사
   답은 d2c_docs/crm { answers, step, done, updatedAt } */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, db = HR.db;
  var FV = firebase.firestore.FieldValue;
  var R = { doc: null, msgs: {}, loaded: false, step: null, local: null };
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    if (prevStart) prevStart(sub);
    sub(db.doc('d2c_docs/crm'), function (s) { R.doc = s.exists ? s.data() : {}; R.loaded = true; });
    sub(db.collection('d2c_msgs'), function (s) { var m = {}; HR.rows(s).forEach(function (r) { m[r.id] = r; }); R.msgs = m; });
  };
  var canEdit = function () { return S.isAdmin || HR.appLevel('d2c') === 'edit'; };

  /* ---------- 문항 (첫 보기 = 추천) ---------- */
  var Q = [
    { id: 'welcome', q: '처음 가입한 사람에게 무엇을 줄까요?', why: '혜택이 하나여야 헷갈리지 않습니다. 가입 직후 7일 안에 쓰게 하면 첫 구매가 빨라집니다.',
      a: [['coupon', '첫 구매 쿠폰 10%', '가장 흔하고 이해가 쉬움'], ['point', '적립금 3,000원', '할인 인상을 덜 줌 · 재방문 유도'], ['ship', '무료배송만', '혜택이 약함 — 가격이 이미 낮을 때'], ['none', '없음', '브랜드 톤 우선']] },
    { id: 'cycle', q: '150ml 한 통을 다 쓰는 데 얼마나 걸린다고 볼까요?', why: '재구매 리마인드 날짜가 여기서 정해집니다. 실제 주문 데이터가 쌓이면 「재구매 분석」의 간격으로 다시 맞춥니다.',
      a: [['49', '약 7주 (하루 2회 · 1회 1.3ml)', '기본값'], ['35', '약 5주 (넉넉히 쓰는 사람)', ''], ['63', '약 9주 (하루 1회)', '']] },
    { id: 'sub', q: '정기배송은 언제부터 할까요?', why: '카페24 정기배송은 PG 심사가 필요해 오픈일에 못 맞출 수 있습니다.',
      a: [['open', '오픈부터', '심사가 끝났을 때'], ['later', '2차 오픈 (심사 끝나면)', '현실적인 기본값'], ['no', '하지 않음', '']] },
    { id: 'review', q: '리뷰에 보상을 줄까요?', why: '클렌저는 1~2주 써봐야 세정력을 말할 수 있어 「2주 후기」를 따로 받습니다. 보상을 주면 리뷰에 그 사실을 표시해야 합니다.',
      a: [['both', '텍스트 500원 + 2주 포토 2,000원', '기본값'], ['photo', '포토 후기만 2,000원', ''], ['none', '보상 없음', '']] },
    { id: 'channel', q: '광고성 메시지는 주로 어디로 보낼까요?', why: '알림톡엔 광고를 넣을 수 없습니다. 친구톡은 2025년 말 종료돼 카톡 광고는 「브랜드 메시지」입니다.',
      a: [['brand', '카카오 브랜드 메시지 (채널 친구)', '열람률이 높음 · 기본값'], ['lms', '문자(LMS)', '카톡 수신거부자'], ['email', '이메일 위주', '비용 거의 없음 · 장문']] },
    { id: 'freq', q: '광고 메시지는 한 사람에게 얼마나 보낼까요?', why: '프리미엄 클린뷰티 톤을 지키려면 적게 보냅니다. 정보성(주문 · 배송 · 사용법)은 횟수에 넣지 않습니다.',
      a: [['w1', '주 1회 · 월 3회까지', '기본값'], ['m2', '월 2회까지', '아주 조용한 브랜드'], ['w2', '주 2회 · 월 6회까지', '프로모션이 많을 때']] },
    { id: 'cart', q: '장바구니에 담고 안 산 사람에게 보낼까요?', why: '장바구니 리마인드는 광고성입니다. 할인을 주면 「기다리면 할인」을 배웁니다.',
      a: [['yes', '보낸다 — 2~4시간 뒤 1회, 할인 없이', '기본값'], ['no', '보내지 않는다', '']] },
    { id: 'winback', q: '한동안 안 사는 사람(윈백)에게는?', why: '바로 할인부터 주면 할인 반응 고객만 남습니다.',
      a: [['soft', '먼저 안부(혜택 없음) → 다음에 10% 쿠폰', '기본값'], ['coupon', '처음부터 10% 쿠폰', ''], ['sample', '샘플(파우치) 동봉 제안', '']] },
    { id: 'oil', q: '두 번째 제품(클렌징 오일) 출시는?', why: '출시 2~3개월 전부터 대기 신청을 받으면 기존 구매자에게 먼저 알릴 수 있습니다.',
      a: [['3m', '3개월 안', '대기 리스트 바로 시작'], ['6m', '6개월 안', '기본값'], ['tbd', '아직 미정', '']] },
    { id: 'tone', q: '메시지 말투는?', why: '모든 문안이 이 말투로 만들어집니다. 화장품 광고 금지어(진정 · 재생 · 항염 등)는 말투와 상관없이 빠집니다.',
      a: [['calm', '차분하고 전문적으로 — 성분 · 근거 중심', '기본값'], ['warm', '다정하고 친근하게', ''], ['short', '짧고 간결하게', '']] }
  ];
  var DEF = {}; Q.forEach(function (q) { DEF[q.id] = q.a[0][0]; }); DEF.cycle = '49'; DEF.sub = 'later'; DEF.oil = '6m';
  var answers = function () { return Object.assign({}, DEF, (R.doc && R.doc.answers) || {}, R.local || {}); };
  var label = function (qid, v) { var q = Q.filter(function (x) { return x.id === qid; })[0]; var a = q && q.a.filter(function (x) { return x[0] === v; })[0]; return a ? a[1] : v; };
  function save(patch) {
    R.local = Object.assign(R.local || {}, patch.answers || {});
    if (!canEdit()) return;
    patch.updatedAt = FV.serverTimestamp(); patch.updatedBy = S.mid || '';
    db.doc('d2c_docs/crm').set(patch, { merge: true }).catch(function (e) { ui.toast('저장하지 못했습니다 — ' + (e.code || e.message)); });
  }

  /* ---------- 퍼널 만들기 ---------- */
  function funnel(A) {
    var cyc = +A.cycle || 49, wk = Math.round(cyc / 7), F = [];
    var add = function (o) { F.push(o); };
    add({ id: 'welcome', stage: '1 가입', name: '가입 환영', when: '가입 직후 (D0)', ch: '알림톡', ad: false, goal: '혜택 안내 · 브랜드 첫인상', kpi: '가입 → 14일 내 첫 구매율' });
    if (A.welcome !== 'none') add({ id: 'welcome2', stage: '1 가입', name: '첫 구매 혜택 만료 예고', when: '가입 D+5 · 미구매자', ch: A.channel === 'lms' ? '문자(LMS)' : A.channel === 'email' ? '이메일' : '브랜드 메시지', ad: true, goal: '첫 구매 전환', kpi: '쿠폰 사용률' });
    if (A.cart === 'yes') add({ id: 'cart', stage: '1 가입', name: '장바구니 리마인드', when: '담고 2~4시간 뒤 · 1회', ch: A.channel === 'email' ? '이메일' : '브랜드 메시지', ad: true, goal: '이탈 회수 (할인 없음)', kpi: '장바구니 회수율' });
    add({ id: 'ship', stage: '2 첫 구매', name: '출고 · 사용법 요약', when: '출고 당일', ch: '알림톡', ad: false, goal: '배송 문의 예방 · 첫 사용 안내', kpi: '배송 문의율' });
    add({ id: 'howto', stage: '3 사용 경험', name: '사용법 (D+3)', when: '배송 완료 D+3', ch: '알림톡', ad: false, goal: '올바른 사용 → 만족', kpi: '사용법 클릭률' });
    if (A.review !== 'none' && A.review !== 'photo') add({ id: 'review', stage: '3 사용 경험', name: '리뷰 요청', when: '배송 완료 D+8', ch: '알림톡', ad: false, goal: '첫 리뷰 확보', kpi: '리뷰 작성률' });
    if (A.review !== 'none') add({ id: 'review14', stage: '3 사용 경험', name: '2주 사용 후기', when: '배송 완료 D+14 · 미작성자', ch: '알림톡', ad: false, goal: '포토 후기(세정력 체감 후)', kpi: '포토 리뷰 수' });
    add({ id: 're1', stage: '4 재구매', name: '곧 다 써갈 때', when: '첫 구매 D+' + (cyc - 14) + ' (소진 2주 전)', ch: A.channel === 'lms' ? '문자(LMS)' : A.channel === 'email' ? '이메일' : '브랜드 메시지', ad: true, goal: '재구매 상기', kpi: '60일 재구매율' });
    add({ id: 're2', stage: '4 재구매', name: '2개 세트 · 정기배송 제안', when: '첫 구매 D+' + cyc + ' (약 ' + wk + '주)', ch: A.channel === 'lms' ? '문자(LMS)' : '브랜드 메시지', ad: true, goal: '재구매 단위 키우기' + (A.sub !== 'no' ? ' · 정기 전환' : ''), kpi: '90일 2회차 전환율' });
    if (A.welcome === 'point' || A.review !== 'none') add({ id: 'point', stage: '4 재구매', name: '적립금 소멸 예고', when: '소멸 D-7', ch: '알림톡', ad: false, goal: '사실만 알림(쿠폰 넣으면 광고)', kpi: '알림 후 7일 내 구매율' });
    if (A.sub !== 'no') add({ id: 'subpay', stage: '4 재구매', name: '정기결제 D-3 · 미루기 안내', when: '정기결제 3일 전', ch: '알림톡', ad: false, goal: '남았으면 미루기 → 해지 방지', kpi: '월 해지율' });
    add({ id: 'win1', stage: '5 윈백', name: A.winback === 'coupon' ? '다시 만나요 쿠폰' : A.winback === 'sample' ? '샘플 동봉 제안' : '피부 안부', when: '마지막 구매 D+70', ch: A.channel === 'email' ? '이메일' : '브랜드 메시지', ad: A.winback !== 'soft', goal: A.winback === 'soft' ? '혜택 없이 관계 유지' : '재활성화', kpi: '윈백 재구매율' });
    if (A.winback === 'soft') add({ id: 'win2', stage: '5 윈백', name: '다시 만나요 10% 쿠폰', when: '마지막 구매 D+90 · 14일 유효', ch: A.channel === 'email' ? '이메일' : '브랜드 메시지', ad: true, goal: '재활성화', kpi: '윈백 재구매율' });
    if (A.oil !== 'tbd') add({ id: 'oil', stage: '5 윈백', name: '클렌징 오일 출시 · 선공개', when: A.oil === '3m' ? '출시 48시간 전 (기존 구매자)' : '출시 2~3개월 전 대기 신청 → 출시 48시간 전', ch: '브랜드 메시지', ad: true, goal: '더블클렌징 크로스셀', kpi: '기존 구매자 오일 구매율' });
    add({ id: 'birthday', stage: '5 윈백', name: '생일', when: '생일 7일 전', ch: '브랜드 메시지', ad: true, goal: '관계 · 재방문', kpi: '생일 쿠폰 사용률' });
    add({ id: 'consent', stage: '공통', name: '수신동의 재확인', when: '동의일 + 23개월', ch: '알림톡', ad: false, goal: '법정 2년 재확인 (광고 섞지 않음)', kpi: '재동의율' });
    return F;
  }
  var STAGES = ['1 가입', '2 첫 구매', '3 사용 경험', '4 재구매', '5 윈백', '공통'];
  var CAP = { w1: '광고 메시지 1인 주 1회 · 월 3회', m2: '광고 메시지 1인 월 2회', w2: '광고 메시지 1인 주 2회 · 월 6회' };

  /* ---------- 문안 만들기 (말투별) ---------- */
  function draft(st, A) {
    var t = A.tone, warm = t === 'warm', short = t === 'short';
    var hi = warm ? '#{고객명}님, 반가워요 :)' : short ? '#{고객명}님,' : '#{고객명}님, 안녕하세요. 바인그라피입니다.';
    var ben = A.welcome === 'coupon' ? '첫 구매 10% 쿠폰' : A.welcome === 'point' ? '적립금 3,000원' : A.welcome === 'ship' ? '첫 구매 무료배송' : '';
    var cyc = +A.cycle || 49, wk = Math.round(cyc / 7);
    var M = {
      welcome: [hi, '', '바인그라피 회원이 되신 것을 환영합니다.', ben ? ben + '이 지급되었어요. (7일 안에 사용할 수 있어요)' : '', '', '▶ 젤클렌저 보러 가기 #{링크}'],
      welcome2: [hi, '', ben + '이 #{만료일}에 사라져요.', short ? '' : '세안 후 당김이 적은 포도 클린 젤클렌저, 처음 써 보실 때 써 주세요.', '', '▶ 혜택 쓰러 가기 #{링크}'],
      cart: [hi, '', '장바구니에 젤클렌저가 그대로 있어요.', short ? '' : '천천히 보시고, 궁금한 점은 채널톡으로 물어봐 주세요.', '', '▶ 장바구니 보기 #{링크}'],
      ship: [hi, '', '주문하신 젤클렌저가 오늘 출발했어요.', '송장번호: #{송장번호} (#{택배사})', '', '사용 팁 — 콩알 2개만큼 덜어 물기 있는 얼굴에 부드럽게 굴린 뒤 미온수로 헹궈 주세요.'],
      howto: [hi, '', '젤클렌저, 잘 받으셨나요?', '· 양: 콩알 2개 (150ml로 약 ' + wk + '주)', '· 방법: 물기 있는 얼굴에 30초 굴리고 미온수로 헹굼', '· 메이크업이 진한 날은 클렌징 오일 → 젤 순서로', '', '▶ 사용법 자세히 #{링크}'],
      review: [hi, '', '젤클렌저 일주일 써 보니 어떠세요?', '솔직한 후기를 남겨 주시면 ' + (A.review === 'both' ? '적립금 500원을 드려요.' : '다음 제품 개선에 그대로 반영할게요.'), '', '▶ 후기 쓰기 #{링크}'],
      review14: [hi, '', '2주 정도 쓰셨을 때가 세정력과 당김을 가장 잘 말해 줄 수 있는 시점이에요.', '사진 후기를 남겨 주시면 적립금 2,000원을 드려요.', '', '▶ 2주 후기 쓰기 #{링크}', '※ 적립금이 지급되는 후기는 「적립금 지급」 표시가 붙습니다.'],
      re1: [hi, '', '젤클렌저, 이제 2주 정도 남았을 거예요.', short ? '' : '떨어지기 전에 미리 챙겨 두시면 세안 루틴이 끊기지 않아요.', '', '▶ 다시 주문하기 #{링크}'],
      re2: [hi, '', '처음 주문하신 지 약 ' + wk + '주가 되었어요.', '2개를 한 번에 받으시면 개당 가격이 낮아져요.', A.sub !== 'no' ? '정기배송으로 받으시면 매번 주문할 필요가 없어요. (언제든 미루기 · 해지 가능)' : '', '', '▶ 2개 세트 보기 #{링크}'],
      point: [hi, '', '적립금 #{적립금}원이 #{소멸일}에 사라질 예정이에요.', '', '▶ 적립금 확인 #{링크}'],
      subpay: [hi, '', '#{결제일}에 정기배송 결제가 예정되어 있어요.', '아직 남아 있다면 다음 배송을 한 달 미룰 수 있어요.', '', '▶ 미루기 · 변경 #{링크}'],
      win1: A.winback === 'soft' ? [hi, '', '요즘 피부는 어떠세요?', '환절기에는 세안 후 당김이 더 잘 느껴질 수 있어요. 세안 시간을 30초로 짧게, 물은 미지근하게 해 보세요.', '', '▶ 계절별 세안 팁 #{링크}'] :
        A.winback === 'sample' ? [hi, '', '다시 써 보시라고 다음 주문에 파우치 샘플을 함께 넣어 드릴게요.', '', '▶ 다시 만나기 #{링크}'] : [hi, '', '다시 만나고 싶어 10% 쿠폰을 준비했어요. (14일)', '', '▶ 쿠폰 받기 #{링크}'],
      win2: [hi, '', '오랜만이에요. 다시 써 보시라고 10% 쿠폰을 드려요. (#{만료일}까지)', '', '▶ 쿠폰 받기 #{링크}'],
      oil: [hi, '', '바인그라피 두 번째 제품, 클렌징 오일이 나와요.', '젤클렌저를 써 주신 분께 48시간 먼저 열어 드려요. 오일 → 젤 더블클렌징 세트도 함께 준비했어요.', '', '▶ 먼저 보기 #{링크}'],
      birthday: [hi, '', '생일 축하드려요.', '작은 선물로 생일 쿠폰을 넣어 두었어요. (#{만료일}까지)', '', '▶ 쿠폰 확인 #{링크}'],
      consent: [hi, '', '광고성 정보 수신에 동의하신 지 2년이 되어 안내드립니다.', '동의일: #{동의일} · 수신 방법: #{채널}', '수신을 원하지 않으시면 아래에서 바로 바꿀 수 있어요. (로그인 없이)', '', '▶ 수신 설정 #{링크}']
    };
    var lines = (M[st.id] || [hi]).filter(function (l, i, arr) { return l !== '' || (arr[i - 1] !== ''); });
    var body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (st.ad) body = '(광고) 바인그라피\n' + body + '\n\n무료수신거부 080-000-0000';
    return body;
  }
  var BANNED = ['진정', '재생', '항염', '염증', '치료', '여드름', '아토피', '트러블 개선', '피부과', '의사', '처방', '독소', '디톡스', '미백', '주름 개선', '안티에이징', '피부나이', '100%', '최고', '완벽', '유일'];
  var banned = function (txt) { return BANNED.filter(function (w) { return txt.indexOf(w) >= 0; }); };

  /* ================= 구조설계 (한 문항씩) ================= */
  function design(view, parts) {
    if (!R.loaded) { ui.put(view, ui.empty('불러오는 중…')); return; }
    var A = answers(), done = (R.doc && R.doc.done) || parts[0] === 'result';
    var step = R.step != null ? R.step : (done ? Q.length : 0);
    ui.put(view, ui.head('D2C · CRM', '구조설계', h('span', { class: 'meta', text: '10문항 · 고를 때마다 저장 · 결과 = 메시지 퍼널' })));
    if (step >= Q.length) { result(view, A); return; }
    var q = Q[step];
    ui.put(view, h('section', { class: 'cq' },
      h('div', { class: 'cq-prog' }, h('span', { style: 'width:' + (step / Q.length * 100) + '%' })),
      h('div', { class: 'cq-n', text: 'Q' + (step + 1) + ' / ' + Q.length }),
      h('h2', { class: 'cq-q', text: q.q }),
      h('p', { class: 'cq-why', text: q.why }),
      h('div', { class: 'cq-opts' }, q.a.map(function (o, i) {
        var on = A[q.id] === o[0];
        return h('button', { type: 'button', class: 'cq-opt' + (on ? ' on' : ''), onclick: function () {
          var p = {}; p[q.id] = o[0]; save({ answers: p, step: step + 1 }); R.step = step + 1;
          if (R.step >= Q.length) save({ done: true });
          HR.refresh();
        } }, h('span', { class: 'cq-k', text: String.fromCharCode(65 + i) }), h('span', { class: 'cq-t' }, h('b', { text: o[1] }), o[2] ? h('small', { text: o[2] + (i === 0 ? '' : '') }) : null), i === 0 ? h('em', { text: '추천' }) : null);
      })),
      h('div', { class: 'cq-nav' },
        step ? ui.btn('← 이전', function () { R.step = step - 1; HR.refresh(); }, 'btn-line btn-sm') : h('span'),
        h('div', { class: 'cq-dots' }, Q.map(function (x, i) { return h('button', { type: 'button', class: 'cq-dot' + (i === step ? ' on' : i < step ? ' done' : ''), title: x.q, 'aria-label': 'Q' + (i + 1), onclick: function () { R.step = i; HR.refresh(); } }); })),
        ui.btn('추천대로 끝까지 →', function () { var p = {}; Q.slice(step).forEach(function (x) { if (!(R.doc && R.doc.answers && R.doc.answers[x.id])) p[x.id] = A[x.id]; }); save({ answers: p, done: true }); R.step = Q.length; HR.refresh(); }, 'btn-line btn-sm'))));
  }
  function result(view, A) {
    var F = funnel(A);
    ui.put(view,
      h('div', { class: 'cq-done' }, h('div', null, h('div', { class: 'label', text: '설계 결과' }), h('div', { class: 'cq-done-t', text: '메시지 ' + F.length + '개 · 광고성 ' + F.filter(function (f) { return f.ad; }).length + '개 · 정보성 ' + F.filter(function (f) { return !f.ad; }).length + '개' }),
          h('div', { class: 'meta', text: CAP[A.freq] + ' · 광고는 10~20시 · 동의자에게만' })),
        h('div', { class: 'cq-done-b' }, ui.btn('다시 답하기', function () { R.step = 0; HR.go('crmdesign'); }, 'btn-line btn-sm'), h('a', { class: 'btn btn-sm', href: '#crmmsg', text: '문안 복사하러 가기 →' }))),
      h('div', { class: 'cq-ans' }, Q.map(function (q, i) { return h('button', { type: 'button', class: 'cq-ans-i', title: '이 문항 다시 고르기', onclick: function () { R.step = i; HR.refresh(); } }, h('span', { class: 'meta', text: 'Q' + (i + 1) }), ' ' + label(q.id, A[q.id])); })),
      h('div', { class: 'cf' }, STAGES.map(function (sg) {
        var xs = F.filter(function (f) { return f.stage === sg; }); if (!xs.length) return null;
        return h('section', { class: 'cf-col' }, h('div', { class: 'cf-h', text: sg }),
          xs.map(function (f) {
            return h('a', { class: 'cf-card' + (f.ad ? ' ad' : ''), href: '#crmmsg/' + f.id },
              h('div', { class: 'cf-name' }, f.name, h('span', { class: 'cf-tag' + (f.ad ? ' ad' : ''), text: f.ad ? '광고' : '정보' })),
              h('div', { class: 'cf-when', text: f.when }), h('div', { class: 'meta', text: f.ch + ' · ' + f.goal }), h('div', { class: 'cf-kpi', text: '지표 · ' + f.kpi }));
          }));
      })),
      h('p', { class: 'meta sa-note', text: '정보성(알림톡) = 고객 행동(가입 · 주문 · 배송)에 따른 안내라 광고를 넣지 않습니다. 광고성 = (광고) 표기 · 수신거부 · 야간(21~08시) 금지 · 수신동의자만. 카드를 누르면 그 단계 문안으로 갑니다.' }));
  }

  /* ================= 메시지 (단계별 복붙) ================= */
  function copy(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = '복사됨 ✓'; btn.classList.add('copied'); setTimeout(function () { btn.textContent = t; btn.classList.remove('copied'); }, 1400); };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done).catch(fb);
    fb();
    function fb() { var ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { ui.toast('복사하지 못했습니다'); } ta.remove(); }
  }
  function messages(view, parts) {
    if (!R.loaded) { ui.put(view, ui.empty('불러오는 중…')); return; }
    var A = answers(), F = funnel(A), ed = canEdit(), focus = parts[0] || '';
    ui.put(view, ui.head('D2C · CRM', '메시지', h('span', { class: 'meta', text: '퍼널 단계별 문안 ' + F.length + '개 · 복사해서 카페24 · 채널톡 · 카카오에 붙여넣기' })),
      h('div', { class: 'cm-top' }, h('span', { class: 'meta', text: '말투: ' + label('tone', A.tone) + ' · 광고 채널: ' + label('channel', A.channel) + ' · ' + CAP[A.freq] }), h('a', { class: 'link', href: '#crmdesign/result', text: '구조설계 바꾸기 →' })),
      h('div', { class: 'cm-steps' }, STAGES.map(function (sg) { var xs = F.filter(function (f) { return f.stage === sg; }); return xs.length ? h('a', { href: '#crmmsg/' + xs[0].id, class: xs.some(function (f) { return f.id === focus; }) ? 'on' : '', text: sg + ' (' + xs.length + ')' }) : null; })));
    STAGES.forEach(function (sg) {
      var xs = F.filter(function (f) { return f.stage === sg; }); if (!xs.length) return;
      ui.put(view, h('h3', { class: 'cm-stage', text: sg }), h('div', { class: 'cm-msgs' }, xs.map(function (f) {
        var saved = R.msgs[f.id], text = saved && saved.text ? saved.text : draft(f, A), bad = banned(text);
        var ta = h('textarea', { class: 'cm-ta', rows: Math.min(Math.max(text.split('\n').length + 1, 6), 16), disabled: !ed }); ta.value = text;
        var cnt = h('span', { class: 'meta', text: text.length + '자' + (f.ch === '알림톡' ? ' / 1,000' : '') });
        ta.addEventListener('input', function () { cnt.textContent = ta.value.length + '자' + (f.ch === '알림톡' ? ' / 1,000' : ''); });
        ta.addEventListener('change', function () { db.collection('d2c_msgs').doc(f.id).set({ text: ta.value, by: S.mid || '', at: FV.serverTimestamp() }, { merge: true }).then(function () { ui.toast('문안을 저장했습니다.'); }); });
        var cb = h('button', { type: 'button', class: 'btn btn-sm cm-copy', text: '복사' }); cb.addEventListener('click', function () { copy(ta.value, cb); });
        return h('section', { class: 'cm-msg' + (f.id === focus ? ' focus' : '') + (f.ad ? ' ad' : ''), id: 'm-' + f.id },
          h('div', { class: 'cm-msg-h' }, h('div', null, h('div', { class: 'strong', text: f.name }), h('div', { class: 'meta', text: f.when + ' · ' + f.ch + ' · ' + f.goal })),
            h('span', { class: 'cf-tag' + (f.ad ? ' ad' : ''), text: f.ad ? '광고성' : '정보성' })),
          ta,
          h('div', { class: 'cm-msg-f' }, cnt, bad.length ? h('span', { class: 'red', text: '금지어: ' + bad.join(', ') }) : h('span', { class: 'meta', text: '금지어 없음' }),
            saved && saved.text ? ui.btn('초안으로 되돌리기', function () { db.collection('d2c_msgs').doc(f.id).delete(); }, 'btn-line btn-xs') : h('span', { class: 'meta', text: '자동 초안' }), cb));
      })));
    });
    ui.put(view, h('p', { class: 'meta sa-note', text: '#{고객명} · #{링크} 같은 칸은 카페24 · 채널톡 · 알림톡 템플릿의 변수 이름에 맞춰 바꿔 넣습니다. 알림톡(정보성)에는 「재구매」 같은 구매 유도 표현을 넣으면 템플릿 승인이 거절됩니다. 080 번호는 실제 수신거부 번호로 바꾸세요.' }));
    if (focus && R.scrolled !== focus) setTimeout(function () { R.scrolled = focus; var el = document.getElementById('m-' + focus); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
  }

  HR.register('crmdesign', { render: design });
  HR.register('crmmsg', { render: messages });
})();

/* fillts D2C — [매출] 광고: 소재(크리에이티브)별 반응 · 클릭 · 전환
   d2c_creatives/{광고ID} { name, media, campaign, format(image|video|carousel), thumb, start, status, spend, imp, reach, clk, v3s(3초 재생), conv, rev, memo, src(manual|paste|meta), updatedAt }
   반응 = CTR(클릭 ÷ 노출) · 영상은 훅률(3초 재생 ÷ 노출) / 클릭 = 클릭 수 · CPC / 전환 = 구매 · 구매 전환율(구매 ÷ 클릭) · ROAS
   나중에 Meta Marketing API(광고 단위 insights + adcreatives 썸네일)를 Cloud Functions로 하루 1회 가져와 같은 문서에 src:'meta'로 쓴다.
   실제 소재가 0건이면 예시 소재 12개를 화면에서만 보여 준다(저장 안 함, 썸네일은 그림 대신 색 타일) */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db;
  var FV = firebase.firestore.FieldValue;
  var C = { list: [], loaded: false, sort: 'react', view: 'card' };
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    if (prevStart) prevStart(sub);
    sub(db.collection('d2c_creatives'), function (s) { C.list = HR.rows(s); C.loaded = true; });
  };
  var canEdit = function () { return S.isAdmin || HR.appLevel('d2c') === 'edit'; };
  var n0 = function (v) { return Math.round(+v || 0).toLocaleString('ko-KR'); };
  var won = function (v) { return Math.round(+v || 0).toLocaleString('ko-KR') + '원'; };
  var pc = function (a, b, d) { return b ? (Math.round(a / b * Math.pow(10, 2 + (d || 1))) / Math.pow(10, d || 1)) + '%' : '—'; };
  var MEDIA = { meta: 'Meta', gdn: 'GDN', kakao: '카카오모먼트' };
  var MEDIA_FULL = { meta: 'Meta (페이스북 · 인스타그램)', gdn: 'GDN (구글 디스플레이 네트워크)', kakao: '카카오모먼트' };
  var FORMAT = { image: '이미지', video: '영상', carousel: '캐러셀' };

  /* ---------- 예시 소재 (저장 안 함) — 그림은 d2c/ex/*.svg (실제 제품 사진 아님) ---------- */
  function sample() {
    // [id, 매체, 형식, 이름, 헤드라인, 본문, CTA, 광고비, 노출, 클릭, 3초 재생, 구매, 전환 매출, 상태]
    var rows = [
      ['meta-01', 'meta', 'video', '포도 원물 클로즈업 15초', '세안 후, 당김 없이', '포도 클린 젤클렌저 — 매일 쓰는 약산성 세안', '구매하기', 186000, 41200, 412, 9800, 11, 512000, '게재 중'],
      ['meta-02', 'meta', 'video', '손 세안 ASMR 15초', '손에 덜어 15초', '거품 없이도 부드럽게 녹는 젤 텍스처', '구매하기', 142000, 30500, 488, 9100, 14, 640000, '게재 중'],
      ['meta-03', 'meta', 'video', 'pH 텍스트 훅 · 실험 장면', '피부와 비슷한 약산성', '실험 영상으로 확인하세요', '더 알아보기', 98000, 21900, 196, 3300, 7, 300000, '게재 중'],
      ['meta-04', 'meta', 'image', '제품 단독 화이트 배경', 'VINEGRAPHY GEL CLEANSER', '150mL · 상시 10% 할인', '구매하기', 76000, 24800, 174, 0, 3, 129000, '게재 중'],
      ['meta-05', 'meta', 'image', '리뷰 캡처 3장', '「속당김이 하나도 없어요」', '실구매 리뷰 1,200+', '구매하기', 88000, 19600, 274, 0, 9, 396000, '게재 중'],
      ['meta-06', 'meta', 'video', '홀리데이 선물세트 언박싱', '연말, 피부에게 주는 선물', '젤 2개 + 미니 · 기프트박스', '선물하기', 92000, 20400, 204, 4100, 8, 548000, '게재 중'],
      ['gdn-01', 'gdn', 'image', '반응형 디스플레이 · 다크', '세안이 편해지는 젤', '포도 클린뷰티 · 150mL', '자세히 보기', 64000, 52000, 182, 0, 3, 102600, '게재 중'],
      ['gdn-02', 'gdn', 'image', '반응형 디스플레이 · 할인', '매일 쓰는 약산성 클렌저', '상시 10% 할인', '구매하기', 58000, 61000, 159, 0, 2, 68400, '중지'],
      ['gdn-03', 'gdn', 'image', '리타겟 · 더블클렌징', '30·40대 더블클렌징', 'STEP 2 · 젤클렌저', '자세히 보기', 47000, 38400, 131, 0, 4, 171000, '게재 중'],
      ['kakao-01', 'kakao', 'image', '비즈보드 · 첫 구매 10%', '당김 없는 세안, 바인그라피', '첫 구매 10%', '구매하기', 52000, 88000, 211, 0, 3, 136800, '게재 중'],
      ['kakao-02', 'kakao', 'image', '비즈보드 · 리뷰', '「속당김이 없어요」 리뷰 1,200+', '실구매 리뷰 보러가기', '더 알아보기', 39000, 71000, 156, 0, 2, 68400, '게재 중'],
      ['kakao-03', 'kakao', 'image', '네이티브 · 채널 친구 세트', '카톡 친구만 · 2개 세트', '채널 추가하고 혜택 받기', '채널 추가', 31000, 15200, 98, 0, 2, 136800, '중지']
    ];
    return rows.map(function (r, i) {
      return { id: 'EX-' + r[0], media: r[1], format: r[2], name: r[3], headline: r[4], body: r[5], cta: r[6], spend: r[7], imp: r[8], clk: r[9], v3s: r[10], conv: r[11], rev: r[12], status: r[13],
        thumb: 'ex/' + r[0] + '.svg', campaign: r[1] === 'meta' ? (i % 2 ? '전환 · 리타겟' : '전환 · 신규') : r[1] === 'gdn' ? '디스플레이' : '비즈보드', reach: Math.round(r[8] / 1.6), start: '2026-11-' + (12 + i), demo: true };
    });
  }
  function enrich(x) {
    x.ctr = x.imp ? x.clk / x.imp : 0; x.cpc = x.clk ? x.spend / x.clk : 0; x.cvr = x.clk ? x.conv / x.clk : 0;
    x.roas = x.spend ? x.rev / x.spend : 0; x.hook = x.format === 'video' && x.imp ? x.v3s / x.imp : null; x.cpa = x.conv ? x.spend / x.conv : 0;
    x.freq = x.reach ? x.imp / x.reach : null; x.cpm = x.imp ? x.spend / x.imp * 1000 : 0;
    return x;
  }

  /* ================= 화면 ================= */
  function render(view) {
    if (!C.loaded) { ui.put(view, ui.empty('불러오는 중…')); return; }
    var demo = !C.list.length; if (demo && !C.demo) C.demo = sample();
    var list = (demo ? C.demo : C.list).map(function (x) { return enrich(Object.assign({}, x)); });
    var T = list.reduce(function (t, x) { ['spend', 'imp', 'clk', 'conv', 'rev', 'v3s'].forEach(function (k) { t[k] += +x[k] || 0; }); return t; }, { spend: 0, imp: 0, clk: 0, conv: 0, rev: 0, v3s: 0 });
    var vImp = list.filter(function (x) { return x.format === 'video'; }).reduce(function (s, x) { return s + (+x.imp || 0); }, 0);
    var avg = { ctr: T.imp ? T.clk / T.imp : 0, cvr: T.clk ? T.conv / T.clk : 0 };
    var sec = C.sec || 'media';
    ui.put(view, ui.head('D2C · 데이터', '광고 성과', h('span', { class: 'meta', text: sec === 'inf' ? '인플루언서 예시 · 저장 안 됨' : demo ? '예시 소재 · 저장 안 됨' : '소재 ' + list.length + '개 · 누적' })),
      h('div', { class: 'ad-sec', role: 'tablist' }, [['media', '매체 광고', 'Meta · GDN · 카카오모먼트'], ['inf', '인플루언서 광고', '유튜브 · 인스타 협업 콘텐츠']].map(function (t) {
        return h('button', { type: 'button', role: 'tab', 'aria-selected': String(sec === t[0]), class: sec === t[0] ? 'on' : '', onclick: function () { C.sec = t[0]; HR.refresh(); } }, h('b', { text: t[1] }), h('small', { text: t[2] }));
      })));
    if (sec === 'inf') { infSection(view); return; }
    if (demo) ui.put(view, h('div', { class: 'sa-demo' }, h('strong', { text: '예시 소재입니다.' }), ' Meta 6 · GDN 3 · 카카오모먼트 3, 소재 12개를 가정했습니다(그림은 예시 일러스트). 아래 「소재 입력」에 넣거나, 「소재 › 매체에서 가져오기」(Meta · GDN · 카카오모먼트 API)가 연결되면 자동으로 채워지고 사라집니다.'));
    ui.put(view,
      h('dl', { class: 'summary sa-kpi' },
        kpiBox('소재', list.length + '개', list.filter(function (x) { return x.status !== '중지'; }).length + '개 게재 중'),
        kpiBox('광고비', won(T.spend), 'CPM ' + won(T.imp ? T.spend / T.imp * 1000 : 0)),
        kpiBox('평균 CTR (반응)', pc(T.clk, T.imp, 2), vImp ? '영상 훅률 ' + pc(T.v3s, vImp, 1) : ''),
        kpiBox('평균 CPC', won(T.clk ? T.spend / T.clk : 0), '클릭 ' + n0(T.clk)),
        kpiBox('구매 전환율', pc(T.conv, T.clk, 2), '구매 ' + n0(T.conv) + '건 · CPA ' + won(T.conv ? T.spend / T.conv : 0)),
        kpiBox('ROAS (매체 보고)', T.spend ? (T.rev / T.spend).toFixed(2) + '배' : '—', '전환 매출 ' + won(T.rev))),
      h('p', { class: 'meta sa-period', text: '소재 단위 수치는 매체(Meta · GDN · 카카오모먼트) 보고값입니다 — 자사몰 실측 매출 · 광고비 비중은 「퍼포먼스」 메뉴에서 봅니다.' }),
      ui.panel('매체별 CTR 순위 — 같은 매체 안에서 비교', h('span', { class: 'meta', text: '매체마다 지면 · 형식이 달라 CTR 기준이 다릅니다 · 이미지는 「소재」 메뉴' }), byMedia(list)),
      ui.panel('반응 × 전환 — 소재를 네 무리로', h('span', { class: 'meta', text: '가로 CTR · 세로 구매 전환율 · 원 크기 = 광고비' }), quadrant(list, avg)),
      ui.panel('전체 소재', h('span', { class: 'meta', text: '머리줄을 누르면 정렬' }), table(list)),
      apiBox(), input());
  }
  function kpiBox(t, v, sub) { return h('div', null, h('dt', { text: t }), h('dd', { text: v }), sub ? h('span', { class: 'sa-sub', text: sub }) : null); }

  /* ---------- 순위 카드 ---------- */
  var SORTS = [['react', '반응 좋은 순', 'CTR · 영상은 훅률'], ['click', '클릭 좋은 순', '클릭 수 · 낮은 CPC'], ['conv', '전환 좋은 순', '구매 · ROAS'], ['spend', '광고비 순', '']];
  function score(x, k) {
    if (k === 'react') return x.ctr * 100 + (x.hook != null ? x.hook * 10 : 0);
    if (k === 'click') return x.clk - x.cpc / 10;
    if (k === 'conv') return x.conv * 1000 + x.roas;
    return x.spend;
  }
  function sortBar() {
    return h('div', { class: 'sa-seg', role: 'group' }, SORTS.map(function (s) {
      return h('button', { type: 'button', class: C.sort === s[0] ? 'on' : '', 'aria-pressed': String(C.sort === s[0]), title: s[2], text: s[1], onclick: function () { C.sort = s[0]; HR.refresh(); } });
    }));
  }
  function badges(x, all) {
    var top = function (k) { return all.slice().sort(function (a, b) { return score(b, k) - score(a, k); }).slice(0, 3).indexOf(x) >= 0; };
    return [top('react') ? h('span', { class: 'cr-badge cr-b-react', text: '반응 TOP3' }) : null, top('click') ? h('span', { class: 'cr-badge cr-b-click', text: '클릭 TOP3' }) : null, top('conv') ? h('span', { class: 'cr-badge cr-b-conv', text: '전환 TOP3' }) : null];
  }
  function cards(list, avg) {
    if (!list.length) return ui.empty('소재가 없습니다.');
    var sorted = list.slice().sort(function (a, b) { return score(b, C.sort) - score(a, C.sort); });
    var mx = { ctr: Math.max.apply(null, list.map(function (x) { return x.ctr; })) || 1, cvr: Math.max.apply(null, list.map(function (x) { return x.cvr; })) || 1, roas: Math.max.apply(null, list.map(function (x) { return x.roas; })) || 1 };
    var bar = function (label, v, max, txt, good) { return h('div', { class: 'cr-m' }, h('span', { class: 'cr-m-k', text: label }), h('span', { class: 'cr-m-b' }, h('span', { class: good ? 'good' : '', style: 'width:' + Math.min(v / max * 100, 100) + '%' })), h('span', { class: 'cr-m-v', text: txt })); };
    return h('ol', { class: 'cr-grid' }, sorted.map(function (x, i) {
      return h('li', { class: 'cr-card' + (x.status === '중지' ? ' off' : '') },
        h('div', { class: 'cr-thumb' }, x.thumb ? h('img', { src: x.thumb, alt: x.name, loading: 'lazy' }) : h('span', { class: 'cr-noimg', text: '썸네일 없음' }),
          h('span', { class: 'cr-rank' + (i < 3 ? ' top' : ''), text: i + 1 }), h('span', { class: 'cr-fmt', text: FORMAT[x.format] || x.format || '' })),
        h('div', { class: 'cr-body' },
          h('div', { class: 'cr-badges' }, badges(x, list)),
          h('div', { class: 'cr-name', text: x.name || x.id }),
          h('div', { class: 'meta', text: (MEDIA[x.media] || x.media || '') + (x.campaign ? ' · ' + x.campaign : '') + (x.status ? ' · ' + x.status : '') }),
          bar('CTR', x.ctr, mx.ctr, pc(x.clk, x.imp, 2), x.ctr >= avg.ctr),
          x.hook != null ? h('div', { class: 'cr-m' }, h('span', { class: 'cr-m-k', text: '훅률' }), h('span', { class: 'cr-m-b' }, h('span', { style: 'width:' + Math.min(x.hook * 100 / 40 * 100, 100) + '%' })), h('span', { class: 'cr-m-v', text: pc(x.v3s, x.imp, 1) })) : null,
          bar('전환율', x.cvr, mx.cvr, pc(x.conv, x.clk, 2), x.cvr >= avg.cvr),
          bar('ROAS', x.roas, mx.roas, x.spend ? x.roas.toFixed(2) : '—', x.roas >= 1),
          h('div', { class: 'cr-foot' }, h('span', { text: won(x.spend) }), h('span', { text: '클릭 ' + n0(x.clk) + ' · CPC ' + won(x.cpc) }), h('span', { class: 'strong', text: '구매 ' + n0(x.conv) }))));
    }));
  }



  /* ================= 광고 › 인플루언서 광고 =================
     콘텐츠 1건 = 크리에이터 · 플랫폼 · 업로드일 · 비용 · 조회 · 좋아요 · 댓글 · 링크 클릭 · 쿠폰코드 주문 · 매출
     실제 데이터는 /inf 「완료 콘텐츠」(inf_creators.contents) + 카페24 주문의 쿠폰코드로 채운다. 지금은 예시(실제 협업 아님) */
  function infSample() {
    // [id, 크리에이터, 구독, 플랫폼, 형식, 제목, 업로드, 비용, 조회, 좋아요, 댓글, 링크클릭, 쿠폰, 주문, 매출]
    var rows = [
      ['inf-01', '채정안TV', '33.9만', 'YouTube', '롱폼 12:48', '요즘 매일 쓰는 세안템 하나', '2026-11-20', 6000000, 412000, 9800, 1240, 6900, 'VG-JEONGAN', 214, 8360000],
      ['inf-02', '채정안TV', '33.9만', 'YouTube', '쇼츠 0:42 · 리컷', '세안 30초 루틴 공개', '2026-11-27', 0, 238000, 7100, 310, 1650, 'VG-JEONGAN', 46, 1780000],
      ['inf-03', '기은세', '14.6만', 'Instagram', '릴스 0:31', '집에서 하는 저녁 세안', '2026-12-02', 3000000, 186000, 8400, 420, 2100, 'VG-EUNSE', 92, 3480000],
      ['inf-04', 'happydana', '3.2만', 'YouTube', '롱폼 9:12', '쌍둥이 재우고 10분 세안 루틴', '2026-11-25', 600000, 41000, 1900, 380, 860, 'VG-DANA', 38, 1420000],
      ['inf-05', '유튜버 A (예시)', '6.8만', 'YouTube', '쇼츠 0:38', '건성 피부 클렌저 바꿈', '2026-11-15', 90000, 21000, 690, 54, 540, 'VG-A10', 15, 560000],
      ['inf-06', '유튜버 B (예시)', '4.1만', 'YouTube', '롱폼 8:05', '약산성 클렌저 3주 써봄', '2026-12-01', 120000, 34000, 1120, 162, 880, 'VG-B10', 21, 790000]
    ];
    return rows.map(function (r) {
      return { id: r[0], creator: r[1], subs: r[2], platform: r[3], format: r[4], title: r[5], date: r[6], cost: r[7], views: r[8], likes: r[9], cmts: r[10], clicks: r[11], coupon: r[12], orders: r[13], sales: r[14], thumb: 'ex/' + r[0] + '.svg', vertical: /쇼츠|릴스/.test(r[4]) };
    });
  }
  function infSection(view) {
    if (!C.inf) C.inf = infSample();
    var list = C.inf.map(function (x) { var o = Object.assign({}, x); o.eng = o.views ? (o.likes + o.cmts) / o.views : 0; o.ctr = o.views ? o.clicks / o.views : 0; o.cvr = o.clicks ? o.orders / o.clicks : 0; o.roas = o.cost ? o.sales / o.cost : null; o.cpv = o.views && o.cost ? o.cost / o.views : null; return o; });
    var T = list.reduce(function (t, x) { ['cost', 'views', 'likes', 'cmts', 'clicks', 'orders', 'sales'].forEach(function (k) { t[k] += x[k]; }); return t; }, { cost: 0, views: 0, likes: 0, cmts: 0, clicks: 0, orders: 0, sales: 0 });
    var sort = C.isort || 'roas';
    var key = { roas: function (x) { return x.roas == null ? 1e9 : x.roas; }, views: function (x) { return x.views; }, eng: function (x) { return x.eng; }, orders: function (x) { return x.orders; } }[sort];
    list.sort(function (a, b) { return key(b) - key(a); });
    ui.put(view,
      h('div', { class: 'sa-demo' }, h('strong', { text: '예시 데이터입니다 — 실제 협업이 아닙니다.' }), ' /inf에 등록된 채정안TV · 기은세 · happydana와 퍼포먼스 예시의 유튜버 A · B로 협업 콘텐츠 6개를 가정했습니다. 썸네일은 인물 사진 없이 만든 일러스트입니다. 실제로는 /inf 「완료 콘텐츠」와 카페24 주문의 쿠폰코드로 채워집니다.'),
      h('dl', { class: 'summary sa-kpi' },
        kpiBox('협업 콘텐츠', list.length + '개', list.map(function (x) { return x.creator; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length + '명'),
        kpiBox('비용', won(T.cost), '원고료 · 제작비 (제품 원가 제외)'),
        kpiBox('조회', n0(T.views), 'CPV ' + won(T.views ? T.cost / T.views : 0)),
        kpiBox('참여율', pc(T.likes + T.cmts, T.views, 2), '(좋아요 + 댓글) ÷ 조회'),
        kpiBox('쿠폰 주문', n0(T.orders) + '건', '링크 클릭 ' + n0(T.clicks) + ' · 전환 ' + pc(T.orders, T.clicks, 1)),
        kpiBox('ROAS (쿠폰 실측)', T.cost ? (T.sales / T.cost).toFixed(2) + '배' : '—', '쿠폰 매출 ' + won(T.sales))),
      ui.panel('콘텐츠별 성과', h('div', { class: 'sa-seg', role: 'group' }, [['roas', 'ROAS 순'], ['orders', '주문 순'], ['views', '조회 순'], ['eng', '참여율 순']].map(function (s) {
        return h('button', { type: 'button', class: sort === s[0] ? 'on' : '', text: s[1], onclick: function () { C.isort = s[0]; HR.refresh(); } });
      })),
        h('ol', { class: 'if-grid' }, list.map(function (x, i) {
          return h('li', { class: 'if-card' },
            h('div', { class: 'if-th' + (x.vertical ? ' v' : '') }, h('img', { src: x.thumb, alt: x.title, loading: 'lazy' }), h('span', { class: 'cr-rank' + (i < 3 ? ' top' : ''), text: i + 1 }), h('span', { class: 'if-pf if-' + x.platform.toLowerCase(), text: x.platform })),
            h('div', { class: 'if-body' },
              h('div', { class: 'if-cr' }, h('b', { text: x.creator }), h('span', { class: 'meta', text: '구독 ' + x.subs + ' · ' + x.format })),
              h('div', { class: 'if-title', text: x.title }),
              h('div', { class: 'meta', text: '업로드 ' + x.date.slice(5).replace('-', '.') + ' · 쿠폰 ' + x.coupon + ' · 비용 30일 안분' }),
              h('dl', { class: 'if-nums' },
                h('div', null, h('dt', { text: '비용' }), h('dd', { text: x.cost ? D2Cman(x.cost) + '원' : '0원 (2차 활용)' })),
                h('div', null, h('dt', { text: '조회' }), h('dd', { text: n0(x.views) })),
                h('div', null, h('dt', { text: '참여율' }), h('dd', { text: pc(x.likes + x.cmts, x.views, 2) })),
                h('div', null, h('dt', { text: '링크 클릭' }), h('dd', { text: n0(x.clicks) })),
                h('div', null, h('dt', { text: '쿠폰 주문' }), h('dd', { class: 'strong', text: n0(x.orders) + '건' })),
                h('div', null, h('dt', { text: 'ROAS' }), h('dd', { class: x.roas != null && x.roas >= 1 ? 'red' : '', text: x.roas == null ? '∞ (무상)' : x.roas.toFixed(2) })))));
        }))),
      ui.panel('크리에이터별 합계', h('span', { class: 'meta', text: '같은 사람의 롱폼 · 쇼츠 · 리컷을 묶어서' }), infTable(list)),
      h('p', { class: 'meta sa-note', text: '인플루언서 시청자는 링크 대신 검색으로 들어오는 경우가 많아 매출 귀속은 쿠폰코드가 1순위입니다(UTM은 보조). 비용은 퍼포먼스 메뉴에서 업로드일부터 30일 안분해 매출 대비 광고비에 들어갑니다. 협찬 콘텐츠는 제목 · 첫머리에 「유료광고 · 광고」 표시가 필수입니다.' }));
  }
  function D2Cman(v) { return (HR.D2C && HR.D2C.man) ? HR.D2C.man(v) : n0(v); }
  function infTable(list) {
    var by = {};
    list.forEach(function (x) { var c = by[x.creator] || (by[x.creator] = { creator: x.creator, subs: x.subs, n: 0, cost: 0, views: 0, eng: 0, clicks: 0, orders: 0, sales: 0 }); c.n++; c.cost += x.cost; c.views += x.views; c.eng += x.likes + x.cmts; c.clicks += x.clicks; c.orders += x.orders; c.sales += x.sales; });
    var rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.sales - a.sales; });
    return h('div', { class: 'table-wrap flat' }, h('table', { class: 'table sa-media' },
      h('thead', null, h('tr', null, ['크리에이터', '구독', '콘텐츠', '비용', '조회', 'CPV', '참여율', '링크 클릭', '쿠폰 주문', '쿠폰 매출', 'ROAS', '주문당 비용'].map(function (c, j) { return h('th', { class: j >= 2 ? 'num' : '', text: c }); }))),
      h('tbody', null, rows.map(function (c) {
        return h('tr', null, h('td', { class: 'strong', text: c.creator }), h('td', { text: c.subs }), h('td', { class: 'num', text: c.n + '개' }), h('td', { class: 'num', text: won(c.cost) }), h('td', { class: 'num', text: n0(c.views) }),
          h('td', { class: 'num', text: c.views && c.cost ? won(c.cost / c.views) : '—' }), h('td', { class: 'num', text: pc(c.eng, c.views, 2) }), h('td', { class: 'num', text: n0(c.clicks) }), h('td', { class: 'num', text: n0(c.orders) + '건' }),
          h('td', { class: 'num', text: won(c.sales) }), h('td', { class: 'num strong' + (c.cost && c.sales / c.cost >= 1 ? ' red' : ''), text: c.cost ? (c.sales / c.cost).toFixed(2) : '—' }), h('td', { class: 'num', text: c.orders ? won(c.cost / c.orders) : '—' }));
      }))));
  }
  /* ---------- 매체별 CTR 순위 (Meta · GDN · 카카오모먼트 세 칸) ---------- */
  function byMedia(list) {
    var cols = ['meta', 'gdn', 'kakao'].map(function (k) {
      var xs = list.filter(function (x) { return x.media === k && x.imp; }).sort(function (a, b) { return b.ctr - a.ctr; });
      var imp = xs.reduce(function (s, x) { return s + (+x.imp || 0); }, 0), clk = xs.reduce(function (s, x) { return s + (+x.clk || 0); }, 0), sp = xs.reduce(function (s, x) { return s + (+x.spend || 0); }, 0);
      return { k: k, xs: xs, avg: imp ? clk / imp : 0, imp: imp, clk: clk, spend: sp, max: xs.length ? xs[0].ctr : 0 };
    });
    var maxAvg = Math.max.apply(null, cols.map(function (c) { return c.avg; })) || 1;
    return h('div', null,
      h('div', { class: 'cm-avg' }, cols.map(function (c) {
        return h('div', { class: 'cm-avg-r' }, h('span', { class: 'as-media as-m-' + c.k, text: MEDIA[c.k] }),
          h('span', { class: 'cm-avg-b' }, h('span', { style: 'width:' + (c.avg / maxAvg * 100) + '%' })),
          h('span', { class: 'cm-avg-v', text: '평균 CTR ' + (Math.round(c.avg * 10000) / 100) + '%' }), h('span', { class: 'meta', text: '노출 ' + n0(c.imp) + ' · 클릭 ' + n0(c.clk) + ' · ' + won(c.spend) }));
      })),
      h('div', { class: 'cm-cols' }, cols.map(function (c) {
        return h('section', { class: 'cm-col' },
          h('div', { class: 'cm-col-h' }, h('span', { class: 'as-media as-m-' + c.k, text: MEDIA_FULL[c.k] || MEDIA[c.k] }), h('span', { class: 'meta', text: c.xs.length + '개' })),
          c.xs.length ? h('ol', { class: 'cm-list' }, c.xs.map(function (x, i) {
            var rel = c.avg ? x.ctr / c.avg : 0;
            return h('li', { class: 'cm-item' + (i === 0 ? ' top' : '') + (x.status === '중지' ? ' off' : '') },
              h('span', { class: 'cm-rank', text: i + 1 }),
              x.thumb ? h('img', { class: 'cm-th', src: x.thumb, alt: '' }) : h('span', { class: 'cm-th' }),
              h('div', { class: 'cm-main' },
                h('div', { class: 'cm-name', text: x.headline || x.name }),
                h('div', { class: 'meta', text: (FORMAT[x.format] || '') + ' · ' + (x.status || '') + ' · 노출 ' + n0(x.imp) + ' · 클릭 ' + n0(x.clk) }),
                h('div', { class: 'cm-bar' }, h('span', { class: rel >= 1 ? 'up' : '', style: 'width:' + (c.max ? x.ctr / c.max * 100 : 0) + '%' }))),
              h('div', { class: 'cm-v' }, h('div', { class: 'cm-ctr', text: (Math.round(x.ctr * 10000) / 100) + '%' }),
                h('div', { class: 'cm-rel' + (rel >= 1 ? ' up' : ''), text: rel ? (rel >= 1 ? '평균의 ' : '평균의 ') + rel.toFixed(1) + '배' : '—' })));
          })) : ui.empty('이 매체의 광고가 없습니다.'));
      })),
      h('p', { class: 'meta sa-note', text: 'CTR = 클릭 ÷ 노출(매체 보고). Meta 피드와 GDN · 카카오 배너는 지면이 달라 CTR 수준 자체가 다르므로 매체 안에서만 순위를 매기고, 「평균의 n배」로 그 매체 평균과 비교합니다. 빨간 막대 = 매체 평균 이상.' }));
  }
  /* ---------- 4분면 (CTR × 구매 전환율, 원 크기 = 광고비) ---------- */
  function quadrant(list, avg) {
    var pts = list.filter(function (x) { return x.imp && x.clk; });
    if (pts.length < 2) return ui.empty('소재가 2개 이상 있어야 그릴 수 있습니다.');
    var W = 960, H = 380, pl = 56, pr = 20, pt = 20, pb = 40, iw = W - pl - pr, ih = H - pt - pb, ns = 'http://www.w3.org/2000/svg';
    var mxX = Math.max.apply(null, pts.map(function (x) { return x.ctr; })) * 1.15, mxY = Math.max.apply(null, pts.map(function (x) { return x.cvr; })) * 1.15 || 0.01;
    var mxS = Math.max.apply(null, pts.map(function (x) { return x.spend; })) || 1;
    var X = function (v) { return pl + v / mxX * iw; }, Y = function (v) { return pt + ih - v / mxY * ih; };
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'sa-chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '소재별 CTR과 구매 전환율 산점도');
    var el = function (tag, a, txt) { var e = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; };
    // 사분면 배경 + 이름
    var ax = X(avg.ctr), ay = Y(avg.cvr);
    el('rect', { x: ax, y: pt, width: W - pr - ax, height: ay - pt, class: 'cr-q cr-q-best' });
    [[W - pr - 8, pt + 16, 'end', '확장 — 반응 · 전환 모두 좋음'], [pl + 8, pt + 16, 'start', '소재 개선 — 전환은 좋은데 반응 약함'], [W - pr - 8, pt + ih - 8, 'end', '랜딩 점검 — 클릭은 많은데 안 삼'], [pl + 8, pt + ih - 8, 'start', '중단 후보 — 둘 다 약함']]
      .forEach(function (q) { el('text', { x: q[0], y: q[1], 'text-anchor': q[2], class: 'cr-q-t' }, q[3]); });
    el('line', { x1: ax, x2: ax, y1: pt, y2: pt + ih, class: 'sa-goal-line' }); el('line', { x1: pl, x2: W - pr, y1: ay, y2: ay, class: 'sa-goal-line' });
    el('text', { x: ax + 4, y: pt + ih + 14, class: 'sa-ax' }, '평균 CTR ' + (Math.round(avg.ctr * 1000) / 10) + '%'); el('text', { x: pl + 4, y: ay - 4, class: 'sa-ax' }, '평균 전환율 ' + (Math.round(avg.cvr * 1000) / 10) + '%');
    el('line', { x1: pl, x2: W - pr, y1: pt + ih, y2: pt + ih, class: 'sa-base' }); el('line', { x1: pl, x2: pl, y1: pt, y2: pt + ih, class: 'sa-base' });
    el('text', { x: W - pr, y: H - 8, 'text-anchor': 'end', class: 'sa-ax' }, 'CTR (클릭 ÷ 노출) →'); el('text', { x: pl - 8, y: pt + 4, 'text-anchor': 'end', class: 'sa-ax' }, '전환율 ↑');
    var wrap = h('div', { class: 'sa-chart-wrap' }), tip = h('div', { class: 'sa-tip', hidden: true });
    pts.slice().sort(function (a, b) { return b.spend - a.spend; }).forEach(function (x) {
      var cx = X(x.ctr), cy = Y(x.cvr), r = 6 + Math.sqrt(x.spend / mxS) * 16, best = x.ctr >= avg.ctr && x.cvr >= avg.cvr, worst = x.ctr < avg.ctr && x.cvr < avg.cvr;
      var c = el('circle', { cx: cx, cy: cy, r: r, class: 'cr-dot' + (best ? ' best' : worst ? ' worst' : '') });
      el('text', { x: cx, y: cy - r - 4, 'text-anchor': 'middle', class: 'cr-dot-t' }, x.id.replace(/^EX-/, ''));
      c.addEventListener('mouseenter', function () {
        ui.clear(tip); ui.put(tip, h('div', { class: 'strong', text: x.name }), h('div', { text: 'CTR ' + pc(x.clk, x.imp, 2) + ' · 전환율 ' + pc(x.conv, x.clk, 2) }), h('div', { class: 'meta', text: '광고비 ' + won(x.spend) + ' · 구매 ' + x.conv + ' · ROAS ' + x.roas.toFixed(2) }));
        tip.hidden = false; tip.style.left = Math.min(Math.max(cx / W * 100, 16), 80) + '%'; tip.style.top = Math.max(cy / H * 100 - 30, 0) + '%';
      });
      c.addEventListener('mouseleave', function () { tip.hidden = true; tip.style.top = ''; });
    });
    wrap.appendChild(svg); wrap.appendChild(tip);
    return h('div', null, wrap, h('p', { class: 'meta sa-note', text: '점선 = 전체 평균. 오른쪽 위(빨강)는 예산을 늘릴 소재, 왼쪽 아래(회색)는 끌 후보입니다. 오른쪽 아래는 소재는 먹히는데 상세페이지에서 놓치는 것이라 랜딩 · 혜택을, 왼쪽 위는 사는 사람은 사는데 손이 덜 가는 것이라 썸네일 · 첫 3초를 고칩니다.' }));
  }

  /* ---------- 전체 표 ---------- */
  var COLS = [['name', '소재'], ['spend', '광고비'], ['imp', '노출'], ['cpm', 'CPM'], ['freq', '빈도'], ['hook', '훅률'], ['clk', '클릭'], ['ctr', 'CTR'], ['cpc', 'CPC'], ['conv', '구매'], ['cvr', '전환율'], ['cpa', 'CPA'], ['rev', '전환 매출'], ['roas', 'ROAS']];
  function table(list) {
    var k = C.tsort || 'spend', dir = C.tdir || -1;
    var rows = list.slice().sort(function (a, b) { var va = a[k], vb = b[k]; if (typeof va === 'string' || typeof vb === 'string') return String(va || '').localeCompare(String(vb || '')) * dir; return ((va == null ? -1 : va) - (vb == null ? -1 : vb)) * dir; });
    var f = function (x, c) {
      var v = x[c];
      if (c === 'name') return h('td', null, h('div', { class: 'cr-tname' }, x.thumb ? h('img', { src: x.thumb, alt: '' }) : null, h('div', null, h('div', { class: 'strong', text: x.name || x.id }), h('div', { class: 'meta', text: (FORMAT[x.format] || '') + ' · ' + (x.status || '') }))));
      var t = c === 'spend' || c === 'cpc' || c === 'cpa' || c === 'rev' || c === 'cpm' ? (v ? won(v) : '—') : c === 'ctr' || c === 'cvr' ? (v ? (Math.round(v * 10000) / 100) + '%' : '—') : c === 'hook' ? (v == null ? '—' : (Math.round(v * 1000) / 10) + '%') : c === 'roas' ? (v ? v.toFixed(2) : '—') : c === 'freq' ? (v ? v.toFixed(2) : '—') : n0(v);
      return h('td', { class: 'num', text: t });
    };
    return h('div', { class: 'table-wrap flat' }, h('table', { class: 'table sa-media cr-table' },
      h('thead', null, h('tr', null, COLS.map(function (c) {
        return h('th', { class: (c[0] === 'name' ? '' : 'num') + ' cr-th', onclick: function () { if (C.tsort === c[0]) C.tdir = -(C.tdir || -1); else { C.tsort = c[0]; C.tdir = -1; } HR.refresh(); }, text: c[1] + (k === c[0] ? (dir < 0 ? ' ▼' : ' ▲') : '') });
      }))),
      h('tbody', null, rows.map(function (x) { return h('tr', { class: x.status === '중지' ? 'cr-off' : '' }, COLS.map(function (c) { return f(x, c[0]); })); }))));
  }

  /* ---------- Meta API 연동 안내 ---------- */
  function apiBox() {
    return h('details', { class: 'panel sa-adin' },
      h('summary', { class: 'label', text: 'Meta API 자동 연동 — 준비 중 (무엇을 가져오나)' }),
      h('ol', { class: 'sa-howto' },
        h('li', null, h('strong', { text: '가져오는 것: ' }), '광고(ad) 단위 insights — 지출 · 노출 · 도달 · 빈도 · 클릭 · CTR · CPC · 구매(actions: purchase) · 구매 금액(action_values) · 영상 3초 재생(video_play_actions) · 25/50/75/100% 시청, 그리고 adcreatives의 썸네일(thumbnail_url · image_url) · 문구 · 제목.'),
        h('li', null, h('strong', { text: '방식: ' }), 'Cloud Functions가 하루 1회(새벽) 지난 30일치를 가져와 이 화면의 d2c_creatives에 src:meta로 덮어씁니다. /inf 유튜브 탐색과 같은 구조라 Claude나 PC가 꺼져 있어도 돕니다.'),
        h('li', null, h('strong', { text: '썸네일: ' }), 'Meta 썸네일 주소는 며칠 뒤 만료되고 사내 웹 보안 설정상 외부 이미지가 막히므로, 가져올 때 Firebase Storage에 복사해 두고 그 주소를 씁니다.'),
        h('li', null, h('strong', { text: '필요한 것 (대표님): ' }), 'Meta 비즈니스 관리자에서 시스템 사용자 생성 → 광고 계정 권한(ads_read) → 장기 토큰 발급 → 광고 계정 ID(act_…). 토큰은 서버 비밀값(Secret)으로만 보관합니다.'),
        h('li', null, h('strong', { text: '그 전까지: ' }), '광고 관리자 › 보고서를 「광고」 단위로 내보내 아래 붙여넣기 칸에 넣으면 같은 화면이 채워집니다.')));
  }

  /* ---------- 입력 ---------- */
  function input() {
    var ed = canEdit();
    var bulk = h('textarea', { rows: 5, class: 'sa-bulk', placeholder: 'Meta 광고 관리자 › 보고서(광고 단위)를 엑셀로 열고 아래 순서의 열을 복사해 붙여넣기 — 한 줄에 탭 구분\n광고 이름 ⇥ 형식(이미지/영상/캐러셀) ⇥ 지출 ⇥ 노출 ⇥ 클릭(링크) ⇥ 구매 ⇥ 구매 전환값 ⇥ [3초 재생] ⇥ [도달]\n포도 클로즈업 15초\t영상\t186000\t41200\t412\t11\t512000\t9800\t25700' });
    var go = function () {
      var fmtOf = function (t) { t = String(t || ''); return /영상|video/i.test(t) ? 'video' : /캐러셀|carousel/i.test(t) ? 'carousel' : 'image'; };
      var nn = function (x) { return +(String(x || '').replace(/[^\d.]/g, '')) || 0; };
      var rows = bulk.value.split(/\r?\n/).map(function (l) { var c = l.split('\t'); if (c.length < 5 || !c[0].trim()) return null; return { name: c[0].trim().slice(0, 120), format: fmtOf(c[1]), spend: nn(c[2]), imp: nn(c[3]), clk: nn(c[4]), conv: nn(c[5]), rev: nn(c[6]), v3s: nn(c[7]), reach: nn(c[8]) }; }).filter(Boolean);
      if (!rows.length) { ui.toast('읽을 수 있는 줄이 없습니다 — 탭으로 구분된 9칸(광고 이름 · 형식 · 지출 …)'); return; }
      var b = db.batch();
      rows.slice(0, 400).forEach(function (r) { var id = 'P-' + r.name.replace(/[\/\s#?.\[\]]+/g, '_').slice(0, 80); r.media = 'meta'; r.src = 'paste'; r.status = '게재 중'; r.updatedAt = FV.serverTimestamp(); r.by = S.mid || ''; b.set(db.collection('d2c_creatives').doc(id), r, { merge: true }); });
      b.commit().then(function () { bulk.value = ''; ui.toast('소재 ' + rows.length + '개를 반영했습니다(같은 이름은 덮어씀).'); }).catch(function (e) { ui.toast('반영하지 못했습니다 — ' + (e.code || e.message)); });
    };
    var mine = C.list.slice().sort(function (a, b) { return (+b.spend || 0) - (+a.spend || 0); });
    return h('details', { class: 'panel sa-adin', open: !C.list.length ? true : null },
      h('summary', { class: 'label', text: '소재 입력 · ' + C.list.length + '개' }),
      ed ? h('div', { class: 'sa-ad-bulk' }, bulk, ui.btn('붙여넣기 반영', go, 'btn-line btn-sm')) : h('p', { class: 'meta', text: '편집 권한이 있어야 입력할 수 있습니다.' }),
      mine.length ? h('ul', { class: 'list' }, mine.slice(0, 40).map(function (x) {
        var st = ui.select([['게재 중', '게재 중'], ['중지', '중지']], x.status || '게재 중', { disabled: !ed });
        st.addEventListener('change', function () { db.collection('d2c_creatives').doc(x.id).set({ status: st.value }, { merge: true }); });
        return h('li', null, h('span', { class: 'grow', text: x.name + ' · ' + won(x.spend) + ' · ' + (x.src || '') }), st, ed ? ui.confirmBtn('삭제', function () { db.collection('d2c_creatives').doc(x.id).delete(); }) : null);
      })) : null);
  }


  /* ================= [데이터] 소재 — 이미지 갤러리 + 매체 연동 ================= */
  var SYNC = {
    meta: { name: 'Meta (페이스북 · 인스타그램)', api: 'Meta Marketing API', id: '광고 계정 ID (act_…)',
      gets: '광고(ad)별 썸네일 · 이미지(adcreatives: thumbnail_url, image_url) · 제목 · 본문 · CTA + insights(지출 · 노출 · 도달 · 빈도 · 클릭 · 구매 · 구매 금액 · 3초 재생)',
      steps: ['비즈니스 관리자 › 사용자 › 시스템 사용자 만들기', '시스템 사용자에 광고 계정 「광고 보기(ads_read)」 권한', 'Meta 앱(비즈니스 유형) 만들고 Marketing API 추가 → 장기 토큰 발급', '토큰은 서버 비밀값으로만 보관 — 여기에는 광고 계정 ID만 적습니다'] },
    gdn: { name: 'GDN (구글 디스플레이 네트워크)', api: 'Google Ads API', id: '고객 ID (123-456-7890)',
      gets: '디스플레이 광고(ad_group_ad)의 이미지 애셋 · 반응형 광고 제목 · 설명 + metrics(비용 · 노출 · 클릭 · 전환 · 전환 가치)',
      steps: ['Google Ads 관리자(MCC) 계정 › API 센터에서 개발자 토큰 신청(심사)', 'Google Cloud 프로젝트(fillts-web)에 Google Ads API 사용 설정 · OAuth 클라이언트', '광고 계정 연결(고객 ID) · 새로고침 토큰 발급', '토큰은 서버 비밀값으로만 보관'] },
    kakao: { name: '카카오모먼트', api: '카카오모먼트 API', id: '광고 계정 ID',
      gets: '소재(비즈보드 · 디스플레이) 이미지 · 문구 · 랜딩 + 보고서(비용 · 노출 · 클릭 · 전환)',
      steps: ['카카오 비즈니스에서 비즈니스 인증 · 광고 계정 확인', 'Kakao Developers 앱 만들고 카카오모먼트 API 권한 신청(심사)', '광고 계정에 앱 연결 · 토큰 발급', '토큰은 서버 비밀값으로만 보관'] }
  };
  function assets(view) {
    if (!C.loaded) { ui.put(view, ui.empty('불러오는 중…')); return; }
    var demo = !C.list.length; if (demo && !C.demo) C.demo = sample();
    var all = (demo ? C.demo : C.list).map(function (x) { return enrich(Object.assign({}, x)); });
    var tab = C.mtab || 'all', list = all.filter(function (x) { return tab === 'all' || x.media === tab; })
      .sort(function (a, b) { return (a.status === '중지') - (b.status === '중지') || b.spend - a.spend; });
    var cnt = function (k) { return all.filter(function (x) { return k === 'all' || x.media === k; }).length; };
    ui.put(view, ui.head('D2C · 데이터', '소재', h('span', { class: 'meta', text: demo ? '예시 소재 · 저장 안 됨' : '소재 ' + all.length + '개' })));
    if (demo) ui.put(view, h('div', { class: 'sa-demo' }, h('strong', { text: '예시 소재입니다.' }), ' Meta 6 · GDN 3 · 카카오모먼트 3. 그림은 실제 제품 사진이 아닌 예시 일러스트이고, 아래 「매체에서 가져오기」가 연결되면 각 매체의 실제 썸네일과 문구로 바뀝니다.'));
    ui.put(view,
      h('div', { class: 'sa-filters' }, h('div', { class: 'sa-seg', role: 'group' }, [['all', '전체'], ['meta', 'Meta'], ['gdn', 'GDN'], ['kakao', '카카오모먼트']].map(function (t) {
        return h('button', { type: 'button', class: tab === t[0] ? 'on' : '', 'aria-pressed': String(tab === t[0]), text: t[1] + ' ' + cnt(t[0]), onclick: function () { C.mtab = t[0]; HR.refresh(); } });
      })), h('span', { class: 'meta', text: '게재 중 먼저 · 광고비 순 · 성과 비교는 「광고」 메뉴' })),
      list.length ? h('ul', { class: 'as-grid' }, list.map(function (x) {
        return h('li', { class: 'as-card' + (x.status === '중지' ? ' off' : '') },
          h('div', { class: 'as-img as-' + (x.media || 'etc') }, x.thumb ? h('img', { src: x.thumb, alt: x.headline || x.name, loading: 'lazy' }) : h('span', { class: 'cr-noimg', text: '썸네일 없음' }),
            h('span', { class: 'as-media as-m-' + x.media, text: MEDIA[x.media] || x.media }), x.format === 'video' ? h('span', { class: 'as-video', text: '▶ 영상' }) : null),
          h('div', { class: 'as-body' },
            h('div', { class: 'as-name', text: x.name }),
            x.headline ? h('div', { class: 'as-head', text: x.headline }) : null,
            x.body ? h('div', { class: 'meta', text: x.body }) : null,
            h('div', { class: 'as-tags' }, x.cta ? h('span', { class: 'as-cta', text: x.cta }) : null, h('span', { class: 'as-st' + (x.status === '중지' ? ' off' : ''), text: x.status || '' }), x.campaign ? h('span', { class: 'meta', text: x.campaign }) : null),
            h('dl', { class: 'as-nums' },
              h('div', null, h('dt', { text: '광고비' }), h('dd', { text: won(x.spend) })), h('div', null, h('dt', { text: 'CTR' }), h('dd', { text: pc(x.clk, x.imp, 2) })),
              h('div', null, h('dt', { text: '구매' }), h('dd', { text: n0(x.conv) })), h('div', null, h('dt', { text: 'ROAS' }), h('dd', { class: x.roas >= 3 ? 'red' : '', text: x.spend ? x.roas.toFixed(2) : '—' })))));
      })) : ui.empty('이 매체의 소재가 없습니다.'),
      syncPanel());
  }
  function syncPanel() {
    var cfg = (HR.D2C && HR.D2C.G.cfg && HR.D2C.G.cfg.sync) || {}, ed = canEdit();
    return ui.panel('매체에서 가져오기 — 썸네일 · 문구 · 성과 자동 수집', h('span', { class: 'meta', text: '연결되면 하루 1회(새벽) 지난 30일치를 가져옵니다' }),
      h('div', { class: 'as-sync' }, ['meta', 'gdn', 'kakao'].map(function (k) {
        var m = SYNC[k], c = cfg[k] || {};
        var id = ui.input({ value: c.account || '', placeholder: m.id, disabled: !ed, maxlength: 40 });
        id.addEventListener('change', function () { var o = {}; o[k] = { account: id.value.trim() }; db.doc('d2c_docs/sales').set({ sync: o }, { merge: true }).then(function () { ui.toast(m.name + ' 계정 ID를 저장했습니다.'); }); });
        return h('section', { class: 'as-sync-c' },
          h('div', { class: 'as-sync-h' }, h('span', { class: 'as-media as-m-' + k, text: MEDIA[k] }), h('span', { class: 'as-sync-st', text: c.lastSync ? '연결됨 · 마지막 ' + c.lastSync : '연결 안 됨' })),
          h('div', { class: 'strong', text: m.api }),
          h('p', { class: 'meta', text: '가져오는 것: ' + m.gets }),
          ui.field(m.id, id),
          h('button', { type: 'button', class: 'btn btn-sm', disabled: true, title: '서버 함수(d2cSync) 배포 후 사용', text: '지금 가져오기' }),
          h('details', { class: 'as-steps' }, h('summary', { text: '연결 준비 (대표님 몫)' }), h('ol', null, m.steps.map(function (t) { return h('li', { text: t }); }))));
      })),
      h('p', { class: 'meta sa-note', text: '썸네일은 매체 주소가 며칠 뒤 만료되고 사내 웹 보안 설정상 외부 이미지가 막히므로, 가져올 때 Firebase Storage에 복사해 그 주소로 보여 줍니다. 토큰이 준비되면 서버 함수(d2cSync)를 배포해 「지금 가져오기」를 켭니다.' }));
  }
  HR.register('creative', { render: render });
  HR.register('assets', { render: assets });
})();

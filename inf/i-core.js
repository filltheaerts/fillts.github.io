/* fillts Influencer — 데이터 구독 · 단계 정의 · 공통 화면 조각
   컬렉션: inf_scans(탐색 결과, 서버 작성) · inf_creators(파이프라인, 문서 ID = 유튜브 채널 ID) · inf_config/main(메일 템플릿 · 브랜드)
           inf_mail(메일 발송 기록, 서버 작성) · inf_status/quota(하루 탐색 사용량, 서버 작성)
   권한: 구성원 전원 (core.js APPS open) — 서버 보안 규칙이 최종 판정한다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var I = HR.I = { scans: [], creators: [], mail: [], cfg: {}, quota: {}, loaded: {}, V: {} };
  I.FN = 'https://asia-northeast3-fillts-web.cloudfunctions.net/';

  HR.APP.onStart = function (sub) {
    var on = function (k) { return function (s) { I[k] = HR.rows(s); I.loaded[k] = true; }; };
    sub(db.collection('inf_scans').orderBy('at', 'desc').limit(30), on('scans'));
    sub(db.collection('inf_creators'), on('creators'));
    sub(db.collection('inf_mail').orderBy('at', 'desc').limit(60), on('mail'));
    sub(db.doc('inf_config/main'), function (s) { I.cfg = s.exists ? s.data() : {}; I.loaded.cfg = true; });
    sub(db.doc('inf_status/quota'), function (s) { I.quota = s.exists ? s.data() : {}; });
  };

  /* ---------- 단계: 디벨롭 → 컨택 예정 → 메일 문의 → 협의 → 계약 → 시딩 → 업로드 대기 → 완료 (+ 보류 · 거절) ---------- */
  I.STAGES = [
    { id: 'review', name: '디벨롭', desc: '체크한 후보 — 채널 · 댓글 · 단가 감 보기', cls: '' },
    { id: 'contact', name: '컨택 예정', desc: '연락하기로 결정 — 연락처 확보', cls: '' },
    { id: 'mailed', name: '메일 문의', desc: '제안 메일 발송 — 회신 대기', cls: 'warn' },
    { id: 'talk', name: '협의', desc: '회신 받음 — 조건 · 단가 · 일정 협의', cls: 'warn' },
    { id: 'contract', name: '계약', desc: '계약 성사 — 조건 확정', cls: 'red' },
    { id: 'seeding', name: '시딩', desc: '제품 발송 — 수령 확인', cls: 'red' },
    { id: 'waiting', name: '업로드 대기', desc: '콘텐츠 업로드를 기다리는 중', cls: 'red' },
    { id: 'done', name: '완료', desc: '업로드 확인 · 성과 기록', cls: '' },
    { id: 'drop', name: '보류 · 거절', desc: '지금은 진행하지 않음', cls: 'mute' }
  ];
  I.ST = {}; I.STAGES.forEach(function (s, i) { s.no = i; I.ST[s.id] = s; });
  I.stName = function (id) { return (I.ST[id] || I.ST.review).name; };
  I.stTag = function (id) { var s = I.ST[id] || I.ST.review; return ui.tag(s.name, s.cls); };
  I.DEAL_TYPES = ['제품 협찬', '유료 광고', '제품 + 유료', '수익 배분 (어필리에이트)'];
  I.CARRIERS = ['CJ대한통운', '우체국택배', '한진택배', '롯데택배', '로젠택배', '퀵 · 직접 전달', '기타'];

  /* ---------- 포맷 ---------- */
  I.cnt = function (n) {
    n = +n || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + '만';
    return n.toLocaleString('ko-KR');
  };
  // 업로드 평균 주기 — 「N일마다」 (gapDays 없으면 주당 업로드 수로 계산)
  I.gap = function (c) {
    var g = c && c.gapDays ? c.gapDays : c && c.perWeek ? 7 / c.perWeek : 0;
    if (!g) return '—';
    return g < 1.5 ? '매일' : (g < 10 ? Math.round(g * 10) / 10 : Math.round(g)) + '일마다';
  };
  // 예상 견적 (전용 영상 1편, 원) — 중앙 조회수 × 25 ~ 50원, 하한 20 ~ 40만원. 참여율이 높으면(4%↑) 10% 가산
  // 국내 마이크로 유튜버 브랜디드 단가 관행을 단순화한 어림값 — 실제 견적은 계약 조건(deal.fee)에 적는다
  I.estimate = function (ch) {
    var v = (ch && ch.median) || 0;
    if (!v) return null;
    var k = ch.engage >= 0.04 ? 1.1 : 1;
    var r = function (x) { return Math.round(x / 50000) * 50000; };
    return [Math.max(200000, r(v * 25 * k)), Math.max(400000, r(v * 50 * k))];
  };
  I.manwon = function (n) { n = Math.round((+n || 0) / 10000); return n >= 10000 ? (Math.round(n / 1000) / 10) + '억' : n.toLocaleString('ko-KR') + '만'; };
  I.estText = function (ch) { var e = I.estimate(ch); return e ? I.manwon(e[0]) + '~' + I.manwon(e[1]) : '—'; };
  I.pct = function (x) { return (Math.round((+x || 0) * 1000) / 10) + '%'; };
  I.won = function (n) { return n ? Math.round(n).toLocaleString('ko-KR') + '원' : ''; };
  I.ms = function (ts) { return ts && ts.toMillis ? ts.toMillis() : (typeof ts === 'number' ? ts : 0); };
  I.daysSince = function (ts) { var m = I.ms(ts); return m ? Math.floor((Date.now() - m) / 86400000) : null; };
  I.chUrl = function (ch) { return 'https://www.youtube.com/' + (ch.handle && ch.handle[0] === '@' ? ch.handle : 'channel/' + ch.id); };
  I.vidUrl = function (id) { return 'https://www.youtube.com/watch?v=' + id; };
  I.thumb = function (ch, cls) {
    return ch && ch.thumb ? h('img', { class: 'in-thumb ' + (cls || ''), src: ch.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
      : h('span', { class: 'in-thumb in-thumb-x ' + (cls || ''), text: ((ch && ch.title) || '?').slice(0, 1) });
  };
  I.extLink = function (href, text, cls) { return h('a', { href: href, target: '_blank', rel: 'noopener noreferrer', class: cls || '', text: text }); };
  // 유튜브 채널로 가기 버튼 — 표 행 클릭(펼치기)과 겹치지 않게 전파를 막는다
  I.ytBtn = function (ch) { return h('a', { href: I.chUrl(ch), target: '_blank', rel: 'noopener noreferrer', class: 'in-yt', text: '▶ 유튜브', title: ch.title + ' 채널 열기', onclick: function (e) { e.stopPropagation(); } }); };

  /* ---------- 댓글 톤 → 한 줄 요약 ---------- */
  I.toneTags = function (t) {
    if (!t || !t.n) return ['댓글 정보 없음'];
    var out = [t.polite >= 0.5 ? '존댓말 위주' : t.casual >= 0.6 ? '반말 · 친구 톤' : '존댓말 · 반말 섞임'];
    if (t.ask >= 0.15) out.push('제품 · 정보 질문 많음');
    if (t.praise >= 0.3) out.push('칭찬 · 응원 많음');
    if (t.laugh >= 0.25) out.push('ㅋㅋ 많음');
    if (t.emoji >= 0.25) out.push('이모지 많음');
    if (t.cry >= 0.15) out.push('공감 ㅠㅠ');
    if (t.neg >= 0.08) out.push('부정 반응 있음');
    out.push(t.len >= 60 ? '긴 댓글' : t.len <= 20 ? '짧은 댓글' : '보통 길이');
    return out;
  };
  I.TONE_ROWS = [['polite', '존댓말'], ['casual', '반말'], ['praise', '칭찬 · 응원'], ['ask', '제품 · 정보 질문'], ['laugh', 'ㅋㅋ · ㅎㅎ'], ['emoji', '이모지'], ['cry', 'ㅠㅠ'], ['q', '물음표'], ['neg', '부정']];
  // 막대 비교 (씨드 vs 후보) — 너비는 CSSOM으로 (CSP가 style 속성을 막는다)
  I.toneBars = function (t, ref, refName) {
    if (!t || !t.n) return ui.empty('댓글을 읽지 못했습니다 (댓글 사용 중지 또는 영상 없음).');
    var bar = function (v, cls) { var f = h('span', { class: 'in-bar-fill ' + (cls || '') }); f.style.width = Math.round(Math.min(1, v || 0) * 100) + '%'; return h('span', { class: 'in-bar' }, f); };
    return h('div', { class: 'in-tone' },
      h('p', { class: 'meta', text: '댓글 ' + t.n + '개 · 평균 ' + t.len + '자' + (ref ? ' · 회색 막대 = ' + (refName || '씨드') : '') }),
      I.TONE_ROWS.map(function (r) {
        return h('div', { class: 'in-tone-row' }, h('span', { class: 'in-tone-k', text: r[1] }),
          h('span', { class: 'in-tone-bars' }, bar(t[r[0]]), ref && ref.n ? bar(ref[r[0]], 'ref') : null),
          h('span', { class: 'in-tone-v', text: Math.round((t[r[0]] || 0) * 100) + '%' }));
      }));
  };
  /* ---------- 소속 판정: 소속 유튜버 100% (확실) · 50% (애매) · 개인 0%
     메일 도메인이 개인 메일(gmail · naver …)이 아닌 회사 도메인이거나, 채널 설명에 소속사 · MCN · 회사 정보가 있으면 소속 ---------- */
  var FREE_MAIL = /@(gmail|googlemail|naver|daum|hanmail|kakao|nate|hotmail|outlook|live|msn|icloud|me|mac|yahoo|aol|proton|protonmail|zoho|gmx|yandex|qq|163)\./i;
  var MCN = /(샌드박스|sandbox\s*network|레페리|leferi|트레져\s*헌터|treasure\s*hunter|다이아\s*티비|dia\s*tv|cj\s*enm|비디오빌리지|video\s*village|쉐어하우스|디밀|어반브릭스|유커넥|아이스크리에이티브|크리에이터\s*그룹|글랜스tv|순수\s*컴퍼니|모티브\s*인텔리전스|코코넛\s*엔터|헤비급|더블\s*엠)/i;
  var STRONG = /(소속사|매니지먼트|management|\bmcn\b|엔터테인먼트|entertainment|에이전시|agency|주식회사|\(주\)|㈜|co\.,?\s*ltd|\binc\.|corp\.|소속\s*[:：])/i;
  var CO_DOMAIN = /@[^@\s]*(ent|entertainment|mcn|agency|creator|creators|media|studio|studios|company|corp|group|mgmt|management|network|partners|lab|labs)[^@\s]*\.[a-z.]+$/i;
  var WEAK = /(광고\s*문의|협찬\s*문의|비즈니스\s*문의|business\s*(inquir|contact)|비지니스\s*문의|담당자|매니저|manager|제휴\s*문의|섭외\s*문의)/i;
  I.agency = function (c) {
    var desc = String(c.desc || ''), emails = (desc.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).concat(c.email ? [c.email] : []);
    var coMail = emails.filter(function (e) { return !FREE_MAIL.test(e); })[0] || '';
    var m;
    if ((m = desc.match(MCN)) || (coMail && MCN.test(coMail))) return { p: 100, why: 'MCN · 소속사 이름: ' + (m ? m[1] : coMail) };
    if (coMail && CO_DOMAIN.test(coMail)) return { p: 100, why: '회사 도메인 메일: ' + coMail };
    if (coMail && (m = desc.match(STRONG))) return { p: 100, why: '회사 메일 ' + coMail + ' + 설명란 「' + m[1] + '」' };
    if ((m = desc.match(STRONG))) return { p: 100, why: '설명란에 회사 정보 「' + m[1] + '」' };
    if (coMail) return { p: 50, why: '개인 메일이 아닌 도메인: ' + coMail + ' (본인 도메인일 수도 있음)' };
    if ((m = desc.match(WEAK))) return { p: 50, why: '설명란 「' + m[1] + '」 — 담당자를 따로 두는 표현' };
    return { p: 0, none: !emails.length, why: emails.length ? '개인 메일: ' + emails[0] : '설명란에 연락처 · 회사 정보 없음 (유튜브 정보 탭의 비공개 메일은 직접 확인)' };
  };
  /* ---------- 뷰티 이력 (파란 테두리) · 메일 종류 ----------
     서버 deep()의 beauty = { n: 뷰티 영상 수, of: 본 영상 수, ad: 협찬 수, adBeauty: 뷰티 협찬 수, ex: 예시 제목 }
     예전 데이터(beauty 없음)는 키워드 · 최근 제목 · 설명으로 추정 */
  var BEAUTY_RE = /(화장품|스킨케어|메이크업|뷰티|클렌징|클렌저|세안|선크림|파운데이션|쿠션|립스틱|틴트|토너|세럼|앰플|에센스|수분크림|로션|마스크팩|올리브영|모공|각질|여드름|피부관리|화장대|향수|grwm|makeup|skincare|beauty|cosmetic)/i;
  I.beauty = function (ch) {
    ch = ch || {};
    var b = ch.beauty;
    if (b && b.of) {
      var on = b.n >= 2 || b.adBeauty >= 1;
      return { on: on, ad: b.adBeauty, text: on ? '뷰티' + (b.adBeauty ? ' · 협찬 ' + b.adBeauty : '') : '', why: '최근 ' + b.of + '편 중 뷰티 ' + b.n + '편 · 협찬 ' + b.ad + '편 (뷰티 협찬 ' + b.adBeauty + ')' + (b.ex && b.ex.length ? ' — 예: ' + b.ex.join(' / ') : '') };
    }
    var txt = (ch.keywords || []).join(' ') + ' ' + (ch.recent || []).map(function (v) { return v.title; }).join(' ') + ' ' + (ch.desc || '');
    var hits = (txt.match(new RegExp(BEAUTY_RE.source, 'gi')) || []).length;
    return { on: hits >= 2, guess: true, text: hits >= 2 ? '뷰티 추정' : '', why: '예전 탐색 데이터 — 키워드 · 최근 제목에서 뷰티 단어 ' + hits + '개 (↻ 새로고침하면 정확히 다시 셉니다)' };
  };
  I.beautyTag = function (ch) {
    var b = I.beauty(ch);
    return b.on ? h('span', { class: 'tag in-beauty' + (b.guess ? ' guess' : ''), title: b.why, text: b.text }) : null;
  };
  var FREE_RE = /@(gmail|googlemail|naver|daum|hanmail|kakao|nate|hotmail|outlook|live|icloud|me|yahoo)\./i;
  I.mailTag = function (email) {
    if (!email) return null;
    var free = FREE_RE.test(email);
    return h('span', { class: 'tag ' + (free ? 'in-mail-p' : 'in-mail-c'), title: email, text: free ? '개인 메일' : '회사 메일' });
  };
  I.agencyTag = function (c, short) {
    var a = I.agency(c);
    return h('span', { class: 'tag in-ag p' + a.p, title: a.why, text: a.p === 100 ? '소속 100%' : a.p === 50 ? '소속 50%' : a.none && !short ? '개인 · 정보 없음' : '개인' });
  };
  I.chips = function (list, cls) { return h('div', { class: 'in-chips' }, (list || []).map(function (x) { return h('span', { class: 'in-chip ' + (cls || ''), text: x }); })); };
  I.scoreBar = function (s) {
    var f = h('span', { class: 'in-score-fill' }); f.style.width = Math.max(0, Math.min(100, s || 0)) + '%';
    return h('span', { class: 'in-score' }, h('span', { class: 'in-score-track' }, f), h('b', { text: String(s || 0) }));
  };

  /* ---------- 데이터 ---------- */
  I.creator = function (id) { return I.creators.filter(function (c) { return c.id === id; })[0] || null; };
  I.scan = function (id) { return I.scans.filter(function (s) { return s.id === id; })[0] || null; };
  I.byStage = function (st) { return I.creators.filter(function (c) { return (c.stage || 'review') === st; }); };
  I.now = function () { return firebase.firestore.Timestamp.now(); };
  I.logItem = function (k, t) { return { at: I.now(), by: S.mid, k: k, t: String(t).slice(0, 300) }; };
  // 채널 스냅샷 — 탐색 결과에서 필요한 것만 (문서 1MB 한도 · 화면 속도)
  I.snap = function (c) {
    var o = {};
    ['id', 'title', 'handle', 'thumb', 'country', 'desc', 'email', 'insta', 'subs', 'views', 'videos', 'since', 'topics', 'median', 'avg', 'engage', 'cat', 'shorts', 'last', 'tone', 'sample', 'recent', 'reason', 'growth', 'recentMed', 'prevMed', 'cmtMed', 'cmtAvg', 'gapDays', 'cpk', 'perWeek', 'fit', 'beauty']
      .forEach(function (k) { if (c[k] != null) o[k] = c[k]; });
    o.keywords = (c.keywords || []).slice(0, 15);
    o.at = Date.now();
    return o;
  };
  // 탐색 후보 → 파이프라인 「디벨롭」 (이미 있는 채널은 건너뜀)
  // 탐색 제목: 씨드 탐색 = 「OO 와 비슷한 유튜버」, 조건 · 랜덤 탐색 = 키워드
  I.scanTitle = function (s) {
    if (!s) return '';
    if (s.seed && s.seed.title) return s.seed.title + ' 와 비슷한 유튜버';
    return ((s.opts || {}).preset === 'random' ? '랜덤 탐색 · ' : '조건 탐색 · ') + (s.concept || []).join(' · ');
  };
  I.addToPipe = function (cands, scan) {
    var b = db.batch(), n = 0, skip = 0;
    cands.forEach(function (c) {
      if (I.creator(c.id)) { skip++; return; }
      b.set(db.doc('inf_creators/' + c.id), {
        ch: I.snap(c), stage: 'review', stageAt: I.now(), owner: S.mid, score: c.score || 0,
        scanId: scan ? scan.id : '', seedTitle: scan ? I.scanTitle(scan) : '',
        email: c.email || '', insta: c.insta || '', manager: '', phone: '', memo: '', tags: (c.matched || []).slice(0, 5),
        log: [I.logItem('stage', scan ? '탐색 「' + I.scanTitle(scan) + '」에서 디벨롭으로 추가' : '디벨롭으로 추가')],
        mails: 0, by: S.mid, at: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(), updatedBy: S.mid
      });
      n++;
    });
    if (!n) return Promise.resolve({ n: 0, skip: skip });
    return b.commit().then(function () { return { n: n, skip: skip }; });
  };
  I.save = function (c, patch, logText, kind) {
    var d = Object.assign({}, patch, { updatedAt: FV.serverTimestamp(), updatedBy: S.mid });
    if (logText) d.log = FV.arrayUnion(I.logItem(kind || 'note', logText));
    return db.doc('inf_creators/' + c.id).update(d);
  };
  I.setStage = function (c, st, why) {
    if (!I.ST[st] || c.stage === st) return Promise.resolve();
    return I.save(c, { stage: st, stageAt: I.now() }, I.stName(c.stage) + ' → ' + I.stName(st) + (why ? ' · ' + why : ''), 'stage')
      .then(function () { ui.toast(c.ch.title + ' · ' + I.stName(st)); }).catch(ui.fail);
  };
  I.call = function (fn, body) {
    return HR.auth.currentUser.getIdToken().then(function (tok) {
      return fetch(I.FN + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || '서버 오류 (' + r.status + ')'); return j; });
    });
  };
  /* ---------- 여러 건 서버 호출을 안전하게: 한 건씩 · 간격 · 묶음 휴식 · 재시도 · 할당량 소진 시 즉시 멈춤 · 중지 버튼 ----------
     I.runQueue(items, function (item) { return Promise }, { gap: ms, every: n, rest: ms, onTick: fn, onDone: fn(result) }) → 큐 객체(q.stop()) */
  I.runQueue = function (items, task, opt) {
    opt = opt || {};
    var q = { i: 0, n: items.length, ok: 0, fail: 0, retry: 0, stopped: false, reason: '' };
    var gap = opt.gap || 1200, every = opt.every || 10, rest = opt.rest || 6000;
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var finish = function () { q.done = true; if (opt.onDone) opt.onDone(q); };
    var one = function (item, tries) {
      return task(item).then(function () { q.ok++; }, function (e) {
        var m = String((e && e.message) || '');
        if (/할당량|한도|quota/i.test(m)) { q.stopped = true; q.reason = m; return; }          // 할당량 소진 → 나머지는 내일
        if (/로그인|권한/.test(m)) { q.stopped = true; q.reason = m; return; }
        if (tries < 2) { q.retry++; return wait(tries ? 8000 : 3000).then(function () { return one(item, tries + 1); }); }   // 끊김 · 서버 오류 → 3초 · 8초 뒤 다시
        q.fail++;
      });
    };
    var next = function () {
      if (q.stopped || q.i >= items.length) return finish();
      var item = items[q.i];
      one(item, 0).then(function () {
        q.i++; if (opt.onTick) opt.onTick(q);
        if (q.stopped || q.i >= items.length) return finish();
        return wait(q.i % every === 0 ? rest : gap).then(next);   // 10건마다 6초 쉬기
      });
    };
    q.stop = function () { q.stopped = true; q.reason = q.reason || '중지했습니다'; };
    next();
    return q;
  };
  I.queueMsg = function (q, what) {
    var t = what + ' ' + q.ok + '건 완료' + (q.fail ? ' · 실패 ' + q.fail + '건' : '') + (q.retry ? ' · 재시도 ' + q.retry + '번' : '');
    if (q.stopped) t += ' — 멈춤: ' + q.reason + (q.n - q.i > 0 ? ' (남은 ' + (q.n - q.i) + '건은 다시 누르면 이어서 — 최근 6시간 안에 받은 채널은 건너뜀)' : '');
    return t;
  };
  I.FRESH_MS = 6 * 3600000;   // 6시간 안에 새로고침한 채널은 전체 새로고침에서 건너뛴다 (할당량 아끼기 · 이어 하기)
  I.quotaText = function () {
    var q = I.quota || {}, used = q.day === fmt.today() ? q.scans || 0 : 0;
    return '오늘 탐색 ' + used + ' / ' + (q.limit || 12) + '회';
  };

  /* ---------- 할 일 (Overview · 카드 경고) ---------- */
  I.todos = function (c) {
    var t = [], today = fmt.today(), st = c.stage || 'review', d = I.daysSince(c.stageAt);
    if (c.next && c.next.text && c.next.due && c.next.due <= today) t.push({ red: true, t: '할 일 ' + (c.next.due < today ? '지남' : '오늘') + ' — ' + c.next.text });
    if (st === 'contact' && !c.email) t.push({ t: '연락처(메일) 확보 필요' });
    if (st === 'contact' && c.email && d >= 2) t.push({ t: '컨택 예정 ' + d + '일째 — 제안 메일 보내기' });
    if (st === 'mailed') { var md = I.daysSince(c.lastMailAt || c.stageAt); if (md >= 5) t.push({ red: md >= 10, t: '회신 없음 ' + md + '일 — 리마인드 메일' }); }
    if (st === 'talk' && d >= 7) t.push({ t: '협의 ' + d + '일째 — 조건 정리 · 결정' });
    if (st === 'contract' && !(c.seed && c.seed.sent)) t.push({ t: '계약 완료 — 시딩(제품 발송) 필요' });
    if (st === 'seeding' && c.seed && c.seed.sent && !c.seed.recv && fmt.dk(today) - fmt.dk(c.seed.sent) >= 3) t.push({ t: '발송 후 수령 확인 필요' });
    if ((st === 'waiting' || st === 'seeding') && c.deal && c.deal.due && c.deal.due < today) t.push({ red: true, t: '업로드 예정일(' + fmt.dot(c.deal.due) + ') 지남' });
    return t;
  };

  /* ---------- 메일 템플릿 ---------- */
  I.DEFAULT_TPL = [
    { id: 't1', name: '첫 협업 제안', subject: '[{브랜드}] {채널명}님께 협업 제안드립니다',
      body: '안녕하세요, {채널명}님.\n{브랜드}를 만드는 fillts의 {보낸사람}입니다.\n\n최근 올려 주신 「{최근영상}」을 보고 연락드립니다. {채널명}님 콘텐츠와 구독자 분들의 반응이 저희가 전하고 싶은 이야기와 잘 맞는다고 생각했습니다.\n\n{브랜드소개}\n\n{제품}을(를) 직접 써 보시고, 마음에 드시면 콘텐츠로 소개해 주실 수 있을지 여쭙고 싶습니다.\n- 진행 방식: 제품 협찬 / 유료 광고 — 편하신 방식으로 말씀 주세요\n- 일정: 협의\n- 광고 표기: 「유료 광고 포함」 등 표시광고법에 맞춘 표기를 부탁드립니다\n\n관심 있으시면 이 메일로 회신 부탁드립니다. 단가표나 미디어킷을 함께 보내 주시면 검토가 빠릅니다.\n\n감사합니다.\n{보낸사람} {직함} | fillts\n{연락처}' },
    { id: 't2', name: '제품 시딩 제안', subject: '[{브랜드}] {채널명}님께 제품을 보내 드리고 싶습니다',
      body: '안녕하세요, {채널명}님.\nfillts {브랜드}의 {보낸사람}입니다.\n\n{제품}을(를) 부담 없이 먼저 써 보실 수 있도록 보내 드리고 싶어 연락드립니다. 콘텐츠 제작 의무는 없고, 써 보시고 마음에 드시면 자유롭게 소개해 주시면 됩니다.\n\n받으실 주소와 연락처를 회신해 주시면 바로 발송하겠습니다.\n\n감사합니다.\n{보낸사람} {직함} | fillts\n{연락처}' },
    { id: 't3', name: '회신 리마인드', subject: 'Re: [{브랜드}] {채널명}님께 협업 제안드립니다',
      body: '안녕하세요, {채널명}님.\n지난번 드린 협업 제안 메일을 확인하셨을까 하여 한 번 더 연락드립니다.\n\n바쁘신 중에 번거롭게 해 드려 죄송합니다. 지금은 어려우시다면 짧게라도 회신 주시면 다음 기회에 다시 인사드리겠습니다.\n\n감사합니다.\n{보낸사람} {직함} | fillts\n{연락처}' }
  ];
  I.templates = function () { return I.cfg.templates && I.cfg.templates.length ? I.cfg.templates : I.DEFAULT_TPL; };
  I.VARS = ['채널명', '구독자', '최근영상', '브랜드', '제품', '브랜드소개', '보낸사람', '직함', '연락처', '담당자'];
  I.fillTpl = function (text, c) {
    var me = S.members[S.mid] || {}, sig = ((I.cfg.sigs || {})[S.mid]) || {}, ch = c.ch || {};
    var v = { '채널명': ch.title || '', '구독자': I.cnt(ch.subs), '최근영상': ch.recent && ch.recent[0] ? ch.recent[0].title : '최근 영상',
      '브랜드': I.cfg.brand || '바인그라피', '제품': I.cfg.product || '저희 제품', '브랜드소개': I.cfg.intro || '',
      '보낸사람': me.name || '', '직함': sig.title || me.title || '', '연락처': [sig.phone, (S.user && S.user.email) || ''].filter(Boolean).join(' · '), '담당자': c.manager || ch.title || '' };
    return String(text || '').replace(/\{([^{}]+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }).replace(/\n{3,}/g, '\n\n');
  };
})();

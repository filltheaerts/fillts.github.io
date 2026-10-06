/* ============================================
   fillts HR — 근로기준법 계산 모듈 (순수 함수)
   시간: 분(min) / 휴가: 일(day, 1일 = 8시간) / 날짜: 'YYYY-MM-DD' (KST)
   ============================================ */
(function (root) {
  'use strict';

  var TZ = 'Asia/Seoul';

  /* ---------- 휴가 정책 (관리자가 설정에서 수정) ----------
     mode: annual(법정 연차 자동) | request(신청 시 N일) | yearly(매년 N일) | monthly(매월 N일) | tenure(N년 근속마다 N일) | milestone(근속 구간별 휴가·포상금)
     days: 일 단위(소수 가능, 0.5 = 4시간)                                   */
  var DEFAULT_POLICIES = [
    { id: 'annual', name: '연차', mode: 'annual', days: 15, paid: true, half: true, hours: true, note: '근로기준법 제60조 · 자동 부여/소멸/촉진' },
    // 회사 휴가
    { id: 'special', name: '특별휴가', mode: 'yearly', days: 5, paid: true, half: true, hours: true, cat: 'company', note: '매년 5일' },
    { id: 'longservice', name: '장기근속휴가', mode: 'milestone', paid: true, half: false, hours: false, cat: 'company',
      milestones: [{ years: 3, days: 10, bonus: 2000000 }, { years: 5, days: 15, bonus: 3000000 }, { years: 10, days: 22, bonus: 10000000, label: '1개월' }],
      note: '3년 10일 + 200만원 · 5년 15일 + 300만원 · 10년 1개월 + 1,000만원 · 근속기념일부터 1년 안에 사용' },
    { id: 'emergency', name: '비상', mode: 'request', days: 1, paid: true, half: true, hours: false, cat: 'company', note: '회사 부여' },
    { id: 'civil', name: '예비군·민방위', mode: 'request', days: 3, paid: true, half: true, hours: false, cat: 'company', note: '근로기준법 제10조 · 공민권 행사, 소집 기간' },
    // 경조사
    { id: 'wedding_self', name: '결혼 - 본인', mode: 'request', days: 5, paid: true, half: false, hours: false, cat: 'family_event', note: '회사 경조휴가' },
    { id: 'wedding_child', name: '결혼 - 자녀', mode: 'request', days: 1, paid: true, half: false, hours: false, cat: 'family_event', note: '회사 경조휴가' },
    { id: 'condolence_1', name: '조의 - 부모/배우자/자녀', mode: 'request', days: 5, paid: true, half: false, hours: false, cat: 'family_event', note: '회사 경조휴가' },
    { id: 'condolence_2', name: '조의 - 조부모/형제/자매', mode: 'request', days: 3, paid: true, half: false, hours: false, cat: 'family_event', note: '회사 경조휴가' },
    // 가족 · 출산
    { id: 'paternity', name: '배우자 출산휴가', mode: 'request', days: 20, paid: true, half: false, hours: false, cat: 'family', note: '남녀고용평등법 제18조의2 · 유급 20일, 출산 후 120일 내, 3회 분할' },
    { id: 'maternity', name: '출산전후휴가', mode: 'request', days: 90, paid: true, half: false, hours: false, cat: 'family', note: '근로기준법 제74조 · 90일(다태아 120일), 출산 후 45일 이상' },
    { id: 'family_care', name: '가족돌봄', mode: 'yearly', days: 10, paid: false, half: false, hours: false, cat: 'family', note: '남녀고용평등법 제22조의2 · 연 10일 무급 (일 단위)' },
    { id: 'infertility', name: '난임 치료', mode: 'yearly', days: 6, paid: true, half: false, hours: false, cat: 'family', note: '남녀고용평등법 제18조의3 · 연 6일 중 2일 유급' },
    // 건강
    { id: 'sick', name: '병가', mode: 'request', days: 30, paid: false, half: true, hours: true, cat: 'health', note: '회사 규정 (법정 유급 아님)' },
    { id: 'menstrual', name: '생리휴가', mode: 'monthly', days: 1, paid: false, half: false, hours: false, cat: 'health', note: '근로기준법 제73조 · 월 1일 무급, 청구 시 부여' }
  ];

  var DEFAULT_CONFIG = {
    companyName: '(주)필츠',
    ceoName: '김재우',
    bizNo: '',
    companyAddress: '서울특별시',
    fivePlus: true,          // 상시근로자 5인 이상
    minWage: 10320,          // 2026 최저시급 (고용노동부 고시)
    monthHours: 209,         // (40 + 주휴 8) × 4.345
    workStart: '09:00',
    workEnd: '18:00',
    autoOutHours: 7,         // 출근 후 N시간이 지나면 자동 퇴근 처리 (0 = 끔)
    annualBasis: 'fiscal',   // fiscal: 회계연도(1/1) 기준 | hire: 입사일 기준
    leavePolicies: DEFAULT_POLICIES,
    holidays: [
      '2026-01-01 1월 1일', '2026-02-16 설날', '2026-02-17 설날', '2026-02-18 설날',
      '2026-03-01 3·1절', '2026-03-02 대체공휴일', '2026-05-01 노동절', '2026-05-05 어린이날',
      '2026-05-24 부처님 오신 날', '2026-05-25 대체공휴일', '2026-06-03 지방 선거일', '2026-06-06 현충일',
      '2026-07-17 제헌절', '2026-08-15 광복절', '2026-08-17 대체공휴일', '2026-09-24 추석', '2026-09-25 추석',
      '2026-09-26 추석', '2026-10-03 개천절', '2026-10-05 대체공휴일', '2026-10-09 한글날', '2026-12-25 크리스마스',
      '2027-01-01 1월 1일', '2027-02-06 설날', '2027-02-07 설날', '2027-02-08 설날', '2027-02-09 대체공휴일',
      '2027-03-01 3·1절', '2027-05-01 노동절', '2027-05-05 어린이날', '2027-05-13 부처님 오신 날',
      '2027-06-06 현충일', '2027-07-17 제헌절', '2027-07-19 대체공휴일', '2027-08-15 광복절', '2027-08-16 대체공휴일',
      '2027-09-14 추석', '2027-09-15 추석', '2027-09-16 추석', '2027-10-03 개천절', '2027-10-04 대체공휴일',
      '2027-10-09 한글날', '2027-10-11 대체공휴일', '2027-12-25 크리스마스', '2027-12-27 대체공휴일'
    ]
  };

  // 법정 의무교육 (연간 이수 체크)
  var MANDATORY_EDU = [
    { id: 'harass', name: '직장 내 성희롱 예방교육', cycle: 'year', law: '남녀고용평등법 제13조 · 연 1회 이상' },
    { id: 'privacy', name: '개인정보보호 교육', cycle: 'year', law: '개인정보보호법 제28조 · 취급자 정기 교육' },
    { id: 'disability', name: '직장 내 장애인 인식개선 교육', cycle: 'year', law: '장애인고용촉진법 제5조의2 · 연 1회 이상' },
    { id: 'pension', name: '퇴직연금 가입자 교육', cycle: 'year', law: '근로자퇴직급여보장법 제32조 · 퇴직연금 도입 시 연 1회' },
    { id: 'safety', name: '산업안전보건 정기교육', cycle: 'quarter', law: '산업안전보건법 제29조 · 사무직 분기 3시간 (업종·규모별 적용 확인)' }
  ];

  /* ---------- KST 날짜 유틸 ---------- */
  var fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  function parts(d) {
    var p = {};
    fmt.formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
    if (p.hour === '24') p.hour = '00';
    return p;
  }
  function kstDate(d) { var p = parts(d); return p.year + '-' + p.month + '-' + p.day; }
  function kstHM(d) { var p = parts(d); return p.hour + ':' + p.minute; }
  function kstMin(d) { var p = parts(d); return (+p.hour) * 60 + (+p.minute); }

  function D(s) { return new Date(s + 'T00:00:00Z'); }
  function iso(dt) { return dt.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function addMonths(s, n) {
    var d = D(s), day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return iso(d);
  }
  function addYears(s, n) { return addMonths(s, n * 12); }
  function weekday(s) { return D(s).getUTCDay(); } // 0=일
  function mondayOf(s) { var w = weekday(s); return addDays(s, w === 0 ? -6 : 1 - w); }
  function daysBetween(a, b) { return Math.round((D(b) - D(a)) / 86400000); }
  function monthDays(ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    var n = new Date(Date.UTC(y, m, 0)).getUTCDate(), out = [];
    for (var i = 1; i <= n; i++) out.push(ym + '-' + (i < 10 ? '0' : '') + i);
    return out;
  }
  function hmToMin(hm) { if (!hm) return null; var a = hm.split(':'); return (+a[0]) * 60 + (+a[1]); }
  function minToHM(m) {
    if (m == null || isNaN(m)) return '';
    m = Math.round(m);
    var h = Math.floor(m / 60), mm = m % 60;
    return h + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  // 3.75 → "3일 6시간"
  function fmtDays(d) {
    if (d == null || isNaN(d)) return '-';
    var neg = d < 0; d = Math.abs(round3(d));
    var whole = Math.floor(d + 1e-9), hrs = round3((d - whole) * 8);
    var s = (whole ? whole + '일' : '') + (hrs ? (whole ? ' ' : '') + (Math.round(hrs * 10) / 10) + '시간' : '');
    return (neg ? '-' : '') + (s || '0일');
  }
  function fullMonths(from, to) {
    var a = D(from), b = D(to);
    var m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    if (b.getUTCDate() < a.getUTCDate()) m -= 1;
    return Math.max(0, m);
  }
  function tenureText(from, to) {
    if (!from || from > to) return '';
    var m = fullMonths(from, to), base = addMonths(from, m);
    var y = Math.floor(m / 12), mm = m % 12, d = daysBetween(base, to) + 1; // 입사일 포함
    return (y ? y + '년 ' : '') + (mm ? mm + '개월 ' : '') + d + '일';
  }

  /* ---------- 공휴일 ---------- */
  function holidayMap(cfg) {
    var map = {};
    (cfg.holidays || []).concat(cfg.holidaysSync || []).forEach(function (line) {
      var m = String(line).trim().match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);
      if (m) map[m[1]] = m[2] || '공휴일';
    });
    return map;
  }
  // 유급휴일: 주휴일(일), 노동절(전 사업장), 공휴일(5인 이상, 근로기준법 제55조②)
  function holidayName(s, cfg, hmap) {
    if (weekday(s) === 0) return '주휴일';
    var name = hmap[s];
    if (!name) return null;
    if (s.slice(5) === '05-01') return name;
    return cfg.fivePlus ? name : null;
  }
  function isWorkday(s, hmap) { var w = weekday(s); return w !== 0 && w !== 6 && !hmap[s]; }

  /* ---------- 하루 근로 (제50·54조) ---------- */
  function autoBreak(span) { return span >= 510 ? 60 : span >= 270 ? 30 : 0; }
  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }
  function nightMinutes(start, end) {
    var w = [[0, 360], [1320, 1800], [2760, 3240]], t = 0;
    w.forEach(function (x) { t += overlap(start, end, x[0], x[1]); });
    return t;
  }
  function calcDay(rec) {
    if (!rec || rec.inMin == null || rec.span == null) return null;
    var span = Math.max(0, rec.span);
    var brk = rec.brk != null ? rec.brk : autoBreak(span);
    var work = Math.max(0, span - brk);
    var night = Math.min(work, nightMinutes(rec.inMin, rec.inMin + span));
    return { span: span, brk: brk, work: work, night: night, autoBrk: rec.brk == null };
  }

  /* ---------- 주 단위 (제50·53·56조) ---------- */
  function calcWeek(days, cfg, hmap) {
    var r = { total: 0, regular: 0, ot: 0, night: 0, hol8: 0, holOver: 0 };
    var baseSum = 0, dailyOver = 0;
    days.forEach(function (d) {
      if (!d.calc) return;
      var w = d.calc.work;
      r.total += w; r.night += d.calc.night;
      if (holidayName(d.date, cfg, hmap)) { r.hol8 += Math.min(w, 480); r.holOver += Math.max(0, w - 480); }
      else { var over = Math.max(0, w - 480); dailyOver += over; baseSum += w - over; }
    });
    var weeklyOver = Math.max(0, baseSum - 2400);
    r.ot = dailyOver + weeklyOver;
    r.regular = baseSum - weeklyOver;
    r.over52 = r.total > 3120;
    r.near52 = r.total > 2880;
    return r;
  }
  function hourlyRate(pay, cfg) {
    if (!pay || !pay.amount) return 0;
    return pay.payType === 'hourly' ? pay.amount : pay.amount / (cfg.monthHours || 209);
  }
  function premiumPay(week, rate, cfg) {
    if (!rate) return 0;
    var h = function (m) { return m / 60; };
    if (cfg.fivePlus) return rate * (h(week.ot) * 1.5 + h(week.night) * 0.5 + h(week.hol8) * 1.5 + h(week.holOver) * 2.0);
    return rate * (h(week.ot) + h(week.hol8) + h(week.holOver));
  }
  function weeklyHolidayPay(weeklyHours, rate) {
    if (!rate || !weeklyHours || weeklyHours < 15) return 0;
    return Math.min(weeklyHours, 40) / 40 * 8 * rate;
  }
  function minWageCheck(pay, cfg) {
    if (!pay || !pay.amount) return null;
    var rate = hourlyRate(pay, cfg);
    return { rate: rate, ok: rate >= cfg.minWage, min: cfg.minWage, monthMin: cfg.minWage * (cfg.monthHours || 209) };
  }

  /* ---------- 휴가 일수 ---------- */
  // unit: day | am | pm | hours
  function leaveDays(unit, start, end, hoursN, hmap) {
    if (unit === 'am' || unit === 'pm') return 0.5;
    if (unit === 'hours') return round3((+hoursN || 0) / 8);
    if (!start || !end || end < start) return 0;
    var n = 0, s = start;
    while (s <= end) { if (isWorkday(s, hmap)) n++; s = addDays(s, 1); }
    return n;
  }
  // 휴가가 차지하는 근무일별 일수 (원장/월별 집계용)
  function leaveSpread(l, hmap) {
    if (l.unit && l.unit !== 'day') return [{ date: l.start, days: +l.days || 0 }];
    var out = [], s = l.start;
    while (s <= l.end) { if (isWorkday(s, hmap)) out.push({ date: s, days: 1 }); s = addDays(s, 1); }
    return out;
  }

  /* ---------- 연차 원장 (제60조) ----------
     buckets: 부여 단위(부여일, 소멸일, 일수). 사용은 소멸이 빠른 것부터 차감.
     반환: { events[], buckets[], balance(asOf), months(year) }                */
  function annualGrants(hire, cfg, until) {
    var g = [], oneYear = addYears(hire, 1);
    for (var k = 1; k <= 11; k++) {
      var d = addMonths(hire, k);
      if (d >= oneYear) break;
      g.push({ date: d, days: 1, exp: oneYear, kind: '월 개근' });
    }
    if (cfg.annualBasis === 'fiscal' && hire.slice(5) !== '01-01') {
      var j1 = (+hire.slice(0, 4) + 1) + '-01-01';
      g.push({ date: j1, days: round3(15 * daysBetween(hire, j1) / 365), exp: addYears(j1, 1), kind: '회계연도 비례' });
      for (var n = 2; ; n++) {
        var jn = addYears(j1, n - 1);
        if (jn > until) break;
        g.push({ date: jn, days: Math.min(25, 15 + Math.floor((n - 2) / 2)), exp: addYears(jn, 1), kind: '회계연도' });
      }
    } else {
      for (var y = 1; ; y++) {
        var gd = addYears(hire, y);
        if (gd > until) break;
        g.push({ date: gd, days: Math.min(25, 15 + Math.floor((y - 1) / 2)), exp: addYears(hire, y + 1), kind: '입사일' });
      }
    }
    return g;
  }

  function annualLedger(member, cfg, leaves, asOf, hmap) {
    if (!member || !member.hireDate) return null;
    var until = addYears(asOf, 1);
    var grants = annualGrants(member.hireDate, cfg, until);
    (member.leaveAdjs || []).forEach(function (a) {
      if (!a || !a.date || !+a.days) return;
      // 조정: 그 시점에 유효한 가장 늦은 부여분과 같은 날 소멸
      var exp = addYears(a.date, 1);
      grants.forEach(function (b) { if (b.date <= a.date && b.exp > a.date && b.kind !== '월 개근') exp = b.exp; });
      grants.push({ date: a.date, days: +a.days, exp: exp, kind: '조정', adj: true, note: a.note || '' });
    });
    var events = [];
    grants.forEach(function (b, i) { b.id = i; b.left = 0; events.push({ date: b.date, t: 0, type: b.adj ? 'adj' : 'grant', b: b }); events.push({ date: b.exp, t: 1, type: 'expire', b: b }); });
    leaves.forEach(function (l) {
      if (l.status !== 'approved') return;
      leaveSpread(l, hmap).forEach(function (u) { events.push({ date: u.date, t: 2, type: 'use', days: u.days, leave: l }); });
    });
    events.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.t - b.t; });

    var debt = 0, log = [], snap = null;
    function snapshot() { if (!snap) { snap = { debt: debt }; grants.forEach(function (b) { b.leftNow = b.left; }); } }
    events.forEach(function (e) {
      if (e.date > asOf) snapshot();
      if (e.type === 'grant' || e.type === 'adj') {
        if (e.b.days < 0) { debt += -e.b.days; log.push({ date: e.date, type: 'adj', days: e.b.days, b: e.b }); return; }
        e.b.left = e.b.days;
        // 선사용(마이너스) 상계
        var pay = Math.min(debt, e.b.left); e.b.left = round3(e.b.left - pay); debt = round3(debt - pay);
        log.push({ date: e.date, type: e.type, days: e.b.days, b: e.b });
      } else if (e.type === 'expire') {
        if (e.b.left > 0 && e.b.days > 0) { log.push({ date: e.date, type: 'expire', days: -e.b.left, b: e.b }); e.b.left = 0; }
        e.b.expired = true;
      } else {
        var need = e.days;
        grants.filter(function (b) { return b.days > 0 && b.date <= e.date && b.exp > e.date && b.left > 0; })
          .sort(function (a, b) { return a.exp < b.exp ? -1 : 1; })
          .forEach(function (b) { if (need <= 0) return; var take = Math.min(need, b.left); b.left = round3(b.left - take); need = round3(need - take); });
        if (need > 0) debt = round3(debt + need);
        log.push({ date: e.date, type: 'use', days: -e.days, leave: e.leave });
      }
    });

    function balanceAt(day) {
      var bal = 0;
      // 원장을 해당일까지 다시 계산 (월 말 잔여 표기용)
      log.forEach(function (x) { if (x.date <= day) bal += x.days; });
      return round3(bal);
    }
    function months(year) {
      var out = [];
      for (var m = 1; m <= 12; m++) {
        var ym = year + '-' + (m < 10 ? '0' : '') + m, row = { ym: ym, grant: 0, expire: 0, use: 0, adj: 0 };
        log.forEach(function (x) { if (x.date.slice(0, 7) === ym) row[x.type] = round3(row[x.type] + x.days); });
        var last = monthDays(ym); row.left = balanceAt(last[last.length - 1]);
        row.fiscal = cfg.annualBasis === 'fiscal' && m === 1;
        out.push(row);
      }
      return out;
    }
    var current = grants.filter(function (b) { return b.days > 0 && b.kind !== '월 개근' && b.kind !== '조정' && b.date <= asOf && b.exp > asOf; })[0];
    var promo = null;
    if (current) {
      // 사용촉진 (제61조): 만료 6개월 전부터 10일 이내 서면 촉구 → 만료 2개월 전까지 시기 지정 통보
      var p1 = addMonths(current.exp, -6);
      promo = { periodStart: current.date, periodEnd: current.exp, first: p1, firstTo: addDays(p1, 10), second: addMonths(current.exp, -2) };
    }
    var granted = 0, used = 0;
    log.forEach(function (x) {
      if (x.date > asOf) return;
      if ((x.type === 'grant' || x.type === 'adj') && x.days > 0 && (!x.b || x.b.exp > asOf)) granted += x.days;
    });
    snapshot();
    grants.forEach(function (b) { if (b.date <= asOf && b.exp > asOf && b.days > 0) used += b.days - b.leftNow; });
    var upcoming = grants.filter(function (b) { return b.date > asOf; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    var expiring = grants.filter(function (b) { return b.date <= asOf && b.exp > asOf && b.leftNow > 0; }).sort(function (a, b) { return a.exp < b.exp ? -1 : 1; })[0];
    if (expiring) expiring = { exp: expiring.exp, left: expiring.leftNow, days: expiring.days, kind: expiring.kind };
    return {
      log: log, buckets: grants, months: months, balance: balanceAt(asOf), granted: round3(granted), used: round3(used + snap.debt),
      debt: debt, promo: promo, next: upcoming, expiring: expiring, legal: cfg.fivePlus
    };
  }

  /* ---------- 기타 정책 잔여 ---------- */
  function policyBalance(p, member, leaves, asOf) {
    var used = function (from, to) {
      var s = 0;
      leaves.forEach(function (l) { if (l.type === p.id && (l.status === 'approved' || l.status === 'pending') && l.start >= from && l.start < to) s += +l.days || 0; });
      return round3(s);
    };
    if (p.mode === 'yearly') {
      var y = asOf.slice(0, 4), u = used(y + '-01-01', (+y + 1) + '-01-01');
      return { granted: p.days, used: u, left: round3(p.days - u), period: y + '년' };
    }
    if (p.mode === 'monthly') {
      var ym = asOf.slice(0, 7), um = used(ym + '-01', addMonths(ym + '-01', 1));
      return { granted: p.days, used: um, left: round3(p.days - um), period: ym.replace('-', '.') };
    }
    if (p.mode === 'tenure') {
      if (!member || !member.hireDate || !p.tenureYears) return null;
      var yrs = Math.floor(fullMonths(member.hireDate, asOf) / 12), k = Math.floor(yrs / p.tenureYears);
      if (k < 1) return { granted: 0, used: 0, left: 0, period: addYears(member.hireDate, p.tenureYears) + '부터', locked: true };
      var from = addYears(member.hireDate, k * p.tenureYears), to = addYears(from, 1);
      if (asOf >= to) return { granted: 0, used: 0, left: 0, period: '다음 부여 ' + addYears(member.hireDate, (k + 1) * p.tenureYears), locked: true };
      var ut = used(from, to);
      return { granted: p.days, used: ut, left: round3(p.days - ut), period: from + ' ~ ' + addDays(to, -1) };
    }
    if (p.mode === 'milestone') return milestoneBalance(p, member, used, asOf);
    if (p.mode === 'request') return { granted: p.days, perRequest: true };
    return null;
  }

  // 장기근속: 근속기념일(3·5·10년…)에 부여, 1년 안에 사용
  function milestoneBalance(p, member, used, asOf) {
    var ms = (p.milestones || []).slice().sort(function (a, b) { return a.years - b.years; });
    if (!member || !member.hireDate || !ms.length) return null;
    var yrs = Math.floor(fullMonths(member.hireDate, asOf) / 12), cur = null, next = null;
    ms.forEach(function (x) { if (x.years <= yrs) cur = x; else if (!next) next = x; });
    var nextText = next ? '다음: ' + next.years + '년 (' + addYears(member.hireDate, next.years) + ')' : '';
    if (!cur) return { granted: 0, used: 0, left: 0, locked: true, next: next, period: nextText };
    var from = addYears(member.hireDate, cur.years), to = addYears(from, 1);
    if (asOf >= to) return { granted: 0, used: 0, left: 0, locked: true, next: next, period: nextText };
    var u = used(from, to);
    return { granted: cur.days, used: u, left: round3(cur.days - u), current: cur, next: next, period: from + ' ~ ' + addDays(to, -1) };
  }
  function milestonesText(p) {
    return (p.milestones || []).map(function (x) { return x.years + '년 ' + (x.label || x.days + '일') + (x.bonus ? ' + ' + Math.round(x.bonus / 10000).toLocaleString('ko-KR') + '만원' : ''); }).join(' · ');
  }

  root.Labor = {
    TZ: TZ, DEFAULT_CONFIG: DEFAULT_CONFIG, DEFAULT_POLICIES: DEFAULT_POLICIES, MANDATORY_EDU: MANDATORY_EDU,
    kstDate: kstDate, kstHM: kstHM, kstMin: kstMin,
    addDays: addDays, addMonths: addMonths, addYears: addYears, weekday: weekday, mondayOf: mondayOf,
    daysBetween: daysBetween, monthDays: monthDays, hmToMin: hmToMin, minToHM: minToHM, round3: round3,
    fmtDays: fmtDays, fullMonths: fullMonths, tenureText: tenureText,
    holidayMap: holidayMap, holidayName: holidayName, isWorkday: isWorkday,
    autoBreak: autoBreak, calcDay: calcDay, calcWeek: calcWeek,
    hourlyRate: hourlyRate, premiumPay: premiumPay, weeklyHolidayPay: weeklyHolidayPay, minWageCheck: minWageCheck,
    leaveDays: leaveDays, leaveSpread: leaveSpread, milestonesText: milestonesText, annualGrants: annualGrants, annualLedger: annualLedger, policyBalance: policyBalance
  };
})(typeof window !== 'undefined' ? window : module.exports);

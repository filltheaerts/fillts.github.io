/* fillts Finance — 은행 거래내역 판독 (브라우저 · Cloud Functions 공용)
   은행마다 엑셀 모양이 달라서, 위쪽 40줄 안에서 「거래일자 · 출금 · 입금 · 잔액」 같은 머리글 줄을 찾아 열을 맞춘다.
   functions/bankparse.js는 이 파일의 복사본이다 — 고치면 둘 다 갱신한다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BankParse = factory();
})(this, function () {
  'use strict';

  /* ---------- 분류 ---------- */
  var CATS_IN = ['매출', '정부지원 · 정책자금', '투자 · 자본금', '대출 입금', '대표 가수금', '보증금 반환', '세금 환급', '이자 수입', '기타 입금'];
  var CATS_OUT = ['급여', '4대보험', '세금 · 공과금', '원료 · 생산(OEM)', '포장 · 부자재', '물류 · 배송', '마케팅 · 광고', '임대료 · 관리비',
    '소프트웨어 · 구독', '통신 · 인터넷', '세무 · 법무 · 자문', '카드대금', '대출 상환', '이자 · 수수료', '비품 · 장비', '출장 · 교통', '복리후생 · 식대', '보증금 · 예치금', '기타 지출', '미분류'];
  var TRANSFER = '내부 이체';
  var FINANCING = ['정부지원 · 정책자금', '투자 · 자본금', '대출 입금', '대표 가수금', '보증금 반환', '세금 환급'];   // 영업 수입이 아님 → 소진(burn) 계산에서 뺀다

  // [방향(in/out/''), 분류, 정규식] — 위에서부터 먼저 맞는 것
  var DEFAULT_RULES = [
    ['', TRANSFER, /본인계좌|내계좌|계좌간이체|자금이동|대체입금|대체출금/],
    ['in', '대표 가수금', /대표자|대표이사|차입금|가수금/],
    ['in', '세금 환급', /국고환급|세금환급|환급금/],
    ['out', '급여', /급여|월급|상여|임금|당타행\d+건|당행\d+건/],
    ['out', '이자 · 수수료', /중진공대출|대출이자/],
    ['out', '4대보험', /국민연금|건강보험|고용보험|산재보험|건보공단|국민건강|근로복지공단|4대보험|사회보험/],
    ['out', '세금 · 공과금', /국세|지방세|부가세|부가가치세|원천세|법인세|세무서|위택스|홈택스|지방소득세|구청|시청|등록면허|특징|세입금|주민세|서울시세|서울주민/],
    ['out', '임대료 · 관리비', /임대료|월세|관리비|임차료|스파크플러|SKV1|상인원/i],
    ['out', '통신 · 인터넷', /LGU|LG유플러스|유플러스|KT|SK브로드|레몬솔루션|인터넷전화/i],
    ['out', '세무 · 법무 · 자문', /세무|회계법인|회계사무|법무|법률|특허|변리/],
    ['out', '소프트웨어 · 구독', /모두싸인|가비아|카페24|cafe24|aws|amazon web|google ?cloud|gsuite|workspace|openai|anthropic|claude|notion|slack|adobe|figma|github|microsoft|ms365|zoom|canva/i],
    ['out', '마케팅 · 광고', /facebook|meta|페이스북|인스타|google ?ads|구글 ?광고|네이버 ?광고|카카오 ?광고|광고/i],
    ['out', '물류 · 배송', /품고|cj대한통운|대한통운|한진|로젠|우체국택배|배송|물류|택배|풀필먼트/i],
    ['out', '포장 · 부자재', /담아|비케이브로|창조피앤디|코스메팩/],
    ['out', '원료 · 생산(OEM)', /코스메카|코스맥스|한국콜마|콜마|oem|odm|원료|화장품제조|에코먼트|옵트바이오|인투바이오/i],
    ['out', '포장 · 부자재', /용기|튜브|부자재|포장|인쇄|박스|라벨/],
    ['out', '카드대금', /카드대금|카드결제|카드값|(신한|국민|kb|삼성|현대|롯데|하나|우리|bc|nh|농협)카드/i],
    ['out', '대출 상환', /대출상환|원리금|원금상환|대출금상환/],
    ['out', '이자 · 수수료', /이자|수수료|fee/i],
    ['out', '복리후생 · 식대', /식대|식비|간식|커피|배달의민족|요기요|쿠팡이츠/],
    ['out', '출장 · 교통', /택시|카카오t|코레일|ktx|srt|항공|주유|주차|톨게이트|하이패스/i],
    ['in', '정부지원 · 정책자금', /중진공|중소벤처|기술보증|기보|신용보증|신보|창업진흥|지원금|보조금|바우처|정책자금|tips|팁스/i],
    ['in', '대출 입금', /대출금|대출실행|대출입금|여신/],
    ['in', '투자 · 자본금', /투자|증자|자본금|주금|주식대금/],
    ['in', '대표 가수금', /김재우/],
    ['in', '이자 수입', /이자|결산이자|예금이자/],
    ['in', '매출', /쿠팡|네이버|스마트스토어|카카오페이|토스페이먼츠|이니시스|kcp|나이스페이|kg모빌|페이팔|paypal|shopify|amazon|아마존|정산/i]
  ];
  function categorize(t, userRules) {
    var dir = t.inAmt > 0 ? 'in' : 'out', text = ((t.desc || '') + ' ' + (t.memo || '')).toLowerCase();
    var ur = userRules || [];
    for (var i = 0; i < ur.length; i++) {
      var r = ur[i]; if (!r || !r.k) continue;
      if ((!r.dir || r.dir === dir) && text.indexOf(String(r.k).toLowerCase()) >= 0) return r.cat;
    }
    for (var j = 0; j < DEFAULT_RULES.length; j++) {
      var d = DEFAULT_RULES[j];
      if ((!d[0] || d[0] === dir) && d[2].test(text)) return d[1];
    }
    return dir === 'in' ? '기타 입금' : '미분류';
  }

  /* ---------- 머리글 찾기 ---------- */
  // 순서가 중요하다: 「입출금구분」은 kind, 「입금자명」은 desc가 먼저 잡아야 입금액 열로 오인하지 않는다
  var COLS = [
    ['kind', /^(구분|입출금?구분|거래구분|입\/?출금?|입출)$/],
    ['bal', /잔액|잔고|balance/i],
    ['date', /거래일|일자|일시|날짜|년월일|^date$|transaction ?date/i],
    ['time', /^(거래)?(시간|시각)$|^time$/i],
    ['desc', /기재내용|거래내용|^내용$|받는\s?분|보낸\s?분|입금자|의뢰인|수취인|거래기록|통장표시|상대|거래처|description|counterparty|payee/i],
    ['memo', /적요|메모|비고|memo|remark|note/i],
    ['branch', /거래점|취급점|처리점|거래\s?점|branch/i],
    ['out', /출금|찾으신|지급(금)?액|인출|withdraw|debit/i],
    ['inn', /입금|맡기신|deposit|credit/i],
    ['amount', /^(거래)?금액(\(원\))?$|^amount$/i]
  ];
  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function mapHeader(row) {
    var m = {}, n = 0;
    row.forEach(function (cell, ci) {
      var s = clean(cell).replace(/\(원\)|\[원\]|원$/, '').trim();
      if (!s || s.length > 20) return;
      for (var i = 0; i < COLS.length; i++) {
        if (COLS[i][1].test(s)) {
          var k = COLS[i][0];
          if (k === 'desc' || k === 'memo') { (m[k] = m[k] || []).push(ci); }
          else if (m[k] == null) m[k] = ci;
          else continue;
          n++; break;
        }
      }
    });
    m._score = n;
    return m;
  }
  function findHeader(rows) {
    var best = null;
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var m = mapHeader(rows[r] || []);
      if (m.date == null || (m.out == null && m.inn == null && m.amount == null)) continue;
      if (m._score >= 3 && (!best || m._score > best.m._score)) best = { r: r, m: m };
    }
    return best;
  }

  /* ---------- 값 ---------- */
  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v).replace(/[,\s원₩]/g, '');
    if (!s || s === '-') return 0;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    var x = parseFloat(s.replace(/[()+\-]/g, ''));
    return isNaN(x) ? 0 : (neg ? -x : x);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateOf(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && v > 20000 && v < 80000) {   // 엑셀 날짜 일련번호 (소수부 = 시각)
      var d = new Date(Math.round((v - 25569) * 86400000));
      var t = v % 1 ? pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) : '';
      return { d: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), t: t };
    }
    if (v instanceof Date && !isNaN(v)) return { d: v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate()), t: '' };
    var s = clean(v), m = s.match(/(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/) || s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    var y = +m[1], mo = +m[2], da = +m[3];
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    var tm = s.slice(m.index + m[0].length).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return { d: y + '-' + pad(mo) + '-' + pad(da), t: tm ? pad(+tm[1]) + ':' + tm[2] + ':' + (tm[3] || '00') : '' };
  }
  function timeOf(v) {
    if (typeof v === 'number' && v >= 0 && v < 1) { var s = Math.round(v * 86400); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); }
    var m = clean(v).match(/(\d{1,2}):?(\d{2}):?(\d{2})?/);
    return m ? pad(+m[1]) + ':' + m[2] + ':' + (m[3] || '00') : '';
  }
  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }

  var BANKS = [['신한은행', /신한/], ['KB국민은행', /국민은행|KB국민|kbstar/i], ['IBK기업은행', /기업은행|IBK/i], ['우리은행', /우리은행/], ['하나은행', /하나은행|KEB/i],
    ['NH농협', /농협|NH/], ['카카오뱅크', /카카오뱅크/], ['토스뱅크', /토스뱅크/], ['SC제일은행', /제일은행/], ['iM뱅크', /대구은행|iM뱅크/i], ['부산은행', /부산은행/], ['케이뱅크', /케이뱅크/]];

  /* ---------- 한 시트 판독 ---------- */
  function parseRows(rows, fileName) {
    rows = (rows || []).map(function (r) { return Array.isArray(r) ? r : []; });
    var hd = findHeader(rows);
    if (!hd) return { ok: false, err: '거래일자 · 입금 · 출금 머리글 줄을 찾지 못했습니다.', rows: [] };
    var m = hd.m, pre = rows.slice(0, hd.r).map(function (r) { return r.map(clean).join(' '); }).join(' ') + ' ' + (fileName || '');
    var acctM = pre.match(/(\d{3,6}-\d{2,6}-\d{2,8}(?:-\d{1,3})?)/) || pre.match(/계좌\D{0,8}(\d{10,16})/);
    var acct = acctM ? acctM[1].replace(/\D/g, '').slice(-4) : '';
    var bank = ''; BANKS.some(function (b) { if (b[1].test(pre)) { bank = b[0]; return true; } return false; });
    var out = [], skipped = 0, seen = {};
    for (var r = hd.r + 1; r < rows.length; r++) {
      var row = rows[r]; if (!row.length) continue;
      var dt = dateOf(row[m.date]);
      if (!dt) { if (row.some(function (c) { return clean(c); })) skipped++; continue; }
      var tm = dt.t || (m.time != null ? timeOf(row[m.time]) : '');
      var inA = m.inn != null ? num(row[m.inn]) : 0, outA = m.out != null ? num(row[m.out]) : 0;
      if (m.amount != null && !inA && !outA) {
        var a = num(row[m.amount]), kind = m.kind != null ? clean(row[m.kind]) : '';
        if (/입/.test(kind)) inA = Math.abs(a); else if (/출|지급/.test(kind)) outA = Math.abs(a);
        else if (a >= 0) inA = a; else outA = -a;
      }
      if (inA < 0 && !outA) { outA = -inA; inA = 0; }
      if (outA < 0 && !inA) { inA = -outA; outA = 0; }
      if (!inA && !outA) { skipped++; continue; }
      var desc = (m.desc || []).map(function (c) { return clean(row[c]); }).filter(Boolean).join(' · ');
      var memo = (m.memo || []).map(function (c) { return clean(row[c]); }).filter(Boolean).join(' · ');
      if (/^(합계|총계|소계)/.test(desc || memo)) { skipped++; continue; }
      var t = { date: dt.d, time: tm, desc: desc.slice(0, 120), memo: memo.slice(0, 120), branch: m.branch != null ? clean(row[m.branch]).slice(0, 40) : '',
        inAmt: Math.round(inA), outAmt: Math.round(outA), bal: m.bal != null && clean(row[m.bal]) !== '' ? Math.round(num(row[m.bal])) : null, acct: acct, bank: bank };
      var key = [acct, t.date, t.time, t.inAmt, t.outAmt, t.bal, t.desc, t.memo].join('|');
      seen[key] = (seen[key] || 0) + 1;
      t.id = 'tx_' + hash(key + (seen[key] > 1 ? '#' + seen[key] : ''));
      out.push(t);
    }
    // 파일 안 순서 → seq (늘 오래된 것이 작게). 은행마다 최신순/과거순이 다르다
    var desc0 = out.length > 1 && (out[0].date + out[0].time) > (out[out.length - 1].date + out[out.length - 1].time);
    out.forEach(function (t, i) { t.seq = desc0 ? out.length - i : i + 1; });
    return { ok: out.length > 0, err: out.length ? '' : '거래 줄이 없습니다.', rows: out, skipped: skipped, bank: bank, acct: acct, headerRow: hd.r + 1 };
  }

  /* ---------- 파일 → 통합문서 ---------- */
  function utf8ok(bytes) { try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch (e) { return false; } }
  function decodeText(bytes) { return utf8ok(bytes) ? new TextDecoder('utf-8').decode(bytes) : new TextDecoder('euc-kr').decode(bytes); }
  function readBytes(XLSX, bytes, name) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var head = ''; for (var i = 0; i < Math.min(bytes.length, 512); i++) head += String.fromCharCode(bytes[i]);
    var isZip = bytes[0] === 0x50 && bytes[1] === 0x4b, isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf;
    // CSV · HTML로 된 「가짜 xls」(일부 은행)는 한글 인코딩(EUC-KR)을 직접 풀어서 넘긴다
    if (!isZip && !isOle && (/\.csv$|\.txt$/i.test(name || '') || /^\s*(﻿)?\s*</.test(head.replace(/^\xef\xbb\xbf/, '')))) {
      return XLSX.read(decodeText(bytes).replace(/^﻿/, ''), { type: 'string', raw: true });
    }
    return XLSX.read(bytes, { type: 'array' });
  }
  function parseWorkbook(XLSX, wb, fileName) {
    var best = null;
    wb.SheetNames.forEach(function (sn) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
      var p = parseRows(rows, fileName + ' ' + sn); p.sheet = sn;
      if (!best || p.rows.length > best.rows.length) best = p;
    });
    return best || { ok: false, err: '시트가 없습니다.', rows: [] };
  }

  return { CATS_IN: CATS_IN, CATS_OUT: CATS_OUT, TRANSFER: TRANSFER, FINANCING: FINANCING, categorize: categorize,
    parseRows: parseRows, parseWorkbook: parseWorkbook, readBytes: readBytes, dateOf: dateOf, num: num, hash: hash };
});

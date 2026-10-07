/* fillts Finance — 세무사 전달 패키지(엑셀 + 메일) · 설정 */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, BP = window.BankParse;
  var V = { ym: '' };
  var EVN = { tax: '세금계산서', card: '카드 매출전표', cash: '현금영수증', receipt: '영수증 · 계약서', payroll: '급여 · 원천 (세무사)', na: '증빙 불필요' };
  var TYPE_NAME = { vendor: '거래처 대금', expense: '경비 정산', advance: '선급금 · 계약금', tax: '세금 · 공과금 · 보험료', etc: '기타' };

  function payreqPaid(ym) {
    var all = HR.load('fin@payreqAll', function () { return db.collection('hr_payreq').where('status', '==', 'paid').get().then(HR.rows); }) || [];
    return all.filter(function (r) { return (r.paidDate || '').slice(0, 7) === ym; }).sort(function (a, b) { return a.paidDate < b.paidDate ? -1 : 1; });
  }
  function pack(ym) {
    var tx = F.tx.filter(function (t) { return F.ym(t.date) === ym; }).sort(function (a, b) { return F.txKey(a) < F.txKey(b) ? -1 : 1; });
    var pr = payreqPaid(ym), person = pr.filter(function (r) { return r.payeeType === 'person'; });
    var noEv = tx.filter(function (t) { return t.outAmt > 0 && !F.isTransfer(t) && !t.evid; });
    var M = F.monthly(tx)[ym] || { inn: {}, out: {}, inSum: 0, outSum: 0 };
    return { ym: ym, tx: tx, pr: pr, person: person, noEv: noEv, M: M,
      inN: tx.filter(function (t) { return t.inAmt > 0; }).length, outN: tx.filter(function (t) { return t.outAmt > 0; }).length };
  }
  function workbook(P) {
    var wb = XLSX.utils.book_new();
    var add = function (name, rows, cols) { var ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = cols.map(function (w) { return { wch: w }; }); XLSX.utils.book_append_sheet(wb, ws, name); };
    var co = S.cfg.companyName || '(주)필츠';
    add('요약', [[co + ' ' + P.ym.replace('-', '년 ') + '월 세무 자료'], [], ['구분', '건수', '금액'],
      ['통장 입금', P.inN, P.M.inSum], ['통장 출금', P.outN, P.M.outSum], ['개인 지급 (3.3% 원천징수)', P.person.length, P.person.reduce(function (a, r) { return a + (r.total || 0); }, 0)],
      ['원천징수 세액', '', P.person.reduce(function (a, r) { return a + (r.wht || 0); }, 0)], ['증빙 확인 필요 출금', P.noEv.length, P.noEv.reduce(function (a, t) { return a + t.outAmt; }, 0)], [],
      ['분류', '입금', '출금']].concat(Object.keys(Object.assign({}, P.M.inn, P.M.out)).map(function (c) { return [c, P.M.inn[c] || '', P.M.out[c] || '']; })), [28, 12, 16]);
    add('통장 거래내역', [['날짜', '시각', '계좌', '입금', '출금', '잔액', '내용', '적요', '분류', '증빙', '메모']].concat(P.tx.map(function (t) {
      return [t.date, t.time || '', F.acctName(t), t.inAmt || '', t.outAmt || '', t.bal != null ? t.bal : '', t.desc || '', t.memo || '', t.cat || '', EVN[t.evid] || '', t.note || ''];
    })), [10, 8, 16, 12, 12, 14, 28, 16, 16, 14, 24]);
    add('원천징수 대상(개인)', [['지급일', '받는 분', '지급 총액', '원천징수(3.3%)', '실지급액', '내용', '요청자']].concat(P.person.map(function (r) {
      return [r.paidDate, r.payee, r.total || 0, r.wht || 0, r.paidAmount || 0, r.title, HR.name(r.memberId)];
    })).concat([[], ['※ 주민등록번호 · 주소는 보안상 시스템에 저장하지 않습니다. 원천세 신고에 필요한 인적사항은 별도로 전달드립니다.']]), [10, 14, 14, 14, 14, 30, 10]);
    add('입금요청 지급내역', [['지급일', '지급 유형', '계정 과목', '거래처', '개인/사업자', '요청 총액', '원천징수', '입금액', '제목', '메모']].concat(P.pr.map(function (r) {
      return [r.paidDate, TYPE_NAME[r.type] || '', r.account || '', r.payee || '', r.payeeType === 'person' ? '개인' : r.payeeType === 'biz' ? '사업자' : '', r.total || 0, r.wht || 0, r.paidAmount || 0, r.title || '', r.paidNote || ''];
    })), [10, 14, 14, 18, 10, 12, 12, 12, 28, 20]);
    var cards = F.card.filter(function (x) { return F.ym(x.date) === P.ym; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    add('법인카드 사용내역', [['승인일', '매입일', '카드', '가맹점', '사업자번호', '금액', '해외', '사용처', '사용내용', '통장 결제일']].concat(cards.map(function (x) {
      return [x.date, x.buyDate || '', (x.issuer || '') + (x.cardNo ? ' …' + x.cardNo : ''), x.merchant, x.biz || '', x.amount, x.foreign ? '해외' : '', x.cat || '', x.note || '', x.payDate || ''];
    })).concat([[], ['※ 지출은 통장 카드대금 출금으로 이미 반영 — 이 시트는 카드 사용처 증빙용입니다.']]), [10, 10, 14, 22, 12, 12, 6, 16, 30, 10]);
    add('증빙 확인', [['날짜', '계좌', '출금', '내용', '분류', '메모']].concat(P.noEv.map(function (t) { return [t.date, F.acctName(t), t.outAmt, [t.desc, t.memo].filter(Boolean).join(' · '), t.cat || '', t.note || '']; })), [10, 16, 12, 34, 16, 24]);
    return wb;
  }
  function fileName(P) { return 'fillts_' + P.ym + '_세무자료.xlsx'; }
  function defaultBody(P, acc) {
    var me = S.members[S.mid] || {}, y = +P.ym.slice(0, 4), m = +P.ym.slice(5, 7);
    var whtSum = P.person.reduce(function (a, r) { return a + (r.wht || 0); }, 0), paySum = P.person.reduce(function (a, r) { return a + (r.total || 0); }, 0);
    return [(acc.name ? acc.name + ' 세무사님' : '세무사님') + ', 안녕하세요. ' + (S.cfg.companyName || '(주)필츠') + ' ' + (me.name || '') + '입니다.', '',
      y + '년 ' + m + '월 거래 자료를 보내드립니다.', '',
      '· 통장 거래: 입금 ' + P.inN + '건 ' + F.won(P.M.inSum) + ' / 출금 ' + P.outN + '건 ' + F.won(P.M.outSum),
      '· 개인 지급(3.3% 원천징수): ' + P.person.length + '건 · 지급 ' + F.won(paySum) + ' · 원천세 ' + F.won(whtSum),
      '· 증빙 확인이 필요한 출금: ' + P.noEv.length + '건 (첨부 「증빙 확인」 시트)', '',
      '첨부: ' + fileName(P), '확인 부탁드립니다. 감사합니다.', '', (me.name || '') + ' 드림'].join('\n');
  }
  function b64(wb) { return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }); }

  function tax(view) {
    var ed = F.canEdit(), acc = F.cfg.accountant || {};
    if (!V.ym) V.ym = fmt.ymShift(F.thisYm(), -1);
    var months = {}; F.tx.forEach(function (t) { months[F.ym(t.date)] = 1; }); months[V.ym] = 1; months[fmt.ymShift(F.thisYm(), -1)] = 1;
    var P = pack(V.ym), sent = F.mail.filter(function (m) { return m.ym === V.ym; });
    var pick = ui.select(Object.keys(months).sort().reverse().map(function (m) { return [m, m.replace('-', '년 ') + '월']; }), V.ym, { 'aria-label': '대상 월', onchange: function () { V.ym = this.value; HR.refresh(); } });
    var to = ui.input({ type: 'email', value: acc.email || '', placeholder: '세무사 이메일' });
    var cc = ui.input({ value: acc.cc || '', placeholder: '참조 (쉼표로 여러 명)' });
    var subj = ui.input({ maxlength: 120, value: '[' + (S.cfg.companyName || '(주)필츠') + '] ' + P.ym.replace('-', '년 ') + '월 세무 자료' });
    var body = h('textarea', { rows: '13', maxlength: '4000', value: defaultBody(P, acc) });
    var msg = ui.msg();
    var send = function () {
      if (!to.value.trim()) return ui.err(msg, '세무사 이메일을 입력하세요 (설정 › 세무사에 저장하면 자동으로 채워집니다).');
      if (!P.tx.length && !P.pr.length) return ui.err(msg, '이 달의 거래가 없습니다.');
      this.disabled = true; var btn = this; ui.ok(msg, '보내는 중…');
      F.call('finMail', { ym: P.ym, to: to.value.trim(), cc: cc.value.trim(), subject: subj.value.trim(), text: body.value, filename: fileName(P), b64: b64(workbook(P)),
        counts: { tx: P.tx.length, person: P.person.length, noEv: P.noEv.length } })
        .then(function () { ui.ok(msg, '보냈습니다. 보낸 메일은 내 계정에도 숨은참조로 들어갑니다.'); ui.toast('세무사에게 보냈습니다.'); })
        .catch(function (e) { ui.err(msg, '보내지 못했습니다 — ' + e.message); }).then(function () { btn.disabled = false; });
    };
    var hist = h('ul', { class: 'list' }, F.mail.slice(0, 12).map(function (m) {
      return h('li', null, h('span', { class: 'meta fin-date', text: fmt.ts(m.at) }), h('span', { class: 'grow', text: m.ym.replace('-', '.') + ' · ' + m.to + (m.cc ? ' (참조 ' + m.cc + ')' : '') }), h('span', { class: 'meta', text: HR.name(m.by) + ' · ' + (m.counts ? m.counts.tx + '건' : '') }));
    }));
    if (!F.mail.length) hist.appendChild(h('li', { class: 'empty', text: '아직 보낸 기록이 없습니다.' }));
    ui.put(view, ui.head('Tax accountant', '세무사 전달', pick),
      F.kpi([['통장 입금', F.man(P.M.inSum), '', P.inN + '건'], ['통장 출금', F.man(P.M.outSum), '', P.outN + '건'], ['개인 지급 (3.3%)', P.person.length + '건', '', '원천세 ' + F.man(P.person.reduce(function (a, r) { return a + (r.wht || 0); }, 0))],
        ['입금요청 지급', P.pr.length + '건'], ['증빙 확인 필요', P.noEv.length + '건', P.noEv.length ? 'red' : ''], ['발송', sent.length ? fmt.ts(sent[0].at) : '안 보냄', sent.length ? '' : 'red']]),
      P.noEv.length ? h('p', { class: 'note' }, '증빙 표시가 없는 출금이 ' + P.noEv.length + '건 있습니다. ', h('a', { href: '#tx/list/noevid', text: '거래내역 › 증빙 확인' }), '에서 먼저 표시하면 세무사 문의가 줄어듭니다. 그대로 보내도 「증빙 확인」 시트로 함께 전달됩니다.') : null,
      ui.panel('Package · 첨부 엑셀 (시트 5개)', ui.btn('엑셀 받기', function () { XLSX.writeFile(workbook(P), fileName(P)); }, 'btn-line btn-sm'),
        h('ul', { class: 'list' }, [['요약', '입출금 합계 · 분류별 금액 · 원천징수 합계'], ['통장 거래내역', P.tx.length + '건 — 분류 · 증빙 · 메모 포함'], ['원천징수 대상(개인)', P.person.length + '건 — HR 입금요청 중 개인 지급'],
          ['입금요청 지급내역', P.pr.length + '건 — 계정 과목 · 거래처 · 원천징수'], ['증빙 확인', P.noEv.length + '건 — 증빙 표시가 없는 출금']].map(function (x) { return h('li', null, h('span', { class: 'strong grow', text: x[0] }), h('span', { class: 'meta', text: x[1] })); }))),
      ui.panel('Mail · 세무사에게 바로 보내기', null, ed ? h('div', { class: 'stack fin-form' },
        h('div', { class: 'row' }, ui.field('받는 사람', to, 'grow'), ui.field('참조', cc, 'grow')), ui.field('제목', subj), ui.field('본문', body), msg,
        h('div', { class: 'row' }, ui.btn('엑셀 첨부해서 보내기', send), h('span', { class: 'meta', text: '회사 메일(' + 'HR 알림 연동 계정' + ')로 발송 · 회신은 내 이메일로 옵니다' }))) : F.readOnlyNote()),
      ui.panel('Sent · 보낸 기록', null, hist));
  }

  /* ============ 설정 ============ */
  function settings(view, parts) {
    var ed = F.canEdit(), sub = parts[0] || '';
    ui.put(view, ui.head('Settings', '설정'), ui.tabs([['', '세무사 · 회사'], ['accounts', '계좌 · 잔액'], ['rules', '분류 규칙'], ['drive', '구글 드라이브']], sub, 'set'), F.readOnlyNote());
    var dis = ed ? null : true;
    if (sub === 'accounts') {
      var bal = F.balance(), accts = {};
      F.tx.forEach(function (t) { var k = F.acctKey(t); accts[k] = accts[k] || { n: 0, bank: t.bank, acct: t.acct }; accts[k].n++; });
      var ul = h('ul', { class: 'list' }, Object.keys(accts).map(function (k) {
        var a = accts[k], al = ui.input({ value: (F.cfg.accts || {})[k] || '', maxlength: 30, placeholder: '별칭 (예: 운영 통장)', disabled: dis });
        al.addEventListener('change', function () { var m = Object.assign({}, F.cfg.accts || {}); if (al.value.trim()) m[k] = al.value.trim(); else delete m[k]; F.cfgSet({ accts: m }).then(function () { ui.toast('저장했습니다.'); }).catch(ui.fail); });
        var b = bal.accts.filter(function (x) { return x.key === k; })[0];
        return h('li', null, h('div', { class: 'grow' }, h('div', { class: 'strong', text: [a.bank || '은행 미상', a.acct ? '…' + a.acct : ''].join(' ') }), h('div', { class: 'meta', text: a.n + '건' + (b ? ' · 잔액 ' + F.won(b.bal) + ' (' + fmt.dot(b.date) + ')' : '') })), al);
      }));
      if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '거래내역을 가져오면 계좌가 여기에 생깁니다.' }));
      var list = (F.cfg.cashAccts || []).slice(), cm = ui.msg();
      var rowsEl = h('div', { class: 'stack' });
      var draw = function () {
        ui.clear(rowsEl);
        list.forEach(function (m, i) {
          var nm = ui.input({ value: m.name || '', maxlength: 40, placeholder: '예: KB국민 일반 입출금', disabled: dis });
          var kd = ui.select(F.ACCT_KIND, m.kind || 'op', { disabled: dis });
          var am = F.moneyInput({ value: m.amount != null ? m.amount : '' }); if (!ed) am.disabled = true;
          var dt = ui.input({ type: 'date', value: m.asOf || fmt.today(), disabled: dis });
          var nt = ui.input({ value: m.note || '', maxlength: 80, placeholder: '메모', disabled: dis });
          var sync = function () { list[i] = Object.assign({}, list[i], { name: nm.value.trim(), kind: kd.value, amount: F.parseWon(am.value), asOf: dt.value, note: nt.value.trim() }); };
          [nm, kd, am, dt, nt].forEach(function (x) { x.addEventListener('change', sync); });
          rowsEl.appendChild(h('div', { class: 'row fin-acct-row' }, ui.field('통장', nm, 'grow'), ui.field('구분', kd), ui.field('잔액 (원)', am), ui.field('기준일', dt), ui.field('메모', nt, 'grow'),
            ed ? ui.btn('삭제', function () { list.splice(i, 1); draw(); }, 'btn-line btn-xs') : null));
        });
        if (!list.length) rowsEl.appendChild(h('p', { class: 'meta', text: '직접 입력한 통장이 없습니다.' }));
      };
      draw();
      var total = (F.cfg.cashAccts || []).reduce(function (x, m) { return x + (+m.amount || 0); }, 0);
      ui.put(view, ui.panel('Balances · 통장 잔액 직접 입력', h('span', { class: 'meta', text: '저장된 합계 ' + F.won(total) }),
        h('p', { class: 'meta', text: '통장 내역(엑셀)을 아직 안 올렸을 때 쓰는 잔액입니다. 같은 통장의 거래내역을 가져오면 기준일이 더 최근인 쪽을 씁니다. 대표 개인자금은 여기가 아니라 자금조달 계획에 「대표 가수금」으로 넣습니다.' }),
        rowsEl, cm,
        ed ? h('div', { class: 'row' }, ui.btn('+ 통장 추가', function () { list.push({ name: '', kind: 'op', amount: 0, asOf: fmt.today() }); draw(); }, 'btn-line btn-sm'),
          ui.btn('저장', function () { F.cfgSet({ cashAccts: list.filter(function (m) { return m.name; }) }).then(function () { ui.ok(cm, '저장했습니다.'); }).catch(function (e) { ui.fail(e, cm); }); }, 'btn-sm')) : null),
        ui.panel('Accounts · 거래내역에서 찾은 계좌', null, ul));
    } else if (sub === 'rules') {
      var rules = F.cfg.rules || [];
      var k = ui.input({ maxlength: 40, placeholder: '내용에 이 글자가 있으면', disabled: dis }), dir = ui.select([['out', '출금'], ['in', '입금'], ['', '둘 다']], 'out', { disabled: dis });
      var cat = ui.select(BP.CATS_OUT.concat(BP.CATS_IN, [BP.TRANSFER]).map(function (c) { return [c, c]; }), '기타 지출', { disabled: dis });
      var rl = h('ul', { class: 'list' }, rules.map(function (r, i) {
        return h('li', null, h('span', { class: 'grow', text: '「' + r.k + '」' }), h('span', { class: 'meta', text: r.dir === 'in' ? '입금' : r.dir === 'out' ? '출금' : '둘 다' }), ui.tag(r.cat, 'mute'),
          ed ? ui.confirmBtn('삭제', function () { var n = rules.slice(); n.splice(i, 1); F.cfgSet({ rules: n }).catch(ui.fail); }) : null);
      }));
      if (!rules.length) rl.appendChild(h('li', { class: 'empty', text: '아직 직접 만든 규칙이 없습니다. 거래내역에서 분류를 바꾸면 자동으로 생깁니다.' }));
      var recat = ui.msg();
      ui.put(view, ui.panel('Rules · 분류 규칙 (위에서부터 먼저 적용, 기본 규칙보다 우선)', null,
        ed ? h('div', { class: 'row' }, ui.field('키워드', k, 'grow'), ui.field('방향', dir), ui.field('분류', cat),
          ui.btn('추가', function () { if (!k.value.trim()) return; F.cfgSet({ rules: [{ k: k.value.trim(), dir: dir.value, cat: cat.value }].concat(rules).slice(0, 300) }).then(function () { k.value = ''; ui.toast('추가했습니다.'); }).catch(ui.fail); }, 'btn-sm')) : null,
        rl, ed ? h('div', { class: 'row' }, ui.btn('자동 분류 다시 적용', function () {
          var b = db.batch(), n = 0;
          F.tx.forEach(function (t) { if (t.catBy === 'user' || n >= 450) return; var c = BP.categorize(t, F.cfg.rules); if (c !== t.cat) { b.update(db.doc('fin_tx/' + t.id), { cat: c, catBy: 'auto' }); n++; } });
          (n ? b.commit() : Promise.resolve()).then(function () { ui.ok(recat, n + '건 다시 분류했습니다. (직접 고른 분류는 그대로)'); }).catch(function (e) { ui.fail(e, recat); });
        }, 'btn-line btn-sm'), recat) : null),
        h('p', { class: 'note', text: '기본 규칙: 급여 · 4대보험(국민연금 · 건강보험) · 세금(국세 · 부가세) · 임대료 · 세무/법무 · 구독(AWS · Notion · Slack 등) · 광고(메타 · 구글) · 물류(품고 · 대한통운) · OEM(코스메카 · 콜마) · 카드대금 · 정책자금(중진공 · 기보 · 신보) · 매출(쿠팡 · 네이버 · PG) 등. 직접 고른 분류는 다시 적용해도 바뀌지 않습니다.' }));
    } else if (sub === 'drive') {
      var d = F.cfg.drive || {}, st = F.status.drive || {};
      var url = ui.input({ value: d.url || '', placeholder: 'https://drive.google.com/drive/folders/…', disabled: dis });
      var dm = ui.msg();
      ui.put(view, ui.panel('Google Drive · 폴더 연결', null,
        h('ol', { class: 'fin-steps' },
          h('li', null, '구글 드라이브에 폴더를 하나 만듭니다 (예: 「필츠 통장 내역」).'),
          h('li', null, '폴더 공유 → 아래 서비스 계정을 「뷰어」로 추가합니다 (알림 보내기 해제).', h('div', { class: 'row' }, h('code', { class: 'fin-code', text: F.DRIVE_SA }),
            ui.btn('복사', function () { navigator.clipboard.writeText(F.DRIVE_SA).then(function () { ui.toast('복사했습니다.'); }); }, 'btn-line btn-xs'))),
          h('li', null, '폴더 주소를 아래에 붙여 넣고 저장합니다.'),
          h('li', null, '이후 은행 엑셀을 그 폴더에 올리면 매시 정각에 자동으로 거래내역에 들어갑니다 (이미 있는 거래는 건너뜀). 구글 시트로 변환된 파일도 읽습니다.')),
        h('div', { class: 'row' }, ui.field('폴더 주소', url, 'grow'), ed ? ui.btn('저장', function () {
          var m = url.value.match(/folders\/([A-Za-z0-9_-]{10,})/) || url.value.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || url.value.trim().match(/^([A-Za-z0-9_-]{20,})$/);
          if (url.value.trim() && !m) return ui.err(dm, '폴더 주소를 확인하세요 (drive.google.com/drive/folders/… 형식).');
          F.cfgSet({ drive: m ? { url: url.value.trim(), folderId: m[1] } : null }).then(function () { ui.ok(dm, m ? '저장했습니다. 거래내역 › 가져오기에서 「지금 확인」을 눌러 보세요.' : '연결을 해제했습니다.'); }).catch(function (e) { ui.fail(e, dm); });
        }, 'btn-sm') : null), dm,
        h('p', { class: 'meta', text: st.atMs ? '마지막 확인 ' + new Date(st.atMs).toLocaleString('ko-KR') + ' · ' + (st.ok ? '정상' : '오류 — ' + (st.err || '')) + ' · 파일 ' + (st.files || 0) + '개' : '아직 확인 전' })),
        h('p', { class: 'note', text: '서비스 계정은 공유받은 이 폴더만 읽을 수 있고, 파일을 고치거나 지우지 않습니다. 읽은 파일은 「가져온 파일」 기록에 남고, 같은 파일을 수정해 다시 올리면 바뀐 부분만 추가됩니다.' }));
    } else {
      var a = F.cfg.accountant || {};
      var nm = ui.input({ value: a.name || '', maxlength: 30, placeholder: '예: 홍길동', disabled: dis }), off = ui.input({ value: a.office || '', maxlength: 40, placeholder: '세무회계 사무소', disabled: dis });
      var em = ui.input({ type: 'email', value: a.email || '', maxlength: 80, disabled: dis }), cc = ui.input({ value: a.cc || '', maxlength: 200, placeholder: '쉼표로 여러 명', disabled: dis });
      var ph = ui.input({ value: a.phone || '', maxlength: 30, disabled: dis }), memo = h('textarea', { rows: '3', maxlength: '500', value: a.memo || '', placeholder: '기장료 · 마감일 · 전달 방식 메모', disabled: dis });
      var am = ui.msg();
      ui.put(view, ui.panel('Accountant · 계약 세무사', null, h('div', { class: 'stack fin-form' },
        h('div', { class: 'row' }, ui.field('세무사 이름', nm), ui.field('사무소', off, 'grow'), ui.field('전화', ph)),
        h('div', { class: 'row' }, ui.field('이메일', em, 'grow'), ui.field('참조', cc, 'grow')), ui.field('메모', memo), am,
        ed ? ui.btn('저장', function () {
          F.cfgSet({ accountant: { name: nm.value.trim(), office: off.value.trim(), email: em.value.trim(), cc: cc.value.trim(), phone: ph.value.trim(), memo: memo.value.trim() } })
            .then(function () { ui.ok(am, '저장했습니다. 세무사 전달 화면에 자동으로 채워집니다.'); }).catch(function (e) { ui.fail(e, am); });
        }) : null)));
    }
  }

  HR.register('tax', { render: tax });
  HR.register('set', { render: settings });
})();

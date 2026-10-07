/* fillts Finance — 통장 거래내역: 엑셀 가져오기(은행 자동 인식) · 구글 드라이브 동기화 · 분류 · 증빙 표시 */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV, BP = window.BankParse;
  var V = { ym: '', dir: '', cat: '', q: '', acct: '', limit: 200 };
  var EVID = [['', '증빙 —'], ['tax', '세금계산서'], ['card', '카드 매출전표'], ['cash', '현금영수증'], ['receipt', '영수증 · 계약서'], ['payroll', '급여 · 원천 (세무사)'], ['na', '증빙 불필요']];
  var pending = [];   // 미리보기 중인 파일들

  /* ---------- 가져오기 ---------- */
  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = BP.readBytes(XLSX, new Uint8Array(buf), file.name);
      var p = BP.parseWorkbook(XLSX, wb, file.name);
      p.name = file.name; p.size = file.size;
      var have = {}; F.tx.forEach(function (t) { have[t.id] = 1; });
      p.fresh = p.rows.filter(function (t) { return !have[t.id]; });
      p.bank = p.bank || ''; p.acct = p.acct || '';
      return p;
    }).catch(function (e) { return { name: file.name, ok: false, err: '읽지 못했습니다 — ' + (e.message || e), rows: [], fresh: [] }; });
  }
  function addFiles(files) {
    Promise.all(Array.prototype.map.call(files, readFile)).then(function (list) { pending = pending.concat(list); HR.go('tx/import'); HR.refresh(); });
  }
  function saveParsed(p, bank, acct, msg) {
    var rules = F.cfg.rules || [], now = FV.serverTimestamp(), list = p.fresh.slice();
    if (!list.length) { ui.ok(msg, '새 거래가 없습니다 (모두 이미 있음).'); return Promise.resolve(); }
    var chunks = [];
    for (var i = 0; i < list.length; i += 400) chunks.push(list.slice(i, i + 400));
    ui.ok(msg, '저장 중… (' + list.length + '건)');
    var fileRef = db.collection('fin_files').doc();
    return chunks.reduce(function (pr, ch) {
      return pr.then(function () {
        var b = db.batch();
        ch.forEach(function (t) {
          var d = Object.assign({}, t, { bank: bank, acct: acct });
          if (bank !== t.bank || acct !== t.acct) d.id = 'tx_' + BP.hash([acct, t.date, t.time, t.inAmt, t.outAmt, t.bal, t.desc, t.memo, t.id].join('|'));
          var id = d.id; delete d.id;
          d.cat = BP.categorize(d, rules); d.catBy = 'auto'; d.evid = ''; d.note = ''; d.src = 'upload'; d.file = p.name.slice(0, 120); d.fileId = fileRef.id; d.ym = d.date.slice(0, 7);
          d.by = S.mid; d.createdAt = now;
          b.set(db.doc('fin_tx/' + id), d);
        });
        return b.commit();
      });
    }, Promise.resolve()).then(function () {
      var dates = p.rows.map(function (t) { return t.date; }).sort();
      return fileRef.set({ name: p.name.slice(0, 120), src: 'upload', rows: p.rows.length, added: list.length, dup: p.rows.length - list.length, bank: bank, acct: acct,
        from: dates[0] || '', to: dates[dates.length - 1] || '', by: S.mid, at: now });
    }).then(function () { ui.ok(msg, list.length + '건 저장했습니다.'); pending = pending.filter(function (x) { return x !== p; }); ui.toast(p.name + ' · ' + list.length + '건 저장'); HR.refresh(); })
      .catch(function (e) { ui.fail(e, msg); });
  }
  function importView(view) {
    var ed = F.canEdit();
    var input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt,.htm,.html', multiple: true, class: 'sr-only', id: 'finFile', onchange: function () { addFiles(this.files); this.value = ''; } });
    var drop = h('label', { class: 'fin-drop', for: 'finFile' }, h('div', { class: 'strong', text: '은행 거래내역 파일을 여기에 끌어 놓거나 눌러서 선택' }),
      h('div', { class: 'meta', text: '엑셀(.xlsx · .xls) · CSV · 은행 「엑셀 저장」 파일(HTML형) — 신한 · 국민 · 기업 · 우리 · 하나 · 농협 · 카카오 · 토스 등. 여러 파일 한 번에 가능. 이미 있는 거래는 자동으로 건너뜁니다.' }), input);
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

    var previews = pending.map(function (p) {
      var msg = ui.msg();
      if (!p.ok) return ui.panel('File · ' + p.name, ui.btn('닫기', function () { pending = pending.filter(function (x) { return x !== p; }); HR.refresh(); }, 'btn-line btn-xs'), h('p', { class: 'form-msg', text: p.err || '판독 실패' }),
        h('p', { class: 'meta', text: '은행 사이트의 「엑셀 다운로드」 원본을 그대로 올려 주세요. 계속 안 되면 파일을 대표님께 공유해 주시면 형식을 추가합니다.' }));
      var bank = ui.input({ value: p.bank, maxlength: 20, placeholder: '은행' }), acct = ui.input({ value: p.acct, maxlength: 4, inputmode: 'numeric', placeholder: '계좌 끝 4자리' });
      var dates = p.rows.map(function (t) { return t.date; }).sort();
      var inS = p.rows.reduce(function (a, t) { return a + t.inAmt; }, 0), outS = p.rows.reduce(function (a, t) { return a + t.outAmt; }, 0);
      var sample = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['일시', '내용', '입금', '출금', '잔액', '자동 분류'].map(function (x, i) { return h('th', { class: i >= 2 && i <= 4 ? 'num' : '', text: x }); }))),
        h('tbody', null, p.rows.slice(0, 6).map(function (t) {
          return h('tr', null, h('td', { text: fmt.dot(t.date) + ' ' + (t.time || '').slice(0, 5) }), h('td', { text: [t.desc, t.memo].filter(Boolean).join(' · ') }),
            h('td', { class: 'num', text: t.inAmt ? F.won(t.inAmt) : '' }), h('td', { class: 'num', text: t.outAmt ? F.won(t.outAmt) : '' }), h('td', { class: 'num', text: t.bal != null ? F.won(t.bal) : '' }),
            h('td', { text: BP.categorize(t, F.cfg.rules) }));
        })));
      return ui.panel('File · ' + p.name, h('span', { class: 'meta', text: p.sheet ? '시트 ' + p.sheet + ' · ' + p.headerRow + '행 머리글' : '' }),
        F.kpi([['거래', p.rows.length + '건'], ['새 거래', p.fresh.length + '건', p.fresh.length ? '' : 'red'], ['기간', dates.length ? fmt.dot(dates[0]).slice(2) + ' ~ ' + fmt.dot(dates[dates.length - 1]).slice(2) : '-'],
          ['입금 합계', F.man(inS)], ['출금 합계', F.man(outS)], ['건너뛴 줄', (p.skipped || 0) + '줄']]),
        h('div', { class: 'row' }, ui.field('은행', bank), ui.field('계좌 끝 4자리', acct)),
        h('div', { class: 'table-wrap flat' }, sample), msg,
        h('div', { class: 'row' }, ed ? ui.btn(p.fresh.length ? '새 거래 ' + p.fresh.length + '건 저장' : '저장할 새 거래 없음', function () { saveParsed(p, bank.value.trim(), acct.value.replace(/\D/g, '').slice(-4), msg); }) : null,
          ui.btn('취소', function () { pending = pending.filter(function (x) { return x !== p; }); HR.refresh(); }, 'btn-line')));
    });

    var dv = F.status.drive || {}, folder = (F.cfg.drive || {}).folderId;
    var dmsg = ui.msg();
    var drive = ui.panel('Google Drive · 폴더에 올리면 자동 정리', h('a', { href: '#set/drive', class: 'meta', text: '연결 설정 →' }),
      folder ? h('p', null, '연결된 폴더의 새 엑셀 파일을 매시 정각에 확인해 거래내역에 넣습니다. ',
        h('span', { class: 'meta', text: dv.atMs ? '마지막 확인 ' + new Date(dv.atMs).toLocaleString('ko-KR') + ' · ' + (dv.ok ? '정상' : '오류: ' + (dv.err || '')) + (dv.added != null ? ' · 새 거래 ' + dv.added + '건' : '') : '아직 확인 전' }))
        : h('p', { class: 'meta', text: '아직 폴더가 연결되지 않았습니다. 설정 › 구글 드라이브에서 폴더 주소를 넣고, 그 폴더를 서비스 계정에 「뷰어」로 공유하면 됩니다.' }),
      folder && ed ? h('div', { class: 'row' }, ui.btn('지금 확인', function () {
        var b = this; b.disabled = true; ui.ok(dmsg, '드라이브 폴더를 확인하는 중…');
        F.call('finDriveSyncNow').then(function (r) { ui.ok(dmsg, '파일 ' + (r.files || 0) + '개 확인 · 새 파일 ' + (r.newFiles || 0) + '개 · 새 거래 ' + (r.added || 0) + '건'); })
          .catch(function (e) { ui.err(dmsg, '확인하지 못했습니다 — ' + e.message); }).then(function () { b.disabled = false; });
      }, 'btn-line btn-sm'), dmsg) : null);

    var files = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['가져온 시각', '파일', '출처', '계좌', '기간', '새 거래 / 전체'].map(function (x, i) { return h('th', { class: i === 5 ? 'num' : '', text: x }); }))),
      h('tbody', null, F.files.length ? F.files.map(function (f) {
        return h('tr', null, h('td', { text: fmt.ts(f.at) }), h('td', { text: f.name + (f.err ? ' — ' + f.err : '') }), h('td', { text: f.src === 'drive' ? '드라이브' : '업로드' }),
          h('td', { text: [f.bank, f.acct ? '…' + f.acct : ''].filter(Boolean).join(' ') }), h('td', { text: f.from ? fmt.dot(f.from).slice(2) + ' ~ ' + fmt.dot(f.to).slice(2) : '' }), h('td', { class: 'num', text: (f.added || 0) + ' / ' + (f.rows || 0) }));
      }) : h('tr', null, h('td', { colspan: '6', class: 'empty', text: '아직 가져온 파일이 없습니다.' }))));
    ui.put(view, ed ? drop : F.readOnlyNote(), previews, drive, ui.panel('History · 가져온 파일', null, h('div', { class: 'table-wrap flat' }, files)));
  }

  /* ---------- 목록 ---------- */
  function learnRule(t, cat) {
    var k = (t.desc || t.memo || '').split(' · ')[0].trim();
    if (!k || k.length < 2) return Promise.resolve();
    var rules = (F.cfg.rules || []).filter(function (r) { return !(r.k === k && r.dir === (t.inAmt > 0 ? 'in' : 'out')); });
    rules.unshift({ k: k.slice(0, 40), cat: cat, dir: t.inAmt > 0 ? 'in' : 'out' });
    return F.cfgSet({ rules: rules.slice(0, 300) });
  }
  function applyToSame(t, cat) {
    var k = (t.desc || t.memo || '').split(' · ')[0].trim(), dirIn = t.inAmt > 0;
    var same = F.tx.filter(function (x) { return x.id !== t.id && x.catBy !== 'user' && (x.inAmt > 0) === dirIn && ((x.desc || x.memo || '').split(' · ')[0].trim() === k); });
    var b = db.batch(); same.slice(0, 450).forEach(function (x) { b.update(db.doc('fin_tx/' + x.id), { cat: cat, catBy: 'rule' }); });
    return same.length ? b.commit().then(function () { return same.length; }) : Promise.resolve(0);
  }
  function filtered(mode) {
    return F.sortedTx().filter(function (t) {
      if (mode === 'uncat' && t.cat && t.cat !== '미분류') return false;
      if (mode === 'noevid' && !(t.outAmt > 0 && !F.isTransfer(t) && !t.evid)) return false;
      if (mode === 'check' && !t.check) return false;
      if (V.ym && F.ym(t.date) !== V.ym) return false;
      if (V.dir === 'in' && !(t.inAmt > 0)) return false;
      if (V.dir === 'out' && !(t.outAmt > 0)) return false;
      if (V.cat && t.cat !== V.cat) return false;
      if (V.acct && F.acctKey(t) !== V.acct) return false;
      if (V.q) { var q = V.q.toLowerCase(); if (((t.desc || '') + ' ' + (t.memo || '') + ' ' + (t.note || '') + ' ' + (t.inAmt || t.outAmt)).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
  }
  function exportXlsx(list, name) {
    var rows = [['날짜', '시각', '계좌', '입금', '출금', '잔액', '내용', '적요', '분류', '증빙', '메모']].concat(list.map(function (t) {
      return [t.date, t.time || '', F.acctName(t), t.inAmt || '', t.outAmt || '', t.bal != null ? t.bal : '', t.desc || '', t.memo || '', t.cat || '', (EVID.filter(function (e) { return e[0] === t.evid; })[0] || ['', ''])[1].replace('증빙 —', ''), t.note || ''];
    }));
    var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [10, 8, 16, 12, 12, 14, 28, 16, 16, 14, 24].map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, '거래내역');
    XLSX.writeFile(wb, name);
  }
  function listView(view, mode) {
    var ed = F.canEdit(), list = filtered(mode);
    var months = {}; F.tx.forEach(function (t) { months[F.ym(t.date)] = 1; });
    var accts = {}; F.tx.forEach(function (t) { accts[F.acctKey(t)] = F.acctName(t); });
    var allCats = BP.CATS_IN.concat(BP.CATS_OUT, [BP.TRANSFER]);
    var q = ui.input({ type: 'search', value: V.q, placeholder: '내용 · 금액 검색' });
    q.addEventListener('change', function () { V.q = q.value.trim(); HR.refresh(); });
    var bar = h('div', { class: 'toolbar fin-filters' },
      ui.select([['', '전체 기간']].concat(Object.keys(months).sort().reverse().map(function (m) { return [m, m.replace('-', '.')]; })), V.ym, { 'aria-label': '월', onchange: function () { V.ym = this.value; HR.refresh(); } }),
      ui.select([['', '입금 · 출금'], ['in', '입금만'], ['out', '출금만']], V.dir, { 'aria-label': '방향', onchange: function () { V.dir = this.value; HR.refresh(); } }),
      ui.select([['', '모든 분류']].concat(allCats.map(function (c) { return [c, c]; })), V.cat, { 'aria-label': '분류', onchange: function () { V.cat = this.value; HR.refresh(); } }),
      Object.keys(accts).length > 1 ? ui.select([['', '모든 계좌']].concat(Object.keys(accts).map(function (k) { return [k, accts[k]]; })), V.acct, { 'aria-label': '계좌', onchange: function () { V.acct = this.value; HR.refresh(); } }) : null,
      q, ui.btn('엑셀로 받기', function () { exportXlsx(list, 'fillts_거래내역_' + (V.ym || '전체') + '.xlsx'); }, 'btn-line btn-sm'));
    var inS = list.reduce(function (a, t) { return a + (t.inAmt || 0); }, 0), outS = list.reduce(function (a, t) { return a + (t.outAmt || 0); }, 0);
    var body = h('tbody');
    list.slice(0, V.limit).forEach(function (t) {
      var dirIn = t.inAmt > 0, opts = (dirIn ? BP.CATS_IN : BP.CATS_OUT).concat([BP.TRANSFER]);
      if (t.cat && opts.indexOf(t.cat) < 0) opts = [t.cat].concat(opts);
      var cat = ui.select(opts.map(function (c) { return [c, c]; }), t.cat || (dirIn ? '기타 입금' : '미분류'), { 'aria-label': '분류', class: 'fin-cat' + (!t.cat || t.cat === '미분류' ? ' warn' : ''), disabled: ed ? null : true });
      cat.addEventListener('change', function () {
        var c = cat.value;
        db.doc('fin_tx/' + t.id).update({ cat: c, catBy: 'user' }).then(function () { return learnRule(t, c); }).then(function () { return applyToSame(t, c); })
          .then(function (n) { ui.toast(n ? '분류를 바꾸고 같은 거래처 ' + n + '건도 함께 바꿨습니다. 다음부터 자동 적용됩니다.' : '분류를 바꿨습니다. 같은 거래처는 다음부터 자동 적용됩니다.'); }).catch(ui.fail);
      });
      var ev = t.outAmt > 0 && !F.isTransfer(t) ? ui.select(EVID, t.evid || '', { 'aria-label': '증빙', class: 'fin-evid' + (t.evid ? '' : ' muted'), disabled: ed ? null : true, onchange: function () { db.doc('fin_tx/' + t.id).update({ evid: this.value }).catch(ui.fail); } }) : null;
      var note = ui.input({ value: t.note || '', maxlength: 200, placeholder: '메모', class: 'fin-note', disabled: ed ? null : true });
      note.addEventListener('change', function () { db.doc('fin_tx/' + t.id).update({ note: note.value.trim() }).catch(ui.fail); });
      body.appendChild(h('tr', null, h('td', { class: 'fin-date', text: fmt.dot(t.date).slice(2) + (t.time ? ' ' + t.time.slice(0, 5) : '') }),
        h('td', null, h('div', { text: t.desc || t.memo || '(내용 없음)' }), h('div', { class: 'meta', text: [t.desc ? t.memo : '', F.acctName(t)].filter(Boolean).join(' · ') }),
          t.check ? h('div', { class: 'fin-check' }, h('span', { class: 'tag red', text: '확인' }), ' ' + t.check, ed ? ui.btn('확인 완료', function () { db.doc('fin_tx/' + t.id).update({ check: '', checkedAt: HR.FV.serverTimestamp() }).catch(ui.fail); }, 'btn-line btn-xs') : null) : null,
          t.src === 'reconstructed' ? h('div', { class: 'meta', text: '※ 통장 거래내역이 아니라 지급 증빙 · 잔액으로 재구성한 줄' }) : null),
        h('td', { class: 'num in', text: t.inAmt ? F.won(t.inAmt) : '' }), h('td', { class: 'num', text: t.outAmt ? F.won(t.outAmt) : '' }), h('td', { class: 'num meta', text: t.bal != null ? F.won(t.bal) : '' }),
        h('td', null, cat), h('td', null, ev), h('td', null, note),
        ed ? h('td', null, ui.confirmBtn('삭제', function () { db.doc('fin_tx/' + t.id).delete().catch(ui.fail); })) : null));
    });
    if (!list.length) body.appendChild(h('tr', null, h('td', { colspan: '9', class: 'empty', text: F.tx.length ? '조건에 맞는 거래가 없습니다.' : '아직 거래내역이 없습니다 — 「가져오기」에서 은행 엑셀을 올리세요.' })));
    var tb = h('table', { class: 'table fin-table fin-tx' }, h('thead', null, h('tr', null, ['일시', '내용', '입금', '출금', '잔액', '분류', '증빙', '메모', ed ? '' : null].filter(function (x) { return x !== null; }).map(function (x, i) { return h('th', { class: i >= 2 && i <= 4 ? 'num' : '', text: x }); }))), body);
    ui.put(view, F.kpi([['거래', list.length + '건'], ['입금', F.man(inS)], ['출금', F.man(outS)], ['순증감', F.man(inS - outS), inS - outS < 0 ? 'red' : ''],
      ['미분류', F.tx.filter(function (t) { return !t.cat || t.cat === '미분류'; }).length + '건'], ['증빙 미표시 출금', F.tx.filter(function (t) { return t.outAmt > 0 && !F.isTransfer(t) && !t.evid; }).length + '건']], 'fin-kpi-sm'),
      bar, h('div', { class: 'table-wrap' }, tb),
      list.length > V.limit ? h('div', { class: 'row' }, ui.btn('더 보기 (' + (list.length - V.limit) + '건 남음)', function () { V.limit += 300; HR.refresh(); }, 'btn-line btn-sm')) : null,
      F.readOnlyNote(),
      h('p', { class: 'note', text: '분류를 바꾸면 같은 거래처(내용 첫 단어)의 자동 분류 거래도 함께 바뀌고, 이후 가져오는 거래에도 자동 적용됩니다(설정 › 분류 규칙). 증빙은 세무사 전달 자료의 「증빙 확인」 시트에 그대로 들어갑니다.' }));
  }


  /* ---------- 계좌 대조: 거래내역의 마지막 잔액 vs 지금 잔액(직접 입력) ---------- */
  function reconView(view) {
    var by = {};
    F.tx.forEach(function (t) { var k = F.acctKey(t); (by[k] = by[k] || []).push(t); });
    var man = {}; (F.cfg.cashAccts || []).forEach(function (m, i) { man[m.key || ('m' + i)] = m; });
    var keys = Object.keys(by).concat(Object.keys(man).filter(function (k) { return !by[k]; }));
    var rows = keys.map(function (k) {
      var list = (by[k] || []).slice().sort(function (a, b) { return F.txKey(a) < F.txKey(b) ? -1 : 1; });
      var last = list[list.length - 1], first = list[0], m = man[k];
      // 잔액 사슬 끊김
      var breaks = 0; for (var i = 1; i < list.length; i++) { var a = list[i - 1], b = list[i]; if (a.bal != null && b.bal != null && Math.round(a.bal + b.inAmt - b.outAmt) !== Math.round(b.bal)) breaks++; }
      var diff = m && last && last.bal != null ? (+m.amount || 0) - last.bal : null;
      return { k: k, name: m ? m.name : F.acctName(last || {}), n: list.length, from: first && first.date, to: last && last.date, lastBal: last ? last.bal : null, man: m, diff: diff, breaks: breaks, recon: list.filter(function (t) { return t.src === 'reconstructed'; }).length };
    });
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['계좌', '거래내역 기간', '거래내역 마지막 잔액', '지금 잔액 (직접 입력)', '차이', '잔액 사슬', '판정'].map(function (x, i) { return h('th', { class: i >= 2 && i <= 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, rows.map(function (r) {
        var ok = r.diff === 0, gap = r.man && r.to && r.man.asOf > r.to;
        var verdict = !r.n ? '거래내역 없음 — 통장 파일 필요' : r.diff == null ? '지금 잔액 미입력' : ok ? (r.recon ? '일치 (일부 재구성 줄 포함)' : '일치') : (gap ? fmt.dot(r.to).slice(2) + ' 이후 내역 없음 — ' + F.man(r.diff) + ' 설명 필요' : '불일치 ' + F.man(r.diff));
        return h('tr', null, h('td', null, h('div', { class: 'strong', text: r.name }), h('div', { class: 'meta', text: r.k })),
          h('td', { text: r.n ? fmt.dot(r.from).slice(2) + ' ~ ' + fmt.dot(r.to).slice(2) + ' · ' + r.n + '건' : '—' }),
          h('td', { class: 'num', text: r.lastBal != null ? F.won(r.lastBal) : '' }),
          h('td', { class: 'num', text: r.man ? F.won(r.man.amount) + ' (' + fmt.dot(r.man.asOf).slice(2) + ')' : '' }),
          h('td', { class: 'num' + (r.diff ? ' red' : ''), text: r.diff == null ? '' : (r.diff > 0 ? '+' : '') + F.won(r.diff) }),
          h('td', { class: r.breaks ? 'red' : '', text: r.n ? (r.breaks ? r.breaks + '곳 끊김' : '이어짐') : '' }),
          h('td', { class: ok ? '' : 'red', text: verdict }));
      })));
    // 기간별 요약 (대표 가수금 누적 등)
    var sumCat = function (c, dir) { return F.tx.filter(function (t) { return t.cat === c; }).reduce(function (a, t) { return a + (dir === 'in' ? t.inAmt : t.outAmt); }, 0); };
    var owner = sumCat('대표 가수금', 'in'), dep = sumCat('보증금 · 예치금', 'out'), checks = F.tx.filter(function (t) { return t.check; }).length;
    ui.put(view, F.kpi([['대표 가수금 입금 (누적)', F.man(owner), '', '거래내역 기간 합계 · 반환 0'], ['임차 보증금 (추정)', F.man(dep), '', '자산 — 비용 아님'],
      ['확인 필요', checks + '건', checks ? 'red' : '', '거래내역 › 확인 필요'], ['거래내역', F.tx.length + '건']], 'four'),
      ui.panel('Reconcile · 계좌별 대조', null, h('div', { class: 'table-wrap flat' }, tb),
        h('p', { class: 'meta', text: '거래내역 마지막 잔액과 설정 › 계좌 · 잔액에 직접 넣은 지금 잔액을 비교합니다. 차이는 그 사이 거래내역 파일이 아직 없다는 뜻 — 해당 기간 통장 파일을 가져오면 0이 되어야 합니다. 잔액 사슬은 「앞 잔액 + 입금 − 출금 = 이번 잔액」이 모든 줄에서 맞는지 검사합니다.' })));
  }


  /* ---------- 카드_KB: 법인카드 사용내역 — 지출은 통장 「카드대금」으로 이미 잡히므로 여기는 「어디에 썼나」 확인용 ---------- */
  var CV = { ym: '', only: '' };
  function cardView(view) {
    var ed = F.canEdit();
    var all = F.card.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var months = {}; all.forEach(function (x) { months[F.ym(x.date)] = 1; });
    var list = all.filter(function (x) { return (!CV.ym || F.ym(x.date) === CV.ym) && (!CV.only || (CV.only === 'need' ? (x.check || !x.cat) : CV.only === 'check' ? x.check : !x.cat)); });
    var cats = BP.CATS_OUT.filter(function (c) { return c !== '카드대금' && c !== '미분류'; });
    var upd = function (x, patch) { db.doc('fin_card/' + x.id).update(patch).catch(ui.fail); };
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['승인일', '가맹점', '금액', '사용처', '사용내용', '통장 결제', ''].map(function (x, i) { return h('th', { class: i === 2 ? 'num' : '', text: x }); }))),
      h('tbody', null, list.map(function (x) {
        var sel = ui.select([['', '— 사용처 선택']].concat(cats.map(function (c) { return [c, c]; })), x.cat || '', { 'aria-label': '사용처', class: 'fin-cat' + (x.cat ? '' : ' warn'), disabled: ed ? null : true, onchange: function () { upd(x, { cat: this.value }); } });
        var note = ui.input({ value: x.note || '', placeholder: '무엇을 샀는지', 'aria-label': '사용내용', disabled: ed ? null : true });
        note.addEventListener('change', function () { upd(x, { note: note.value.trim() }); });
        note.addEventListener('keydown', function (e) { if (e.key === 'Enter') note.blur(); });
        return h('tr', null, h('td', { class: 'meta', text: fmt.dot(x.date).slice(2) }),
          h('td', null, h('div', { text: x.merchant }), h('div', { class: 'meta', text: (x.issuer || '법인카드') + (x.cardNo ? ' …' + x.cardNo : '') + (x.foreign ? ' · 해외' : '') }),
            x.check ? h('div', { class: 'fin-check' }, h('span', { class: 'tag red', text: '확인' }), ' ' + x.check, ed ? ui.btn('확인 완료', function () { upd(x, { check: '' }); }, 'btn-line btn-xs') : null) : null),
          h('td', { class: 'num', text: F.won(x.amount) }), h('td', null, sel), h('td', null, note),
          h('td', { class: 'meta', text: x.payDate ? fmt.dot(x.payDate).slice(2) + ' 카드대금' : '아직 결제 전 · 미연결' }), h('td'));
      })));
    var sum = list.reduce(function (a, x) { return a + x.amount; }, 0), chk = all.filter(function (x) { return x.check; }).length, none = all.filter(function (x) { return !x.cat; }).length;
    // 카드대금 중 명세로 설명되지 않는 금액
    var gaps = F.tx.filter(function (t) { return t.cat === '카드대금' && t.outAmt > 0; }).map(function (t) {
      var s = F.card.filter(function (x) { return x.payId === t.id; }).reduce(function (a, x) { return a + x.amount; }, 0); return { t: t, gap: t.outAmt - s };
    }).filter(function (g) { return g.gap >= 1000; }).sort(function (a, b) { return a.t.date < b.t.date ? 1 : -1; });
    ui.put(view, F.kpi([['카드 사용 (명세)', all.length + '건', '', F.man(all.reduce(function (a, x) { return a + x.amount; }, 0))], ['확인 필요', chk + '건', chk ? 'red' : '', '용도를 알려주시면 분류'],
        ['사용처 미지정', none + '건', none ? 'red' : '', ''], ['명세 없는 카드대금', gaps.length + '건', gaps.length ? 'red' : '', F.man(gaps.reduce(function (a, g) { return a + g.gap; }, 0)) + ' · 해외결제 등']], 'four'),
      h('div', { class: 'toolbar' }, ui.select([['', '전체 기간']].concat(Object.keys(months).sort().reverse().map(function (m) { return [m, m.replace('-', '.')]; })), CV.ym, { 'aria-label': '월', onchange: function () { CV.ym = this.value; HR.refresh(); } }),
        ui.select([['', '전체'], ['need', '확인 필요 (확인 표시 · 사용처 미지정)'], ['check', '확인 표시만'], ['none', '사용처 미지정만']], CV.only, { 'aria-label': '보기', onchange: function () { CV.only = this.value; HR.refresh(); } })),
      ui.panel('법인카드 · 국민카드 사용내역', null, h('p', { class: 'meta', text: '지출은 통장 「카드대금」 출금으로 이미 잡혀 있습니다. 여기는 그 카드값이 어디에 쓰였는지 확인 · 기록하는 곳이고, 사용처를 고르면 「월별 사용처」에서 카드대금 대신 그 사용처로 보입니다. ' + list.length + '건 · ' + F.won(sum) + '원' }),
        h('div', { class: 'table-wrap flat' }, tb)),
      gaps.length ? ui.panel('명세 없는 카드대금 — 해외결제 · 명세 미수령', null, h('div', { class: 'table-wrap flat' }, h('table', { class: 'table fin-table fin-narrow' },
        h('thead', null, h('tr', null, ['통장 출금일', '카드대금', '명세로 설명된 금액', '설명 안 된 금액'].map(function (x, i) { return h('th', { class: i ? 'num' : '', text: x }); }))),
        h('tbody', null, gaps.map(function (g) { return h('tr', null, h('td', { text: fmt.dot(g.t.date).slice(2) }), h('td', { class: 'num', text: F.won(g.t.outAmt) }), h('td', { class: 'num', text: F.won(g.t.outAmt - g.gap) }), h('td', { class: 'num red', text: F.won(g.gap) })); })))),
        h('p', { class: 'meta', text: '해외 결제(구글 워크스페이스 등)는 「부가세 신고용 상세매입내역」에 없습니다. 카드사 「해외매입내역」 파일을 올려 주시면 채워집니다.' })) : null);
  }

  function render(view, parts) {
    var sub = parts[0] || 'list';
    ui.put(view, ui.head('Transactions', '거래내역', h('span', { class: 'meta', text: F.tx.length + '건' })),
      ui.tabs([['list', '전체'], ['list/check', '확인 필요 ' + F.tx.filter(function (t) { return t.check; }).length], ['list/uncat', '미분류'], ['list/noevid', '증빙 확인'], ['card', '카드_KB ' + F.card.length], ['card/check', '카드 확인 필요 ' + F.card.filter(function (x) { return x.check || !x.cat; }).length], ['recon', '계좌 대조'], ['import', '가져오기']], (sub === 'list' || sub === 'card') && parts[1] ? sub + '/' + parts[1] : sub, 'tx'));
    if (sub === 'import') importView(view);
    else if (sub === 'recon') reconView(view);
    else if (sub === 'card') { CV.only = parts[1] === 'check' ? 'need' : CV.only === 'need' ? '' : CV.only; cardView(view); }
    else listView(view, parts[1] || '');
  }
  HR.register('tx', { render: render });
})();

/* fillts HR — 급여명세서: 관리자가 직원별로 업로드하고, 본인과 관리자만 열람한다.
   업로드 전 PDF 본문을 읽어 대상자 이름·사번·귀속월·다른 직원 정보·중복 파일을 검사하고,
   하나라도 어긋나면 대상자 이름을 직접 입력해야만 올라가게 한다. 급여 금액은 시스템에 따로 저장하지 않는다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var MAX_BYTES = 700 * 1024;   // Firestore 문서 1MiB 한도 (base64 4/3배 팽창 감안)
  var PDFJS = 'vendor/pdfjs/';

  /* ---------- 유틸 ---------- */
  function slipId(mid, ym) { return mid + '_' + ym.replace('-', ''); }
  function ymLabel(ym) { return (+ym.slice(0, 4)) + '년 ' + (+ym.slice(5, 7)) + '월'; }
  function size(n) { return n < 1024 ? n + 'B' : n < 1048576 ? Math.round(n / 1024) + 'KB' : (n / 1048576).toFixed(1) + 'MB'; }
  function squash(s) { return String(s || '').replace(/\s+/g, ''); }
  function toB64(buf) {
    var bytes = new Uint8Array(buf), bin = '', step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(bin);
  }
  function fromB64(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function sha256(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function blobOf(fileDoc) { return new Blob([fromB64(fileDoc.data)], { type: 'application/pdf' }); }

  var pdfReady = null;
  function loadPdfjs() {
    if (pdfReady) return pdfReady;
    pdfReady = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = function () {
        var lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
        if (!lib) return no(new Error('pdfjs'));
        lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        ok(lib);
      };
      s.onerror = function () { pdfReady = null; no(new Error('pdfjs')); };
      document.head.appendChild(s);
    });
    return pdfReady;
  }
  // PDF 본문 텍스트 + 1쪽 미리보기
  function readPdf(buf, canvas) {
    return loadPdfjs().then(function (lib) {
      return lib.getDocument({ data: new Uint8Array(buf.slice(0)), cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, isEvalSupported: false, disableFontFace: true }).promise;
    }).then(function (pdf) {
      var jobs = [];
      for (var i = 1; i <= Math.min(pdf.numPages, 10); i++) {
        jobs.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent().then(function (tc) { return tc.items.map(function (x) { return x.str; }).join(' '); }); }));
      }
      var preview = pdf.getPage(1).then(function (pg) {
        var vp0 = pg.getViewport({ scale: 1 }), scale = Math.min(2, 900 / vp0.width), vp = pg.getViewport({ scale: scale });
        canvas.width = vp.width; canvas.height = vp.height;
        return pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      });
      return Promise.all([Promise.all(jobs), preview]).then(function (r) { return { text: r[0].join('\n'), pages: pdf.numPages }; });
    });
  }

  /* ---------- 검사 ---------- */
  // 반환: [{ level: 'ok'|'warn'|'bad'|'block', text }]
  function inspect(target, ym, file, text, hash, sameHash, existing) {
    var out = [], t = squash(text), others = HR.memberList(true).filter(function (x) { return x.id !== target.id; });
    function add(level, s) { out.push({ level: level, text: s }); }
    if (!t) add('warn', 'PDF에서 글자를 읽지 못했습니다 (스캔본·이미지 PDF). 아래 미리보기로 이름과 월을 직접 확인하세요.');
    else {
      var nm = squash(target.name);
      if (nm && t.indexOf(nm) >= 0) add('ok', '대상자 이름 「' + target.name + '」이(가) 명세서에 있습니다.');
      else add('bad', '명세서에서 대상자 이름 「' + target.name + '」을(를) 찾지 못했습니다. 다른 사람의 명세서일 수 있습니다.');
      if (target.empNo) {
        if (t.indexOf(squash(target.empNo)) >= 0) add('ok', '사번 ' + target.empNo + '이(가) 일치합니다.');
        else add('warn', '등록된 사번 ' + target.empNo + '이(가) 명세서에 없습니다. 인사정보와 명세서 사번이 다를 수 있습니다.');
      }
      var hit = others.filter(function (x) { var n = squash(x.name); return n.length >= 2 && t.indexOf(n) >= 0; });
      var hitNo = others.filter(function (x) { return x.empNo && squash(x.empNo).length >= 3 && t.indexOf(squash(x.empNo)) >= 0; });
      if (hit.length) add('bad', '다른 직원 이름이 명세서에 있습니다: ' + hit.map(function (x) { return x.name; }).join(', ') + '. 파일이 바뀌지 않았는지 확인하세요.');
      if (hitNo.length) add('bad', '다른 직원의 사번이 명세서에 있습니다: ' + hitNo.map(function (x) { return x.name + '(' + x.empNo + ')'; }).join(', '));
      if (!hit.length && !hitNo.length) add('ok', '다른 직원의 이름·사번은 보이지 않습니다.');
      var y = ym.slice(0, 4), m = +ym.slice(5, 7), mm = ('0' + m).slice(-2);
      var monthRe = new RegExp('(' + y + '|' + y.slice(2) + ')년0?' + m + '월|' + y + '[.\\-/]' + mm + '(?!\\d)|' + y + '[.\\-/]' + m + '(?![\\d.\\-/])|' + y + mm + '(?!\\d)');
      if (monthRe.test(t)) add('ok', ymLabel(ym) + ' 표기가 명세서에 있습니다.');
      else add('warn', '명세서에서 「' + ymLabel(ym) + '」 표기를 찾지 못했습니다. 귀속월이 맞는지 확인하세요.');
    }
    var fnHit = others.filter(function (x) { var n = squash(x.name); return n.length >= 2 && squash(file.name).indexOf(n) >= 0; });
    if (fnHit.length && squash(file.name).indexOf(squash(target.name)) < 0) add('bad', '파일 이름에 다른 직원 이름(' + fnHit.map(function (x) { return x.name; }).join(', ') + ')이 들어 있습니다: ' + file.name);
    sameHash.forEach(function (d) {
      if (d.memberId !== target.id) add('block', '똑같은 파일이 이미 ' + HR.name(d.memberId) + '님 ' + ymLabel(d.month) + ' 명세서로 올라가 있습니다. 한 파일을 두 사람에게 올릴 수 없습니다.');
      else if (d.month !== ym) add('warn', '똑같은 파일이 이미 ' + ymLabel(d.month) + ' 명세서로 올라가 있습니다. 지난달 파일을 다시 고르지 않았는지 확인하세요.');
    });
    if (existing) add('warn', '이미 ' + ymLabel(ym) + ' 명세서(' + existing.fileName + ')가 있습니다. 올리면 기존 파일을 교체합니다.');
    return out;
  }

  /* ---------- 업로드 패널 (관리자) ---------- */
  function uploader(target, ym, existing, onDone) {
    var file = h('input', { type: 'file', accept: 'application/pdf,.pdf' });
    var status = ui.msg(), checks = h('ul', { class: 'slip-checks' }), canvas = h('canvas', { class: 'slip-preview' });
    var previewWrap = h('div', { class: 'slip-preview-wrap', hidden: true }, h('div', { class: 'meta', text: '미리보기 · 1쪽' }), canvas);
    var confirmBox = h('div', { class: 'slip-confirm', hidden: true });
    var go = h('button', { type: 'button', class: 'btn btn-sm', text: target.name + '님에게 올리기', disabled: true });
    var state = null;

    function reset() { state = null; go.disabled = true; ui.clear(checks); ui.clear(confirmBox); confirmBox.hidden = true; previewWrap.hidden = true; ui.err(status, ''); }
    file.addEventListener('change', function () {
      reset();
      var f = file.files[0];
      if (!f) return;
      if (f.size > MAX_BYTES) return ui.err(status, '파일이 ' + size(f.size) + '입니다. 700KB 이하 PDF만 올릴 수 있습니다 (급여 프로그램의 「PDF 저장」 파일은 보통 200KB 이하).');
      status.textContent = '파일 내용을 읽는 중…';
      f.arrayBuffer().then(function (buf) {
        var head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 5)));
        if (head !== '%PDF-') throw { user: 'PDF 파일이 아닙니다. 급여명세서를 PDF로 저장해 올려 주세요.' };
        return Promise.all([sha256(buf), readPdf(buf, canvas).catch(function () { return { text: '', pages: 0, failed: true }; })]).then(function (r) {
          return db.collection('hr_payslips').where('hash', '==', r[0]).get().then(function (s) { return { buf: buf, hash: r[0], pdf: r[1], same: HR.rows(s) }; });
        });
      }).then(function (r) {
        if (file.files[0] !== f) return;
        var res = inspect(target, ym, f, r.pdf.text, r.hash, r.same, existing);
        if (r.pdf.failed) res.unshift({ level: 'warn', text: '이 PDF는 미리보기를 만들지 못했습니다. 파일을 직접 열어 확인한 뒤 올리세요.' });
        else previewWrap.hidden = false;
        state = { file: f, buf: r.buf, hash: r.hash, res: res };
        res.forEach(function (c) { checks.appendChild(h('li', { class: 'lv-' + c.level }, h('span', { class: 'mark', text: { ok: '✓', warn: '!', bad: '✕', block: '✕' }[c.level] }), h('span', { text: c.text }))); });
        ui.err(status, '');
        renderConfirm();
      }).catch(function (x) { ui.err(status, x && x.user ? x.user : '파일을 읽지 못했습니다. 다시 선택해 주세요.'); if (!(x && x.user)) console.warn(x); });
    });

    function renderConfirm() {
      ui.clear(confirmBox); confirmBox.hidden = false;
      var lv = state.res.map(function (c) { return c.level; });
      if (lv.indexOf('block') >= 0) {
        confirmBox.className = 'slip-confirm bad';
        ui.put(confirmBox, h('strong', { text: '업로드할 수 없습니다.' }), h('p', { text: '다른 직원에게 이미 올라간 파일입니다. 파일을 다시 확인하세요.' }));
        go.disabled = true; return;
      }
      var risky = lv.indexOf('bad') >= 0 || lv.indexOf('warn') >= 0;
      if (!risky) {
        confirmBox.className = 'slip-confirm';
        var cb = h('input', { type: 'checkbox' });
        ui.put(confirmBox, h('label', { class: 'check' }, cb, ' 미리보기에서 ' + target.name + '님 ' + ymLabel(ym) + ' 명세서임을 확인했습니다.'));
        cb.addEventListener('change', function () { go.disabled = !cb.checked; });
        return;
      }
      confirmBox.className = 'slip-confirm ' + (lv.indexOf('bad') >= 0 ? 'bad' : 'warn');
      var typed = ui.input({ placeholder: target.name, autocomplete: 'off', 'aria-label': '대상자 이름 입력' });
      ui.put(confirmBox,
        h('strong', { text: lv.indexOf('bad') >= 0 ? '⚠ 다른 사람의 명세서일 수 있습니다. 업로드 전에 반드시 확인하세요.' : '확인이 필요한 항목이 있습니다.' }),
        h('p', { text: '급여명세서는 올리는 즉시 ' + target.name + '님이 볼 수 있습니다. 위 항목과 미리보기를 확인했다면 대상자 이름을 정확히 입력하세요.' }),
        ui.field('대상자 이름', typed));
      typed.addEventListener('input', function () { go.disabled = squash(typed.value) !== squash(target.name); });
    }

    go.addEventListener('click', function () {
      if (!state || go.disabled) return;
      go.disabled = true; status.textContent = '올리는 중…';
      var id = slipId(target.id, ym), b = db.batch();
      var summary = state.res.filter(function (c) { return c.level !== 'ok'; }).map(function (c) { return c.text; }).slice(0, 6);
      b.set(db.doc('hr_payslips/' + id), { memberId: target.id, month: ym, fileName: state.file.name.slice(0, 120), size: state.file.size, hash: state.hash,
        warnings: summary, by: S.mid, at: FV.serverTimestamp(), viewedAt: null });
      b.set(db.doc('hr_payslip_files/' + id), { memberId: target.id, data: toB64(state.buf) });
      b.commit().then(function () { ui.toast(target.name + '님 ' + ymLabel(ym) + ' 급여명세서를 올렸습니다.'); onDone(); })
        .catch(function (x) { go.disabled = false; ui.fail(x, status); });
    });

    return h('div', { class: 'slip-uploader' },
      h('div', { class: 'slip-target' }, h('div', { class: 'label', text: 'Upload' }),
        h('div', { class: 'slip-target-name', text: target.name + (target.empNo ? ' · ' + target.empNo : '') }),
        h('div', { class: 'meta', text: ymLabel(ym) + ' 급여명세서' + (target.email ? ' · ' + target.email : '') })),
      ui.field('PDF 파일', file), status, checks, previewWrap, confirmBox, go);
  }

  /* ---------- 열기 · 저장 ---------- */
  function openSlip(d, download) {
    var w = download ? null : window.open('', '_blank');
    db.doc('hr_payslip_files/' + d.id).get().then(function (s) {
      if (!s.exists) throw { user: '파일을 찾을 수 없습니다.' };
      var url = URL.createObjectURL(blobOf(s.data()));
      if (download) {
        var a = h('a', { href: url, download: d.fileName || ('급여명세서_' + d.month + '.pdf') });
        document.body.appendChild(a); a.click(); a.remove();
      } else if (w) w.location.href = url;
      else location.href = url;
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      if (d.memberId === S.mid && !d.viewedAt) db.doc('hr_payslips/' + d.id).update({ viewedAt: FV.serverTimestamp() }).catch(function () {});
    }).catch(function (x) { if (w) w.close(); x && x.user ? ui.toast(x.user) : ui.fail(x); });
  }

  /* ---------- INFO › 급여 (본인 · 관리자가 보는 구성원 상세) ---------- */
  function memberTab(view, mid) {
    var rows = HR.load('hr_payslips:' + mid, function () { return db.collection('hr_payslips').where('memberId', '==', mid).get().then(HR.rows); }) || [];
    var ul = h('ul', { class: 'list' });
    rows.slice().sort(function (a, b) { return a.month < b.month ? 1 : -1; }).forEach(function (d) {
      ul.appendChild(h('li', null,
        h('div', { class: 'grow' }, h('div', { text: ymLabel(d.month) + ' 급여명세서' }),
          h('div', { class: 'meta', text: d.fileName + ' · ' + size(d.size || 0) + ' · ' + fmt.ts(d.at) + (S.isAdmin ? ' · ' + (d.viewedAt ? '열람 ' + fmt.ts(d.viewedAt) : '미열람') : '') })),
        ui.btn('열기', function () { openSlip(d, false); }, 'btn-line btn-xs'),
        ui.btn('저장', function () { openSlip(d, true); }, 'btn-line btn-xs')));
    });
    if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '받은 급여명세서가 없습니다.' }));
    ui.put(view, ui.panel('Payslips', S.isAdmin ? h('a', { href: '#admin/payslip', class: 'link', text: '명세서 올리기' }) : null, ul),
      h('p', { class: 'note', text: '급여명세서는 본인과 관리자만 볼 수 있습니다. 임금명세서는 지급 시 교부 의무가 있습니다 (근로기준법 제48조②).' }));
  }

  /* ---------- 설정 › 급여명세서 (관리자: 월별 · 직원별 업로드) ---------- */
  var adminYm = null, openFor = null, upNode = null, upKey = null;   // 다시 그려도 고른 파일·검사 결과가 남도록 업로드 패널을 재사용
  function adminPage(view) {
    if (!adminYm) adminYm = fmt.today().slice(0, 7);
    var ym = adminYm;
    var month = ui.input({ type: 'month', value: ym, 'aria-label': '귀속월' });
    month.addEventListener('change', function () { if (/^\d{4}-\d{2}$/.test(month.value)) { adminYm = month.value; openFor = null; upNode = null; HR.refresh(); } });
    var rows = HR.load('hr_payslips@' + ym, function () { return db.collection('hr_payslips').where('month', '==', ym).get().then(HR.rows); });
    var byMid = {};
    (rows || []).forEach(function (d) { byMid[d.memberId] = d; });
    var tb = h('table', { class: 'table slip-table' });
    tb.appendChild(h('thead', null, h('tr', null, ['구성원', '사번', ymLabel(ym) + ' 명세서', '직원 열람', ''].map(function (x) { return h('th', { text: x }); }))));
    var body = h('tbody');
    HR.memberList(false).forEach(function (m) {
      var d = byMid[m.id];
      var tr = h('tr', { class: openFor === m.id ? 'selected' : '' },
        h('td', { text: m.name }), h('td', { class: 'muted', text: m.empNo || '-' }),
        h('td', null, d ? h('div', null, ui.tag('업로드', 'ok'), ' ', h('span', { class: 'meta', text: d.fileName + ' · ' + fmt.ts(d.at) })) : ui.tag('미업로드', 'mute'),
          d && d.warnings && d.warnings.length ? h('div', { class: 'meta warn-text', text: '확인 후 업로드: ' + d.warnings.length + '건' }) : null),
        h('td', null, d ? (d.viewedAt ? ui.tag('열람 ' + fmt.ts(d.viewedAt), 'mute') : ui.tag('미열람', 'warn')) : ''),
        h('td', { class: 'r' },
          d ? ui.btn('열기', function () { openSlip(Object.assign({ id: slipId(m.id, ym) }, d), false); }, 'btn-line btn-xs') : null,
          ui.btn(openFor === m.id ? '닫기' : d ? '교체' : '올리기', function () { openFor = openFor === m.id ? null : m.id; upNode = null; HR.refresh(); }, 'btn-xs' + (d ? ' btn-line' : '')),
          d ? ui.confirmBtn('삭제', function () {
            var b = db.batch(), id = slipId(m.id, ym);
            b.delete(db.doc('hr_payslips/' + id)); b.delete(db.doc('hr_payslip_files/' + id));
            b.commit().then(function () { HR.invalidate('hr_payslips'); ui.toast('삭제했습니다.'); }).catch(ui.fail);
          }) : null));
      body.appendChild(tr);
      if (openFor === m.id) {
        if (!upNode || upKey !== m.id + ym) { upKey = m.id + ym; upNode = uploader(m, ym, d, function () { openFor = null; upNode = null; HR.invalidate('hr_payslips'); }); }
        body.appendChild(h('tr', { class: 'slip-row' }, h('td', { colspan: '5' }, upNode)));
      }
    });
    tb.appendChild(body);
    ui.put(view,
      h('div', { class: 'row slip-bar' }, ui.field('귀속월', month)),
      rows == null ? ui.empty('불러오는 중…') : h('div', { class: 'table-wrap' }, tb),
      h('p', { class: 'note', text: '직원 행에서 「올리기」를 눌러 그 직원의 명세서만 올립니다. 올리기 전에 PDF 본문을 읽어 ① 대상자 이름 ② 사번 ③ 귀속월 ④ 다른 직원 이름·사번 ⑤ 파일 이름 ⑥ 다른 직원에게 올린 같은 파일 여부를 검사합니다. 하나라도 어긋나면 대상자 이름을 직접 입력해야 올라가고, 다른 직원에게 이미 올린 파일은 올릴 수 없습니다. 파일은 본인과 관리자만 열 수 있습니다 (보안 규칙으로 서버에서 차단).' }));
  }

  // 다른 화면(증명서 발급본 업로드 등)에서 쓰는 PDF 본문 추출
  HR.pdfText = function (buf) {
    return loadPdfjs().then(function (lib) { return lib.getDocument({ data: new Uint8Array(buf.slice(0)), cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, isEvalSupported: false, disableFontFace: true }).promise; })
      .then(function (pdf) { var jobs = []; for (var i = 1; i <= Math.min(pdf.numPages, 5); i++) jobs.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent().then(function (tc) { return tc.items.map(function (x) { return x.str; }).join(' '); }); })); return Promise.all(jobs); })
      .then(function (t) { return t.join(' '); });
  };
  HR.payslip = { memberTab: memberTab, adminPage: adminPage };
})();

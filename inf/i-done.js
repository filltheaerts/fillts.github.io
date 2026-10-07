/* fillts Influencer — 완료 콘텐츠: 계약이 성사된 유튜버의 콘텐츠를 계속 관리
   · 계약 · 시딩 · 업로드 대기 단계는 「콘텐츠 대기」로 자동으로 넘어온다 → 영상 주소를 넣으면 추적 시작
   · 콘텐츠마다 누적 조회 · 좋아요 · 댓글 (매일 09:10 자동 최신화 + 수동) · 특이 댓글 조사(브랜드 언급 · 질문 · 구매 의향 · 부정) */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt;
  var V = I.V.done = { url: {}, busy: {}, open: {}, msg: '', err: false, pick: '', pickUrl: '', sort: 'views', quick: '', qbusy: false };
  var WAIT = ['contract', 'seeding', 'waiting'];

  function setMsg(t, err) { V.msg = t; V.err = !!err; HR.refresh(); }
  function addContent(c, url, markDone) {
    if (!url || !url.trim()) return setMsg('콘텐츠(유튜브 영상) 주소를 넣으세요.', true);
    V.busy[c.id] = true; setMsg('영상 · 댓글을 읽는 중입니다…');
    return I.call('infYt', { action: 'content', creatorId: c.id, url: url.trim(), markDone: !!markDone }).then(function () {
      V.busy[c.id] = false; V.url[c.id] = ''; setMsg('「' + c.ch.title + '」 콘텐츠를 추적합니다.');
    }).catch(function (e) { V.busy[c.id] = false; setMsg(e.message, true); });
  }
  // 영상 주소만 붙여 넣으면 서버가 제목 · 채널 · 조회 · 댓글을 읽어 온다 (채널이 리스트에 없으면 「완료」로 자동 추가)
  function addByUrl() {
    var url = (V.quick || '').trim();
    if (!url) return setMsg('유튜브 영상 주소를 붙여 넣으세요.', true);
    V.qbusy = true; setMsg('영상 · 채널 · 댓글을 읽는 중입니다… (5 ~ 20초)');
    I.call('infYt', { action: 'content', url: url }).then(function (r) {
      V.qbusy = false; V.quick = '';
      setMsg('「' + (r.title || '콘텐츠') + '」' + (r.channel ? ' — ' + r.channel : '') + ' 추적을 시작했습니다.');
    }).catch(function (e) { V.qbusy = false; setMsg(e.message, true); });
  }
  function refreshContents(c) {
    V.busy[c.id] = true; HR.refresh();
    return I.call('infYt', { action: 'content', creatorId: c.id, all: true }).then(function () { V.busy[c.id] = false; HR.refresh(); })
      .catch(function (e) { V.busy[c.id] = false; setMsg(e.message, true); });
  }
  function removeContent(c, vid) { return I.call('infYt', { action: 'content', creatorId: c.id, remove: vid }).catch(function (e) { setMsg(e.message, true); }); }
  // 최근 증가: 마지막 두 기록의 차이 ÷ 일수
  function delta(ct) {
    var hs = ct.hist || [];
    if (hs.length < 2) return null;
    var a = hs[hs.length - 2], b = hs[hs.length - 1], days = Math.max(1, (Date.parse(b.d) - Date.parse(a.d)) / 86400000);
    return Math.round((b.v - a.v) / days);
  }
  function bars(hist) {
    var hs = (hist || []).slice(-30), max = Math.max.apply(null, hs.map(function (x) { return x.v; }).concat([1]));
    return h('div', { class: 'in-hbars' }, hs.map(function (x) {
      var f = h('span', { class: 'in-hbar-fill' }); f.style.height = Math.max(2, Math.round((x.v / max) * 100)) + '%';
      return h('div', { class: 'in-hbar', title: x.d + ' · 조회 ' + x.v.toLocaleString('ko-KR') + ' · 좋아요 ' + x.l + ' · 댓글 ' + x.c }, h('span', { class: 'in-hbar-track' }, f), h('span', { class: 'in-hbar-d', text: x.d.slice(5).replace('-', '.') }));
    }));
  }
  function insight(ct) {
    var m = ct.cm || {};
    return h('div', { class: 'in-cand' },
      h('div', { class: 'in-cand-col' },
        h('div', { class: 'label', text: '누적 조회 추이 (매일 09:10 기록)' }), (ct.hist || []).length > 1 ? bars(ct.hist) : h('p', { class: 'meta', text: '내일부터 하루 한 번씩 쌓입니다.' }),
        h('div', { class: 'label', text: '댓글 조사 — 상위 ' + (m.n || 0) + '개 기준' }),
        h('div', { class: 'in-chips' }, [['브랜드 · 제품 언급', m.brand], ['질문', m.ask], ['구매 의향', m.buy], ['부정 · 주의', m.neg], ['칭찬', m.praise]].map(function (x) {
          return h('span', { class: 'in-chip ' + (x[0] === '부정 · 주의' && x[1] ? 'warn-chip' : x[1] ? '' : 'light'), text: x[0] + ' ' + (x[1] || 0) });
        })),
        h('div', { class: 'label', text: '좋아요 많은 댓글' }),
        (m.top || []).length ? h('ul', { class: 'in-cmts' }, m.top.map(function (x) { return h('li', { text: x.t + '  ♥' + x.likes }); })) : h('p', { class: 'meta', text: '댓글 없음 (또는 댓글 사용 중지)' })),
      h('div', { class: 'in-cand-col' },
        h('div', { class: 'label', text: '특이 댓글 — 브랜드 언급 · 구매 의향 · 부정 · 질문' }),
        (m.flags || []).length ? h('ul', { class: 'in-flags' }, m.flags.map(function (x) {
          return h('li', null, h('span', { class: 'tag ' + (/부정/.test(x.why) ? 'red' : '') , text: x.why }), h('div', { text: x.t }), h('span', { class: 'meta', text: '♥' + x.likes }));
        })) : h('p', { class: 'meta', text: '특이 댓글이 아직 없습니다.' }),
        h('p', { class: 'note', text: '브랜드 단어는 「메일」 메뉴의 브랜드 · 제품 이름(+ 바인그라피 · 필츠)을 씁니다.' })));
  }

  function render(view) {
    var waiting = I.creators.filter(function (c) { return WAIT.indexOf(c.stage) >= 0 && !(c.contents || []).length; });
    var rows = [];
    I.creators.forEach(function (c) { (c.contents || []).forEach(function (ct) { rows.push({ c: c, ct: ct }); }); });
    var key = { views: function (r) { return r.ct.views; }, recent: function (r) { return delta(r.ct) || 0; }, brand: function (r) { return (r.ct.cm || {}).brand || 0; }, at: function (r) { return Date.parse(r.ct.at) || 0; } }[V.sort];
    rows.sort(function (a, b) { return key(b) - key(a); });
    var sum = function (f) { return rows.reduce(function (a, r) { return a + (f(r.ct) || 0); }, 0); };

    var kpi = h('dl', { class: 'summary' }, [['완료 콘텐츠', rows.length + '편'], ['누적 조회', I.cnt(sum(function (x) { return x.views; }))], ['좋아요', I.cnt(sum(function (x) { return x.likes; }))],
      ['댓글', I.cnt(sum(function (x) { return x.comments; }))], ['브랜드 언급 댓글', sum(function (x) { return (x.cm || {}).brand; }) + '개'], ['콘텐츠 대기', waiting.length + '명']]
      .map(function (p) { return h('div', null, h('dt', { text: p[0] }), h('dd', { text: p[1] })); }));

    var waitPanel = ui.panel('계약 완료 · 콘텐츠 대기', h('span', { class: 'meta', text: '계약 · 시딩 · 업로드 대기 단계가 자동으로 넘어옵니다' }),
      waiting.length ? h('ul', { class: 'list' }, waiting.map(function (c) {
        var inp = ui.input({ value: V.url[c.id] || '', placeholder: '업로드된 영상 주소', oninput: function () { V.url[c.id] = this.value; },
          onkeydown: function (e) { if (e.key === 'Enter') addContent(c, this.value, true); } });
        var b = ui.btn(V.busy[c.id] ? '읽는 중…' : '추적 시작', function () { addContent(c, inp.value, true); }, 'btn-sm');
        if (V.busy[c.id]) b.disabled = true;
        var d = c.deal || {};
        return h('li', { class: 'in-wait' }, I.thumb(c.ch, 'sm'),
          h('div', { class: 'grow' }, h('div', { class: 'in-r-nm' }, h('a', { href: '#c/' + c.id, class: 'strong in-r-name', text: c.ch.title }), I.ytBtn(c.ch)),
            h('div', { class: 'meta', text: [I.stName(c.stage), d.type, d.fee ? I.won(d.fee) : '', d.due ? '업로드 예정 ' + fmt.dot(d.due) : ''].filter(Boolean).join(' · ') })),
          inp, b);
      })) : ui.empty('콘텐츠를 기다리는 계약 건이 없습니다. 파이프라인에서 「계약」으로 옮기면 여기에 나타납니다.'));

    var quick = ui.input({ value: V.quick || '', maxlength: '300', class: 'grow', placeholder: '완료 콘텐츠 영상 주소 붙여넣기 — https://www.youtube.com/watch?v=… · youtu.be/… · 쇼츠',
      oninput: function () { V.quick = this.value; }, onkeydown: function (e) { if (e.key === 'Enter' && !V.qbusy) addByUrl(); } });
    var quickBtn = ui.btn(V.qbusy ? '읽는 중…' : '+ 콘텐츠 추가', addByUrl, 'btn-sm');
    if (V.qbusy) quickBtn.disabled = true;
    var quickPanel = ui.panel('영상 주소로 바로 추가', null, h('div', { class: 'row in-seed-form' }, quick, quickBtn),
      h('p', { class: 'note', text: '주소만 넣으면 제목 · 채널 · 업로드일 · 조회 · 좋아요 · 댓글 · 특이 댓글을 알아서 읽어 옵니다. 채널이 리스트에 없으면 「완료」 단계로 함께 추가됩니다.' }));
    var picker = ui.select([['', '채널 선택']].concat(I.creators.slice().sort(function (a, b) { return (a.ch.title || '').localeCompare(b.ch.title || '', 'ko'); }).map(function (c) { return [c.id, c.ch.title + ' · ' + I.stName(c.stage)]; })),
      V.pick, { onchange: function () { V.pick = this.value; } });
    var pickUrl = ui.input({ value: V.pickUrl, placeholder: '영상 주소', class: 'grow', oninput: function () { V.pickUrl = this.value; } });

    var table = rows.length ? h('div', { class: 'in-xls-wrap' }, h('table', { class: 'table in-xls' },
      h('colgroup', null, [0, 0, 74, 82, 70, 64, 84, 110, 96].map(function (w) { var c = h('col'); if (w) c.style.width = w + 'px'; return c; })),
      h('thead', null, h('tr', null, ['채널', '콘텐츠', '업로드', '누적 조회', '좋아요', '댓글', '하루 증가', '특이 댓글', '최신화'].map(function (x, i) { return h('th', { class: i >= 3 && i <= 6 ? 'num' : '', text: x }); }))),
      h('tbody', null, [].concat.apply([], rows.map(function (r) {
        var k = r.c.id + '/' + r.ct.vid, m = r.ct.cm || {}, d = delta(r.ct);
        var re = h('button', { type: 'button', class: 'in-mv', title: '이 채널 콘텐츠 최신화', text: V.busy[r.c.id] ? '…' : '↻', onclick: function (e) { e.stopPropagation(); if (!V.busy[r.c.id]) refreshContents(r.c); } });
        var tr = h('tr', { class: 'clickable' + (V.open[k] ? ' in-open' : ''), onclick: function () { V.open[k] = !V.open[k]; HR.refresh(); } },
          h('td', null, h('a', { href: '#c/' + r.c.id, class: 'in-ell strong', text: r.c.ch.title, onclick: function (e) { e.stopPropagation(); } })),
          h('td', null, h('div', { class: 'in-r-nm' }, h('span', { class: 'in-r-name', title: r.ct.title, text: r.ct.title }),
            h('a', { href: r.ct.url, target: '_blank', rel: 'noopener noreferrer', class: 'in-yt', text: '▶', onclick: function (e) { e.stopPropagation(); } }))),
          h('td', { class: 'meta', text: fmt.dot(r.ct.at).slice(2) }),
          h('td', { class: 'num strong', text: I.cnt(r.ct.views) }), h('td', { class: 'num', text: I.cnt(r.ct.likes) }), h('td', { class: 'num', text: I.cnt(r.ct.comments) }),
          h('td', { class: 'num' + (d > 0 ? ' red' : ''), text: d == null ? '—' : (d > 0 ? '+' : '') + I.cnt(d) }),
          h('td', null, h('span', { class: 'meta', text: '브랜드 ' + (m.brand || 0) + ' · 구매 ' + (m.buy || 0) + ' · 부정 ' + (m.neg || 0) })),
          h('td', { class: 'in-upd' }, h('span', { class: 'meta', text: r.ct.upd ? new Date(r.ct.upd + 9 * 3600000).toISOString().slice(5, 10).replace('-', '.') : '' }), re));
        var out = [tr];
        if (V.open[k]) out.push(h('tr', { class: 'in-detail' }, h('td', { colspan: '9' }, insight(r.ct),
          h('div', { class: 'row in-ct-act' }, ui.confirmBtn('이 콘텐츠 추적 그만', function () { removeContent(r.c, r.ct.vid); })))));
        return out;
      }))))) : ui.empty('추적 중인 완료 콘텐츠가 없습니다. 위에 영상 주소를 붙여 넣으세요.');

    ui.put(view,
      ui.head('Contents', '완료 콘텐츠', h('span', { class: 'meta', text: '매일 09:10 자동 최신화 · ↻ 수동' })),
      kpi,
      quickPanel,
      V.msg ? h('p', { class: 'form-msg' + (V.err ? '' : ' ok'), role: 'alert', text: V.msg }) : null,
      waitPanel,
      ui.panel('완료 콘텐츠', h('div', { class: 'in-seg' }, [['views', '누적 조회'], ['recent', '하루 증가'], ['brand', '브랜드 언급'], ['at', '최근 업로드']].map(function (x) {
        return h('button', { type: 'button', class: V.sort === x[0] ? 'active' : '', text: x[1], onclick: function () { V.sort = x[0]; HR.refresh(); } });
      })), table));
  }
  HR.register('done', { render: function (view) { render(view); } });
})();

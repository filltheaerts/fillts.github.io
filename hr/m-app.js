/* fillts HR — 홈 화면 앱 아이콘 (iOS 「홈 화면에 추가」 · Android 설치). 설정 › 앱 아이콘 / INFO › 알림 설정에서 쓴다. */
(function () {
  'use strict';
  var HR = window.HR, ui = HR.ui, h = ui.h;
  var deferred = null;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () { /* 설치 안내만 못 쓸 뿐 */ });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; HR.refresh && HR.refresh(); });
  window.addEventListener('appinstalled', function () { deferred = null; ui.toast('홈 화면에 fillts HR을 추가했습니다.'); });

  function standalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function platform() {
    var ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
  }
  function steps(list) { return h('ol', { class: 'app-steps' }, list.map(function (x) { return h('li', null, x); })); }

  function panel() {
    var p = platform();
    var head = h('div', { class: 'app-head' }, h('img', { src: 'icons/icon-192.png', alt: 'fillts HR 아이콘', class: 'app-icon', width: '72', height: '72' }),
      h('div', null, h('div', { class: 'app-name', text: 'fillts HR' }), h('div', { class: 'meta', text: '홈 화면에서 앱처럼 바로 열립니다 · 주소창 없이 전체 화면' })));
    var body;
    if (standalone()) body = h('p', { class: 'ok-text', text: '이미 홈 화면 앱으로 열려 있습니다.' });
    else if (deferred) body = h('div', { class: 'stack' }, ui.btn('홈 화면에 추가', function () {
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; HR.refresh(); });
    }), h('p', { class: 'muted small', text: '누르면 기기의 설치 확인 창이 뜹니다.' }));
    else body = null;
    var ios = steps(['Safari로 fillts.com/hr 을 엽니다 (카톡·인스타 안 브라우저는 안 됩니다)', '아래쪽 가운데 공유 버튼 (□↑)을 누릅니다', '「홈 화면에 추가」를 누르고 → 오른쪽 위 「추가」']);
    var android = steps(['Chrome으로 fillts.com/hr 을 엽니다', '오른쪽 위 ⋮ 메뉴를 누릅니다', '「홈 화면에 추가」 또는 「앱 설치」 → 「설치」']);
    var desktop = steps(['Chrome·Edge 주소창 오른쪽의 설치 아이콘(⊕)을 누릅니다', '또는 ⋮ 메뉴 → 「앱 설치」 / 「fillts HR 설치」']);
    var guide = h('div', { class: 'app-guides' },
      h('div', { class: 'app-guide' + (p === 'ios' || p === 'ios-other' ? ' on' : '') }, h('div', { class: 'label', text: 'iPhone · iPad' }), ios,
        p === 'ios-other' ? h('p', { class: 'muted small', text: '지금 브라우저에서는 홈 화면 추가가 안 될 수 있습니다. Safari로 열어 주세요.' }) : null),
      h('div', { class: 'app-guide' + (p === 'android' ? ' on' : '') }, h('div', { class: 'label', text: 'Android' }), android),
      h('div', { class: 'app-guide' + (p === 'desktop' ? ' on' : '') }, h('div', { class: 'label', text: 'PC' }), desktop));
    return ui.panel('App icon · 홈 화면 바로가기', null, head, body, guide,
      h('p', { class: 'note', text: '홈 화면 앱은 기기에 데이터를 따로 저장하지 않고 항상 최신 화면을 불러옵니다. 로그인은 브라우저와 별도로 한 번 더 해야 할 수 있습니다.' }));
  }

  HR.app = { panel: panel };
})();

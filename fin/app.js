/* fillts Finance — HR과 같은 로그인(core.js)을 쓰고 메뉴만 바꾼다. 접근: 관리자 + HR 설정 › 앱 접근에서 Finance 권한을 받은 계정 */
window.HR_APP = { id: 'fin', title: 'fillts Finance', home: 'home', lite: true, menus: ['home', 'unit', 'sim', 'runway', 'plan', 'cost', 'sched', 'inv', 'flow', 'tx', 'finance', 'tax', 'set'] };
// 화면 구분 표시: 개당 손익 · 시뮬레이션 = [시뮬](가정), 나머지 = [실제](통장 · 장부 · 세무사)
window.FIN_SIM_MENUS = ['unit', 'sim'];

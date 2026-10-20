/* fillts CRM — 재구매 CRM (261020, Map에선 D2C 아래). 주소만 /vinegraphy_crm. HR과 같은 로그인(core.js)을 쓰고 메뉴만 바꾼다
   메뉴: 플랫폼 · 알림톡 · CRM(고객별 메시지 순서 탭)
   접근: 관리자 + HR 설정 › 앱 접근에서 CRM 권한을 받은 계정. 내용은 비공개 화면 코드(vinegraphy_crm/vgcrm.js)에만 있다 */
window.HR_APP = { id: 'vgcrm', title: 'fillts CRM', home: 'crm', lite: true, menus: ['platform', 'alimtalk', 'crm'] };

/* VINEGRAPHY View — 바인그라피 보기 전용 (261013). 화면 코드는 /vinegraphy의 vg.js를 그대로 쓰고 VG_READONLY로 수정 기능을 끈다
   메뉴: [브랜드] 브랜드 | [클렌징 젤] 제품 사양 · 상세페이지 · 소구점 요약
   접근: 관리자 + hr_users/{uid}.apps.vgv = 'view' 받은 계정만 (core.js APPS vgv · 검토 기간 잠금 예외 LOCK_FREE) */
window.VG_READONLY = true;
window.VG_PRODUCTS = [{ id: 'gel', name: '클렌징 젤' }];
window.HR_APP = { id: 'vgv', title: 'VINEGRAPHY View', home: 'brand', lite: true, menus: ['brand', 'gel-spec', 'gel-pdp', 'gel-appeal'] };

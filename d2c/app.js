/* fillts D2C — 자사몰(카페24) 성장 전략: 재구매 · CS · 크로스/업셀 · 코호트 · CRM · 자사몰 전환. HR과 같은 로그인(core.js)을 쓰고 메뉴만 바꾼다
   접근: 관리자 + HR 설정 › 앱 접근에서 D2C 권한을 받은 계정
   데이터: d2c_docs/main(전략 원고 json) · d2c_state/{항목id}(상태 · 담당 · 메모) · d2c_items(화면에서 직접 추가한 항목) · d2c_docs/kpi(LTV 계산 입력값)
   원고는 공개 저장소에 두지 않는다 → hr_backend/data/d2c_seed.json 고친 뒤 `python seed_d2c.py` */
window.HR_APP = { id: 'd2c', title: 'fillts D2C', home: 'sales', lite: true, menus: ['sales', 'ads', 'creative', 'assets', 'crmdata', 'repeat', 'kpi', 'home', 'plan', 'store', 'aov', 'retain', 'crm', 'cs', 'cohort'] };

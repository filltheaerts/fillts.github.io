// fillts — Firebase Auth + Firestore

(function () {
  'use strict';

  // ---- Firebase Init ----
  const firebaseConfig = {
    apiKey: "AIzaSyB5ONDHz2O4XcQb6VI5zzbm4x4NOwH6OW4",
    authDomain: "fillts-web.firebaseapp.com",
    projectId: "fillts-web",
    storageBucket: "fillts-web.firebasestorage.app",
    messagingSenderId: "298865968239",
    appId: "1:298865968239:web:5f89939196d30765c4799a"
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  // ---- Job Data ----
  const jobs = {
    job1: {
      label: '정규직 · Seoul',
      title: '브랜드 콘텐츠 기획자',
      body: '<h3>역할</h3><ul>' +
        '<li>브랜드 스토리텔링 및 콘텐츠 전략 수립</li>' +
        '<li>SNS, 웹사이트, 캠페인 등 채널별 콘텐츠 기획 · 운영</li>' +
        '<li>트렌드 리서치 기반 크리에이티브 방향성 제안</li>' +
        '<li>외부 크리에이터 · 에이전시 협업 및 프로젝트 매니징</li>' +
        '</ul><h3>자격요건</h3><ul>' +
        '<li>콘텐츠 기획 또는 브랜드 마케팅 경력 3년 이상</li>' +
        '<li>뷰티, 라이프스타일, 테크 분야에 대한 깊은 이해</li>' +
        '<li>카피라이팅 및 비주얼 디렉팅 역량</li>' +
        '<li>데이터 기반 콘텐츠 성과 분석 경험</li>' +
        '</ul><h3>우대사항</h3><ul>' +
        '<li>브랜드 론칭 또는 리브랜딩 프로젝트 경험</li>' +
        '<li>영상 콘텐츠 기획 · 제작 경험</li>' +
        '<li>영어 커뮤니케이션 가능자</li></ul>' +
        '<h3>근무지</h3><p class="job-location">서울 성동구 연무장5가길 25, SKV1 3층</p>'
    },
    job2: {
      label: '정규직 · Seoul',
      title: '브랜드 MD',
      body: '<h3>역할</h3><ul>' +
        '<li>브랜드 상품 기획 및 MD 전략 수립</li>' +
        '<li>시장 트렌드 분석 및 경쟁사 벤치마킹</li>' +
        '<li>OEM/ODM 파트너사 소싱, 협상 및 관리</li>' +
        '<li>가격 전략, 마진 분석, 재고 관리</li>' +
        '<li>신제품 출시 프로세스 전반 리드</li>' +
        '</ul><h3>자격요건</h3><ul>' +
        '<li>MD 또는 상품기획 경력 3년 이상</li>' +
        '<li>뷰티, 소비재, 라이프스타일 카테고리 경험</li>' +
        '<li>P&L 분석 및 데이터 기반 의사결정 역량</li>' +
        '<li>제조사 · 유통 채널과의 커뮤니케이션 능력</li>' +
        '</ul><h3>우대사항</h3><ul>' +
        '<li>자사 브랜드 운영 경험</li>' +
        '<li>글로벌 시장 진출 경험</li>' +
        '<li>뷰티 원료 · 성분에 대한 이해</li></ul>' +
        '<h3>근무지</h3><p class="job-location">서울 성동구 연무장5가길 25, SKV1 3층</p>'
    },
    job3: {
      label: '정규직 · Remote',
      title: 'AI 아키텍트(AI Architect)',
      body: '<h3>역할</h3><ul>' +
        '<li>AI 시스템 아키텍처 설계 및 인프라 구축</li>' +
        '<li>LLM 기반 에이전트 · 자동화 파이프라인 운영 및 최적화</li>' +
        '<li>시스템 모니터링, 장애 대응, 안정성 관리</li>' +
        '<li>데이터 수집 · 처리 파이프라인 유지보수</li>' +
        '<li>기술 문서화 및 팀 내 기술 전파</li>' +
        '</ul><h3>자격요건</h3><ul>' +
        '<li>Python 기반 백엔드 또는 MLOps 경력 3년 이상</li>' +
        '<li>LLM API (OpenAI, Anthropic 등) 활용 경험</li>' +
        '<li>클라우드 인프라 (AWS/GCP) 운영 경험</li>' +
        '<li>CI/CD, 컨테이너, 스케줄링 시스템에 대한 이해</li>' +
        '</ul><h3>우대사항</h3><ul>' +
        '<li>AI Agent 시스템 설계 · 운영 경험</li>' +
        '<li>실시간 데이터 처리 경험 (스트리밍, 이벤트 기반)</li>' +
        '<li>금융 데이터 또는 마케팅 데이터 처리 경험</li></ul>'
    },
    job4: {
      label: '인턴 · Seoul',
      title: '브랜드 콘텐츠 인턴',
      body: '<h3>역할</h3><ul>' +
        '<li>브랜드 콘텐츠 기획 보조 및 SNS 운영 서포트</li>' +
        '<li>트렌드 리서치 및 경쟁사 콘텐츠 모니터링</li>' +
        '<li>촬영 · 편집 보조 및 크리에이티브 소재 제작</li>' +
        '<li>콘텐츠 성과 데이터 정리 및 리포팅</li>' +
        '</ul><h3>자격요건</h3><ul>' +
        '<li>브랜딩, 마케팅, 콘텐츠 분야에 관심이 높은 분</li>' +
        '<li>인스타그램, 틱톡 등 소셜 미디어 트렌드 감각</li>' +
        '<li>기본적인 디자인 툴 (Figma, Canva 등) 활용 가능</li>' +
        '<li>주 3일 이상 근무 가능 (3개월 이상)</li>' +
        '</ul><h3>우대사항</h3><ul>' +
        '<li>개인 콘텐츠 채널 운영 경험</li>' +
        '<li>뷰티 · 라이프스타일 분야 관심</li>' +
        '<li>영상 편집 가능자 (Premiere, CapCut 등)</li></ul>' +
        '<h3>근무지</h3><p class="job-location">서울 성동구 연무장5가길 25, SKV1 3층</p>'
    },
    job5: {
      label: '인턴 · Remote',
      title: 'AI Data 인턴',
      body: '<h3>역할</h3><ul>' +
        '<li>AI 자동화 시스템 운영 모니터링 및 이슈 트래킹</li>' +
        '<li>데이터 수집 · 정제 · 분석 보조</li>' +
        '<li>AI 리서치 결과 검증 및 리포트 정리</li>' +
        '<li>업무 프로세스 자동화 아이디어 발굴 및 테스트</li>' +
        '</ul><h3>자격요건</h3><ul>' +
        '<li>AI, 데이터 분석에 대한 높은 관심과 학습 의지</li>' +
        '<li>Python 기초 문법 이해 (판다스, 기본 스크립팅)</li>' +
        '<li>스프레드시트 활용 능력 (Google Sheets, Excel)</li>' +
        '<li>주 3일 이상 원격 근무 가능 (3개월 이상)</li>' +
        '</ul><h3>우대사항</h3><ul>' +
        '<li>ChatGPT, Claude 등 AI 툴 적극 활용 경험</li>' +
        '<li>SQL 기초 또는 데이터 시각화 경험</li>' +
        '<li>금융, 마케팅 데이터에 대한 관심</li></ul>'
    }
  };

  // ---- Page Navigation ----
  const pages = document.querySelectorAll('.page');
  const navLinks = document.querySelectorAll('[data-page]');
  const nav = document.querySelector('.nav');
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navLinks');
  const darkPages = new Set([]);

  function goTo(id) {
    const target = document.getElementById(id);
    if (!target || target.classList.contains('active')) return;
    pages.forEach(p => { p.classList.remove('active'); p.scrollTop = 0; });
    target.classList.add('active');
    navLinks.forEach(a => a.classList.toggle('active', a.dataset.page === id));
    nav.classList.toggle('inverted', darkPages.has(id));
    toggle.classList.remove('open');
    menu.classList.remove('open');
  }

  document.addEventListener('click', e => {
    const link = e.target.closest('[data-page]');
    if (link) { e.preventDefault(); goTo(link.dataset.page); }
  });

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    menu.classList.toggle('open');
  });

  const pageIds = ['home', 'about', 'alpha', 'work', 'careers', 'contact', 'privacy'];
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const current = pageIds.findIndex(id => document.getElementById(id).classList.contains('active'));
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goTo(pageIds[Math.min(current + 1, pageIds.length - 1)]); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goTo(pageIds[Math.max(current - 1, 0)]); }
  });

  // ---- Career Accordion ----
  document.querySelectorAll('.career-item[data-job]').forEach(item => {
    const row = item.querySelector('.career-row');
    const detail = item.querySelector('.career-detail');
    const job = jobs[item.dataset.job];
    if (!job) return;
    detail.innerHTML = '<div class="career-detail-inner">' + job.body +
      '<a href="#" class="career-detail-apply" data-page="apply">지원하기</a></div>';
    row.addEventListener('click', () => {
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.career-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  // ---- Apply Page ----
  document.addEventListener('click', e => {
    const applyBtn = e.target.closest('.career-detail-apply');
    if (applyBtn) {
      e.preventDefault();
      const item = applyBtn.closest('.career-item');
      const job = item ? jobs[item.dataset.job] : null;
      if (job) {
        document.getElementById('applyPosition').textContent = job.title;
        document.getElementById('applySubject').value = 'fillts 지원 — ' + job.title;
      }
      goTo('apply');
    }
  });

  document.getElementById('applyBack').addEventListener('click', e => { e.preventDefault(); goTo('careers'); });
  document.getElementById('privacyBack').addEventListener('click', e => { e.preventDefault(); history.back ? goTo('home') : goTo('home'); });

  let snsCount = 1;
  function makeSnsOptions() {
    return '<option value="" selected>선택 안함</option>' +
      '<option value="Instagram">Instagram</option>' +
      '<option value="YouTube">YouTube</option>' +
      '<option value="LinkedIn">LinkedIn</option>' +
      '<option value="Blog">Blog</option>' +
      '<option value="Homepage">Homepage</option>' +
      '<option value="Other">기타</option>';
  }

  document.getElementById('addSns').addEventListener('click', () => {
    if (snsCount >= 4) return;
    snsCount++;
    const group = document.getElementById('snsGroup');
    const row = document.createElement('div');
    row.className = 'apply-sns-row';
    row.innerHTML =
      '<button type="button" class="apply-sns-remove">&times;</button>' +
      '<select name="sns_type_' + snsCount + '" class="form-select form-select-sm">' +
      makeSnsOptions() + '</select>' +
      '<input type="url" name="sns_url_' + snsCount + '" placeholder="URL 입력">';
    group.appendChild(row);
  });

  document.getElementById('snsGroup').addEventListener('click', e => {
    const btn = e.target.closest('.apply-sns-remove');
    if (btn) { btn.closest('.apply-sns-row').remove(); snsCount = Math.max(1, snsCount - 1); }
  });


  // ---- Success Modal ----
  const successModal = document.getElementById('successModal');
  const successTitle = document.getElementById('successTitle');
  const successMsg = document.getElementById('successMsg');
  document.getElementById('successClose').addEventListener('click', function () {
    successModal.classList.remove('open');
  });
  successModal.addEventListener('click', function (e) {
    if (e.target === successModal) successModal.classList.remove('open');
  });

  function showSuccess(title, msg, callback) {
    successTitle.textContent = title;
    successMsg.innerHTML = msg;
    successModal.classList.add('open');
    if (callback) {
      var handler = function () {
        successModal.classList.remove('open');
        document.getElementById('successClose').removeEventListener('click', handler);
        callback();
      };
      document.getElementById('successClose').addEventListener('click', handler);
    }
  }

  const applyForm = document.getElementById('applyForm');
  applyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const hasLink = document.getElementById('portfolioLink').value.trim() !== '';
    if (!hasLink) { alert('포트폴리오 링크를 입력해 주세요.'); return; }

    // Collect SNS data
    var snsList = [];
    document.querySelectorAll('.apply-sns-row').forEach(function (row) {
      var type = row.querySelector('select') ? row.querySelector('select').value : '';
      var url = row.querySelector('input[type="url"]') ? row.querySelector('input[type="url"]').value : '';
      if (type && url) snsList.push(type + ': ' + url);
    });

    // Save to Firestore
    var applyData = {
      date: new Date().toISOString(),
      position: document.getElementById('applyPosition').textContent,
      name: applyForm.querySelector('[name="name"]').value,
      email: applyForm.querySelector('[name="email"]').value,
      phone: '+82 ' + applyForm.querySelector('[name="phone_area"]').value + '-' + applyForm.querySelector('[name="phone"]').value,
      message: applyForm.querySelector('[name="message"]').value,
      sns: snsList.join(' | '),
      portfolio: document.getElementById('portfolioLink').value
    };
    db.collection('applications').add(applyData).catch(function () {});

    // Send via Formsubmit (JSON)
    fetch('https://formsubmit.co/ajax/kjw@fillts.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: 'fillts 지원 — ' + applyData.position,
        _cc: 'info@fillts.com',
        name: applyData.name,
        email: applyData.email,
        phone: applyData.phone,
        position: applyData.position,
        message: applyData.message,
        sns: applyData.sns || '없음',
        portfolio: applyData.portfolio
      })
    }).catch(function () {});

    applyForm.reset();
    showSuccess('지원이 완료되었습니다', '검토 후 연락드리겠습니다.<br>감사합니다.', function () { goTo('careers'); });
  });

  // ---- Contact Form: Firestore + Formsubmit ----
  const contactForm = document.querySelector('.contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const data = {
        date: new Date().toISOString(),
        category: contactForm.querySelector('[name="category"]').value,
        name: contactForm.querySelector('[name="name"]').value,
        email: contactForm.querySelector('[name="email"]').value,
        phone: '+82 ' + contactForm.querySelector('[name="phone_area"]').value + '-' + contactForm.querySelector('[name="phone"]').value,
        message: contactForm.querySelector('[name="message"]').value
      };

      // Save to Firestore
      db.collection('inquiries').add(data).catch(function () {});

      // Submit to Formsubmit.co (JSON AJAX)
      fetch('https://formsubmit.co/ajax/kjw@fillts.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: 'fillts.com 문의',
          _cc: 'info@fillts.com',
          category: data.category,
          name: data.name,
          email: data.email,
          phone: data.phone,
          message: data.message
        })
      }).catch(function () {});

      contactForm.reset();
      showSuccess('문의가 전달되었습니다', '확인 후 빠르게 연락드리겠습니다.<br>감사합니다.');
    });
  }

  // ---- Admin: Firebase Auth ----
  const modal = document.getElementById('adminModal');
  const loginLink = document.getElementById('adminLoginLink');
  const modalClose = document.getElementById('modalClose');
  const adminForm = document.getElementById('adminForm');
  const adminEmail = document.getElementById('adminEmail');
  const adminPw = document.getElementById('adminPw');
  const modalError = document.getElementById('modalError');

  loginLink.addEventListener('click', function (e) {
    e.preventDefault();
    // If already logged in, go straight to admin
    if (auth.currentUser) { renderAdmin(); goTo('admin'); return; }
    modal.classList.add('open');
    adminEmail.focus();
  });

  modalClose.addEventListener('click', function () {
    modal.classList.remove('open'); modalError.textContent = ''; adminPw.value = ''; adminEmail.value = '';
  });

  modal.addEventListener('click', function (e) {
    if (e.target === modal) { modal.classList.remove('open'); modalError.textContent = ''; adminPw.value = ''; adminEmail.value = ''; }
  });

  adminForm.addEventListener('submit', function (e) {
    e.preventDefault();
    modalError.textContent = '';
    auth.signInWithEmailAndPassword(adminEmail.value, adminPw.value)
      .then(function () {
        modal.classList.remove('open');
        adminPw.value = ''; adminEmail.value = '';
        renderAdmin();
        goTo('admin');
      })
      .catch(function (err) {
        modalError.textContent = '로그인 실패: 이메일 또는 비밀번호를 확인하세요.';
      });
  });

  document.getElementById('adminLogout').addEventListener('click', function (e) {
    e.preventDefault();
    auth.signOut().then(function () { goTo('contact'); });
  });

  // ---- Admin Tabs ----
  var currentTab = 'inquiries';
  document.querySelectorAll('.admin-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderAdmin();
    });
  });

  // ---- Render Admin: Read from Firestore ----
  function renderAdmin() {
    var container = document.getElementById('adminList');
    container.innerHTML = '<p class="admin-empty">불러오는 중...</p>';

    if (currentTab === 'inquiries') {
      renderInquiries(container);
    } else {
      renderApplications(container);
    }
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr);
    return d.getFullYear() + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  function renderInquiries(container) {
    db.collection('inquiries').orderBy('date', 'desc').get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          container.innerHTML = '<p class="admin-empty">문의 내역이 없습니다.</p>';
          return;
        }
        container.innerHTML = '';
        snapshot.forEach(function (doc) {
          var item = doc.data();
          var row = document.createElement('div');
          row.className = 'admin-row';
          row.innerHTML =
            '<div><span class="admin-date">' + formatDate(item.date) + '</span></div>' +
            '<div class="admin-info">' +
              '<span class="admin-category">' + escHtml(item.category || '') + '</span>' +
              '<span class="admin-name">' + escHtml(item.name) + '</span>' +
              '<span class="admin-contact">' + escHtml(item.email) +
                (item.phone && item.phone.trim() !== '+82' ? ' · ' + escHtml(item.phone) : '') +
              '</span>' +
              '<span class="admin-msg">' + escHtml(item.message) + '</span>' +
            '</div>';
          container.appendChild(row);
        });
      })
      .catch(function () {
        container.innerHTML = '<p class="admin-empty">데이터를 불러올 수 없습니다.</p>';
      });
  }

  function renderApplications(container) {
    db.collection('applications').orderBy('date', 'desc').get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          container.innerHTML = '<p class="admin-empty">지원 내역이 없습니다.</p>';
          return;
        }
        container.innerHTML = '';
        snapshot.forEach(function (doc) {
          var item = doc.data();
          var row = document.createElement('div');
          row.className = 'admin-row';
          row.innerHTML =
            '<div><span class="admin-date">' + formatDate(item.date) + '</span></div>' +
            '<div class="admin-info">' +
              '<span class="admin-category">' + escHtml(item.position || '') + '</span>' +
              '<span class="admin-name">' + escHtml(item.name) + '</span>' +
              '<span class="admin-contact">' + escHtml(item.email) +
                (item.phone ? ' · ' + escHtml(item.phone) : '') +
              '</span>' +
              (item.portfolio ? '<span class="admin-link"><a href="' + escHtml(item.portfolio) + '" target="_blank" style="color:var(--red);font-size:0.75rem;">포트폴리오</a></span>' : '') +
              (item.sns ? '<span class="admin-sns" style="font-size:0.72rem;color:var(--gray-400);">' + escHtml(item.sns) + '</span>' : '') +
              (item.message ? '<span class="admin-msg">' + escHtml(item.message) + '</span>' : '') +
            '</div>';
          container.appendChild(row);
        });
      })
      .catch(function () {
        container.innerHTML = '<p class="admin-empty">데이터를 불러올 수 없습니다.</p>';
      });
  }

  function escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
})();

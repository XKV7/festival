// ============ 사이트 표시 설정 (여기만 바꾸면 로그인/로비 배너에 반영됩니다) ============
const SITE = {
  name: 'CASINO ROYALE',
  school: '경문고등학교',
  festival: '2026 경문제',

  // 배너에 흐르는 동아리 이름 — 실제 동아리 이름으로 바꾸세요
  clubs: [
    '컴퓨터동아리 CODEX',
    '방송부 KBS',
    '밴드부 URBAN',
    '경제동아리 ECONOMIX',
    '과학탐구반 QUARK',
    '미술부 ARTOPIA',
    '축구부 FC경문',
    '독서토론반 아고라',
    '영상제작반 CUT',
    '수학동아리 MATHEMA'
  ],

  // 배너 사이사이에 섞이는 문구 (불법 사이트 감성)
  hype: [
    '★ 24시간 무제한 운영 ★',
    '첫 입장 1,000칩 즉시 지급',
    '먹튀 없음 · 정산은 접수 데스크에서',
    'AI 딜러 상시 대기중',
    '오늘의 잭팟 주인공은 당신',
    '신규 게임 8종 오픈'
  ],

  // 로비 게임 카드 뱃지/부제 (파일명 기준)
  games: {
    'slots':        { badge: 'HOT',  badgeType: 'hot',  min: 10,  tag: '슬롯' },
    'highlow':      { badge: '신규', badgeType: 'new',  min: 10,  tag: '카드' },
    'roulette':     { badge: '독점', badgeType: 'excl', min: 10,  tag: '테이블' },
    'blackjack':    { badge: '',     badgeType: '',     min: 20,  tag: '카드' },
    'baccarat':     { badge: '독점', badgeType: 'excl', min: 20,  tag: '테이블' },
    'sicbo':        { badge: '신규', badgeType: 'new',  min: 10,  tag: '테이블' },
    'indian-poker': { badge: 'AI',   badgeType: 'ai',   min: 50,  tag: 'AI 딜러' },
    'holdem':       { badge: 'AI',   badgeType: 'ai',   min: 20,  tag: 'AI 딜러' }
  }
};

// 배너 트랙 채우기: 동아리 이름과 문구를 번갈아 넣고, 끊김 없이 흐르도록 두 번 복제
function buildTicker(el) {
  if (!el) return;
  const items = [];
  const hype = SITE.hype;
  SITE.clubs.forEach((c, i) => {
    items.push(`<span class="tk-club">${c}</span>`);
    if (hype.length) items.push(`<span class="tk-hype">${hype[i % hype.length]}</span>`);
  });
  const half = `<span class="tk-group">${items.join('<span class="tk-sep">✦</span>')}<span class="tk-sep">✦</span></span>`;
  el.innerHTML = `<div class="tk-track">${half}${half}</div>`;
  // 길이에 비례한 속도 (약 90px/s)
  const track = el.querySelector('.tk-track');
  requestAnimationFrame(() => {
    const w = track.scrollWidth / 2;
    track.style.animationDuration = Math.max(20, Math.round(w / 90)) + 's';
  });
}

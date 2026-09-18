// ⚠️ 여기에 Firebase 콘솔에서 복사한 config 붙여넣기
const firebaseConfig = {
  apiKey: "여기에-붙여넣기",
  authDomain: "여기에-붙여넣기",
  databaseURL: "여기에-붙여넣기",
  projectId: "여기에-붙여넣기",
  storageBucket: "여기에-붙여넣기",
  messagingSenderId: "여기에-붙여넣기",
  appId: "여기에-붙여넣기"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ============ 계정 시스템 ============

const INITIAL_CHIPS = 1000;
const TOTAL_ACCOUNTS = 60;

// 계정 풀 자동 생성 (관리자 페이지에서 1회 실행)
async function generateAccounts(count = TOTAL_ACCOUNTS) {
  const updates = {};
  for (let i = 1; i <= count; i++) {
    const id = `PLAYER-${String(i).padStart(3, '0')}`;
    const pin = String(Math.floor(1000 + Math.random() * 9000)); // 4자리 랜덤 PIN
    updates[`accounts/${id}`] = {
      pin: pin,
      chips: INITIAL_CHIPS,
      status: 'idle',        // idle | playing | busted | settled
      loginTime: null,
      gameHistory: []
    };
  }
  await db.ref().update(updates);
  console.log(`✅ ${count}개 계정 생성 완료`);
  return updates;
}

// 로그인
async function login(playerId, pin) {
  const snap = await db.ref(`accounts/${playerId}`).once('value');
  const data = snap.val();
  if (!data) return { success: false, error: '존재하지 않는 계정' };
  if (data.pin !== pin) return { success: false, error: 'PIN 불일치' };
  if (data.status === 'playing') return { success: false, error: '이미 사용 중인 계정' };
  if (data.chips <= 0) return { success: false, error: '파산된 계정 (운영진에게 문의)' };

  await db.ref(`accounts/${playerId}`).update({
    status: 'playing',
    loginTime: firebase.database.ServerValue.TIMESTAMP
  });

  sessionStorage.setItem('playerId', playerId);
  return { success: true, chips: data.chips };
}

// 로그아웃
async function logout() {
  const playerId = sessionStorage.getItem('playerId');
  if (!playerId) return;
  await db.ref(`accounts/${playerId}`).update({ status: 'idle', loginTime: null });
  sessionStorage.removeItem('playerId');
}

// 칩 변경 (게임 결과 반영)
async function updateChips(amount) {
  const playerId = sessionStorage.getItem('playerId');
  if (!playerId) return null;

  const ref = db.ref(`accounts/${playerId}/chips`);
  const result = await ref.transaction(current => {
    if (current === null) return current;
    const newChips = Math.max(0, current + amount);
    return newChips;
  });

  const newChips = result.snapshot.val();

  // 파산 체크
  if (newChips <= 0) {
    await db.ref(`accounts/${playerId}/status`).set('busted');
  }

  return newChips;
}

// 현재 칩 실시간 리스너
function onChipsChange(callback) {
  const playerId = sessionStorage.getItem('playerId');
  if (!playerId) return;
  db.ref(`accounts/${playerId}/chips`).on('value', snap => {
    callback(snap.val());
  });
}

// 현재 로그인 체크
function getCurrentPlayer() {
  return sessionStorage.getItem('playerId');
}

// 상품 등급 계산
function getPrizeGrade(chips) {
  if (chips <= 0) return { grade: '파산', emoji: '💀', prize: '위로 사탕' };
  if (chips < 1000) return { grade: '본전 이하', emoji: '😅', prize: '소형 간식' };
  if (chips < 2000) return { grade: '소이득', emoji: '🙂', prize: '음료수' };
  if (chips < 4000) return { grade: '중이득', emoji: '😎', prize: '상품권 1,000원' };
  if (chips < 7000) return { grade: '대이득', emoji: '🤑', prize: '상품권 3,000원' };
  return { grade: '잭팟', emoji: '🎉', prize: '특별 상품' };
}

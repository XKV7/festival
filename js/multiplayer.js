// ============ 1:1 실시간 대결 공용 모듈 ============
// 구조: 두 클라이언트가 같은 엔진을 "같은 카드 · 같은 행동 순서"로 돌립니다(록스텝).
//   - 호스트(A석)가 핸드마다 카드 배분을 tables/{game}/{id}/hands/{no} 에 올립니다.
//   - 행동은 acts/{no}/{seq} 에 트랜잭션으로 씁니다. 같은 seq 는 한 명만 성공하므로
//     상대가 자리를 비웠을 때 남은 쪽이 대신 폴드를 밀어 넣어도 충돌하지 않습니다.
//   - 정산은 settle/{no} 트랜잭션을 먼저 잡은 쪽이 양쪽 계정에 한 번만 반영합니다.
// 카드가 DB에 그대로 올라가므로 상대 패를 "기술적으로" 숨기지는 못합니다(축제용 합의 사항).

const MP = {
  game: null,
  tableId: null,
  mySeat: null,          // 'A' | 'B'
  oppSeat: null,
  myPid: null,
  oppPid: null,
  isHost: false,         // A석이 호스트
  stack: 0,              // 양쪽 공통 시작 스택
  joined: false,
  _refs: [],
  _beat: null,
  _offset: 0,            // 서버 시간 - 로컬 시간
  oppLeft: false
};

const MP_BUYIN = 1000;       // 1:1 기본 바이인 (양쪽 동일)
const MP_MIN_CHIPS = 100;    // 이 미만이면 1:1 입장 불가
const MP_BEAT_MS = 3000;     // 하트비트 주기
const MP_STALE_MS = 12000;   // 이 시간 넘게 신호가 없으면 이탈로 봄
const MP_TABLE_TTL = 1000 * 60 * 30;

function mpNow() { return Date.now() + MP._offset; }
function mpRef(path) { return db.ref(`tables/${MP.game}/${MP.tableId}${path ? '/' + path : ''}`); }
function mpOther(seat) { return seat === 'A' ? 'B' : 'A'; }

// 서버 시간 보정 (기기 시계가 틀어져 있어도 마감 시각이 어긋나지 않게)
async function mpSyncClock() {
  try {
    const snap = await db.ref('.info/serverTimeOffset').once('value');
    MP._offset = snap.val() || 0;
  } catch (e) { MP._offset = 0; }
}

// ---- 매칭 ----
// 빈 자리가 있는 테이블을 찾아 앉고, 없으면 새 테이블을 만들어 기다립니다.
// onWait(state) : 'searching' | 'waiting' 상태를 UI에 알려줍니다.
// 반환: { stack } · 취소는 mpLeave()
async function mpFindMatch(game, myChips, onWait) {
  MP.game = game;
  MP.myPid = getCurrentPlayer();
  MP.oppLeft = false;
  await mpSyncClock();

  if (onWait) onWait('searching');

  // 1) 대기 중인 테이블 찾기
  const listSnap = await db.ref(`tables/${game}`).orderByChild('status').equalTo('waiting').once('value');
  const list = listSnap.val() || {};
  const ids = Object.keys(list).sort((a, b) => (list[a].created || 0) - (list[b].created || 0));

  for (const id of ids) {
    const t = list[id];
    if (!t.seats || !t.seats.A) continue;
    if (t.seats.A.pid === MP.myPid) continue;                       // 내가 만든 방
    if (mpNow() - (t.created || 0) > MP_TABLE_TTL) continue;        // 오래된 방
    if (mpNow() - (t.seats.A.beat || 0) > MP_STALE_MS) continue;    // 방장이 이미 나감

    // B석 트랜잭션으로 선점
    const res = await db.ref(`tables/${game}/${id}/seats/B`).transaction(cur => {
      if (cur) return;    // 이미 누가 앉음 → 중단
      return { pid: MP.myPid, chips: myChips, beat: Date.now() };
    });
    if (!res.committed) continue;

    MP.tableId = id;
    MP.mySeat = 'B'; MP.oppSeat = 'A';
    MP.isHost = false;
    MP.oppPid = t.seats.A.pid;
    MP.stack = Math.max(0, Math.min(MP_BUYIN, myChips, t.seats.A.chips || 0));
    await mpRef().update({ status: 'ready', stack: MP.stack, startedAt: firebase.database.ServerValue.TIMESTAMP });
    mpAttach();
    return { stack: MP.stack, opponent: MP.oppPid, host: false };
  }

  // 2) 없으면 새 테이블을 만들고 상대를 기다림
  const ref = db.ref(`tables/${game}`).push();
  MP.tableId = ref.key;
  MP.mySeat = 'A'; MP.oppSeat = 'B';
  MP.isHost = true;
  await ref.set({
    status: 'waiting',
    created: firebase.database.ServerValue.TIMESTAMP,
    seats: { A: { pid: MP.myPid, chips: myChips, beat: Date.now() } }
  });
  mpAttach();
  if (onWait) onWait('waiting');

  // B석이 찰 때까지 대기
  const seatB = await new Promise(resolve => {
    const r = mpRef('seats/B');
    const cb = r.on('value', snap => {
      if (snap.val()) { r.off('value', cb); resolve(snap.val()); }
    });
    MP._refs.push(() => r.off('value', cb));
  });
  MP.oppPid = seatB.pid;
  MP.stack = Math.max(0, Math.min(MP_BUYIN, myChips, seatB.chips || 0));
  await mpRef().update({ status: 'ready', stack: MP.stack, startedAt: firebase.database.ServerValue.TIMESTAMP });
  return { stack: MP.stack, opponent: MP.oppPid, host: true };
}

// 하트비트 · 이탈 감지 부착
function mpAttach() {
  MP.joined = true;
  const seatRef = mpRef(`seats/${MP.mySeat}`);
  seatRef.child('beat').onDisconnect().set(0);          // 탭이 닫히면 신호를 0으로
  MP._beat = setInterval(() => { seatRef.child('beat').set(Date.now()); }, MP_BEAT_MS);

  const oppRef = mpRef(`seats/${MP.oppSeat}/beat`);
  const cb = oppRef.on('value', () => {});
  MP._refs.push(() => oppRef.off('value', cb));
}

// 상대가 자리를 비웠는지 (하트비트가 끊겼는지)
async function mpOpponentGone() {
  if (!MP.joined) return false;
  const snap = await mpRef(`seats/${MP.oppSeat}/beat`).once('value');
  const beat = snap.val();
  if (!beat) return true;
  return Date.now() - beat > MP_STALE_MS;
}

// ---- 핸드 배분 (호스트가 올리고, 게스트는 받아감) ----
async function mpPublishHand(no, data) {
  await mpRef(`hands/${no}`).set(data);
}
function mpAwaitHand(no, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const r = mpRef(`hands/${no}`);
    const timer = setTimeout(() => { r.off('value', cb); reject(new Error('hand-timeout')); }, timeoutMs);
    const cb = r.on('value', snap => {
      const v = snap.val();
      if (v) { clearTimeout(timer); r.off('value', cb); resolve(v); }
    });
    MP._refs.push(() => { clearTimeout(timer); r.off('value', cb); });
  });
}

// ---- 행동 교환 ----
// 같은 (no, seq) 에는 한 번만 기록됩니다. 내가 밀어 넣든 상대가 밀어 넣든 먼저 쓴 쪽이 확정.
// 반환: 실제로 확정된 행동
async function mpPushAction(no, seq, action) {
  const res = await mpRef(`acts/${no}/${seq}`).transaction(cur => (cur ? undefined : action));
  if (res.committed) return action;
  const snap = await mpRef(`acts/${no}/${seq}`).once('value');
  return snap.val();
}

// (no, seq) 행동이 확정될 때까지 기다립니다.
// 마감이 지나면 fallback 을 대신 밀어 넣습니다. 상대가 자리를 비운 것으로 판단되면
// goneFallback(보통 폴드)을 씁니다. 단순히 늦은 것과 나가 버린 것을 구분하기 위함입니다.
function mpAwaitAction(no, seq, opts = {}) {
  const { deadline = null, fallback = null, goneFallback = null, onTick = null, graceMs = 2500 } = opts;
  return new Promise(resolve => {
    const r = mpRef(`acts/${no}/${seq}`);
    let done = false, ticker = null;
    const finish = v => {
      if (done) return;
      done = true;
      if (ticker) clearInterval(ticker);
      r.off('value', cb);
      resolve(v);
    };
    const cb = r.on('value', snap => { if (snap.val()) finish(snap.val()); });
    if (deadline && fallback) {
      ticker = setInterval(async () => {
        if (done) return;
        const remain = deadline - mpNow();
        if (onTick) onTick(Math.max(0, remain));
        if (remain > 0) return;
        const away = await mpOpponentGone();
        if (away || remain < -graceMs) {
          if (away) MP.oppLeft = true;
          const act = away && goneFallback ? goneFallback : fallback;
          const landed = await mpPushAction(no, seq, { ...act, forced: true, away: !!away });
          finish(landed);
        }
      }, 500);
    }
    MP._refs.push(() => { if (ticker) clearInterval(ticker); r.off('value', cb); });
  });
}

// ---- 정산: 먼저 잡은 쪽이 양쪽 계정에 한 번만 반영 ----
// nets = { [pid]: 순손익 }
async function mpSettle(no, nets) {
  const res = await mpRef(`settle/${no}`).transaction(cur => (cur ? undefined : { by: MP.myPid, nets, at: Date.now() }));
  if (!res.committed) return false;     // 상대가 이미 처리함
  for (const [pid, amount] of Object.entries(nets)) {
    if (!amount) continue;
    await mpApplyChips(pid, amount);
  }
  return true;
}

// 특정 계정의 칩을 트랜잭션으로 증감 (관리자 페이지와 같은 방식)
async function mpApplyChips(pid, amount) {
  const ref = db.ref(`accounts/${pid}/chips`);
  const res = await ref.transaction(cur => (cur === null ? cur : Math.max(0, cur + amount)));
  const now = res.snapshot ? res.snapshot.val() : null;
  if (now === 0) await db.ref(`accounts/${pid}/status`).set('busted');
  return now;
}

// 상대가 이미 나갔으면 바로 알려줍니다 (다음 판을 기다리며 멈춰 있지 않도록)
async function mpBothPresent() {
  return !(await mpOpponentGone());
}

// ---- 퇴장 ----
async function mpLeave() {
  if (MP._beat) { clearInterval(MP._beat); MP._beat = null; }
  MP._refs.forEach(off => { try { off(); } catch (e) {} });
  MP._refs = [];
  if (MP.tableId) {
    try {
      await mpRef(`seats/${MP.mySeat}/beat`).set(0);
      await mpRef().update({ status: 'closed' });
    } catch (e) {}
  }
  MP.joined = false;
  MP.tableId = null;
}

// 페이지를 떠날 때 자리 비움 표시
window.addEventListener('beforeunload', () => {
  if (MP.joined && MP.tableId) {
    try { mpRef(`seats/${MP.mySeat}/beat`).set(0); } catch (e) {}
  }
});

// ============ 하우스 조절기 ============
// 1) 기본 승률: 매 라운드 loseBias 확률로 결과를 2번 뽑아 나쁜 쪽을 채택한다.
//    짝수 배당 기준 플레이어 승률 약 40% (4:6). 보유 칩이 많을수록 loseBias가 커져 더 어려워진다.
// 2) 배율 상한: 총 베팅액 구간별로 "총 지급 ÷ 총 베팅"이 상한 이상인 결과는 절대 나오지 않는다.
// 3) 수수료: 승리 시 순이익에서 fee 비율을 뗀다 (인디언포커·홀덤은 자체 레이크가 있어 제외).
//   - 끄려면 enabled: false (수수료·배율 상한은 유지)
const BALANCE = {
  enabled: true,
  loseBiasBase: 0.30,    // 칩 loseBiasFrom 이하일 때 '나쁜 결과 우선' 확률
  loseBiasMax: 0.70,     // 칩 loseBiasTo 이상일 때
  loseBiasFrom: 1000,
  loseBiasTo: 6000,
  // [총 베팅 하한, 이 배율 이상 금지]  (베팅 100 미만은 제한 없음)
  payoutCaps: [
    [500, 9], [470, 10], [400, 12], [320, 15], [230, 20],
    [190, 25], [160, 30], [120, 40], [100, 50]
  ],
  fee: 0.05,             // 승리 순이익 수수료
  maxWin: 4300           // 한 판(한 라운드·한 핸드)에 가져갈 수 있는 최대 순이익
};

function loseBias(chips) {
  if (!BALANCE.enabled) return 0;
  const c = Math.max(0, chips || 0);
  const t = Math.min(1, Math.max(0, (c - BALANCE.loseBiasFrom) / (BALANCE.loseBiasTo - BALANCE.loseBiasFrom)));
  return BALANCE.loseBiasBase + t * (BALANCE.loseBiasMax - BALANCE.loseBiasBase);
}

// 이번 라운드 계획: k=1이면 자연 확률, k=2면 두 번 뽑아 나쁜 쪽
// 우대 계정이면 BOOST.k 번 뽑아 가장 좋은 쪽을 채택한다.
function balancePlan(chips) {
  if (BOOST.on) return { mode: 'best', k: BOOST.k };
  return Math.random() < loseBias(chips) ? { mode: 'worst', k: 2 } : { mode: 'best', k: 1 };
}

// 총 베팅액에 허용되는 최대 배율 (이 값 이상은 금지). 제한 없으면 Infinity
function maxMultFor(bet) {
  for (const [min, cap] of BALANCE.payoutCaps) if (bet >= min) return cap;
  return Infinity;
}
// payout = 총 지급액 (베팅 반환 포함)
function capOK(bet, payout) {
  if (!bet || bet <= 0) return true;
  return payout / bet < maxMultFor(bet);
}

// 승리 순이익 수수료 적용 (손실·본전은 그대로)
function applyFee(net) {
  return net > 0 ? Math.floor(net * (1 - BALANCE.fee)) : net;
}

// 한 판 획득 상한. 모든 게임이 칩에 반영하기 직전에 이 함수를 통과시킵니다.
// 수수료를 뗀 뒤 마지막에 적용하므로, 실제로 받는 칩이 이 값을 넘지 않습니다.
function capWin(net) {
  return net > BALANCE.maxWin ? BALANCE.maxWin : net;
}


// drawFn(): 결과 하나를 무작위로 만든다. netFn(result): 그 결과의 순손익(또는 유불리 점수).
// opts.bet: 총 베팅액 (주면 netFn을 순손익으로 보고 배율 상한을 적용)
// opts.plan: 미리 뽑아둔 balancePlan (같은 라운드에서 두 번 판단하지 않도록)
// 반환: 채택된 결과
function steerOutcome(chips, drawFn, netFn, opts) {
  opts = opts || {};
  const { mode, k } = opts.plan || balancePlan(chips);
  const bet = opts.bet || 0;
  const draw = () => {
    let r = drawFn();
    if (bet > 0) for (let i = 0; i < 300 && !capOK(bet, netFn(r) + bet); i++) r = drawFn();
    return r;
  };
  let chosen = null, chosenNet = 0;
  for (let i = 0; i < k; i++) {
    const r = draw();
    const n = netFn(r);
    if (chosen === null || (mode === 'best' ? n > chosenNet : n < chosenNet)) { chosen = r; chosenNet = n; }
  }
  return chosen;
}

// ============ 계정 우대 (운영진 전용) ============
// 관리자 페이지에서 계정별로 켜고 끕니다. 상태는 accounts/{id}/boost 에 저장되고
// 게임 화면은 이 값을 실시간으로 구독합니다. 켜고 끈 기록은 chipLog 에 남습니다.
// 켜져 있으면 balancePlan 이 후보 BOOST.k 개 중 가장 좋은 결과를 채택합니다.
// 홀덤은 카드 전체가 아니라 플롭 3장만 고릅니다 (holdem.html 의 pickBoostFlop).
// 지급 한도(payoutCaps)와 한 판 상한(maxWin)은 우대 중에도 그대로 적용됩니다.
const BOOST = { on: false, k: 8 };

function boostActive() { return BOOST.on; }

// 우대 중임을 화면에 표시한다. 켜 둔 사실을 운영진과 플레이어가 모두 알 수 있어야 한다.
function boostIndicator() {
  let el = document.getElementById('boostBadge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'boostBadge';
    el.textContent = '⚙ 운영 우대 적용 중';
    el.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9999;pointer-events:none;'
      + 'font-family:inherit;font-size:11px;font-weight:700;letter-spacing:0.3px;'
      + 'color:#1a1206;background:linear-gradient(135deg,#a07d2e,#d4a843);'
      + 'border-radius:999px;padding:5px 11px;box-shadow:0 2px 10px rgba(212,168,67,0.45);';
    document.body.appendChild(el);
  }
  el.style.display = BOOST.on ? '' : 'none';
}

function boostInit() {
  boostIndicator();
  try {
    const pid = typeof getCurrentPlayer === 'function' ? getCurrentPlayer() : null;
    if (pid && typeof db !== 'undefined' && db) {
      db.ref('accounts/' + pid + '/boost').on('value', snap => {
        BOOST.on = !!snap.val();
        boostIndicator();
      });
    }
  } catch (e) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boostInit);
else boostInit();

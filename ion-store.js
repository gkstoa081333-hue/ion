/* =====================================================================
   이온 공용 저장소 — apply.html · admin.html 이 함께 씁니다.
   - 매칭앱(index.html)과 같은 Firebase 프로젝트(eon-signal)의 Realtime DB 사용
   - 주소 끝에 ?demo 를 붙이면 '데모 모드'(이 브라우저에만 저장)로 동작
   ===================================================================== */
const ION_FIREBASE = {
  apiKey: "AIzaSyDHz9ER8j0rUNFc1wTlIrLorRdKcOU8M6M",
  authDomain: "eon-signal.firebaseapp.com",
  databaseURL: "https://eon-signal-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "eon-signal",
  appId: "1:723279688370:web:63dadb45e52e117e8ecfab"
};
const ION_DEMO = new URLSearchParams(location.search).has('demo');

/* 처음 시작할 때 쓰는 기본값 (관리자 페이지 › 설정에서 언제든 수정) */
const ION_DEFAULTS = {
  config: {
    open: true,
    fee: 40000,
    account: '카카오뱅크 3333309382128 (예금주: 김한샘)',
    payHours: 24,
    promoteHours: 12,
    contact: '인스타그램 DM',
    refund: '· 행사 7일 전(전주 토요일)까지 취소: 전액 환불\n· 행사 6~3일 전 취소: 50% 환불 (20,000원)\n· 행사 2일 전~당일 취소 및 불참: 환불 불가\n· 같은 성별의 대신 참석할 분이 있으면 행사 2일 전까지 운영진 확인 후 양도 가능\n· 다른 기수로 변경: 행사 3일 전까지 1회 가능\n· 운영진 사정 또는 성별 최소 인원 미달로 행사가 취소되면 전액 환불\n· 환불은 요청 확인 후 3영업일 안에 신청자 명의 계좌로 보내드려요'
  },
  slots: {
    's3a': { cohort: '3기', date: '11/14(토)', time: '15:00~17:00', place: '대전 괴정동 카페', cap: { M: 6, F: 6 }, public: true, order: 1 },
    's3b': { cohort: '3기', date: '11/14(토)', time: '17:00~19:00', place: '대전 괴정동 카페', cap: { M: 6, F: 6 }, public: true, order: 2 },
    's4a': { cohort: '4기', date: '11/28(토)', time: '15:00~17:00', place: '대전 학하동 카페', cap: { M: 6, F: 6 }, public: true, order: 3 },
    's4b': { cohort: '4기', date: '11/28(토)', time: '17:00~19:00', place: '대전 학하동 카페', cap: { M: 6, F: 6 }, public: true, order: 4 }
  }
};
const ION_STATUS = { pending: '입금대기', confirmed: '확정', waiting: '대기', cancelled: '취소', refunded: '환불' };
const ION_HOLDING = ['pending', 'confirmed'];
/* 타임별 대상 연령 (운영진이 설정에서 년생으로 지정 · 비우면 제한 없음) */
function ionAgeRange(s) { let a = Number(s && s.ageFrom) || 0, b = Number(s && s.ageTo) || 0; if (a && b && a > b) [a, b] = [b, a]; return { a, b }; }
function ionAgeText(s) { const { a, b } = ionAgeRange(s); const yy = y => String(y).slice(2); return a && b ? `${yy(a)}~${yy(b)}년생` : a ? `${yy(a)}년생부터` : b ? `${yy(b)}년생까지` : ''; }
function ionAgeOk(s, year) { const { a, b } = ionAgeRange(s); const y = Number(year); if (!y) return true; return (!a || y >= a) && (!b || y <= b); }

/* ---------- 후기 문항 (운영진이 후기 탭 › 문항 편집에서 바꿀 수 있음, apply/config/reviewForm 에 저장) ----------
   core: 통계에 쓰이는 기본 문항(아이디 고정) · fixed: 숨길 수 없는 문항 · 직접 추가한 문항은 후기의 extra 에 저장 */
const ION_REVIEW_FORM = { q: [
  { id: 'sat', type: 'stars', step: 1, core: true, fixed: true, req: true, label: '전반적으로 얼마나 만족하셨나요?' },
  { id: 'worry', type: 'choice', step: 1, core: true, req: true, label: '참가 전에 가장 걱정됐던 점은?', options: ['처음 보는 사람과 어색할까 봐', '대화 주제가 없을까 봐', '나와 맞는 분이 없을까 봐', '같은 교회 지인을 만날까 봐', '여러 분과 돌아가며 대화하는 방식이 낯설어서', '특별히 걱정 없었어요', '기타'] },
  { id: 'felt', type: 'text', step: 2, core: true, req: true, label: '실제로 참여해 보니 어떠셨나요? 걱정과 비교해 편하게 적어주세요.', ph: '예) 처음엔 어색했는데 진행자분 덕분에 금방 편해졌어요' },
  { id: 'moment', type: 'text', step: 2, core: true, req: true, label: '오늘 가장 기억에 남는 순간 한 가지는?', ph: '예) 같은 교회 수련회 얘기로 웃었던 순간' },
  { id: 'size', type: 'choice', step: 2, core: true, req: true, label: '소규모 진행은 어떠셨나요?', options: ['딱 좋았어요', '조금 적었어요', '조금 많았어요'] },
  { id: 'pace', type: 'choice', step: 2, core: true, req: true, label: '한 분과 대화하는 시간은 어땠나요?', options: ['짧았어요', '적당했어요', '길었어요'] },
  { id: 'improve', type: 'text', step: 2, core: true, req: true, label: '다음에 더 좋아졌으면 하는 점이 있다면?', ph: '없으면 "없음"이라고 적어주세요' },
  { id: 'again', type: 'choice', step: 3, core: true, req: true, label: '다음 기수에 다시 참여할 의향이 있으신가요?', options: ['다음 기수에도 참여하고 싶어요', '고민 중이에요', '아니요'] },
  { id: 'nps', type: 'nps', step: 3, core: true, fixed: true, req: true, label: '이온을 지인에게 추천할 의향은 몇 점인가요?' },
  { id: 'share', type: 'share', step: 3, core: true, fixed: true, req: true, label: '남겨주신 후기를 홍보에 소개해도 될까요?' }
] };
// 저장된 문항을 불러올 때: 빠진 고정 문항은 기본값으로 채우고, 형식이 이상한 항목은 버림
function ionReviewForm(saved) {
  const def = ION_REVIEW_FORM.q;
  const list = Array.isArray(saved && saved.q) ? saved.q.filter(x => x && x.id && x.type && x.label).map(x => ({ ...x, options: Array.isArray(x.options) ? x.options.filter(Boolean) : x.options })) : def.map(x => ({ ...x }));
  def.filter(d => d.fixed && !list.some(x => x.id === d.id)).forEach(d => list.push({ ...d }));
  list.forEach(x => { const d = def.find(y => y.id === x.id); if (d) { x.core = true; x.type = d.type; if (d.fixed) { x.fixed = true; x.hidden = false; x.req = true; } } x.step = [1, 2, 3].includes(+x.step) ? +x.step : 2; });
  return { q: list };
}

async function ionSha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const IonStore = (() => {
  if (!ION_DEMO) {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(ION_FIREBASE);
    const db = app.database(), auth = app.auth();
    // 로그인 상태를 이 기기에 저장 → 로그아웃 전까지 자동 로그인
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    const store = {
      demo: false,
      async get(p) { const s = await db.ref(p).get(); return s.exists() ? s.val() : null; },
      set: (p, v) => db.ref(p).set(v),
      update: (p, o) => db.ref(p).update(o),
      remove: p => db.ref(p).remove(),
      newId: p => db.ref(p).push().key,
      async txn(p, fn) { const r = await db.ref(p).transaction(fn, undefined, false); return { committed: r.committed, value: r.snapshot.val() }; },
      watch(p, cb, onErr) { const r = db.ref(p); const h = s => cb(s.val()); r.on('value', h, e => { console.error(e); onErr && onErr(e); }); return () => r.off('value', h); },
      async ensureAnon() {
        // 저장된 로그인(운영진 등)이 복원될 때까지 기다린 뒤, 없을 때만 익명 로그인
        await new Promise(r => { const off = auth.onAuthStateChanged(() => { off(); r(); }); });
        if (!auth.currentUser) await auth.signInAnonymously();
        return auth.currentUser.uid;
      },
      signIn: (e, pw) => auth.signInWithEmailAndPassword(e, pw),
      signOut: () => auth.signOut(),
      resetPassword: e => auth.sendPasswordResetEmail(e),
      onAuth(cb) {
        auth.onAuthStateChanged(async u => {
          if (!u || u.isAnonymous) return cb({ user: u, admin: false });
          let ok = false; try { ok = (await store.get('admins/' + u.uid)) === true; } catch (e) {}
          cb({ user: u, admin: ok });
        });
      }
    };
    return store;
  }

  /* ---------- 데모: localStorage 트리 ---------- */
  const KEY = 'ion_demo_tree', AKEY = 'ion_demo_admin';
  const subs = []; const authSubs = [];
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const parts = p => String(p).split('/').filter(Boolean);
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  let tree = load();
  const getAt = p => { let n = tree; for (const k of parts(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : clone(n); };
  const setAt = (p, v) => {
    const ks = parts(p); if (!ks.length) { tree = v || {}; return; }
    let n = tree; ks.slice(0, -1).forEach(k => { if (typeof n[k] !== 'object' || n[k] === null) n[k] = {}; n = n[k]; });
    if (v === null || v === undefined) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = clone(v);
  };
  const notify = () => subs.forEach(s => { const v = getAt(s.p); const j = JSON.stringify(v); if (j !== s.last) { s.last = j; s.cb(v); } });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch (e) {} notify(); };
  window.addEventListener('storage', e => { if (e.key === KEY) { tree = load(); notify(); } });
  const isAdmin = () => { try { return localStorage.getItem(AKEY) === '1'; } catch (e) { return false; } };
  const wait = () => new Promise(r => setTimeout(r, 150));
  return {
    demo: true,
    async get(p) { await wait(); return getAt(p); },
    async set(p, v) {
      await wait();
      if (!isAdmin() && /^apply\/(phones|apps)\//.test(p) && getAt(p) !== null) throw new Error('PERMISSION_DENIED');
      setAt(p, v); save();
    },
    async update(p, o) { await wait(); Object.entries(o).forEach(([k, v]) => setAt(p + '/' + k, v)); save(); },
    async remove(p) { await wait(); setAt(p, null); save(); },
    newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
    async txn(p, fn) { await wait(); const nv = fn(getAt(p)); if (nv === undefined) return { committed: false, value: getAt(p) }; setAt(p, nv); save(); return { committed: true, value: nv }; },
    watch(p, cb) { const s = { p, cb, last: null }; subs.push(s); setTimeout(() => { s.last = JSON.stringify(getAt(p)); cb(getAt(p)); }, 0); return () => subs.splice(subs.indexOf(s), 1); },
    async ensureAnon() { return 'demo-user'; },
    async signIn() { try { localStorage.setItem(AKEY, '1'); } catch (e) {} authSubs.forEach(cb => cb({ user: { uid: 'demo' }, admin: true })); },
    async resetPassword() {},
    async signOut() { try { localStorage.removeItem(AKEY); } catch (e) {} authSubs.forEach(cb => cb({ user: null, admin: false })); },
    onAuth(cb) { authSubs.push(cb); setTimeout(() => cb({ user: isAdmin() ? { uid: 'demo' } : null, admin: isAdmin() }), 0); },
    resetDemo() { tree = {}; save(); }
  };
})();

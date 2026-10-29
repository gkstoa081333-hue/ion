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
    refund: '· 행사 7일 전까지 취소: 전액 환불\n· 행사 3일 전까지 취소: 50% 환불\n· 그 이후 및 당일 불참: 환불 불가\n· 운영진 사정으로 취소 시 전액 환불'
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

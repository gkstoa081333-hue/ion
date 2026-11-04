/* =====================================================================
   이온 크리스천 소개팅 · 자동 문자 엔진 (구글 Apps Script)
   - 1분마다 Firebase 신청서를 확인해서 솔라피로 문자 발송
   - 보내는 문구는 사이트의 ion-sms.js (관리자 화면과 같은 문구)
   - 켜기/끄기·시험 모드·종류 선택은 관리자 › 설정 › 📱 자동 문자에서
   - 솔라피 키는 [프로젝트 설정 › 스크립트 속성]에만 저장 (코드·DB에 넣지 않음)
       SOLAPI_KEY / SOLAPI_SECRET / SENDER(발신번호, 숫자만)
   처음 한 번: 위쪽 함수 선택에서 setup 고르고 ▶ 실행 → 권한 허용
   ===================================================================== */
const DB_URL = 'https://eon-signal-default-rtdb.asia-southeast1.firebasedatabase.app';
const SITE = 'https://gkstoa081333-hue.github.io/ion/';
const VERSION = '2026-11-04b';
const RETRY_MIN = 10, RETRY_MAX = 5;  // 실패하면 10분 뒤 다시, 최대 5번
const MAX_PER_RUN = 20;               // 한 번에 최대 발송 수 (사고 방지)
const QUIET_FROM = 22, QUIET_TO = 8;  // 밤 10시~아침 8시는 보류했다가 8시에 발송

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();
  const p = PropertiesService.getScriptProperties();
  const miss = ['SOLAPI_KEY', 'SOLAPI_SECRET', 'SENDER'].filter(k => !p.getProperty(k));
  const r = tick();
  Logger.log('✅ 설치 완료 (1분마다 실행) · 지금 결과: ' + JSON.stringify(r) + (miss.length ? ' · ⚠️ 스크립트 속성에 아직 없음: ' + miss.join(', ') : ''));
}

function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return 'busy';
  let out = { sent: 0, test: 0, fail: 0 };
  try {
    const auto = db('apply/autoSms') || {};
    const mode = auto.mode || 'off';
    if (mode === 'off') { beat({ mode }); return 'off'; }
    const cfg = db('apply/config') || {}, slots = db('apply/slots') || {}, apps = db('apply/apps') || {};
    const S = loadTpl();
    const now = Date.now(), since = +auto.since || now, kinds = auto.kinds || {};
    const on = k => kinds[k] !== false;
    const h = kstHour(now), quiet = h >= QUIET_FROM || h < QUIET_TO;
    const list = Object.values(apps).filter(r => r && r.id && r.phone);
    const waitNo = r => list.filter(x => x.slotId === r.slotId && x.gender === r.gender && x.status === 'waiting').sort((a, b) => a.at - b.at).findIndex(x => x.id === r.id) + 1;
    const jobs = [];
    list.forEach(r => {
      const done = Object.assign({}, r.sms || {}, mode === 'test' ? (r.smsTest || {}) : {});
      const sl = slots[r.slotId] || {};
      if (r.status === 'pending' && r.payName && !done.pay && !done.promote) {
        const promoted = String(r.log || '').indexOf('승격') >= 0;
        const k = promoted ? 'promote' : 'pay';
        const t0 = promoted ? (+r.deadline || 0) - (Number(cfg.promoteHours) || 12) * 3600e3 : +r.at;
        if (on(k) && t0 >= since && !quiet) jobs.push([r, k, sl]);
      }
      if (r.status === 'waiting' && on('wait') && !done.wait && +r.at >= since && !quiet) jobs.push([r, 'wait', sl]);
      if (r.status === 'confirmed' && on('confirm') && !done.confirm && (+r.confirmedAt || 0) >= since && !quiet) jobs.push([r, 'confirm', sl]);
      if (r.status === 'confirmed' && on('d1') && !done.d1 && isEveBefore(sl.date || r.date, now)) jobs.push([r, 'd1', sl]);
    });
    const fails = r => (r.smsFail || {});
    const ready = ([r, k]) => { const f = fails(r)[k]; return !f || (f.n < RETRY_MAX && now - f.at >= RETRY_MIN * 60e3); };
    jobs.filter(ready).slice(0, MAX_PER_RUN).forEach(([r, k, sl]) => {
      const text = S.render(k, r, cfg, sl, { waitNo: waitNo(r) });
      const label = (S.T[k] || {}).label || k;
      if (mode === 'test') {
        db(`apply/apps/${r.id}/smsTest/${k}`, 'put', now);
        log({ at: now, id: r.id, name: r.name, kind: k, label, mode: 'test', ok: true, text });
        out.test++; return;
      }
      db(`apply/apps/${r.id}/sms/${k}`, 'put', now);   // 먼저 표시해서 두 번 발송 방지
      try {
        solapi(r.phone, text);
        if (fails(r)[k]) db(`apply/apps/${r.id}/smsFail/${k}`, 'delete');
        log({ at: now, id: r.id, name: r.name, kind: k, label, mode: 'live', ok: true, text });
        out.sent++;
      } catch (e) {
        db(`apply/apps/${r.id}/sms/${k}`, 'delete');
        const f = fails(r)[k] || { n: 0 }; db(`apply/apps/${r.id}/smsFail/${k}`, 'put', { n: f.n + 1, at: now });
        log({ at: now, id: r.id, name: r.name, kind: k, label, mode: 'live', ok: false, err: String(e.message || e).slice(0, 300) });
        out.fail++;
      }
    });
    beat({ mode, jobs: jobs.length, ...out });
    return out;
  } catch (e) {
    try { beat({ err: String(e.message || e).slice(0, 300) }); } catch (x) {}
    throw e;
  } finally { lock.releaseLock(); }
}

/* ---------- 도우미 ---------- */
function db(path, method, body) {
  const opt = { method: method || 'get', contentType: 'application/json', muteHttpExceptions: true };
  if (body !== undefined) opt.payload = JSON.stringify(body);
  const res = UrlFetchApp.fetch(`${DB_URL}/${path}.json?access_token=${ScriptApp.getOAuthToken()}`, opt);
  if (res.getResponseCode() >= 300) throw new Error(`DB ${path} ${res.getResponseCode()} ${res.getContentText().slice(0, 200)}`);
  return JSON.parse(res.getContentText() || 'null');
}
function loadTpl() {
  const code = UrlFetchApp.fetch(SITE + 'ion-sms.js?t=' + Date.now()).getContentText();
  (0, eval)(code);
  if (!globalThis.ION_SMS) throw new Error('문구 파일(ion-sms.js)을 읽지 못했어요');
  return globalThis.ION_SMS;
}
function solapi(to, text) {
  const p = PropertiesService.getScriptProperties();
  const key = p.getProperty('SOLAPI_KEY'), sec = p.getProperty('SOLAPI_SECRET'), from = String(p.getProperty('SENDER') || '').replace(/\D/g, '');
  if (!key || !sec || !from) throw new Error('스크립트 속성(SOLAPI_KEY·SOLAPI_SECRET·SENDER)을 먼저 넣어주세요');
  const date = new Date().toISOString(), salt = Utilities.getUuid().replace(/-/g, '');
  const sig = Utilities.computeHmacSha256Signature(date + salt, sec).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
  const res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send-many', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${sig}` },
    payload: JSON.stringify({ messages: [{ to: String(to).replace(/\D/g, ''), from, text }] })
  });
  const body = res.getContentText();
  if (res.getResponseCode() >= 300) throw new Error('솔라피 ' + res.getResponseCode() + ' ' + body.slice(0, 200));
  const j = JSON.parse(body || '{}');
  const fail = j.failedMessageList && j.failedMessageList.length ? j.failedMessageList[0] : null;
  if (fail) throw new Error('솔라피 거절: ' + (fail.statusMessage || fail.statusCode || JSON.stringify(fail)).slice(0, 200));
  return j;
}
function log(x) { db('apply/smsLog', 'post', x); }
function beat(x) { db('apply/smsEngine', 'patch', Object.assign({ lastRun: Date.now(), version: VERSION, err: null }, x)); }
function kstHour(ms) { return new Date(ms + 9 * 3600e3).getUTCHours(); }
// 행사 전날 저녁 6시~10시(한국시간)인가? 날짜 문자열은 "11/14(토)" 형태
function isEveBefore(dateTxt, now) {
  const m = String(dateTxt || '').match(/(\d{1,2})\s*[\/.월]\s*(\d{1,2})/); if (!m) return false;
  const k = new Date(now + 9 * 3600e3); let y = k.getUTCFullYear();
  let ev = Date.UTC(y, +m[1] - 1, +m[2]);
  if (ev < Date.UTC(y, k.getUTCMonth(), k.getUTCDate()) - 60 * 864e5) ev = Date.UTC(y + 1, +m[1] - 1, +m[2]);
  const today = Date.UTC(y, k.getUTCMonth(), k.getUTCDate());
  const h = k.getUTCHours();
  return ev - today === 864e5 && h >= 18 && h < 22;
}
/* 시험용: 함수 선택에서 testSend 고르고 실행 → 발신번호(SENDER)로 시험 문자 1통 */
function testSend() {
  const p = PropertiesService.getScriptProperties();
  Logger.log(JSON.stringify(solapi(p.getProperty('SENDER'), '[이온] 자동 문자 시험 발송이에요 🙂')));
}

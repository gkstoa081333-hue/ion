/* =====================================================================
   이온(ion) 신청 관리 — Google Apps Script (구글 시트에 붙여 쓰는 백엔드)
   ---------------------------------------------------------------------
   ▶ 설치 (5분)
     1. 빈 구글 시트를 만들고 > 확장 프로그램 > Apps Script
     2. 이 파일 내용을 Code.gs 에 통째로 붙여넣고 저장
     3. 프로젝트 설정(톱니) > 시간대: (GMT+09:00) 서울
     4. 위쪽 함수 선택에서 setup 선택 → 실행 → 권한 허용
        - 설정 / 타임 / 신청자 / 기록 탭이 만들어지고
        - 1시간마다 '미입금 자동취소' 트리거가 켜지고
        - 관리자 키가 만들어집니다 (실행 로그와 시트 알림에 표시)
     5. 배포 > 새 배포 > 유형: 웹 앱
        - 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포
        - 나온 웹 앱 URL(…/exec)을 apply.html, admin.html 의 API_URL 에 넣기
     ※ 코드를 고친 뒤에는 배포 > 배포 관리 > 수정(연필) > 버전: 새 버전 으로 다시 배포
   ▶ 운영
     - 기수·타임·정원은 '타임' 탭, 계좌·참가비·환불규정은 '설정' 탭에서만 고치면 됩니다.
     - 신청자 상태: 입금대기 → 확정 / 대기 → (자리 나면) 입금대기 / 취소 / 환불
   ===================================================================== */

const TZ = 'Asia/Seoul';
const SH = { conf: '설정', slots: '타임', apps: '신청자', log: '기록' };

const HEAD = ['신청번호', '신청일시', '상태', '기수', '행사일', '타임', '슬롯ID', '성별', '이름', '출생연도', '연락처',
  '거주지역', '직업', '출석교회명', '교회주소', '교단', '신앙생활기간', '교회출석여부', '유입경로', '요청사항',
  '입금자명', '입금기한', '확정일시', '수신동의', '환불규정확인', '개인정보동의', '신앙정보동의', '연락처제공동의',
  '발송기록', '메모'];
const SLOT_HEAD = ['슬롯ID', '기수', '행사일', '시간', '장소', '형제정원', '자매정원', '공개'];
const STATUSES = ['입금대기', '확정', '대기', '취소', '환불'];
const HOLDING = ['입금대기', '확정'];           // 자리를 차지하는 상태
const ACTIVE = ['입금대기', '확정', '대기'];      // 중복 신청 판단 기준

/* ---------------- 진입점 ---------------- */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'config';
    if (action === 'config') return json_({ ok: true, ...publicConfig_() });
    return json_({ ok: false, error: '알 수 없는 요청' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: '서버 오류: ' + err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'apply') return json_(apply_(body.data || {}));
    if (String(body.action || '').indexOf('admin.') === 0) return json_(admin_(body));
    return json_({ ok: false, error: '알 수 없는 요청' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: '서버 오류: ' + err.message });
  }
}

/* ---------------- 공개 설정 (신청 페이지용) ---------------- */
function publicConfig_() {
  const conf = conf_();
  const slots = slots_();
  const counts = counts_(rows_());
  const open = String(conf['모집상태'] || '').trim() === '열림';
  return {
    open,
    fee: Number(conf['참가비'] || 0),
    refund: String(conf['환불규정'] || ''),
    contact: String(conf['문의'] || ''),
    payHours: Number(conf['입금기한(시간)'] || 24),
    slots: slots.filter(s => s.public).map(s => {
      const c = counts[s.id] || { M: 0, F: 0 };
      return { id: s.id, cohort: s.cohort, date: s.date, time: s.time, place: s.place,
        left: { M: Math.max(0, s.cap.M - c.M), F: Math.max(0, s.cap.F - c.F) } };
    })
    // 계좌는 신청 완료 응답에만 담습니다.
  };
}

/* ---------------- 신청 접수 ---------------- */
function apply_(d) {
  if (d.website) return { ok: true, id: '-', status: '입금대기' };          // 허니팟(봇) 조용히 무시
  const conf = conf_();
  if (String(conf['모집상태'] || '').trim() !== '열림') return { ok: false, error: '지금은 모집 기간이 아니에요.' };

  // 서버 검증 (화면 검증과 별개로 한 번 더)
  const phone = String(d.phone || '').replace(/\D/g, '');
  const year = Number(d.birthYear);
  const req = { gender: '성별', slotId: '신청 타임', name: '이름', region: '거주 지역', job: '직업', church: '출석교회명',
    denom: '교단', faithYears: '신앙생활 기간', attend: '교회 출석 여부', source: '알게 된 경로', newsAgree: '소식 수신 여부' };
  for (const k in req) if (!String(d[k] || '').trim()) return { ok: false, error: req[k] + '을(를) 입력해 주세요.' };
  if (!['M', 'F'].includes(d.gender)) return { ok: false, error: '성별을 다시 선택해 주세요.' };
  if (!/^01\d{8,9}$/.test(phone)) return { ok: false, error: '연락처를 다시 확인해 주세요.' };
  if (!(year >= 1950 && year <= new Date().getFullYear() - 18)) return { ok: false, error: '출생 연도를 다시 확인해 주세요.' };
  if (!(d.refundOk && d.privacyOk && d.faithOk && d.shareOk)) return { ok: false, error: '필수 동의 항목을 확인해 주세요.' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: '신청이 몰리고 있어요. 잠시 후 다시 눌러주세요.' };
  try {
    const slot = slots_().find(s => s.id === d.slotId && s.public);
    if (!slot) return { ok: false, error: '선택한 타임을 찾을 수 없어요. 새로고침 후 다시 선택해 주세요.' };

    const rows = rows_();
    const dup = rows.find(r => r['기수'] === slot.cohort && String(r['연락처']).replace(/\D/g, '') === phone && ACTIVE.includes(r['상태']));
    if (dup) return { ok: false, error: '이 연락처로 이미 ' + slot.cohort + ' 신청이 되어 있어요. (신청번호 ' + dup['신청번호'] + ')' };

    const c = counts_(rows)[slot.id] || { M: 0, F: 0 };
    const status = c[d.gender] < slot.cap[d.gender] ? '입금대기' : '대기';

    const props = PropertiesService.getScriptProperties();
    const seq = Number(props.getProperty('SEQ') || 0) + 1;
    props.setProperty('SEQ', String(seq));
    const id = 'ION-' + String(seq).padStart(4, '0');
    const cleanName = String(d.name).replace(/\s/g, '').slice(0, 20);
    const payName = cleanName.slice(0, 4) + String(seq % 1000).padStart(3, '0');   // 은행 표기 7자 이내
    const now = new Date();
    const deadline = status === '입금대기' ? new Date(now.getTime() + Number(conf['입금기한(시간)'] || 24) * 3600e3) : '';

    appendRow_({
      '신청번호': id, '신청일시': now, '상태': status, '기수': slot.cohort, '행사일': slot.date, '타임': slot.time,
      '슬롯ID': slot.id, '성별': d.gender === 'M' ? '형제' : '자매', '이름': cleanName, '출생연도': year,
      '연락처': fmtPhone_(phone), '거주지역': d.region, '직업': d.job, '출석교회명': d.church, '교회주소': d.churchAddr || '',
      '교단': d.denom, '신앙생활기간': d.faithYears, '교회출석여부': d.attend, '유입경로': d.source,
      '요청사항': d.note || '', '입금자명': status === '입금대기' ? payName : '', '입금기한': deadline,
      '수신동의': d.newsAgree, '환불규정확인': 'Y', '개인정보동의': 'Y', '신앙정보동의': 'Y', '연락처제공동의': 'Y',
      '발송기록': '', '메모': ''
    });

    let waitNo = 0;
    if (status === '대기') waitNo = rows.filter(r => r['슬롯ID'] === slot.id && r['성별'] === (d.gender === 'M' ? '형제' : '자매') && r['상태'] === '대기').length + 1;

    notify_('[이온] 새 신청 ' + id + ' · ' + cleanName + ' (' + (d.gender === 'M' ? '형제' : '자매') + ')',
      slot.cohort + ' ' + slot.date + ' ' + slot.time + '\n상태: ' + status + (status === '입금대기' ? '\n입금자명: ' + payName : '\n대기 ' + waitNo + '번'));

    return { ok: true, id, status, payName: status === '입금대기' ? payName : '', waitNo,
      deadline: deadline ? deadline.toISOString() : '', fee: Number(conf['참가비'] || 0),
      account: String(conf['입금계좌'] || ''), cohort: slot.cohort, date: slot.date, time: slot.time, place: slot.place };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- 관리자 API ---------------- */
function admin_(b) {
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || String(b.key || '') !== key) {
    Utilities.sleep(800);                                         // 무차별 대입 지연
    return { ok: false, error: '관리자 키가 맞지 않아요.', auth: false };
  }
  if (b.action === 'admin.list') return adminList_();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: '잠시 후 다시 시도해 주세요.' };
  try {
    if (b.action === 'admin.update') return adminUpdate_(b.id, b.status, b.memo);
    if (b.action === 'admin.log') return adminLog_(b.id, b.what);
    return { ok: false, error: '알 수 없는 요청' };
  } finally {
    lock.releaseLock();
  }
}

function adminList_() {
  const conf = conf_();
  const slots = slots_();
  const rows = rows_().map(r => {
    const o = {};
    HEAD.forEach(h => { o[h] = r[h] instanceof Date ? r[h].toISOString() : (r[h] === undefined ? '' : r[h]); });
    return o;
  });
  return { ok: true, rows, slots, conf: {
    fee: Number(conf['참가비'] || 0), account: String(conf['입금계좌'] || ''), open: String(conf['모집상태'] || '') === '열림',
    contact: String(conf['문의'] || ''), promoteHours: Number(conf['승격입금기한(시간)'] || 12) } };
}

function adminUpdate_(id, status, memo) {
  const found = findRow_(id);
  if (!found) return { ok: false, error: '신청번호를 찾을 수 없어요: ' + id };
  const { sheet, rowIdx, map, row } = found;
  const promoted = [];
  if (status) {
    if (!STATUSES.includes(status)) return { ok: false, error: '알 수 없는 상태: ' + status };
    const prev = row['상태'];
    set_(sheet, rowIdx, map, '상태', status);
    if (status === '확정' && !row['확정일시']) set_(sheet, rowIdx, map, '확정일시', new Date());
    if (status === '입금대기') {                                     // 수동 승격
      const conf = conf_();
      set_(sheet, rowIdx, map, '입금기한', new Date(Date.now() + Number(conf['승격입금기한(시간)'] || 12) * 3600e3));
      if (!row['입금자명']) set_(sheet, rowIdx, map, '입금자명', makePayName_(row['이름'], row['신청번호']));
      if (prev === '대기') appendLog_(sheet, rowIdx, map, row, '승격');
    }
    if (HOLDING.includes(prev) && !HOLDING.includes(status)) promoted.push(...promote_(row['슬롯ID'], row['성별']));
  }
  if (memo !== undefined && memo !== null) set_(sheet, rowIdx, map, '메모', String(memo));
  return { ok: true, promoted };
}

function adminLog_(id, what) {
  const found = findRow_(id);
  if (!found) return { ok: false, error: '신청번호를 찾을 수 없어요.' };
  appendLog_(found.sheet, found.rowIdx, found.map, found.row, what);
  return { ok: true };
}

/* ---------------- 자동 처리: 미입금 취소 + 대기 승격 ---------------- */
function expireUnpaid() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const now = Date.now();
    const sheet = sheet_(SH.apps);
    const { map, rows } = table_(sheet);
    const cancelled = [], promoted = [];
    rows.forEach((r, i) => {
      if (r['상태'] !== '입금대기' || !(r['입금기한'] instanceof Date) || r['입금기한'].getTime() > now) return;
      set_(sheet, i + 2, map, '상태', '취소');
      set_(sheet, i + 2, map, '메모', [r['메모'], '미입금 자동취소 ' + fmt_(new Date(), 'M/d HH:mm')].filter(Boolean).join(' / '));
      cancelled.push(r['신청번호'] + ' ' + r['이름']);
      promoted.push(...promote_(r['슬롯ID'], r['성별']));
    });
    if (cancelled.length || promoted.length) {
      notify_('[이온] 미입금 자동취소 ' + cancelled.length + '건 · 대기 승격 ' + promoted.length + '건',
        '자동취소\n- ' + (cancelled.join('\n- ') || '없음') + '\n\n승격 (입금 안내 문자를 보내주세요)\n- ' + (promoted.join('\n- ') || '없음'));
    }
  } finally {
    lock.releaseLock();
  }
}

// 같은 타임·성별의 대기 1번을 빈자리만큼 입금대기로 올림
function promote_(slotId, genderLabel) {
  const slot = slots_().find(s => s.id === slotId);
  if (!slot) return [];
  const g = genderLabel === '형제' ? 'M' : 'F';
  const sheet = sheet_(SH.apps);
  const { map, rows } = table_(sheet);
  let held = rows.filter(r => r['슬롯ID'] === slotId && r['성별'] === genderLabel && HOLDING.includes(r['상태'])).length;
  const conf = conf_();
  const out = [];
  rows.map((r, i) => ({ r, i }))
    .filter(x => x.r['슬롯ID'] === slotId && x.r['성별'] === genderLabel && x.r['상태'] === '대기')
    .sort((a, b) => new Date(a.r['신청일시']) - new Date(b.r['신청일시']))
    .forEach(({ r, i }) => {
      if (held >= slot.cap[g]) return;
      set_(sheet, i + 2, map, '상태', '입금대기');
      set_(sheet, i + 2, map, '입금기한', new Date(Date.now() + Number(conf['승격입금기한(시간)'] || 12) * 3600e3));
      set_(sheet, i + 2, map, '입금자명', makePayName_(r['이름'], r['신청번호']));
      appendLog_(sheet, i + 2, map, r, '승격');
      held++;
      out.push(r['신청번호'] + ' ' + r['이름']);
    });
  return out;
}

/* ---------------- 초기 설정 ---------------- */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);

  const conf = ensureSheet_(SH.conf, ['항목', '값', '설명']);
  if (conf.getLastRow() < 2) {
    conf.getRange(2, 1, 8, 3).setValues([
      ['모집상태', '열림', '열림 / 닫힘 — 닫힘이면 신청 페이지가 마감 화면으로 바뀝니다'],
      ['참가비', 40000, '숫자만'],
      ['입금계좌', '○○은행 000-0000-0000 (예금주 ○○○)', '신청 완료 화면에만 표시'],
      ['입금기한(시간)', 24, '신청 후 이 시간 안에 입금 없으면 자동취소'],
      ['승격입금기한(시간)', 12, '대기에서 올라온 분의 입금기한'],
      ['운영진이메일', Session.getActiveUser().getEmail() || '', '새 신청·자동취소 알림 받을 메일 (쉼표로 여러 개)'],
      ['문의', '인스타그램 @ion_christian (DM)', '신청 페이지 하단 문의처'],
      ['환불규정', '· 행사 7일 전까지 취소: 전액 환불\n· 행사 3일 전까지 취소: 50% 환불\n· 그 이후 및 당일 불참: 환불 불가\n· 운영진 사정으로 취소 시 전액 환불', '★ 실제 규정으로 꼭 수정하세요']
    ]);
    conf.setColumnWidth(1, 150).setColumnWidth(2, 380).setColumnWidth(3, 360);
    conf.getRange('B2:B').setWrap(true);
  }

  const slots = ensureSheet_(SH.slots, SLOT_HEAD);
  if (slots.getLastRow() < 2) {
    slots.getRange(2, 1, 4, SLOT_HEAD.length).setValues([
      ['3-1', '3기', '11/14(토)', '15:00~17:00', '대전 괴정동 카페', 6, 6, 'Y'],
      ['3-2', '3기', '11/14(토)', '17:00~19:00', '대전 괴정동 카페', 6, 6, 'Y'],
      ['4-1', '4기', '11/28(토)', '15:00~17:00', '대전 학하동 카페', 6, 6, 'Y'],
      ['4-2', '4기', '11/28(토)', '17:00~19:00', '대전 학하동 카페', 6, 6, 'Y']
    ]);
    slots.getRange('C2:C').setNumberFormat('@');
  }

  const apps = ensureSheet_(SH.apps, HEAD);
  const stCol = HEAD.indexOf('상태') + 1;
  apps.getRange(2, stCol, apps.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  apps.getRange(2, HEAD.indexOf('신청일시') + 1, apps.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  apps.getRange(2, HEAD.indexOf('입금기한') + 1, apps.getMaxRows() - 1, 1).setNumberFormat('mm/dd hh:mm');
  apps.getRange(2, HEAD.indexOf('확정일시') + 1, apps.getMaxRows() - 1, 1).setNumberFormat('mm/dd hh:mm');
  apps.getRange(2, HEAD.indexOf('연락처') + 1, apps.getMaxRows() - 1, 1).setNumberFormat('@');
  ensureSheet_(SH.log, ['시각', '내용']);

  // 1시간마다 미입금 자동취소
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'expireUnpaid').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('expireUnpaid').timeBased().everyHours(1).create();

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', 'ion-' + Utilities.getUuid().slice(0, 8));
  showKey();
}

function showKey() {
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  const msg = '관리자 키: ' + key + '\n관리자 페이지 처음 접속할 때 한 번 입력하세요. 운영진 외에는 공유하지 마세요.';
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* 편집기에서 실행하면 실행 로그에서 확인 */ }
}

function resetKey() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', 'ion-' + Utilities.getUuid().slice(0, 8));
  showKey();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('이온')
    .addItem('초기 설정 (처음 한 번)', 'setup')
    .addItem('관리자 키 보기', 'showKey')
    .addItem('관리자 키 새로 만들기', 'resetKey')
    .addSeparator()
    .addItem('미입금 정리 지금 실행', 'expireUnpaid')
    .addToUi();
}

/* ---------------- 시트 유틸 ---------------- */
function sheet_(name) {
  const s = SpreadsheetApp.getActive().getSheetByName(name);
  if (!s) throw new Error('"' + name + '" 탭이 없어요. 이온 > 초기 설정을 먼저 실행해 주세요.');
  return s;
}
function ensureSheet_(name, head) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  if (s.getLastRow() === 0) {
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#26453B').setFontColor('#F6F1E7');
    s.setFrozenRows(1);
  }
  return s;
}
function table_(sheet) {
  const values = sheet.getDataRange().getValues();
  const head = values.shift() || [];
  const map = {};
  head.forEach((h, i) => { map[String(h).trim()] = i + 1; });
  const rows = values.filter(v => v.some(c => c !== '')).map(v => {
    const o = {};
    head.forEach((h, i) => { o[String(h).trim()] = v[i]; });
    return o;
  });
  return { map, rows };
}
function rows_() { return table_(sheet_(SH.apps)).rows; }
function conf_() {
  const out = {};
  table_(sheet_(SH.conf)).rows.forEach(r => { out[String(r['항목']).trim()] = r['값']; });
  return out;
}
function slots_() {
  return table_(sheet_(SH.slots)).rows.filter(r => r['슬롯ID'] !== '').map(r => ({
    id: String(r['슬롯ID']).trim(), cohort: String(r['기수']).trim(),
    date: r['행사일'] instanceof Date ? fmt_(r['행사일'], 'M/d') + '(' + '일월화수목금토'[Number(fmt_(r['행사일'], 'u')) % 7] + ')' : String(r['행사일']).trim(),
    time: r['시간'] instanceof Date ? fmt_(r['시간'], 'HH:mm') : String(r['시간']).trim(),
    place: String(r['장소'] || '').trim(),
    cap: { M: Number(r['형제정원'] || 0), F: Number(r['자매정원'] || 0) },
    public: String(r['공개']).trim().toUpperCase() === 'Y'
  }));
}
function counts_(rows) {
  const out = {};
  rows.forEach(r => {
    if (!HOLDING.includes(r['상태'])) return;
    const id = String(r['슬롯ID']);
    out[id] = out[id] || { M: 0, F: 0 };
    out[id][r['성별'] === '형제' ? 'M' : 'F']++;
  });
  return out;
}
function appendRow_(obj) {
  const sheet = sheet_(SH.apps);
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  sheet.appendRow(head.map(h => (obj[h] === undefined ? '' : obj[h])));
}
function findRow_(id) {
  const sheet = sheet_(SH.apps);
  const { map, rows } = table_(sheet);
  const i = rows.findIndex(r => r['신청번호'] === id);
  return i < 0 ? null : { sheet, rowIdx: i + 2, map, row: rows[i] };
}
function set_(sheet, rowIdx, map, key, value) {
  if (!map[key]) throw new Error('"' + key + '" 열이 없어요.');
  sheet.getRange(rowIdx, map[key]).setValue(value);
}
function appendLog_(sheet, rowIdx, map, row, what) {
  const cur = String(sheet.getRange(rowIdx, map['발송기록']).getValue() || '');
  set_(sheet, rowIdx, map, '발송기록', (cur ? cur + ' / ' : '') + fmt_(new Date(), 'M/d HH:mm') + ' ' + what);
  sheet_(SH.log).appendRow([new Date(), row['신청번호'] + ' ' + row['이름'] + ' · ' + what]);
}
function makePayName_(name, id) {
  return String(name).replace(/\s/g, '').slice(0, 4) + String(Number(String(id).replace(/\D/g, '')) % 1000).padStart(3, '0');
}
function notify_(subject, body) {
  try {
    const to = String(conf_()['운영진이메일'] || '').trim();
    if (to) MailApp.sendEmail(to, subject, body + '\n\n시트: ' + SpreadsheetApp.getActive().getUrl());
  } catch (e) { console.warn('메일 알림 실패', e); }
}
function fmt_(d, p) { return Utilities.formatDate(d, TZ, p); }
function fmtPhone_(d) { return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

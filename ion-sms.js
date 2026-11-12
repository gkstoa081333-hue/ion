/* =====================================================================
   이온 문자 문구 — 관리자 화면(admin.html)과 자동발송 엔진(구글 Apps Script)이 함께 씀
   · 여기 문구를 고치면 수동 발송·자동 발송 모두 바뀜
   · 브라우저·Apps Script 어디서든 돌도록 DOM을 쓰지 않음 (시간은 한국시간 고정)
   ===================================================================== */
(function (root) {
  const won = n => Number(n || 0).toLocaleString('ko-KR');
  // 한국시간 기준 "11/14(토) 15:00" (실행 환경의 시간대와 무관)
  function dt(ms, withDay) {
    if (!ms) return ''; const d = new Date(+ms + 9 * 3600e3); if (isNaN(d)) return '';
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}${withDay ? '(' + '일월화수목금토'[d.getUTCDay()] + ')' : ''} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
  // r: 신청서, cfg: apply/config, sl: 신청한 타임(apply/slots/{id}), ex: { waitNo, from }
  function ctx(r, cfg, sl, ex) {
    sl = sl || {}; ex = ex || {}; cfg = cfg || {};
    const date = sl.date || r.date, time = sl.time || r.time, place = sl.place || r.place;
    const fee = r.fee != null ? +r.fee : +cfg.fee || 0;
    return { chat: cfg.openchat || '', from: ex.from || '', cross: !!ex.cross, when: `${sl.cohort || r.cohort} ${date} ${time}`, place: place || '추후 안내', account: cfg.account || '', fee: won(fee),
      feeNote: (() => { const n = [+r.dealDisc > 0 ? `${r.dealLabel || '이벤트 할인'} -${won(r.dealDisc)}원` : '', +r.discount > 0 ? `재참여 할인 -${won(r.discount)}원` : ''].filter(Boolean); return n.length ? ` (${n.join(', ')} 적용)` : ''; })(), deadline: dt(r.deadline, true) + '까지', waitNo: ex.waitNo || 1 };
  }
const T = {
  pay: { label: '입금 안내', for: ['pending'], make: (r, x) => `[이온 크리스천 소개팅] ${r.name}님, ${x.when} 신청 감사합니다 🙂

입금 계좌: ${x.account}
금액: ${x.fee}원${x.feeNote || ''}
입금자명: ${r.payName} (꼭 이대로 적어주세요)
입금 기한: ${x.deadline}

기한까지 입금이 확인되지 않으면 자동 취소돼요.` },
  promote: { label: '자리 확보(승격)', for: ['pending'], make: (r, x) => `[이온 크리스천 소개팅] ${r.name}님, 기다려 주셔서 감사해요! ${x.when} 자리가 생겼어요 🙌

입금 계좌: ${x.account}
금액: ${x.fee}원${x.feeNote || ''}
입금자명: ${r.payName}
입금 기한: ${x.deadline}

기한이 지나면 다음 대기자분께 순서가 넘어가요.` },
  confirm: { label: '참가 확정', for: ['confirmed'], make: (r, x) => `[이온 크리스천 소개팅] ${r.name}님, 입금 확인되어 참가가 확정되었어요 🎉

일정: ${x.when}
장소: ${x.place}
신청번호: ${r.id}

자세한 장소와 안내는 행사 전날 다시 보내드릴게요.` },
  d1: { label: 'D-1 안내', for: ['confirmed'], make: (r, x) => `[이온 크리스천 소개팅] ${r.name}님, 내일 뵙겠습니다 🙂

일정: ${x.when}
장소: ${x.place}

· 10분 전까지 도착해 주세요. 입구에서 번호표를 드려요.
· 마지막에 테이블 QR로 마음에 남은 분을 골라주시면 돼요.
· 늦거나 못 오시게 되면 이 번호로 꼭 연락 주세요.` },
  wait: { label: '대기 안내', for: ['waiting'], make: (r, x) => `[이온 크리스천 소개팅] ${r.name}님, ${x.when} 타임이 마감되어 대기 ${x.waitNo}번으로 등록되었어요.

자리가 생기면 바로 연락드릴게요. 지금은 입금하지 않으셔도 돼요.` },
  move: { label: '타임 변경 안내', for: ['pending', 'confirmed', 'waiting'], make: (r, x) => `[이온 크리스천 소개팅] ${r.name}님, ${x.cross ? '' : r.cohort + ' '}신청 감사합니다 🙂
더 편안한 만남을 위해 참가 ${x.cross ? '기수·타임' : '타임'}을 ${x.from ? x.from + ' → ' : ''}${x.cross ? r.cohort + ' ' : ''}${r.date} ${r.time} 으로 조정해 드렸어요.${x.cross && r.place ? '\n장소: ' + r.place : ''}
${r.status === 'waiting' ? '지금은 대기 ' + x.waitNo + '번이고, 자리가 나면 바로 연락드릴게요.\n' : ''}일정이 어려우시면 편하게 말씀해 주세요. 감사합니다.` },
  free: { label: '직접 쓰기', for: ['pending', 'confirmed', 'waiting', 'cancelled', 'refunded'], make: (r, x) => `[이온 크리스천 소개팅] ${r.name}님, 안녕하세요 🙂

(여기에 내용을 적어주세요)

문의: 카카오톡 오픈채팅
${x.chat || ''}` },
  cancel: { label: '취소 안내', for: ['cancelled', 'refunded'], make: (r, x) => `[이온 크리스천 소개팅] ${r.name}님, ${x.when} 신청이 취소되었어요.

다시 참여를 원하시면 신청 페이지에서 새로 신청해 주세요. 감사합니다.` }
};
  // 안내 문자 끝에 오픈채팅 문의 링크 자동 추가
  ['pay', 'promote', 'confirm', 'd1', 'wait', 'move'].forEach(k => { const f = T[k].make; T[k].make = (r, x) => f(r, x) + (x.chat ? `\n\n문의: 카카오톡 오픈채팅\n${x.chat}` : ''); });
  const render = (kind, r, cfg, sl, ex) => T[kind].make(r, ctx(r, cfg, sl, ex));
  root.ION_SMS = { T, ctx, dt, render, version: '20261112a' };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* =====================================================================
   이온 공용 키보드 접근성 — index · apply · admin · review 에서 함께 씁니다.
   - 팝업(.modal-bg)이 열리면 안쪽 첫 버튼으로 포커스 이동
   - Tab / Shift+Tab 이 팝업 밖으로 빠져나가지 않게 가둠
   - Esc 로 닫기 (닫기 버튼 또는 '취소' 버튼을 대신 눌러줌)
   - 팝업이 닫히면 열기 전에 있던 자리로 포커스 복귀
   ===================================================================== */
(function () {
  let lastOutside = null;
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const topModal = () => { const all = document.querySelectorAll('.modal-bg'); return all[all.length - 1] || null; };
  const visible = el => el.offsetParent !== null || el === document.activeElement;

  // 팝업 밖에서 마지막으로 포커스된 요소를 기억
  document.addEventListener('focusin', e => {
    if (e.target && e.target.closest && !e.target.closest('.modal-bg')) lastOutside = e.target;
  });

  document.addEventListener('keydown', e => {
    const m = topModal(); if (!m) return;
    if (e.key === 'Escape') {
      const close = m.querySelector('button[data-close],button[data-c="0"],button[data-r="0"]');
      if (close) { e.preventDefault(); close.click(); }
      return;
    }
    if (e.key !== 'Tab') return;
    const f = Array.from(m.querySelectorAll(FOCUSABLE)).filter(visible);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (!m.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  });

  // 팝업이 생기면 안으로 포커스, 사라지면 원래 자리로 복귀
  let wasOpen = false;
  const sync = () => {
    const m = topModal();
    if (m && !m.dataset.a11y) {
      m.dataset.a11y = '1';
      if (!m.contains(document.activeElement)) { const f = m.querySelector(FOCUSABLE); if (f) f.focus(); }
    }
    if (!m && wasOpen) {
      const a = document.activeElement;
      if ((!a || a === document.body) && lastOutside && document.contains(lastOutside)) {
        try { lastOutside.focus({ preventScroll: true }); } catch (_) {}
      }
    }
    wasOpen = !!m;
  };
  try { new MutationObserver(sync).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
})();

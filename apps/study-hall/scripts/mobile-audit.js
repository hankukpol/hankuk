/**
 * MOBILE_DESIGN.md 4절 검증 — 390×844 에서 페이지 하나를 잰다.
 *
 * 브라우저 컨텍스트에서 실행한다(빌드·번들 없이 그대로 붙여 넣을 수 있게 순수 스크립트로 둔다).
 *
 *   const report = window.__mobileAudit({ kind: "sub" });   // 또는 { kind: "home" }
 *
 * 헤드리스로 돌리려면 playwright 가 필요한데 study-hall 에 없다(score-predict 전용).
 * package.json 은 지금 동결이라 의존성을 늘리지 않고, 이 파일을 page.evaluate 나
 * 브라우저 콘솔에 주입해 쓴다. 의존성이 허용되면 러너만 붙이면 된다.
 *
 * 측정은 브라우저 패널을 띄운 상태에서 한다. 숨기면 rAF 가 멈춰
 * computed style 이 캐시 값을 돌려준다(MOBILE_DESIGN.md 4절 주의).
 */
(function () {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const visible = (el) => !!el.offsetParent || el === document.body;

  /** 이 규격이 예외로 두는 것: 이미지·모달·안내 상자. */
  function isExempt(el) {
    if (el.closest('[role="dialog"], dialog, .admin-dialog-panel, .admin-chat-dock')) return true;
    if (el.matches("img, svg, canvas, video")) return true;
    if (el.closest(".admin-notice, .admin-empty-state")) return true;
    return false;
  }

  /** 콘텐츠를 감싼 카드: 테두리가 있고 모서리가 8px 이상이며 안에 실제 내용이 있는 상자. */
  function findCards(root) {
    return [...root.querySelectorAll("section, article, div, dl, ul, ol")]
      .filter((el) => visible(el) && !isExempt(el))
      .filter((el) => {
        const s = getComputedStyle(el);
        if (px(s.borderTopWidth) < 1 || px(s.borderLeftWidth) < 1) return false;
        if (px(s.borderTopLeftRadius) < 8) return false;
        return el.textContent.trim().length > 0;
      });
  }

  function findShadows(root) {
    return [...root.querySelectorAll("*")].filter((el) => {
      if (!visible(el) || isExempt(el)) return false;
      const s = getComputedStyle(el).boxShadow;
      return s && s !== "none";
    });
  }

  /** 알약 칩인지. MOBILE_DESIGN.md 2.3 은 칩을 36px 로 두되 터치 44 를 요구한다. */
  function isChip(el) {
    return el.classList.contains("admin-chip") || px(getComputedStyle(el).borderTopLeftRadius) >= 999;
  }

  /**
   * 44px 미만 터치 대상.
   * 칩은 2.3 이 "세로 padding 으로 44 확보" 라고 했으므로 실제 히트 영역으로 잰다.
   * padding 은 border-box 높이 안에 들어가므로, 36px 상자에 padding 을 주는 것만으로는
   * 44 가 되지 않는다. ::before 같은 확장이 있으면 그것을 히트 영역으로 본다.
   */
  function hitHeight(el) {
    const own = el.getBoundingClientRect().height;
    const before = getComputedStyle(el, "::before");
    if (before.content && before.content !== "none" && before.position === "absolute") {
      const top = parseFloat(before.top) || 0;
      const bottom = parseFloat(before.bottom) || 0;
      if (top < 0 || bottom < 0) return own - top - bottom;
    }
    return own;
  }

  function findSmallTargets(root) {
    return [...root.querySelectorAll('button, a[href], select, input:not([type="hidden"]), [role="tab"], [role="button"]')]
      .filter((el) => visible(el))
      .filter((el) => {
        const h = hitHeight(el);
        return h > 0 && h < 44;
      });
  }

  function findSmallText(root) {
    const out = [];
    for (const el of root.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const size = px(getComputedStyle(el).fontSize);
      if (size && size < 13) out.push({ size, text: el.textContent.trim().slice(0, 20) });
    }
    return out;
  }

  /** 컨트롤 모서리는 4px. 칩 999, 이미지 8, 목록·표·탭·헤더 0. */
  function findBadRadius(root) {
    const out = [];
    for (const el of root.querySelectorAll("button, input, select, textarea")) {
      if (!visible(el) || isExempt(el)) continue;
      if (el.matches('[type="checkbox"], [type="radio"]')) continue;
      if (el.closest(".admin-tabs, .admin-subtabs")) continue;
      const r = px(getComputedStyle(el).borderTopLeftRadius);
      const isChip = el.classList.contains("admin-chip") || r >= 999;
      if (isChip) continue;
      if (r !== 4) out.push({ r, tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 14) });
    }
    return out;
  }

  /** 첫 데이터: 표 첫 행 → 목록 첫 행 → 요약 첫 칸 순으로 찾는다. */
  function findFirstData() {
    const tries = [
      ["표 첫 행", "tbody tr"],
      ["목록 행", ".admin-list-row, .admin-record-card"],
      ["요약 칸", ".admin-portal-summary > *, .admin-dashboard-metric, .admin-metric-box"],
    ];
    for (const [kind, sel] of tries) {
      const el = [...document.querySelectorAll(sel)].find(visible);
      if (el) return { kind, top: Math.round(el.getBoundingClientRect().top + window.scrollY) };
    }
    return { kind: null, top: null };
  }

  function auditTabs() {
    const rows = [...document.querySelectorAll(".admin-tabs, .admin-subtabs")].filter(visible);
    // 폴더 모양: 배경이나 테두리를 가진 탭.
    const folder = rows.flatMap((row) =>
      [...row.children].filter((tab) => {
        const s = getComputedStyle(tab);
        const bg = s.backgroundColor;
        const opaque = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
        return opaque || px(s.borderTopWidth) > 0;
      }),
    );
    // 두 줄로 접힌 탭: 자식들의 top 이 두 종류 이상.
    const wrapped = rows.filter((row) => {
      const tops = new Set([...row.children].map((c) => Math.round(c.getBoundingClientRect().top)));
      return tops.size > 1;
    });
    return { rows: rows.length, heights: rows.map((r) => px(r.getBoundingClientRect().height)), folderTabs: folder.length, wrappedRows: wrapped.length };
  }

  window.__mobileAudit = function (options) {
    const kind = (options && options.kind) || "sub";
    const doc = document.documentElement;

    // 셸이 없으면 화면이 안 그려진 것이다(500·로그인 리다이렉트·로딩 중).
    // 이때 계속 재면 "요소가 없어서" 대부분 항목이 통과로 나오는 거짓 녹색이 된다.
    if (!document.querySelector(".admin-shell")) {
      return {
        url: location.pathname,
        측정불가: true,
        이유: "admin-shell 이 없다 — 화면이 그려지지 않았다",
        본문: document.body.innerText.trim().slice(0, 120),
      };
    }

    const main = document.querySelector(".admin-main");
    const frame = document.querySelector(".admin-content-frame");
    // 768px 미만 헤더는 .admin-mobile-topbar 다. 검은 .admin-mobile-header 는 홈에만 남고
    // 서브 화면에서는 숨겨지므로(높이 0), 보이는 것만 골라야 오탐이 없다.
    const bar = [document.querySelector(".admin-mobile-topbar"), document.querySelector(".admin-mobile-header")]
      .filter((el) => el && px(getComputedStyle(el).height) > 0)[0] || null;
    const scope = frame || main || document.body;

    const frames = [...document.querySelectorAll(".admin-table-frame")].filter(visible);
    const tables = [...document.querySelectorAll("table")].filter(visible);
    const escaped = tables.filter((t) => !t.closest(".admin-table-frame") && t.scrollWidth > doc.clientWidth + 1);

    const first = findFirstData();
    const firstLimit = kind === "home" ? 240 : 160;
    const cards = findCards(scope);
    const shadows = findShadows(scope);
    const small = findSmallTargets(scope);
    const tiny = findSmallText(scope);
    const radii = findBadRadius(scope);
    const tabs = auditTabs();
    const sidePad = main ? px(getComputedStyle(main).paddingLeft) : null;

    const rows = [
      ["문서 가로 넘침", "0", doc.scrollWidth - doc.clientWidth, doc.scrollWidth - doc.clientWidth === 0],
      ["표 프레임 밖 넘침", "0", escaped.length, escaped.length === 0],
      ["첫 데이터 top", `≤ ${firstLimit}px`, first.top === null ? "없음" : `${first.top}px (${first.kind})`, first.top !== null && first.top <= firstLimit],
      // 하단 1px line-soft 가 높이에 포함돼 53 으로 잡힌다. 52~53 을 통과로 본다.
      ["헤더 바 높이", "52px", bar ? px(getComputedStyle(bar).height) : "없음", bar ? [52, 53].includes(px(getComputedStyle(bar).height)) : false],
      ["카드형 컨테이너", "0개", cards.length, cards.length === 0],
      ["그림자", "0개", shadows.length, shadows.length === 0],
      ["44px 미만 터치", "0개", small.length, small.length === 0],
      ["13px 미만 글자", "0개", tiny.length, tiny.length === 0],
      ["컨트롤 모서리", "4px", radii.length === 0 ? "전부 4px" : `${radii.length}개 벗어남`, radii.length === 0],
      ["좌우 여백", "16px", sidePad === null ? "없음" : `${sidePad}px`, sidePad === 16],
      ["탭 폴더 모양", "0개", tabs.folderTabs, tabs.folderTabs === 0],
      ["두 줄로 접힌 탭", "0개", tabs.wrappedRows, tabs.wrappedRows === 0],
    ].map(([item, spec, actual, ok]) => ({ 항목: item, 기준: spec, 실측: actual, 통과: ok ? "O" : "X" }));

    return {
      url: location.pathname,
      kind,
      통과: rows.filter((r) => r.통과 === "O").length,
      전체: rows.length,
      rows,
      상세: {
        카드예시: cards.slice(0, 4).map((el) => (el.className || el.tagName).toString().slice(0, 48)),
        그림자예시: shadows.slice(0, 3).map((el) => (el.className || el.tagName).toString().slice(0, 48)),
        작은터치_칩: small.filter(isChip).length,
        작은터치_칩아님: small.filter((el) => !isChip(el)).length,
        작은터치예시: small.slice(0, 4).map((el) => `${el.tagName.toLowerCase()}:${(el.textContent || "").trim().slice(0, 10)}:${Math.round(hitHeight(el))}px${isChip(el) ? "(칩)" : ""}`),
        모서리예시: radii.slice(0, 4),
        탭높이: tabs.heights,
        표: { 표: tables.length, 프레임: frames.length, 프레임내스크롤: frames.filter((f) => f.scrollWidth > f.clientWidth + 1).length },
        문서높이: doc.scrollHeight,
      },
    };
  };

  return "mobile-audit ready";
})();

import { PROMOTION_EXAM_FUNCTIONS_SLOT } from "@/lib/promotions/exam-functions-slot";

export const POLICE_2026_SECOND_SCORING_LOCAL_ASSET_BASE =
  "/promotions/police/2026-second-scoring";

export const POLICE_2026_SECOND_SCORING_PRODUCTION_ASSET_BASE =
  "https://fullservice.hankukpol.co.kr/promotions/police/2026-second-scoring";

function normalizeAssetBase(value: string) {
  return value.trim().replace(/\/+$/, "") || POLICE_2026_SECOND_SCORING_LOCAL_ASSET_BASE;
}

export function buildPolice2026SecondScoringPromotionHtml(
  assetBase = POLICE_2026_SECOND_SCORING_LOCAL_ASSET_BASE,
) {
  const assets = normalizeAssetBase(assetBase);

  return `<style>
@font-face {
  font-family: "Promotion Pretendard";
  src: url("${assets}/PretendardVariable.woff2") format("woff2");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}

:root {
  --promotion-ink: #222222;
  --promotion-muted: #555555;
  --promotion-accent: #0900ff;
  --promotion-blue: #002ef6;
  --promotion-sky: #28c6ff;
  --promotion-soft: #efefef;
  --promotion-ice: #f1f6fa;
  --promotion-line: #eeeeee;
  --promotion-white: #ffffff;
  --promotion-black: #000000;
  color: var(--promotion-ink);
  font-family: "Promotion Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-synthesis: none;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 0;
  overflow-x: hidden;
  background: var(--promotion-white);
  color: var(--promotion-ink);
  font-family: inherit;
  word-break: keep-all;
  overflow-wrap: break-word;
}

img {
  display: block;
  height: auto;
  max-width: 100%;
}

a {
  color: inherit;
  text-decoration: none;
}

.score-landing {
  width: 100%;
  overflow: hidden;
  background: var(--promotion-white);
}

.score-wrap {
  width: min(1060px, calc(100% - 40px));
  margin: 0 auto;
}

.score-hero {
  position: relative;
  min-height: 852px;
  overflow: hidden;
  background: linear-gradient(180deg, #010624 0%, #156edb 100%);
  color: var(--promotion-white);
}

.score-hero::before {
  position: absolute;
  inset: -180px -18% -60px;
  content: "";
  background-image: url("${assets}/hero-texture.jpg");
  background-position: center top;
  background-repeat: no-repeat;
  background-size: cover;
  opacity: 0.16;
  pointer-events: none;
}

.score-hero__grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 492px;
  gap: 76px;
  min-height: 852px;
  padding-top: 132px;
}

.score-hero__intro {
  align-self: start;
}

.score-hero__promise {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.45px;
}

.score-hero__promise strong {
  display: block;
  color: var(--promotion-sky);
  font-size: 22px;
}

.score-hero__region {
  margin: 62px 0 0;
  font-size: 46px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -1.15px;
}

.score-hero__region strong {
  color: var(--promotion-sky);
}

.score-hero__title {
  margin: 14px 0 0;
  font-size: clamp(68px, 4.8vw, 92px);
  font-weight: 900;
  line-height: 1.11;
  letter-spacing: -2.3px;
}

.score-hero__title strong {
  display: block;
  color: var(--promotion-sky);
}

.score-hero__copy {
  margin: 30px 0 0;
  max-width: 510px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.6px;
}

.score-hero__copy mark {
  padding: 0;
  background: transparent;
  color: #ffff00;
}

.score-cta {
  display: inline-flex;
  width: min(340px, 100%);
  min-height: 64px;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-top: 44px;
  padding: 16px 24px;
  border: 0;
  border-radius: 0;
  background: var(--promotion-black);
  color: var(--promotion-white);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  transition: background-color 180ms ease-out, color 180ms ease-out;
}

.score-cta:hover {
  background: #161616;
}

.score-cta:active {
  background: #2a2a2a;
}

.score-cta:focus-visible {
  outline: 4px solid #326bff;
  outline-offset: 4px;
}

.score-hero__visual {
  align-self: start;
  margin: 130px 0 0;
  filter: drop-shadow(0 40px 32px rgba(0, 0, 0, 0.22));
}

.score-hero__visual img {
  width: 492px;
  height: auto;
}

.score-section {
  padding: 148px 0;
}

.score-section--features {
  min-height: 1052px;
  background: var(--promotion-soft);
}

.score-section--how {
  background: var(--promotion-ice);
}

.score-section__head {
  text-align: center;
}

.score-kicker,
.score-event__label {
  margin: 0;
  color: var(--promotion-accent);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.score-section__title {
  margin: 22px auto 0;
  color: var(--promotion-ink);
  font-size: clamp(36px, 3vw, 48px);
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: -1.2px;
}

.score-section__title strong {
  color: var(--promotion-accent);
}

.score-section__description {
  margin: 25px auto 0;
  color: var(--promotion-muted);
  font-size: 24px;
  font-weight: 400;
  line-height: 1.5;
}

.score-feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 58px;
}

.score-feature {
  min-height: 200px;
  padding: 27px 31px;
  border: 1px solid var(--promotion-line);
  border-radius: 16px;
  background: var(--promotion-white);
}

.score-feature__tag {
  display: inline-flex;
  min-width: 78px;
  min-height: 22px;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--promotion-blue);
  color: var(--promotion-white);
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
}

.score-feature h3 {
  margin: 10px 0 0;
  font-size: 24px;
  font-weight: 800;
  line-height: 32px;
}

.score-feature h3 strong {
  color: var(--promotion-blue);
}

.score-feature p {
  margin: 10px 0 0;
  color: var(--promotion-muted);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.45;
}

.score-feature__desktop-break {
  display: none;
}

.score-section__closing {
  margin: 52px 0 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 40px;
  text-align: center;
}

.score-how__preview {
  width: 100%;
  margin: 52px auto 0;
}

.score-how__closing {
  margin: 50px 0 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 40px;
  text-align: center;
}

.score-event {
  position: relative;
  overflow: hidden;
}

.score-event--one {
  min-height: 708px;
  padding: 148px 0 100px;
  background: var(--promotion-white);
}

.score-event--two {
  min-height: 713px;
  padding: 140px 0 0;
  background-color: #dceeff;
  background-image: url("${assets}/event-blue-background.jpg");
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.score-event__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 520px;
  gap: 60px;
  align-items: center;
}

.score-event__label span {
  color: var(--promotion-ink);
  white-space: pre;
}

.score-section--how .score-kicker {
  white-space: pre;
}

.score-event__title {
  margin: 14px 0 0;
  font-size: clamp(42px, 3.35vw, 64px);
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -1.2px;
}

.score-event--one .score-event__title {
  font-size: clamp(38px, 2.5vw, 48px);
  font-weight: 800;
  line-height: 1.4;
}

.score-event__title strong {
  display: block;
  color: var(--promotion-blue);
}

.score-event__details {
  display: grid;
  grid-template-columns: 106px minmax(0, 1fr);
  row-gap: 11px;
  margin: 38px 0 0;
  font-size: 18px;
  line-height: 1.4;
  letter-spacing: -0.45px;
}

.score-event__details dt {
  font-weight: 700;
}

.score-event__details dd {
  margin: 0;
  font-weight: 400;
}

.score-event__details strong {
  color: var(--promotion-blue);
  font-weight: 700;
}

.score-event__note {
  grid-column: 2;
  margin: -4px 0 0;
  color: var(--promotion-muted);
  font-size: 16px;
  line-height: 1.4;
  letter-spacing: -0.4px;
}

.score-prizes {
  position: relative;
  width: 520px;
  height: 390px;
  margin: 0;
}

.score-prizes__group {
  width: 100%;
  height: 100%;
  max-width: none;
  object-fit: contain;
}

.score-event__teacher {
  position: relative;
  align-self: end;
  height: 573px;
  margin: 0;
}

.score-event__teacher img {
  position: absolute;
  right: 12px;
  bottom: 0;
  width: 473px;
  max-width: none;
}

.score-event__teacher figcaption {
  position: absolute;
  right: 52px;
  bottom: 55px;
  color: var(--promotion-white);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.6px;
}

@media (max-width: 1180px) {
  .score-hero__grid {
    grid-template-columns: minmax(0, 1fr) minmax(380px, 44%);
    gap: 44px;
  }

  .score-hero__region {
    font-size: 38px;
  }

  .score-hero__title {
    font-size: clamp(62px, 7vw, 80px);
  }

  .score-event__grid {
    grid-template-columns: minmax(0, 1fr) minmax(400px, 48%);
    gap: 36px;
  }

  .score-prizes {
    width: 100%;
    transform: scale(0.92);
    transform-origin: center;
  }
}

@media (max-width: 900px) {
  .score-hero {
    min-height: auto;
  }

  .score-hero__grid {
    grid-template-columns: 1fr;
    min-height: 0;
    gap: 40px;
    padding-top: 76px;
    padding-bottom: 72px;
  }

  .score-hero__promise,
  .score-hero__region,
  .score-hero__title,
  .score-hero__copy {
    max-width: 680px;
  }

  .score-hero__region {
    margin-top: 44px;
  }

  .score-hero__visual {
    width: min(492px, 76vw);
    margin: 0 auto;
  }

  .score-hero__visual img {
    width: 100%;
  }

  .score-section {
    padding: 104px 0;
  }

  .score-section--features {
    min-height: 0;
  }

  .score-section__title {
    font-size: 38px;
  }

  .score-feature {
    min-height: 220px;
  }

  .score-event--one,
  .score-event--two {
    min-height: 0;
    padding: 100px 0;
  }

  .score-event__grid {
    grid-template-columns: 1fr;
  }

  .score-prizes {
    width: min(520px, 100%);
    margin: 0 auto;
    transform: none;
  }

  .score-event--two .score-event__teacher {
    width: min(473px, 100%);
    height: auto;
    aspect-ratio: 473 / 618;
    margin: 0 auto;
    overflow: hidden;
  }

  .score-event--two .score-event__teacher img {
    left: -96.35%;
    top: -19.79%;
    right: auto;
    bottom: auto;
    width: 286.55%;
    height: 277.98%;
    object-fit: fill;
    transform: none;
  }

  .score-event--two .score-event__teacher figcaption {
    left: 34.88%;
    top: 74.11%;
    right: auto;
    bottom: auto;
    transform: none;
    white-space: nowrap;
  }
}

@media (max-width: 767px) {
  .score-wrap {
    width: min(100% - 40px, 560px);
  }

  .score-hero__grid {
    padding-top: 56px;
    padding-bottom: 56px;
  }

  .score-hero__promise {
    font-size: 14px;
  }

  .score-hero__promise strong {
    font-size: 17px;
  }

  .score-hero__region {
    margin-top: 38px;
    font-size: 26px;
    letter-spacing: -0.65px;
  }

  .score-hero__title {
    font-size: clamp(44px, 13vw, 62px);
    letter-spacing: -1.2px;
  }

  .score-hero__copy {
    margin-top: 24px;
    font-size: 18px;
  }

  .score-cta {
    margin-top: 32px;
    font-size: 16px;
  }

  .score-hero__visual {
    width: min(420px, 92%);
  }

  .score-section {
    padding: 80px 0;
  }

  .score-kicker,
  .score-event__label {
    font-size: 16px;
  }

  .score-section__title {
    margin-top: 14px;
    font-size: clamp(28px, 8vw, 36px);
    letter-spacing: -0.7px;
  }

  .score-section__description {
    margin-top: 18px;
    font-size: 17px;
  }

  .score-feature-grid {
    gap: 12px;
    margin-top: 40px;
  }

  .score-feature {
    min-height: 0;
    padding: 20px 16px;
  }

  .score-feature__tag {
    min-width: 0;
    font-size: 11px;
  }

  .score-feature h3 {
    font-size: 18px;
    line-height: 24px;
  }

  .score-feature p {
    font-size: 13px;
    line-height: 20px;
  }

  .score-section__closing,
  .score-how__closing {
    margin-top: 40px;
    font-size: 20px;
    line-height: 30px;
  }

  .score-how__preview {
    width: calc(100% + 12px);
    max-width: none;
    margin-left: -6px;
  }

  .score-event--one,
  .score-event--two {
    padding: 80px 0;
  }

  .score-event__title,
  .score-event--one .score-event__title {
    font-size: clamp(32px, 9vw, 42px);
    line-height: 1.32;
  }

  .score-event__details {
    grid-template-columns: 92px minmax(0, 1fr);
    margin-top: 30px;
    font-size: 15px;
  }

  .score-event__note {
    grid-column: 1 / -1;
    margin-top: 2px;
    font-size: 13px;
  }

  .score-prizes {
    height: 320px;
  }

  .score-event__teacher {
    height: 500px;
  }
}

@media (max-width: 359px) {
  .score-feature-grid {
    grid-template-columns: 1fr;
  }

}

/*
 * Figma desktop frame: 1920 × 4506 (node 158:2).
 * Keep every desktop measurement in the original Figma coordinate system and
 * scale the complete frame as one unit so spacing and image crops stay exact.
 */
@media (min-width: 901px) {
  .score-landing {
    width: 1920px;
    max-width: none;
    zoom: calc(100vw / 1920px);
  }

  .score-wrap {
    width: 1920px;
    max-width: none;
    height: 100%;
    margin: 0;
  }

  .score-hero {
    width: 1920px;
    height: 852px;
    min-height: 852px;
  }

  .score-hero::before {
    inset: auto;
    left: -607px;
    top: -248px;
    width: 2915px;
    height: 1103px;
    background-position: 0 0;
    background-size: 2915px 1103px;
    opacity: 0.16;
  }

  .score-hero__grid {
    display: block;
    width: 1920px;
    height: 852px;
    min-height: 852px;
    padding: 0;
  }

  .score-hero__intro {
    display: contents;
  }

  .score-hero__promise,
  .score-hero__region,
  .score-hero__title,
  .score-hero__copy,
  .score-cta,
  .score-hero__visual {
    position: absolute;
    margin: 0;
  }

  .score-hero__promise {
    left: 430px;
    top: 135px;
    width: 651px;
    max-width: none;
    font-size: 18px;
    line-height: 1.4;
    letter-spacing: -0.45px;
  }

  .score-hero__promise strong {
    font-size: 22px;
    line-height: 1.4;
  }

  .score-hero__region {
    left: 430px;
    top: 252px;
    max-width: none;
    font-size: 46px;
    line-height: normal;
    letter-spacing: -1.15px;
    white-space: nowrap;
  }

  .score-hero__title {
    left: 430px;
    top: 321px;
    max-width: none;
    font-size: 92px;
    line-height: 1.11;
    letter-spacing: -2.3px;
    white-space: nowrap;
  }

  .score-hero__copy {
    left: 430px;
    top: 547px;
    width: 492px;
    max-width: none;
    font-size: 24px;
    line-height: 1.4;
    letter-spacing: -0.6px;
  }

  .score-cta {
    left: 430px;
    top: 664px;
    width: 340px;
    min-height: 64px;
    height: 64px;
    gap: 24px;
    padding: 16px 24px;
    font-size: 18px;
    line-height: 1.4;
  }

  .score-hero__visual {
    left: 998px;
    top: 263px;
    width: 492px;
    height: 401px;
    filter: drop-shadow(0 60px 50px rgba(0, 0, 0, 0.2));
  }

  .score-hero__visual img {
    width: 492px;
    height: 401px;
    max-width: none;
    object-fit: cover;
  }

  .score-section {
    width: 1920px;
    padding: 0;
  }

  .score-section--features {
    position: relative;
    height: 1052px;
    min-height: 1052px;
  }

  .score-section--features .score-section__head,
  .score-section--how .score-section__head {
    display: contents;
  }

  .score-section--features .score-kicker,
  .score-section--features .score-section__title,
  .score-section--features .score-section__description,
  .score-section--features .score-section__closing,
  .score-section--how .score-kicker,
  .score-section--how .score-section__title,
  .score-section--how .score-section__description,
  .score-how__preview,
  .score-how__closing {
    position: absolute;
    margin: 0;
  }

  .score-section--features .score-kicker {
    left: 0;
    top: 154px;
    width: 1920px;
    font-size: 24px;
    line-height: normal;
  }

  .score-section--features .score-section__title {
    left: 0;
    top: 203px;
    width: 1920px;
    max-width: none;
    font-size: 48px;
    line-height: normal;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .score-section--features .score-section__description {
    left: 0;
    top: 340.5px;
    width: 1920px;
    max-width: none;
    font-size: 24px;
    line-height: normal;
    white-space: nowrap;
  }

  .score-feature-grid {
    display: block;
    margin: 0;
  }

  .score-feature {
    position: absolute;
    width: 520px;
    height: 200px;
    min-height: 200px;
    padding: 27px 31px;
    border-radius: 16px;
  }

  .score-feature:nth-child(1) { left: 430px; top: 426px; }
  .score-feature:nth-child(2) { left: 970px; top: 426px; }
  .score-feature:nth-child(3) { left: 430px; top: 646px; }
  .score-feature:nth-child(4) { left: 970px; top: 646px; }

  .score-feature__tag {
    min-width: 78px;
    min-height: 22px;
    height: 22px;
    padding: 2px 8px;
    font-size: 12px;
    line-height: 18px;
  }

  .score-feature h3 {
    margin-top: 10px;
    font-size: 24px;
    line-height: 32px;
  }

  .score-feature p {
    margin-top: 10px;
    font-size: 16px;
    line-height: normal;
    white-space: nowrap;
  }

  .score-feature__desktop-break {
    display: initial;
  }

  .score-section--features .score-section__closing {
    left: 0;
    top: 906px;
    width: 1920px;
    font-size: 28px;
    line-height: 40px;
  }

  .score-section--how {
    position: relative;
    height: 1181px;
    min-height: 1181px;
  }

  .score-section--how .score-kicker {
    left: 0;
    top: 150px;
    width: 1920px;
    font-size: 24px;
    line-height: normal;
  }

  .score-section--how .score-section__title {
    left: 0;
    top: 199px;
    width: 1920px;
    max-width: none;
    font-size: 48px;
    line-height: normal;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .score-section--how .score-section__description {
    left: 0;
    top: 353px;
    width: 1920px;
    max-width: none;
    font-size: 24px;
    line-height: normal;
    white-space: nowrap;
  }

  .score-how__preview {
    left: 411px;
    top: 412px;
    width: 1090px;
    height: 489px;
    max-width: none;
  }

  .score-how__closing {
    left: 0;
    top: 961px;
    width: 1920px;
    font-size: 28px;
    line-height: 40px;
  }

  .score-event {
    width: 1920px;
  }

  .score-event__grid {
    display: block;
    width: 1920px;
    height: 100%;
  }

  .score-event__grid > div:first-child {
    display: contents;
  }

  .score-event--one {
    height: 708px;
    min-height: 708px;
    padding: 0;
  }

  .score-event--one .score-event__label,
  .score-event--one .score-event__title,
  .score-event--one .score-event__details,
  .score-event--one .score-prizes {
    position: absolute;
    margin: 0;
  }

  .score-event--one .score-event__label {
    left: 430px;
    top: 161px;
    font-size: 24px;
    line-height: normal;
    letter-spacing: -0.6px;
    white-space: nowrap;
  }

  .score-event--one .score-event__title {
    left: 430px;
    top: 200px;
    max-width: none;
    font-size: 48px;
    line-height: 1.4;
    letter-spacing: -1.2px;
    white-space: nowrap;
  }

  .score-event--one .score-event__details {
    display: block;
    left: 430px;
    top: 441px;
    width: 650px;
    height: 126px;
    font-size: 18px;
    line-height: 1.4;
    letter-spacing: -0.45px;
  }

  .score-event--one .score-event__details dt,
  .score-event--one .score-event__details dd {
    position: absolute;
    margin: 0;
    white-space: nowrap;
  }

  .score-event--one .score-event__details dt { left: 0; }
  .score-event--one .score-event__details dd { left: 120px; }
  .score-event--one .score-event__details dt:nth-of-type(1),
  .score-event--one .score-event__details dd:nth-of-type(1) { top: 0; }
  .score-event--one .score-event__details dt:nth-of-type(2),
  .score-event--one .score-event__details dd:nth-of-type(2) { top: 35px; }
  .score-event--one .score-event__details .score-event__note {
    top: 60px;
    color: var(--promotion-muted);
    font-size: 16px;
    letter-spacing: -0.4px;
  }
  .score-event--one .score-event__details dt:nth-of-type(3),
  .score-event--one .score-event__details dd:nth-of-type(4) { top: 92px; }

  .score-event--one .score-prizes {
    left: 1037px;
    top: 220px;
    width: 445px;
    height: 362px;
    transform: none;
  }

  .score-event--two {
    height: 713px;
    min-height: 713px;
    padding: 0;
    background-position: left -0.02% top;
    background-size: 100.04% 151.61%;
  }

  .score-event--two .score-event__label,
  .score-event--two .score-event__title,
  .score-event--two .score-event__details,
  .score-event--two .score-event__teacher {
    position: absolute;
    margin: 0;
  }

  .score-event--two .score-event__label {
    left: 434px;
    top: 150px;
    font-size: 28px;
    line-height: normal;
    letter-spacing: -0.7px;
    white-space: nowrap;
  }

  .score-event--two .score-event__title {
    left: 430px;
    top: 189px;
    max-width: none;
    font-size: 64px;
    line-height: 1.2;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .score-event--two .score-event__details {
    left: 430px;
    top: 423px;
    width: 650px;
    grid-template-columns: 100px 550px;
    row-gap: 10px;
    margin: 0;
    font-size: 18px;
    line-height: 1.4;
    letter-spacing: -0.45px;
    white-space: nowrap;
  }

  .score-event--two .score-event__teacher {
    left: 1040px;
    top: 95px;
    width: 473px;
    height: 618px;
    overflow: hidden;
  }

  .score-event--two .score-event__teacher img {
    position: absolute;
    left: -96.35%;
    top: -19.79%;
    right: auto;
    bottom: auto;
    width: 286.55%;
    height: 277.98%;
    max-width: none;
    object-fit: fill;
    transform: none;
  }

  .score-event--two .score-event__teacher figcaption {
    left: 165px;
    top: 458px;
    right: auto;
    bottom: auto;
    font-size: 24px;
    line-height: normal;
    letter-spacing: -0.6px;
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  .score-cta {
    transition: none;
  }
}
</style>

<main class="score-landing" data-promotion-template="police-2026-second-scoring">
  <section class="score-hero">
    <div class="score-wrap score-hero__grid">
      <div class="score-hero__intro" data-reveal="left">
        <p class="score-hero__promise">
          단 하나의 풀서비스를 이용해야 한다면, 대구·경북 가장 빠르고 정확한 합격예측
          <strong>한국경찰학원 합격예측 풀서비스를 이용하세요!</strong>
        </p>
        <p class="score-hero__region"><strong>대구·경북지역</strong> 경찰공무원 시험</p>
        <h1 class="score-hero__title">합격예측 풀서비스<strong>가채점 하세요!</strong></h1>
        <p class="score-hero__copy">
          8.22(토) 경찰시험, 모두 고생하셨습니다.<br>
          이제는 <mark>대구, 경북 합격예측 가채점</mark>을 해야 할 때입니다.
        </p>
        <a class="score-cta" href="#exam-functions">바로 채점하고 합격여부 확인 하기 <span aria-hidden="true">&gt;</span></a>
      </div>
      <figure class="score-hero__visual" data-reveal="right" data-motion="float">
        <img src="${assets}/hero-prizes.png" width="461" height="375" alt="가채점 참여 경품 피자, 치킨, 도넛, 케이크와 음료">
      </figure>
    </div>
  </section>

  <section class="score-section score-section--features">
    <div class="score-wrap">
      <header class="score-section__head" data-reveal>
        <p class="score-kicker">SERVICE FEATURES</p>
        <h2 class="score-section__title">
          단 하나의 <strong>풀서비스</strong>를 이용해야 한다면,<br>
          <strong>대구·경북</strong> 가장 빠르고 정확한 합격예측
        </h2>
        <p class="score-section__description">빅데이터가 분석한 나의 합격 확률, 지금 확인해보세요.</p>
      </header>

      <div class="score-feature-grid">
        <article class="score-feature" data-reveal data-reveal-delay="0">
          <span class="score-feature__tag">즉시확인</span>
          <h3><strong>시험 직후</strong> 바로 확인!<br>가채점&amp;합격예측 서비스</h3>
          <p>정답 입력 즉시 응시자 성적 순위, 상위 평균과 지역별<br class="score-feature__desktop-break">석차 분석을 제공합니다.</p>
        </article>
        <article class="score-feature" data-reveal data-reveal-delay="1">
          <span class="score-feature__tag">대구, 경북</span>
          <h3>2026년 하반기 경찰공무원 시험<br>실시간 <strong>합격예측 서비스</strong></h3>
          <p>대구·경북 지역 경쟁자 데이터 기반 확실권, 유력권,<br class="score-feature__desktop-break">가능권 가능성을 예측합니다.</p>
        </article>
        <article class="score-feature" data-reveal data-reveal-delay="2">
          <span class="score-feature__tag">실시간 LIVE</span>
          <h3>내 등수, 지금 몇 위?<br>실시간 경쟁 현황 <strong>LIVE 분석</strong></h3>
          <p>참여자 합격예측 분포를 실시간 확인. 합격선까지<br class="score-feature__desktop-break">몇 점 차이인지 즉시 파악합니다.</p>
        </article>
        <article class="score-feature" data-reveal data-reveal-delay="3">
          <span class="score-feature__tag">환산점수</span>
          <h3>필기·체력·가산점까지 반영<br><strong>최종 환산 예측</strong></h3>
          <p>필기 환산(50점), 체력 환산(25점), 가산점 자동 계산으로<br class="score-feature__desktop-break">최종 환산점수를 예측합니다.</p>
        </article>
      </div>

      <p class="score-section__closing" data-reveal>
        대구·경북 수험생 실시간 데이터 기반<br>
        가장 정확한 합격예측 풀서비스!
      </p>
    </div>
  </section>

  <section class="score-section score-section--how">
    <div class="score-wrap">
      <header class="score-section__head" data-reveal>
        <p class="score-kicker">HOW TO  USE</p>
        <h2 class="score-section__title">
          시험장을 나오는 순간부터 전략이 시작됩니다.<br>
          채점·분석·합격선 예측까지 한 번에 확인하세요.
        </h2>
        <p class="score-section__description">채점부터 합격선 예측까지, 지금 바로 시작하세요</p>
      </header>

      <img class="score-how__preview" data-reveal="scale" src="${assets}/service-preview.png" width="2180" height="978" alt="등수, 합격예측, 컷라인 추적 화면 예시">
      <p class="score-how__closing" data-reveal>
        시험이 끝난 지금, 가장 먼저 해야합니다.<br>
        내 점수가 합격선에 닿는지, 3분 만에 확인해보세요.
      </p>
    </div>
  </section>

  ${PROMOTION_EXAM_FUNCTIONS_SLOT}

  <section class="score-event score-event--one">
    <div class="score-wrap score-event__grid">
      <div data-reveal="left">
        <p class="score-event__label"><span>대구, 경북 합격예측  풀서비스</span> EVENT 01</p>
        <h2 class="score-event__title">
          시험 종료 후 가답안 입력 하면 선물이!<br>
          <strong>합격 가능성과 참여 선물</strong>
          모두 받아가세요
        </h2>
        <dl class="score-event__details">
          <dt>이벤트 기간</dt><dd>8/22(토) ~ 8/24(월)까지</dd>
          <dt>참여 방법</dt><dd>경찰시험 종료 후 가채점 완료시 참여 완료</dd>
          <dd class="score-event__note">* 이벤트 혜택 : 애플워치SE3, 도미노 피자, 교촌치킨, 투썸 음료,케익 세트</dd>
          <dt>당첨자 발표</dt><dd>8/26(수) 학원 홈페이지, 개별 문자 통지</dd>
        </dl>
      </div>

      <figure class="score-prizes" data-reveal="right">
        <img class="score-prizes__group" src="${assets}/event1-prizes-group-1004.png" width="445" height="362" alt="추첨 경품 도넛, 치킨, 피자, 케이크와 음료">
      </figure>
    </div>
  </section>

  <section class="score-event score-event--two">
    <div class="score-wrap score-event__grid">
      <div data-reveal="left">
        <p class="score-event__label"><span>대구, 경북 합격예측  풀서비스</span> EVENT 02</p>
        <h2 class="score-event__title">가채점시 최준 경찰 면접반<strong>수강 할인권 제공</strong></h2>
        <dl class="score-event__details">
          <dt>이벤트기간</dt><dd>8월 22일(토) ~ 8월 31일(월)까지</dd>
          <dt>면접 설명회</dt><dd>8월 31일(월) 18:00</dd>
          <dt>장소</dt><dd>한국경찰학원</dd>
          <dt>혜택</dt><dd>합격예측 풀서비스 가채점시 <strong>면접 1만원 수강 할인권</strong> 제공</dd>
        </dl>
      </div>

      <figure class="score-event__teacher" data-reveal="right">
        <img src="${assets}/instructor-choi-jun-figma.png" width="3218" height="4096" alt="경찰면접 최준 교수">
        <figcaption>경찰면접 최준</figcaption>
      </figure>
    </div>
  </section>
</main>`;
}

import type { CSSProperties } from "react";
import styles from "./Police2026SecondPromotion.module.css";

interface Police2026SecondPromotionProps {
  assetBaseUrl: string;
}

function joinAssetUrl(assetBaseUrl: string, fileName: string): string {
  return `${assetBaseUrl.replace(/\/$/, "")}/${fileName}`;
}

function RegistrationButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      data-pre-registration-modal="true"
      className={[styles.cta, className].filter(Boolean).join(" ")}
    >
      응시번호 사전등록하기 <span aria-hidden="true">&gt;</span>
    </button>
  );
}

function RewardBadge({
  assetBaseUrl,
  tone,
  count,
}: {
  assetBaseUrl: string;
  tone: "blue" | "purple" | "pink";
  count: number;
}) {
  return (
    <span className={styles.badge}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={joinAssetUrl(assetBaseUrl, `badge-${tone}.svg`)} alt="" aria-hidden="true" />
      <span>추첨<br />{count}명</span>
    </span>
  );
}

export default function Police2026SecondPromotion({
  assetBaseUrl,
}: Police2026SecondPromotionProps) {
  const asset = (fileName: string) => joinAssetUrl(assetBaseUrl, fileName);
  const heroStyle = {
    backgroundImage: `url("${asset("hero-background.webp")}")`,
  } satisfies CSSProperties;

  return (
    <div className={styles.promotion} data-promotion-template="police-2026-second">
      <section className={styles.hero} style={heroStyle} aria-labelledby="promotion-hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroVisual} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset("hero-devices.webp")} alt="" width={3000} height={3228} fetchPriority="high" />
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}><strong>대구·경북지역</strong> 경찰공무원 시험</p>
            <h1 id="promotion-hero-title"><span>합격예측 풀서비스</span>사전등록 이벤트</h1>
            <p className={styles.heroLead}>시험 전에 응시정보와 응시번호를 미리 등록하세요.<br />시험 후 로그인하면 저장한 정보로 바로 답안을 입력할 수 있습니다.</p>
            <p className={styles.heroBody}>응시번호 사전등록을 완료한 수험생을 대상으로<br />추첨을 통해 다양한 혜택을 제공합니다.</p>
            <RegistrationButton />
          </div>
        </div>
      </section>

      <section className={styles.features} aria-labelledby="promotion-features-title">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionLabel}>SERVICE FEATURES</p>
          <h2 id="promotion-features-title">대구·경북 수험생을 위한<br /><span>실시간 채점과 표본 분석</span></h2>
          <p>근거가 확인되는 점수와 참여자 표본 정보만 정직하게 제공합니다.</p>
        </div>
        <div className={styles.featureGrid}>
          <article className={styles.featureCard}>
            <span className={styles.tag}>즉시 확인</span>
            <h3><strong>시험 직후</strong> 바로 확인하는<br />가채점과 과락 판정</h3>
            <p>답안을 입력하면 총점, 과목별 점수와 과락 여부를 바로 확인할 수 있습니다.</p>
          </article>
          <article className={styles.featureCard}>
            <span className={styles.tag}>대구·경북</span>
            <h3>2026년 하반기 경찰공무원 시험<br /><strong>지역별 표본 현황</strong></h3>
            <p>대구·경북 지역과 채용유형을 나누어 참여인원과 표본 내 위치를 안내합니다.</p>
          </article>
          <article className={styles.featureCard}>
            <span className={`${styles.tag} ${styles.tagElectric}`}>실시간 집계</span>
            <h3>내 등수는 지금 몇 위인지<br /><strong>표본 순위와 백분위</strong></h3>
            <p>표본이 충분한 경우 참여자 안에서의 등수와 상위 비율을 함께 보여드립니다.</p>
          </article>
          <article className={styles.featureCard}>
            <span className={`${styles.tag} ${styles.tagElectric}`}>시험 분석</span>
            <h3>틀린 문제와 어려운 과목을 확인하는<br /><strong>정답률과 오답 분석</strong></h3>
            <p>과목별 점수와 문항별 정답률을 바탕으로 시험 결과를 구체적으로 확인합니다.</p>
          </article>
        </div>
        <p className={styles.sectionClosing}>작은 표본을 과장하지 않고<br />대구·경북 수험생에게 필요한 정보를 제공합니다.</p>
      </section>

      <section className={styles.analysis} aria-labelledby="promotion-analysis-title">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionLabel}>성적 분석</p>
          <h2 id="promotion-analysis-title">시험장을 나온 뒤 답안을 입력하면<br />채점과 성적 분석을 한 번에 확인할 수 있습니다.</h2>
          <p>총점, 과락 여부, 과목별 성적과 표본 내 위치를 순서대로 확인하세요.</p>
        </div>
        <figure className={styles.analysisFigure}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset("howto-dashboard-current.png")}
            alt="경찰 합격예측 서비스의 실제 성적 분석 화면"
            width={1280}
            height={1365}
            loading="lazy"
            decoding="async"
          />
        </figure>
        <p className={styles.sectionClosing}>시험 직후 3분이면 충분합니다.<br />답안을 입력하고 내 점수와 표본 위치를 확인하세요.</p>
      </section>

      <section className={styles.steps} aria-labelledby="promotion-steps-title">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionLabel}>HOW TO USE</p>
          <h2 id="promotion-steps-title">2026년 하반기 경찰공무원 시험<br /><span>응시번호 사전등록,</span> 이렇게 참여하세요.</h2>
        </div>
        <ol className={styles.stepGrid}>
          <li className={styles.stepCard}>
            <h3><strong>합격예측 풀서비스</strong><br />사이트 접속</h3>
            <p>대구·경북 경찰 수험생을 위한 한국경찰학원 합격예측 풀서비스에 접속합니다.</p>
          </li>
          <li className={styles.stepCard}>
            <h3>응시정보와 응시번호<br /><strong>사전등록</strong></h3>
            <p>회원가입 후 응시지역, 채용유형과 응시번호를 시험 전에 미리 저장합니다.</p>
          </li>
          <li className={styles.stepCard}>
            <h3>시험 종료 후<br /><strong>답안 입력</strong></h3>
            <p>시험이 끝난 뒤 로그인하면 저장한 응시정보를 불러와 답안만 입력할 수 있습니다.</p>
          </li>
          <li className={styles.stepCard}>
            <h3>채점 결과와<br /><strong>표본 분석 확인</strong></h3>
            <p>점수, 과락 여부, 과목 분석과 대구·경북 참여자 안에서의 위치를 확인합니다.</p>
          </li>
        </ol>
        <RegistrationButton className={styles.stepsCta} />
      </section>

      <section className={styles.eventOne} aria-labelledby="promotion-event-one-title">
        <div className={styles.eventOneInner}>
          <div className={styles.eventOneCopy}>
            <p className={styles.eventLabel}>대구·경북 합격예측 풀서비스 <span>사전등록 이벤트</span></p>
            <h2 id="promotion-event-one-title">대구·경북지역 합격예측<br /><span>사전등록하고 다양한 혜택</span>을<br />빠르게 받아가세요.</h2>
            <dl className={styles.eventDetails}>
              <div><dt>이벤트 기간</dt><dd>8월 14일(금)부터 8월 21일(금)까지</dd></div>
              <div><dt>참여 방법</dt><dd>대구·경북 합격예측 풀서비스 응시번호 사전등록 완료<br /><small>햄버거 세트, 커피 쿠폰, 올리브영 상품권, GS25 쿠폰, 네이버페이 포인트를 추첨으로 제공합니다.</small></dd></div>
              <div><dt>당첨자 발표</dt><dd>8월 26일(수), 학원 홈페이지 공지 및 개별 문자 안내</dd></div>
            </dl>
            <RegistrationButton />
          </div>
          <div className={styles.giftCollage} aria-label="사전등록 이벤트 경품">
            <div className={`${styles.gift} ${styles.giftBurger}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event1-gift-cluster.webp")} alt="햄버거 세트" width={489} height={448} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="blue" count={10} />
            </div>
            <div className={`${styles.gift} ${styles.giftCoffee}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event1-gift-1.webp")} alt="컴포즈 커피 쿠폰" width={324} height={408} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="purple" count={30} />
            </div>
            <div className={`${styles.gift} ${styles.giftGs}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event1-gift-3.webp")} alt="GS25 모바일 금액권" width={459} height={293} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="purple" count={20} />
            </div>
            <div className={`${styles.gift} ${styles.giftOlive}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event1-gift-5.webp")} alt="올리브영 모바일 상품권" width={393} height={247} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="purple" count={20} />
            </div>
            <div className={`${styles.gift} ${styles.giftPay}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event1-gift-4.webp")} alt="네이버페이 포인트 쿠폰" width={467} height={307} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="purple" count={20} />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.eventTwo} aria-labelledby="promotion-event-two-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eventLabel}>대구·경북 합격예측 풀서비스 <span>답안 입력 이벤트</span></p>
          <h2 id="promotion-event-two-title">시험 종료 후 <span>답안을 입력하면 선물이!</span><br />채점 결과와 참여 선물을 함께 확인하세요.</h2>
        </div>
        <div className={styles.rewardGrid}>
          <article className={styles.rewardCard}>
            <div className={styles.rewardMedia}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event2-gift-1.webp")} alt="도미노피자와 콜라" width={434} height={338} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="pink" count={3} />
            </div>
            <h3>도미노피자<br />오리지널 슈퍼슈프림</h3>
          </article>
          <article className={styles.rewardCard}>
            <div className={styles.rewardMedia}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event2-gift-2.webp")} alt="교촌치킨과 콜라" width={555} height={495} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="pink" count={3} />
            </div>
            <h3>교촌치킨<br />간장 한 마리와 콜라 1.25L</h3>
          </article>
          <article className={styles.rewardCard}>
            <div className={styles.rewardMedia}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event2-gift-3.webp")} alt="크리스피 크림 도넛" width={523} height={439} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="pink" count={3} />
            </div>
            <h3>크리스피 크림 도넛<br />오리지널 글레이즈드 더즌</h3>
          </article>
          <article className={styles.rewardCard}>
            <div className={styles.rewardMedia}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("event2-gift-4.webp")} alt="투썸 케이크와 아메리카노" width={548} height={500} loading="lazy" decoding="async" />
              <RewardBadge assetBaseUrl={assetBaseUrl} tone="pink" count={3} />
            </div>
            <h3>투썸 디저트 2종<br />아메리카노 R 2잔</h3>
          </article>
        </div>
      </section>
    </div>
  );
}

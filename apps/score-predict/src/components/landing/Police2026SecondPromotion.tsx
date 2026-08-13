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
            src={asset("analysis-dashboard-figma-20260813.png")}
            alt="경찰 합격예측 서비스의 실제 성적 분석 화면"
            width={1090}
            height={489}
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.giftComposite}
              src={asset("event1-gift-composite-group987-v2.png")}
              alt="햄버거 세트, 컴포즈 커피, GS25, 네이버페이, 올리브영 경품과 추첨 인원"
              width={616}
              height={339}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <section className={styles.eventTwo} aria-labelledby="promotion-event-two-title">
        <div className={styles.eventSplitInner}>
          <div className={styles.eventTwoCopy}>
            <p className={styles.eventLabel}>대구, 경북 합격예측 풀서비스 <span>EVENT 02</span></p>
            <h2 id="promotion-event-two-title">시험 종료 후 가답안을 입력하면 선물이!<br /><span>합격 가능성과 참여 선물</span><br />모두 받아가세요.</h2>
            <dl className={styles.eventDetails}>
              <div><dt>이벤트 기간</dt><dd>8/22(토) ~ 8/24(월)까지</dd></div>
              <div><dt>참여 방법</dt><dd>경찰시험 종료 후 가채점 완료 시 참여 완료<br /><small>* 이벤트 혜택 : 애플워치SE3, 도미노 피자, 교촌치킨, 투썸 음료·케이크 세트</small></dd></div>
              <div><dt>당첨자 발표</dt><dd>8/26(수) 학원 홈페이지, 개별 문자 통지</dd></div>
            </dl>
          </div>
          <div className={styles.eventTwoGift} aria-label="답안 입력 이벤트 경품">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.giftComposite}
              src={asset("event2-gift-composite-group1004.png")}
              alt="크리스피 크림 도넛, 교촌치킨, 도미노피자, 투썸 케이크와 음료 경품 및 추첨 인원"
              width={445}
              height={362}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <section className={styles.eventThree} aria-labelledby="promotion-event-three-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eventLabel}>대구, 경북 합격예측 풀서비스 <span>EVENT 03</span></p>
          <h2 id="promotion-event-three-title">합격예측 풀서비스 가채점시<br /><span>최준 경찰면접반 수강 할인권</span> 제공</h2>
        </div>
        <article className={styles.eventThreeCard}>
          <div className={styles.eventThreeCopy}>
            <p>경찰 면접 프로그램의 새로운 트렌드의 완성! 합격률로 증명하는 최준 면접반!</p>
            <h3>최준 면접 관리반 설명회</h3>
            <dl className={styles.eventDetails}>
              <div><dt>설명회</dt><dd>8월 31일(월) 18:00</dd></div>
              <div><dt>장소</dt><dd>한국경찰학원</dd></div>
              <div><dt>혜택</dt><dd>합격예측 풀서비스 가채점 시 <strong>면접 1만원 수강 할인권</strong> 제공</dd></div>
            </dl>
          </div>
          <div className={styles.instructorImage}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("event3-instructor-figma.png")}
              alt="최준 경찰면접반 강사"
              width={299}
              height={356}
              loading="lazy"
              decoding="async"
            />
          </div>
        </article>
      </section>
    </div>
  );
}

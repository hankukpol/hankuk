import type { CSSProperties } from "react";
import styles from "./Police2026SecondPromotion.module.css";
import Police2026SecondPromotionMotion from "./Police2026SecondPromotionMotion";

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
      {"응시번호 사전등록 하기    >"}
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
      <Police2026SecondPromotionMotion />
      <section className={styles.hero} style={heroStyle} aria-labelledby="promotion-hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroVisual} aria-hidden="true" data-reveal="left">
            <div className={styles.heroFloat}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("hero-devices.webp")} alt="" width={3000} height={3228} fetchPriority="high" />
            </div>
          </div>
          <div className={styles.heroCopy} data-reveal="right" data-reveal-delay="1">
            <p className={styles.heroEyebrow}><strong>대구·경북지역</strong> 경찰공무원 시험</p>
            <h1 id="promotion-hero-title"><span>합격예측 풀서비스</span>사전예약 이벤트</h1>
            <p className={styles.heroLead}>시험 전에 응시번호만 미리 등록하세요.<br />시험 끝나고 로그인하면 응시정보가 자동 입력됩니다.</p>
            <p className={styles.heroBody}>응시번호 사전등록시 추첨을 통해 다양한 혜택이<br />수험생 여러분에게 제공 됩니다.</p>
            <RegistrationButton />
          </div>
        </div>
      </section>

      <section className={styles.features} aria-labelledby="promotion-features-title">
        <div className={styles.sectionHeading} data-reveal="up">
          <p className={styles.sectionLabel}>SERVICE FEATURES</p>
          <h2 id="promotion-features-title">단 하나의 <span>풀서비스</span>를 이용해야 한다면,<br /><span>대구·경북</span> 가장 빠르고 정확한 합격예측</h2>
          <p>빅데이터가 분석한 나의 합격 확률, 지금 확인해보세요.</p>
        </div>
        <div className={styles.featureGrid}>
          <article className={styles.featureCard} data-reveal="up" data-reveal-delay="1">
            <span className={styles.tag}>즉시확인</span>
            <h3><strong>시험 직후</strong> 바로 확인!<br />가채점&amp;합격예측 서비스</h3>
            <p>정답 입력 즉시 응시자 성적 순위, 상위 평균과 지역별<br />석차 분석을 제공합니다.</p>
          </article>
          <article className={styles.featureCard} data-reveal="up" data-reveal-delay="2">
            <span className={styles.tag}>대구, 경북</span>
            <h3>2026년 하반기 경찰공무원 시험<br />실시간 <strong>합격예측 서비스</strong></h3>
            <p>대구·경북 지역 경쟁자 데이터 기반 확실권, 유력권,<br />가능권 가능성을 예측합니다.</p>
          </article>
          <article className={styles.featureCard} data-reveal="up" data-reveal-delay="3">
            <span className={`${styles.tag} ${styles.tagElectric}`}>실시간 LIVE</span>
            <h3>내 등수, 지금 몇 위?<br />실시간 경쟁 현황 <strong>LIVE 분석</strong></h3>
            <p>참여자 합격예측 분포를 실시간 확인. 합격선까지<br />몇 점 차이인지 즉시 파악합니다.</p>
          </article>
          <article className={styles.featureCard} data-reveal="up" data-reveal-delay="4">
            <span className={`${styles.tag} ${styles.tagElectric}`}>환산점수</span>
            <h3>필기·체력·가산점까지 반영<br /><strong>최종 환산 예측</strong></h3>
            <p>필기 환산(50점), 체력 환산(25점), 가산점 자동 계산으로<br />최종 환산점수를 예측합니다.</p>
          </article>
        </div>
        <p className={styles.sectionClosing} data-reveal="up">대구·경북 수험생 실시간 데이터 기반<br />가장 정확한 합격예측 풀서비스!</p>
      </section>

      <section className={styles.analysis} aria-labelledby="promotion-analysis-title">
        <div className={styles.sectionHeading} data-reveal="up">
          <p className={styles.sectionLabel}>{"HOW TO  USE"}</p>
          <h2 id="promotion-analysis-title">시험장을 나오는 순간부터 전략이 시작됩니다.<br />채점·분석·합격선 예측까지 한 번에 확인하세요.</h2>
          <p>채점부터 합격선 예측까지, 지금 바로 시작하세요</p>
        </div>
        <figure className={styles.analysisFigure} data-reveal="scale" data-reveal-delay="1">
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
        <p className={styles.sectionClosing} data-reveal="up">시험이 끝난 지금, 가장 먼저 해야합니다.<br />내 점수가 합격선에 닿는지, 3분 만에 확인해보세요.</p>
      </section>

      <section className={styles.steps} aria-labelledby="promotion-steps-title">
        <div className={styles.sectionHeading} data-reveal="up">
          <p className={styles.sectionLabel}>{"HOW TO  USE"}</p>
          <h2 id="promotion-steps-title">2026년 하반기 경찰공무원 시험<br /><span>응시번호 사전등록,</span> 이렇게 참여 하세요!</h2>
        </div>
        <ol className={styles.stepGrid}>
          <li className={styles.stepCard} data-reveal="up" data-reveal-delay="1">
            <h3><strong>합격예측 풀서비스</strong><br />사이트 접속</h3>
            <p>대구, 경북지역 합격을 위한<br />한국경찰학원 예측 풀서비스<br />사이트 접속</p>
          </li>
          <li className={styles.stepCard} data-reveal="up" data-reveal-delay="2">
            <h3>응시번호<br /><strong>사전 등록</strong>하기</h3>
            <p>시험 전 응시정보와 수험번호만<br />먼저 저장! 시험종료 후<br />답안만 입력하면 채점 가능</p>
          </li>
          <li className={styles.stepCard} data-reveal="up" data-reveal-delay="3">
            <h3><strong>대구, 경북지역</strong><br />합격예측 풀서비스</h3>
            <p>대구, 경북지역 합격을 위한<br />한국경찰학원 예측 풀서비스<br />사이트 접속</p>
          </li>
          <li className={styles.stepCard} data-reveal="up" data-reveal-delay="4">
            <h3>사전등록 이벤트<br /><strong>참여자 혜택</strong></h3>
            <p>대구, 경북지역 합격을 위한<br />한국경찰학원 예측 풀서비스<br />사이트 접속</p>
          </li>
        </ol>
        <div data-reveal="up"><RegistrationButton className={styles.stepsCta} /></div>
      </section>

      <section className={styles.eventOne} aria-labelledby="promotion-event-one-title">
        <div className={styles.eventOneInner}>
          <div className={styles.eventOneCopy} data-reveal="left">
            <p className={styles.eventLabel}>{"대구, 경북 합격예측  풀서비스 "}<span>EVENT 01</span></p>
            <h2 id="promotion-event-one-title">대구, 경북지역 합격예측<br /><span>사전 등록하고, 다양한 혜택</span>을<br />빠르게 받아가세요.</h2>
            <dl className={styles.eventDetails}>
              <div><dt>이벤트 기간</dt><dd>8/14(금) ~ 8/21(금)까지</dd></div>
              <div><dt>참여 방법</dt><dd>대구, 경북 합격예측 풀서비스 사전등록 완료 시 이벤트 참여<br /><small>* 이벤트 혜택 : 햄버거 세트, 컴포즈 커피 쿠폰, 올리브영 상품권<br />GS편의점 쿠폰, 네이버페이 포인트</small></dd></div>
              <div><dt>당첨자 발표</dt><dd>8/26(수) 학원 홈페이지, 개별 문자 통지</dd></div>
            </dl>
          </div>
          <div className={styles.eventOneCta} data-reveal="up" data-reveal-delay="2"><RegistrationButton /></div>
          <div className={styles.giftCollage} aria-label="사전등록 이벤트 경품" data-reveal="right" data-reveal-delay="1">
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
          <div className={styles.eventTwoCopy} data-reveal="left">
            <p className={styles.eventLabel}>{"대구, 경북 합격예측  풀서비스 "}<span>EVENT 02</span></p>
            <h2 id="promotion-event-two-title">시험 종료 후 가답안 입력 하면 선물이!<br /><span>합격 가능성과 참여 선물</span><br />모두 받아가세요</h2>
            <dl className={styles.eventDetails}>
              <div><dt>이벤트 기간</dt><dd>8/22(토) ~ 8/24(월)까지</dd></div>
              <div><dt>참여 방법</dt><dd>경찰시험 종료 후 가채점 완료시 참여 완료<br /><small>* 이벤트 혜택 : 애플워치SE3, 도미노 피자, 교촌치킨, 투썸 음료,케익 세트</small></dd></div>
              <div><dt>당첨자 발표</dt><dd>8/26(수) 학원 홈페이지, 개별 문자 통지</dd></div>
            </dl>
          </div>
          <div className={styles.eventTwoGift} aria-label="답안 입력 이벤트 경품" data-reveal="right" data-reveal-delay="1">
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
        <div className={styles.sectionHeading} data-reveal="up">
          <p className={styles.eventLabel}>{"대구, 경북 합격예측  풀서비스 "}<span>EVENT 03</span></p>
          <h2 id="promotion-event-three-title">합격예측 풀서비스 가채점시<br /><span>최준 경찰면접반 수강 할인권</span> 제공</h2>
        </div>
        <article className={styles.eventThreeCard}>
          <div className={styles.eventThreeCopy} data-reveal="left" data-reveal-delay="1">
            <p>경찰 면접 프로그램의 새로운 트렌드의 완성! 합격률로 증명하는 최준 면접반!</p>
            <h3>최준 면접 관리반 설명회</h3>
            <dl className={styles.eventDetails}>
              <div><dt>설명회</dt><dd>8월 31일(월) 18:00</dd></div>
              <div><dt>장소</dt><dd>한국경찰학원</dd></div>
              <div><dt>혜택</dt><dd>합격예측 풀서비스 가채점시 <strong>면접 1만원 수강 할인권</strong> 제공</dd></div>
            </dl>
          </div>
          <div className={styles.instructorImage} data-reveal="right" data-reveal-delay="2">
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

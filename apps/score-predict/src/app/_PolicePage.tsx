import { ExamType } from "@prisma/client";
import { getServerSession } from "next-auth";
import BannerImage from "@/components/landing/BannerImage";
import EventCard from "@/components/landing/EventCard";
import ExamFunctionArea from "@/components/landing/ExamFunctionArea";
import HeroFallback from "@/components/landing/HeroFallback";
import LiveStatsCounter, { type LandingLiveStats } from "@/components/landing/LiveStatsCounter";
import NoticeBar from "@/components/landing/NoticeBar";
import PromotionCampaignBridge from "@/components/landing/PromotionCampaignBridge";
import { authOptions } from "@/lib/auth";
import { getActiveBanners, groupBannersByZone } from "@/lib/banners";
import { getExamSurfaceState, getPreferredExamRoute } from "@/lib/exam-surface";
import { getEffectiveSiteSettings, getPublishedActiveCampaign } from "@/lib/exam-operation";
import { resolveExamOperationStage, resolveLandingHeroCopy } from "@/lib/exam-operation-stage";
import { getActiveEvents } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getActiveNotices } from "@/lib/site-settings";
import { withTenantPrefix } from "@/lib/tenant";
import { requireSoleActiveExam } from "@/lib/active-exam";

export const dynamic = "force-dynamic";

async function getLiveStats(): Promise<LandingLiveStats | null> {
  try {
    const activeExam = await requireSoleActiveExam({
      db: prisma,
      tenantType: "police",
      context: "police/landing/live-stats",
    });

    if (!activeExam) {
      return null;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const regionalScope = {
      region: {
        isActive: true,
      },
    };
    const [totalParticipants, examTypeStats, recentParticipants, latestSubmission, latestRelease] = await Promise.all([
      prisma.submission.count({
        where: { examId: activeExam.id, ...regionalScope },
      }),
      prisma.submission.groupBy({
        by: ["examType"],
        where: { examId: activeExam.id, ...regionalScope },
        _count: {
          _all: true,
        },
      }),
      prisma.submission.count({
        where: {
          examId: activeExam.id,
          ...regionalScope,
          createdAt: { gte: oneHourAgo },
        },
      }),
      prisma.submission.findFirst({
        where: { examId: activeExam.id, ...regionalScope },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.passCutRelease.findFirst({
        where: { examId: activeExam.id },
        orderBy: [{ releaseNumber: "desc" }, { releasedAt: "desc" }],
        select: { releaseNumber: true, releasedAt: true },
      }),
    ]);

    const publicParticipants =
      examTypeStats.find((item) => item.examType === ExamType.PUBLIC)?._count._all ?? 0;
    const careerParticipants =
      examTypeStats.find((item) => item.examType === ExamType.CAREER)?._count._all ?? 0;

    return {
      examName: activeExam.name,
      examYear: activeExam.year,
      examRound: activeExam.round,
      examDate: activeExam.examDate,
      latestReleaseNumber: latestRelease?.releaseNumber ?? null,
      latestReleasedAt: latestRelease?.releasedAt ?? null,
      totalParticipants,
      publicParticipants,
      careerParticipants,
      recentParticipants,
      updatedAt: latestSubmission?.createdAt ?? null,
    };
  } catch (error) {
    console.error("실시간 참여 현황 조회 중 오류가 발생했습니다.", error);
    return null;
  }
}

async function getHasSubmission(userId: number): Promise<boolean> {
  let activeExam;
  try {
    activeExam = await requireSoleActiveExam({
      db: prisma,
      tenantType: "police",
      context: "police/landing/has-submission",
    });
  } catch {
    return false;
  }

  const submissionCount = await prisma.submission.count({
    where: {
      userId,
      examId: activeExam.id,
      region: {
        isActive: true,
      },
    },
  });

  return submissionCount > 0;
}

export default async function HomePage() {
  const tenantType = "police";
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id ?? 0);
  const isLoggedIn = Boolean(session?.user && Number.isInteger(userId) && userId > 0);
  const isAdmin = session?.user?.role === "ADMIN";

  const activePromotion = await getPublishedActiveCampaign();
  if (activePromotion.campaign) {
    const hasSubmission = isLoggedIn ? await getHasSubmission(userId) : false;
    const { features } = activePromotion.operation;

    return (
      <main>
        <PromotionCampaignBridge
          isAuthenticated={isLoggedIn}
          hasSubmission={hasSubmission}
          isAdmin={isAdmin}
          preRegistrationEnabled={features.preRegistration}
          noticesEnabled={features.notices}
          faqEnabled={features.faq}
          finalPredictionEnabled={features.finalPrediction}
          commentsEnabled={features.comments}
          tabEnabled={{
            main: true,
            input: features.preRegistration || features.answerInput,
            result: features.result,
            final: features.finalPrediction,
            prediction: features.analysis,
            comments: features.comments,
            notices: features.notices,
            faq: features.faq,
          }}
          templateKey={activePromotion.campaign.templateKey}
          templateVersion={activePromotion.campaign.templateVersion}
          content={activePromotion.campaign.publishedContent}
        />
      </main>
    );
  }

  const [liveStats, siteSettings, activeNotices, activeBanners, activeEvents, hasSubmission] =
    await Promise.all([
      getLiveStats(),
      getEffectiveSiteSettings(),
      getActiveNotices(),
      getActiveBanners(),
      getActiveEvents(),
      isLoggedIn ? getHasSubmission(userId) : Promise.resolve(false),
    ]);

  const bannersByZone = groupBannersByZone(activeBanners);
  const heroBanner = bannersByZone.hero[0] ?? null;
  const heroSubBanners = bannersByZone.hero.slice(1);
  const derivedHeroBadge = liveStats
    ? `${liveStats.examYear}년 ${liveStats.examRound}차 경찰 필기시험 합격예측`
    : "경찰 필기시험 합격예측";
  const configuredHeroBadge = String(siteSettings["site.heroBadge"] ?? "").trim();
  const heroBadge =
    !configuredHeroBadge ||
    configuredHeroBadge === "경찰 필기시험 합격예측" ||
    /경찰.*1차|1차.*경찰/.test(configuredHeroBadge)
      ? derivedHeroBadge
      : configuredHeroBadge;
  const careerExamEnabled = Boolean(siteSettings["site.careerExamEnabled"] ?? true);
  const examSurfaceState = getExamSurfaceState(siteSettings, {
    defaultLockedMessage: "시험 중 오픈 예정입니다.",
  });
  const finalPredictionEnabled = examSurfaceState.finalPredictionEnabled;
  const commentsEnabled = examSurfaceState.commentsEnabled;
  const mainCardLiveStatsEnabled = Boolean(siteSettings["site.mainCardLiveStatsEnabled"] ?? true);
  const noticesEnabled = examSurfaceState.noticesEnabled;
  const tabEnabled = examSurfaceState.tabEnabled;
  const preRegistrationEnabled = Boolean(siteSettings["site.preRegistrationEnabled"] ?? true);
  const answerInputEnabled = Boolean(siteSettings["site.answerInputEnabled"] ?? false);
  const operationStage = resolveExamOperationStage({
    preRegistrationEnabled,
    answerInputEnabled,
    latestReleaseNumber: liveStats?.latestReleaseNumber ?? null,
  });
  const configuredHeroTitle = String(
    siteSettings["site.heroTitle"] ?? "OMR 입력부터 합격권 예측까지\n한 번에 확인하세요"
  );
  const configuredHeroSubtitle = String(
    siteSettings["site.heroSubtitle"] ??
    "응시정보와 OMR 답안을 입력하면 과목별 분석, 점수, 과락 여부, 표본 등수와 백분위를 확인할 수 있습니다."
  );
  const heroCopy = resolveLandingHeroCopy({
    serviceName: "경찰",
    operationStage,
    answerInputEnabled,
    preRegistrationEnabled,
    isAuthenticated: isLoggedIn,
    hasSubmission,
    fallbackTitle: configuredHeroTitle,
    fallbackSubtitle: configuredHeroSubtitle,
  });

  const primaryExamRoute = getPreferredExamRoute(siteSettings, { isAuthenticated: isLoggedIn, hasSubmission });
  const authenticatedPrimaryHref = hasSubmission
    ? "/exam/result"
    : answerInputEnabled || preRegistrationEnabled
      ? "/exam/input"
      : primaryExamRoute.href;
  const authenticatedSecondaryHref = hasSubmission
    ? liveStats?.latestReleaseNumber
      ? "/exam/prediction"
      : "/exam/input"
    : "/exam/notices";

  return (
    <main>
      <section className="relative overflow-hidden bg-slate-100 pb-10 pt-0">
        {heroBanner ? (
          <div className="w-full">
            <BannerImage banner={heroBanner} fullWidth={true} />
          </div>
        ) : (
          <div className="user-content-frame flex flex-col gap-5 pt-8 sm:pt-10">
            <HeroFallback
              badge={heroBadge}
              title={heroCopy.title}
              subtitle={heroCopy.subtitle}
              isLoggedIn={isLoggedIn}
              primaryText={heroCopy.primaryText}
              secondaryText={heroCopy.secondaryText}
              operationLabel={operationStage.label}
              operationDescription={operationStage.description}
              primaryHref={
                isLoggedIn
                  ? withTenantPrefix(authenticatedPrimaryHref, tenantType)
                  : withTenantPrefix("/login", tenantType)
              }
              secondaryHref={
                isLoggedIn
                  ? withTenantPrefix(authenticatedSecondaryHref, tenantType)
                  : withTenantPrefix("/register", tenantType)
              }
            />
          </div>
        )}

        <div className="user-content-frame mt-8 flex flex-col gap-5 sm:mt-10">
          {heroSubBanners.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {heroSubBanners.map((banner) => (
                <BannerImage
                  key={`hero-sub-${banner.id}`}
                  banner={banner}
                  className="h-auto w-full rounded-2xl border border-black/15 object-cover"
                />
              ))}
            </div>
          ) : null}

          {mainCardLiveStatsEnabled && isLoggedIn ? (
            <LiveStatsCounter stats={liveStats} careerExamEnabled={careerExamEnabled} />
          ) : null}
          {noticesEnabled ? <NoticeBar notices={activeNotices} /> : null}
          <ExamFunctionArea
            isAuthenticated={isLoggedIn}
            hasSubmission={hasSubmission}
            isAdmin={isAdmin}
            finalPredictionEnabled={finalPredictionEnabled}
            commentsEnabled={commentsEnabled}
            showEnabledTabsForGuests
            tabEnabled={tabEnabled}
          />
        </div>
      </section>

      {bannersByZone.middle.length > 0 ? (
        <section className="flex w-full flex-col">
          {bannersByZone.middle.map((banner) => (
            <BannerImage key={`middle-${banner.id}`} banner={banner} fullWidth={true} />
          ))}
        </section>
      ) : null}

      {activeEvents.length > 0 ? (
        <section className="flex w-full flex-col">
          {activeEvents.map((event) => (
            <EventCard key={event.id} event={event} fullWidth={true} />
          ))}
        </section>
      ) : null}

      {bannersByZone.bottom.length > 0 ? (
        <section className="flex w-full flex-col">
          {bannersByZone.bottom.map((banner) => (
            <BannerImage key={`bottom-${banner.id}`} banner={banner} fullWidth={true} />
          ))}
        </section>
      ) : null}
    </main>
  );
}

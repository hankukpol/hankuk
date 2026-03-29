import { ExamType } from "@prisma/client";
import { getServerSession } from "next-auth";
import BannerImage from "@/components/landing/BannerImage";
import EventCard from "@/components/landing/EventCard";
import ExamFunctionArea from "@/components/landing/ExamFunctionArea";
import HeroFallback from "@/components/landing/HeroFallback";
import LiveStatsCounter, { type LandingLiveStats } from "@/components/landing/LiveStatsCounter";
import NoticeBar from "@/components/landing/NoticeBar";
import { authOptions } from "@/lib/auth";
import { getActiveBanners, groupBannersByZone } from "@/lib/banners";
import { getExamSurfaceState, getPreferredExamRoute, getSecondaryExamRoute } from "@/lib/exam-surface";
import { getActiveEvents } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getActiveNotices, getSiteSettingsUncached } from "@/lib/site-settings";
import { withTenantPrefix } from "@/lib/tenant";

export const dynamic = "force-dynamic";

async function getLiveStats(): Promise<LandingLiveStats | null> {
  try {
    const activeExam = await prisma.exam.findFirst({
      where: { isActive: true },
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        year: true,
        round: true,
      },
    });

    if (!activeExam) {
      return null;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [totalParticipants, examTypeStats, recentParticipants, latestSubmission] = await Promise.all([
      prisma.submission.count({
        where: { examId: activeExam.id },
      }),
      prisma.submission.groupBy({
        by: ["examType"],
        where: { examId: activeExam.id },
        _count: {
          _all: true,
        },
      }),
      prisma.submission.count({
        where: {
          examId: activeExam.id,
          createdAt: { gte: oneHourAgo },
        },
      }),
      prisma.submission.findFirst({
        where: { examId: activeExam.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    const publicParticipants =
      examTypeStats.find((item) => item.examType === ExamType.PUBLIC)?._count._all ?? 0;
    const careerRescueParticipants =
      examTypeStats.find((item) => item.examType === ExamType.CAREER_RESCUE)?._count._all ?? 0;
    const careerAcademicParticipants =
      examTypeStats.find((item) => item.examType === ExamType.CAREER_ACADEMIC)?._count._all ?? 0;
    const careerEmtParticipants =
      examTypeStats.find((item) => item.examType === ExamType.CAREER_EMT)?._count._all ?? 0;

    return {
      examName: activeExam.name,
      examYear: activeExam.year,
      examRound: activeExam.round,
      totalParticipants,
      publicParticipants,
      careerRescueParticipants,
      careerAcademicParticipants,
      careerEmtParticipants,
      recentParticipants,
      updatedAt: latestSubmission?.createdAt ?? null,
    };
  } catch (error) {
    console.error("실시간 참여 현황 조회 중 오류가 발생했습니다.", error);
    return null;
  }
}

async function getHasSubmission(userId: number): Promise<boolean> {
  const activeExam = await prisma.exam.findFirst({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  const submissionCount = await prisma.submission.count({
    where: activeExam
      ? {
        userId,
        examId: activeExam.id,
      }
      : {
        userId,
      },
  });

  return submissionCount > 0;
}

export default async function HomePage() {
  const tenantType = "fire";
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id ?? 0);
  const isLoggedIn = Boolean(session?.user && Number.isInteger(userId) && userId > 0);
  const isAdmin = session?.user?.role === "ADMIN";

  const [liveStats, siteSettings, activeNotices, activeBanners, activeEvents, hasSubmission] =
    await Promise.all([
      getLiveStats(),
      getSiteSettingsUncached(),
      getActiveNotices(),
      getActiveBanners(),
      getActiveEvents(),
      isLoggedIn ? getHasSubmission(userId) : Promise.resolve(false),
    ]);

  const bannersByZone = groupBannersByZone(activeBanners);
  const heroBanner = bannersByZone.hero[0] ?? null;
  const heroSubBanners = bannersByZone.hero.slice(1);
  const heroBadge = String(siteSettings["site.heroBadge"] ?? "2026 소방 1차 필기시험 합격예측");
  const careerExamEnabled = Boolean(siteSettings["site.careerExamEnabled"] ?? true);
  const liveStatsCardEnabled = Boolean(siteSettings["site.mainCardLiveStatsEnabled"] ?? true);
  const examSurfaceState = getExamSurfaceState(siteSettings, {
    defaultLockedMessage: "시험 후 오픈 예정입니다.",
  });
  const finalPredictionEnabled = examSurfaceState.finalPredictionEnabled;
  const commentsEnabled = examSurfaceState.commentsEnabled;
  const noticesEnabled = examSurfaceState.noticesEnabled;
  const tabEnabled = examSurfaceState.tabEnabled;
  const tabLockedMessage = examSurfaceState.tabLockedMessage;
  const heroTitle = String(
    siteSettings["site.heroTitle"] ?? "OMR 입력부터 합격권 예측까지\n한 번에 확인하세요"
  );
  const heroSubtitle = String(
    siteSettings["site.heroSubtitle"] ??
    "응시정보와 OMR 답안을 입력하면 과목별 분석, 예상점수, 배수 위치, 합격권 등급을 실시간으로 제공합니다."
  );

  const primaryExamRoute = getPreferredExamRoute(siteSettings, { isAuthenticated: isLoggedIn, hasSubmission });
  const secondaryExamRoute = getSecondaryExamRoute(siteSettings, { isAuthenticated: isLoggedIn, hasSubmission });

  return (
    <main>
      <section className="relative overflow-hidden bg-slate-100 pb-10 pt-0">
        {heroBanner ? (
          <div className="w-full">
            <BannerImage banner={heroBanner} fullWidth={true} />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-8 sm:pt-10">
            <HeroFallback
              badge={heroBadge}
              title={heroTitle}
              subtitle={heroSubtitle}
              isLoggedIn={isLoggedIn}
              primaryHref={
                isLoggedIn
                  ? withTenantPrefix(primaryExamRoute.href, tenantType)
                  : withTenantPrefix("/login", tenantType)
              }
              secondaryHref={
                isLoggedIn
                  ? withTenantPrefix(secondaryExamRoute.href, tenantType)
                  : withTenantPrefix("/register", tenantType)
              }
            />
          </div>
        )}

        <div className="mx-auto mt-8 flex w-full max-w-[1200px] flex-col gap-5 px-4 sm:mt-10">
          {heroSubBanners.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {heroSubBanners.map((banner) => (
                <BannerImage
                  key={`hero-sub-${banner.id}`}
                  banner={banner}
                  className="h-auto w-full rounded-2xl border border-black/15 object-cover shadow-sm"
                />
              ))}
            </div>
          ) : null}

          {liveStatsCardEnabled ? (
            <LiveStatsCounter stats={liveStats} careerExamEnabled={careerExamEnabled} />
          ) : null}
          {noticesEnabled ? <NoticeBar notices={activeNotices} /> : null}
          <ExamFunctionArea
            isAuthenticated={isLoggedIn}
            hasSubmission={hasSubmission}
            isAdmin={isAdmin}
            finalPredictionEnabled={finalPredictionEnabled}
            commentsEnabled={commentsEnabled}
            tabEnabled={tabEnabled}
            tabLockedMessage={tabLockedMessage}
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

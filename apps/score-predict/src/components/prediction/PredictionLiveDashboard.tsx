"use client";

import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Activity, Users, Target, ZoomIn, Radio, Info } from "lucide-react";
import { calculateSampleTopPercent } from "@/lib/public-sample-policy";

interface StatusData {
    label: string;
    ratio: string;
    count: number;
    percent: number;
    color: string;
    fill: string;
    status: string;
}

interface PredictionSummaryView {
    examName: string;
    examTypeLabel: string;
    regionName: string;
    myScore: number;
    applicantCount: number | null;
    estimatedApplicants: number;
    isApplicantCountExact: boolean;
    totalParticipants: number;
    recruitCount: number;
    myMultiple: number | null;
    sampleTopPercent?: number | null;
    passMultiple: number;
    sureMultiple: number | null;
    likelyMultiple: number | null;
    sureMaxRank: number | null;
    likelyMaxRank: number | null;
    passCount: number | null;
    sampleCoverageRate: number;
    sampleStage: "INITIAL" | "COLLECTING" | "FORMING" | "RELIABLE" | "ESTIMATED";
    myRank: number;
    predictionGrade: string | null;
    gradeAvailability?: "AVAILABLE" | "UNAVAILABLE";
    unavailableReasons?: Array<
        "FEATURE_DISABLED" | "MISSING_APPLICANTS" | "INSUFFICIENT_SAMPLE" | "UNCALIBRATED"
    >;
}

interface PredictionPyramidLevel {
    key: "sure" | "likely" | "possible" | "challenge";
    label: string;
    count: number;
    minScore: number | null;
    maxMultiple: number | null;
    minMultiple: number | null;
}

interface PredictionDashboardPayload {
    summary: PredictionSummaryView;
    pyramid: {
        levels: PredictionPyramidLevel[];
    };
    updatedAt: string;
}

/** 서버 계산 모델과 동일한 표본 단계 표시 */
function getConfidenceLevel(stage: PredictionSummaryView["sampleStage"]): {
    label: string;
    message: string;
    badgeClass: string;
} {
    if (stage === "RELIABLE")
        return {
            label: "신뢰 구간 진입",
            message: "표본 30% 이상이 입력되었습니다. 최종 결과를 보장하는 단계는 아닙니다.",
            badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
        };
    if (stage === "FORMING")
        return {
            label: "예측 윤곽 형성 중",
            message: "표본이 15% 이상 모였습니다. 후기 입력에 따라 순위가 변동될 수 있습니다.",
            badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
        };
    if (stage === "COLLECTING")
        return {
            label: "데이터 수집 중",
            message: "아직 참여자가 적어 순위 변동 가능성이 큽니다.",
            badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
        };
    if (stage === "ESTIMATED")
        return {
            label: "출원인원 확인 전",
            message: "출원인원 추정치로 계산 중이며 확실권은 표시하지 않습니다.",
            badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
        };
    return {
        label: "초기 집계",
        message: "초기 데이터입니다. 참여자 수가 적어 순위가 크게 변동될 수 있습니다.",
        badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    };
}

/** 예측 등급 → 게이지 바늘 각도 (-90도=위험, 0도=경합, +90도=안정) */
function getGaugeAngle(
    grade: string,
    myMultiple: number,
    sureMultiple: number,
    likelyMultiple: number,
    passMultiple: number
): number {
    const progress = (value: number, start: number, end: number): number => {
        if (end <= start) return 0.5;
        return Math.min(1, Math.max(0, (value - start) / (end - start)));
    };
    // 반원 게이지: -90도(좌측, 도전권) ~ +90도(우측, 확실권)
    if (grade === "확실권") {
        const ratio = progress(myMultiple, 0, sureMultiple);
        return 90 - (ratio * 45);
    }
    if (grade === "유력권") {
        return 45 - 45 * progress(myMultiple, sureMultiple, likelyMultiple);
    }
    if (grade === "가능권") {
        const pos = progress(myMultiple, likelyMultiple, passMultiple);
        return 0 - (pos * 45);
    }
    if (grade === "도전권") {
        const overRatio = Math.min((myMultiple - passMultiple) / passMultiple, 1.0);
        return -45 - (overRatio * 45);
    }
    return -90;
}

/** 예측 등급 → 게이지 메시지 */
function getGaugeMessage(grade: string, myMultiple: number): { title: string; subtitle: string } {
    if (grade === "확실권") {
        if (myMultiple <= 0.5) return { title: "합격 확실권", subtitle: "상위권 내 매우 안정적인 위치입니다." };
        return { title: "합격 확실권", subtitle: "표본 신뢰도를 반영한 보수적인 안전 구간입니다." };
    }
    if (grade === "유력권") return { title: "합격 유력권", subtitle: "합격 가능성이 높지만 변동 가능성이 있습니다." };
    if (grade === "가능권") return { title: "합격 가능권", subtitle: "합격 배수 근접, 추가 참여자에 따라 변동됩니다." };
    if (grade === "도전권") return { title: "합격 도전권", subtitle: "합격배수를 초과했지만 변동 가능성이 있습니다." };
    return { title: "도전이 필요합니다", subtitle: "현재 기준 합격 가능성이 낮습니다." };
}

/** 예측 등급 → 게이지 타이틀 색상 */
function getGaugeTitleColor(grade: string): string {
    if (grade === "확실권") return "text-blue-800";
    if (grade === "유력권") return "text-blue-600";
    if (grade === "가능권") return "text-cyan-600";
    if (grade === "도전권") return "text-slate-600";
    return "text-slate-500";
}

export default function PredictionLiveDashboard({
    prediction,
    serviceName,
}: {
    prediction: PredictionDashboardPayload;
    /** 테넌트 표시명(경찰·소방). 공용 컴포넌트이므로 호출부가 반드시 지정한다. */
    serviceName: string;
}) {
    const { summary, pyramid } = prediction;

    const viewData = {
        region: `${summary.examTypeLabel} - ${summary.regionName}`,
        myScore: summary.myScore,
        participationRate: summary.sampleCoverageRate,
        participants: summary.totalParticipants,
        totalApplicants: summary.applicantCount ?? summary.estimatedApplicants,
        hasApplicantCount: summary.isApplicantCountExact,
        competitionRate: summary.applicantCount !== null && summary.recruitCount > 0
            ? Number((summary.applicantCount / summary.recruitCount).toFixed(1))
            : null,
        recruitment: summary.recruitCount,
        myRatio: Number((summary.myMultiple ?? 0).toFixed(2)),
        cutRatio: Number(summary.passMultiple.toFixed(2)),
        myRank: summary.myRank,
        myStatus: summary.predictionGrade ?? "등급 미제공",
    };

    const confidence = getConfidenceLevel(summary.sampleStage);
    const visibleTopPercent = calculateSampleTopPercent(viewData.myRank, viewData.participants);
    const gaugeAngle = getGaugeAngle(
        viewData.myStatus,
        viewData.myRatio,
        summary.sureMultiple ?? 0,
        summary.likelyMultiple ?? 0,
        viewData.cutRatio
    );
    const gaugeMsg = getGaugeMessage(viewData.myStatus, viewData.myRatio);
    const gaugeTitleColor = getGaugeTitleColor(viewData.myStatus);

    const statusData: StatusData[] = pyramid.levels.slice().reverse().map((level) => {
        const ratio = summary.totalParticipants > 0 ? (level.count / summary.totalParticipants) * 100 : 0;
        let color = "bg-slate-200";
        let fill = "var(--chart-grid)";
        if (level.key === "sure") { color = "bg-[var(--predict-safe)]"; fill = "var(--predict-safe)"; }
        if (level.key === "likely") { color = "bg-[var(--predict-likely)]"; fill = "var(--predict-likely)"; }
        if (level.key === "possible") { color = "bg-[var(--predict-possible)]"; fill = "var(--predict-possible)"; }
        if (level.key === "challenge") { color = "bg-[var(--predict-challenge)]"; fill = "var(--predict-challenge)"; }

        const isCollectingLevel = level.minScore === null && level.count === 0;
        const status = isCollectingLevel ? "집계 중..." : (level.minScore === null ? "점수 하한 없음" : `${level.minScore.toFixed(2)}점↑`);

        let ratioText = "";
        if (level.maxMultiple === null) {
            ratioText = `${level.minMultiple?.toFixed(2) ?? "-"}배 초과`;
        } else {
            ratioText = `${level.minMultiple === null ? "0.00" : level.minMultiple.toFixed(2)}~${level.maxMultiple.toFixed(2)}배`;
        }

        return {
            label: level.label,
            ratio: ratioText,
            count: level.count,
            percent: ratio,
            color,
            fill,
            status,
        };
    });

    const [animatedScore, setAnimatedScore] = useState(0);
    const [animatedCount, setAnimatedCount] = useState(0);

    // 1. Odometer Animation Effect
    useEffect(() => {
        const duration = 1500;
        const frames = 60;
        let currentFrame = 0;

        const interval = setInterval(() => {
            currentFrame++;
            const progress = currentFrame / frames;
            const easeOutQuad = 1 - (1 - progress) * (1 - progress);

            setAnimatedScore(Number((viewData.myScore * easeOutQuad).toFixed(2)));
            setAnimatedCount(Math.round(viewData.participants * easeOutQuad));

            if (currentFrame >= frames) {
                clearInterval(interval);
                setAnimatedScore(viewData.myScore);
                setAnimatedCount(viewData.participants);
            }
        }, duration / frames);

        return () => clearInterval(interval);
    }, [viewData.myScore, viewData.participants]);

    if (summary.gradeAvailability === "UNAVAILABLE") {
        const sampleTopPercent = calculateSampleTopPercent(summary.myRank, summary.totalParticipants);
        const reasonText = summary.unavailableReasons?.includes("MISSING_APPLICANTS")
            ? "출원인원이 확정되지 않았고 예측 모델의 실측 보정도 완료되지 않아 등급을 표시하지 않습니다."
            : summary.unavailableReasons?.includes("INSUFFICIENT_SAMPLE")
                ? "현재 표본으로는 합격 등급을 신뢰성 있게 산출할 수 없어 표본 내 순위만 제공합니다."
                : "지역별 실측 보정이 끝나기 전까지 합격 등급은 제공하지 않습니다.";

        return (
            <div className="w-full space-y-6 font-sans">
                <div className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-semibold text-slate-500">{summary.examName}</span>
                        <h1 className="text-lg font-bold text-slate-800">{viewData.region} 실시간 분석</h1>
                    </div>
                    <div className="flex items-center text-[11px] text-slate-400">
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {new Date(prediction.updatedAt).toLocaleString("ko-KR")}
                    </div>
                </div>

                <section className="rounded-xl border border-service-200 bg-white p-6">
                    <div className="flex items-start gap-3">
                        <Info className="mt-0.5 h-5 w-5 shrink-0 text-service-600" />
                        <div>
                            <h2 className="font-bold text-slate-900">표본 순위를 중심으로 안내합니다</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{reasonText}</p>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-medium text-slate-500">내 점수</p>
                            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{animatedScore.toFixed(2)}점</p>
                        </div>
                        <div className="rounded-xl border border-service-200 bg-service-50 p-4">
                            <p className="text-xs font-medium text-service-700">표본 내 순위</p>
                            <p className="mt-2 text-2xl font-black tabular-nums text-service-800">{summary.myRank}등</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-medium text-slate-500">표본 내 위치</p>
                            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
                                {sampleTopPercent === null ? "표본 축적 중" : `상위 ${sampleTopPercent.toFixed(1)}%`}
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-medium text-slate-500">유효 입력자</p>
                            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{animatedCount.toLocaleString("ko-KR")}명</p>
                        </div>
                    </div>

                    <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <Target className="mt-0.5 h-5 w-5 shrink-0 text-service-600" />
                        <div className="text-sm text-slate-700">
                            <p className="font-semibold">{serviceName} 필기 합격자 선발 기준: 모집인원 × {summary.passMultiple.toFixed(0)}배수</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                                이는 실제 응시자 전체에 적용되는 제도 정보입니다. 현재 입력자 표본 순위와 직접 계산하지 않습니다.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="w-full font-sans space-y-6">

            {/* 1. Header: 시험명 + 지역 + LIVE 배지 + 갱신시각 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                    {summary && (
                        <span className="text-xs font-semibold text-slate-500">
                            {summary.examName}
                        </span>
                    )}
                    <h1 className="text-lg font-bold text-slate-800">
                        {viewData.region} 실시간 분석
                    </h1>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    {prediction.updatedAt && (
                        <span className="text-[11px] text-slate-400 flex items-center">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5" />
                            {new Date(prediction.updatedAt).toLocaleString("ko-KR", {
                                month: "2-digit", day: "2-digit",
                                hour: "2-digit", minute: "2-digit", second: "2-digit",
                                hour12: false,
                            })}
                        </span>
                    )}
                    <div className="flex items-center px-3 py-1 bg-red-50 text-red-600 rounded-full font-bold text-xs border border-red-100">
                        <Radio className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
                        <span className="animate-pulse">LIVE</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Column: 등수 중심 요약 카드 */}
                <div className="lg:col-span-4 flex flex-col">
                    <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col h-full gap-5">

                        {/* 히어로: 내 등수 */}
                        <div className="text-center">
                            <p className="text-xs font-medium text-slate-400 mb-1">현재 내 등수</p>
                            <div className="flex items-baseline justify-center gap-1.5">
                                <span className="text-5xl font-black text-slate-900 tabular-nums tracking-tight">
                                    {viewData.myRank}
                                </span>
                                <span className="text-lg font-bold text-slate-400">등</span>
                                <span className="text-sm text-slate-400 ml-1">/ {animatedCount}명</span>
                            </div>
                            <div className="flex items-center justify-center gap-2 mt-2">
                                <span className={`px-2.5 py-1 text-white rounded-md font-bold text-xs ${viewData.myStatus === "확실권" ? "bg-[var(--predict-safe)]" :
                                    viewData.myStatus === "유력권" ? "bg-[var(--predict-likely)]" :
                                        viewData.myStatus === "가능권" ? "bg-[var(--predict-possible)]" :
                                            viewData.myStatus === "도전권" ? "bg-[var(--predict-challenge)]" : "bg-slate-400"
                                    }`}>
                                    {viewData.myStatus}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${confidence.badgeClass}`}>
                                    {confidence.label}
                                </span>
                            </div>
                        </div>

                        {/* 표본 내부에서 완결되는 순위 정보 */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-medium text-slate-500">표본 내 위치</span>
                                <span className="text-sm font-bold tabular-nums text-service-700">
                                    {visibleTopPercent === null
                                        ? "유효 입력자 15명부터 표시"
                                        : `상위 ${visibleTopPercent.toFixed(1)}%`}
                                </span>
                            </div>
                            <div className="relative w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-service-600"
                                    style={{ width: `${visibleTopPercent ?? 0}%` }}
                                />
                            </div>
                            <div className="flex justify-between mt-1.5 text-[10px] text-slate-400 tabular-nums">
                                <span>1등</span>
                                <span>{viewData.participants.toLocaleString("ko-KR")}명</span>
                            </div>
                        </div>

                        {/* 핵심 숫자 3개 카드 */}
                        <div className="grid grid-cols-3 gap-2.5">
                            <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-medium mb-0.5">내 점수</p>
                                <p className="text-base font-bold text-slate-700 tabular-nums">{animatedScore.toFixed(2)}</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-medium mb-0.5">표본 상위</p>
                                <p className="text-base font-bold text-service-700 tabular-nums">
                                    {visibleTopPercent === null ? "축적 중" : `${visibleTopPercent.toFixed(1)}%`}
                                </p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-medium mb-0.5">제도 기준</p>
                                <p className="text-base font-bold text-slate-700 tabular-nums">{viewData.cutRatio}배수</p>
                            </div>
                        </div>

                        {/* 모집/응시/경쟁률/참여 정보 */}
                        <div className="grid grid-cols-4 gap-2">
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-medium">모집인원</p>
                                <p className="text-sm font-bold text-slate-700">{viewData.recruitment}명</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-medium">접수인원</p>
                                <p className="text-sm font-bold text-slate-700">
                                    {!viewData.hasApplicantCount
                                        ? "미입력"
                                        : `${viewData.totalApplicants.toLocaleString()}명`}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-medium">경쟁률</p>
                                <p className="text-sm font-bold text-slate-700">
                                    {viewData.competitionRate !== null
                                        ? `${viewData.competitionRate} : 1`
                                        : "미입력"}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-service-500 font-medium">참여인원</p>
                                <p className="text-sm font-bold text-service-700">{animatedCount}명</p>
                            </div>
                        </div>

                        {/* 참여율 바 */}
                        <div className="mt-auto">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-500">참여율</span>
                                <span className="font-semibold text-slate-600">{viewData.participationRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-service-500 h-1.5 rounded-full transition-all duration-1000 ease-out"
                                    style={{ width: `${Math.min(viewData.participationRate, 100)}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">{confidence.message}</p>
                        </div>

                    </div>
                </div>

                {/* Right Column: Detailed Analysis & Visualization */}
                <div className="lg:col-span-8 flex flex-col gap-6">

                    {/* Top Row: Gauge & Battleground */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                        {/* 2. 당선 유력 미터기 (Gauge Chart) */}
                        <div className="bg-white rounded-xl p-6 border border-slate-200 flex flex-col items-center overflow-hidden h-full">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center self-start mb-4">
                                <Target className="w-5 h-5 mr-2 text-service-600" />
                                나의 합격예측
                            </h3>

                            <div className="w-full flex-1 flex flex-col justify-end relative pb-4">
                                <div className="w-full h-[220px] relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { value: 1, fill: "var(--predict-challenge)" },
                                                    { value: 1, fill: "var(--predict-possible)" },
                                                    { value: 1, fill: "var(--predict-likely)" },
                                                    { value: 1, fill: "var(--predict-safe)" },
                                                ]}
                                                cx="50%"
                                                cy="100%"
                                                startAngle={180}
                                                endAngle={0}
                                                innerRadius="65%"
                                                outerRadius="100%"
                                                paddingAngle={3}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {[...Array(4)].map((_, index) => (
                                                    <Cell key={`cell-${index}`} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>

                                    {/* Needle (CSS Animation) — 동적 각도 */}
                                    <div
                                        className="absolute bottom-0 left-1/2 w-1.5 h-[90%] bg-slate-800 origin-bottom transform translate-x-[-50%] rounded-full z-10 transition-transform duration-1000 ease-out"
                                        style={{ transform: `translateX(-50%) rotate(${gaugeAngle}deg)` }}
                                    >
                                        <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-slate-800 rounded-full border-[3px] border-white"></div>
                                        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-6 h-6 bg-slate-800 rounded-full"></div>
                                    </div>

                                    {/* Labels outside Gauge curve */}
                                    <div className="absolute inset-0 pointer-events-none">
                                        <div className="absolute bottom-2 left-1 text-[11px] font-bold text-[var(--predict-challenge)]">도전권</div>
                                        <div className="absolute top-[28%] left-[21%] text-[11px] font-bold text-[var(--predict-possible)]">가능권</div>
                                        <div className="absolute top-[28%] right-[21%] text-[11px] font-bold text-[var(--predict-likely)]">유력권</div>
                                        <div className="absolute bottom-2 right-1 text-[11px] font-bold text-[var(--predict-safe)]">확실권</div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 text-center z-10 bg-white">
                                <p className={`text-2xl font-black tracking-tight ${gaugeTitleColor}`}>{gaugeMsg.title}</p>
                                <p className="text-xs text-slate-500 mt-1">{gaugeMsg.subtitle}</p>
                            </div>
                        </div>

                        {/* 3. 서버 모델이 계산한 예측 구간 경계 */}
                        <div className="bg-gradient-to-br from-service-600 to-service-800 rounded-xl p-6 border border-service-500 text-white relative h-full flex flex-col justify-center">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <ZoomIn className="w-24 h-24 text-white" />
                            </div>
                            <h3 className="text-lg font-bold text-white flex items-center mb-6 relative z-10 w-full pl-2">
                                <Activity className="w-5 h-5 mr-2 text-service-200" />
                                예측 구간 경계
                            </h3>

                            <div className="space-y-4 relative z-10">
                                <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-emerald-200 font-bold text-sm">
                                            확실
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-emerald-100">합격 확실권 경계</p>
                                            <p className="text-xs text-service-100">
                                                {(summary.sureMaxRank ?? 0) > 0 ? `${summary.sureMaxRank}등 이내` : "표본 수집 중 · 현재 미표시"}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-white rounded-xl shadow-lg ring-2 ring-white/50 transform scale-105 relative z-20">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-3 h-3 rounded-full bg-service-600 animate-pulse"></div>
                                        <div>
                                            <p className="text-sm font-black text-service-900">나의 현재 위치</p>
                                            <p className="text-xs font-semibold text-service-600">
                                                {summary.myRank}등 · {summary.predictionGrade}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-xl font-bold text-service-900 tabular-nums">
                                        {animatedScore.toFixed(2)}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-rose-200 font-bold text-sm">
                                            가능
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-rose-100">필기 합격 가능권 경계</p>
                                            <p className="text-xs text-service-100">{summary.passCount}등 이내 · {summary.passMultiple.toFixed(2)}배수</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <p className="text-[11px] text-service-200 mt-6 text-center font-medium opacity-80">
                                * 유력권 경계 {(summary.likelyMaxRank ?? 0) > 0 ? `${summary.likelyMaxRank}등` : "집계 중"} · 표본 변동 시 실시간 반영
                            </p>
                        </div>
                    </div>
                </div>

                {/* Bottom Row: 합격예측 현황 리스트 (Full Width spanning 12 cols now) */}
                <div className="lg:col-span-12">
                    <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                            <Users className="w-5 h-5 mr-2 text-slate-500" />
                            참여자 합격예측 분포
                        </h3>

                        {/* Stacked Bar */}
                        <div className="w-full h-12 flex rounded-lg overflow-hidden mb-6 relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-[200%] animate-[shimmer_2s_infinite]"></div>
                            {statusData.filter((d) => d.count > 0).map((d, i: number) => (
                                <div
                                    key={i}
                                    className={`${d.color} h-full flex items-center justify-center border-r border-white/20 transition-all duration-500 ease-in-out`}
                                    style={{ width: `${d.percent}%` }}
                                    title={`${d.label} ${d.count}명 (${d.percent.toFixed(1)}%)`}
                                >
                                    <div className="text-center">
                                        <span className="block text-[10px] font-bold text-white/90">{d.label}</span>
                                        <span className="block text-xs font-black text-white">{d.count}명</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* List */}
                        <div className="space-y-1">
                            {statusData.slice().reverse().map((d, i: number) => {
                                const isMe = d.label === viewData.myStatus;
                                return (
                                    <div key={i} className={`flex items-center py-3 px-4 rounded-xl transition-colors ${isMe ? 'bg-blue-50/80 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}>
                                        <div className="w-24">
                                            <span className={`text-sm font-bold ${isMe ? 'text-blue-800' : 'text-slate-700'}`}>
                                                {d.label}
                                            </span>
                                        </div>
                                        <div className="w-24 text-xs text-slate-400 font-medium">
                                            {d.status}
                                        </div>
                                        <div className="w-32 text-xs text-slate-500 tabular-nums">
                                            {d.ratio}
                                        </div>
                                        <div className="w-32 text-sm font-bold text-slate-800 tabular-nums">
                                            {d.count}명 <span className="text-slate-400 font-normal text-xs">({d.percent.toFixed(1)}%)</span>
                                        </div>
                                        <div className="flex-1 flex items-center relative">
                                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden ring-1 ring-inset ring-slate-200/50">
                                                <div
                                                    className={`h-1.5 rounded-full ${d.color}`}
                                                    style={{ width: `${d.percent}%` }}
                                                ></div>
                                            </div>
                                            {isMe && (
                                                <div className="absolute -right-6 text-xs font-bold text-blue-600 animate-bounce flex items-center">
                                                    <span className="mr-1">←</span> 나
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 면책 안내 문구 */}
                        <div className="mt-6 flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                            <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="text-xs text-slate-500 leading-relaxed">
                                <p>
                                    본 분포는 <strong className="text-slate-600">서비스 참여자 {viewData.participants.toLocaleString()}명 기준</strong>이며,
                                    {!viewData.hasApplicantCount
                                        ? " 응시인원 미입력 상태입니다."
                                        : ` 실제 응시인원(${viewData.totalApplicants.toLocaleString()}명) 전체의 성적 분포와 다를 수 있습니다.`}
                                </p>
                                <p className="mt-1">
                                    일반적으로 합격 가능성이 높은 응시자의 참여율이 높아, 상위권 비율이 실제보다 높게 나타나는 경향이 있습니다.
                                </p>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes shimmer {
          100% { transform: translateX(-50%); }
        }
      `}} />
        </div >
    );
}

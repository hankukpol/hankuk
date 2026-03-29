"use client";

import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Activity, Users, Target, ZoomIn, Radio, Info } from "lucide-react";

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
    totalParticipants: number;
    recruitCount: number;
    myMultiple: number;
    passMultiple: number;
    myRank: number;
    predictionGrade: string;
}

interface PredictionPyramidLevel {
    key: "sure" | "likely" | "possible" | "challenge" | "belowChallenge";
    label: string;
    count: number;
    minScore: number | null;
    maxMultiple: number | null;
    minMultiple: number | null;
}

interface PredictionDashboardPayload {
    summary?: PredictionSummaryView;
    pyramid?: {
        levels: PredictionPyramidLevel[];
    };
    updatedAt?: string;
}

/** 참여율 기반 신뢰도 판정 */
function getConfidenceLevel(rate: number): {
    label: string;
    message: string;
    badgeClass: string;
} {
    if (rate >= 30)
        return {
            label: "신뢰도 높음",
            message: "충분한 참여자가 모여 신뢰도가 높습니다.",
            badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
        };
    if (rate >= 15)
        return {
            label: "집계 중",
            message: "어느 정도 신뢰할 수 있는 데이터입니다. 참여자가 늘면 순위가 변동될 수 있습니다.",
            badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
        };
    if (rate >= 5)
        return {
            label: "데이터 수집 중",
            message: "아직 참여자가 적어 순위 변동 가능성이 큽니다.",
            badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
        };
    return {
        label: "초기 집계",
        message: "초기 데이터입니다. 참여자 수가 적어 순위가 크게 변동될 수 있습니다.",
        badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    };
}

/** 예측 등급 → 게이지 바늘 각도 (-90도=위험, 0도=경합, +90도=안정) */
function getGaugeAngle(grade: string, myMultiple: number, passMultiple: number): number {
    // 반원 게이지: -90도(좌측, 위험) ~ +90도(우측, 안정)
    // 배수가 낮을수록(1배수 이내) 안정 → 우측(+90 방향)
    // 배수가 높을수록(합격배수 초과) 위험 → 좌측(-90 방향)
    if (grade === "확실권") {
        // 0.0~1.0배: 90도(최안정) ~ 54도
        const ratio = Math.min(myMultiple / 1.0, 1.0);
        return 90 - (ratio * 36); // 90 → 54
    }
    if (grade === "유력권") {
        // 1.0~likelyMax: 54도 ~ 18도
        return 54 - 36 * Math.min((myMultiple - 1.0) / 0.2, 1.0);
    }
    if (grade === "가능권") {
        // 18도 ~ -18도
        const range = passMultiple - 1.2;
        const pos = range > 0 ? Math.min((myMultiple - 1.2) / range, 1.0) : 0.5;
        return 18 - (pos * 36);
    }
    if (grade === "도전권") {
        // -18도 ~ -54도
        const overRatio = Math.min((myMultiple - passMultiple) / passMultiple, 1.0);
        return -18 - (overRatio * 36);
    }
    // 도전권 이하
    return -72;
}

/** 예측 등급 → 게이지 메시지 */
function getGaugeMessage(grade: string, myMultiple: number): { title: string; subtitle: string } {
    if (grade === "확실권") {
        if (myMultiple <= 0.5) return { title: "확실권 진입 완료!", subtitle: "상위권 내 매우 안정적인 위치입니다." };
        return { title: "확실권 진입 완료!", subtitle: "1배수 이내의 안정적인 점수입니다." };
    }
    if (grade === "유력권") return { title: "합격 유력!", subtitle: "합격 가능성이 높지만 변동 가능성이 있습니다." };
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

const fallbackStatusData: StatusData[] = [
    { label: "도전권 이하", ratio: "2.21배 초과", count: 0, percent: 0, color: "bg-gray-200", fill: "#e5e7eb", status: "기준점수 미만" },
    { label: "도전권", ratio: "1.70~2.21배", count: 0, percent: 0, color: "bg-gray-400", fill: "#9ca3af", status: "집계 중..." },
    { label: "가능권", ratio: "1.20~1.70배", count: 0, percent: 0, color: "bg-teal-400", fill: "#2dd4bf", status: "집계 중..." },
    { label: "유력권", ratio: "1.00~1.20배", count: 0, percent: 0, color: "bg-blue-400", fill: "#60a5fa", status: "집계 중..." },
    { label: "확실권", ratio: "0~1.00배", count: 38, percent: 100, color: "bg-blue-800", fill: "#1e40af", status: "집계 중..." },
];

const fallbackMockData = {
    region: "공채 - 대구",
    myScore: 117.20,
    participationRate: 2.1,
    participants: 38,
    totalApplicants: 1840,
    recruitment: 92,
    myRatio: 0.41,
    cutRatio: 1.7,
    myRank: 38,
    myStatus: "확실권",
};

export default function PredictionLiveDashboard({ prediction }: { prediction?: PredictionDashboardPayload }) {
    const summary = prediction?.summary;
    const pyramid = prediction?.pyramid;

    const mockData = summary ? {
        region: `${summary.examTypeLabel} - ${summary.regionName}`,
        myScore: summary.myScore,
        participationRate: summary.applicantCount && summary.applicantCount > 0 ? Number(((summary.totalParticipants / summary.applicantCount) * 100).toFixed(1)) : 0,
        participants: summary.totalParticipants,
        totalApplicants: summary.applicantCount ?? 0,
        hasApplicantCount: summary.applicantCount !== null,
        competitionRate: summary.applicantCount !== null && summary.recruitCount > 0
            ? Number((summary.applicantCount / summary.recruitCount).toFixed(1))
            : null,
        recruitment: summary.recruitCount,
        myRatio: Number(summary.myMultiple.toFixed(2)),
        cutRatio: Number(summary.passMultiple.toFixed(2)),
        myRank: summary.myRank,
        myStatus: summary.predictionGrade,
    } : fallbackMockData;

    const confidence = getConfidenceLevel(mockData.participationRate);
    const gaugeAngle = getGaugeAngle(mockData.myStatus, mockData.myRatio, mockData.cutRatio);
    const gaugeMsg = getGaugeMessage(mockData.myStatus, mockData.myRatio);
    const gaugeTitleColor = getGaugeTitleColor(mockData.myStatus);

    // 합격컷 등수 = ceil(모집인원 × 합격배수)
    const passRank = Math.ceil(mockData.recruitment * mockData.cutRatio);
    // 1배수 등수 = 모집인원
    const oneMultipleRank = mockData.recruitment;
    // 여유 등수 (양수=합격권 내 여유, 음수=합격컷 초과)
    const marginRank = passRank - mockData.myRank;

    const statusData: StatusData[] = pyramid ? pyramid.levels.slice().reverse().map((level) => {
        const ratio = summary && summary.totalParticipants > 0 ? (level.count / summary.totalParticipants) * 100 : 0;
        let color = "bg-gray-200";
        let fill = "#e5e7eb";
        if (level.key === "sure") { color = "bg-blue-800"; fill = "#1e40af"; }
        if (level.key === "likely") { color = "bg-blue-400"; fill = "#60a5fa"; }
        if (level.key === "possible") { color = "bg-teal-400"; fill = "#2dd4bf"; }
        if (level.key === "challenge") { color = "bg-gray-400"; fill = "#9ca3af"; }

        const isCollectingLevel = level.key !== "belowChallenge" && level.minScore === null;
        const status = isCollectingLevel ? "집계 중..." : (level.minScore === null ? "기준점수 미만" : `${level.minScore.toFixed(2)}점↑`);

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
    }) : fallbackStatusData;

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

            setAnimatedScore(Number((mockData.myScore * easeOutQuad).toFixed(2)));
            setAnimatedCount(Math.round(mockData.participants * easeOutQuad));

            if (currentFrame >= frames) {
                clearInterval(interval);
                setAnimatedScore(mockData.myScore);
                setAnimatedCount(mockData.participants);
            }
        }, duration / frames);

        return () => clearInterval(interval);
    }, [mockData.myScore, mockData.participants]);

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
                        {mockData.region} 실시간 분석
                    </h1>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    {prediction?.updatedAt && (
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
                                    {mockData.myRank}
                                </span>
                                <span className="text-lg font-bold text-slate-400">등</span>
                                <span className="text-sm text-slate-400 ml-1">/ {animatedCount}명</span>
                            </div>
                            <div className="flex items-center justify-center gap-2 mt-2">
                                <span className={`px-2.5 py-1 text-white rounded-md font-bold text-xs ${mockData.myStatus === "확실권" ? "bg-blue-800" :
                                    mockData.myStatus === "유력권" ? "bg-blue-600" :
                                        mockData.myStatus === "가능권" ? "bg-cyan-600" :
                                            mockData.myStatus === "도전권" ? "bg-slate-500" : "bg-slate-400"
                                    }`}>
                                    {mockData.myStatus}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${confidence.badgeClass}`}>
                                    {confidence.label}
                                </span>
                            </div>
                        </div>

                        {/* 합격컷 대비 프로그레스 */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-medium text-slate-500">합격컷까지</span>
                                <span className={`text-sm font-bold tabular-nums ${marginRank >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                                    {marginRank >= 0 ? `${marginRank}등 여유` : `${Math.abs(marginRank)}등 초과`}
                                </span>
                            </div>
                            {/* 트랙바: 1등 ~ 합격컷(passRank) 구간 내 위치 */}
                            <div className="relative w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                                {/* 1배수 영역 */}
                                <div
                                    className="absolute left-0 top-0 h-full bg-blue-800 rounded-l-full"
                                    style={{ width: `${Math.min((oneMultipleRank / passRank) * 100, 100)}%` }}
                                />
                                {/* 1배수~합격배수 영역 */}
                                <div
                                    className="absolute top-0 h-full bg-blue-400"
                                    style={{
                                        left: `${(oneMultipleRank / passRank) * 100}%`,
                                        width: `${100 - (oneMultipleRank / passRank) * 100}%`,
                                    }}
                                />
                                {/* 내 위치 마커 */}
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-[3px] border-blue-600 rounded-full z-10 transition-all duration-1000"
                                    style={{ left: `clamp(0%, ${(mockData.myRank / passRank) * 100}%, 100%)`, transform: 'translate(-50%, -50%)' }}
                                />
                            </div>
                            <div className="flex justify-between mt-1.5 text-[10px] text-slate-400 tabular-nums">
                                <span>1등</span>
                                <span>{oneMultipleRank}등 (1배수)</span>
                                <span>{passRank}등 (합격컷)</span>
                            </div>
                        </div>

                        {/* 핵심 숫자 3개 카드 */}
                        <div className="grid grid-cols-3 gap-2.5">
                            <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-medium mb-0.5">내 점수</p>
                                <p className="text-base font-bold text-slate-700 tabular-nums">{animatedScore.toFixed(2)}</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-medium mb-0.5">내 배수</p>
                                <p className="text-base font-bold text-blue-700 tabular-nums">{mockData.myRatio}배</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-medium mb-0.5">합격배수</p>
                                <p className="text-base font-bold text-slate-700 tabular-nums">{mockData.cutRatio}배</p>
                            </div>
                        </div>

                        {/* 모집/응시/경쟁률/참여 정보 */}
                        <div className="grid grid-cols-4 gap-2">
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-medium">모집인원</p>
                                <p className="text-sm font-bold text-slate-700">{mockData.recruitment}명</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-medium">접수인원</p>
                                <p className="text-sm font-bold text-slate-700">
                                    {("hasApplicantCount" in mockData && !mockData.hasApplicantCount)
                                        ? "미입력"
                                        : `${mockData.totalApplicants.toLocaleString()}명`}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-medium">경쟁률</p>
                                <p className="text-sm font-bold text-slate-700">
                                    {("competitionRate" in mockData && mockData.competitionRate !== null)
                                        ? `${mockData.competitionRate} : 1`
                                        : "미입력"}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-blue-500 font-medium">참여인원</p>
                                <p className="text-sm font-bold text-blue-700">{animatedCount}명</p>
                            </div>
                        </div>

                        {/* 참여율 바 */}
                        <div className="mt-auto">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-500">참여율</span>
                                <span className="font-semibold text-slate-600">{mockData.participationRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000 ease-out"
                                    style={{ width: `${Math.min(mockData.participationRate, 100)}%` }}
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
                                <Target className="w-5 h-5 mr-2 text-blue-600" />
                                나의 합격예측
                            </h3>

                            <div className="w-full flex-1 flex flex-col justify-end relative pb-4">
                                <div className="w-full h-[220px] relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { value: 1, fill: "#cbd5e1" },
                                                    { value: 1, fill: "#94a3b8" },
                                                    { value: 1, fill: "#34d399" },
                                                    { value: 1, fill: "#60a5fa" },
                                                    { value: 1, fill: "#2563eb" },
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
                                                {[...Array(5)].map((_, index) => (
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
                                        <div className="absolute bottom-2 left-1 text-[11px] font-bold text-slate-400">도전이하</div>
                                        <div className="absolute top-[44%] left-[12%] text-[11px] font-bold text-slate-500">도전권</div>
                                        <div className="absolute top-[20%] left-1/2 transform -translate-x-1/2 text-[11px] font-bold text-emerald-500">가능권</div>
                                        <div className="absolute top-[44%] right-[12%] text-[11px] font-bold text-blue-500">유력권</div>
                                        <div className="absolute bottom-2 right-1 text-[11px] font-bold text-blue-700">확실권</div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 text-center z-10 bg-white">
                                <p className={`text-2xl font-black tracking-tight ${gaugeTitleColor}`}>{gaugeMsg.title}</p>
                                <p className="text-xs text-slate-500 mt-1">{gaugeMsg.subtitle}</p>
                            </div>
                        </div>

                        {/* 3. 초박빙 경합지역 줌인 (Battleground Zoom-in) */}
                        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 border border-blue-500 text-white relative h-full flex flex-col justify-center">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <ZoomIn className="w-24 h-24 text-white" />
                            </div>
                            <h3 className="text-lg font-bold text-white flex items-center mb-6 relative z-10 w-full pl-2">
                                <Activity className="w-5 h-5 mr-2 text-blue-200" />
                                1배수 컷라인 초박빙 경합지역
                            </h3>

                            <div className="space-y-4 relative z-10">
                                <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-emerald-200 font-bold text-sm">
                                            ↑2
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-emerald-100">가능권 추격 그룹</p>
                                            <p className="text-xs text-blue-100">내 앞 0.15점 차이 (2명)</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-white rounded-xl shadow-lg ring-2 ring-white/50 transform scale-105 relative z-20">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse"></div>
                                        <div>
                                            <p className="text-sm font-black text-blue-900">나의 현재 위치</p>
                                            <p className="text-xs font-semibold text-blue-600">1배수 내 안정권 수성 집중</p>
                                        </div>
                                    </div>
                                    <div className="text-xl font-bold text-blue-900 tabular-nums">
                                        {animatedScore.toFixed(2)}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-rose-200 font-bold text-sm">
                                            ↓3
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-rose-100">유력권 진입 대기</p>
                                            <p className="text-xs text-blue-100">내 뒤 0.40점 차이 (3명)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <p className="text-[11px] text-blue-200 mt-6 text-center font-medium opacity-80">
                                * 1배수(92등) 부근 표본 변동 시 실시간 반영됩니다.
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
                            {statusData.map((d, i: number) => (
                                <div
                                    key={i}
                                    className={`${d.color} h-full flex items-center justify-center border-r border-white/20 transition-all duration-500 ease-in-out`}
                                    style={{ width: d.count > 0 ? '100%' : '15%' }} // Mock visual sizing since all except one is 0
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
                                const isMe = d.label === mockData.myStatus;
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
                                    본 분포는 <strong className="text-slate-600">서비스 참여자 {mockData.participants.toLocaleString()}명 기준</strong>이며,
                                    {("hasApplicantCount" in mockData && !mockData.hasApplicantCount)
                                        ? " 응시인원 미입력 상태입니다."
                                        : ` 실제 응시인원(${mockData.totalApplicants.toLocaleString()}명) 전체의 성적 분포와 다를 수 있습니다.`}
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

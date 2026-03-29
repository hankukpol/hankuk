import React from "react";

interface ShareCardProps {
  examTitle: string;
  userName: string;
  examTypeLabel: string;
  regionName: string;
  finalScore: number;
  rank: number | null;
  totalParticipants: number | null;
  rankingBasisLabel?: string | null;
  predictionGrade?: string | null;
}

export default function ShareCard({
  examTitle,
  userName,
  examTypeLabel,
  regionName,
  finalScore,
  rank,
  totalParticipants,
  rankingBasisLabel,
  predictionGrade,
}: ShareCardProps) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "linear-gradient(145deg, #0b1f62 0%, #112b8a 35%, #1f4fa8 100%)",
        color: "#ffffff",
        padding: "56px",
        fontFamily: "Noto Sans KR, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 34, fontWeight: 800 }}>
          {"\ud569\uaca9\uc608\uce21 \uacb0\uacfc \uacf5\uc720"}
        </div>
        <div style={{ fontSize: 20, opacity: 0.9 }}>{examTitle}</div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "24px",
        }}
      >
        <div
          style={{
            flex: 1,
            borderRadius: "20px",
            background: "rgba(255,255,255,0.12)",
            padding: "28px",
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {`${userName}\ub2d8\uc758 \uacb0\uacfc`}
        </div>
        <div
          style={{
            flex: 1,
            borderRadius: "20px",
            background: "rgba(255,255,255,0.15)",
            padding: "28px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            fontSize: 26,
            fontWeight: 600,
          }}
        >
          <div>{`\uc720\ud615: ${examTypeLabel}`}</div>
          <div>{`\uc9c0\uc5ed: ${regionName}`}</div>
          <div>{`\ucd5c\uc885 \uc810\uc218: ${finalScore.toFixed(2)}\uc810`}</div>
          <div>
            {`\uc11d\ucc28: ${
              rank && totalParticipants
                ? `${rank.toLocaleString("ko-KR")} / ${totalParticipants.toLocaleString("ko-KR")}`
                : "-"
            }`}
          </div>
          <div>{`\uc21c\uc704 \uae30\uc900: ${rankingBasisLabel ?? "-"}`}</div>
          <div>{`\ud569\uaca9 \uc608\uce21: ${predictionGrade ?? "-"}`}</div>
        </div>
      </div>

      <div style={{ fontSize: 22, opacity: 0.9 }}>
        {"\uacb0\uacfc\ub97c \uacf5\uc720\ud558\uace0 \ud569\uaca9 \uac00\ub2a5\uc131\uc744 \ube44\uad50\ud574\ubcf4\uc138\uc694."}
      </div>
    </div>
  );
}

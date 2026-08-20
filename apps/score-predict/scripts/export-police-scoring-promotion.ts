import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeCustomHtmlDocument } from "../src/lib/promotions/custom-html";
import {
  buildPolice2026SecondScoringPromotionHtml,
  POLICE_2026_SECOND_SCORING_PRODUCTION_ASSET_BASE,
} from "../src/lib/promotions/police-2026-second-scoring";

async function main() {
  const outputDirectory = path.resolve(process.cwd(), ".local");
  const outputPath = path.join(
    outputDirectory,
    "police-2026-second-scoring-promotion.html",
  );
  const htmlDocument = sanitizeCustomHtmlDocument(
    buildPolice2026SecondScoringPromotionHtml(
      POLICE_2026_SECOND_SCORING_PRODUCTION_ASSET_BASE,
    ),
  );

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, htmlDocument, "utf8");

  console.log(`가채점 캠페인 HTML을 생성했습니다: ${outputPath}`);
  console.log(`HTML 길이: ${htmlDocument.length.toLocaleString("ko-KR")}자`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

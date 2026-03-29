# 소방 합격예측 프로그램 (`fire/`)
[![E2E Verification](https://github.com/hankukpol/fire_full_service/actions/workflows/e2e.yml/badge.svg)](https://github.com/hankukpol/fire_full_service/actions/workflows/e2e.yml)

Next.js + Prisma 湲곕컲 ?뚮갑怨듬Т??梨꾩슜?쒗뿕 ?⑷꺽?덉륫 ?쒕퉬??
寃쎌같 ?꾨줈?앺듃(`police/`)? **?꾩쟾??遺꾨━??* ?낅┰ ?꾨줈?앺듃?낅땲??

- **濡쒖뺄 ?쒕쾭**: http://localhost:3200
- **DB**: Supabase `iqhkmcxeuwueiqopkwfd` (?쒖슱)
- **愿由ъ옄**: `010-0000-0000` / `Admin2026!`

---

## 鍮좊Ⅸ ?쒖옉

```bash
# Windows: dev-start.bat ?붾툝?대┃
# ?먮뒗:
cd fire
npm run dev
```

---

## 梨꾩슜?좏삎 4醫?
| ExamType | ?쒓?紐?| ?깅퀎 | 臾명빆 | 留뚯젏 |
|----------|--------|------|------|------|
| `PUBLIC` | 怨듭콈 | ????遺꾨━ | 75臾명빆 | 300??|
| `CAREER_RESCUE` | 援ъ“ 寃쎌콈 | ?⑥옄留?| 65臾명빆 | 200??|
| `CAREER_ACADEMIC` | ?뚮갑?숆낵 寃쎌콈 | 吏??쭏???????묒꽦 | 65臾명빆 | 200??|
| `CAREER_EMT` | 援ш툒 寃쎌콈 | ????遺꾨━ | 65臾명빆 | 200??|

---

## 媛쒕컻 臾몄꽌

| 臾몄꽌 | ?댁슜 |
|------|------|
| [00_?뚮갑?쒗뿕_?꾩껜援ъ“_?댄빐.md](./docs/00_?뚮갑?쒗뿕_?꾩껜援ъ“_?댄빐.md) | **?꾨룆** ???쒗뿕 援ъ“, ?⑷꺽諛곗닔, 怨쇰씫, 媛?곗젏, ?쒕퉬???먮쫫 ?꾩껜 |
| [01_?뚮갑_?꾨줈?앺듃_媛쒖슂.md](./docs/01_?뚮갑_?꾨줈?앺듃_媛쒖슂.md) | ?꾨줈?앺듃 援ъ“, 湲곗닠?ㅽ깮, 寃쎌같怨쇱쓽 李⑥씠??|
| [02_?쒗뿕洹쒖젙_梨꾩젏濡쒖쭅.md](./docs/02_?쒗뿕洹쒖젙_梨꾩젏濡쒖쭅.md) | 怨쇰ぉ/諛곗젏/怨쇰씫/?⑷꺽諛곗닔/媛?곗젏 ?곸꽭 洹쒖젙 |
| [03_DB_?ㅽ궎留?諛??곗씠?곕え??md](./docs/03_DB_?ㅽ궎留?諛??곗씠?곕え??md) | Prisma ?ㅽ궎留? ?뚯씠釉??꾨뱶 ?ㅻ챸 |
| [04_?듭떖蹂寃쎌궗??寃쎌같to?뚮갑.md](./docs/04_?듭떖蹂寃쎌궗??寃쎌같to?뚮갑.md) | 寃쎌같?믪냼諛?蹂???댁슜, ?섏젙 ?뚯씪 紐⑸줉, 二쇱쓽?ы빆 |
| [05_媛쒕컻?섍꼍_?ㅼ젙_媛?대뱶.md](./docs/05_媛쒕컻?섍꼍_?ㅼ젙_媛?대뱶.md) | 濡쒖뺄 ?ㅽ뻾, DB ?ㅼ젙, ?몃윭釉붿뒋??|
| [DEPLOY_VERCEL_SUPABASE.md](./docs/DEPLOY_VERCEL_SUPABASE.md) | Vercel + Supabase 諛고룷 媛?대뱶 |

---

## ?듭떖 ?뚯씪

```
src/lib/scoring.ts        # 梨꾩젏 ?붿쭊
src/lib/prediction.ts     # ?⑷꺽?덉륫 ?붿쭊
src/lib/policy.ts         # ?뚮갑 ?뺤콉 ?곸닔 (怨쇰씫?? 媛?곗젏 ??
prisma/schema.prisma      # DB ?ㅽ궎留?prisma/seed.ts            # 珥덇린 ?곗씠??```






# 경찰 면접 모바일 수강증

Next.js + Supabase 기반의 경찰 면접 모바일 수강증 서비스입니다. 학생 조회, QR 스캔, 자료 배부, 관리자 설정 화면을 포함합니다.

## 현재 세팅 상태

- 기본 앱명과 Supabase 초기 시드를 `경찰 면접 모바일 수강증` 기준으로 정리했습니다.
- 기존 Vercel 로컬 링크는 제거해서 새 프로젝트에 다시 연결하도록 분리했습니다.
- `.env.local` 은 새 프로젝트 placeholder 로 초기화했습니다.

## 로컬 실행

1. `.env.local` 에 현재 연결 대상 또는 통합 계획에 맞는 Supabase 값과 시크릿을 입력합니다.
2. `npm install`
3. `npm run dev`

## 새 배포 절차

상세 절차는 `docs/DEPLOY_VERCEL_SUPABASE.md` 를 보면 됩니다.
> Migration note:
> This README may describe the current standalone app setup.
> For repository-wide architecture, Supabase strategy, Vercel strategy, and domain rules, always follow `D:\hankuk\AGENTS.md`.
> After monorepo migration, this app is expected to use the unified Supabase project and the shared subdomain/session strategy.

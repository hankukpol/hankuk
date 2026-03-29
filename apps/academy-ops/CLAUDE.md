# 한국경찰학원 통합관리 시스템 — 작업 가이드

## 프로젝트 구조

```text
/                    프로젝트 루트
├── prisma/          Prisma 스키마와 마이그레이션 관련 파일
├── public/          정적 자산
├── scripts/         검증/보조 스크립트
├── src/
│   ├── app/         Next.js App Router 페이지와 API
│   ├── components/  UI 컴포넌트
│   └── lib/         서비스 로직과 유틸리티
└── 개발계획/        PRD 문서 폴더 (수정 금지)
```

## 작업 전 필수 문서

1. `개발계획/00_개발공통룰.md`
2. `개발계획/01_마스터플랜.md`
3. 해당 기능 PRD

## 핵심 규칙

- 학생 4대 데이터 `examNumber`, `name`, `mobile`, `enrollments[]`를 항상 함께 본다.
- 학생명 또는 학번 클릭 시 `/admin/students/[examNumber]`로 이동한다.
- 관리자 인증은 `@/lib/auth`를 기준으로 처리한다.
- DB 접근은 Prisma ORM만 사용한다.
- `개발계획/` 내부 문서는 읽기 전용이다.

## 스키마/인프라 전담 파일

- `prisma/schema.prisma`
- `src/lib/auth.ts`
- `src/lib/prisma.ts`
- `src/components/ui/*`

이 파일들은 일반 기능 작업보다 더 신중하게 다룬다.

## 로컬 실행

```bash
pnpm run dev
```

## 기본 검증

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
```

## 학원 정보

- 학원명: 한국경찰학원
- 주소: 대구광역시 중구 중앙대로 390 센트럴엠빌딩
- 전화: 053-241-0112
- PG사: 포트원(PortOne) + KSNET 갑(GAP)

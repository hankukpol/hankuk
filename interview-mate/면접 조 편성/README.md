# Interview Study Grouper

면접 스터디 조를 자동으로 편성하는 Next.js 기반 로컬 웹앱입니다. 경찰/소방 명단을 업로드하면 성별, 나이 구간, 지역, 직렬, 성적 기준을 함께 고려해 조를 나눕니다.

## 실행 방법

가장 쉬운 방법은 Windows에서 [run-local.bat](D:\앱 프로그램\면접 스터디 짜기\run-local.bat)을 더블클릭하는 것입니다.

- `node_modules`가 없으면 자동으로 `npm install`을 실행합니다.
- 실행할 때마다 `npm run build` 후 `npm run start`를 실행합니다.
- 서버가 준비되면 브라우저에서 `http://localhost:3000`을 엽니다.
- 종료하려면 실행된 콘솔 창을 닫으면 됩니다.

수동 실행:

```bash
npm install
npm run build
npm run start
```

개발 모드:

```bash
npm run dev
```

권장 환경:

- Node.js 18+
- Windows 10/11

## 현재 편성 방식

현재 알고리즘은 `하드 제약 + 페널티 기반 스왑 최적화` 방식입니다.

1. 사전 편성 멤버와 강제 배정 멤버를 먼저 고정합니다.
2. 남/여를 나눠 직렬 인터리브 방식으로 초기 배정합니다.
3. 같은 성별끼리만 스왑하면서 총 페널티를 줄입니다.
4. 더 이상 개선이 없으면 종료합니다.

최적화 기준:

- 성별 혼합
- 나이 구간 분산
- 대구·경북 분산
- 직렬 분산
- 성적 균등

가중치는 코드에 고정되어 있고, UI에서는 각 기준을 ON/OFF만 할 수 있습니다.

## 지역과 나이 기준

- 지역은 `대구` 또는 `경북`이 포함되면 대구·경북으로 분류합니다.
- 나이 구간은 `A: 24세 이하`, `B: 25~27세`, `C: 28~30세`, `D: 31세 이상`입니다.
- 현재 구현은 `같은 구간 max 2` 같은 고정 상한이 아니라, 전체 명단의 실제 분포를 각 조에 비슷하게 나누는 방식입니다.

## 복원 모드

이전에 내보낸 편성 파일을 다시 업로드하면 복원 모드로 불러옵니다.

- 복원 결과를 바로 화면에서 확인할 수 있습니다.
- 복원 직후에는 `사전 편성 적용`이 자동으로 꺼집니다.
- `복원본 다시 편성`을 누르면 기존 조 번호를 고정하지 않고 새로 편성합니다.

## 입력 파일

지원 형식:

- `.xlsx`
- `.xls`
- `.csv`
- 탭/쉼표 구분 텍스트 붙여넣기

권장 컬럼:

- 이름
- 연락처
- 성별
- 직렬
- 지역
- 나이
- 필기성적
- 조

## 주요 파일

- [algorithm.ts](D:\앱 프로그램\면접 스터디 짜기\src\lib\study-group\algorithm.ts): 편성 알고리즘
- [excel.ts](D:\앱 프로그램\면접 스터디 짜기\src\lib\study-group\excel.ts): 업로드/복원/엑셀 내보내기
- [StudyGroupManager.tsx](D:\앱 프로그램\면접 스터디 짜기\src\components\study-group\StudyGroupManager.tsx): 전체 상태와 화면 흐름
- [GroupSettings.tsx](D:\앱 프로그램\면접 스터디 짜기\src\components\study-group\GroupSettings.tsx): 편성 기준 UI
- [GroupResult.tsx](D:\앱 프로그램\면접 스터디 짜기\src\components\study-group\GroupResult.tsx): 결과 표시
- [PRD.md](D:\앱 프로그램\면접 스터디 짜기\PRD.md): 현재 제품/알고리즘 문서

## 검증 명령

```bash
npx tsc --noEmit
node test-penalty-algorithm.mjs
npm run build
```

현재 목업 데이터 기준 확인 포인트:

- `mock-police-300.csv`: 대구·경북 조당 7~8명, 여성 2~3명 수준
- `mock-fire-180.csv`: 대구·경북 조당 7~8명, 여성 3명 수준
- 성적 평균 편차는 실사용 기준에서 작은 범위로 유지

## 참고

실행 파일이 필요하면 지금은 `run-local.bat` 방식이 가장 단순합니다. 완전한 `.exe` 패키징은 사용자 배포가 많아질 때 검토하는 편이 낫습니다.

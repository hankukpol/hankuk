# 계정 전환 가이드 (Vercel / Supabase / GitHub)

CLI는 한 번에 한 계정만 로그인된다. 이 문서는 **학원 계정과 선생님 계정 사이를 전환하는 정확한 절차**를 정리한다.

> ⚠️ 이건 "DB 전환"이 아니라 **CLI 계정 전환**이다.
> 앱이 붙는 DB는 `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`이 결정하고,
> 마이그레이션 대상 DB는 `supabase link`가 결정한다.
> 계정 전환은 *그 DB를 만질 권한을 얻는* 단계일 뿐이다.

---

## 0. 빠른 방법 — 스크립트 (권장)

아래 절차를 전부 자동화한 스크립트가 있다. **어느 프로젝트에서든 절대경로로 실행하면 된다.**

```powershell
# 현재 계정 확인만
& "d:\코딩\학원 포탈 프로그램\hankuk\scripts\switch-account.ps1"

# 학원(ikma@hanmail.net)으로 전환
& "d:\코딩\학원 포탈 프로그램\hankuk\scripts\switch-account.ps1" -Account academy

# 선생님(mhr62222@gmail.com)으로 전환
& "d:\코딩\학원 포탈 프로그램\hankuk\scripts\switch-account.ps1" -Account teacher
```

실행이 막히면 앞에 `powershell -ExecutionPolicy Bypass -File` 를 붙인다.

**다른 프로젝트의 Claude 채팅방에서는 이 한 줄만 붙여넣으면 된다:**

```
d:\코딩\학원 포탈 프로그램\hankuk\scripts\switch-account.ps1 -Account teacher 를 실행해줘
```

스크립트가 하는 일:
1. 현재 Vercel / Supabase 계정과 링크 상태 표시
2. 비대화형 셸(Claude Code 등)에서 실행하면 **TTY가 있는 새 콘솔 창을 자동으로 띄움**
3. 브라우저 계정을 먼저 맞추라고 안내 → 확인 후 진행
4. `vercel logout` → `vercel login` → 결과 검증
5. `supabase login` (단계별 안내 포함) → 결과 검증
6. 학원 계정이면 `supabase link --project-ref pbonwjwbtqyrfrxqdwlu` 까지 자동 실행
7. 최종 상태 재출력

아래 3~5장은 스크립트가 안 될 때를 위한 **수동 절차**다.

---

## 1. 계정 구분

| 구분 | 이메일 | Vercel | Supabase |
|---|---|---|---|
| **학원** (hankuk 운영 계정) | `ikma@hanmail.net` | `ikma-4087`<br>스코프 `ikma-4087s-projects` | 조직 `한국학원` (Pro) |
| **선생님** (개인) | `mhr62222@gmail.com` | `mhr62222-8192`<br>팀 `police-quiz` | `mhr62222-afk's Org` |

**hankuk 모노레포는 전부 학원 계정 소속이다.** 선생님 계정으로는 접근할 수 없다.

### 주요 ID

| 항목 | 값 |
|---|---|
| Vercel 팀 ID (학원) | `team_S1kpwEzE2Hbujvnuawv7OPz0` |
| Supabase 조직 ID (한국학원) | `jpnnyouvjldleiakeusi` |
| Supabase 프로젝트 (운영 DB) | `hankuk-main` = `pbonwjwbtqyrfrxqdwlu` |
| GitHub | `hankukpol` / `hankukpol/hankuk` |

GitHub은 계정이 하나뿐이라 **전환 대상이 아니다.**

---

## 2. 현재 상태 확인 (작업 전 항상)

```powershell
vercel whoami        # ikma-4087 = 학원 / mhr62222-8192 = 선생님
supabase orgs list   # "한국학원" 보이면 학원 / 안 보이면 선생님
```

빠른 판별법: `apps/class-pass`에서 `vercel project ls` 를 돌려 `Error: Not authorized` 가 나면 선생님 계정이다.

---

## 3. Vercel 전환

```powershell
vercel logout
vercel login          # 디바이스 코드 방식
vercel whoami         # 확인
```

`vercel login`은 `https://vercel.com/oauth/device?user_code=XXXX-XXXX` 주소를 출력한다.
**전환하려는 계정으로 로그인된 브라우저**에서 그 주소를 열고, 코드가 일치하는지 확인한 뒤 승인한다.

### 검증

```powershell
vercel whoami        # → ikma-4087
vercel project ls    # → class-pass, portal, study-hall … 목록이 나와야 함
```

### 주의

- **vercel 명령을 동시에 두 개 실행하지 말 것.** 로그인 직후 `whoami`와 `teams ls`를 동시에 돌리면
  `%APPDATA%\com.vercel.cli\Data\auth.json` 이 서로 덮어써져 토큰이 3바이트(`{}`)로 날아간다.
  로그인 후에는 명령을 하나씩 실행한다.
- Claude Code의 샌드박스 셸에서는 토큰이 디스크에 저장되지 않아 호출마다 재인증된다.
  **본인 터미널에서 `vercel login`을 한 번** 실행해두면 그쪽에서는 정상 유지된다.

---

## 4. Supabase 전환

### ⚠️ 핵심 제약: TTY가 필요하다

`supabase login`은 대화형 입력이 필요해서 **Claude Code의 셸에서는 실행할 수 없다.**

```
Cannot use automatic login flow inside non-TTY environments.
Please provide --token flag or set the SUPABASE_ACCESS_TOKEN environment variable.
```

아래 두 방법 중 하나를 쓴다.

### 방법 A — 실제 콘솔 창에서 로그인 (권장)

VS Code 터미널(<kbd>Ctrl</kbd> + <kbd>`</kbd>) 또는 별도 PowerShell 창에서:

```powershell
supabase login
```

진행 순서 — **브라우저가 코드를 주고, 그 코드를 CLI에 붙여넣는 방향이다:**

1. 콘솔에 `Hello from Supabase! Press Enter to open browser and login automatically.` → <kbd>Enter</kbd>
2. 브라우저에 `Authorize Supabase CLI` 화면이 열리고 **8자리 인증 코드**가 표시된다
   - 화면 하단의 `Signed in as ...` 로 **계정이 맞는지 반드시 확인**
3. `Copy code` 클릭
4. 콘솔의 `Enter your verification code:` 에 붙여넣고 <kbd>Enter</kbd>
5. `You are now logged in. Happy coding!` 이면 완료

Claude Code에서 이 창을 대신 띄우려면:

```powershell
Start-Process powershell -ArgumentList "-NoExit","-Command","supabase login"
```

### 방법 B — 토큰 직접 지정 (브라우저 세션과 무관)

브라우저 세션이 꼬여 있을 때 확실한 방법이다.

1. 전환할 계정으로 로그인한 상태에서 https://supabase.com/dashboard/account/tokens → `Generate new token`
2. ```powershell
   supabase login --token sbp_...
   ```

> 토큰은 계정 전체 권한을 가진 자격 증명이다. 채팅·이슈·커밋에 붙여넣지 말 것.

### 검증

```powershell
supabase orgs list
```

학원 계정이면 다음 두 조직이 보인다:

```
 jpnnyouvjldleiakeusi                 | 한국학원
 vercel_icfg_30iIa9RPKAOAJCyejSaBhsfh | ikma-4087's projects
```

---

## 5. 링크 재설정 (Supabase 전환 후 필수)

계정을 바꾸면 프로젝트 링크가 풀린다. **리포 루트에서** 재실행한다.

```powershell
cd "d:\코딩\학원 포탈 프로그램\hankuk"
supabase link --project-ref pbonwjwbtqyrfrxqdwlu
supabase projects list
```

`hankuk-main` 행의 `LINKED` 컬럼에 `●` 가 찍히면 완료다.

> 링크 정보는 리포 루트의 `supabase/.temp/project-ref` 에 저장된다.
> `apps/class-pass` 에서 `supabase` 명령을 돌리면 `Cannot find project ref` 가 나므로 항상 루트에서 실행한다.

---

## 6. 알아둘 함정

| 함정 | 설명 |
|---|---|
| **브라우저 로그인 ≠ CLI 로그인** | 브라우저를 바꿔도 CLI 토큰은 그대로다. 반드시 `supabase login` / `vercel login` 을 다시 실행해야 한다. |
| **CLI 로그인 ≠ MCP 연결** | Claude Code의 Supabase MCP는 CLI와 **별개 토큰**을 쓴다. CLI를 바꿔도 MCP는 안 따라오고 반대도 마찬가지다. 실제로 CLI=선생님 / MCP=학원 으로 갈라져 있던 적이 있다. |
| **계정 전환 ≠ DB 전환** | 앱이 붙는 DB는 `.env.local`, 마이그레이션 대상은 `supabase link` 가 결정한다. |
| **동시 실행 금지 (Vercel)** | vercel 명령 두 개를 동시에 돌리면 `auth.json` 이 깨진다. |
| **환경변수 오버라이드** | `SUPABASE_ACCESS_TOKEN` 이 설정돼 있으면 저장된 토큰보다 **우선**한다. 전환이 안 먹으면 이걸 먼저 확인한다. |

---

## 7. 전환 완료 체크리스트

```powershell
vercel whoami                                    # → ikma-4087
vercel project ls                                # → class-pass 등 목록 출력 (Not authorized 아님)
supabase orgs list                               # → 한국학원 포함
cd "d:\코딩\학원 포탈 프로그램\hankuk"
supabase projects list                           # → hankuk-main 에 ● 표시
```

넷 다 통과하면 CLI와 MCP가 모두 학원 계정 기준으로 정렬된 상태다.

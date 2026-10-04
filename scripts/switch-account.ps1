<#
.SYNOPSIS
  Vercel / Supabase CLI 계정 전환 스크립트 (학원 <-> 선생님)

.DESCRIPTION
  CLI 로그인은 컴퓨터 전체 공용이라 한 번에 한 계정만 쓸 수 있다.
  이 스크립트는 현재 계정 확인과 전환을 한 번에 처리한다.

  supabase login 은 TTY가 필요해서 Claude Code 같은 비대화형 셸에서는 실행할 수 없다.
  그런 환경에서 실행하면 스스로 새 콘솔 창을 띄운다.

.EXAMPLE
  .\switch-account.ps1                    # 현재 계정 확인만
  .\switch-account.ps1 -Account academy   # 학원(ikma@hanmail.net)으로 전환
  .\switch-account.ps1 -Account teacher   # 선생님(mhr62222@gmail.com)으로 전환
#>

[CmdletBinding()]
param(
    [ValidateSet('check', 'academy', 'teacher')]
    [string]$Account = 'check'
)

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------- 계정 정의

$Accounts = @{
    academy = @{
        Label         = '학원'
        Email         = 'ikma@hanmail.net'
        VercelUser    = 'ikma-4087'
        SupabaseOrg   = '한국학원'
        # 콘솔 인코딩 때문에 한글 조직명은 깨질 수 있다. 판별은 항상 ASCII인 ID로 한다.
        SupabaseOrgId = 'jpnnyouvjldleiakeusi'
        ProjectRef    = 'pbonwjwbtqyrfrxqdwlu'   # hankuk-main
        LinkRoot      = Split-Path $PSScriptRoot -Parent
    }
    teacher = @{
        Label         = '선생님'
        Email         = 'mhr62222@gmail.com'
        VercelUser    = 'mhr62222-8192'
        SupabaseOrg   = "mhr62222-afk 조직"
        SupabaseOrgId = 'nilznbudqholgotjnhkp'
        ProjectRef    = $null                     # police-quiz 리포 경로를 몰라 자동 link 생략
        LinkRoot      = $null
    }
}

# ---------------------------------------------------------------- 헬퍼

function Write-Head([string]$Text) {
    Write-Host ''
    Write-Host "=== $Text " -ForegroundColor Cyan -NoNewline
    Write-Host ('=' * [Math]::Max(0, 60 - $Text.Length)) -ForegroundColor Cyan
}

function Write-Ok([string]$Text)   { Write-Host "  [OK] $Text"   -ForegroundColor Green }
function Write-Bad([string]$Text)  { Write-Host "  [!!] $Text"   -ForegroundColor Red }
function Write-Info([string]$Text) { Write-Host "  $Text"        -ForegroundColor Gray }

# 로그인이 안 된 상태에서 vercel 명령은 디바이스 인증을 기다리며 멈춘다.
# 확인 단계에서 멈추지 않도록 타임아웃을 건다.
function Invoke-Cli([string]$Command, [int]$TimeoutSec = 25) {
    $job = Start-Job -ScriptBlock ([scriptblock]::Create("$Command 2>&1 | Out-String"))
    if (Wait-Job $job -Timeout $TimeoutSec) {
        $out = Receive-Job $job
    } else {
        Stop-Job $job -ErrorAction SilentlyContinue
        $out = $null
    }
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    return $out
}

# 토큰이 없는 상태에서 vercel 명령을 부르면 디바이스 인증 대기로 멈춘다.
# 먼저 저장된 토큰 유무를 파일로 확인해서, 없으면 CLI를 아예 호출하지 않는다.
function Test-VercelToken {
    $auth = Join-Path $env:APPDATA 'com.vercel.cli\Data\auth.json'
    if (-not (Test-Path $auth)) { return $false }
    return ((Get-Content $auth -Raw) -match '"token"')
}

function Show-Current {
    Write-Head '현재 계정'

    $who = $null
    if (Test-VercelToken) {
        $vercel = Invoke-Cli 'vercel whoami'
        if ($vercel) {
            $who = ($vercel -split "`n" | Where-Object { $_.Trim() -and $_ -notmatch '^\s*[>#]' } | Select-Object -Last 1).Trim()
        }
    }

    if (-not $who) {
        Write-Bad 'Vercel   : 로그인 안 됨 (또는 응답 없음)'
    } elseif ($who -eq $Accounts.academy.VercelUser) {
        Write-Ok  "Vercel   : $who  → 학원"
    } elseif ($who -eq $Accounts.teacher.VercelUser) {
        Write-Ok  "Vercel   : $who  → 선생님"
    } else {
        Write-Info "Vercel   : $who  (알 수 없는 계정)"
    }

    $orgs = Invoke-Cli 'supabase orgs list'
    if (-not $orgs) {
        Write-Bad 'Supabase : 로그인 안 됨 (또는 응답 없음)'
    } elseif ($orgs -match $Accounts.academy.SupabaseOrgId) {
        Write-Ok  'Supabase : 한국학원 보임  → 학원'
    } elseif ($orgs -match $Accounts.teacher.SupabaseOrgId) {
        Write-Ok  'Supabase : mhr62222 조직만 보임  → 선생님'
    } else {
        Write-Info 'Supabase : 조직을 판별하지 못함'
    }

    $refFile = Join-Path (Split-Path $PSScriptRoot -Parent) 'supabase\.temp\project-ref'
    if (Test-Path $refFile) {
        $ref = (Get-Content $refFile -Raw).Trim()
        if ($ref -eq $Accounts.academy.ProjectRef) {
            Write-Ok "링크     : $ref (hankuk-main)"
        } else {
            Write-Info "링크     : $ref"
        }
    } else {
        Write-Bad '링크     : 없음 (supabase link 필요)'
    }
    Write-Host ''
}

# ---------------------------------------------------------------- 확인 모드

if ($Account -eq 'check') {
    Show-Current
    Write-Info '전환하려면:'
    Write-Info '  .\switch-account.ps1 -Account academy   # 학원'
    Write-Info '  .\switch-account.ps1 -Account teacher   # 선생님'
    Write-Host ''
    return
}

# ---------------------------------------------------------------- TTY 확보

# supabase login 은 대화형 입력이 필요하다. stdin이 리다이렉트된 환경(Claude Code 등)이면
# 진짜 콘솔 창을 새로 띄우고 이 프로세스는 종료한다.
if ([Console]::IsInputRedirected) {
    Write-Host '비대화형 셸에서 실행됨 → 새 PowerShell 창을 띄웁니다.' -ForegroundColor Yellow
    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoExit', '-ExecutionPolicy', 'Bypass',
        '-File', $PSCommandPath,
        '-Account', $Account
    )
    Write-Host '새 창에서 이어서 진행하세요.' -ForegroundColor Yellow
    return
}

$target = $Accounts[$Account]

# ---------------------------------------------------------------- 안내

Write-Head "$($target.Label) 계정으로 전환"
Write-Info "대상: $($target.Email)"
Write-Host ''
Write-Host '  ⚠ 시작하기 전에 브라우저에서 vercel.com 과 supabase.com 을' -ForegroundColor Yellow
Write-Host "     $($target.Email) 계정으로 로그인해 두세요." -ForegroundColor Yellow
Write-Host '     (브라우저가 다른 계정이면 그 계정 토큰이 발급됩니다)' -ForegroundColor Yellow
Write-Host ''

$answer = Read-Host '준비되면 Enter, 취소하려면 n'
if ($answer -match '^[nN]') { Write-Info '취소했습니다.'; return }

# ---------------------------------------------------------------- Vercel

Write-Head 'Vercel 로그인'
Write-Info '기존 세션을 정리합니다...'
vercel logout | Out-Null

Write-Info '브라우저에 표시되는 코드와 아래 코드가 같은지 확인하고 승인하세요.'
Write-Host ''
vercel login

Write-Host ''
Write-Info '확인 중...'
$who = (vercel whoami 2>&1 | Out-String).Trim() -split "`n" | Select-Object -Last 1
$who = $who.Trim()
if ($who -eq $target.VercelUser) {
    Write-Ok "Vercel → $who"
} else {
    Write-Bad "Vercel 계정이 예상과 다릅니다: '$who' (기대값: $($target.VercelUser))"
    Write-Info '브라우저 계정을 확인하고 다시 실행하세요.'
}

# ---------------------------------------------------------------- Supabase

Write-Head 'Supabase 로그인'
Write-Info '진행 순서:'
Write-Info '  1) Enter → 브라우저가 열립니다'
Write-Info '  2) 브라우저에 8자리 인증 코드가 표시됩니다'
Write-Info "  3) 화면의 'Signed in as' 가 $($target.Email) 인지 확인"
Write-Info '  4) Copy code → 이 창에 붙여넣기(마우스 오른쪽 클릭) → Enter'
Write-Host ''

supabase login

Write-Host ''
Write-Info '확인 중...'
$orgs = supabase orgs list 2>&1 | Out-String
if ($orgs -match $target.SupabaseOrgId) {
    Write-Ok "Supabase → $($target.SupabaseOrg)"
} else {
    Write-Bad "Supabase 조직이 예상과 다릅니다 (기대값: $($target.SupabaseOrg))"
    Write-Host $orgs
    Write-Info '브라우저 계정을 확인하고 supabase login 을 다시 실행하세요.'
}

# ---------------------------------------------------------------- 링크

if ($target.ProjectRef -and $target.LinkRoot) {
    Write-Head 'Supabase 프로젝트 링크'
    Write-Info "$($target.LinkRoot) → $($target.ProjectRef)"
    Push-Location $target.LinkRoot
    supabase link --project-ref $target.ProjectRef
    Pop-Location
} else {
    Write-Head 'Supabase 프로젝트 링크'
    Write-Info '이 계정은 자동 링크 대상이 없습니다.'
    Write-Info '해당 리포 루트에서 직접 실행하세요:  supabase link --project-ref 프로젝트REF'
}

# ---------------------------------------------------------------- 최종

Show-Current
Write-Host '전환이 끝났습니다. 이 창은 닫으셔도 됩니다.' -ForegroundColor Green
Write-Host ''

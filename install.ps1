# glm-review install.ps1
# Windows PowerShell 설치 스크립트
# 사용법: irm https://raw.githubusercontent.com/dgk-dev/glm-review/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$REPO = "https://github.com/dgk-dev/glm-review.git"
$SKILL_DIR = Join-Path $env:USERPROFILE ".claude\skills\rr"
$SKILL_RRR_DIR = Join-Path $env:USERPROFILE ".claude\skills\rrr"
$SCRIPTS_DIR = Join-Path $SKILL_DIR "scripts"

function Write-Info($msg) { Write-Host "[glm-review] $msg" -ForegroundColor Blue }
function Write-Ok($msg) { Write-Host "[glm-review] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[glm-review] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[glm-review] $msg" -ForegroundColor Red }

# 1. Node.js v22+ 확인
Write-Info "Node.js 버전 확인 중..."
try {
    $nodeVersion = (node --version) -replace '^v', ''
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -lt 22) {
        Write-Err "Node.js v22 이상이 필요합니다. 현재: v$nodeVersion"
        exit 1
    }
    Write-Ok "Node.js v$nodeVersion 확인됨"
} catch {
    Write-Err "Node.js가 설치되어 있지 않습니다. https://nodejs.org/ 에서 설치하세요."
    exit 1
}

# 2. git 확인
try { git --version | Out-Null } catch {
    Write-Err "git이 설치되어 있지 않습니다."
    exit 1
}

# 3. 다운로드
Write-Info "glm-review 다운로드 중..."
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "glm-review-install"
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
git clone --depth 1 $REPO $tmpDir 2>$null
Write-Ok "다운로드 완료"

# 4. 스킬 디렉토리 설치
Write-Info "Claude Code /rr 스킬 설치 중..."
if (Test-Path $SKILL_DIR) { Remove-Item $SKILL_DIR -Recurse -Force }
New-Item -ItemType Directory -Path $SCRIPTS_DIR -Force | Out-Null

New-Item -ItemType Directory -Path $SKILL_RRR_DIR -Force | Out-Null
Copy-Item (Join-Path $tmpDir "SKILL.md") (Join-Path $SKILL_DIR "SKILL.md")
Copy-Item (Join-Path $tmpDir "SKILL-rrr.md") (Join-Path $SKILL_RRR_DIR "SKILL.md")
Copy-Item (Join-Path $tmpDir "src\glm-review.ts") (Join-Path $SCRIPTS_DIR "glm-review.ts")
Write-Ok "스킬 파일 설치 완료 (/rr + /rrr)"

# 5. bash 래퍼 생성 (Claude Code 내부용 — Git Bash 사용)
$bashWrapper = Join-Path $SCRIPTS_DIR "glm-review"
@'
#!/usr/bin/env bash
# POSIX-compatible symlink resolution (macOS/Linux/Git Bash)
SOURCE="$0"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
exec node --no-warnings --experimental-strip-types "$SCRIPT_DIR/glm-review.ts" "$@"
'@ | Set-Content -Path $bashWrapper -Encoding UTF8

# 6. .cmd 래퍼 생성 (Windows CLI 직접 실행용)
$cmdWrapper = Join-Path $SCRIPTS_DIR "glm-review.cmd"
@'
@echo off
node --no-warnings --experimental-strip-types "%~dp0glm-review.ts" %*
'@ | Set-Content -Path $cmdWrapper -Encoding ASCII

# 7. PATH에 scripts 디렉토리 추가
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$SCRIPTS_DIR*") {
    [Environment]::SetEnvironmentVariable("Path", "$SCRIPTS_DIR;$userPath", "User")
    $env:Path = "$SCRIPTS_DIR;$env:Path"
    Write-Ok "PATH에 $SCRIPTS_DIR 추가됨 (새 터미널에서 적용)"
} else {
    Write-Ok "PATH에 이미 등록됨"
}

# 8. 클린업
Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

# 9. API 키 확인
Write-Info "API 키 확인 중..."
if (-not $env:ZAI_API_KEY) {
    $envLocal = Join-Path $env:USERPROFILE ".claude\.env.local"
    if ((Test-Path $envLocal) -and (Select-String -Path $envLocal -Pattern "ZAI_API_KEY" -Quiet)) {
        Write-Warn "ZAI_API_KEY가 환경변수에 없습니다. ~/.claude/.env.local에는 있습니다."
    } else {
        Write-Warn "ZAI_API_KEY가 설정되어 있지 않습니다."
        Write-Host ""
        Write-Host "  Z.AI에서 Coding Plan 구독 후 API 키를 발급받으세요:"
        Write-Host "  https://z.ai"
        Write-Host ""
        Write-Host "  설정: `$env:ZAI_API_KEY = 'your-api-key'"
    }
} else {
    Write-Ok "ZAI_API_KEY 확인됨"
    Write-Info "API 연결 테스트 중..."
    try {
        & node --no-warnings --experimental-strip-types (Join-Path $SCRIPTS_DIR "glm-review.ts") --health
        Write-Ok "GLM-5 API 연결 확인됨"
    } catch {
        Write-Warn "API 연결 실패. 키를 확인하세요."
    }
}

# 완료
Write-Host ""
Write-Host "glm-review 설치 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "  Claude Code에서:  /rr"
Write-Host "  CLI 직접 실행:    glm-review"
Write-Host "  헬스 체크:        glm-review --health"
Write-Host ""
Write-Host "  필수: ZAI_API_KEY 환경변수 (Z.AI Coding Plan)"
Write-Host ""

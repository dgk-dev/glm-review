#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────
# glm-review 원클릭 원격 설치
# 사용법: curl -fsSL https://raw.githubusercontent.com/dgk-dev/glm-review/main/install-remote.sh | bash
# ─────────────────────────────────────────────────────

REPO="https://github.com/dgk-dev/glm-review.git"
SKILL_DIR="$HOME/.claude/skills/rr"
BIN_DIR="$HOME/.local/bin"
SCRIPTS_DIR="$SKILL_DIR/scripts"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[glm-review]${NC} $*"; }
success() { echo -e "${GREEN}[glm-review]${NC} ✓ $*"; }
warn()    { echo -e "${YELLOW}[glm-review]${NC} ⚠ $*"; }
error()   { echo -e "${RED}[glm-review]${NC} ✗ $*" >&2; }

# ── 1. Node.js v22+ 확인 ─────────────────────
if ! command -v node &>/dev/null; then
  error "Node.js가 설치되어 있지 않습니다."
  error "설치: https://nodejs.org/ 또는 fnm install 22"
  exit 1
fi

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  error "Node.js v22 이상이 필요합니다. 현재: $(node --version)"
  exit 1
fi
success "Node.js $(node --version) 확인됨"

# ── 2. git 확인 ──────────────────────────────
if ! command -v git &>/dev/null; then
  error "git이 설치되어 있지 않습니다."
  exit 1
fi

# ── 3. 다운로드 ──────────────────────────────
info "glm-review 다운로드 중..."
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

git clone --depth 1 "$REPO" "$TMPDIR/glm-review" 2>/dev/null
success "다운로드 완료"

# ── 4. 스킬 디렉토리 설치 ─────────────────────
info "Claude Code /rr 스킬 설치 중..."
rm -rf "$SKILL_DIR"
mkdir -p "$SKILL_DIR" "$SCRIPTS_DIR" "$BIN_DIR"

cp "$TMPDIR/glm-review/SKILL.md" "$SKILL_DIR/SKILL.md"
cp "$TMPDIR/glm-review/src/glm-review.ts" "$SCRIPTS_DIR/glm-review.ts"
success "스킬 파일 설치 완료"

# ── 5. 래퍼 스크립트 생성 ─────────────────────
cat > "$SCRIPTS_DIR/glm-review" << 'WRAPPER_EOF'
#!/usr/bin/env bash
exec node --no-warnings --experimental-strip-types "$(dirname "$(readlink -f "$0")")/glm-review.ts" "$@"
WRAPPER_EOF
chmod +x "$SCRIPTS_DIR/glm-review"

# ── 6. PATH 심링크 ───────────────────────────
ln -sf "$SCRIPTS_DIR/glm-review" "$BIN_DIR/glm-review"
success "glm-review → $BIN_DIR/glm-review"

# ── 7. PATH 확인 ─────────────────────────────
if ! echo "$PATH" | tr ':' '\n' | grep -q "^$BIN_DIR$"; then
  warn "$BIN_DIR이 PATH에 없습니다. 추가하세요:"
  warn "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
fi

# ── 8. API 키 확인 ───────────────────────────
if [[ -z "${ZAI_API_KEY:-}" ]]; then
  echo ""
  warn "ZAI_API_KEY가 설정되어 있지 않습니다."
  echo ""
  echo "  Z.AI에서 Coding Plan 구독 후 API 키를 발급받으세요:"
  echo "  https://z.ai"
  echo ""
  echo "  설정 방법 (택 1):"
  echo "    export ZAI_API_KEY='your-api-key'              # 현재 셸"
  echo "    echo \"export ZAI_API_KEY='your-key'\" >> ~/.zshrc  # 영구"
  echo ""
else
  # 헬스 체크
  info "API 연결 테스트 중..."
  if glm-review --health 2>&1; then
    success "GLM-5 API 연결 확인됨"
  else
    warn "API 연결 실패. 키를 확인하세요."
  fi
fi

# ── 완료 ──────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  glm-review 설치 완료!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  사용법:"
echo "    Claude Code에서:  /rr"
echo "    CLI 직접 실행:    glm-review"
echo "    헬스 체크:        glm-review --health"
echo ""
echo "  필수: ZAI_API_KEY 환경변수 (Z.AI Coding Plan)"
echo ""

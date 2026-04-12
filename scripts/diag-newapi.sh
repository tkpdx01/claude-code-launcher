#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Diagnose Cloudflare vs newapi blocking (403 "user agent not allowed", etc.)

Usage:
  NEWAPI_TOKEN='sk-***' ./scripts/diag-newapi.sh --base https://new.slide.indevs.in --model claude-opus-4-5-20251101

Options:
  --base   Base URL (default: https://api.anthropic.com)
  --model  Model name for POST /v1/messages test (default: claude-opus-4-5-20251101)
  --auth   Auth mode: bearer|x-api-key (default: x-api-key)
  --help   Show help

Notes:
  - This script NEVER prints the token.
  - It prints status + a few response headers (cf-ray, x-oneapi-request-id, etc.) and a short response body excerpt.
EOF
}

BASE_URL="https://api.anthropic.com"
MODEL="claude-opus-4-5-20251101"
AUTH_MODE="x-api-key"
NO_PROXY_MODE="0"
SHOW_SENT_HEADERS="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_URL="${2:?missing value for --base}"; shift 2 ;;
    --model) MODEL="${2:?missing value for --model}"; shift 2 ;;
    --auth) AUTH_MODE="${2:?missing value for --auth}"; shift 2 ;;
    --no-proxy) NO_PROXY_MODE="1"; shift 1 ;;
    --no-show-sent-headers) SHOW_SENT_HEADERS="0"; shift 1 ;;
    --help|-h) usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

BASE_URL="$(printf '%s' "${BASE_URL}" | tr -d '\r\n' | sed 's/[[:space:]]//g')"
BASE_URL="${BASE_URL%/}"
if [[ ! "${BASE_URL}" =~ ^https?://[^/]+$ ]]; then
  echo "Invalid --base: ${BASE_URL}" >&2
  echo "Expected something like: https://new.slide.indevs.in" >&2
  exit 2
fi

TOKEN="${NEWAPI_TOKEN:-${TOKEN:-}}"
if [[ -z "${TOKEN}" ]]; then
  echo "Missing token. Set NEWAPI_TOKEN (or TOKEN) in env." >&2
  echo "Example: NEWAPI_TOKEN='sk-***' ./scripts/diag-newapi.sh --base https://new.slide.indevs.in" >&2
  exit 2
fi

# trim common copy/paste issues (no token printing)
TOKEN="$(printf '%s' "${TOKEN}" | tr -d '\r\n')"
if [[ "${TOKEN}" =~ [[:space:]] ]]; then
  echo "Warning: token contains whitespace; stripping spaces/tabs." >&2
  TOKEN="$(printf '%s' "${TOKEN}" | tr -d '[:space:]')"
fi
if ! LC_ALL=C printf '%s' "${TOKEN}" | grep -qE '^[ -~]+$'; then
  echo "Warning: token contains non-ASCII characters. Re-copy it to avoid punctuation like '，'." >&2
fi

auth_args=()
case "${AUTH_MODE}" in
  bearer) auth_args=(-H "Authorization: Bearer ${TOKEN}") ;;
  x-api-key) auth_args=(-H "x-api-key: ${TOKEN}") ;;
  *)
    echo "Invalid --auth: ${AUTH_MODE} (expected bearer|x-api-key)" >&2
    exit 2
    ;;
esac

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "${tmp_dir}"; }
trap cleanup EXIT

echo "base=${BASE_URL}"
echo "model=${MODEL}"
echo "auth_default=${AUTH_MODE}"
if [[ "${NO_PROXY_MODE}" == "1" ]]; then
  echo "proxy=disabled (--noproxy '*', env -u HTTP(S)_PROXY/ALL_PROXY)"
else
  echo "proxy=env (HTTP_PROXY/HTTPS_PROXY/ALL_PROXY may apply)"
  echo "HTTP_PROXY=${HTTP_PROXY:-}"
  echo "HTTPS_PROXY=${HTTPS_PROXY:-}"
  echo "ALL_PROXY=${ALL_PROXY:-}"
  echo "NO_PROXY=${NO_PROXY:-}"
fi
if [[ -f "${HOME}/.curlrc" ]]; then
  echo "note=~/.curlrc exists (may affect curl behavior)"
fi

print_response_summary() {
  local headers_file="$1"
  local body_file="$2"

  # status
  local status
  status="$(awk 'NR==1{print $2}' "${headers_file}" 2>/dev/null || true)"
  echo "status=${status:-unknown}"

  # key headers (case-insensitive match)
  awk 'BEGIN{IGNORECASE=1}
    /^server:/ {print $0}
    /^cf-ray:/ {print $0}
    /^cf-cache-status:/ {print $0}
    /^x-oneapi-request-id:/ {print $0}
    /^x-new-api-version:/ {print $0}
    /^content-type:/ {print $0}
    /^www-authenticate:/ {print $0}
  ' "${headers_file}" | sed 's/\r$//'

  # body excerpt (first 500 bytes, keep single-line-ish)
  if [[ -s "${body_file}" ]]; then
    echo "body:"
    head -c 500 "${body_file}" | tr '\n' ' ' | sed 's/[[:space:]]\{1,\}/ /g'
    echo
  fi
}

print_sent_headers() {
  local curl_log="$1"
  if [[ "${SHOW_SENT_HEADERS}" != "1" ]]; then
    return 0
  fi
  if [[ ! -s "${curl_log}" ]]; then
    return 0
  fi
  echo "sent_headers:"
  # redact sensitive headers
  grep -E '^> ' "${curl_log}" \
    | sed -E 's/(^> (Authorization: Bearer )).*/\\1[REDACTED]/I' \
    | sed -E 's/(^> (x-api-key: )).*/\\1[REDACTED]/I' \
    | sed -E 's/(^> (X-Api-Key: )).*/\\1[REDACTED]/I'
}

do_request() {
  local name="$1"
  local method="$2"
  local path="$3"
  local user_agent="$4"
  local body="${5:-}"

  local headers_file="${tmp_dir}/${name}.headers"
  local body_file="${tmp_dir}/${name}.body"
  local curl_log="${tmp_dir}/${name}.curl.log"
  : > "${headers_file}"
  : > "${body_file}"
  : > "${curl_log}"

  local curl_args=(
    -sS
    -v
    --http1.1
    --connect-timeout 10
    --max-time 20
    -D "${headers_file}"
    -o "${body_file}"
    -X "${method}"
    "${BASE_URL}${path}"
    -H "User-Agent: ${user_agent}"
  )
  if [[ "${method}" == "POST" ]]; then
    curl_args+=(-H "Content-Type: application/json" --data-binary "${body}")
  fi
  if [[ "${NO_PROXY_MODE}" == "1" ]]; then
    curl_args+=(--noproxy '*')
  fi

  echo
  echo "== ${name} =="
  echo "request: ${method} ${BASE_URL}${path}"
  echo "ua: ${user_agent}"
  echo "auth: ${AUTH_MODE} (token_len=${#TOKEN})"

  # shellcheck disable=SC2068
  if [[ "${NO_PROXY_MODE}" == "1" ]]; then
    # shellcheck disable=SC2068
    env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY curl ${curl_args[@]} ${auth_args[@]} >/dev/null 2>"${curl_log}" || true
  else
    # shellcheck disable=SC2068
    curl ${curl_args[@]} ${auth_args[@]} >/dev/null 2>"${curl_log}" || true
  fi

  if grep -qiE 'Empty reply from server|URL rejected: Bad hostname|Could not resolve host|Failed to connect|SSL|TLS|Proxy CONNECT aborted' "${curl_log}"; then
    echo "curl failed (network/TLS/etc)."
  fi

  print_sent_headers "${curl_log}"
  print_response_summary "${headers_file}" "${body_file}"
}

do_request "models_claude_ua" "GET" "/v1/models" "Claude Code/1.0"
do_request "models_browser_ua" "GET" "/v1/models" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

do_request "messages_post_claude_ua" "POST" "/v1/messages" "Claude Code/1.0" \
  "{\"model\":\"${MODEL}\",\"max_tokens\":16,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"

echo
echo "Done."

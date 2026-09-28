#!/usr/bin/env bash
set -euo pipefail

: "${IAM_ADMIN_USERNAME:?set IAM_ADMIN_USERNAME}"
: "${IAM_ADMIN_PASSWORD:?set IAM_ADMIN_PASSWORD}"

server="${IAM_INTERNAL_URL:-http://iam:8080}"
realm="${IAM_REALM:-accesslobby-first-party}"
registration="${PUBLIC_REGISTRATION_ENABLED:-false}"
verify_email="${IAM_VERIFY_EMAIL:-false}"
reset_password="${IAM_RESET_PASSWORD_ENABLED:-false}"
login_theme="${IAM_LOGIN_THEME:-accesslobby}"
display_name="${IAM_DISPLAY_NAME:-AccessLobby}"

validate_boolean() {
  case "$2" in
    true|false) ;;
    *) echo "$1 must be true or false" >&2; exit 2 ;;
  esac
}

validate_nonempty() {
  if [[ -z "$2" ]]; then
    echo "$1 must not be empty" >&2
    exit 2
  fi
}

validate_boolean PUBLIC_REGISTRATION_ENABLED "$registration"
validate_boolean IAM_VERIFY_EMAIL "$verify_email"
validate_boolean IAM_RESET_PASSWORD_ENABLED "$reset_password"
validate_nonempty IAM_LOGIN_THEME "$login_theme"
validate_nonempty IAM_DISPLAY_NAME "$display_name"

export HOME=/tmp/accesslobby-kcadm
mkdir -p "$HOME"
kcadm=/opt/keycloak/bin/kcadm.sh

ready=false
for _ in $(seq 1 60); do
  if "$kcadm" config credentials \
      --server "$server" \
      --realm master \
      --user "$IAM_ADMIN_USERNAME" \
      --password "$IAM_ADMIN_PASSWORD" >/dev/null 2>&1 && \
     "$kcadm" get "realms/$realm" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "$ready" != true ]]; then
  echo "Keycloak realm $realm was not ready for reconciliation" >&2
  exit 1
fi

"$kcadm" update "realms/$realm" \
  -s "displayName=$display_name" \
  -s "displayNameHtml=$display_name" \
  -s "loginTheme=$login_theme" \
  -s "registrationAllowed=$registration" \
  -s "verifyEmail=$verify_email" \
  -s "resetPasswordAllowed=$reset_password" \
  -s loginWithEmailAllowed=true \
  -s duplicateEmailsAllowed=false \
  -s bruteForceProtected=true >/dev/null

settings=$("$kcadm" get "realms/$realm" \
  --fields realm,displayName,displayNameHtml,loginTheme,registrationAllowed,verifyEmail,resetPasswordAllowed,loginWithEmailAllowed,duplicateEmailsAllowed,bruteForceProtected)

expect_boolean() {
  local key="$1" expected="$2"
  if ! grep -Eq "\"${key}\"[[:space:]]*:[[:space:]]*${expected}[[:space:]]*,?[[:space:]]*$" <<<"$settings"; then
    echo "Realm reconciliation mismatch for ${key}; expected ${expected}" >&2
    echo "$settings" >&2
    exit 1
  fi
}

expect_string() {
  local key="$1" expected="$2"
  if ! grep -Fq "\"${key}\" : \"${expected}\"" <<<"$settings" && \
     ! grep -Fq "\"${key}\": \"${expected}\"" <<<"$settings"; then
    echo "Realm reconciliation mismatch for ${key}; expected ${expected}" >&2
    echo "$settings" >&2
    exit 1
  fi
}

expect_string displayName "$display_name"
expect_string displayNameHtml "$display_name"
expect_string loginTheme "$login_theme"
expect_boolean registrationAllowed "$registration"
expect_boolean verifyEmail "$verify_email"
expect_boolean resetPasswordAllowed "$reset_password"
expect_boolean loginWithEmailAllowed true
expect_boolean duplicateEmailsAllowed false
expect_boolean bruteForceProtected true

echo "Realm reconciled: theme=$login_theme registration=$registration verify_email=$verify_email reset_password=$reset_password"

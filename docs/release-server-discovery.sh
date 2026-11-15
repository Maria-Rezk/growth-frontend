#!/bin/sh
# Read-only discovery for the frontend release (closes B-2).
#
# Run on the server by an authorised administrator:
#   sh release-server-discovery.sh > discovery.txt 2>&1
#
# It changes nothing: no file is written, no service is touched, and nginx is
# only asked to print its configuration. It prints selected nginx directives,
# never whole config files, and reads no .env file or private key. Lines that
# look like credentials are redacted anyway; read discovery.txt before sharing.

DOMAIN=solu1ions.tech
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo -n"

section() { printf '\n=== %s\n' "$1"; }

redact() { sed -E 's/((password|passwd|secret|token|api[_-]?key|authorization)[^ =:]*[ =:]+).*/\1[REDACTED]/I'; }

main() {
  section "1. Who and where"
  echo "user: $(id -un)  groups: $(id -Gn)"
  echo "host: $(hostname)  $(. /etc/os-release 2>/dev/null; echo "$PRETTY_NAME")"
  if [ -n "$SUDO" ]; then $SUDO true 2>/dev/null && echo "sudo without prompt: yes" || echo "sudo without prompt: NO (rerun as an administrator)"; fi
  echo "rsync: $(command -v rsync || echo missing)  tar: $(command -v tar || echo missing)"

  CONF=$($SUDO nginx -T 2>/dev/null)
  if [ -z "$CONF" ]; then
    section "2. nginx"
    echo "nginx -T printed nothing. nginx may be in a container (section 7), or sudo may be missing."
  fi

  # Every server block that names the domain, reduced to the directives that matter.
  BLOCKS=$(printf '%s\n' "$CONF" | awk -v domain="$DOMAIN" '
    /^# configuration file / { file = $4; sub(/:$/, "", file) }
    {
      line = $0
      sub(/^[ \t]+/, "", line)
      if (depth == 0 && line ~ /^server[ \t]*\{/) { inblock = 1; n = 0; hit = 0; src = file }
      if (inblock) {
        if (line ~ /^(server_name|listen|root|alias|index|try_files|location|include|return|access_log|error_log|proxy_pass|expires|add_header)[ \t]/) kept[++n] = line
        if (line ~ /^server_name[ \t]/ && index(line, domain)) hit = 1
        opened = gsub(/\{/, "{", line); closed = gsub(/\}/, "}", line)
        depth += opened - closed
        if (depth == 0) {
          inblock = 0
          if (hit) { print "--- " src; for (i = 1; i <= n; i++) print "    " kept[i]; print "" }
        }
      }
    }')

  if [ -n "$CONF" ]; then
    section "2. nginx server blocks for $DOMAIN (selected directives)"
    printf '%s\n' "$BLOCKS"
    echo "nginx -t: $($SUDO nginx -t 2>&1 | tail -1)"
  fi

  ROOTS=$(printf '%s\n' "$BLOCKS" | awk '$1 == "root" || $1 == "alias" { gsub(/;/, "", $2); print $2 }' | sort -u)

  section "3. Web roots found"
  [ -n "$ROOTS" ] && printf '%s\n' "$ROOTS" || echo "none found"

  for ROOT in $ROOTS; do
    section "4. Web root: $ROOT"
    if ! $SUDO test -d "$ROOT"; then echo "not a directory on this host"; continue; fi
    echo "resolved: $($SUDO readlink -f "$ROOT")"
    $SUDO stat -c '%A %U:%G %y %n' "$ROOT" "$ROOT/index.html" "$ROOT/assets" 2>&1
    echo "files: $($SUDO find "$ROOT" -type f | wc -l)  size: $($SUDO du -sh "$ROOT" | cut -f1)"
    echo "git checkout here: $($SUDO test -e "$ROOT/.git" && echo yes || echo no)"
    echo "live bundle named in index.html (expect index-BvTI3Aqb.js, index-Cuw6KMEG.css):"
    $SUDO grep -oE 'assets/index-[A-Za-z0-9_-]+\.(js|css)' "$ROOT/index.html" 2>&1 | sort -u
    echo "index.html sha256: $($SUDO sha256sum "$ROOT/index.html" 2>&1 | cut -d' ' -f1)"
    echo "contents:"
    $SUDO ls -la "$ROOT"
    echo "symlinks, two levels down:"
    $SUDO find "$ROOT" -maxdepth 2 -type l -printf '%p -> %l\n'
    echo "parent folder (release directories?):"
    $SUDO ls -la "$(dirname "$($SUDO readlink -f "$ROOT")")"
    echo "free space:"
    df -h "$ROOT" | tail -1
  done

  section "5. Backups and deploy scripts (names only)"
  $SUDO find /var/www /srv /opt /home /root /var/backups -maxdepth 4 \
    \( -iname '*deploy*' -o -iname '*release*' -o -iname '*frontend*backup*' -o -iname 'index.html.*' -o -iname 'dist*.tgz' -o -iname 'dist*.tar.gz' -o -iname 'dist*.zip' \) \
    -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -60

  section "6. Scheduled jobs (names only)"
  systemctl list-timers --all --no-pager 2>/dev/null | awk 'NR > 1 { print $NF, $(NF-1) }' | grep -iE 'certbot|deploy|backup' || echo "no matching timers"
  $SUDO ls /etc/cron.d 2>/dev/null

  section "7. Containers (no environment variables)"
  if command -v docker >/dev/null 2>&1; then
    $SUDO docker ps --format '{{.Names}}  {{.Image}}  {{.Ports}}' 2>&1
    for NAME in $($SUDO docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'nginx|web|front|proxy'); do
      echo "mounts of $NAME:"
      $SUDO docker inspect --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Mode}}){{"\n"}}{{end}}' "$NAME"
    done
  else
    echo "docker not installed"
  fi

  section "8. Log paths"
  printf '%s\n' "$BLOCKS" | awk '$1 == "access_log" || $1 == "error_log"' | sort -u
  $SUDO ls -la /var/log/nginx 2>/dev/null | head -8
}

main 2>&1 | redact

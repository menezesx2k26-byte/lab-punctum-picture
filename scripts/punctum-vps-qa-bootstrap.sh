#!/usr/bin/env bash
set -euo pipefail
umask 022

# Run once as the provisioning operator. The SSH account can only request the fixed smoke.
[[ "$(id -u)" = 0 && $# = 1 ]] || { echo 'Usage: as root, pass a dedicated Ed25519 public key file' >&2; exit 64; }
key="$(tr -d '\r' < "$1")"
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ punctum-vps-qa$ ]] || { echo 'Unexpected public key format' >&2; exit 65; }
ssh-keygen -lf "$1" >/dev/null

base=/opt/punctum-vps-qa
home=/var/lib/punctum-vps-qa-access
socket=/etc/systemd/system/punctum-vps-qa.socket
service=/etc/systemd/system/punctum-vps-qa@.service
work=/etc/systemd/system/$(systemd-escape --path --suffix=mount "$base/root/work")
if getent passwd codex-qa >/dev/null || getent group codex-qa >/dev/null ||
   [[ -e "$base" || -e "$home" || -e "$socket" || -e "$service" || -e "$work" ]]; then
  echo 'QA identity or files exist. Inspect the current installation before changing it.' >&2
  exit 73
fi

install -d -m 0755 "$base/root"/{qa,work,usr/bin,usr/lib,usr/lib64,proc,sys,dev,tmp,var/tmp}
ln -s usr/lib "$base/root/lib"
ln -s usr/lib64 "$base/root/lib64"
install -d -m 0755 "$home"
install -d -m 0755 "$home/.ssh"
printf 'restrict,command="%s/access" %s\n' "$base" "$key" > "$home/.ssh/authorized_keys"
chmod 0644 "$home/.ssh/authorized_keys"

cat > "$base/access" <<'SH'
#!/usr/bin/sh
set -eu
[ "${SSH_ORIGINAL_COMMAND:-}" = smoke ] || { echo 'Only the smoke command is available.' >&2; exit 64; }
awk '/^MemAvailable:/ { found=1; ok=($2 >= 1048576) } END { exit !(found && ok) }' /proc/meminfo ||
  { echo 'BLOCKED_CAPACITY' >&2; exit 75; }
result=$(timeout 36s nc -d -U /run/punctum-vps-qa.sock)
printf '%s\n' "$result"
case "$result" in
  *PUNCTUM_QA_EXIT=0) exit 0 ;;
  *) exit 1 ;;
esac
SH
chmod 0755 "$base/access"

cat > "$base/root/qa/smoke.py" <<'PY'
import os
import socket
import sqlite3
import subprocess
import sys
from pathlib import Path

assert os.getuid() != 0
assert os.getgroups() in ([], [os.getgid()])
assert not Path("/run/docker.sock").exists()
assert not os.access("/qa", os.W_OK)
assert not os.access("/dev/shm", os.W_OK)
assert not os.access("/tmp", os.W_OK)
assert not os.access("/var/tmp", os.W_OK)
work = Path("/work")
disk = os.statvfs(work)
capacity = disk.f_blocks * disk.f_frsize
assert capacity == 32 * 1024 * 1024, f"unexpected /work capacity: {capacity} bytes"
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    with socket.create_connection(listener.getsockname(), timeout=2) as client:
        client.sendall(b"synthetic")
        connection, _ = listener.accept()
        with connection:
            assert connection.recv(9, socket.MSG_WAITALL) == b"synthetic"

db = work / "smoke.sqlite"
with sqlite3.connect(db) as connection:
    connection.execute("create table proof (value text)")
    connection.execute("insert into proof values ('synthetic')")
connection.close()
with sqlite3.connect(db) as connection:
    assert connection.execute("select value from proof").fetchone() == ("synthetic",)
connection.close()
print(f"sqlite={sqlite3.sqlite_version} uid={os.getuid()} tmpfs_bytes={capacity}", flush=True)
release = Path("/qa/release")
node = release / "node"
if not node.is_file():
    sys.exit("The verified release runtime must be staged before requesting smoke.")
print(f"source_sha={(release / 'source-sha').read_text().strip()}", flush=True)
checks = [
    ["--version"],
    ["--test", "--test-concurrency=1", "scripts/live-parity-audit.test.mjs",
     "scripts/r4-g18-local-sqlite-restore-demo.test.mjs",
     "services/punctum-hostinger-node/isolated-sharp.test.mjs"],
    ["scripts/hostinger-r4-25mib-local-proof.mjs", "--fixture-check"],
]
try:
    output = [subprocess.check_output([node, *args], cwd=release, text=True) for args in checks]
except subprocess.CalledProcessError as error:
    print(error.stdout, file=sys.stderr)
    raise
print("".join(output), end="")
print("PUNCTUM_QA_EXIT=0")
PY

cat > "$socket" <<'UNIT'
[Unit]
Description=Punctum isolated QA socket

[Socket]
ListenStream=/run/punctum-vps-qa.sock
SocketGroup=codex-qa
SocketMode=0660
Accept=yes
MaxConnections=1
RemoveOnStop=yes

[Install]
WantedBy=sockets.target
UNIT

cat > "$service" <<'UNIT'
[Unit]
Description=Punctum isolated QA smoke
RequiresMountsFor=/opt/punctum-vps-qa/root/work

[Service]
Type=exec
DynamicUser=yes
RootDirectory=/opt/punctum-vps-qa/root
MountAPIVFS=yes
BindReadOnlyPaths=/usr/bin /usr/lib /usr/lib64
ProtectSystem=strict
ReadWritePaths=+/work
ProtectProc=invisible
PrivateDevices=yes
PrivateNetwork=yes
PrivateIPC=yes
NoNewPrivileges=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=yes
TemporaryFileSystem=/dev/shm:ro,nosuid,nodev,noexec,size=1M,mode=0555
TemporaryFileSystem=/tmp:ro,size=1M,mode=0555 /var/tmp:ro,size=1M,mode=0555
Environment=TMPDIR=/work
WorkingDirectory=/work
CPUQuota=100%
MemoryMax=384M
MemorySwapMax=0
TasksMax=64
RuntimeMaxSec=30s
TimeoutStopSec=3s
StandardInput=socket
StandardOutput=socket
StandardError=journal
ExecStart=/usr/bin/python3 -I /qa/smoke.py
UNIT

cat > "$work" <<'UNIT'
[Unit]
Description=Punctum disposable QA storage
StopWhenUnneeded=yes

[Mount]
What=tmpfs
Where=/opt/punctum-vps-qa/root/work
Type=tmpfs
Options=nosuid,nodev,noexec,size=32M,mode=1777
UNIT

useradd --system --user-group --no-create-home --home-dir "$home" --shell /bin/sh codex-qa
chgrp codex-qa "$base"
chmod 0750 "$base"
systemd-analyze verify "$socket" "$service" "$work"
systemctl enable --now punctum-vps-qa.socket

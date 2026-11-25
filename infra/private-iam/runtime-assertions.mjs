// Docker/Compose may return Linux capability names with or without CAP_.
// Canonicalize only that prefix; never discard extras/duplicates or case-fold.
export function canonicalCapabilities(values) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !/^(?:CAP_)?[A-Z][A-Z0-9_]*$/.test(value))) {
    throw new Error('invalid_capability_representation');
  }
  return values.map(value => value.replace(/^CAP_/, '')).sort();
}

// Input contains only Name/Pid/PPid/Uid fields selected inside the owned
// container. Return booleans/counts only; never process IDs, args or raw text.
export function nginxProcessIdentity(value) {
  const failed = { validRecords: false, masterRoot: false, workerCount: 0,
    workersDirectChildren: false, workersUnprivileged: false, passed: false };
  if (typeof value !== 'string' || value.length > 8192 || !value.trim()) return failed;
  const records = [];
  const seen = new Set();
  for (const line of value.trim().split('\n')) {
    const fields = line.split('\t');
    if (fields.length !== 7 || fields[0] !== 'nginx' || fields.slice(1).some(field => !/^(?:0|[1-9][0-9]{0,9})$/.test(field))) return failed;
    const [pid, parent, ...uids] = fields.slice(1).map(Number);
    if (pid < 1 || fields.slice(1).some(field => Number(field) > 4294967295) || seen.has(pid)) return failed;
    seen.add(pid);
    records.push({ pid, parent, uids });
  }
  const master = records.find(record => record.pid === 1);
  const workers = records.filter(record => record.pid !== 1);
  const masterRoot = Boolean(master && master.uids.every(uid => uid === 0));
  const workersDirectChildren = workers.length > 0 && workers.every(worker => worker.parent === 1);
  const workersUnprivileged = workers.length > 0 && workers.every(worker => worker.uids.every(uid => uid === 101));
  return { validRecords: true, masterRoot, workerCount: workers.length,
    workersDirectChildren, workersUnprivileged,
    passed: masterRoot && workersDirectChildren && workersUnprivileged };
}

export const nginxProcStatusCommand = `
for status in /proc/[0-9]*/status; do
  /bin/busybox awk '
    /^Name:/ { name=$2 }
    /^Pid:/ { pid=$2 }
    /^PPid:/ { parent=$2 }
    /^Uid:/ { real=$2; effective=$3; saved=$4; filesystem=$5 }
    END { if (name == "nginx") printf "nginx\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n", pid, parent, real, effective, saved, filesystem }
  ' "$status" 2>/dev/null
done
exit 0
`;

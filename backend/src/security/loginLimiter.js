// Login attempt limit, in memory (like the matches — enough for now, one server): after
// MAX_FAILS_PER_ACCOUNT failed logins for the same email from the same IP, or MAX_FAILS_PER_IP
// from one IP across any emails, further attempts are refused for the rest of the window. A
// successful login clears that email's count.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_ACCOUNT = 5;
const MAX_FAILS_PER_IP = 20;

const failures = new Map(); // key -> { count, first }

function entry(key, now) {
  const e = failures.get(key);
  if (!e || now - e.first > WINDOW_MS) return null;
  return e;
}

const keysFor = (ip, email) => ({ account: `acct:${ip}:${email}`, ip: `ip:${ip}` });

// null when the attempt may go ahead, else how many seconds until it can be retried.
function blockedFor(ip, email, now = Date.now()) {
  const { account, ip: ipKey } = keysFor(ip, email);
  const a = entry(account, now);
  const i = entry(ipKey, now);
  const blockedUntil = Math.max(
    a && a.count >= MAX_FAILS_PER_ACCOUNT ? a.first + WINDOW_MS : 0,
    i && i.count >= MAX_FAILS_PER_IP ? i.first + WINDOW_MS : 0,
  );
  return blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : null;
}

function recordFailure(ip, email, now = Date.now()) {
  Object.values(keysFor(ip, email)).forEach((key) => {
    const e = entry(key, now);
    failures.set(key, e ? { ...e, count: e.count + 1 } : { count: 1, first: now });
  });
}

function recordSuccess(ip, email) {
  failures.delete(keysFor(ip, email).account);
}

// Old entries go away on their own so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  [...failures.entries()].forEach(([k, e]) => { if (now - e.first > WINDOW_MS) failures.delete(k); });
}, WINDOW_MS).unref();

function resetAll() {
  failures.clear();
}

module.exports = { blockedFor, recordFailure, recordSuccess, resetAll, MAX_FAILS_PER_ACCOUNT, MAX_FAILS_PER_IP };

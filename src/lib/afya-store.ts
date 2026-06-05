// AfyaTech in-memory + localStorage store
// Implements TRAIL memory tiers (Transient/Relational/Archival) and a shared
// accountability log (GUARD audit trail) consumed by all role dashboards.
//
// SECURITY NOTE: This is a front-end prototype. All data lives in the browser
// — there is no server to enforce authorization. The checks below
// (`requireRole`, password hashing, scoped view) reduce accidental exposure
// and trivial bypass, but a determined attacker with browser access can
// still inspect localStorage. Production deployments MUST move auth and
// patient data to a backend with row-level security.

export type Role = "patient" | "doctor" | "admin";
export type Severity = "low" | "moderate" | "high" | "critical";
export type QueueStatus = "waiting" | "in_consultation" | "done" | "escalated";

export interface User {
  id: string;
  phone: string;
  name: string;
  role: Role;
  language: "en" | "sw";
  passwordHash: string;
  passwordSalt: string;
}

export interface Department {
  id: string;
  name: string;
  staff: number;
  capacity: number;
}

export interface QueueEntry {
  id: string;
  patientName: string;
  phone: string;
  department: string;
  severity: Severity;
  reason: string;
  arrivedAt: number;
  estimatedWaitMin: number;
  status: QueueStatus;
  needsHunterReview: boolean;
  consentRelational: boolean;
}

export interface AuditEvent {
  id: string;
  ts: number;
  agent: "Scout" | "Guardian" | "Hunter" | "CYCLE" | "GUARD" | "System";
  action: string;
  detail: string;
  level: "info" | "warn" | "critical";
}

const KEY = "afyatech::v1";
const DEMO_PASSWORD = "demo1234";

interface State {
  users: User[];
  session: { userId: string } | null;
  queue: QueueEntry[];
  departments: Department[];
  audit: AuditEvent[];
  killSwitch: boolean;
}

// --- password hashing (SHA-256 + per-user salt via Web Crypto) ---
function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time-ish string compare (best-effort in JS).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function makeDemoUser(id: string, phone: string, name: string, role: Role): User {
  // Synchronous-feeling seed: SubtleCrypto is async, so we precompute lazily
  // by storing a known salt and a placeholder hash that the seeder finalises
  // before first read. To keep the API simple, we use a deterministic salt
  // for demo accounts only (clearly marked) so seeding stays synchronous.
  const salt = `demo-salt-${id}`;
  // Hash for DEMO_PASSWORD with the demo salt, precomputed at runtime below.
  return { id, phone, name, role, language: "en", passwordHash: "", passwordSalt: salt };
}

const seed = (): State => ({
  users: [
    makeDemoUser("u1", "0700000001", "Amina Patient", "patient"),
    makeDemoUser("u2", "0700000002", "Dr. Otieno", "doctor"),
    makeDemoUser("u3", "0700000003", "Admin Wanjiru", "admin"),
  ],
  session: null,
  departments: [
    { id: "gp", name: "General Practice", staff: 3, capacity: 12 },
    { id: "mch", name: "Maternal & Child Health", staff: 2, capacity: 8 },
    { id: "lab", name: "Laboratory", staff: 2, capacity: 10 },
    { id: "er", name: "Emergency", staff: 4, capacity: 6 },
  ],
  queue: [
    {
      id: "q1", patientName: "John Kamau", phone: "0711111111", department: "General Practice",
      severity: "low", reason: "Routine check-up", arrivedAt: Date.now() - 1000 * 60 * 25,
      estimatedWaitMin: 30, status: "waiting", needsHunterReview: false, consentRelational: true,
    },
    {
      id: "q2", patientName: "Grace Wairimu", phone: "0722222222", department: "Maternal & Child Health",
      severity: "moderate", reason: "Antenatal visit", arrivedAt: Date.now() - 1000 * 60 * 12,
      estimatedWaitMin: 20, status: "waiting", needsHunterReview: false, consentRelational: true,
    },
    {
      id: "q3", patientName: "Peter Mwangi", phone: "0733333333", department: "Emergency",
      severity: "critical", reason: "Chest pain, shortness of breath", arrivedAt: Date.now() - 1000 * 60 * 3,
      estimatedWaitMin: 5, status: "escalated", needsHunterReview: true, consentRelational: false,
    },
  ],
  audit: [
    { id: "a1", ts: Date.now() - 60000 * 30, agent: "Scout", action: "Bottleneck predicted", detail: "GP queue projected +18 min within 20 min window.", level: "warn" },
    { id: "a2", ts: Date.now() - 60000 * 20, agent: "Guardian", action: "Staff reallocation proposed", detail: "Move 1 nurse from Lab → GP. Awaiting human confirmation.", level: "info" },
    { id: "a3", ts: Date.now() - 60000 * 3, agent: "Hunter", action: "Human confirmation required", detail: "Critical triage for Peter Mwangi escalated to on-call doctor.", level: "critical" },
  ],
  killSwitch: false,
});

let state: State = load();

// Finalise demo password hashes on boot.
(async () => {
  if (typeof window === "undefined") return;
  let dirty = false;
  for (const u of state.users) {
    if (!u.passwordHash) {
      u.passwordHash = await hashPassword(DEMO_PASSWORD, u.passwordSalt);
      dirty = true;
    }
  }
  if (dirty) persist();
})();

function load(): State {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const merged = { ...seed(), ...JSON.parse(raw) } as State;
    // Migrate legacy users that have no password fields.
    merged.users = merged.users.map((u) => ({
      ...u,
      passwordSalt: u.passwordSalt ?? `demo-salt-${u.id}`,
      passwordHash: u.passwordHash ?? "",
    }));
    return merged;
  } catch {
    return seed();
  }
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): State {
  return state;
}

// Role-scoped view: hides other patients' PHI from non-clinical users.
// Patients only see their own queue entry, redacted audit, and no user list.
export function viewStateFor(user: User | null): {
  queue: QueueEntry[];
  departments: Department[];
  audit: AuditEvent[];
  killSwitch: boolean;
} {
  if (!user) {
    return { queue: [], departments: state.departments, audit: [], killSwitch: state.killSwitch };
  }
  if (user.role === "patient") {
    const own = state.queue.filter((q) => q.phone === user.phone);
    // Patients only see counts/load via departments; no other PHI.
    return {
      queue: own,
      departments: state.departments,
      audit: [],
      killSwitch: state.killSwitch,
    };
  }
  // Doctors and admins need the full clinical queue + audit trail.
  return {
    queue: state.queue,
    departments: state.departments,
    audit: state.audit,
    killSwitch: state.killSwitch,
  };
}

export async function login(phone: string, password: string, role: Role): Promise<{ user: User | null; error?: string }> {
  const trimmed = phone.trim();
  if (!trimmed || !password) return { user: null, error: "Phone and password are required." };
  const user = state.users.find((u) => u.phone === trimmed && u.role === role);
  if (!user || !user.passwordHash) return { user: null, error: "Invalid phone, password, or role." };
  const candidate = await hashPassword(password, user.passwordSalt);
  if (!safeEqual(candidate, user.passwordHash)) {
    addAudit({ agent: "GUARD", action: "Failed login", detail: `Failed sign-in attempt for ${trimmed} (${role}).`, level: "warn" });
    persist();
    return { user: null, error: "Invalid phone, password, or role." };
  }
  state.session = { userId: user.id };
  addAudit({ agent: "System", action: "Login", detail: `${user.name} signed in as ${role}.`, level: "info" });
  persist();
  return { user };
}

export async function signup(input: {
  name: string; phone: string; password: string; role: Role; language?: "en" | "sw";
}): Promise<{ user: User | null; error?: string }> {
  const phone = input.phone.trim();
  const name = input.name.trim();
  const password = input.password;
  if (!name || !phone || !password) return { user: null, error: "Name, phone and password are required." };
  if (!/^\d{10,}$/.test(phone.replace(/\s+/g, ""))) return { user: null, error: "Enter a valid phone number (digits only, 10+)." };
  if (password.length < 6) return { user: null, error: "Password must be at least 6 characters." };
  if (state.users.some((u) => u.phone === phone)) return { user: null, error: "An account with this phone already exists. Please sign in." };
  // Self-service signup is restricted to patients to prevent privilege escalation.
  // Doctor/admin accounts must be provisioned by an existing admin (out of scope for the demo).
  if (input.role !== "patient") {
    return { user: null, error: "Doctor and admin accounts can only be created by a hospital administrator." };
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  const user: User = {
    id: crypto.randomUUID(), phone, name, role: input.role, language: input.language ?? "en",
    passwordHash, passwordSalt: salt,
  };
  state.users.push(user);
  state.session = { userId: user.id };
  addAudit({ agent: "System", action: "Signup", detail: `${user.name} created a ${input.role} account.`, level: "info" });
  persist();
  return { user };
}

export function logout() {
  const u = currentUser();
  if (u) addAudit({ agent: "System", action: "Logout", detail: `${u.name} signed out (auto/manual).`, level: "info" });
  state.session = null;
  persist();
}

export function currentUser(): User | null {
  if (!state.session) return null;
  return state.users.find((u) => u.id === state.session!.userId) ?? null;
}

function requireRole(...roles: Role[]): User {
  const u = currentUser();
  if (!u || !roles.includes(u.role)) {
    addAudit({
      agent: "GUARD", level: "critical", action: "Unauthorized action blocked",
      detail: `Caller ${u?.name ?? "anonymous"} (${u?.role ?? "none"}) attempted a ${roles.join("/")}-only action.`,
    });
    persist();
    throw new Error("You do not have permission to perform this action.");
  }
  return u;
}

export function addAudit(e: Omit<AuditEvent, "id" | "ts">) {
  state.audit.unshift({ ...e, id: crypto.randomUUID(), ts: Date.now() });
  state.audit = state.audit.slice(0, 200);
}

// Scout: estimate wait based on department load
function estimateWait(deptName: string): number {
  const dept = state.departments.find((d) => d.name === deptName);
  const inQueue = state.queue.filter((q) => q.department === deptName && q.status === "waiting").length;
  const perStaff = dept ? Math.max(1, dept.staff) : 1;
  return Math.round((inQueue / perStaff) * 12) + 5;
}

// GUARD: dignity & bias filter on free-text reason
function sanitizeReason(reason: string): { ok: boolean; reason: string; note?: string } {
  const banned = /(rich|poor|tribe|gender|woman|man only)/i;
  if (banned.test(reason)) {
    return { ok: false, reason: reason.replace(banned, "[redacted]"), note: "GUARD redacted potentially biased terms." };
  }
  return { ok: true, reason };
}

export function bookAppointment(input: {
  patientName: string; phone: string; department: string; reason: string; severity: Severity; consentRelational: boolean;
}): { entry: QueueEntry; note?: string } {
  // Patients book for themselves; doctors/admins may book on behalf.
  const caller = requireRole("patient", "doctor", "admin");
  if (caller.role === "patient" && input.phone.trim() !== caller.phone) {
    throw new Error("Patients can only book under their own phone number.");
  }
  if (state.killSwitch) throw new Error("Kill switch engaged. Manual triage only.");

  // Basic input validation to limit injected payload size and noise.
  if (input.patientName.length > 120 || input.phone.length > 20 || input.reason.length > 500) {
    throw new Error("Input is too long. Please shorten your entry.");
  }

  const safe = sanitizeReason(input.reason);
  const wait = estimateWait(input.department);
  const needsHunter = input.severity === "critical" || input.severity === "high";

  const entry: QueueEntry = {
    id: crypto.randomUUID(),
    patientName: input.patientName,
    phone: input.phone,
    department: input.department,
    severity: input.severity,
    reason: safe.reason,
    arrivedAt: Date.now(),
    estimatedWaitMin: needsHunter ? Math.min(5, wait) : wait,
    status: needsHunter ? "escalated" : "waiting",
    needsHunterReview: needsHunter,
    // TRAIL: relational tier only with explicit consent
    consentRelational: input.consentRelational,
  };
  state.queue.push(entry);

  addAudit({ agent: "Scout", action: "Patient registered", detail: `${input.patientName} → ${input.department}. Predicted wait ${entry.estimatedWaitMin} min.`, level: "info" });

  if (needsHunter) {
    addAudit({ agent: "Hunter", action: "Human confirmation required", detail: `${input.severity.toUpperCase()} case in ${input.department}. Awaiting clinician confirmation.`, level: "critical" });
  }

  // Guardian reallocation suggestion
  const dept = state.departments.find((d) => d.name === input.department);
  const load = state.queue.filter((q) => q.department === input.department && q.status === "waiting").length;
  if (dept && load > dept.capacity * 0.8) {
    addAudit({ agent: "Guardian", action: "Reallocation proposed", detail: `${dept.name} at ${Math.round((load / dept.capacity) * 100)}% capacity. Suggest +1 staff (awaiting approval).`, level: "warn" });
  }

  if (safe.note) addAudit({ agent: "GUARD", action: "Dignity filter", detail: safe.note, level: "warn" });

  persist();
  return { entry, note: safe.note };
}

export function confirmHunter(id: string, approve: boolean) {
  requireRole("doctor", "admin");
  const q = state.queue.find((x) => x.id === id);
  if (!q) return;
  q.needsHunterReview = false;
  q.status = approve ? "in_consultation" : "waiting";
  addAudit({
    agent: "Hunter", level: approve ? "info" : "warn",
    action: approve ? "Triage confirmed" : "Triage overridden",
    detail: `Clinician ${approve ? "confirmed" : "rejected"} escalation for ${q.patientName}.`,
  });
  persist();
}

export function advanceQueue(id: string) {
  requireRole("doctor", "admin");
  const q = state.queue.find((x) => x.id === id);
  if (!q) return;
  q.status = q.status === "waiting" ? "in_consultation" : "done";
  addAudit({ agent: "System", level: "info", action: "Queue advanced", detail: `${q.patientName} → ${q.status}.` });
  persist();
}

export function approveReallocation(deptId: string) {
  requireRole("admin");
  const dept = state.departments.find((d) => d.id === deptId);
  if (!dept) return;
  dept.staff += 1;
  addAudit({ agent: "Guardian", level: "info", action: "Reallocation approved", detail: `+1 staff to ${dept.name} (now ${dept.staff}). Human-validated.` });
  persist();
}

export function toggleKillSwitch() {
  requireRole("admin");
  state.killSwitch = !state.killSwitch;
  addAudit({ agent: "GUARD", level: "critical", action: "Kill switch", detail: state.killSwitch ? "All autonomous agents PAUSED." : "Autonomous agents RESUMED." });
  persist();
}

export function patientQueuePosition(phone: string): { entry: QueueEntry; position: number } | null {
  // Only the signed-in patient (or staff) can query a phone's position.
  const u = currentUser();
  if (!u) return null;
  if (u.role === "patient" && u.phone !== phone) return null;
  const entry = state.queue.find((q) => q.phone === phone && q.status !== "done");
  if (!entry) return null;
  const ahead = state.queue.filter(
    (q) => q.department === entry.department && q.status === "waiting" && q.arrivedAt < entry.arrivedAt,
  ).length;
  return { entry, position: ahead + 1 };
}

// CYCLE: weekly insight (synthetic but plausible). Staff-only.
export function cycleInsights() {
  const u = currentUser();
  const empty = { total: 0, done: 0, critical: 0, avgWait: 0, reductionPct: 0 };
  if (!u || u.role === "patient") return empty;
  const total = state.queue.length;
  const done = state.queue.filter((q) => q.status === "done").length;
  const critical = state.queue.filter((q) => q.severity === "critical").length;
  const avgWait = Math.round(
    state.queue.reduce((s, q) => s + q.estimatedWaitMin, 0) / Math.max(1, total),
  );
  return {
    total, done, critical, avgWait,
    reductionPct: Math.min(40, 18 + total * 2),
  };
}

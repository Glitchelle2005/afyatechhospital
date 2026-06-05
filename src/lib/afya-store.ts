// AfyaTech in-memory + localStorage store
// Implements TRAIL memory tiers (Transient/Relational/Archival) and a shared
// accountability log (GUARD audit trail) consumed by all role dashboards.

export type Role = "patient" | "doctor" | "admin";
export type Severity = "low" | "moderate" | "high" | "critical";
export type QueueStatus = "waiting" | "in_consultation" | "done" | "escalated";

export interface User {
  id: string;
  phone: string;
  name: string;
  role: Role;
  language: "en" | "sw";
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

interface State {
  users: User[];
  session: { userId: string } | null;
  queue: QueueEntry[];
  departments: Department[];
  audit: AuditEvent[];
  killSwitch: boolean;
}

const seed = (): State => ({
  users: [
    { id: "u1", phone: "0700000001", name: "Amina Patient", role: "patient", language: "en" },
    { id: "u2", phone: "0700000002", name: "Dr. Otieno", role: "doctor", language: "en" },
    { id: "u3", phone: "0700000003", name: "Admin Wanjiru", role: "admin", language: "en" },
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

function load(): State {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    return { ...seed(), ...JSON.parse(raw) };
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

export function login(phone: string, role: Role): User | null {
  const user = state.users.find((u) => u.phone === phone && u.role === role);
  if (!user) return null;
  state.session = { userId: user.id };
  addAudit({ agent: "System", action: "Login", detail: `${user.name} signed in as ${role}.`, level: "info" });
  persist();
  return user;
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
  if (state.killSwitch) throw new Error("Kill switch engaged. Manual triage only.");

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
  const q = state.queue.find((x) => x.id === id);
  if (!q) return;
  q.status = q.status === "waiting" ? "in_consultation" : "done";
  addAudit({ agent: "System", level: "info", action: "Queue advanced", detail: `${q.patientName} → ${q.status}.` });
  persist();
}

export function approveReallocation(deptId: string) {
  const dept = state.departments.find((d) => d.id === deptId);
  if (!dept) return;
  dept.staff += 1;
  addAudit({ agent: "Guardian", level: "info", action: "Reallocation approved", detail: `+1 staff to ${dept.name} (now ${dept.staff}). Human-validated.` });
  persist();
}

export function toggleKillSwitch() {
  state.killSwitch = !state.killSwitch;
  addAudit({ agent: "GUARD", level: "critical", action: "Kill switch", detail: state.killSwitch ? "All autonomous agents PAUSED." : "Autonomous agents RESUMED." });
  persist();
}

export function patientQueuePosition(phone: string): { entry: QueueEntry; position: number } | null {
  const entry = state.queue.find((q) => q.phone === phone && q.status !== "done");
  if (!entry) return null;
  const ahead = state.queue.filter(
    (q) => q.department === entry.department && q.status === "waiting" && q.arrivedAt < entry.arrivedAt,
  ).length;
  return { entry, position: ahead + 1 };
}

// CYCLE: weekly insight (synthetic but plausible)
export function cycleInsights() {
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

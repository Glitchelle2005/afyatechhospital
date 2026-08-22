// AfyaTech clinical triage engine (deterministic tier of the hybrid AI).
//
// This is the always-on, offline-capable part of the AI: a NEWS2/ESI-inspired
// scoring model that turns basic vitals + symptoms + live queue load into a
// numeric priority. The Lovable AI model (see ai-triage.functions.ts) refines
// this score with symptom reasoning when the device is online; if it is not,
// the hospital still gets a defensible, explainable priority.

export type Severity = "low" | "moderate" | "high" | "critical";

export interface Vitals {
  age: number | null;
  temperatureC: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
}

export interface TriageResult {
  /** 0-100. Higher = seen sooner. */
  priorityScore: number;
  severity: Severity;
  /** Plain-language bullet points a nurse or patient can read. */
  factors: string[];
  redFlags: string[];
  /** Which engine produced the final score. */
  source: "rules" | "ai+rules";
  reasoning?: string;
  recommendedDepartment?: string;
}

export const RED_FLAG_PATTERNS: { re: RegExp; label: string; weight: number }[] = [
  { re: /chest pain|kifua/i, label: "Chest pain", weight: 30 },
  { re: /can(no|')?t breathe|shortness of breath|breathing|kupumua/i, label: "Breathing difficulty", weight: 30 },
  { re: /unconscious|fainted|collapse|hazina fahamu/i, label: "Loss of consciousness", weight: 35 },
  { re: /heavy bleeding|bleeding|damu/i, label: "Bleeding", weight: 25 },
  { re: /convulsion|seizure|degedege/i, label: "Convulsions", weight: 30 },
  { re: /stroke|slurred|one side|weakness on/i, label: "Possible stroke", weight: 32 },
  { re: /labour|labor pains|contractions|uchungu/i, label: "Active labour", weight: 25 },
  { re: /poison|overdose|snake bite/i, label: "Poisoning / bite", weight: 30 },
  { re: /accident|injury|fracture|burn/i, label: "Trauma", weight: 18 },
  { re: /severe pain|maumivu makali/i, label: "Severe pain", weight: 14 },
];

function scoreTemperature(t: number | null, factors: string[]): number {
  if (t == null) return 0;
  if (t >= 39.5) { factors.push(`Very high fever (${t}°C)`); return 18; }
  if (t >= 38.5) { factors.push(`High fever (${t}°C)`); return 12; }
  if (t >= 37.8) { factors.push(`Mild fever (${t}°C)`); return 6; }
  if (t <= 35) { factors.push(`Low body temperature (${t}°C)`); return 16; }
  return 0;
}

function scoreBloodPressure(sys: number | null, dia: number | null, factors: string[]): number {
  let s = 0;
  if (sys != null) {
    if (sys >= 180) { factors.push(`Hypertensive crisis (${sys} systolic)`); s += 25; }
    else if (sys >= 160) { factors.push(`High blood pressure (${sys} systolic)`); s += 14; }
    else if (sys <= 90) { factors.push(`Low blood pressure (${sys} systolic) — shock risk`); s += 28; }
    else if (sys <= 100) { factors.push(`Borderline low blood pressure (${sys})`); s += 10; }
  }
  if (dia != null && dia >= 110) { factors.push(`High diastolic pressure (${dia})`); s += 8; }
  return s;
}

function scorePulse(p: number | null, factors: string[]): number {
  if (p == null) return 0;
  if (p >= 130) { factors.push(`Very fast pulse (${p} bpm)`); return 20; }
  if (p >= 110) { factors.push(`Fast pulse (${p} bpm)`); return 12; }
  if (p <= 45) { factors.push(`Very slow pulse (${p} bpm)`); return 18; }
  if (p <= 55) { factors.push(`Slow pulse (${p} bpm)`); return 8; }
  return 0;
}

function scoreAge(age: number | null, factors: string[]): number {
  if (age == null) return 0;
  if (age < 1) { factors.push("Infant under 1 year"); return 16; }
  if (age < 5) { factors.push("Child under 5 years"); return 10; }
  if (age >= 75) { factors.push(`Elderly patient (${age})`); return 12; }
  if (age >= 65) { factors.push(`Older adult (${age})`); return 6; }
  return 0;
}

export function severityFromScore(score: number): Severity {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 22) return "moderate";
  return "low";
}

/**
 * Deterministic triage. `queueLoad` is the number of patients already waiting
 * in the chosen department — a busy queue nudges borderline cases upward so
 * they are not lost behind a long first-come-first-served line.
 */
export function ruleTriage(input: {
  vitals: Vitals;
  symptoms: string;
  patientSeverityHint?: Severity;
  queueLoad: number;
}): TriageResult {
  const factors: string[] = [];
  const redFlags: string[] = [];
  let score = 0;

  score += scoreTemperature(input.vitals.temperatureC, factors);
  score += scoreBloodPressure(input.vitals.systolic, input.vitals.diastolic, factors);
  score += scorePulse(input.vitals.pulse, factors);
  score += scoreAge(input.vitals.age, factors);

  for (const f of RED_FLAG_PATTERNS) {
    if (f.re.test(input.symptoms)) {
      redFlags.push(f.label);
      score += f.weight;
    }
  }

  const hintWeight: Record<Severity, number> = { low: 0, moderate: 8, high: 20, critical: 34 };
  if (input.patientSeverityHint) {
    score += hintWeight[input.patientSeverityHint];
    if (input.patientSeverityHint !== "low") {
      factors.push(`Patient reported it as ${input.patientSeverityHint}`);
    }
  }

  // Queue-aware boost: the longer the line, the more the clinically urgent
  // must be pulled forward (this is the queue-optimisation half of the model).
  if (input.queueLoad > 0 && score >= 22) {
    const boost = Math.min(10, Math.round(input.queueLoad * 1.5));
    score += boost;
    factors.push(`${input.queueLoad} patient(s) already waiting — urgency weighted up by ${boost}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { priorityScore: score, severity: severityFromScore(score), factors, redFlags, source: "rules" };
}

/** Scout: estimated wait, now priority-aware. */
export function estimateWaitFor(score: number, staff: number, aheadOfPatient: number): number {
  const perStaff = Math.max(1, staff);
  const base = Math.round((aheadOfPatient / perStaff) * 12) + 5;
  if (score >= 70) return Math.min(base, 5);
  if (score >= 45) return Math.min(base, 15);
  return base;
}

export const PRIORITY_LABEL: Record<Severity, string> = {
  critical: "P1 · Emergency",
  high: "P2 · Urgent",
  moderate: "P3 · Standard",
  low: "P4 · Routine",
};

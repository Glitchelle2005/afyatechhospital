import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";

// AI tier of the hybrid triage. The deterministic rule score is computed on the
// client (offline-safe); this server function asks a Lovable AI model to read
// the free-text symptoms plus vitals and queue pressure, then agree with or
// adjust that score and explain the decision in plain language.

const InputSchema = z.object({
  age: z.number().nullable(),
  temperatureC: z.number().nullable(),
  systolic: z.number().nullable(),
  diastolic: z.number().nullable(),
  pulse: z.number().nullable(),
  symptoms: z.string(),
  department: z.string(),
  queueLoad: z.number(),
  ruleScore: z.number(),
  ruleSeverity: z.string(),
});

const OutputSchema = z.object({
  priorityScore: z.number(),
  severity: z.string(),
  reasoning: z.string(),
  recommendedDepartment: z.string(),
  redFlags: z.array(z.string()),
});

export type AiTriageResponse = {
  ok: boolean;
  priorityScore?: number;
  severity?: string;
  reasoning?: string;
  recommendedDepartment?: string;
  redFlags?: string[];
  error?: string;
};

export const aiTriage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AiTriageResponse> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "AI is not configured on this server." };

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const prompt = [
      "You are the triage assistant of a Kenyan public hospital. Decide how urgently this patient must be seen.",
      "",
      `Age: ${data.age ?? "unknown"}`,
      `Temperature: ${data.temperatureC ?? "unknown"} C`,
      `Blood pressure: ${data.systolic ?? "?"}/${data.diastolic ?? "?"} mmHg`,
      `Pulse: ${data.pulse ?? "unknown"} bpm`,
      `Symptoms (patient's own words): ${data.symptoms}`,
      `Department chosen: ${data.department}`,
      `Patients already waiting in that department: ${data.queueLoad}`,
      `Deterministic clinical score already computed: ${data.ruleScore}/100 (${data.ruleSeverity})`,
      "",
      "Return a priorityScore from 0-100 (higher = seen sooner) and severity as exactly one of:",
      "low, moderate, high, critical. Stay within 20 points of the deterministic score unless the",
      "symptoms clearly indicate a life threat, in which case go higher and never lower.",
      "reasoning: at most 2 short sentences, simple words, no medical jargon, no diagnosis.",
      "recommendedDepartment: the best-fit department, or repeat the chosen one.",
      "redFlags: short phrases naming any danger signs, empty array if none.",
      "Never discriminate on wealth, tribe, gender or language. Judge on clinical need only.",
    ].join("\n");

    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3.7-flash"),
        output: Output.object({ schema: OutputSchema }),
        prompt,
      });

      const severity = ["low", "moderate", "high", "critical"].includes(output.severity)
        ? output.severity
        : data.ruleSeverity;

      return {
        ok: true,
        priorityScore: Math.max(0, Math.min(100, Math.round(output.priorityScore))),
        severity,
        reasoning: output.reasoning.slice(0, 400),
        recommendedDepartment: output.recommendedDepartment,
        redFlags: (output.redFlags ?? []).slice(0, 6),
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        return { ok: false, error: "AI returned an unreadable answer; using the clinical score." };
      }
      const message = error instanceof Error ? error.message : "AI request failed.";
      return { ok: false, error: message };
    }
  });

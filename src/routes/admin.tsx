import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Activity, Brain, Eye, ShieldCheck, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { AuditLog } from "@/components/AuditLog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { approveReallocation, currentUser, cycleInsights } from "@/lib/afya-store";
import { useAfya } from "@/hooks/use-afya";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administrator — AfyaTech" }, { name: "description", content: "Oversee Scout, Guardian and Hunter agents with full audit trail." }] }),
  component: AdminDashboard,
});

const AGENTS = [
  { name: "Scout", icon: Eye, role: "Monitors flow & predicts bottlenecks", state: "Active" },
  { name: "Guardian", icon: Users, role: "Reallocates staff (with approval)", state: "Active" },
  { name: "Hunter", icon: ShieldCheck, role: "Escalates critical cases to humans", state: "Active" },
] as const;

function AdminDashboard() {
  const state = useAfya();
  const user = currentUser();
  const navigate = useNavigate();
  useEffect(() => { if (!user || user.role !== "admin") navigate({ to: "/" }); }, [user, navigate]);

  const insights = cycleInsights();

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Operations overview</h1>
          <p className="text-muted-foreground">CrewAI orchestration · ETHICAL SAVANNAH compliance</p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Users} label="Patients today" value={insights.total} />
          <Stat icon={Activity} label="Avg wait (min)" value={insights.avgWait} />
          <Stat icon={ShieldCheck} label="Critical cases" value={insights.critical} accent="destructive" />
          <Stat icon={Brain} label="Wait reduction" value={`${insights.reductionPct}%`} accent="success" />
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Agent ecosystem (RANK)</CardTitle>
              <CardDescription>Each agent has one role and a clear authority limit. Kill switch is global.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {AGENTS.map((a) => (
                <div key={a.name} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <a.icon className="size-5 text-primary" />
                    <span className="font-semibold">{a.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{a.role}</p>
                  <Badge variant={state.killSwitch ? "destructive" : "secondary"} className="mt-3">
                    {state.killSwitch ? "Paused" : a.state}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Departments</CardTitle>
              <CardDescription>Guardian suggestions need your approval.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {state.departments.map((d) => {
                const load = state.queue.filter((q) => q.department === d.name && q.status !== "done").length;
                const pct = Math.min(100, Math.round((load / d.capacity) * 100));
                return (
                  <div key={d.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{d.name}</span>
                      <span className="text-muted-foreground tabular-nums">{load}/{d.capacity}</span>
                    </div>
                    <Progress value={pct} />
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{d.staff} staff</span>
                      {pct > 70 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { approveReallocation(d.id); toast.success(`Added staff to ${d.name}.`); }}
                        >
                          Approve +1 staff
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accountability log (GUARD)</CardTitle>
            <CardDescription>Immutable trail of every agent action, override and anomaly.</CardDescription>
          </CardHeader>
          <CardContent>
            <AuditLog limit={50} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CYCLE — weekly insight</CardTitle>
            <CardDescription>Plain-language summary for the hospital board.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <p>
              This week, AfyaTech handled <strong>{insights.total}</strong> patient encounters with an average wait of{" "}
              <strong>{insights.avgWait} minutes</strong>. Guardian proposed staff reallocations during peak hours which, once approved by you,
              contributed to an estimated <strong>{insights.reductionPct}%</strong> reduction versus baseline.
            </p>
            <p>
              Hunter escalated <strong>{insights.critical}</strong> critical case(s) for human confirmation. No biased triage decisions were
              detected by GUARD this period. Patient data remained under Kenyan data sovereignty (TRAIL · Land Rights).
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, accent = "primary",
}: { icon: typeof Users; label: string; value: string | number; accent?: "primary" | "success" | "destructive" }) {
  const bg = accent === "success" ? "bg-success/10 text-success" : accent === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className={`flex size-12 items-center justify-center rounded-md ${bg}`}>
          <Icon className="size-6" />
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

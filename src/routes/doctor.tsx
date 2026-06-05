import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { advanceQueue, confirmHunter, currentUser } from "@/lib/afya-store";
import { useAfya } from "@/hooks/use-afya";

export const Route = createFileRoute("/doctor")({
  head: () => ({ meta: [{ title: "Doctor — AfyaTech" }, { name: "description", content: "Confirm critical triage and advance the patient queue." }] }),
  component: DoctorDashboard,
});

const sevColor = {
  low: "secondary",
  moderate: "secondary",
  high: "default",
  critical: "destructive",
} as const;

function DoctorDashboard() {
  const state = useAfya();
  const user = currentUser();
  const navigate = useNavigate();
  useEffect(() => { if (!user || (user.role !== "doctor" && user.role !== "admin")) navigate({ to: "/" }); }, [user, navigate]);
  if (!user || (user.role !== "doctor" && user.role !== "admin")) return null;

  const escalated = state.queue.filter((q) => q.needsHunterReview);
  const active = state.queue.filter((q) => q.status !== "done").sort((a, b) => {
    const order = { critical: 0, high: 1, moderate: 2, low: 3 } as const;
    return order[a.severity] - order[b.severity] || a.arrivedAt - b.arrivedAt;
  });

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Clinical queue</h1>
          <p className="text-muted-foreground">Hunter Agent has flagged cases needing your confirmation.</p>
        </div>

        {escalated.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-5" /> Awaiting your confirmation
              </CardTitle>
              <CardDescription>Hunter requires a human to approve or reject these triage decisions (RANK · Authority).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {escalated.map((q) => (
                <div key={q.id} className="flex flex-col gap-3 rounded-md border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">{q.patientName} <Badge variant="destructive" className="ml-2 capitalize">{q.severity}</Badge></div>
                    <div className="text-sm text-muted-foreground">{q.department} · {q.reason}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => { confirmHunter(q.id, true); toast.success("Triage confirmed."); }}
                      className="bg-success text-success-foreground hover:bg-success/90"
                    >
                      <CheckCircle2 className="mr-1.5 size-4" /> Confirm escalation
                    </Button>
                    <Button variant="outline" onClick={() => { confirmHunter(q.id, false); toast.info("Override logged."); }}>
                      Override to normal
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Active queue</CardTitle>
            <CardDescription>Sorted by severity (HUNT orchestration), then arrival time.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Wait (min)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium">{q.patientName}</TableCell>
                      <TableCell>{q.department}</TableCell>
                      <TableCell>
                        <Badge variant={sevColor[q.severity]} className="capitalize">{q.severity}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{Math.round((Date.now() - q.arrivedAt) / 60000)}</TableCell>
                      <TableCell className="capitalize">{q.status.replace("_", " ")}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={q.needsHunterReview}
                          onClick={() => advanceQueue(q.id)}
                        >
                          {q.status === "waiting" ? "Call in" : "Mark done"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {active.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Queue is empty. 🎉</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, MapPin, Search } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { bookAppointment, currentUser, patientQueuePosition, type Severity } from "@/lib/afya-store";
import { useAfya } from "@/hooks/use-afya";

export const Route = createFileRoute("/patient")({
  head: () => ({ meta: [{ title: "Patient — AfyaTech" }, { name: "description", content: "Book a visit and track your queue position in real time." }] }),
  component: PatientDashboard,
});

const SEVERITIES: { value: Severity; label: string; help: string }[] = [
  { value: "low", label: "Mild — routine", help: "Check-up, follow-up, mild symptoms" },
  { value: "moderate", label: "Moderate", help: "Fever, persistent pain, infection" },
  { value: "high", label: "Serious", help: "Heavy bleeding, severe pain" },
  { value: "critical", label: "Emergency", help: "Chest pain, breathing trouble, unconscious" },
];

function PatientDashboard() {
  const state = useAfya();
  const user = currentUser();
  const navigate = useNavigate();

  useEffect(() => { if (!user || user.role !== "patient") navigate({ to: "/" }); }, [user, navigate]);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [dept, setDept] = useState(state.departments[0]?.name ?? "");
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<Severity>("low");
  const [consent, setConsent] = useState(false);
  const [search, setSearch] = useState("");

  const filteredDepts = useMemo(
    () => state.departments.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())),
    [state.departments, search],
  );

  const myQueue = patientQueuePosition(phone);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !reason.trim()) {
      toast.error("Please fill in your name, phone, and reason for the visit.");
      return;
    }
    try {
      const { entry, note } = bookAppointment({ patientName: name, phone, department: dept, reason, severity, consentRelational: consent });
      toast.success(`Appointment booked. Estimated wait: ${entry.estimatedWaitMin} min.`);
      if (note) toast.warning(note);
      setReason("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Hello, {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-muted-foreground">Book a visit or check your place in the queue.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Book a visit</CardTitle>
              <CardDescription>Tell us a little about your visit. Use simple words.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ph">Phone number</Label>
                    <Input id="ph" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12" required />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Find a service</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search e.g. maternal, lab, emergency"
                      className="h-12 pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dept">Department</Label>
                  <Select value={dept} onValueChange={setDept}>
                    <SelectTrigger id="dept" className="h-12 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredDepts.map((d) => (
                        <SelectItem key={d.id} value={d.name} className="text-base">
                          {d.name} · {d.staff} staff
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>How serious is it?</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSeverity(s.value)}
                        className={`rounded-lg border-2 p-3 text-left transition-colors ${
                          severity === s.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                        }`}
                      >
                        <div className="font-semibold">{s.label}</div>
                        <div className="text-xs text-muted-foreground">{s.help}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for visit</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="E.g. I have had a fever for 2 days."
                    rows={3}
                    required
                  />
                </div>

                <label className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
                  <Checkbox checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} className="mt-0.5" />
                  <span>
                    <span className="font-semibold">I consent</span> to AfyaTech remembering my visit history to improve my care
                    (TRAIL Relational tier). You can withdraw consent at any time.
                  </span>
                </label>

                <Button type="submit" className="h-12 w-full text-base">Book appointment</Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="size-5 text-primary" /> Your queue</CardTitle>
                <CardDescription>Live position and estimated wait.</CardDescription>
              </CardHeader>
              <CardContent>
                {myQueue ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Position</span>
                      <span className="text-3xl font-bold tabular-nums">#{myQueue.position}</span>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-muted-foreground">Estimated wait</span>
                        <span className="font-semibold">{myQueue.entry.estimatedWaitMin} min</span>
                      </div>
                      <Progress value={Math.max(5, 100 - myQueue.entry.estimatedWaitMin * 2)} />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="size-4" /> {myQueue.entry.department}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="capitalize">{myQueue.entry.severity}</Badge>
                      <Badge variant={myQueue.entry.status === "escalated" ? "destructive" : "outline"} className="capitalize">
                        {myQueue.entry.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">You are not in a queue yet. Book a visit to join.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Need help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>• Call <strong>0800 720 222</strong> (toll-free)</p>
                <p>• SMS <strong>HELP</strong> to <strong>40483</strong></p>
                <p>• Pay with <strong>M-Pesa Paybill 555111</strong></p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

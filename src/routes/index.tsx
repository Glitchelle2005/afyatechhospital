import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, ShieldCheck, Stethoscope, UserRound, Users } from "lucide-react";
import { login, signup, type Role } from "@/lib/afya-store";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AfyaTech — Reduce hospital waiting times" },
      { name: "description", content: "AfyaTech is an AI-enabled triage and queue system for Kenyan hospitals. Patients, doctors and administrators in one simple app." },
      { property: "og:title", content: "AfyaTech — Reduce hospital waiting times" },
      { property: "og:description", content: "AI agents reduce hospital waiting times by up to 40% while preserving patient dignity and data sovereignty." },
    ],
  }),
  component: Landing,
});

const ROLES: { role: Role; label: string; icon: typeof UserRound; demoPhone: string; hint: string }[] = [
  { role: "patient", label: "Patient", icon: UserRound, demoPhone: "0700000001", hint: "Book a visit, see your queue position." },
  { role: "doctor", label: "Doctor", icon: Stethoscope, demoPhone: "0700000002", hint: "Confirm triage, advance the queue." },
  { role: "admin", label: "Administrator", icon: ShieldCheck, demoPhone: "0700000003", hint: "Oversee agents, audit & insights." },
];

function Landing() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("patient");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup") {
      if (!name.trim() || !phone.trim() || !password.trim()) {
        toast.error("Enter your name, phone number and password to create an account.");
        return;
      }
      const { user, error } = signup({ name, phone, role });
      if (!user) { toast.error(error ?? "Could not create account."); return; }
      toast.success(`Welcome, ${user.name}. Your account is ready.`);
      navigate({ to: `/${role}` });
      return;
    }
    if (!phone.trim() || !password.trim()) {
      toast.error("Enter your phone number and password to continue.");
      return;
    }
    const u = login(phone.trim(), role);
    if (!u) {
      toast.error("We could not find that account. Try a demo number below or sign up.");
      return;
    }
    toast.success(`Welcome, ${u.name}.`);
    navigate({ to: `/${role}` });
  };

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
              <Activity className="size-4" /> Live triage simulation
            </div>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
              Less waiting. <span className="text-primary">More healing.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              AfyaTech coordinates three AI agents — Scout, Guardian and Hunter — to cut hospital waiting times by up to <strong>40%</strong>, while a human always confirms critical decisions.
            </p>
            <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
              <li className="flex items-center gap-2"><Users className="size-4 text-primary" /> Works for Patients, Doctors & Admins</li>
              <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Patient data stays under Kenyan sovereignty</li>
              <li className="flex items-center gap-2"><Activity className="size-4 text-primary" /> Optimised for low-end phones & slow networks</li>
              <li className="flex items-center gap-2"><Stethoscope className="size-4 text-primary" /> Clinician confirms every critical triage</li>
            </ul>
          </div>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-2xl">{mode === "signin" ? "Sign in" : "Create account"}</CardTitle>
              <CardDescription>
                {mode === "signin"
                  ? "Use your phone number. Choose the role that matches you."
                  : "New here? Register in seconds with your name and phone number."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")} className="mb-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin" className="text-base">Sign in</TabsTrigger>
                  <TabsTrigger value="signup" className="text-base">Sign up</TabsTrigger>
                </TabsList>
              </Tabs>

              <Tabs value={role} onValueChange={(v) => setRole(v as Role)}>
                <TabsList className="grid w-full grid-cols-3">
                  {ROLES.map((r) => (
                    <TabsTrigger key={r.role} value={r.role} className="text-base">
                      <r.icon className="mr-1.5 size-4" /> {r.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {ROLES.map((r) => (
                  <TabsContent key={r.role} value={r.role} className="mt-4">
                    <p className="mb-4 text-sm text-muted-foreground">{r.hint}</p>
                  </TabsContent>
                ))}
              </Tabs>

              <form onSubmit={submit} className="space-y-4" noValidate>
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-base">Full name</Label>
                    <Input
                      id="name"
                      autoComplete="name"
                      placeholder="e.g. Amina Hassan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 text-lg"
                      required
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-base">Phone number</Label>
                  <Input
                    id="phone"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="07XX XXX XXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-12 text-lg"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-base">Password</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        onClick={() => toast.info("A reset code will be sent via SMS. (Demo)")}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 text-lg"
                    required
                  />
                </div>
                <Button type="submit" className="h-12 w-full text-base">
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>


                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="mb-1 font-semibold">Demo accounts (any password)</div>
                  <ul className="grid gap-1 text-muted-foreground">
                    {ROLES.map((r) => (
                      <li key={r.role}>
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          onClick={() => { setPhone(r.demoPhone); setPassword("demo"); setRole(r.role); }}
                        >
                          {r.label}: {r.demoPhone}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  No smartphone? Dial <strong>*483*55#</strong> on any phone to access AfyaTech via USSD.
                </p>
              </form>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

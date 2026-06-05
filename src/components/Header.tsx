import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Activity, LogOut, Power } from "lucide-react";
import { useEffect } from "react";
import { currentUser, logout, toggleKillSwitch } from "@/lib/afya-store";
import { useAfya } from "@/hooks/use-afya";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/patient", label: "Patient", role: "patient" as const },
  { to: "/doctor", label: "Doctor", role: "doctor" as const },
  { to: "/admin", label: "Admin", role: "admin" as const },
];

export function Header() {
  const state = useAfya();
  const user = currentUser();
  const navigate = useNavigate();
  const loc = useLocation();

  // Auto-logout after 10 minutes idle
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => { logout(); navigate({ to: "/" }); }, 10 * 60 * 1000);
    };
    reset();
    const evs: Array<keyof WindowEventMap> = ["click", "keydown", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset));
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [user, navigate]);

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-bold">AfyaTech</div>
            <div className="text-xs text-muted-foreground">Less waiting. More healing.</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                loc.pathname.startsWith(n.to)
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {state.killSwitch && <Badge variant="destructive">Agents paused</Badge>}
          {user ? (
            <>
              <div className="hidden text-right text-xs sm:block">
                <div className="font-semibold">{user.name}</div>
                <div className="text-muted-foreground capitalize">{user.role}</div>
              </div>
              {user.role === "admin" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try { toggleKillSwitch(); } catch (e) { /* role-guarded */ }
                  }}
                  aria-label="Emergency kill switch for all autonomous agents"
                  title="Kill switch (RANK · admin only)"
                >
                  <Power className="size-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { logout(); navigate({ to: "/" }); }}
              >
                <LogOut className="mr-1 size-4" /> Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

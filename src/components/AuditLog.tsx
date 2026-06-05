import { useAfya } from "@/hooks/use-afya";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const dot = {
  info: "bg-primary",
  warn: "bg-warning",
  critical: "bg-destructive",
} as const;

export function AuditLog({ limit = 12 }: { limit?: number }) {
  const { audit } = useAfya();
  return (
    <ScrollArea className="h-[360px] rounded-md border bg-card p-3">
      <ol className="space-y-3">
        {audit.slice(0, limit).map((e) => (
          <li key={e.id} className="flex gap-3 text-sm">
            <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot[e.level]}`} aria-hidden />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">{e.agent}</Badge>
                <span className="font-semibold">{e.action}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">{e.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </ScrollArea>
  );
}

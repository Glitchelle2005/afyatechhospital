// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Force Nitro to build for Vercel when deploying outside Lovable's sandbox.
// Inside the Lovable sandbox we keep the default Cloudflare build so the
// in-editor preview / publish flow keeps working.
const isLovableSandbox =
  !process.env.VERCEL &&
  (!!process.env.LOVABLE_SANDBOX || !!process.env.DEV_SERVER__PROJECT_PATH);

// On Vercel, Nitro's `vercel` preset emits the Build Output API v3 folder
// (.vercel/output) which Vercel auto-detects when no framework preset or
// output directory overrides it (see vercel.json: "framework": null).

});

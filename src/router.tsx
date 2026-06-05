import { QueryClient } from "@tanstack/react-query";
import { createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Hash history keeps all routing on the client (e.g. /#/patient), so any
  // static host (Vercel, GitHub Pages, etc.) can serve a single index.html
  // without needing SPA rewrite rules.
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    history: typeof window !== "undefined" ? createHashHistory() : undefined,
  });

  return router;
};

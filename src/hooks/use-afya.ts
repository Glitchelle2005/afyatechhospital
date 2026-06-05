import { useSyncExternalStore } from "react";
import { getState, subscribe } from "@/lib/afya-store";

export function useAfya() {
  return useSyncExternalStore(
    (cb) => subscribe(cb),
    () => getState(),
    () => getState(),
  );
}

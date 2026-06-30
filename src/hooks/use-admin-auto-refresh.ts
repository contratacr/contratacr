import { useEffect, type DependencyList } from "react";

export const ADMIN_REFRESH_EVENT = "contratacr:admin-refresh";

export function useAdminAutoRefresh(onRefresh: () => void, deps: DependencyList = []) {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      onRefresh();
    };
    window.addEventListener(ADMIN_REFRESH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(ADMIN_REFRESH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

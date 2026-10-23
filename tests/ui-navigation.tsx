import { useMemo, useSyncExternalStore } from "react";
function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}
export const navigation = {
  push(href: string) {
    history.pushState(null, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  },
  replace(href: string) {
    history.replaceState(null, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  },
};
export function useRouter() {
  return navigation;
}
export function useSearchParams() {
  const value = useSyncExternalStore(subscribe, () => location.search);
  return useMemo(() => new URLSearchParams(value), [value]);
}
export function usePathname() {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

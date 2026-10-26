import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  "internal-users":
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M18 8v6 M15 11h6",
  "user-block": "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 10l5 5 M22 10l-5 5",
  "user-unblock": "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 12l2 2 4-5",
  plans: "M12 3 3 8l9 5 9-5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  workspaces:
    "M3 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16 M17 9h4v12 M7 7h2 M11 7h2 M7 11h2 M11 11h2 M7 15h2 M11 15h2 M7 21v-3h6v3 M1 21h22",
  projects:
    "M3 7V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z",
  credits: "m13 2-9 12h7l-1 8 10-12h-7l1-8z",
  payments: "M3 5h18v14H3z M3 9h18 M7 15h3",
  analytics: "M4 3v18h18 M8 16v-5 M13 16V7 M18 16v-9",
  settings:
    "m12 8 3 2v4l-3 2-3-2v-4l3-2z M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3z",
  search: "m21 21-5-5 M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  arrow: "M7 17 17 7 M7 7h10v10",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  refresh:
    "M20 7a9 9 0 0 0-15-2L2 8 M2 2v6h6 M4 17a9 9 0 0 0 15 2l3-3 M22 22v-6h-6",
  edit: "M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z M13.5 6.5l4 4",
  trash: "M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  calendar: "M4 5h16v16H4z M16 3v4 M8 3v4 M4 11h16",
  close: "m6 6 12 12 M6 18 18 6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  check: "m5 12 4 4L19 6",
  info: "M12 11v6 M12 7h.01 M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z m-4 9 3 3 5-6",
  logout: "M9 3H3v18h6 M9 12h13 m-5-5 5 5-5 5",
  clock: "M12 7v5l3 2 M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0",
  mail: "M3 5h18v14H3z m0 1 9 7 9-7",
  filter: "M3 4h18l-7 8v7l-4 2v-9L3 4z",
  globe:
    "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M3 12h18 M12 3c-5 5-5 13 0 18 5-5 5-13 0-18",
  help: "M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 18h.01 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0",
  lock: "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  "eye-off": "m3 3 18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 4.2A11 11 0 0 1 12 4c6.5 0 10 8 10 8a16 16 0 0 1-3 4.1 M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8a10 10 0 0 0 4.1-.9",
  trend: "m3 17 6-6 4 4 8-11 M15 4h6v6",
  empty: "M4 7 12 3l8 4v10l-8 4-8-4V7z M4 7l8 4 8-4 M12 11v10",
  dot: "M12 12h.01",
};
export function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name] || paths.overview} />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img
        className="brand-logo"
        src="/horizon-orbit-logo-transparent.png"
        alt=""
        width="1491"
        height="1055"
      />
    </span>
  );
}

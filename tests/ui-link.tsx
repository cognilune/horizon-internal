import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigation } from "./ui-navigation";
export default function Link({
  href,
  onClick,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      {...props}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        onClick?.(e);
        if (href) navigation.push(href);
      }}
    >
      {children}
    </a>
  );
}

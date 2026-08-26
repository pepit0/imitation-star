"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Common = {
  children?: ReactNode;
  className?: string;
};

type AsLink = Common & {
  href: string;
  onClick?: () => void;
};

type AsButton = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

export type AppBackButtonProps = AsLink | AsButton;

/** Shared back control for the native app (and matching in-game chrome). */
export default function AppBackButton(props: AppBackButtonProps) {
  const label = props.children ?? "← Back";
  const cls = props.className
    ? `app-back-btn ${props.className}`
    : "app-back-btn";

  if (props.href) {
    return (
      <Link href={props.href} className={cls} onClick={props.onClick}>
        {label}
      </Link>
    );
  }

  const {
    href: _href,
    className: _className,
    children: _children,
    ...buttonProps
  } = props;

  return (
    <button type="button" className={cls} {...buttonProps}>
      {label}
    </button>
  );
}

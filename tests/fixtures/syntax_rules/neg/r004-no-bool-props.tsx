/** Negative: component props with 0 boolean flags — clean. */
import React from "react";

interface CardProps {
  title: string;
  variant: "primary" | "secondary";
}
export function Card({ title, variant }: CardProps) {
  return <div className={variant}>{title}</div>;
}

// Positive: component props with 3 boolean flags — triggers TS-REACT-R004
import React from "react";

interface CardProps {
  title: string;
  isHighlighted: boolean;
  isCollapsible: boolean;
  isAnimated: boolean;
}
export function Card({ title, isHighlighted, isCollapsible, isAnimated }: CardProps) {
  return <div className={isHighlighted ? "highlight" : ""}>{title}</div>;
}

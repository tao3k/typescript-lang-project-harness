/** Negative: component has no browser API — clean. */
import React from "react";

export function SimpleDisplay() {
  const [count, setCount] = React.useState(0);
  return <div>{count}</div>;
}

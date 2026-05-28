/** Negative: pure presentational component — clean. */
import React from "react";

interface Props {
  name: string;
}
export function Greeting({ name }: Props) {
  return <h1>Hello {name}</h1>;
}

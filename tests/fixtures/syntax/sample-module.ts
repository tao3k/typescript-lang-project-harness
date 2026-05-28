import { format as _format } from "node:util";
import type { User } from "./types.js";

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
}

export type Result<T, E = Error> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: E;
    };

export enum Status {
  Active = "active",
  Inactive = "inactive",
}

export async function fetchUser(id: string): Promise<ApiResponse<User>> {
  const response = await fetch(`/api/users/${id}`);
  const data: unknown = await response.json();
  return { data: data as User, status: response.status };
}

export function validateEmail(email: string): Result<string> {
  if (email.includes("@")) {
    return { ok: true, value: email };
  }
  return { ok: false, error: new Error("Invalid email") };
}

export const DEFAULT_TIMEOUT = 5000;

import "./side-effect.js";
import type { Extra } from "./extra.js";
import { helper, type HelperType } from "./helpers.js";
import * as Lib from "./lib.js";

export { Lib };
export type { Extra };
export { helper, type HelperType };

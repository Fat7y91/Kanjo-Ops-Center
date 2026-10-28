import { todayIso } from "./core";

export function today(): string {
  return todayIso();
}

export function yesterday(): string {
  return todayIso(-1);
}

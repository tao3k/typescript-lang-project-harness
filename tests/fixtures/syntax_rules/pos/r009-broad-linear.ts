// Positive fixture: 35 statements — triggers AGENT-TS-R009
import type { TsParsedModule } from "../model.js";

export function broadAlgorithm(data: string[]): string[] {
  const a = data.map((x) => x.trim());
  const b = a.filter((x) => x.length > 0);
  const c = b.map((x) => x.toLowerCase());
  const d = c.filter((x) => x.startsWith("a"));
  const e = d.map((x) => x.toUpperCase());
  const f = e.filter((x) => x.length > 1);
  const g = f.map((x) => x.replace("A", ""));
  const h = g.filter((x) => x.length > 0);
  const i = h.map((x) => x.slice(0, 5));
  const j = i.filter((x) => x.length === 5);
  const k = j.map((x) => x.split("").reverse().join(""));
  const l = k.filter((x) => x.length > 0);
  const m = l.map((x) => x.slice(0, 3));
  const n = m.filter((x) => x.length === 3);
  const o = n.map((x) => x.repeat(2));
  const p = o.filter((x) => x.length > 0);
  const q = p.map((x) => x.slice(1));
  const r = q.filter((x) => x.length > 0);
  const s = r.map((x) => x.repeat(2));
  const t = s.filter((x) => x.length > 0);
  const u = t.map((x) => x.slice(1));
  const v = u.filter((x) => x.length > 0);
  const w = v.map((x) => x.repeat(2));
  const xResult = w.filter((x) => x.length > 0);
  const y = xResult.map((x) => x.slice(1));
  const z = y.filter((x) => x.length > 0);
  const aa = z.map((x) => x.repeat(2));
  const bb = aa.filter((x) => x.length > 0);
  const cc = bb.map((x) => x.slice(1));
  const dd = cc.filter((x) => x.length > 0);
  const ee = dd.map((x) => x.repeat(2));
  const ff = ee.filter((x) => x.length > 0);
  return ff;
}

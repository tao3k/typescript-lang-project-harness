export function nested(value: number): number {
  if (value > 0) {
    if (value > 1) {
      if (value > 2) {
        if (value > 3) {
          if (value > 4) {
            return value;
          }
        }
      }
    }
  }
  return 0;
}

export function route(kind: string): number {
  if (kind === "alpha") {
    return 1;
  } else if (kind === "beta") {
    return 2;
  } else if (kind === "gamma") {
    return 3;
  } else if (kind === "delta") {
    return 4;
  }
  return 0;
}

export function traverse(groups: readonly (readonly number[])[]): number {
  let total = 0;
  for (const group of groups) {
    for (const value of group) {
      if (value > 10) {
        total += value;
      }
      if (value < 0) {
        total -= value;
      }
      if (value === 0) {
        total += 0;
      }
      if (value === 1) {
        total += 1;
      }
    }
  }
  return total;
}

export function broad(value: number): number {
  const step0 = value + 0;
  const step1 = value + 1;
  const step2 = value + 2;
  const step3 = value + 3;
  const step4 = value + 4;
  const step5 = value + 5;
  const step6 = value + 6;
  const step7 = value + 7;
  const step8 = value + 8;
  const step9 = value + 9;
  const step10 = value + 10;
  const step11 = value + 11;
  const step12 = value + 12;
  const step13 = value + 13;
  const step14 = value + 14;
  const step15 = value + 15;
  const step16 = value + 16;
  const step17 = value + 17;
  const step18 = value + 18;
  const step19 = value + 19;
  const step20 = value + 20;
  const step21 = value + 21;
  const step22 = value + 22;
  const step23 = value + 23;
  const step24 = value + 24;
  const step25 = value + 25;
  const step26 = value + 26;
  const step27 = value + 27;
  const step28 = value + 28;
  const step29 = value + 29;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  void value;
  return step29;
}

export function transform(values: readonly number[]): number[] {
  const doubled: number[] = [];
  for (const value of values) {
    if (value > 0) {
      doubled.push(value * 2);
    }
  }
  return doubled;
}

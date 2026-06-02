export async function beta(values: string[], mapper: (value: string) => Promise<string>) {
  const output: string[] = [];
  for (const value of values) {
    if (value.trim() === "") {
      continue;
    }
    output.push(await mapper(value));
  }
  return output;
}

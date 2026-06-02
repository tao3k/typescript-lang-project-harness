function sealed<T extends new (...args: any[]) => object>(ctor: T): T {
  return ctor;
}

@sealed
export class Service {
  readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  async run(value: string): Promise<string> {
    if (value.length === 0) {
      throw new Error("empty");
    }
    return `${this.prefix}:${await Promise.resolve(value)}`;
  }
}

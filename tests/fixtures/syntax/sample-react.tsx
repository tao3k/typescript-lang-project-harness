import { useState, useEffect, useCallback } from "react";

interface Props {
  readonly title: string;
  readonly count: number;
}

export function HelloWorld({ title, count }: Props) {
  const [name, setName] = useState<string>("");
  const [flag, setFlag] = useState<boolean>(false);

  useEffect(() => {
    document.title = `${title}: ${count}`;
  }, [title, count]);

  const handleClick = useCallback(() => {
    setName(Math.random().toString(36));
    if (flag) {
      setFlag(false);
    } else {
      setFlag(true);
    }
  }, [flag]);

  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count}</p>
      <button onClick={handleClick}>Click</button>
      <span>{name}</span>
    </div>
  );
}

export function useCounter(initial: number) {
  const [value, setValue] = useState(initial);
  const increment = () => setValue((v) => v + 1);
  return { value, increment } as const;
}

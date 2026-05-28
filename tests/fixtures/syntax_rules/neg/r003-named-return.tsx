/** Negative: hook returns named object — clean. */
export function useToggle(initial: boolean) {
  const [value, setValue] = React.useState(initial);
  const toggle = React.useCallback(() => setValue((v) => !v), []);
  return { value, toggle };
}

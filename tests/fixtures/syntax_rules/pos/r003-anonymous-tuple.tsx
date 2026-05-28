// Positive: hook returns anonymous tuple — triggers TS-REACT-R003
export function useToggle(initial: boolean) {
  const [value, setValue] = React.useState(initial);
  const toggle = React.useCallback(() => setValue((v) => !v), []);
  return [value, toggle];
}

// Positive: effect body with broad logic — triggers TS-REACT-R006
import React from "react";

export function DataFetcher() {
  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const items = data.items;
        const filtered = items.filter((i: { active: boolean }) => i.active);
        const sorted = filtered.sort((a: { name: string }, b: { name: string }) =>
          a.name.localeCompare(b.name),
        );
        const mapped = sorted.map((i: { id: string; name: string }) => ({
          key: i.id,
          label: i.name,
        }));
        const grouped = mapped.reduce(
          (
            acc: Record<string, Array<{ key: string; label: string }>>,
            item: { key: string; label: string },
          ) => {
            const group = item.label[0]!.toUpperCase();
            if (!acc[group]) acc[group] = [];
            acc[group]!.push(item);
            return acc;
          },
          {},
        );
        console.log(grouped);
      });
    return () => controller.abort();
  }, []);
  return <div>Loading...</div>;
}

// Positive: component mixes domain logic + JSX — triggers TS-REACT-R002
import React from "react";

export function UserDashboard() {
  const [users, setUsers] = React.useState([]);
  const filtered = React.useMemo(() => users.filter((u) => u.active), [users]);
  const sorted = React.useMemo(
    () => filtered.sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );
  return (
    <ul>
      {sorted.map((u) => (
        <li key={u.id}>{u.name}</li>
      ))}
    </ul>
  );
}

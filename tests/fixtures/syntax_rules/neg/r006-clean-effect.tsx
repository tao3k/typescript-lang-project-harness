/** Negative: effect delegates to named helper — clean. */
import React from "react";

function fetchAndProcess() {}

export function CleanFetcher() {
  React.useEffect(() => {
    fetchAndProcess();
  }, []);
  return <div>Done</div>;
}

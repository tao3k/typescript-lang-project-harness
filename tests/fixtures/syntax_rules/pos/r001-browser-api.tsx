// Positive: component owns browser API — triggers TS-REACT-R001
import React from "react";

export function AutoSave() {
  React.useEffect(() => {
    chrome.storage.onChanged.addListener(() => {});
  }, []);
  return <div>Auto-save enabled</div>;
}

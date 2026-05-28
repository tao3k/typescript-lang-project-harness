// Positive: context value with 8 properties — triggers TS-REACT-R005
import React from "react";

const AppContext = React.createContext({});
export function AppProvider({ children }: { children: React.ReactNode }) {
  const value = {
    user: null,
    theme: "light",
    locale: "en",
    notifications: [],
    sidebarOpen: false,
    modalStack: [],
    debugMode: false,
    featureFlags: {},
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Negative: context value with 3 properties — clean. */
import React from "react";

const ThemeContext = React.createContext({ theme: "light", locale: "en" });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: "dark", locale: "en" }}>
      {children}
    </ThemeContext.Provider>
  );
}

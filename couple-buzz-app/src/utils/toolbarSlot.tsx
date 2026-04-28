import React, { createContext, useContext } from 'react';

// App-level overlay slot. Lets focused screens push content (e.g. the
// HistoryScreen toolbar pill) above everything in the navigator — including
// the bottom bar's transparent gradient — so it isn't visually veiled.
export const ToolbarSlotContext = createContext<{ set: (n: React.ReactNode | null) => void }>({
  set: () => {},
});

export const useToolbarSlot = () => useContext(ToolbarSlotContext);

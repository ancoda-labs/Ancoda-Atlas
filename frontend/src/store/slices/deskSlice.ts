import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const KEY = 'atlas_low_perf';

/**
 * Reader-side display preferences for the desk.
 *
 * `lowPerf` drops the animated chrome. It is seeded before first paint by the
 * inline script in layout.tsx — this slice mirrors that decision so a component
 * can read it, and lets a reader override it.
 */
export interface DeskState {
  lowPerf: boolean;
  /** Set by the SSE stream so a page can say "updating now" rather than
   *  reporting the last sweep as overdue while the next one runs. */
  sweeping: boolean;
}

export function readStoredLowPerf(): boolean {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    // No stored choice: fall back to what the connection says.
    const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
    const c = nav.connection;
    return Boolean(c && (c.saveData || c.effectiveType === '2g' || c.effectiveType === 'slow-2g'));
  } catch {
    return false;
  }
}

const deskSlice = createSlice({
  name: 'desk',
  initialState: { lowPerf: false, sweeping: false } as DeskState,
  reducers: {
    setLowPerf(state, action: PayloadAction<boolean>) {
      state.lowPerf = action.payload;
      try {
        localStorage.setItem(KEY, String(action.payload));
      } catch {
        /* applies for this page view */
      }
    },
    hydrateLowPerf(state, action: PayloadAction<boolean>) {
      state.lowPerf = action.payload;
    },
    setSweeping(state, action: PayloadAction<boolean>) {
      state.sweeping = action.payload;
    },
  },
});

export const { setLowPerf, hydrateLowPerf, setSweeping } = deskSlice.actions;
export default deskSlice.reducer;

import { create } from 'zustand';
import { MOCK_CALLS } from '../constants/mockData';
import { Call } from '../types';

interface CallStore {
  calls: Call[];
  setCalls: (calls: Call[]) => void;
  addCall: (call: Call) => void;
  getSearchedCalls: (query: string) => Call[];
}

export const useCallStore = create<CallStore>((set, get) => ({
  calls: MOCK_CALLS,

  setCalls: (calls) => set({ calls }),

  addCall: (call) => {
    const { calls } = get();
    set({ calls: [call, ...calls] });
  },

  getSearchedCalls: (query: string) => {
    const { calls } = get();
    if (!query.trim()) {
      return calls;
    }

    return calls.filter((call) =>
      call.userName.toLowerCase().includes(query.toLowerCase())
    );
  },
}));

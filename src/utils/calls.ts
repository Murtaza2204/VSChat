import api from '../config/api';

export interface RawCall {
  _id?: any;
  callId?: string;
  callerId?: string;
  calleeId?: string;
  callType?: string;
  callStatus?: string;
  isGroupCall?: boolean;
  groupId?: string;
  groupName?: string;
  groupAvatar?: string;
  createdAt?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  metadata?: any;
}

export const fetchCalls = async (userId: string, page = 1, limit = 50) => {
  const res = await api.get('/calls', { params: { userId, page, limit } });
  if (!res || !res.data) throw new Error('Invalid response');
  return res.data.calls as RawCall[];
};

export const fetchUsersByIds = async (ids: string[]) => {
  if (!ids || ids.length === 0) return [];
  const res = await api.post('/users/lookup', { ids });
  if (!res || !res.data) return [];
  return res.data.users || [];
};

export default { fetchCalls, fetchUsersByIds };

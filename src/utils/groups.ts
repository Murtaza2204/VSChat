import api from '../config/api';

export const createGroup = async (title, participants, ownerId) => {
  const body = { title, participants, ownerId };
  const res = await api.post('/groups', body);
  return res.data.group;
};

export const listGroups = async (userId) => {
  const res = await api.get('/groups', { params: { userId } });
  return res.data.groups;
};

export const updateGroup = async (groupId, { title, addMembers, removeMembers }) => {
  const res = await api.patch(`/groups/${groupId}`, { title, addMembers, removeMembers });
  return res.data.group;
};

export const leaveGroup = async (groupId, userId) => {
  const res = await api.post(`/groups/${groupId}/leave`, { userId });
  return res.data.group;
};

export const getGroup = async (groupId) => {
  const res = await api.get(`/groups/${groupId}`);
  return res.data.group;
};

export default { createGroup, listGroups, getGroup, updateGroup, leaveGroup };

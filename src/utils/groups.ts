import api from '../config/api';

export const createGroup = async (title, participants, ownerId, description?, groupProfilePicture?) => {
  const body = { title, participants, ownerId, description, groupProfilePicture };
  const res = await api.post('/groups', body);
  return res.data.group;
};

export const listGroups = async (userId) => {
  const res = await api.get('/groups', { params: { userId } });
  return res.data.groups;
};

export const updateGroup = async (groupId: any, { title, description, addMembers = [], removeMembers = [], addAdmins = [], removeAdmins = [], groupProfilePicture, addedBy, addedByName }: any = {}) => {
  const res = await api.patch(`/groups/${groupId}`, { title, description, addMembers, removeMembers, addAdmins, removeAdmins, groupProfilePicture, addedBy, addedByName });
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

export const uploadGroupProfilePicture = async (groupId, imageUri) => {
  const form = new FormData();
  // @ts-ignore
  form.append('image', { uri: imageUri, name: 'group.jpg', type: 'image/jpeg' });
  const res = await api.post(`/groups/${groupId}/profile-picture`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export default { createGroup, listGroups, getGroup, updateGroup, leaveGroup, uploadGroupProfilePicture };

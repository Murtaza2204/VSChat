const joinHumanList = (items: string[] = []) => {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
};

const normalizeDisplayName = (value?: string | null) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === 'someone' || trimmed.toLowerCase() === 'them') return '';
  return trimmed;
};

interface BuildSystemMessageTextArgs {
  message: any;
  currentUserId?: string | null;
  getParticipantDisplayNameById?: (participantId?: string | null) => string;
}

export const buildSystemMessageText = ({
  message,
  currentUserId,
  getParticipantDisplayNameById,
}: BuildSystemMessageTextArgs) => {
  if (!message) return '';

  const eventType = String(message.systemEventType || message.metadata?.systemEventType || '').toLowerCase();
  const actorId = String(message.systemActorId || message.senderId || '');
  const actorName =
    (currentUserId && actorId && String(actorId) === String(currentUserId) ? 'You' : '') ||
    normalizeDisplayName(message.systemActorName) ||
    normalizeDisplayName(message.metadata?.systemActorName) ||
    normalizeDisplayName(message.senderName && message.senderName !== 'Them' ? message.senderName : '') ||
    normalizeDisplayName(message.metadata?.senderName) ||
    (typeof getParticipantDisplayNameById === 'function' ? normalizeDisplayName(getParticipantDisplayNameById(actorId)) : '') ||
    (typeof getParticipantDisplayNameById === 'function' && message.senderId ? normalizeDisplayName(getParticipantDisplayNameById(message.senderId)) : '') ||
    '';
  const actorPrefix = actorName ? `${actorName} ` : '';

  const targetIds = Array.isArray(message.systemTargetIds || message.metadata?.systemTargetIds)
    ? (message.systemTargetIds || message.metadata?.systemTargetIds || [])
    : [];
  const targetNames = Array.isArray(message.systemTargetNames || message.metadata?.systemTargetNames)
    ? (message.systemTargetNames || message.metadata?.systemTargetNames || [])
    : [];
  const resolvedTargets = targetIds.length
    ? targetIds.map((targetId: any, index: number) => {
        const normalizedTargetId = String(targetId);
        if (currentUserId && normalizedTargetId === String(currentUserId)) return 'you';
        const candidateName = normalizeDisplayName(targetNames[index]) || (typeof getParticipantDisplayNameById === 'function' ? normalizeDisplayName(getParticipantDisplayNameById(normalizedTargetId)) : '');
        return candidateName;
      }).filter(Boolean)
    : [];
  const targetLabel = joinHumanList(resolvedTargets);
  const data = message.systemData || message.metadata?.systemData || {};
  const audienceIds = Array.isArray(message.systemAudienceIds || message.metadata?.systemAudienceIds)
    ? (message.systemAudienceIds || message.metadata?.systemAudienceIds || [])
    : [];
  const isForCurrentUser = !audienceIds.length || !currentUserId || audienceIds.some((id: any) => String(id) === String(currentUserId));
  const fallbackContent = String(message.content || '');

  switch (eventType) {
    case 'admin_assigned':
      return isForCurrentUser ? 'You are now a group admin.' : String(message.content || 'You are now a group admin.');
    case 'admin_removed':
      return isForCurrentUser ? "You're no longer an admin." : String(message.content || "You're no longer an admin.");
    case 'group_description_changed':
      return actorName ? `${actorPrefix}changed the group description.` : fallbackContent;
    case 'group_photo_changed':
      return actorName ? `${actorPrefix}changed the group photo.` : fallbackContent;
    case 'group_name_changed': {
      const newName = data.newName || data.title || data.groupName || '';
      return actorName
        ? `${actorPrefix}changed the group name to "${newName}".`
        : fallbackContent;
    }
    case 'member_added':
      return actorName && targetLabel
        ? `${actorPrefix}added ${targetLabel}.`
        : String(message.content || '');
    case 'member_removed':
      return actorName && targetLabel
        ? `${actorPrefix}removed ${targetLabel}.`
        : String(message.content || '');
    default:
      return String(message.content || '');
  }
};

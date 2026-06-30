export const buildInviteLink = (publicUserId?: string | null): string | null => {
  if (!publicUserId || typeof publicUserId !== 'string') {
    return null;
  }

  const trimmed = publicUserId.trim();
  return trimmed ? `vschat://user/${trimmed}` : null;
};

export const extractPublicUserId = (value?: string | null): string | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const deepLinkMatch = trimmed.match(/vschat:\/\/user\/([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12})/);
  if (deepLinkMatch?.[1]) {
    return deepLinkMatch[1];
  }

  const publicUrlMatch = trimmed.match(/https?:\/\/[^/]+\/u\/([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12})/);
  if (publicUrlMatch?.[1]) {
    return publicUrlMatch[1];
  }

  const uuidPattern = /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/;
  return uuidPattern.test(trimmed) ? trimmed : null;
};

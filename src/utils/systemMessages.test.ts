import { buildSystemMessageText } from './systemMessages';

describe('buildSystemMessageText', () => {
  const participantLookup = (id: string) => {
    const map: Record<string, string> = {
      user1: 'Alice',
      user2: 'Bob',
      user3: 'Sarah',
    };
    return map[id] || '';
  };

  it('uses You for the actor when the local user performed the action', () => {
    const message = {
      type: 'system',
      systemEventType: 'member_added',
      systemActorId: 'user1',
      systemActorName: 'Alice',
      systemTargetIds: ['user3'],
      systemTargetNames: ['Sarah'],
      content: 'Alice added Sarah.',
    } as any;

    const text = buildSystemMessageText({
      message,
      currentUserId: 'user1',
      getParticipantDisplayNameById: participantLookup,
    });

    expect(text).toBe('You added Sarah.');
  });

  it('uses you for the target when the local user was added or removed', () => {
    const message = {
      type: 'system',
      systemEventType: 'member_added',
      systemActorId: 'user2',
      systemActorName: 'Bob',
      systemTargetIds: ['user1'],
      systemTargetNames: ['Alice'],
      content: 'Bob added Alice.',
    } as any;

    const text = buildSystemMessageText({
      message,
      currentUserId: 'user1',
      getParticipantDisplayNameById: participantLookup,
    });

    expect(text).toBe('Bob added you.');
  });

  it('builds group change messages without falling back to Someone', () => {
    const message = {
      type: 'system',
      systemEventType: 'group_name_changed',
      systemActorId: 'user2',
      systemActorName: 'Bob',
      systemData: { newName: 'New Group' },
      content: 'Someone changed the group name.',
    } as any;

    const text = buildSystemMessageText({
      message,
      currentUserId: 'user1',
      getParticipantDisplayNameById: participantLookup,
    });

    expect(text).toBe('Bob changed the group name to "New Group".');
  });

  it('renders group description changes with the local user as actor', () => {
    const message = {
      type: 'system',
      systemEventType: 'group_description_changed',
      systemActorId: 'user1',
      content: 'You changed the group description.',
    } as any;

    const text = buildSystemMessageText({
      message,
      currentUserId: 'user1',
      getParticipantDisplayNameById: participantLookup,
    });

    expect(text).toBe('You changed the group description.');
  });

  it('renders group photo changes with the actor resolved from participants', () => {
    const message = {
      type: 'system',
      systemEventType: 'group_photo_changed',
      systemActorId: 'user2',
      content: 'Someone changed the group photo.',
    } as any;

    const text = buildSystemMessageText({
      message,
      currentUserId: 'user1',
      getParticipantDisplayNameById: participantLookup,
    });

    expect(text).toBe('Bob changed the group photo.');
  });

  it('renders group name changes with the expected quoted title', () => {
    const message = {
      type: 'system',
      systemEventType: 'group_name_changed',
      systemActorId: 'user2',
      systemData: { newName: 'Weekend Trip' },
      content: 'Someone changed the group name.',
    } as any;

    const text = buildSystemMessageText({
      message,
      currentUserId: 'user1',
      getParticipantDisplayNameById: participantLookup,
    });

    expect(text).toBe('Bob changed the group name to "Weekend Trip".');
  });
});

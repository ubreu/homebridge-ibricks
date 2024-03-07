import { Presence, PresenceChangeStatus, getPresence, setPresence } from './presence';
import assert from 'assert';

describe('Presence Tests', () => {
  it('should flip the presence status', async () => {
    let changeStatus = await setPresence(Presence.AusserHaus);
    assert.equal(changeStatus, PresenceChangeStatus.Ok);
    let presence = await getPresence();
    assert.equal(presence, Presence.AusserHaus);

    changeStatus = await setPresence(Presence.Zuhause);
    assert.equal(changeStatus, PresenceChangeStatus.Ok);
    presence = await getPresence();
    assert.equal(presence, Presence.Zuhause);
  });
});

import { Presence, PresenceChangeStatus, getPresence, setPresence } from './presence';
import assert from 'assert';
import { IBricksServer } from './server';

const server: IBricksServer = {
  url: 'http://192.168.3.10/',
  name: 'UMO iBricks',
};

describe('Presence Tests', () => {
  it('should flip the presence status', async () => {
    let changeStatus = await setPresence(server, Presence.AusserHaus);
    assert.equal(changeStatus, PresenceChangeStatus.Ok);
    let presence = await getPresence(server);
    assert.equal(presence, Presence.AusserHaus);

    changeStatus = await setPresence(server, Presence.Zuhause);
    assert.equal(changeStatus, PresenceChangeStatus.Ok);
    presence = await getPresence(server);
    assert.equal(presence, Presence.Zuhause);
  });
});

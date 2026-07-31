import * as http from 'http';
import { AddressInfo } from 'net';
import assert from 'assert';
import { Presence, PresenceChangeStatus, getPresence, setPresence } from './presence';
import { IBricksServer } from './server';

/*
    HomeKit gives a characteristic read handler 3s before it logs "was slow to respond"
    and 9s before it logs "didn't respond at all" (hap-nodejs Service.toHAP).
    A request against an iBricks server that accepts the connection but never answers
    must therefore fail fast instead of staying pending forever.
*/
describe('Presence request timeouts', () => {
  let hangingServer: http.Server;
  let server: IBricksServer;

  beforeEach((done) => {
    // accepts the connection and the request, but never sends a response
    hangingServer = http.createServer(() => {});
    hangingServer.listen(0, '127.0.0.1', () => {
      const { port } = hangingServer.address() as AddressInfo;
      server = { url: `http://127.0.0.1:${port}`, name: 'hanging' };
      done();
    });
  });

  afterEach((done) => {
    hangingServer.closeAllConnections();
    hangingServer.close(() => done());
  });

  it('getPresence gives up on an unresponsive server', async () => {
    const start = Date.now();
    const presence = await getPresence(server);
    const elapsed = Date.now() - start;

    assert.equal(presence, Presence.Unknown);
    assert.ok(elapsed < 9000, `getPresence took ${elapsed}ms, must stay below the 9s HomeKit deadline`);
  }).timeout(15000);

  it('setPresence gives up on an unresponsive server', async () => {
    const start = Date.now();
    const changeStatus = await setPresence(server, Presence.Zuhause);
    const elapsed = Date.now() - start;

    assert.equal(changeStatus, PresenceChangeStatus.Failed);
    assert.ok(elapsed < 9000, `setPresence took ${elapsed}ms, must stay below the 9s HomeKit deadline`);
  }).timeout(15000);
});

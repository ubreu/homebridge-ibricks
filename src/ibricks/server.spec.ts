import assert from 'assert';
import { IBricksServer, getServer } from './server';

const serverUrl= 'http://192.168.3.10/';

describe('Server Test', () => {
  it('get server details', async () => {
    const server = await getServer(serverUrl);
    assert.equal(server.url, serverUrl);
    assert.equal(server.name, 'UMO iBricks');
  });
});

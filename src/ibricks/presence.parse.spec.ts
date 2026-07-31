import * as http from 'http';
import { AddressInfo } from 'net';
import assert from 'assert';
import { Presence, getPresence } from './presence';
import { IBricksServer } from './server';

/*
    A dashboard response without a recognizable MainStatusLabel (login page, error page
    served with status 200) must map to Presence.Unknown, not undefined - the poller
    relies on Unknown to tell "no data" apart from a real presence state.
*/
describe('Presence parsing', () => {
  let dashboardServer: http.Server;
  let server: IBricksServer;
  let body: string;

  beforeEach((done) => {
    dashboardServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(body);
    });
    dashboardServer.listen(0, '127.0.0.1', () => {
      const { port } = dashboardServer.address() as AddressInfo;
      server = { url: `http://127.0.0.1:${port}`, name: 'fake' };
      done();
    });
  });

  afterEach((done) => {
    dashboardServer.close(() => done());
  });

  it('reports Unknown when the page has no presence label', async () => {
    body = '<html><body>Bitte anmelden</body></html>';

    assert.equal(await getPresence(server), Presence.Unknown);
  });

  it('reports Unknown when the label holds an unexpected value', async () => {
    body = '<span id="MainStatusLabel">Ferien</span>';

    assert.equal(await getPresence(server), Presence.Unknown);
  });

  it('reports the presence when the label holds a known value', async () => {
    body = '<span id="MainStatusLabel">AusserHaus</span>';

    assert.equal(await getPresence(server), Presence.AusserHaus);
  });
});

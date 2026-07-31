import * as http from 'http';
import { AddressInfo } from 'net';
import assert from 'assert';
import { PlatformAccessory } from 'homebridge';

import { IBricksPlatformAccessory } from './platformAccessory';
import { IBricksPlatform } from './platform';

// hap-nodejs is ESM only and cannot be required from here, so the bits the accessory touches
// are stubbed with the values from hap-nodejs CharacteristicDefinitions
const SecuritySystemCurrentState = { STAY_ARM: 0, AWAY_ARM: 1, NIGHT_ARM: 2, DISARMED: 3, ALARM_TRIGGERED: 4 };
const SecuritySystemTargetState = { STAY_ARM: 0, AWAY_ARM: 1, NIGHT_ARM: 2, DISARM: 3 };

class FakeHapStatusError extends Error {
  readonly hapStatus: number;

  constructor(hapStatus: number) {
    super(`HAP status ${hapStatus}`);
    this.hapStatus = hapStatus;
  }
}
const HAPStatus = { SERVICE_COMMUNICATION_FAILURE: -70402 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FakeService {
  setCharacteristic(): FakeService;
  getCharacteristic(): FakeService;
  setProps(props: object): FakeService;
  onGet(): FakeService;
  onSet(): FakeService;
  updateCharacteristic(characteristic: object, value: number): FakeService;
}

function fakePlatform(pushedStates: Map<string, number>, setPropsCalls: object[]) {
  const service: FakeService = {
    setCharacteristic: () => service,
    getCharacteristic: () => service,
    setProps: (props) => {
      setPropsCalls.push(props);
      return service;
    },
    onGet: () => service,
    onSet: () => service,
    updateCharacteristic: (characteristic, value) => {
      // the accessory passes the characteristic definition object, key the map by its name
      const name = characteristic === SecuritySystemCurrentState
        ? 'SecuritySystemCurrentState' : 'SecuritySystemTargetState';
      pushedStates.set(name, value);
      return service;
    },
  };

  return {
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    Service: { AccessoryInformation: 'AccessoryInformation', SecuritySystem: 'SecuritySystem' },
    Characteristic: {
      Manufacturer: 'Manufacturer',
      Model: 'Model',
      Name: 'Name',
      SecuritySystemCurrentState,
      SecuritySystemTargetState,
    },
    api: {
      on: () => {},
      hap: { HapStatusError: FakeHapStatusError, HAPStatus },
    },
    service,
  };
}

function fakeAccessory(service: FakeService, serverUrl: string) {
  return {
    getService: () => service,
    addService: () => service,
    context: { server: { url: serverUrl, name: 'fake' } },
  };
}

function buildAccessory(serverUrl: string, pushedStates: Map<string, number>, setPropsCalls: object[]) {
  const platform = fakePlatform(pushedStates, setPropsCalls);
  const accessory = fakeAccessory(platform.service, serverUrl);

  return new IBricksPlatformAccessory(
    platform as unknown as IBricksPlatform,
    accessory as unknown as PlatformAccessory,
  );
}

/*
    The read handlers must answer from the cached state, HomeKit warns after 3s and gives up
    after 9s (hap-nodejs Service.toHAP). Scraping the dashboard belongs on the polling path only.
*/
describe('Platform Accessory against an unresponsive server', () => {
  let hangingServer: http.Server;
  let platformAccessory: IBricksPlatformAccessory;
  let pushedStates: Map<string, number>;

  beforeEach((done) => {
    // accepts the connection and the request, but never sends a response
    hangingServer = http.createServer(() => {});
    hangingServer.listen(0, '127.0.0.1', () => {
      const { port } = hangingServer.address() as AddressInfo;

      pushedStates = new Map();
      platformAccessory = buildAccessory(`http://127.0.0.1:${port}`, pushedStates, []);
      done();
    });
  });

  afterEach((done) => {
    platformAccessory.stopPolling();
    hangingServer.closeAllConnections();
    hangingServer.close(() => done());
  });

  it('answers a current state read without waiting for the server', async () => {
    const start = Date.now();
    const state = await platformAccessory.getCurrentState();
    const elapsed = Date.now() - start;

    assert.equal(state, SecuritySystemCurrentState.DISARMED);
    assert.ok(elapsed < 100, `getCurrentState took ${elapsed}ms, it must not wait for the server`);
  });

  it('answers a target state read without waiting for the server', async () => {
    const start = Date.now();
    const state = await platformAccessory.getTargetState();
    const elapsed = Date.now() - start;

    assert.equal(state, SecuritySystemTargetState.DISARM);
    assert.ok(elapsed < 100, `getTargetState took ${elapsed}ms, it must not wait for the server`);
  });

  it('rejects a target state write that could not be applied, so HomeKit reverts the tile', async () => {
    await assert.rejects(
      platformAccessory.setTargetState(SecuritySystemTargetState.AWAY_ARM),
      (error: unknown) => error instanceof FakeHapStatusError
        && error.hapStatus === HAPStatus.SERVICE_COMMUNICATION_FAILURE,
    );

    assert.equal(pushedStates.size, 0);
    assert.equal(await platformAccessory.getCurrentState(), SecuritySystemCurrentState.DISARMED);
  }).timeout(15000);
});

/*
    The background poll keeps the cached state fresh. Its failure modes must never
    override a known state: a failed poll or a stale in-flight poll would otherwise
    show the security system as disarmed although the house is armed.
*/
describe('Platform Accessory polling', () => {
  let ibricksServer: http.Server;
  let platformAccessory: IBricksPlatformAccessory;
  let pushedStates: Map<string, number>;
  let setPropsCalls: object[];

  let presenceLabel: string;
  let dropNextDashboard: boolean;
  let holdNextDashboard: boolean;
  let heldResponses: Array<() => void>;

  beforeEach((done) => {
    presenceLabel = 'AusserHaus';
    dropNextDashboard = false;
    holdNextDashboard = false;
    heldResponses = [];

    ibricksServer = http.createServer((req, res) => {
      if (req.url?.includes('SetValue')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ d: '[OK]' }));
        return;
      }
      if (dropNextDashboard) {
        dropNextDashboard = false;
        req.socket.destroy();
        return;
      }
      res.setHeader('Content-Type', 'text/html');
      const respond = () => res.end(`<span id="MainStatusLabel">${presenceLabel}</span>`);
      if (holdNextDashboard) {
        holdNextDashboard = false;
        heldResponses.push(respond);
      } else {
        respond();
      }
    });
    ibricksServer.listen(0, '127.0.0.1', () => {
      const { port } = ibricksServer.address() as AddressInfo;

      pushedStates = new Map();
      setPropsCalls = [];
      platformAccessory = buildAccessory(`http://127.0.0.1:${port}`, pushedStates, setPropsCalls);
      done();
    });
  });

  afterEach((done) => {
    platformAccessory.stopPolling();
    ibricksServer.closeAllConnections();
    ibricksServer.close(() => done());
  });

  // the constructor kicks off the first poll, AusserHaus differs from the initial
  // Unknown so it is pushed to HomeKit once the poll went through
  async function initialPollDone() {
    while (pushedStates.size === 0) {
      await sleep(5);
    }
  }

  it('keeps the last known state when a poll fails', async () => {
    await initialPollDone();
    assert.equal(await platformAccessory.getCurrentState(), SecuritySystemCurrentState.AWAY_ARM);
    pushedStates.clear();

    dropNextDashboard = true;
    await platformAccessory['refreshPresenceState']();

    assert.equal(await platformAccessory.getCurrentState(), SecuritySystemCurrentState.AWAY_ARM);
    assert.equal(pushedStates.size, 0, 'a failed poll must not push anything to HomeKit');
  });

  it('ignores a poll result that was already in flight when a target state was written', async () => {
    await initialPollDone();

    // this poll reads AusserHaus, but its response is held back until after the write below
    holdNextDashboard = true;
    const stalePoll = platformAccessory['refreshPresenceState']();
    while (heldResponses.length === 0) {
      await sleep(5);
    }

    await platformAccessory.setTargetState(SecuritySystemTargetState.DISARM);
    assert.equal(await platformAccessory.getCurrentState(), SecuritySystemCurrentState.DISARMED);

    heldResponses.shift()!();
    await stalePoll;

    assert.equal(await platformAccessory.getCurrentState(), SecuritySystemCurrentState.DISARMED,
      'the pre-write poll result must not overwrite the state written afterwards');
    assert.equal(pushedStates.get('SecuritySystemCurrentState'), SecuritySystemCurrentState.DISARMED);
  });

  it('pushes the new state to HomeKit once a target state was applied', async () => {
    await initialPollDone();

    await platformAccessory.setTargetState(SecuritySystemTargetState.DISARM);

    assert.equal(pushedStates.get('SecuritySystemCurrentState'), SecuritySystemCurrentState.DISARMED);
    assert.equal(pushedStates.get('SecuritySystemTargetState'), SecuritySystemTargetState.DISARM);
  });

  // iBricks presence only knows Zuhause/AusserHaus, so only Away and Off are meaningful -
  // Stay/Night would be silently rewritten to Off, which looks broken in the Home app
  it('only offers the Away and Off target states', () => {
    assert.deepEqual(setPropsCalls, [{
      validValues: [SecuritySystemTargetState.AWAY_ARM, SecuritySystemTargetState.DISARM],
    }]);
  });
});

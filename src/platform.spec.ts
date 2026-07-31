import assert from 'assert';
import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';

import { IBricksPlatform } from './platform';
import { IBricksPlatformConfig } from './config';

// unreachable: connecting to port 1 is refused immediately, getServer falls back to the default name
const serverUrl = 'http://127.0.0.1:1';

const noopLog = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
} as unknown as Logger;

interface FakeService {
  setCharacteristic(): FakeService;
  getCharacteristic(): FakeService;
  setProps(): FakeService;
  onGet(): FakeService;
  onSet(): FakeService;
  updateCharacteristic(): FakeService;
}

function fakeService(): FakeService {
  const service: FakeService = {
    setCharacteristic: () => service,
    getCharacteristic: () => service,
    setProps: () => service,
    onGet: () => service,
    onSet: () => service,
    updateCharacteristic: () => service,
  };
  return service;
}

class FakeAccessory {
  context: Record<string, unknown> = {};
  displayName: string;
  UUID: string;

  // no parameter properties, Node's type stripping does not support them
  constructor(displayName: string, UUID: string) {
    this.displayName = displayName;
    this.UUID = UUID;
  }

  getService() {
    return fakeService();
  }

  addService() {
    return fakeService();
  }
}

class FakeApi {
  registered: FakeAccessory[] = [];
  unregistered: FakeAccessory[] = [];

  readonly platformAccessory = FakeAccessory;

  readonly hap = {
    Service: { AccessoryInformation: 'AccessoryInformation', SecuritySystem: 'SecuritySystem' },
    Characteristic: {
      Manufacturer: 'Manufacturer',
      Model: 'Model',
      Name: 'Name',
      SecuritySystemCurrentState: { STAY_ARM: 0, AWAY_ARM: 1, NIGHT_ARM: 2, DISARMED: 3 },
      SecuritySystemTargetState: { STAY_ARM: 0, AWAY_ARM: 1, NIGHT_ARM: 2, DISARM: 3 },
    },
    uuid: { generate: (seed: string) => `uuid:${seed}` },
  };

  private handlers = new Map<string, Array<() => void>>();

  on(event: string, handler: () => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  emit(event: string) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler();
    }
  }

  registerPlatformAccessories(_plugin: string, _platform: string, accessories: FakeAccessory[]) {
    this.registered.push(...accessories);
  }

  unregisterPlatformAccessories(_plugin: string, _platform: string, accessories: FakeAccessory[]) {
    this.unregistered.push(...accessories);
  }
}

function buildPlatform(api: FakeApi) {
  const config = { name: 'iBricks', ibricksServerUrl: serverUrl } as unknown as PlatformConfig;
  return new IBricksPlatform(noopLog, config, api as unknown as API);
}

describe('Platform Tests', () => {
  let api: FakeApi;
  let platform: IBricksPlatform;

  const expectedUuid = `uuid:homebridge:ibricks:server:${serverUrl}`;

  beforeEach(() => {
    api = new FakeApi();
    platform = buildPlatform(api);
  });

  afterEach(() => {
    // stops the presence polling started by the accessory handlers
    api.emit('shutdown');
  });

  it('registers a new accessory when the cache is empty', async () => {
    await platform.addAccessory(platform.config as IBricksPlatformConfig);

    assert.equal(api.registered.length, 1);
    assert.equal(api.registered[0].UUID, expectedUuid);
    assert.equal(api.unregistered.length, 0);
  });

  it('restores a cached accessory instead of registering it again', async () => {
    const cached = new FakeAccessory('iBricks', expectedUuid);
    // homebridge persists the context of cached accessories to disk
    cached.context.server = { url: serverUrl, name: 'iBricks' };
    platform.configureAccessory(cached as unknown as PlatformAccessory);

    await platform.addAccessory(platform.config as IBricksPlatformConfig);

    assert.equal(api.registered.length, 0);
    assert.equal(api.unregistered.length, 0);
  });

  it('removes a cached accessory that no longer matches the configured server', async () => {
    const stale = new FakeAccessory('old iBricks', 'uuid:homebridge:ibricks:server:http://192.168.0.99');
    platform.configureAccessory(stale as unknown as PlatformAccessory);

    await platform.addAccessory(platform.config as IBricksPlatformConfig);

    assert.equal(api.registered.length, 1, 'the configured server must still be registered');
    assert.deepEqual(api.unregistered, [stale], 'the accessory of the previous server url must be removed');
    assert.equal(platform.accessories.has(stale.UUID), false);
  });
});

import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { IBricksPlatform } from './platform';
import { Presence, PresenceChangeStatus, getPresence, setPresence } from './ibricks/presence';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class IBricksPlatformAccessory {
  private service: Service;

  private presenceState: Presence = Presence.Unknown;

  constructor(
    private readonly platform: IBricksPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'iBricks')
      .setCharacteristic(this.platform.Characteristic.Model, 'Server');

    // get the service if it exists, otherwise create a new SecuritySystem service
    this.service = this.accessory.getService(this.platform.Service.SecuritySystem)
    || this.accessory.addService(this.platform.Service.SecuritySystem);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.server.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .onGet(this.getCurrentState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this));
  }

  /**
   * Handle requests to get the current value of the "Security System Current State" characteristic
   */
  async getCurrentState(): Promise<CharacteristicValue> {
    this.platform.log.debug('getCurrentState');
    return this.getPresenceState();
  }

  /**
 * Handle requests to get the current value of the "Security System Target State" characteristic
 */
  async getTargetState(): Promise<CharacteristicValue> {
    this.platform.log.debug('getTargetState');
    return this.getPresenceState();
  }

  /**
 * Handle requests to set the "Security System Target State" characteristic
 */
  async setTargetState(value: CharacteristicValue) {
    this.platform.log.debug('setTargetState:', value);

    let newPresence = Presence.Unknown;
    switch (value) {
      case this.platform.Characteristic.SecuritySystemTargetState.DISARM:
      case this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM:
      case this.platform.Characteristic.SecuritySystemTargetState.NIGHT_ARM:
        newPresence = Presence.Zuhause;
        break;
      case this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM:
        newPresence = Presence.AusserHaus;
        break;
    }

    this.platform.log.debug('setting new presence:', newPresence);
    const changeStatus = await setPresence(newPresence);
    if (changeStatus === PresenceChangeStatus.Ok) {
      this.platform.log.debug('target state successfully applied');
    }
    this.presenceState = await getPresence();
    this.platform.log.debug('new presence state:', this.presenceState);
  }

  getPresenceState() {
    switch (this.presenceState) {
      case Presence.AusserHaus:
        return this.platform.Characteristic.SecuritySystemCurrentState.AWAY_ARM;
      case Presence.Zuhause:
        return this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;
      default:
        return this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;
    }
  }
}
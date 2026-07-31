import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { IBricksPlatform } from './platform';
import { Presence, PresenceChangeStatus, getPresence, setPresence } from './ibricks/presence';

/*
    HomeKit expects a characteristic read to be answered from memory: it warns after 3s and
    gives up after 9s. Scraping the iBricks dashboard is too slow for that, so the presence
    state is polled in the background and pushed to HomeKit whenever it changes.
*/
export const pollIntervalMs = 30000;

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class IBricksPlatformAccessory {
  private service: Service;

  private presenceState: Presence = Presence.Unknown;

  private pollTimer?: NodeJS.Timeout;

  // bumped on every successful write so poll results that were read before the write are discarded
  private writeSequence = 0;

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

    // iBricks presence only knows Zuhause/AusserHaus, so only offer Away and Off -
    // Stay/Night would be silently rewritten to Off, which looks broken in the Home app
    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .setProps({
        validValues: [
          this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM,
          this.platform.Characteristic.SecuritySystemTargetState.DISARM,
        ],
      })
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this));

    this.startPolling();
  }

  /**
   * Keep the cached presence state fresh so the read handlers never have to wait for the server.
   */
  private startPolling() {
    this.refreshPresenceState();

    this.pollTimer = setInterval(() => this.refreshPresenceState(), pollIntervalMs);
    this.platform.api.on('shutdown', () => this.stopPolling());
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  /**
   * Read the presence state from the server and push it to HomeKit if it changed.
   */
  private async refreshPresenceState() {
    const writeSequence = this.writeSequence;
    const presenceState = await getPresence(this.accessory.context.server);
    if (writeSequence !== this.writeSequence) {
      // a target state was written while this poll was in flight, its result is stale
      return;
    }
    if (presenceState === Presence.Unknown) {
      // a failed poll means "no data", not "the house is disarmed" - keep the last known state
      return;
    }
    if (presenceState === this.presenceState) {
      return;
    }

    this.platform.log.debug('presence state changed:', Presence[presenceState]);
    this.updatePresenceState(presenceState);
  }

  private updatePresenceState(presenceState: Presence) {
    this.presenceState = presenceState;

    const state = this.getPresenceState();
    this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, state);
    this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemTargetState, state);
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
    const changeStatus = await setPresence(this.accessory.context.server, newPresence);
    if (changeStatus !== PresenceChangeStatus.Ok) {
      this.platform.log.warn('could not apply target state:', value);
      // rejecting with a HapStatusError makes HomeKit revert the tile instead of showing "Arming..." forever
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    // assume the change took effect instead of waiting for another round trip, the next poll corrects us if it didn't
    this.platform.log.debug('target state successfully applied');
    this.writeSequence++;
    this.updatePresenceState(newPresence);
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

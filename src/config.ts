import { PlatformConfig } from 'homebridge';

export interface IBricksPlatformConfig extends PlatformConfig {
    ibricksServerUrl: string;
}
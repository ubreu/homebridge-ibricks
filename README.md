<p align="center">
<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

# Homebridge iBricks Plugin

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

This is a [Homebridge](https://homebridge.io/) plugin for the [iBricks](https://www.ibricks.ch/) system.
When activated the iBricks server is added as a security system accessory to HomeKit and the plugin tracks the presence status of the system. With this plugin you can switch between 'home' (recording mode) and 'away' (play mode) states.

## Configuration

The only configuration parameter is the URL of the iBricks server, e.g. http://192.168.1.10

## Development

### Setup Development Environment

You must have Node.js 18 or later installed. This plugin uses [Nix flakes](https://nixos.wiki/wiki/Flakes) to provide the necessary development tools.

### Install Development Dependencies

Using a terminal, navigate to the project folder and run this command to install the development dependencies:

```shell
$ npm install
```

### Build Plugin

TypeScript needs to be compiled into JavaScript before it can run. The following command will compile the contents of your [`src`](./src) directory and put the resulting code into the `dist` folder.

```shell
$ npm run build
$ npm run test
```

### Publish Package

When you are ready to publish your plugin to [npm](https://www.npmjs.com/), make sure you have removed the `private` attribute from the [`package.json`](./package.json) file then run:

```shell
$ npm publish --access=public
```

You can publish *beta* versions of your plugin for other users to test before you release it to everyone.

```shell
# create a new pre-release version (eg. 2.1.0-beta.1)
$ npm version prepatch --preid beta

# publish to @beta
$ npm publish --tag=beta --access=public
```

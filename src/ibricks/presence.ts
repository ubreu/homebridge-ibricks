import axios from 'axios';
import * as cheerio from 'cheerio';
import { IBricksServer } from './server';

export enum Presence {
    Zuhause, AusserHaus, Unknown
}

export enum PresenceChangeStatus {
    Ok, Failed
}

/*
    An iBricks server that accepts the connection but never answers would otherwise leave
    the request pending indefinitely. HomeKit only waits 3s (slow) / 9s (timeout) for a
    characteristic read, so every request has to fail fast.
*/
export const requestTimeoutMs = 4000;

/*
    Determine presence by scraping the dashboard and grabbing the value of the MainStatusLabel:
    <span id="MainStatusLabel" style="display:inline-block;width:150px;">AusserHaus</span>
    <span id="MainStatusLabel" style="display:inline-block;width:150px;">Zuhause</span>
*/
export async function getPresence (server: IBricksServer): Promise<Presence> {
  try {
    const response = await axios.get(
      server.url + '/visi2/Panels/Computer/Dashboard/dashboard.aspx',
      {
        headers: {
          Accept: 'application/json',
        },
        timeout: requestTimeoutMs,
      },
    );
    const $ = cheerio.load(response.data);
    const presenceText = $('#MainStatusLabel').text();
    return Presence[presenceText as keyof typeof Presence] ?? Presence.Unknown;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return Presence.Unknown;
    } else {
      return Presence.Unknown;
    }
  }
}

/*
    Set presence by posting to /Visi2/Panels/Computer/Dashboard/WidgetAjax.aspx/SetValue:
    payloads:
    - Zuhause: { data: { "type":"AttendSim","entryName":"Anwesenheitsstatus","value":"rec" } }
    - AusserHaus: { data : { "type":"AttendSim","entryName":"Anwesenheitsstatus","value":"play" } }
*/
export async function setPresence (server: IBricksServer, newPresence: Presence) {
  try {
    const payload = {
      type: 'AttendSim',
      entryName: 'Anwesenheitsstatus',
      value: newPresence === Presence.Zuhause ? 'rec' : 'play',
    };
    const { data, status } = await axios.post(server.url + '/Visi2/Panels/Computer/Dashboard/WidgetAjax.aspx/SetValue',
      {
        data: JSON.stringify(payload),
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json; charset=UTF-8',
        },
        timeout: requestTimeoutMs,
      });
    if (status === 200 && (data.d === '[OK]')) {
      return PresenceChangeStatus.Ok;
    }
    return PresenceChangeStatus.Failed;
  } catch (error) {
    return PresenceChangeStatus.Failed;
  }
}
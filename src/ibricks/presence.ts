import axios from 'axios';
import cheerio from 'cheerio';

export enum Presence {
    Zuhause, AusserHaus, Unknown
}

export enum PresenceChangeStatus {
    Ok, Failed
}

/*
    Determine presence by scraping the dashboard and grabbing the value of the MainStatusLabel:
    <span id="MainStatusLabel" style="display:inline-block;width:150px;">AusserHaus</span>
    <span id="MainStatusLabel" style="display:inline-block;width:150px;">Zuhause</span>
*/
export async function getPresence (): Promise<Presence> {
  try {
    const { data, status } = await axios.get(
      'http://192.168.3.10/visi2/Panels/Computer/Dashboard/dashboard.aspx',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    // console.log(JSON.stringify(data, null, 4));
    console.log('getPresence: response status is: ', status);
    const $ = cheerio.load(data);
    //   console.log(html);



    const presenceText = $('#MainStatusLabel').text();
    console.log(presenceText);
    return Presence[presenceText];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log('error message: ', error.message);
      return Presence.Unknown;
    } else {
      console.log('unexpected error: ', error);
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
export async function setPresence (newPresence: Presence) {
  try {
    console.log('setPresence: set presence to', newPresence);
    const payload = {
      type: 'AttendSim',
      entryName: 'Anwesenheitsstatus',
      value: newPresence === Presence.Zuhause ? 'rec' : 'play',
    };
    console.log('setPresence: payload ', payload);
    const { data, status } = await axios.post('http://192.168.3.10/Visi2/Panels/Computer/Dashboard/WidgetAjax.aspx/SetValue',
      {
        data: JSON.stringify(payload),
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json; charset=UTF-8',
        },
      });
    console.log('setPresence: response status is: ', status);
    console.log('setPresence: response data is: ', data);
    if (status === 200 && (data.d === '[OK]')) {
      return PresenceChangeStatus.Ok;
    }
    return PresenceChangeStatus.Failed;
  } catch (error) {
    console.log(error);
    if (axios.isAxiosError(error)) {
      console.log('setPresence: error message: ', error.message);
      return PresenceChangeStatus.Failed;
    } else {
      console.log('setPresence: unexpected error: ', error);
      return PresenceChangeStatus.Failed;
    }
  }
}
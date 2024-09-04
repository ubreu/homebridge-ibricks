import axios from 'axios';
import * as cheerio from 'cheerio';


export interface IBricksServer {
    url: string;
    name: string;
}

const serverNameSuffix = 'iBricks';

/*
    Determine server information by scraping the dashboard and grabbing the value of the ctl00_ContentPlaceHolder_Title
*/
export async function getServer (serverUrl: string): Promise<IBricksServer> {
  try {
    const response = await axios.get(
      serverUrl + '/visi2/Panels/Computer/Dashboard/dashboard.aspx',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
    const $ = cheerio.load(response.data);
    const serverName = $('#ctl00_ContentPlaceHolder_Title').text();
    return {
      url: serverUrl,
      name: serverName + ' ' + serverNameSuffix,
    };
  } catch (error) {
    return {
      url: serverUrl,
      name: serverNameSuffix,
    };
  }
}
import { UAParser } from 'ua-parser-js';

export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
}

export function parseDevice(userAgent: string): DeviceInfo {
  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const browser = parser.getBrowser();
  const os = parser.getOS();

  return {
    type: device.type === 'mobile' || device.type === 'tablet' ? device.type : 'desktop',
    browser: browser.name || 'Unknown',
    os: os.name || 'Unknown',
  };
}

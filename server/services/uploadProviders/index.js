import * as x0 from './x0.js';
import * as catbox from './catbox.js';
import * as hoarder from './hoarder.js';

const PROVIDERS = {
  [x0.id]: x0,
  [catbox.id]: catbox,
  [hoarder.id]: hoarder,
};

export const providerIds = Object.keys(PROVIDERS);

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

// Lift the relevant per-user settings into a flat secrets object for the
// chosen provider. The router calls this rather than passing the raw settings
// object so each provider only sees what it needs.
export function secretsForProvider(id, userSettings) {
  switch (id) {
    case 'catbox':
      return { userhash: userSettings['uploads.catbox.userhash'] || '' };
    case 'hoarder':
      return {
        url: userSettings['uploads.hoarder.url'] || '',
        api_key: userSettings['uploads.hoarder.api_key'] || '',
      };
    default:
      return {};
  }
}

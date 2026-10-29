let cachedBarId = null;
let cachedRawSettings = null;
let cachedSettings = {};

export const getBusinessSettingsKey = (barId) => `businessSettings:${barId}`;

export const cacheBusinessSettings = (barId, settings) => {
  if (!barId || !settings) {
    return;
  }
  const rawSettings = JSON.stringify(settings);
  localStorage.setItem(getBusinessSettingsKey(barId), rawSettings);
  if (String(barId) === cachedBarId) {
    cachedRawSettings = rawSettings;
    cachedSettings = settings;
  }
};

export const getActiveBusinessSettings = () => {
  const barId = localStorage.getItem('activeBarId');
  if (!barId) {
    return {};
  }

  const rawSettings = localStorage.getItem(getBusinessSettingsKey(barId)) || '{}';
  if (barId === cachedBarId && rawSettings === cachedRawSettings) {
    return cachedSettings;
  }

  try {
    cachedBarId = barId;
    cachedRawSettings = rawSettings;
    cachedSettings = JSON.parse(rawSettings);
    return cachedSettings;
  } catch (error) {
    console.error('Unable to read cached business settings:', error);
    cachedBarId = barId;
    cachedRawSettings = rawSettings;
    cachedSettings = {};
    return {};
  }
};

export const getActiveCurrency = () => (
  String(getActiveBusinessSettings().currency || 'MK').trim() || 'MK'
);

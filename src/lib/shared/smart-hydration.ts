export interface HydrationConfig {
  enableSmartHydration: boolean;
  cookieMaxAge: number;
  fallbackBehavior: 'refetch' | 'use-defaults' | 'show-error';
  debugMode: boolean;
}

export const DEFAULT_HYDRATION_CONFIG: HydrationConfig = {
  enableSmartHydration: true,
  cookieMaxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  fallbackBehavior: 'use-defaults',
  debugMode: process.env.NODE_ENV === 'development',
};

export interface PreferencesDiff {
  hasChanges: boolean;
  changedKeys: string[];
  serverPrefs: any;
  clientPrefs: any;
}

export function comparePreferences(
  serverPrefs: any,
  clientPrefs: any,
  ignoredKeys: string[] = ['_lastUpdated', '_version']
): PreferencesDiff {
  const changedKeys: string[] = [];
  
  // Normalize both preferences (remove undefined values)
  const normalizePrefs = (prefs: any) => {
    if (!prefs) return {};
    const normalized: any = {};
    Object.keys(prefs).forEach(key => {
      if (prefs[key] !== undefined && !ignoredKeys.includes(key)) {
        normalized[key] = prefs[key];
      }
    });
    return normalized;
  };
  
  const normalizedServer = normalizePrefs(serverPrefs);
  const normalizedClient = normalizePrefs(clientPrefs);
  
  const allKeys = new Set([
    ...Object.keys(normalizedServer),
    ...Object.keys(normalizedClient),
  ]);
  
  for (const key of allKeys) {
    const serverValue = normalizedServer[key];
    const clientValue = normalizedClient[key];
    
    if (JSON.stringify(serverValue) !== JSON.stringify(clientValue)) {
      changedKeys.push(key);
    }
  }
  
  return {
    hasChanges: changedKeys.length > 0,
    changedKeys,
    serverPrefs: normalizedServer,
    clientPrefs: normalizedClient,
  };
}

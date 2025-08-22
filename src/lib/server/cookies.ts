// lib/server/cookies.ts (enhanced version)
import type {PreferencesMap, EnhancedPreferencesMap} from '../shared/preferences-types';
import {DEFAULT_PREFERENCES, getHydrationInfo} from '../shared/preferences-types';

export function parseCookies(cookieHeader: string): Record<string, string> {
  //console.log('parseCookies - Input header:', cookieHeader);

  if (!cookieHeader) return {};

  const result = cookieHeader.split(';').reduce(
    (cookies, cookie) => {
      const trimmed = cookie.trim();
      //console.log('parseCookies - Processing cookie part:', trimmed);

      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const name = trimmed.substring(0, equalIndex);
        const value = trimmed.substring(equalIndex + 1);
        cookies[name] = value;
        //console.log(`parseCookies - Found cookie: ${name} = ${value}`);
      } else {
        //console.log('parseCookies - Skipping malformed cookie:', trimmed);
      }
      return cookies;
    },
    {} as Record<string, string>,
  );

  //console.log('parseCookies - Final result:', result);
  return result;
}

export function getPreferencesFromRequest(request: Request): EnhancedPreferencesMap {
  const cookieHeader = request.headers.get('cookie') || '';
  //console.log('Server - Raw cookie header:', cookieHeader);

  const cookies = parseCookies(cookieHeader);
  //console.log('Server - Parsed cookies:', cookies);

  let allPrefs: EnhancedPreferencesMap = {...DEFAULT_PREFERENCES};

  if (cookies.sitePreferences) {
    try {
      //console.log('Server - Raw cookie value:', cookies.sitePreferences);
      //console.log('Server - Attempting to decode:', decodeURIComponent(cookies.sitePreferences));

      const parsedPrefs = JSON.parse(
        decodeURIComponent(cookies.sitePreferences),
      );
      //console.log('Server - Parsed preferences from cookie:', parsedPrefs);
      
      // Add server-side hydration metadata
      const enhancedPrefs: EnhancedPreferencesMap = {
        ...parsedPrefs,
        _serverHydrationTime: Date.now(),
        _version: parsedPrefs._version || 1,
      };
      
      allPrefs = {
        ...allPrefs,
        ...enhancedPrefs,
      };
    } catch (error) {
      console.error('Failed to parse server cookie:', error);
      //console.log('Server - Using defaults due to parse error');
    }
  } else {
    console.log('Server - No sitePreferences cookie found, using defaults');
  }

  //console.log('Server - Final preferences:', allPrefs);
  return allPrefs;
}

export function getPreferencesFromCookieString(
  cookieString: string,
): EnhancedPreferencesMap {
  const cookies = parseCookies(cookieString);

  let allPrefs: EnhancedPreferencesMap = {...DEFAULT_PREFERENCES};

  if (cookies.sitePreferences) {
    try {
      const parsedPrefs = JSON.parse(
        decodeURIComponent(cookies.sitePreferences),
      );
      allPrefs = {
        ...allPrefs,
        ...parsedPrefs,
      };
    } catch (error) {
      console.error('Failed to parse server cookie:', error);
    }
  }

  return allPrefs;
}

// Helper to get specific preference type
export function getPreference<K extends keyof PreferencesMap>(
  cookieHeader: string,
  key: K,
): PreferencesMap[K] {
  const allPrefs = getPreferencesFromCookieString(cookieHeader);
  return allPrefs[key] || DEFAULT_PREFERENCES[key];
}

// For use in GraphQL context (updated for Yoga)
export function createPreferencesContext(request: Request) {
  const preferences = getPreferencesFromRequest(request);

  return {
    preferences,
    getPreference<K extends keyof PreferencesMap>(key: K): PreferencesMap[K] {
      return preferences[key] || DEFAULT_PREFERENCES[key];
    },
    // Add hydration helpers using the typed helper function
    getHydrationInfo() {
      return getHydrationInfo(preferences);
    },
  };
}

// Helper for Yoga context integration
export function createContextWithPreferences(yogaContext: any) {
  const request = yogaContext.request;
  const preferences = request ? getPreferencesFromRequest(request) : {};

  return {
    ...yogaContext,
    preferences,
    getPreference<K extends keyof PreferencesMap>(key: K): PreferencesMap[K] {
      return preferences[key] || DEFAULT_PREFERENCES[key];
    },
  };
}

// Enhanced cookie setting helper for server responses
export function buildCookieHeader(
  name: string, 
  value: string, 
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    domain?: string;
    path?: string;
  } = {}
): string {
  const defaultOptions = {
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    httpOnly: false, // Allow client-side access for hydration
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...options,
  };

  let cookie = `${name}=${encodeURIComponent(value)}`;
  
  if (defaultOptions.maxAge) {
    cookie += `; Max-Age=${defaultOptions.maxAge}`;
  }
  if (defaultOptions.httpOnly) {
    cookie += '; HttpOnly';
  }
  if (defaultOptions.secure) {
    cookie += '; Secure';
  }
  if (defaultOptions.sameSite) {
    cookie += `; SameSite=${defaultOptions.sameSite}`;
  }
  if (defaultOptions.domain) {
    cookie += `; Domain=${defaultOptions.domain}`;
  }
  if (defaultOptions.path) {
    cookie += `; Path=${defaultOptions.path}`;
  }
  
  return cookie;
}

// Preference migration helper
export function applyPreferenceMigrations(preferences: any): any {
  if (!preferences) return preferences;
  
  let migrated = { ...preferences };
  
  // Version 1 -> 2: Example migration for commanders preferences
  if (migrated.commanders && migrated.commanders._version !== 2) {
    // Example: rename old fields, add new defaults, etc.
    if (migrated.commanders.oldTimePeriod && !migrated.commanders.timePeriod) {
      migrated.commanders.timePeriod = migrated.commanders.oldTimePeriod;
      delete migrated.commanders.oldTimePeriod;
    }
    
    // Add missing fields with defaults
    if (!migrated.commanders.display) {
      migrated.commanders.display = 'card';
    }
    
    if (!migrated.commanders.statsDisplay) {
      migrated.commanders.statsDisplay = 'topCuts';
    }
    
    migrated.commanders._version = 2;
    migrated.commanders._migrated = Date.now();
  }
  
  // Global version tracking
  migrated._globalVersion = migrated._globalVersion || 1;
  migrated._lastServerRender = Date.now();
  
  return migrated;
}

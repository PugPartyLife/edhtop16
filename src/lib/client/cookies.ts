// lib/client/cookies.ts (enhanced version)
import {useState, useEffect, useRef, useCallback} from 'react';
import {updateRelayPreferences} from './relay_client_environment';
import type {PreferencesMap} from '../shared/preferences-types';
import {DEFAULT_PREFERENCES} from '../shared/preferences-types';

let refetchCallback: ((prefs?: any) => void) | undefined = undefined;

export function setRefetchCallback(callback?: (prefs?: any) => void) {
  refetchCallback = callback;
}

export function clearRefetchCallback() {
  refetchCallback = undefined;
}

function getCookie(name: string): string | null {
  try {
    //console.log('getCookie - Looking for:', name);
    //console.log('getCookie - All cookies:', document.cookie);

    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    //console.log('getCookie - Split parts:', parts);

    if (parts.length === 2) {
      const result = parts.pop()?.split(';').shift() || null;
      //console.log('getCookie - Found value:', result);
      return result;
    }
  } catch (error) {
    console.error('Failed to get cookie:', error);
  }

  //console.log('getCookie - Cookie not found, checking localStorage fallback');

  // Fallback to localStorage for development
  if (process.env.NODE_ENV === 'development') {
    try {
      const lsValue = localStorage.getItem(`cookie_${name}`);
      //console.log('getCookie - localStorage value:', lsValue);
      return lsValue;
    } catch (e) {
      console.warn('localStorage also unavailable');
    }
  }

  return null;
}

function setCookie(name: string, value: string, days: number = 365) {
  try {
    //console.log('setCookie - Input name:', name);
    //console.log('setCookie - Input value:', value);
    //console.log('setCookie - Value length:', value.length);

    const encodedValue = encodeURIComponent(value);
    //console.log('setCookie - Encoded value:', encodedValue);
    //console.log('setCookie - Encoded length:', encodedValue.length);

    // Check if the value is too long (cookies have ~4KB limit)
    if (encodedValue.length > 4000) {
      console.error('setCookie - Cookie value too long!', encodedValue.length);
      return;
    }

    const cookieString = `${name}=${encodedValue}; path=/; max-age=${days * 24 * 60 * 60}`;
    //console.log('setCookie - Cookie string to set:', cookieString);

    // Set the cookie
    document.cookie = cookieString;

    //console.log('setCookie - Document.cookie after setting:', document.cookie);

    // Verify it was set
    const verification = getCookie(name);
    //console.log('setCookie - Verification read back:', verification);

    if (!verification) {
      console.error('setCookie - Cookie verification failed!');

      // Fallback to localStorage for development
      if (process.env.NODE_ENV === 'development') {
        try {
          localStorage.setItem(`cookie_${name}`, value);
          //console.log('setCookie - Saved to localStorage as fallback');
        } catch (e) {
          console.error('setCookie - localStorage also failed:', e);
        }
      }
    } else {
      //console.log('setCookie - Successfully set and verified cookie');
    }
  } catch (error) {
    console.error('setCookie - Exception:', error);
  }
}

// Smart hydration comparison helper
function comparePreferences(
  serverPrefs: any,
  clientPrefs: any,
  ignoredKeys: string[] = ['_lastUpdated', '_version', '_serverHydrationTime', '_clientUpdate', '_migrated']
) {
  const changedKeys: string[] = [];
  
  // Normalize both preferences (remove undefined values and ignored keys)
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

// Enhanced smart hydration hook
export function useSmartHydration<K extends keyof PreferencesMap>(
  key: K,
  preferences: PreferencesMap[K],
  refetchFn?: (prefs: any) => void,
  options: {
    onHydrationMismatch?: (diff: any) => void;
    onHydrationComplete?: (result: 'matched' | 'refetched' | 'error') => void;
    debugMode?: boolean;
  } = {}
) {
  const [hydrationState, setHydrationState] = useState<
    'pending' | 'matched' | 'refetched' | 'error'
  >('pending');
  
  const hasTriggeredHydration = useRef(false);
  
  const {
    onHydrationMismatch,
    onHydrationComplete,
    debugMode = process.env.NODE_ENV === 'development',
  } = options;
  
  const logDebug = useCallback(
    (message: string, data?: any) => {
      if (debugMode) {
        console.log(`[SmartHydration] ${message}`, data);
      }
    },
    [debugMode]
  );
  
  useEffect(() => {
    if (hasTriggeredHydration.current || !preferences) return;
    
    hasTriggeredHydration.current = true;
    
    try {
      // Get server preferences from injected script
      const serverPreferences = (window as any).__SERVER_PREFERENCES__?.[key];
      
      // Get current client preferences from cookies
      const cookieValue = getCookie('sitePreferences');
      let clientPreferences = null;
      
      if (cookieValue) {
        try {
          const allClientPrefs = JSON.parse(decodeURIComponent(cookieValue));
          clientPreferences = allClientPrefs[key];
        } catch (e) {
          console.error('Error parsing client cookie:', e);
        }
      }
      
      logDebug('Starting smart hydration', {
        key,
        serverPreferences,
        clientPreferences,
        currentPreferences: preferences,
      });
      
      // Compare server and client preferences
      const diff = comparePreferences(serverPreferences, clientPreferences);
      
      if (!diff.hasChanges) {
        logDebug('Preferences match, no refetch needed');
        setHydrationState('matched');
        onHydrationComplete?.('matched');
        return;
      }
      
      logDebug('Preferences differ, triggering refetch', {
        changedKeys: diff.changedKeys,
        diff,
      });
      
      // Call mismatch handler if provided
      onHydrationMismatch?.(diff);
      
      // Use the refetch function if provided, otherwise use the global callback
      if (refetchFn) {
        refetchFn(clientPreferences);
      } else if (refetchCallback) {
        refetchCallback(clientPreferences);
      }
      
      setHydrationState('refetched');
      onHydrationComplete?.('refetched');
      
    } catch (error) {
      console.error('[SmartHydration] Error during hydration:', error);
      setHydrationState('error');
      onHydrationComplete?.('error');
    }
  }, [key, preferences, refetchFn, onHydrationMismatch, onHydrationComplete, logDebug]);
  
  return {
    hydrationState,
    isHydrated: hydrationState !== 'pending',
    hasHydrationError: hydrationState === 'error',
  };
}

// Enhanced version of your existing usePreferences hook
export function usePreferences<K extends keyof PreferencesMap>(
  key: K,
  defaultPrefs: PreferencesMap[K],
  options: {
    enableSmartHydration?: boolean;
    onHydrationMismatch?: (diff: any) => void;
    onHydrationComplete?: (result: 'matched' | 'refetched' | 'error') => void;
  } = {},
): {
  preferences: PreferencesMap[K];
  updatePreference: <P extends keyof NonNullable<PreferencesMap[K]>>(
    prefKey: P,
    value: NonNullable<PreferencesMap[K]>[P],
  ) => void;
  isHydrated: boolean;
  hydrationState: 'pending' | 'matched' | 'refetched' | 'error';
} {
  // Start with defaults to match server-side rendering
  const [preferences, setPreferences] =
    useState<PreferencesMap[K]>(defaultPrefs);
  const [isHydrated, setIsHydrated] = useState(false);
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasHydratedRef = useRef(false);

  // Store the initial values in refs to avoid dependency issues
  const keyRef = useRef(key);
  const defaultPrefsRef = useRef(defaultPrefs);

  // Update refs when values change (but don't retrigger the effect)
  keyRef.current = key;
  defaultPrefsRef.current = defaultPrefs;

  // Smart hydration integration
  const { hydrationState } = useSmartHydration(
    key,
    preferences,
    undefined, // Let it use the global refetchCallback
    {
      onHydrationMismatch: options.onHydrationMismatch,
      onHydrationComplete: options.onHydrationComplete,
    }
  );

  useEffect(() => {
    const currentKey = keyRef.current;
    const currentDefaultPrefs = defaultPrefsRef.current;

    //console.log('usePreferences effect starting - key:', currentKey, 'hasHydrated:', hasHydratedRef.current);

    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    // Only run on client after hydration
    if (typeof window === 'undefined') {
      //console.log('usePreferences - running on server, skipping');
      return;
    }

    //console.log('usePreferences - running client hydration for key:', currentKey);
    setIsHydrated(true);

    // Debug: Check what cookies are available
    //console.log('Client hydration - All cookies available:', document.cookie);
    //console.log('Client hydration - Location:', window.location.href);

    // Check if server provided preferences for hydration
    const serverPreferences = (window as any).__SERVER_PREFERENCES__;
    //console.log('Client hydration - Server preferences from window:', serverPreferences);

    let allPrefs: PreferencesMap = {...DEFAULT_PREFERENCES};

    if (serverPreferences) {
      // Use server preferences for initial hydration
      allPrefs = {
        ...allPrefs,
        ...serverPreferences,
      };
      //console.log('Using server preferences for hydration:', serverPreferences);
    } else {
      // Fallback to reading cookies if no server preferences
      const cookieValue = getCookie('sitePreferences');
      //console.log('Hydration - Raw cookie value:', cookieValue);

      if (cookieValue) {
        try {
          const parsed = JSON.parse(decodeURIComponent(cookieValue));
          //console.log('Hydration - Parsed preferences:', parsed);
          allPrefs = {
            ...allPrefs,
            ...parsed,
          };
        } catch (error) {
          console.error('Failed to parse cookie:', error);
        }
      } else {
        //console.log('Client hydration - No sitePreferences cookie found in:', document.cookie);
      }
    }

    const finalPrefs = allPrefs[currentKey] || currentDefaultPrefs;
    //console.log('Hydration - Final preferences for', currentKey, ':', finalPrefs);
    //console.log('Hydration - Default preferences:', currentDefaultPrefs);

    // Always update after hydration to sync with server state
    setPreferences(finalPrefs);
    updateRelayPreferences({[currentKey]: finalPrefs});

    // Small delay to ensure Relay environment is ready
    setTimeout(() => {
      refetchCallback?.(finalPrefs);
    }, 100);
  }, []); // Empty dependency array is now correct since we use refs

  const updatePreference = useCallback(
    <P extends keyof NonNullable<PreferencesMap[K]>>(
      prefKey: P,
      value: NonNullable<PreferencesMap[K]>[P],
    ) => {
      const currentKey = keyRef.current;

      //console.log('updatePreference called with:', { prefKey, value, key: currentKey });

      setPreferences((prevPrefs) => {
        //console.log('updatePreference - Previous preferences:', prevPrefs);

        const newPrefs = {...(prevPrefs ?? {})} as PreferencesMap[K];
        if (!value && value !== 0) {
          delete (newPrefs as any)[prefKey];
        } else {
          (newPrefs as any)[prefKey] = value;
        }

        //console.log('updatePreference - New preferences for', currentKey, ':', newPrefs);

        let allPrefs: PreferencesMap = {...DEFAULT_PREFERENCES};
        const cookieValue = getCookie('sitePreferences');
        //console.log('updatePreference - Current cookie value:', cookieValue);

        if (cookieValue) {
          try {
            allPrefs = {
              ...allPrefs,
              ...JSON.parse(decodeURIComponent(cookieValue)),
            };
            //console.log('updatePreference - Parsed existing preferences:', allPrefs);
          } catch (error) {
            console.error('Failed to parse existing cookie:', error);
          }
        }

        // Add client-side metadata
        const enhancedPrefs = {
          ...newPrefs,
          _lastUpdated: Date.now(),
          _clientUpdate: true,
        };

        allPrefs[currentKey] = enhancedPrefs;
        //console.log('updatePreference - All preferences to save:', allPrefs);

        const jsonToSave = JSON.stringify(allPrefs);
        //console.log('updatePreference - JSON to save:', jsonToSave);
        //console.log('updatePreference - JSON length:', jsonToSave.length);

        setCookie('sitePreferences', jsonToSave);
        updateRelayPreferences({[currentKey]: enhancedPrefs});

        if (refetchTimeoutRef.current) {
          clearTimeout(refetchTimeoutRef.current);
          refetchTimeoutRef.current = null;
        }

        refetchTimeoutRef.current = setTimeout(() => {
          if (refetchCallback) {
            refetchCallback(enhancedPrefs);
          }
          refetchTimeoutRef.current = null;
        }, 250);

        return enhancedPrefs;
      });
    },
    [], // Empty dependency array since we use refs
  );

  return {
    preferences, 
    updatePreference, 
    isHydrated,
    hydrationState
  };
}

// Helper function to clear all preferences (useful for debugging/reset)
export function clearAllPreferences() {
  try {
    document.cookie = 'sitePreferences=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    
    if (process.env.NODE_ENV === 'development') {
      // Also clear localStorage fallbacks
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('cookie_')) {
          localStorage.removeItem(key);
        }
      });
    }
    
    console.log('All preferences cleared');
  } catch (error) {
    console.error('Error clearing preferences:', error);
  }
}

// Re-export types for convenience
export type {PreferencesMap} from '../shared/preferences-types';
export {DEFAULT_PREFERENCES} from '../shared/preferences-types';

// Usage examples:
// const {preferences, updatePreference, hydrationState} = usePreferences('commanders', DEFAULT_PREFERENCES.commanders);
// const {preferences, updatePreference} = usePreferences('entry', DEFAULT_PREFERENCES.entry);
// const {preferences, updatePreference} = usePreferences('tournament', DEFAULT_PREFERENCES.tournament);
// const {preferences, updatePreference} = usePreferences('tournaments', DEFAULT_PREFERENCES.tournaments);

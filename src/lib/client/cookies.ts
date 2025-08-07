import {useState, useEffect, useRef, useCallback} from 'react';
import {updateRelayPreferences} from './relay_client_environment';

export interface CommanderPreferences {
  sortBy?: 'CONVERSION' | 'POPULARITY';
  timePeriod?: 'ONE_MONTH' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'ONE_YEAR' | 'ALL_TIME' | 'POST_BAN';
  colorId?: string;
  minEntries?: number;
  minTournamentSize?: number;
  display?: 'card' | 'table';
}

const DEFAULT_PREFERENCES: CommanderPreferences = {
  sortBy: 'CONVERSION',
  timePeriod: 'ONE_MONTH',
  display: 'card',
  minEntries: 0,
  minTournamentSize: 0,
  colorId: '',
};

let refetchCallback: ((prefs?: CommanderPreferences) => void) | undefined = undefined;

export function setRefetchCallback(callback?: (prefs?: CommanderPreferences) => void) {
  refetchCallback = callback;
}

export function clearRefetchCallback() {
  refetchCallback = undefined;
}

function getCookie(name: string): string | null {
  try {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null;
    }
  } catch (error) {
    // Handle server-side gracefully
  }
  return null;
}

function setCookie(name: string, value: string, days: number = 365) {
  try {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
  } catch (error) {
    // Handle server-side gracefully
  }
}

export function useCommanderPreferences() {
const [preferences, setPreferences] = useState<CommanderPreferences>(DEFAULT_PREFERENCES);
  
  const [isHydrated, setIsHydrated] = useState(false);
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasHydratedRef = useRef(false);
  const initialServerPrefsRef = useRef<CommanderPreferences | null>(null);

  // Store the initial server preferences
useEffect(() => {
  if (!initialServerPrefsRef.current) {
    initialServerPrefsRef.current = preferences;
  }
}, [preferences]);

  useEffect(() => {
  if (hasHydratedRef.current) return;
  hasHydratedRef.current = true;

  setIsHydrated(true);

  let serverPrefs = DEFAULT_PREFERENCES;

  if (typeof window !== 'undefined' && (window as any).__SERVER_PREFERENCES__) {
    serverPrefs = (window as any).__SERVER_PREFERENCES__;
    console.log('🍪 [HYDRATE] Using server-injected preferences:', serverPrefs);
    delete (window as any).__SERVER_PREFERENCES__;
  } else {
    const cookieValue = getCookie('commanderPreferences');
    if (cookieValue) {
      try {
        serverPrefs = { ...DEFAULT_PREFERENCES, ...JSON.parse(decodeURIComponent(cookieValue)) };
        console.log('🍪 [HYDRATE] Using cookie preferences:', serverPrefs);
      } catch (error) {
        console.warn('❌ [HYDRATE] Failed to parse cookies:', error);
      }
    }
  }

  // Only update and refetch if different from current state
  if (JSON.stringify(preferences) !== JSON.stringify(serverPrefs)) {
    setPreferences(serverPrefs);
    updateRelayPreferences(serverPrefs);
    setTimeout(() => {
      refetchCallback?.(serverPrefs);
    }, 100);
  } else {
    updateRelayPreferences(serverPrefs);
    // Do NOT call refetchCallback here!
  }
}, [preferences]);

  const updatePreference = useCallback((key: keyof CommanderPreferences, value: any) => {
    console.log('🍪 updatePreference called:', key, '=', value);
    
    setPreferences(prevPrefs => {
      const newPrefs = { ...prevPrefs };
      
      if (!value || value === '' || value === null) {
        delete newPrefs[key];
      } else {
        newPrefs[key] = value;
      }
      
      console.log('🍪 Setting new preferences:', newPrefs);
      
      setCookie('commanderPreferences', JSON.stringify(newPrefs));
      updateRelayPreferences(newPrefs);
      
      // Clear existing timeout
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
        refetchTimeoutRef.current = null;
      }
      
      // Debounce refetch calls
      refetchTimeoutRef.current = setTimeout(() => {
        console.log('🍪 Triggering refetch after preference change');
        if (refetchCallback) {
          refetchCallback(newPrefs);
        }
        refetchTimeoutRef.current = null;
      }, 250);
      
      return newPrefs;
    });
  }, []);

  return { preferences, updatePreference, isHydrated };
}
import {useState, useEffect, useRef, useCallback} from 'react';
import {updateRelayPreferences} from './relay_client_environment';
import type {
  CommandersSortBy,
  TimePeriod,
} from '#genfiles/queries/pages_CommandersQuery.graphql';

export interface CommanderPreferences {
  sortBy?: CommandersSortBy;
  timePeriod?: TimePeriod;
  colorId?: string;
  minEntries?: number;
  minTournamentSize?: number;
  display?: 'card' | 'table';
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

function setCookie(name: string, value: string, days: number = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);

  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
}

let refetchCallback: ((prefs?: CommanderPreferences) => void) | undefined = undefined;

export function setRefetchCallback(callback?: (prefs?: CommanderPreferences) => void) {
  refetchCallback = callback;
}

export function clearRefetchCallback() {
  refetchCallback = undefined;
}

const DEFAULT_PREFERENCES: CommanderPreferences = {
  sortBy: 'CONVERSION',
  timePeriod: 'ONE_MONTH',
  display: 'card',
  minEntries: 0,
  minTournamentSize: 0,
  colorId: '',
};

export function useCommanderPreferences() {
  // Always start with defaults to ensure server/client consistency
  const [preferences, setPreferences] = useState<CommanderPreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hydrate preferences after client-side mount
  useEffect(() => {
    setIsHydrated(true);
    
    if (typeof window !== 'undefined') {
      const cookieValue = getCookie('commanderPreferences');
      if (cookieValue) {
        try {
          const savedPrefs = JSON.parse(decodeURIComponent(cookieValue));
          console.log('🍪 Post-hydration: Found preferences in cookies:', savedPrefs);
          
          // Merge with defaults to ensure all fields are present
          const mergedPrefs = { ...DEFAULT_PREFERENCES, ...savedPrefs };
          setPreferences(mergedPrefs);
          updateRelayPreferences(mergedPrefs);
        } catch (error) {
          console.warn('❌ Post-hydration: Failed to parse preferences:', error);
        }
      } else {
        // No cookies found, but still update Relay with defaults
        updateRelayPreferences(DEFAULT_PREFERENCES);
      }
    }
  }, []);

  useEffect(() => {
    console.log('🍪 Preferences state changed:', preferences);
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
      
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
        refetchTimeoutRef.current = null;
      }
      
      refetchTimeoutRef.current = setTimeout(() => {
        console.log('🍪 Triggering refetch with immediate preferences:', newPrefs);
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

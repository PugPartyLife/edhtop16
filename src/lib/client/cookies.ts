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

export function useCommanderPreferences() {
  const [preferences, setPreferences] = useState<CommanderPreferences>(() => {
    if (typeof window !== 'undefined') {
      const cookieValue = getCookie('commanderPreferences');
      if (cookieValue) {
        try {
          const savedPrefs = JSON.parse(decodeURIComponent(cookieValue));
//          console.log('🍪 Initial load: Found preferences in cookies:', savedPrefs);
          updateRelayPreferences(savedPrefs);
          return savedPrefs;
        } catch (error) {
//          console.warn('❌ Initial load: Failed to parse preferences from cookies:', error);
        }
      }
    }
    return {};
  });

  useEffect(() => {
    console.log('🍪 Preferences state changed:', preferences);
  }, [preferences]);

  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updatePreference = useCallback((key: keyof CommanderPreferences, value: any) => {
    //console.log('🍪 updatePreference called:', key, '=', value);
    
    setPreferences(prevPrefs => {
      const newPrefs = { ...prevPrefs };
      
      if (!value || value === '' || value === null) {
        delete newPrefs[key];
      } else {
        newPrefs[key] = value;
      }
      
      //console.log('🍪 Setting new preferences:', newPrefs);
      //console.log('🍪 Previous preferences:', prevPrefs);
      
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

  return { preferences, updatePreference };
}

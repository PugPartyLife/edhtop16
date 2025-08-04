import { useState, useEffect, useRef, useCallback } from 'react';
import { updateRelayPreferences } from './relay_client_environment';
import type { CommandersSortBy, TimePeriod } from '#genfiles/queries/pages_CommandersQuery.graphql';

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

let refetchCallback: (() => void) | undefined = undefined;

export function setRefetchCallback(callback?: () => void) {
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
          console.log('🍪 Initial load: Found preferences in cookies:', savedPrefs);
          updateRelayPreferences(savedPrefs);
          return savedPrefs;
        } catch (error) {
          console.warn('❌ Initial load: Failed to parse preferences from cookies:', error);
        }
      }
    }
    return {};
  });

  useEffect(() => {
    console.log('🍪 useCommanderPreferences mounted with:', preferences);
  }, []);

  const updatePreference = useCallback((key: keyof CommanderPreferences, value: any) => {
    console.log('🍪 updatePreference called:', key, '=', value);
    
    setPreferences(prevPrefs => {
      const newPrefs = { ...prevPrefs };
      
      if (!value || value === '' || value === null) {
        delete newPrefs[key];
      } else {
        newPrefs[key] = value;
      }
      
      //console.log('🍪 New preferences object:', newPrefs);
      
      setCookie('commanderPreferences', JSON.stringify(newPrefs));
      updateRelayPreferences(newPrefs);
    
      setTimeout(() => {
        console.log('🍪 Triggering refetch from updatePreference');
        if (refetchCallback) {
          refetchCallback();
        } else {
          console.log('🍪 No refetch callback available');
        }
      }, 100);
      
      return newPrefs;
    });
  }, []);

  return {
    preferences,
    updatePreference,
  };
}

import {Context} from './schema/builder';
import {TopdeckClient} from './topdeck';
import type {CommanderPreferences} from '#src/lib/client/cookies';

export function createContext(
  commanderPreferences?: CommanderPreferences,
): Context {
  return {
    topdeckClient: new TopdeckClient(),
    commanderPreferences: commanderPreferences || {},
    setCommanderPreferences: () => {},
  };
}

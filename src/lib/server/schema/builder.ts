import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import RelayPlugin from '@pothos/plugin-relay';
import {TopdeckClient} from '../topdeck';
import {CommanderPreferences} from '#src/lib/client/cookies.js';

export interface Context {
  topdeckClient: TopdeckClient;
  commanderPreferences: CommanderPreferences;
  setCommanderPreferences: (prefs: CommanderPreferences) => void;
}

export const builder = new SchemaBuilder<{
  Context: Context;
  DefaultFieldNullability: false;
}>({
  plugins: [RelayPlugin, DataloaderPlugin],
  relay: {},
  defaultFieldNullability: false,
});

builder.queryType({});

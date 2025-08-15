import {DB} from '#genfiles/db/types';
import {
  resolveCursorConnection,
  ResolveCursorConnectionArgs,
  resolveOffsetConnection,
} from '@pothos/plugin-relay';
import {subYears} from 'date-fns';
import {sql} from 'kysely';
import {db} from '../db';
import {builder} from './builder';
import {Card} from './card';
import {Entry} from './entry';
import {FirstPartyPromoRef, getActivePromotions} from './promo';
import {minDateFromTimePeriod, TimePeriod, type TimePeriodType} from './types';
import {safeDivision, safeNumber} from '../../utils';

const queryCache = new Map<string, {data: any; timestamp: number}>();
const CACHE_TTL = 60000; // 1 minute
const MAX_CACHE_SIZE = 100; // Maximum number of cached queries

function cleanupCache() {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, value] of queryCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => queryCache.delete(key));

  if (queryCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(queryCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    const toRemove = entries.slice(0, queryCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => queryCache.delete(key));
  }
}

const isGenerationMode =
  process.argv.some(
    (arg) =>
      arg.includes('generate') ||
      arg.includes('build') ||
      arg.includes('schema'),
  ) || process.env.npm_lifecycle_event?.includes('generate'); // prevents generate:schema from taking 5 * 60 * 1000ms

if (!isGenerationMode) {
  setInterval(cleanupCache, 5 * 60 * 1000);
}

const CommandersSortBy = builder.enumType('CommandersSortBy', {
  values: ['POPULARITY', 'CONVERSION', 'TOP_CUTS'] as const,
});

const EntriesSortBy = builder.enumType('EntriesSortBy', {
  values: ['NEW', 'TOP'] as const,
});

const CommanderStatsFilters = builder.inputType('CommanderStatsFilters', {
  fields: (t) => ({
    colorId: t.string(),
    minSize: t.int(),
    minDate: t.string(),
    maxSize: t.int(),
    maxDate: t.string(),
    timePeriod: t.field({type: TimePeriod}),
  }),
});

const EntriesFilter = builder.inputType('EntriesFilter', {
  fields: (t) => ({
    timePeriod: t.field({type: TimePeriod, defaultValue: 'ALL_TIME'}),
    minEventSize: t.int({defaultValue: 60}),
    maxStanding: t.int(),
  }),
});

export const Commander = builder.loadableNodeRef('Commander', {
  id: {parse: (id) => Number(id), resolve: (parent) => parent.id},
  load: async (ids: number[]) => {
    const nodes = await db
      .selectFrom('Commander')
      .selectAll()
      .where('id', 'in', ids)
      .execute();

    const nodesById = new Map<number, (typeof nodes)[number]>();
    for (const node of nodes) nodesById.set(node.id, node);

    return ids.map((id) => nodesById.get(id)!);
  },
});

Commander.implement({
  fields: (t) => ({
    name: t.exposeString('name'),
    colorId: t.exposeString('colorId'),
    breakdownUrl: t.string({
      resolve: (parent) => `/commander/${encodeURIComponent(parent.name)}`,
    }),
    stats: t.loadable({
      type: CommanderStats,
      byPath: true,
      resolve: (parent) => parent.id,
      load: async (commanderIds: number[], ctx) => {
        const sortBy = ctx.preferences.commanders?.sortBy ?? 'CONVERSION';
        const timePeriod = (ctx.preferences.commanders?.timePeriod ??
          'ONE_MONTH') as TimePeriodType;
        const minEntries = ctx.preferences.commanders?.minEntries ?? 0;
        const minTournamentSize =
          ctx.preferences.commanders?.minTournamentSize ?? 0;
        const colorId = ctx.preferences.commanders?.colorId;

        const minDate = minDateFromTimePeriod(timePeriod);
        const minTournamentSizeValue = minTournamentSize || 0;

        const [entriesQuery, statsQuery] = await Promise.all([
          db
            .selectFrom('Entry')
            .select((eb) => eb.fn.countAll<number>().as('totalEntries'))
            .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
            .where('Tournament.size', '>=', minTournamentSizeValue)
            .where('Tournament.tournamentDate', '>=', minDate.toISOString())
            .executeTakeFirstOrThrow(),
          db
            .selectFrom('Commander')
            .leftJoin('Entry', 'Entry.commanderId', 'Commander.id')
            .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
            .select([
              'Commander.id',
              'Commander.name',
              'Commander.colorId',
              (eb) => eb.fn.count<number>('Commander.id').as('count'),
              (eb) =>
                eb.fn
                  .sum<number>(
                    eb(
                      eb.cast(eb.ref('Tournament.topCut'), 'real'),
                      '/',
                      // Add null check in SQL to prevent division by zero
                      eb.case()
                        .when(eb.ref('Tournament.size'), '>', 0)
                        .then(eb.cast(eb.ref('Tournament.size'), 'real'))
                        .else(1)
                        .end(),
                    ),
                  )
                  .as('topCutBias'),
              (eb) =>
                eb.fn
                  .sum<number>(
                    eb
                      .case()
                      .when('Entry.standing', '<=', eb.ref('Tournament.topCut'))
                      .then(1)
                      .else(0)
                      .end(),
                  )
                  .as('topCuts'),
              // Safe conversion rate calculation in SQL
              (eb) =>
                eb.case()
                  .when(eb.fn.count<number>('Entry.id'), '>', 0)
                  .then(
                    eb(
                      eb.cast<number>(
                        eb.fn.sum<number>(
                          eb
                            .case()
                            .when('Entry.standing', '<=', eb.ref('Tournament.topCut'))
                            .then(1)
                            .else(0)
                            .end(),
                        ),
                        'real',
                      ),
                      '/',
                      eb.fn.count<number>('Entry.id'),
                    )
                  )
                  .else(0)
                  .end()
                  .as('conversionRate'),
            ])
            .where('Tournament.size', '>=', minTournamentSizeValue)
            .where('Tournament.tournamentDate', '>=', minDate.toISOString())
            .where('Commander.id', 'in', commanderIds)
            .groupBy('Commander.id')
            .execute(),
        ]);

        const totalEntries = safeNumber(entriesQuery.totalEntries, 1);
        const statsByCommanderId = new Map<number, CommanderCalculatedStats>();
        
        for (const {id, ...stats} of statsQuery) {
          const count = safeNumber(stats.count, 0);
          const topCuts = safeNumber(stats.topCuts, 0);
          const topCutBias = safeNumber(stats.topCutBias, 0);
          const conversionRate = safeDivision(topCuts, count);
          const metaShare = safeDivision(count, totalEntries);
          
          statsByCommanderId.set(id, {
            count,
            topCuts,
            topCutBias,
            conversionRate,
            metaShare,
          });
        }

        return commanderIds.map(
          (id) =>
            statsByCommanderId.get(id) ?? {
              topCuts: 0,
              topCutBias: 0,
              conversionRate: 0,
              count: 0,
              metaShare: 0,
            },
        );
      },
    }),

    filteredStats: t.field({
      type: CommanderStats,
      args: {
        minEventSize: t.arg.int(),
        maxStanding: t.arg.int(),
        timePeriod: t.arg({type: TimePeriod, required: true}),
      },
      resolve: async (parent, args, context) => {
        const preferences = context.preferences.entry || {
          sortBy: 'TOP',
          timePeriod: 'ONE_YEAR',
          minEventSize: null,
          maxStanding: null,
        };

        const minEventSize = preferences.minEventSize || args.minEventSize || 0;
        const maxStanding =
          preferences.maxStanding ||
          args.maxStanding ||
          Number.MAX_SAFE_INTEGER;
        const timePeriod = preferences.timePeriod || args.timePeriod;

        const minDate = minDateFromTimePeriod(timePeriod);

        const [entriesQuery, statsQuery] = await Promise.all([
          db
            .selectFrom('Entry')
            .select((eb) => eb.fn.countAll<number>().as('totalEntries'))
            .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
            .where('Tournament.size', '>=', minEventSize)
            .where('Tournament.tournamentDate', '>=', minDate.toISOString())
            .where('Entry.standing', '<=', maxStanding)
            .executeTakeFirstOrThrow(),

          db
            .selectFrom('Entry')
            .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
            .select([
              (eb) => eb.fn.count<number>('Entry.id').as('count'),
              (eb) =>
                eb.fn
                  .sum<number>(
                    eb(
                      eb.cast(eb.ref('Tournament.topCut'), 'real'),
                      '/',
                      eb.case()
                        .when(eb.ref('Tournament.size'), '>', 0)
                        .then(eb.cast(eb.ref('Tournament.size'), 'real'))
                        .else(1)
                        .end(),
                    ),
                  )
                  .as('topCutBias'),
              (eb) =>
                eb.fn
                  .sum<number>(
                    eb
                      .case()
                      .when('Entry.standing', '<=', eb.ref('Tournament.topCut'))
                      .then(1)
                      .else(0)
                      .end(),
                  )
                  .as('topCuts'),
              // Safe conversion rate in SQL
              (eb) =>
                eb.case()
                  .when(eb.fn.count<number>('Entry.id'), '>', 0)
                  .then(
                    eb(
                      eb.cast<number>(
                        eb.fn.sum<number>(
                          eb
                            .case()
                            .when('Entry.standing', '<=', eb.ref('Tournament.topCut'))
                            .then(1)
                            .else(0)
                            .end(),
                        ),
                        'real',
                      ),
                      '/',
                      eb.fn.count<number>('Entry.id'),
                    )
                  )
                  .else(0)
                  .end()
                  .as('conversionRate'),
            ])
            .where('Entry.commanderId', '=', parent.id)
            .where('Tournament.size', '>=', minEventSize)
            .where('Tournament.tournamentDate', '>=', minDate.toISOString())
            .where('Entry.standing', '<=', maxStanding)
            .executeTakeFirst(),
        ]);

        const totalEntries = safeNumber(entriesQuery.totalEntries, 1);
        const stats = statsQuery ?? {
          count: 0,
          topCuts: 0,
          topCutBias: 0,
          conversionRate: 0,
        };

        const count = safeNumber(stats.count, 0);
        const topCuts = safeNumber(stats.topCuts, 0);
        const topCutBias = safeNumber(stats.topCutBias, 0);
        const conversionRate = safeDivision(topCuts, count);
        const metaShare = safeDivision(count, totalEntries);

        return {
          count,
          topCuts,
          topCutBias,
          conversionRate,
          metaShare,
        };
      },
    }),

    entries: t.connection({
      type: Entry,
      args: {
        filters: t.arg({type: EntriesFilter}),
        sortBy: t.arg({
          type: EntriesSortBy,
          defaultValue: 'TOP',
        }),
      },
      resolve: (parent, args) =>
        resolveOffsetConnection({args}, ({limit, offset}) => {
          const minEventSize = args.filters?.minEventSize ?? 60;
          const maxStanding =
            args.filters?.maxStanding ?? Number.MAX_SAFE_INTEGER;
          const minDate = minDateFromTimePeriod(
            args.filters?.timePeriod ?? 'ALL_TIME',
          );

          return db
            .selectFrom('Entry')
            .selectAll('Entry')
            .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
            .where('Entry.commanderId', '=', parent.id)
            .where('standing', '<=', maxStanding)
            .where('Tournament.tournamentDate', '>=', minDate.toISOString())
            .where('Tournament.size', '>=', minEventSize)
            .orderBy(
              args.sortBy === 'NEW'
                ? ['Tournament.tournamentDate desc']
                : ['Entry.standing asc', 'Tournament.size desc'],
            )
            .limit(limit)
            .offset(offset)
            .execute();
        }),
    }),
    cards: t.loadableList({
      type: Card,
      load: async (commanders: string[]) => {
        if (commanders.length === 0) return [];

        const names = commanders.map((c) =>
          c === 'Unknown Commander' ? [] : c.split(' / '),
        );

        const cards = await db
          .selectFrom('Card')
          .selectAll()
          .where('name', 'in', names.flat())
          .execute();

        const cardByName = new Map<string, DB['Card']>();
        for (const card of cards) cardByName.set(card.name, card);

        return names.map((ns) =>
          ns.map((n) => cardByName.get(n)!).filter(Boolean),
        );
      },
      resolve: (parent) => parent.name,
    }),
    staples: t.connection({
      type: Card,
      resolve: async (parent, args) => {
        return resolveOffsetConnection({args}, async ({limit, offset}) => {
          const oneYearAgo = subYears(new Date(), 1).toISOString();

          const {totalEntries} = await db
            .selectFrom('Entry')
            .select([(eb) => eb.fn.countAll<number>().as('totalEntries')])
            .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
            .where('Entry.commanderId', '=', parent.id)
            .where('Tournament.tournamentDate', '>=', oneYearAgo)
            .executeTakeFirstOrThrow();

          const safeTotalEntries = safeNumber(totalEntries, 1);

          const query = db
            .with('entries', (eb) => {
              return eb
                .selectFrom('DecklistItem')
                .leftJoin('Card', 'Card.id', 'DecklistItem.cardId')
                .leftJoin('Entry', 'Entry.id', 'DecklistItem.entryId')
                .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
                .where('Entry.commanderId', '=', parent.id)
                .where('Tournament.tournamentDate', '>=', oneYearAgo)
                .groupBy('Card.id')
                .select((eb) => [
                  eb.ref('Card.id').as('cardId'),
                  // Safe division for play rate using literal value
                  eb.case()
                    .when(sql.lit(safeTotalEntries), '>', 0)
                    .then(
                      eb(
                        eb.cast(eb.fn.count<number>('Card.id'), 'real'),
                        '/',
                        sql.lit(safeTotalEntries),
                      )
                    )
                    .else(0)
                    .end()
                    .as('playRateLastYear'),
                ]);
            })
            .selectFrom('Card')
            .leftJoin('entries', 'entries.cardId', 'Card.id')
            .where((eb) =>
              eb(
                eb.fn('json_extract', ['Card.data', sql`'$.type_line'`]),
                'not like',
                '%Land%',
              ),
            )
            .orderBy(
              (eb) =>
                eb(
                  eb.fn.coalesce('entries.playRateLastYear', sql`0`),
                  '-',
                  eb.fn.coalesce(eb.ref('Card.playRateLastYear'), sql`0`),
                ),
              'desc',
            )
            .selectAll('Card');

          return query.limit(limit).offset(offset).execute();
        });
      },
    }),
    promo: t.field({
      type: FirstPartyPromoRef,
      nullable: true,
      resolve: (parent) => {
        return getActivePromotions({commander: parent.name})[0];
      },
    }),
  }),
});

builder.queryField('commander', (t) =>
  t.field({
    type: Commander,
    args: {name: t.arg.string({required: true})},
    resolve: async (_root, args) => {
      return db
        .selectFrom('Commander')
        .selectAll()
        .where('name', '=', args.name)
        .executeTakeFirstOrThrow();
    },
  }),
);

builder.queryField('commanders', (t) =>
  t.connection({
    type: Commander,
    args: {
      minEntries: t.arg.int(),
      minTournamentSize: t.arg.int(),
      timePeriod: t.arg({type: TimePeriod, defaultValue: 'ONE_MONTH'}),
      sortBy: t.arg({type: CommandersSortBy, defaultValue: 'CONVERSION'}),
      colorId: t.arg.string(),
    },
    resolve: async (_root, args, context) => {
      const sortBy =
        context.preferences.commanders?.sortBy ?? args.sortBy ?? 'CONVERSION';
      const timePeriod = (context.preferences.commanders?.timePeriod ??
        args.timePeriod ??
        'ONE_MONTH') as TimePeriodType;
      const minEntries =
        context.preferences.commanders?.minEntries ?? args.minEntries ?? 0;
      const minTournamentSize =
        context.preferences.commanders?.minTournamentSize ??
        args.minTournamentSize ??
        0;
      const colorId = context.preferences.commanders?.colorId ?? args.colorId;

      const cacheKey = JSON.stringify({
        args: {
          first: args.first,
          after: args.after,
          before: args.before,
          last: args.last,
        },
        filters: {
          sortBy,
          timePeriod,
          minEntries,
          minTournamentSize,
          colorId,
        },
      });

      const cached = queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        //console.log('⚡ Using cached commanders query result');
        return cached.data;
      }

      const result = await resolveCursorConnection(
        {args, toCursor: (parent) => `${parent.id}`},
        async ({
          before,
          after,
          limit,
          inverted,
        }: ResolveCursorConnectionArgs) => {
          const minDate = minDateFromTimePeriod(timePeriod);
          const minTournamentSizeValue = minTournamentSize || 0;
          const minEntriesValue = minEntries || 0;
          const sortByField =
            sortBy === 'POPULARITY'
              ? 'stats.count'
              : sortBy === 'TOP_CUTS'
                ? 'stats.topCuts'
                : 'stats.conversionRate';

          let query = db
            .with('stats', (eb) =>
              eb
                .selectFrom('Commander')
                .leftJoin('Entry', 'Entry.commanderId', 'Commander.id')
                .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
                .where('Tournament.tournamentDate', '>=', minDate.toISOString())
                .where('Tournament.size', '>=', minTournamentSizeValue)
                .groupBy('Commander.id')
                .select((eb) => [
                  eb.ref('Commander.id').as('commanderId'),
                  eb.fn.count('Entry.id').as('count'),
                  eb.fn
                    .sum(
                      eb
                        .case()
                        .when(
                          'Entry.standing',
                          '<=',
                          eb.ref('Tournament.topCut'),
                        )
                        .then(1)
                        .else(0)
                        .end(),
                    )
                    .as('topCuts'),
                  eb(
                    eb.cast(
                      eb.fn.sum(
                        eb
                          .case()
                          .when(
                            'Entry.standing',
                            '<=',
                            eb.ref('Tournament.topCut'),
                          )
                          .then(1)
                          .else(0)
                          .end(),
                      ),
                      'real',
                    ),
                    '/',
                    eb.fn.count('Entry.id'),
                  ).as('conversionRate'),
                ]),
            )
            .selectFrom('Commander')
            .selectAll('Commander')
            .leftJoin('stats', 'stats.commanderId', 'Commander.id')
            .where('Commander.name', '!=', 'Unknown Commander')
            .where('Commander.name', '!=', 'Nadu, Winged Wisdom')
            .where('stats.count', '>=', minEntriesValue);

          if (colorId) {
            query = query.where('Commander.colorId', '=', colorId);
          }

          if (before) {
            query = query.where((eb) =>
              eb(
                eb.tuple(eb.ref(sortByField), eb.ref('Commander.id')),
                '>',
                eb.tuple(
                  eb
                    .selectFrom('stats')
                    .select(sortByField)
                    .where('commanderId', '=', Number(after)),
                  Number(after),
                ),
              ),
            );
          }

          if (after) {
            query = query.where((eb) =>
              eb(
                eb.tuple(eb.ref(sortByField), eb.ref('Commander.id')),
                '<',
                eb.tuple(
                  eb
                    .selectFrom('stats')
                    .select(sortByField)
                    .where('commanderId', '=', Number(after)),
                  Number(after),
                ),
              ),
            );
          }

          query = query
            .orderBy(sortByField, inverted ? 'asc' : 'desc')
            .orderBy('Commander.id', inverted ? 'asc' : 'desc')
            .limit(limit);

          return query.execute();
        },
      );

      queryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    },
  }),
);

interface CommanderCalculatedStats {
  count: number;
  topCuts: number;
  conversionRate: number;
  metaShare: number;
  topCutBias: number;
}

const CommanderStats = builder
  .objectRef<CommanderCalculatedStats>('CommanderStats')
  .implement({
    fields: (t) => ({
      count: t.int({
        resolve: (parent) => safeNumber(parent.count, 0),
      }),
      topCuts: t.int({
        resolve: (parent) => safeNumber(parent.topCuts, 0),
      }),
      topCutBias: t.float({
        resolve: (parent) => safeNumber(parent.topCutBias, 0),
      }),
      conversionRate: t.float({
        resolve: (parent) => safeDivision(safeNumber(parent.topCuts), safeNumber(parent.count)),
      }),
      metaShare: t.float({
        resolve: (parent) => safeNumber(parent.metaShare, 0),
      }),
    }),
  });
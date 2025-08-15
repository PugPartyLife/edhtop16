// Add these to your existing GraphQL schema files

import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { safeDivision, safeNumber } from './utils'; // your helper functions

// New GraphQL Types
const ArchetypeCategoryType = builder.objectType('ArchetypeCategory', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description'),
    color: t.exposeString('color'),
    priority: t.exposeInt('priority'),
    functions: t.field({
      type: [ArchetypeFunctionType],
      resolve: async (parent) => {
        return db
          .selectFrom('archetype_functions')
          .selectAll()
          .where('category_id', '=', parent.id)
          .orderBy('name', 'asc')
          .execute();
      }
    }),
    cardCount: t.int({
      resolve: async (parent) => {
        const result = await db
          .selectFrom('card_archetypes')
          .innerJoin('archetype_functions', 'archetype_functions.id', 'card_archetypes.function_id')
          .select((eb) => eb.fn.countDistinct<number>('card_archetypes.card_id').as('count'))
          .where('archetype_functions.category_id', '=', parent.id)
          .where('card_archetypes.confidence', '>', 0.5)
          .executeTakeFirst();
        return result?.count || 0;
      }
    })
  })
});

const ArchetypeFunctionType = builder.objectType('ArchetypeFunction', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description'),
    category: t.field({
      type: ArchetypeCategoryType,
      resolve: async (parent) => {
        return db
          .selectFrom('archetype_categories')
          .selectAll()
          .where('id', '=', parent.category_id)
          .executeTakeFirstOrThrow();
      }
    }),
    cardCount: t.int({
      resolve: async (parent) => {
        const result = await db
          .selectFrom('card_archetypes')
          .select((eb) => eb.fn.countDistinct<number>('card_id').as('count'))
          .where('function_id', '=', parent.id)
          .where('confidence', '>', 0.5)
          .executeTakeFirst();
        return result?.count || 0;
      }
    })
  })
});

const CardArchetypeType = builder.objectType('CardArchetype', {
  fields: (t) => ({
    function: t.field({
      type: ArchetypeFunctionType,
      resolve: async (parent) => {
        return db
          .selectFrom('archetype_functions')
          .selectAll()
          .where('id', '=', parent.function_id)
          .executeTakeFirstOrThrow();
      }
    }),
    confidence: t.exposeFloat('confidence'),
    contextDependent: t.boolean({
      resolve: (parent) => Boolean(parent.context_dependent)
    }),
    manualOverride: t.boolean({
      resolve: (parent) => Boolean(parent.manual_override)
    })
  })
});

const ArchetypeSearchFiltersInput = builder.inputType('ArchetypeSearchFilters', {
  fields: (t) => ({
    categories: t.stringList(),
    functions: t.stringList(),
    minConfidence: t.float({ defaultValue: 0.5 }),
    contextDependent: t.boolean(),
    colors: t.stringList(), // MTG colors: W, U, B, R, G
    cmc: t.field({
      type: IntRangeInput
    }),
    types: t.stringList(), // creature, instant, sorcery, etc.
  })
});

const IntRangeInput = builder.inputType('IntRange', {
  fields: (t) => ({
    min: t.int(),
    max: t.int()
  })
});

// Add to your existing Card implementation
Card.implement({
  fields: (t) => ({
    // ... existing fields
    
    archetypes: t.field({
      type: [CardArchetypeType],
      args: {
        minConfidence: t.arg.float({ defaultValue: 0.3 })
      },
      resolve: async (parent, args) => {
        return db
          .selectFrom('card_archetypes')
          .selectAll()
          .where('card_id', '=', parent.id)
          .where('confidence', '>=', args.minConfidence)
          .orderBy('confidence', 'desc')
          .execute();
      }
    }),
    
    primaryArchetype: t.field({
      type: CardArchetypeType,
      nullable: true,
      resolve: async (parent) => {
        return db
          .selectFrom('card_archetypes')
          .selectAll()
          .where('card_id', '=', parent.id)
          .orderBy('confidence', 'desc')
          .executeTakeFirst();
      }
    }),
    
    archetypeCategories: t.field({
      type: [ArchetypeCategoryType],
      resolve: async (parent) => {
        return db
          .selectFrom('card_archetypes')
          .innerJoin('archetype_functions', 'archetype_functions.id', 'card_archetypes.function_id')
          .innerJoin('archetype_categories', 'archetype_categories.id', 'archetype_functions.category_id')
          .selectAll('archetype_categories')
          .where('card_archetypes.card_id', '=', parent.id)
          .where('card_archetypes.confidence', '>', 0.5)
          .groupBy('archetype_categories.id')
          .execute();
      }
    })
  })
});

// New Query Fields
builder.queryField('archetypeCategories', (t) =>
  t.field({
    type: [ArchetypeCategoryType],
    resolve: async () => {
      return db
        .selectFrom('archetype_categories')
        .selectAll()
        .orderBy('priority', 'asc')
        .execute();
    }
  })
);

builder.queryField('archetypeFunctions', (t) =>
  t.field({
    type: [ArchetypeFunctionType],
    args: {
      categoryId: t.arg.int()
    },
    resolve: async (_, args) => {
      let query = db
        .selectFrom('archetype_functions')
        .selectAll();
      
      if (args.categoryId) {
        query = query.where('category_id', '=', args.categoryId);
      }
      
      return query.orderBy('name', 'asc').execute();
    }
  })
);

builder.queryField('searchCardsByArchetype', (t) =>
  t.connection({
    type: Card,
    args: {
      filters: t.arg({ type: ArchetypeSearchFiltersInput, required: true })
    },
    resolve: async (_, args) => {
      return resolveOffsetConnection({ args }, async ({ limit, offset }) => {
        let query = db
          .selectFrom('Card')
          .innerJoin('card_archetypes', 'card_archetypes.card_id', 'Card.id')
          .innerJoin('archetype_functions', 'archetype_functions.id', 'card_archetypes.function_id')
          .innerJoin('archetype_categories', 'archetype_categories.id', 'archetype_functions.category_id')
          .selectAll('Card')
          .where('card_archetypes.confidence', '>=', args.filters.minConfidence || 0.5);

        // Filter by categories
        if (args.filters.categories && args.filters.categories.length > 0) {
          query = query.where('archetype_categories.name', 'in', args.filters.categories);
        }

        // Filter by functions
        if (args.filters.functions && args.filters.functions.length > 0) {
          query = query.where('archetype_functions.name', 'in', args.filters.functions);
        }

        // Filter by context dependency
        if (args.filters.contextDependent !== undefined) {
          query = query.where('card_archetypes.context_dependent', '=', args.filters.contextDependent ? 1 : 0);
        }

        // Filter by colors
        if (args.filters.colors && args.filters.colors.length > 0) {
          for (const color of args.filters.colors) {
            query = query.where((eb) =>
              eb.fn('json_extract', ['Card.data', '$.colors']), 'like', `%${color}%`
            );
          }
        }

        // Filter by CMC range
        if (args.filters.cmc) {
          if (args.filters.cmc.min !== undefined) {
            query = query.where((eb) =>
              eb.fn('json_extract', ['Card.data', '$.cmc']), '>=', args.filters.cmc.min
            );
          }
          if (args.filters.cmc.max !== undefined) {
            query = query.where((eb) =>
              eb.fn('json_extract', ['Card.data', '$.cmc']), '<=', args.filters.cmc.max
            );
          }
        }

        // Filter by card types
        if (args.filters.types && args.filters.types.length > 0) {
          for (const type of args.filters.types) {
            query = query.where((eb) =>
              eb.fn('json_extract', ['Card.data', '$.type_line']), 'like', `%${type}%`
            );
          }
        }

        return query
          .groupBy('Card.id') // Remove duplicates from multiple archetype matches
          .orderBy('card_archetypes.confidence', 'desc')
          .limit(limit)
          .offset(offset)
          .execute();
      });
    }
  })
);

// Advanced archetype analysis queries
builder.queryField('archetypeMetaAnalysis', (t) =>
  t.field({
    type: ArchetypeMetaAnalysisType,
    args: {
      timePeriod: t.arg({ type: TimePeriod, defaultValue: 'THREE_MONTHS' }),
      minTournamentSize: t.arg.int({ defaultValue: 60 }),
      commanders: t.arg.stringList() // optional filter by specific commanders
    },
    resolve: async (_, args) => {
      const minDate = minDateFromTimePeriod(args.timePeriod);
      
      // Get archetype distribution across all successful decks
      let baseQuery = db
        .selectFrom('Entry')
        .innerJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
        .innerJoin('DecklistItem', 'DecklistItem.entryId', 'Entry.id')
        .innerJoin('card_archetypes', 'card_archetypes.card_id', 'DecklistItem.cardId')
        .innerJoin('archetype_functions', 'archetype_functions.id', 'card_archetypes.function_id')
        .innerJoin('archetype_categories', 'archetype_categories.id', 'archetype_functions.category_id')
        .innerJoin('Commander', 'Commander.id', 'Entry.commanderId')
        .where('Tournament.tournamentDate', '>=', minDate.toISOString())
        .where('Tournament.size', '>=', args.minTournamentSize)
        .where('card_archetypes.confidence', '>', 0.5)
        .where((eb) => eb.or([
          eb('Entry.standing', '<=', eb.ref('Tournament.topCut')),
          eb('Entry.standing', '<=', eb('Tournament.size', '/', 4))
        ]));

      if (args.commanders && args.commanders.length > 0) {
        baseQuery = baseQuery.where('Commander.name', 'in', args.commanders);
      }

      // Get archetype popularity
      const archetypePopularity = await baseQuery
        .select([
          'archetype_categories.name as category',
          'archetype_functions.name as function_name',
          (eb) => eb.fn.count('Entry.id').as('total_inclusions'),
          (eb) => eb.fn.countDistinct('Entry.id').as('decks_with_archetype'),
          (eb) => eb.fn.countDistinct('Commander.id').as('commanders_using')
        ])
        .groupBy(['archetype_categories.name', 'archetype_functions.name'])
        .orderBy('total_inclusions', 'desc')
        .execute();

      // Get total successful decks for percentage calculation
      const totalDecksResult = await db
        .selectFrom('Entry')
        .innerJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
        .select((eb) => eb.fn.countDistinct('Entry.id').as('total'))
        .where('Tournament.tournamentDate', '>=', minDate.toISOString())
        .where('Tournament.size', '>=', args.minTournamentSize)
        .where((eb) => eb.or([
          eb('Entry.standing', '<=', eb.ref('Tournament.topCut')),
          eb('Entry.standing', '<=', eb('Tournament.size', '/', 4))
        ]))
        .executeTakeFirst();

      const totalDecks = totalDecksResult?.total || 1;

      return {
        timePeriod: args.timePeriod,
        totalDecksAnalyzed: totalDecks,
        archetypePopularity: archetypePopularity.map(row => ({
          category: row.category,
          functionName: row.function_name,
          totalInclusions: row.total_inclusions,
          decksWithArchetype: row.decks_with_archetype,
          commandersUsing: row.commanders_using,
          metaPercentage: safeDivision(row.decks_with_archetype, totalDecks) * 100,
          averageCardsPerDeck: safeDivision(row.total_inclusions, row.decks_with_archetype)
        }))
      };
    }
  })
);

// Response types for meta analysis
const ArchetypeMetaAnalysisType = builder.objectType('ArchetypeMetaAnalysis', {
  fields: (t) => ({
    timePeriod: t.field({ type: TimePeriod }),
    totalDecksAnalyzed: t.exposeInt('totalDecksAnalyzed'),
    archetypePopularity: t.field({
      type: [ArchetypePopularityType],
      resolve: (parent) => parent.archetypePopularity
    })
  })
});

const ArchetypePopularityType = builder.objectType('ArchetypePopularity', {
  fields: (t) => ({
    category: t.exposeString('category'),
    functionName: t.exposeString('functionName'),
    totalInclusions: t.exposeInt('totalInclusions'),
    decksWithArchetype: t.exposeInt('decksWithArchetype'),
    commandersUsing: t.exposeInt('commandersUsing'),
    metaPercentage: t.exposeFloat('metaPercentage'),
    averageCardsPerDeck: t.exposeFloat('averageCardsPerDeck')
  })
});

// Commander-specific archetype analysis
builder.queryField('commanderArchetypeAnalysis', (t) =>
  t.field({
    type: [CommanderArchetypeAnalysisType],
    args: {
      commanderName: t.arg.string({ required: true }),
      timePeriod: t.arg({ type: TimePeriod, defaultValue: 'SIX_MONTHS' })
    },
    resolve: async (_, args) => {
      const minDate = minDateFromTimePeriod(args.timePeriod);
      
      return db
        .selectFrom('Entry')
        .innerJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
        .innerJoin('Commander', 'Commander.id', 'Entry.commanderId')
        .innerJoin('DecklistItem', 'DecklistItem.entryId', 'Entry.id')
        .innerJoin('card_archetypes', 'card_archetypes.card_id', 'DecklistItem.cardId')
        .innerJoin('archetype_functions', 'archetype_functions.id', 'card_archetypes.function_id')
        .innerJoin('archetype_categories', 'archetype_categories.id', 'archetype_functions.category_id')
        .select([
          'archetype_categories.name as category',
          'archetype_functions.name as function_name',
          (eb) => eb.fn.count('Entry.id').as('total_inclusions'),
          (eb) => eb.fn.countDistinct('Entry.id').as('decks_with_archetype'),
          (eb) => eb.fn.avg('Entry.standing').as('avg_standing'),
          (eb) => eb.fn.sum(
            eb.case()
              .when('Entry.standing', '<=', eb.ref('Tournament.topCut'))
              .then(1)
              .else(0)
              .end()
          ).as('top_cut_decks')
        ])
        .where('Commander.name', '=', args.commanderName)
        .where('Tournament.tournamentDate', '>=', minDate.toISOString())
        .where('card_archetypes.confidence', '>', 0.5)
        .groupBy(['archetype_categories.name', 'archetype_functions.name'])
        .having((eb) => eb.fn.countDistinct('Entry.id'), '>=', 3)
        .orderBy('decks_with_archetype', 'desc')
        .execute();
    }
  })
);

const CommanderArchetypeAnalysisType = builder.objectType('CommanderArchetypeAnalysis', {
  fields: (t) => ({
    category: t.exposeString('category'),
    functionName: t.exposeString('function_name'),
    totalInclusions: t.exposeInt('total_inclusions'),
    decksWithArchetype: t.exposeInt('decks_with_archetype'),
    averageStanding: t.float({
      resolve: (parent) => safeNumber(parent.avg_standing, 0)
    }),
    topCutDecks: t.exposeInt('top_cut_decks'),
    topCutRate: t.float({
      resolve: (parent) => safeDivision(safeNumber(parent.top_cut_decks), safeNumber(parent.decks_with_archetype)) * 100
    })
  })
});

import {
  resolveCursorConnection,
  ResolveCursorConnectionArgs,
  resolveOffsetConnection,
} from '@pothos/plugin-relay';
import {db} from '../db';
import {scryfallCardSchema} from '../scryfall';
import {builder} from './builder';
import {Entry} from './entry';
import {safeDivision, safeNumber} from './utils'; // Import your helper functions

const CardEntriesFilters = builder.inputType('CardEntriesFilters', {
  fields: (t) => ({
    colorId: t.string({required: false}),
    commanderName: t.string({required: false}),
    tournamentTID: t.string({required: false}),
  }),
});

// New input types for archetype search
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

// Archetype-related types
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

export const Card = builder.loadableNode('Card', {
  id: {parse: (id) => Number(id), resolve: (parent) => parent.id},
  load: async (ids: number[]) => {
    const nodes = await db
      .selectFrom('Card')
      .selectAll()
      .where('id', 'in', ids)
      .execute();

    const nodesById = new Map<number, (typeof nodes)[number]>();
    for (const node of nodes) nodesById.set(node.id, node);

    return ids.map((id) => nodesById.get(id)!);
  },
  fields: (t) => ({
    name: t.exposeString('name'),
    oracleId: t.exposeString('oracleId'),
    data: t.exposeString('data'), // Expose raw data for client-side parsing
    cmc: t.int({
      resolve: (parent) => {
        return scryfallCardSchema.parse(JSON.parse(parent.data)).cmc;
      },
    }),
    colorId: t.string({
      resolve: (parent) => {
        const card = scryfallCardSchema.parse(JSON.parse(parent.data));
        const colorIdentity = new Set(card.color_identity);

        let colorId: string = '';
        for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) {
          if (colorIdentity.has(c)) colorId += c;
        }

        return colorId || 'C';
      },
    }),
    type: t.string({
      resolve: (parent) => {
        return scryfallCardSchema.parse(JSON.parse(parent.data)).type_line;
      },
    }),
    imageUrls: t.stringList({
      description: `URL's of art crops for each card face.`,
      resolve: (parent) => {
        const card = scryfallCardSchema.parse(JSON.parse(parent.data));
        const cardFaces = card.card_faces ? card.card_faces : [card];
        return cardFaces
          .map((c) => c.image_uris?.art_crop)
          .filter((c): c is string => c != null);
      },
    }),
    cardPreviewImageUrl: t.string({
      description: `Image of the full front card face.`,
      nullable: true,
      resolve: (parent) => {
        const card = scryfallCardSchema.parse(JSON.parse(parent.data));
        const cardFaces = card.card_faces ? card.card_faces : [card];
        return cardFaces
          .map((c) => c.image_uris?.normal)
          .filter((c): c is string => c != null)
          ?.at(0);
      },
    }),
    scryfallUrl: t.string({
      description: `Link to the card on Scryfall.`,
      resolve: (parent) => {
        const card = scryfallCardSchema.parse(JSON.parse(parent.data));
        return card.scryfall_uri;
      },
    }),
    
    // NEW ARCHETYPE FIELDS
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
    }),

    entries: t.connection({
      type: Entry,
      args: {
        filters: t.arg({type: CardEntriesFilters, required: false}),
      },
      resolve: (parent, args) => {
        return resolveCursorConnection(
          {
            args,
            toCursor: (parent) => `${parent.id}`,
          },
          async ({
            before,
            after,
            limit,
            inverted,
          }: ResolveCursorConnectionArgs) => {
            let query = db
              .selectFrom('DecklistItem')
              .innerJoin('Entry', 'Entry.id', 'DecklistItem.entryId')
              .leftJoin('Commander', 'Commander.id', 'Entry.commanderId')
              .where('DecklistItem.cardId', '=', parent.id)
              .selectAll('Entry');

            if (args.filters?.colorId) {
              query = query.where(
                'Commander.colorId',
                '=',
                args.filters.colorId,
              );
            }

            if (args.filters?.commanderName) {
              query = query.where(
                'Commander.name',
                '=',
                args.filters.commanderName,
              );
            }

            if (args.filters?.tournamentTID) {
              query = query
                .leftJoin('Tournament', 'Tournament.id', 'Entry.tournamentId')
                .where('Tournament.TID', '=', args.filters.tournamentTID);
            }

            if (before) {
              query = query.where('Entry.id', '>', Number(before));
            }

            if (after) {
              query = query.where('Entry.id', '<', Number(after));
            }

            return query
              .orderBy('Entry.id', inverted ? 'asc' : 'desc')
              .limit(limit)
              .execute();
          },
        );
      },
    }),
  }),
});

// EXISTING QUERY FIELDS
builder.queryField('card', (t) =>
  t.field({
    type: Card,
    args: {name: t.arg.string({required: true})},
    resolve: async (_root, args) => {
      return db
        .selectFrom('Card')
        .selectAll()
        .where('name', '=', args.name)
        .executeTakeFirstOrThrow();
    },
  }),
);

builder.queryField('staples', (t) =>
  t.field({
    type: t.listRef(Card),
    resolve: async () => {
      return db
        .selectFrom('Card')
        .selectAll()
        .where('playRateLastYear', '>=', 0.01)
        .orderBy('playRateLastYear desc')
        .execute();
    },
  }),
);

// NEW ARCHETYPE QUERY FIELDS
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
          .selectAll('Card');

        // Apply archetype filters if specified
        if (args.filters.categories?.length || args.filters.functions?.length) {
          query = query
            .innerJoin('card_archetypes', 'card_archetypes.card_id', 'Card.id')
            .innerJoin('archetype_functions', 'archetype_functions.id', 'card_archetypes.function_id')
            .innerJoin('archetype_categories', 'archetype_categories.id', 'archetype_functions.category_id')
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
        }

        // Filter by colors
        if (args.filters.colors && args.filters.colors.length > 0) {
          if (args.filters.colors.length === 1 && args.filters.colors[0] === 'C') {
            // Colorless cards
            query = query.where((eb) =>
              eb.fn('json_extract', ['Card.data', '$.colors']), '=', '[]'
            );
          } else {
            // Has specific colors
            for (const color of args.filters.colors) {
              if (color !== 'C') {
                query = query.where((eb) =>
                  eb.fn('json_extract', ['Card.data', '$.colors']), 'like', `%${color}%`
                );
              }
            }
          }
        }

        // Filter by CMC range
        if (args.filters.cmc) {
          if (args.filters.cmc.min !== undefined && args.filters.cmc.min !== null) {
            query = query.where((eb) =>
              eb.fn('json_extract', ['Card.data', '$.cmc']), '>=', args.filters.cmc.min
            );
          }
          if (args.filters.cmc.max !== undefined && args.filters.cmc.max !== null) {
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
          .orderBy('Card.name', 'asc') // Consistent ordering
          .limit(limit)
          .offset(offset)
          .execute();
      });
    }
  })
);

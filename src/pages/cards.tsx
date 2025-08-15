import {AllCardsQuery} from '#genfiles/queries/AllCardsQuery.graphql';
import {cards_CardDetails$key} from '#genfiles/queries/cards_CardDetails.graphql';
import {cards_CardsQuery} from '#genfiles/queries/cards_CardsQuery.graphql';
import {cards_Cards$key} from '#genfiles/queries/cards_Cards.graphql';
import {useSeoMeta} from '@unhead/react';
import {
  PropsWithChildren,
  useMemo,
  useState,
  useEffect,
  useCallback,
  startTransition,
  useRef,
} from 'react';
import {
  EntryPointComponent,
  graphql,
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from 'react-relay/hooks';
import {
  usePreferences,
  setRefetchCallback,
  clearRefetchCallback,
  type PreferencesMap,
  DEFAULT_PREFERENCES,
} from '../lib/client/cookies';
import {Card} from '../components/card';
import {Dropdown} from '../components/dropdown';
import {Footer} from '../components/footer';
import {LoadMoreButton} from '../components/load_more';
import {Navigation} from '../components/navigation';
import {NumberInputDropdown} from '../components/number_input_dropdown';
import {formatPercent} from '../lib/client/format';
import {CardDetailModal} from '../components/CardDetailModal';

const createDebouncer = <T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): T => {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
};

const ARCHETYPE_CATEGORY_OPTIONS = [
  {value: null, label: 'All Categories'},
  {value: 'Fast Mana', label: 'Fast Mana'},
  {value: 'Tutors', label: 'Tutors'},
  {value: 'Interaction', label: 'Interaction'},
  {value: 'Card Advantage', label: 'Card Advantage'},
  {value: 'Recursion', label: 'Recursion'},
  {value: 'Win Conditions', label: 'Win Conditions'},
  {value: 'Utility', label: 'Utility'},
];

const ARCHETYPE_FUNCTION_OPTIONS = [
  {value: null, label: 'All Functions'},
  // Fast Mana
  {value: 'Mana Rocks', label: 'Mana Rocks'},
  {value: 'Mana Dorks', label: 'Mana Dorks'},
  {value: 'Land Ramp', label: 'Land Ramp'},
  {value: 'Rituals', label: 'Rituals'},
  // Tutors
  {value: 'Unconditional Tutors', label: 'Unconditional Tutors'},
  {value: 'Creature Tutors', label: 'Creature Tutors'},
  {value: 'Artifact Tutors', label: 'Artifact Tutors'},
  {value: 'Enchantment Tutors', label: 'Enchantment Tutors'},
  // Interaction
  {value: 'Spot Removal', label: 'Spot Removal'},
  {value: 'Counterspells', label: 'Counterspells'},
  {value: 'Board Wipes', label: 'Board Wipes'},
  {value: 'Protection', label: 'Protection'},
  // Card Advantage
  {value: 'Card Draw', label: 'Card Draw'},
  {value: 'Card Selection', label: 'Card Selection'},
  {value: 'Value Engines', label: 'Value Engines'},
  // Recursion
  {value: 'Graveyard Recursion', label: 'Graveyard Recursion'},
  {value: 'Reanimation', label: 'Reanimation'},
  {value: 'Flashback/Escape', label: 'Flashback/Escape'},
  // Win Conditions
  {value: 'Combo Pieces', label: 'Combo Pieces'},
  {value: 'Big Threats', label: 'Big Threats'},
  {value: 'Alternative Win Cons', label: 'Alternative Win Cons'},
];

const COLOR_OPTIONS = [
  {value: null, label: 'All Colors'},
  {value: ['W'], label: 'White'},
  {value: ['U'], label: 'Blue'},
  {value: ['B'], label: 'Black'},
  {value: ['R'], label: 'Red'},
  {value: ['G'], label: 'Green'},
  {value: [], label: 'Colorless'},
];

const TYPE_OPTIONS = [
  {value: null, label: 'All Types'},
  {value: ['Creature'], label: 'Creature'},
  {value: ['Instant'], label: 'Instant'},
  {value: ['Sorcery'], label: 'Sorcery'},
  {value: ['Artifact'], label: 'Artifact'},
  {value: ['Enchantment'], label: 'Enchantment'},
  {value: ['Planeswalker'], label: 'Planeswalker'},
  {value: ['Land'], label: 'Land'},
];

const MIN_CONFIDENCE_OPTIONS = [
  {value: 0.3, label: '30%+ Confidence'},
  {value: 0.5, label: '50%+ Confidence'},
  {value: 0.7, label: '70%+ Confidence'},
  {value: 0.9, label: '90%+ Confidence'},
];

function CardDetailsCard({
  card: cardRef,
  onCardClick,
}: {
  card: cards_CardDetails$key;
  onCardClick?: (cardName: string) => void;
}) {
  const card = useFragment(
    graphql`
      fragment cards_CardDetails on Card {
        id
        name
        data
        archetypes(minConfidence: 0.5) {
          function {
            name
            category {
              name
              color
            }
          }
          confidence
          contextDependent
        }
        primaryArchetype {
          function {
            name
            category {
              name
              color
            }
          }
          confidence
        }
      }
    `,
    cardRef,
  );

  const cardData = useMemo(() => {
    try {
      return JSON.parse(card.data);
    } catch {
      return {};
    }
  }, [card.data]);

  const cardStats = useMemo(() => {
    const cmc = cardData.cmc || 0;
    const typeLine = cardData.type_line || '';
    const primaryCategory = card.primaryArchetype?.function?.category?.name;
    
    return (
      <div className="flex flex-wrap justify-between gap-1 text-xs">
        <span>CMC: {cmc}</span>
        {primaryCategory && (
          <span 
            className="rounded px-1"
            style={{ 
              backgroundColor: card.primaryArchetype?.function?.category?.color || '#808080',
              color: 'white'
            }}
          >
            {primaryCategory}
          </span>
        )}
        <span className="text-xs opacity-75">{typeLine.split('—')[0]?.trim()}</span>
      </div>
    );
  }, [cardData, card.primaryArchetype]);

  const images = useMemo(() => {
    const imageUris = cardData.image_uris;
    if (imageUris?.normal) {
      return [{ src: imageUris.normal, alt: card.name }];
    }
    if (cardData.card_faces?.[0]?.image_uris?.normal) {
      return [{ src: cardData.card_faces[0].image_uris.normal, alt: card.name }];
    }
    return [];
  }, [cardData, card.name]);

  const handleClick = useCallback(() => {
    onCardClick?.(card.name);
  }, [onCardClick, card.name]);

  const archetypeText = useMemo(() => {
    if (!card.archetypes?.length) return 'No archetypes';
    
    return card.archetypes
      .slice(0, 2)
      .map(arch => `${arch.function.name} (${formatPercent(arch.confidence)})`)
      .join(', ');
  }, [card.archetypes]);

  return (
    <Card bottomText={cardStats} images={images}>
      <div className="flex h-32 flex-col space-y-2">
        <button
          onClick={handleClick}
          className="line-clamp-2 text-left text-xl font-bold underline decoration-transparent transition-colors group-hover:decoration-inherit"
        >
          {card.name}
        </button>
        
        <div className="text-sm opacity-75 line-clamp-2">
          {archetypeText}
        </div>
        
        {card.primaryArchetype && (
          <div className="text-xs">
            <span 
              className="inline-block rounded px-2 py-1 text-white"
              style={{ backgroundColor: card.primaryArchetype.function.category.color }}
            >
              {card.primaryArchetype.function.name}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function useOptimizedCmcHandler(
  updatePreference: (
    key: keyof PreferencesMap['cards'],
    value: any,
  ) => void,
) {
  return useMemo(() => {
    const debouncedMinCmc = createDebouncer((value: string) => {
      const numValue = value === '' ? null : parseInt(value, 10);
      if (value === '' || (!isNaN(numValue!) && numValue! >= 0)) {
        updatePreference('minCmc' as keyof PreferencesMap['cards'], numValue);
      }
    }, 250);

    const debouncedMaxCmc = createDebouncer((value: string) => {
      const numValue = value === '' ? null : parseInt(value, 10);
      if (value === '' || (!isNaN(numValue!) && numValue! >= 0)) {
        updatePreference('maxCmc' as keyof PreferencesMap['cards'], numValue);
      }
    }, 250);

    const handleMinCmcChange = (
      value: string,
      setLocal: (value: string) => void,
    ) => {
      setLocal(value);
      debouncedMinCmc(value);
    };

    const handleMaxCmcChange = (
      value: string,
      setLocal: (value: string) => void,
    ) => {
      setLocal(value);
      debouncedMaxCmc(value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Go') {
        (e.target as HTMLInputElement).blur();
      }
    };

    return {
      handleMinCmcChange,
      handleMaxCmcChange,
      handleKeyDown,
    };
  }, [updatePreference]);
}

function CardsPageShell({
  category,
  function: archFunction,
  colors,
  types,
  minConfidence,
  minCmc,
  maxCmc,
  updatePreference,
  preferences,
  children,
}: PropsWithChildren<{
  category: string | null;
  function: string | null;
  colors: string[] | null;
  types: string[] | null;
  minConfidence: number;
  minCmc: number | null;
  maxCmc: number | null;
  updatePreference: (
    key: keyof PreferencesMap['cards'],
    value: any,
  ) => void;
  preferences: PreferencesMap['cards'];
}>) {
  useSeoMeta({
    title: 'cEDH Card Database',
    description: 'Search and analyze cEDH cards by archetype, type, and meta statistics!',
  });

  const [localMinCmc, setLocalMinCmc] = useState(() =>
    minCmc != null ? minCmc.toString() : '',
  );
  
  const [localMaxCmc, setLocalMaxCmc] = useState(() =>
    maxCmc != null ? maxCmc.toString() : '',
  );

  const cmcHandlers = useOptimizedCmcHandler(updatePreference);

  useEffect(() => {
    setLocalMinCmc(minCmc != null ? minCmc.toString() : '');
  }, [minCmc]);

  useEffect(() => {
    setLocalMaxCmc(maxCmc != null ? maxCmc.toString() : '');
  }, [maxCmc]);

  const handleCategoryChange = useCallback(
    (value: string | null) => {
      updatePreference('category' as keyof PreferencesMap['cards'], value);
      // Reset function when category changes
      updatePreference('function' as keyof PreferencesMap['cards'], null);
    },
    [updatePreference],
  );

  const handleFunctionChange = useCallback(
    (value: string | null) => {
      updatePreference('function' as keyof PreferencesMap['cards'], value);
    },
    [updatePreference],
  );

  const handleColorsChange = useCallback(
    (value: string[] | null) => {
      updatePreference('colors' as keyof PreferencesMap['cards'], value);
    },
    [updatePreference],
  );

  const handleTypesChange = useCallback(
    (value: string[] | null) => {
      updatePreference('types' as keyof PreferencesMap['cards'], value);
    },
    [updatePreference],
  );

  const handleMinConfidenceChange = useCallback(
    (value: number) => {
      updatePreference('minConfidence' as keyof PreferencesMap['cards'], value);
    },
    [updatePreference],
  );

  // Filter function options based on selected category
  const filteredFunctionOptions = useMemo(() => {
    if (!category) return ARCHETYPE_FUNCTION_OPTIONS;
    
    const categoryFunctions: Record<string, string[]> = {
      'Fast Mana': ['Mana Rocks', 'Mana Dorks', 'Land Ramp', 'Rituals'],
      'Tutors': ['Unconditional Tutors', 'Creature Tutors', 'Artifact Tutors', 'Enchantment Tutors'],
      'Interaction': ['Spot Removal', 'Counterspells', 'Board Wipes', 'Protection'],
      'Card Advantage': ['Card Draw', 'Card Selection', 'Value Engines'],
      'Recursion': ['Graveyard Recursion', 'Reanimation', 'Flashback/Escape'],
      'Win Conditions': ['Combo Pieces', 'Big Threats', 'Alternative Win Cons'],
    };
    
    const allowedFunctions = categoryFunctions[category] || [];
    return ARCHETYPE_FUNCTION_OPTIONS.filter(
      option => option.value === null || allowedFunctions.includes(option.value)
    );
  }, [category]);

  return (
    <>
      <Navigation searchType="card" />

      <div className="mx-auto mt-8 w-full max-w-(--breakpoint-xl) px-8">
        <div className="mb-8 flex flex-col items-start space-y-4 lg:flex-row lg:items-end lg:space-y-0">
          <div className="flex-1">
            <h1 className="font-title text-4xl font-extrabold text-white md:text-5xl">
              cEDH Card Database
            </h1>
          </div>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-4 lg:flex-nowrap lg:justify-end">
            <div className="relative flex flex-col">
              <Dropdown
                id="cards-archetype-category"
                label="Archetype Category"
                value={category || 'All Categories'}
                options={ARCHETYPE_CATEGORY_OPTIONS}
                onSelect={handleCategoryChange}
              />
            </div>

            <div className="relative flex flex-col">
              <Dropdown
                id="cards-archetype-function"
                label="Archetype Function"
                value={archFunction || 'All Functions'}
                options={filteredFunctionOptions}
                onSelect={handleFunctionChange}
              />
            </div>

            <div className="relative flex flex-col">
              <Dropdown
                id="cards-colors"
                label="Colors"
                value={colors ? (colors.length === 0 ? 'Colorless' : colors.join('')) : 'All Colors'}
                options={COLOR_OPTIONS}
                onSelect={handleColorsChange}
              />
            </div>

            <div className="relative flex flex-col">
              <Dropdown
                id="cards-types"
                label="Card Type"
                value={types ? types.join('/') : 'All Types'}
                options={TYPE_OPTIONS}
                onSelect={handleTypesChange}
              />
            </div>

            <div className="relative flex flex-col">
              <Dropdown
                id="cards-min-confidence"
                label="Min Confidence"
                value={`${(minConfidence * 100).toFixed(0)}%+ Confidence`}
                options={MIN_CONFIDENCE_OPTIONS}
                onSelect={handleMinConfidenceChange}
              />
            </div>

            <div className="relative flex flex-col">
              <label htmlFor="cards-min-cmc" className="mb-1 text-xs text-gray-300">
                Min CMC
              </label>
              <input
                id="cards-min-cmc"
                type="number"
                min="0"
                value={localMinCmc}
                placeholder="0"
                className="w-20 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white"
                onChange={(e) =>
                  cmcHandlers.handleMinCmcChange(e.target.value, setLocalMinCmc)
                }
                onKeyDown={cmcHandlers.handleKeyDown}
              />
            </div>

            <div className="relative flex flex-col">
              <label htmlFor="cards-max-cmc" className="mb-1 text-xs text-gray-300">
                Max CMC
              </label>
              <input
                id="cards-max-cmc"
                type="number"
                min="0"
                value={localMaxCmc}
                placeholder="∞"
                className="w-20 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white"
                onChange={(e) =>
                  cmcHandlers.handleMaxCmcChange(e.target.value, setLocalMaxCmc)
                }
                onKeyDown={cmcHandlers.handleKeyDown}
              />
            </div>
          </div>
        </div>

        {children}
      </div>
    </>
  );
}

/** @resource m#cards */
export const CardsPage: EntryPointComponent<
  {cardsQueryRef: cards_CardsQuery},
  {}
> = ({queries}) => {
  const {preferences, updatePreference, isHydrated} = usePreferences(
    'cards',
    DEFAULT_PREFERENCES.cards!,
  );

  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const serverPreferences = useMemo(() => {
    if (
      typeof window !== 'undefined' &&
      (window as any).__SERVER_PREFERENCES__
    ) {
      return (window as any).__SERVER_PREFERENCES__;
    }
    return null;
  }, []);

  const query = usePreloadedQuery(
    graphql`
      query cards_CardsQuery @preloadable {
        ...cards_Cards
      }
    `,
    queries.cardsQueryRef,
  );

  const {data, loadNext, isLoadingNext, hasNext, refetch} =
    usePaginationFragment<AllCardsQuery, cards_Cards$key>(
      graphql`
        fragment cards_Cards on Query
        @argumentDefinitions(
          cursor: {type: "String"}
          count: {type: "Int", defaultValue: 50}
          categories: {type: "[String!]"}
          functions: {type: "[String!]"}
          colors: {type: "[String!]"}
          types: {type: "[String!]"}
          minConfidence: {type: "Float", defaultValue: 0.5}
          cmc: {type: "IntRange"}
        )
        @refetchable(queryName: "AllCardsQuery") {
          searchCardsByArchetype(
            first: $count
            after: $cursor
            filters: {
              categories: $categories
              functions: $functions
              colors: $colors
              types: $types
              minConfidence: $minConfidence
              cmc: $cmc
            }
          ) @connection(key: "cards__searchCardsByArchetype") {
            edges {
              node {
                id
                ...cards_CardDetails
                ...cardDetailModal_CardDetail
              }
            }
          }
        }
      `,
      query,
    );

  const currentPreferences = useMemo(
    () => ({
      category: preferences?.category || null,
      function: preferences?.function || null,
      colors: preferences?.colors || null,
      types: preferences?.types || null,
      minConfidence: preferences?.minConfidence || 0.5,
      minCmc: preferences?.minCmc || null,
      maxCmc: preferences?.maxCmc || null,
    }),
    [preferences],
  );

  const handleRefetch = useCallback(() => {
    console.log('🔄 [CARDS] Refetch triggered by preferences change');
    const cmcFilter = (currentPreferences.minCmc !== null || currentPreferences.maxCmc !== null) ? {
      min: currentPreferences.minCmc,
      max: currentPreferences.maxCmc,
    } : null;

    startTransition(() => {
      refetch({
        categories: currentPreferences.category ? [currentPreferences.category] : null,
        functions: currentPreferences.function ? [currentPreferences.function] : null,
        colors: currentPreferences.colors,
        types: currentPreferences.types,
        minConfidence: currentPreferences.minConfidence,
        cmc: cmcFilter,
      }, {fetchPolicy: 'network-only'});
    });
  }, [refetch, currentPreferences]);

  const handleLoadMore = useCallback(
    (count: number) => {
      startTransition(() => {
        loadNext(count);
      });
    },
    [loadNext],
  );

  const handleCardClick = useCallback((cardName: string) => {
    // Find the card in our current data
    const cardEdge = data.searchCardsByArchetype.edges.find(
      edge => edge.node.name === cardName
    );
    
    if (cardEdge) {
      setSelectedCard(cardEdge.node);
      setIsModalOpen(true);
    }
  }, [data.searchCardsByArchetype.edges]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedCard(null);
  }, []);

  const hasRefetchedRef = useRef(false);

  useEffect(() => {
    setRefetchCallback(handleRefetch);
    return clearRefetchCallback;
  }, [handleRefetch]);

  useEffect(() => {
    if (isHydrated && !hasRefetchedRef.current) {
      hasRefetchedRef.current = true;

      const actualServerPrefs =
        serverPreferences || DEFAULT_PREFERENCES.cards;
      const prefsMatch =
        JSON.stringify(preferences) === JSON.stringify(actualServerPrefs);

      console.log('🪝 [CARDS] Hydration complete:', {
        clientPrefs: preferences,
        serverPrefs: actualServerPrefs,
        needsRefetch: !prefsMatch,
      });

      if (!prefsMatch) {
        handleRefetch();
      }
    }
  }, [isHydrated, preferences, serverPreferences, handleRefetch]);

  const cardComponents = useMemo(
    () =>
      data.searchCardsByArchetype.edges.map((edge) => (
        <CardDetailsCard 
          key={edge.node.id} 
          card={edge.node} 
          onCardClick={handleCardClick}
        />
      )),
    [data.searchCardsByArchetype.edges, handleCardClick],
  );

  return (
    <>
      <CardsPageShell
        category={currentPreferences.category}
        function={currentPreferences.function}
        colors={currentPreferences.colors}
        types={currentPreferences.types}
        minConfidence={currentPreferences.minConfidence}
        minCmc={currentPreferences.minCmc}
        maxCmc={currentPreferences.maxCmc}
        updatePreference={updatePreference}
        preferences={preferences}
      >
        <div className="grid w-fit grid-cols-1 gap-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
          {cardComponents}
        </div>

        <LoadMoreButton
          hasNext={hasNext}
          isLoadingNext={isLoadingNext}
          loadNext={handleLoadMore}
        />

        <Footer />
      </CardsPageShell>

      <CardDetailModal
        card={selectedCard}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  );
};

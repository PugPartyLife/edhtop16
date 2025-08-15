import React, { useMemo, useCallback } from 'react';
import { useFragment } from 'react-relay/hooks';
import { graphql } from 'relay-runtime';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cardDetailModal_CardDetail$key } from '#genfiles/queries/cardDetailModal_CardDetail.graphql';
import { formatPercent } from '../lib/client/format';

interface CardDetailModalProps {
  card: cardDetailModal_CardDetail$key | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CardDetailModal({ card: cardRef, isOpen, onClose }: CardDetailModalProps) {
  const card = useFragment(
    graphql`
      fragment cardDetailModal_CardDetail on Card {
        id
        name
        data
        archetypes(minConfidence: 0.3) {
          function {
            id
            name
            description
            category {
              name
              color
              description
            }
          }
          confidence
          contextDependent
          manualOverride
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
    if (!card) return {};
    try {
      return JSON.parse(card.data);
    } catch {
      return {};
    }
  }, [card]);

  const cardImage = useMemo(() => {
    if (!cardData) return null;
    
    const imageUris = cardData.image_uris;
    if (imageUris?.normal) {
      return imageUris.normal;
    }
    if (cardData.card_faces?.[0]?.image_uris?.normal) {
      return cardData.card_faces[0].image_uris.normal;
    }
    return null;
  }, [cardData]);

  const cardStats = useMemo(() => {
    if (!cardData) return {};
    
    return {
      cmc: cardData.cmc || 0,
      typeLine: cardData.type_line || '',
      manaCost: cardData.mana_cost || '',
      colors: cardData.colors || [],
      colorIdentity: cardData.color_identity || [],
      oracleText: cardData.oracle_text || '',
      power: cardData.power,
      toughness: cardData.toughness,
      loyalty: cardData.loyalty,
      rarity: cardData.rarity || '',
    };
  }, [cardData]);

  const archetypesByCategory = useMemo(() => {
    if (!card?.archetypes) return {};
    
    return card.archetypes.reduce((acc, archetype) => {
      const categoryName = archetype.function.category.name;
      if (!acc[categoryName]) {
        acc[categoryName] = {
          category: archetype.function.category,
          functions: [],
        };
      }
      acc[categoryName].functions.push(archetype);
      return acc;
    }, {} as Record<string, { category: any; functions: any[] }>);
  }, [card?.archetypes]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!card) return null;

  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/75" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div 
            className="flex min-h-full items-center justify-center p-4"
            onClick={handleBackdropClick}
          >
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-gray-900 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-start mb-4">
                  <Dialog.Title className="text-3xl font-bold text-white">
                    {card.name}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Card Image and Basic Info */}
                  <div className="space-y-4">
                    {cardImage && (
                      <div className="flex justify-center">
                        <img
                          src={cardImage}
                          alt={card.name}
                          className="max-w-full h-auto rounded-lg shadow-lg"
                          style={{ maxHeight: '400px' }}
                        />
                      </div>
                    )}

                    <div className="bg-gray-800 rounded-lg p-4 space-y-2">
                      <h3 className="text-lg font-semibold text-white mb-3">Card Details</h3>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-400">Mana Cost:</span>
                          <span className="ml-2 text-white">{cardStats.manaCost || 'None'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">CMC:</span>
                          <span className="ml-2 text-white">{cardStats.cmc}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-400">Type:</span>
                          <span className="ml-2 text-white">{cardStats.typeLine}</span>
                        </div>
                        {cardStats.power !== undefined && cardStats.toughness !== undefined && (
                          <div>
                            <span className="text-gray-400">P/T:</span>
                            <span className="ml-2 text-white">{cardStats.power}/{cardStats.toughness}</span>
                          </div>
                        )}
                        {cardStats.loyalty !== undefined && (
                          <div>
                            <span className="text-gray-400">Loyalty:</span>
                            <span className="ml-2 text-white">{cardStats.loyalty}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-400">Rarity:</span>
                          <span className="ml-2 text-white capitalize">{cardStats.rarity}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Colors:</span>
                          <span className="ml-2 text-white">
                            {cardStats.colors.length ? cardStats.colors.join('') : 'Colorless'}
                          </span>
                        </div>
                      </div>

                      {cardStats.oracleText && (
                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <span className="text-gray-400">Oracle Text:</span>
                          <p className="mt-2 text-white text-sm leading-relaxed">
                            {cardStats.oracleText}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column - Archetype Information */}
                  <div className="space-y-4">
                    {/* Primary Archetype */}
                    {card.primaryArchetype && (
                      <div className="bg-gray-800 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Primary Archetype</h3>
                        <div 
                          className="inline-block rounded-lg px-4 py-2 text-white font-medium"
                          style={{ backgroundColor: card.primaryArchetype.function.category.color }}
                        >
                          <div className="text-sm opacity-90">
                            {card.primaryArchetype.function.category.name}
                          </div>
                          <div className="text-lg">
                            {card.primaryArchetype.function.name}
                          </div>
                          <div className="text-sm opacity-90">
                            {formatPercent(card.primaryArchetype.confidence)} confidence
                          </div>
                        </div>
                      </div>
                    )}

                    {/* All Archetypes by Category */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        All Archetypes ({card.archetypes?.length || 0})
                      </h3>
                      
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {Object.entries(archetypesByCategory).map(([categoryName, { category, functions }]) => (
                          <div key={categoryName} className="border-b border-gray-700 last:border-b-0 pb-3 last:pb-0">
                            <h4 
                              className="font-medium mb-2 px-2 py-1 rounded text-white text-sm"
                              style={{ backgroundColor: category.color }}
                            >
                              {categoryName}
                            </h4>
                            
                            <div className="space-y-2">
                              {functions.map((archetype, idx) => (
                                <div 
                                  key={`${archetype.function.id}-${idx}`}
                                  className="flex justify-between items-center bg-gray-700 rounded px-3 py-2"
                                >
                                  <div>
                                    <div className="text-white font-medium">
                                      {archetype.function.name}
                                    </div>
                                    <div className="text-gray-300 text-xs">
                                      {archetype.function.description}
                                    </div>
                                  </div>
                                  
                                  <div className="text-right text-sm">
                                    <div className="text-white font-medium">
                                      {formatPercent(archetype.confidence)}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      {archetype.contextDependent && (
                                        <span className="bg-yellow-600 text-yellow-100 px-1 rounded">
                                          Context
                                        </span>
                                      )}
                                      {archetype.manualOverride && (
                                        <span className="bg-blue-600 text-blue-100 px-1 rounded ml-1">
                                          Manual
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {Object.keys(archetypesByCategory).length === 0 && (
                        <p className="text-gray-400 text-center py-4">
                          No archetypes classified for this card.
                        </p>
                      )}
                    </div>

                    {/* Meta Statistics (if available) */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <h3 className="text-lg font-semibold text-white mb-3">Meta Statistics</h3>
                      <p className="text-gray-400 text-sm">
                        Meta statistics like play rate, win rate, and tournament performance would be displayed here.
                      </p>
                      {/* TODO: Add actual meta statistics from tournament data */}
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}


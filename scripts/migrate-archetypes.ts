// scripts/migrate-archetypes.ts
// Complete archetype migration script for SQLite database
// Run with: npm run generate:migrate-archetypes

import { sql } from 'kysely';
import { db } from '../src/lib/server/db'; // Adjust path to your db connection

class ArchetypeMigration {
  async run() {
    console.log('🚀 Starting archetype migration...');
    console.log('⚠️  This may take 15-30 minutes depending on your data size');
    
    const startTime = Date.now();
    
    try {
      // Step 1: Populate initial data (tables already exist)
      await this.populateInitialData();
      
      // Step 2: Classify all existing cards
      await this.classifyAllCards();
      
      // Step 3: Calculate commander preferences
      await this.calculateCommanderPreferences();
      
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      console.log(`✅ Migration completed successfully in ${duration} seconds!`);
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private async populateInitialData() {
    console.log('📋 Populating archetype definitions...');
    
    // Insert archetype categories
    const categories = [
      { name: 'Fast Mana', description: 'Cards that provide mana acceleration', color: '#FFD700', priority: 1 },
      { name: 'Tutors', description: 'Cards that search for other cards', color: '#8A2BE2', priority: 2 },
      { name: 'Interaction', description: 'Removal, counterspells, and answers', color: '#FF4500', priority: 3 },
      { name: 'Card Advantage', description: 'Card draw and advantage engines', color: '#1E90FF', priority: 4 },
      { name: 'Recursion', description: 'Getting cards back from graveyard', color: '#32CD32', priority: 5 },
      { name: 'Win Conditions', description: 'Cards that win the game', color: '#DC143C', priority: 6 },
      { name: 'Utility', description: 'Miscellaneous useful effects', color: '#808080', priority: 7 }
    ];

    for (const category of categories) {
      await sql`
        INSERT OR IGNORE INTO archetype_categories (name, description, color, priority) 
        VALUES (${category.name}, ${category.description}, ${category.color}, ${category.priority})
      `.execute(db);
    }

    // Insert archetype functions
    const functions = [
      // Fast Mana
      { category: 'Fast Mana', name: 'Mana Rocks', description: 'Artifacts that produce mana',
        keywords: '["add", "mana", "artifact", "tap"]',
        patterns: '["{T}.*add.*mana", "add.*{[WUBRG]}", "add.*one mana of any color"]' },
      { category: 'Fast Mana', name: 'Mana Dorks', description: 'Creatures that produce mana',
        keywords: '["add", "mana", "creature", "tap"]',
        patterns: '["{T}.*add.*{[WUBRG]}", "creatures you control have.*{T}.*add"]' },
      { category: 'Fast Mana', name: 'Land Ramp', description: 'Spells that put lands into play',
        keywords: '["search", "library", "land", "battlefield", "basic"]',
        patterns: '["search your library.*land.*battlefield", "search.*basic land"]' },
      { category: 'Fast Mana', name: 'Rituals', description: 'Temporary mana boosts',
        keywords: '["add", "mana", "until", "end"]',
        patterns: '["add.*{[WUBRG]}.*until end", "add.*mana.*until end of turn"]' },

      // Tutors
      { category: 'Tutors', name: 'Unconditional Tutors', description: 'Search for any card',
        keywords: '["search", "library", "card", "hand"]',
        patterns: '["search your library for a card", "search your library.*card.*hand"]' },
      { category: 'Tutors', name: 'Creature Tutors', description: 'Search for creatures',
        keywords: '["search", "library", "creature"]',
        patterns: '["search your library.*creature.*hand", "search.*creature card"]' },
      { category: 'Tutors', name: 'Artifact Tutors', description: 'Search for artifacts',
        keywords: '["search", "library", "artifact"]',
        patterns: '["search your library.*artifact.*hand", "search.*artifact card"]' },

      // Interaction
      { category: 'Interaction', name: 'Spot Removal', description: 'Destroy or exile specific threats',
        keywords: '["destroy", "exile", "target"]',
        patterns: '["destroy target (creature|artifact|enchantment)", "exile target (creature|artifact|enchantment)"]' },
      { category: 'Interaction', name: 'Counterspells', description: 'Counter spells on the stack',
        keywords: '["counter", "target", "spell"]',
        patterns: '["counter target spell", "counter target.*spell"]' },
      { category: 'Interaction', name: 'Board Wipes', description: 'Mass removal effects',
        keywords: '["destroy", "all", "creatures", "exile"]',
        patterns: '["destroy all creatures", "exile all creatures", "all creatures get -[0-9]+/-[0-9]+"]' },

      // Card Advantage
      { category: 'Card Advantage', name: 'Card Draw', description: 'Draw additional cards',
        keywords: '["draw", "cards", "hand"]',
        patterns: '["draw [0-9]+ cards?", "draw a card", "whenever.*draw.*card"]' },
      { category: 'Card Advantage', name: 'Card Selection', description: 'Look at and choose cards',
        keywords: '["look", "top", "library", "scry", "reveal"]',
        patterns: '["look at the top [0-9]+", "scry [0-9]+", "reveal.*top.*library"]' },

      // Recursion
      { category: 'Recursion', name: 'Graveyard Recursion', description: 'Return cards from graveyard',
        keywords: '["return", "graveyard", "hand", "battlefield"]',
        patterns: '["return.*from.*graveyard.*hand", "return.*from.*graveyard.*battlefield"]' },
      { category: 'Recursion', name: 'Reanimation', description: 'Put creatures from graveyard to battlefield',
        keywords: '["return", "graveyard", "battlefield", "creature"]',
        patterns: '["return.*creature.*graveyard.*battlefield", "put.*creature.*graveyard.*battlefield"]' },

      // Win Conditions
      { category: 'Win Conditions', name: 'Combo Pieces', description: 'Cards that enable infinite combos',
        keywords: '["infinite", "combo", "win", "game"]',
        patterns: '["infinite", "you win the game", "wins? the game"]' },
      { category: 'Win Conditions', name: 'Big Threats', description: 'Large creatures or planeswalkers',
        keywords: '["power", "toughness", "flying", "trample"]',
        patterns: '["[0-9]+/[0-9]+", "flying.*trample", "annihilator"]' }
    ];

    for (const func of functions) {
      // Get category ID
      const categoryResult = await sql<{id: number}>`
        SELECT id FROM archetype_categories WHERE name = ${func.category}
      `.execute(db);
      
      if (categoryResult.rows.length > 0 && categoryResult.rows[0]) {
        await sql`
          INSERT OR IGNORE INTO archetype_functions (category_id, name, description, keywords, rules_patterns) 
          VALUES (${categoryResult.rows[0].id}, ${func.name}, ${func.description}, ${func.keywords}, ${func.patterns})
        `.execute(db);
      }
    }

    console.log('✅ Archetype definitions populated');
  }

  private async classifyAllCards() {
    console.log('🔍 Starting card classification...');
    
    // Get total card count
    const totalResult = await sql<{total: number}>`SELECT COUNT(*) as total FROM Card`.execute(db);
    const totalCards = totalResult.rows[0]?.total || 0;
    console.log(`📊 Total cards to classify: ${totalCards}`);
    
    // Check if any cards are already classified
    const existingResult = await sql<{count: number}>`SELECT COUNT(*) as count FROM card_archetypes`.execute(db);
    const existingClassifications = existingResult.rows[0]?.count || 0;
    
    if (existingClassifications > 0) {
      console.log(`📝 Found ${existingClassifications} existing classifications - clearing to start fresh`);
      await sql`DELETE FROM card_archetypes`.execute(db);
    }
    
    // Get all functions for classification
    const functionsResult = await sql<any>`SELECT * FROM archetype_functions`.execute(db);
    const functions = functionsResult.rows;
    console.log(`🏷️  Found ${functions.length} archetype functions`);
    
    // Process in batches
    const batchSize = 500;
    let processed = 0;
    
    while (processed < totalCards) {
      const cardsResult = await sql<any>`
        SELECT * FROM Card LIMIT ${batchSize} OFFSET ${processed}
      `.execute(db);
      
      const cards = cardsResult.rows;
      if (cards.length === 0) break;
      
      for (const card of cards) {
        const classifications = this.classifyCard(card, functions);
        
        for (const classification of classifications) {
          try {
            await sql`
              INSERT OR REPLACE INTO card_archetypes 
              (card_id, function_id, confidence, context_dependent, manual_override)
              VALUES (${classification.card_id}, ${classification.function_id}, 
                      ${classification.confidence}, ${classification.context_dependent}, 0)
            `.execute(db);
          } catch (error) {
            console.warn(`Failed to classify card ${card.id}: ${error}`);
          }
        }
      }
      
      processed += cards.length;
      const percentage = Math.round((processed / totalCards) * 100);
      if (processed % 1000 === 0 || percentage % 10 === 0) {
        console.log(`📈 Progress: ${processed}/${totalCards} (${percentage}%)`);
      }
    }
    
    // Show classification summary
    const summaryResult = await sql<{category: string, count: number}>`
      SELECT ac.name as category, COUNT(*) as count
      FROM card_archetypes ca
      JOIN archetype_functions af ON af.id = ca.function_id
      JOIN archetype_categories ac ON ac.id = af.category_id
      WHERE ca.confidence > 0.5
      GROUP BY ac.name
      ORDER BY count DESC
    `.execute(db);
    
    console.log('\n📊 Classification Summary:');
    for (const row of summaryResult.rows) {
      console.log(`   ${row.category}: ${row.count} cards`);
    }
    
    console.log('✅ Card classification completed');
  }

  private classifyCard(card: any, functions: any[]): any[] {
    const classifications = [];
    const cardText = (card.text || '').toLowerCase();
    
    let cardData: any = {};
    try {
      cardData = JSON.parse(card.data || '{}');
    } catch {
      // If data isn't JSON, continue with empty object
    }
    
    const typeLine = (cardData.type_line || '').toLowerCase();
    const manaCost = cardData.mana_cost || '';
    
    for (const func of functions) {
      let confidence = 0;
      
      let keywords: string[] = [];
      let patterns: string[] = [];
      
      try {
        keywords = JSON.parse(func.keywords || '[]');
        patterns = JSON.parse(func.rules_patterns || '[]');
      } catch {
        continue;
      }
      
      // Keyword matching (40% weight)
      if (keywords.length > 0) {
        const keywordMatches = keywords.filter(keyword => 
          cardText.includes(keyword.toLowerCase())
        ).length;
        confidence += (keywordMatches / keywords.length) * 0.4;
      }
      
      // Pattern matching (60% weight)
      if (patterns.length > 0) {
        const patternMatches = patterns.filter(pattern => {
          try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(cardText);
          } catch {
            return false;
          }
        }).length;
        confidence += (patternMatches / patterns.length) * 0.6;
      }
      
      // Type bonuses
      confidence += this.getTypeBonuses(func.name, typeLine, cardText, manaCost);
      
      // Special case bonuses
      confidence += this.getSpecialCaseBonuses(func.name, card.name, cardText);
      
      if (confidence > 0.3) {
        classifications.push({
          card_id: card.id,
          function_id: func.id,
          confidence: Math.min(confidence, 1.0),
          context_dependent: this.isContextDependent(cardText, func.name) ? 1 : 0
        });
      }
    }
    
    return classifications;
  }
  
  private getTypeBonuses(functionName: string, typeLine: string, cardText: string, manaCost: string): number {
    let bonus = 0;
    
    switch (functionName) {
      case 'Mana Rocks':
        if (typeLine.includes('artifact') && (cardText.includes('add') || cardText.includes('mana'))) {
          bonus += 0.3;
        }
        break;
      case 'Mana Dorks':
        if (typeLine.includes('creature') && (cardText.includes('add') || cardText.includes('mana'))) {
          bonus += 0.3;
        }
        break;
      case 'Land Ramp':
        if ((typeLine.includes('sorcery') || typeLine.includes('instant')) && 
            cardText.includes('land') && cardText.includes('search')) {
          bonus += 0.2;
        }
        break;
      case 'Counterspells':
        if ((typeLine.includes('instant') || cardText.includes('flash')) && 
            cardText.includes('counter')) {
          bonus += 0.2;
        }
        break;
      case 'Board Wipes':
        if ((typeLine.includes('sorcery') || typeLine.includes('instant')) && 
            (cardText.includes('all creatures') || cardText.includes('destroy all'))) {
          bonus += 0.3;
        }
        break;
      case 'Big Threats':
        if (typeLine.includes('creature')) {
          const cmcMatch = manaCost.match(/\{(\d+)\}/);
          if (cmcMatch && cmcMatch[1] && parseInt(cmcMatch[1]) >= 6) {
            bonus += 0.2;
          }
        }
        break;
    }
    
    return bonus;
  }
  
  private getSpecialCaseBonuses(functionName: string, cardName: string, cardText: string): number {
    const knownCards: Record<string, string[]> = {
      'Mana Rocks': ['sol ring', 'mana crypt', 'mana vault', 'arcane signet', 'chrome mox', 'mox diamond', 'fellwar stone'],
      'Unconditional Tutors': ['demonic tutor', 'vampiric tutor', 'imperial seal', 'grim tutor', 'diabolic tutor'],
      'Counterspells': ['counterspell', 'force of will', 'mana drain', 'negate', 'swan song', 'fierce guardianship'],
      'Board Wipes': ['wrath of god', 'day of judgment', 'supreme verdict', 'cyclonic rift', 'toxic deluge', 'damnation'],
      'Card Draw': ['rhystic study', 'mystic remora', 'phyrexian arena', 'necropotence', 'sylvan library']
    };
    
    const cardNameLower = cardName.toLowerCase();
    const relevantCards = knownCards[functionName] || [];
    
    for (const knownCard of relevantCards) {
      if (cardNameLower.includes(knownCard)) {
        return 0.4;
      }
    }
    
    return 0;
  }
  
  private isContextDependent(cardText: string, functionName: string): boolean {
    const contextPatterns = [
      /tribal/i, /creatures you control/i, /whenever.*enters.*battlefield/i,
      /commander/i, /devotion/i, /\w+ you control/i
    ];
    
    const contextDependentFunctions = ['Combo Pieces', 'Big Threats'];
    
    return contextPatterns.some(pattern => pattern.test(cardText)) ||
           contextDependentFunctions.includes(functionName);
  }

  private async calculateCommanderPreferences() {
    console.log('📊 Calculating commander archetype preferences...');
    
    // Clear existing weights to start fresh
    await sql`DELETE FROM commander_archetype_weights`.execute(db);
    
    // Get commanders with sufficient tournament data
    const commandersResult = await sql<{id: number, name: string}>`
      SELECT c.id, c.name
      FROM Commander c
      INNER JOIN Entry e ON e.commanderId = c.id
      GROUP BY c.id, c.name
      HAVING COUNT(e.id) >= 5
    `.execute(db);
    
    const commanders = commandersResult.rows;
    console.log(`👑 Found ${commanders.length} commanders with sufficient data`);
    
    let processedCommanders = 0;
    for (const commander of commanders) {
      try {
        await this.calculateSingleCommanderPreferences(commander.id, commander.name);
        processedCommanders++;
        
        if (processedCommanders % 10 === 0) {
          console.log(`📈 Processed ${processedCommanders}/${commanders.length} commanders`);
        }
      } catch (error) {
        console.warn(`Failed to calculate preferences for ${commander.name}: ${error}`);
      }
    }
    
    console.log('✅ Commander preferences calculation completed');
  }
  
  private async calculateSingleCommanderPreferences(commanderId: number, commanderName: string) {
    // Get successful decks for this commander (top cut or top 25%)
    const successfulDecksResult = await sql<{id: number}>`
      SELECT e.id
      FROM Entry e
      INNER JOIN Tournament t ON t.id = e.tournamentId
      WHERE e.commanderId = ${commanderId}
      AND (e.standing <= t.topCut OR e.standing <= CAST(t.size / 4.0 AS INTEGER))
    `.execute(db);
    
    const successfulDecks = successfulDecksResult.rows;
    if (successfulDecks.length < 3) return;
    
    const entryIds = successfulDecks.map(d => d.id);
    
    // Analyze archetype distribution in successful decks
    const distributionResult = await sql<any>`
      SELECT 
        af.id as function_id,
        af.name as function_name,
        AVG(CAST(1 AS REAL)) as avg_count,
        COUNT(DISTINCT di.entryId) as deck_count,
        COUNT(*) as total_cards
      FROM DecklistItem di
      INNER JOIN card_archetypes ca ON ca.card_id = di.cardId
      INNER JOIN archetype_functions af ON af.id = ca.function_id
      WHERE di.entryId IN (${sql.join(entryIds)})
      AND ca.confidence > 0.5
      GROUP BY af.id, af.name
      HAVING COUNT(DISTINCT di.entryId) >= ${Math.ceil(successfulDecks.length * 0.2)}
    `.execute(db);
    
    for (const dist of distributionResult.rows) {
      const weight = Math.min(dist.deck_count / successfulDecks.length, 1.0);
      const recommendedCount = Math.max(1, Math.round(Number(dist.total_cards) / dist.deck_count || 0));
      
      if (recommendedCount > 0 && weight > 0.2) {
        await sql`
          INSERT OR REPLACE INTO commander_archetype_weights 
          (commander_id, function_id, weight, recommended_count)
          VALUES (${commanderId}, ${dist.function_id}, ${weight}, ${recommendedCount})
        `.execute(db);
      }
    }
  }
}

// Main execution
async function main() {
  const migration = new ArchetypeMigration();
  
  try {
    await migration.run();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export default main;

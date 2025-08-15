-- migrate_archetypes.sql
-- Complete archetype migration for existing SQLite database
-- Run with: sqlite3 edhtop16.db < migrate_archetypes.sql

BEGIN TRANSACTION;

-- Create archetype tables (if they don't exist)
CREATE TABLE IF NOT EXISTS archetype_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  priority INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS archetype_functions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  keywords TEXT,
  rules_patterns TEXT,
  FOREIGN KEY (category_id) REFERENCES archetype_categories(id),
  UNIQUE(category_id, name)
);

CREATE TABLE IF NOT EXISTS card_archetypes (
  card_id INTEGER NOT NULL,
  function_id INTEGER NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  context_dependent INTEGER DEFAULT 0,
  manual_override INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (card_id, function_id),
  FOREIGN KEY (card_id) REFERENCES Card(id),
  FOREIGN KEY (function_id) REFERENCES archetype_functions(id)
);

CREATE TABLE IF NOT EXISTS commander_archetype_weights (
  commander_id INTEGER NOT NULL,
  function_id INTEGER NOT NULL,
  weight REAL DEFAULT 1.0,
  recommended_count INTEGER DEFAULT 0,
  last_calculated TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (commander_id, function_id),
  FOREIGN KEY (commander_id) REFERENCES Commander(id),
  FOREIGN KEY (function_id) REFERENCES archetype_functions(id)
);

-- Create indexes (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_card_archetypes_card_id ON card_archetypes(card_id);
CREATE INDEX IF NOT EXISTS idx_card_archetypes_function_id ON card_archetypes(function_id);
CREATE INDEX IF NOT EXISTS idx_card_archetypes_confidence ON card_archetypes(confidence);
CREATE INDEX IF NOT EXISTS idx_commander_weights_commander ON commander_archetype_weights(commander_id);
CREATE INDEX IF NOT EXISTS idx_commander_weights_function ON commander_archetype_weights(function_id);

-- Insert archetype categories
INSERT OR IGNORE INTO archetype_categories (name, description, color, priority) VALUES
('Fast Mana', 'Cards that provide mana acceleration', '#FFD700', 1),
('Tutors', 'Cards that search for other cards', '#8A2BE2', 2),
('Interaction', 'Removal, counterspells, and answers', '#FF4500', 3),
('Card Advantage', 'Card draw and advantage engines', '#1E90FF', 4),
('Recursion', 'Getting cards back from graveyard', '#32CD32', 5),
('Win Conditions', 'Cards that win the game', '#DC143C', 6),
('Utility', 'Miscellaneous useful effects', '#808080', 7);

-- Insert archetype functions
-- Fast Mana functions
INSERT OR IGNORE INTO archetype_functions (category_id, name, description, keywords, rules_patterns) VALUES
((SELECT id FROM archetype_categories WHERE name = 'Fast Mana'), 
 'Mana Rocks', 
 'Artifacts that produce mana',
 '["add", "mana", "artifact", "tap"]',
 '["{T}.*add.*mana", "add.*{[WUBRG]}", "add.*one mana of any color", "add.*mana.*any.*color"]'),

((SELECT id FROM archetype_categories WHERE name = 'Fast Mana'), 
 'Mana Dorks', 
 'Creatures that produce mana',
 '["add", "mana", "creature", "tap"]',
 '["{T}.*add.*{[WUBRG]}", "creatures you control have.*{T}.*add", "add.*{[WUBRG]}.*to your mana pool"]'),

((SELECT id FROM archetype_categories WHERE name = 'Fast Mana'), 
 'Land Ramp', 
 'Spells that put lands into play',
 '["search", "library", "land", "battlefield", "basic"]',
 '["search your library.*land.*battlefield", "put.*land.*from your library.*battlefield", "search.*basic land"]'),

((SELECT id FROM archetype_categories WHERE name = 'Fast Mana'), 
 'Rituals', 
 'Temporary mana boosts',
 '["add", "mana", "until", "end"]',
 '["add.*{[WUBRG]}.*until end", "add.*mana.*until end of turn"]');

-- Tutor functions
INSERT OR IGNORE INTO archetype_functions (category_id, name, description, keywords, rules_patterns) VALUES
((SELECT id FROM archetype_categories WHERE name = 'Tutors'), 
 'Unconditional Tutors', 
 'Search for any card',
 '["search", "library", "card", "hand"]',
 '["search your library for a card", "search your library.*card.*hand", "search.*library.*card.*your hand"]'),

((SELECT id FROM archetype_categories WHERE name = 'Tutors'), 
 'Creature Tutors', 
 'Search for creatures',
 '["search", "library", "creature"]',
 '["search your library.*creature.*hand", "search your library.*creature.*battlefield", "search.*creature card"]'),

((SELECT id FROM archetype_categories WHERE name = 'Tutors'), 
 'Artifact Tutors', 
 'Search for artifacts',
 '["search", "library", "artifact"]',
 '["search your library.*artifact.*hand", "search your library.*artifact.*battlefield", "search.*artifact card"]'),

((SELECT id FROM archetype_categories WHERE name = 'Tutors'), 
 'Enchantment Tutors', 
 'Search for enchantments',
 '["search", "library", "enchantment"]',
 '["search your library.*enchantment.*hand", "search your library.*enchantment.*battlefield", "search.*enchantment card"]');

-- Interaction functions
INSERT OR IGNORE INTO archetype_functions (category_id, name, description, keywords, rules_patterns) VALUES
((SELECT id FROM archetype_categories WHERE name = 'Interaction'), 
 'Spot Removal', 
 'Destroy or exile specific threats',
 '["destroy", "exile", "target"]',
 '["destroy target (creature|artifact|enchantment)", "exile target (creature|artifact|enchantment)", "target.*gets.*until end of turn"]'),

((SELECT id FROM archetype_categories WHERE name = 'Interaction'), 
 'Counterspells', 
 'Counter spells on the stack',
 '["counter", "target", "spell"]',
 '["counter target spell", "counter target.*spell", "counter.*unless"]'),

((SELECT id FROM archetype_categories WHERE name = 'Interaction'), 
 'Board Wipes', 
 'Mass removal effects',
 '["destroy", "all", "creatures", "exile"]',
 '["destroy all creatures", "exile all creatures", "all creatures get -[0-9]+/-[0-9]+", "wrath", "day of judgment"]'),

((SELECT id FROM archetype_categories WHERE name = 'Interaction'), 
 'Protection', 
 'Protect your permanents',
 '["indestructible", "hexproof", "protection", "regenerate"]',
 '["indestructible", "hexproof", "protection from", "regenerate", "cannot be countered"]');

-- Card Advantage functions
INSERT OR IGNORE INTO archetype_functions (category_id, name, description, keywords, rules_patterns) VALUES
((SELECT id FROM archetype_categories WHERE name = 'Card Advantage'), 
 'Card Draw', 
 'Draw additional cards',
 '["draw", "cards", "hand"]',
 '["draw [0-9]+ cards?", "draw a card", "whenever.*draw.*card", "you may draw"]'),

((SELECT id FROM archetype_categories WHERE name = 'Card Advantage'), 
 'Card Selection', 
 'Look at and choose cards',
 '["look", "top", "library", "scry", "reveal"]',
 '["look at the top [0-9]+", "scry [0-9]+", "reveal.*top.*library", "choose one.*hand"]'),

((SELECT id FROM archetype_categories WHERE name = 'Card Advantage'), 
 'Value Engines', 
 'Repeatable advantage',
 '["whenever", "enters", "dies", "upkeep"]',
 '["whenever.*enters.*battlefield.*draw", "whenever.*dies.*draw", "at the beginning.*draw", "repeatable"]');

-- Recursion functions
INSERT OR IGNORE INTO archetype_functions (category_id, name, description, keywords, rules_patterns) VALUES
((SELECT id FROM archetype_categories WHERE name = 'Recursion'), 
 'Graveyard Recursion', 
 'Return cards from graveyard',
 '["return", "graveyard", "hand", "battlefield"]',
 '["return.*from.*graveyard.*hand", "return.*from.*graveyard.*battlefield", "return target.*card.*graveyard"]'),

((SELECT id FROM archetype_categories WHERE name = 'Recursion'), 
 'Reanimation', 
 'Put creatures from graveyard to battlefield',
 '["return", "graveyard", "battlefield", "creature"]',
 '["return.*creature.*graveyard.*battlefield", "put.*creature.*graveyard.*battlefield", "reanimate"]'),

((SELECT id FROM archetype_categories WHERE name = 'Recursion'), 
 'Flashback/Escape', 
 'Cast from graveyard',
 '["flashback", "escape", "cast", "graveyard"]',
 '["flashback", "escape", "you may cast.*from.*graveyard", "cast.*from your graveyard"]');

-- Win Conditions functions
INSERT OR IGNORE INTO archetype_functions (category_id, name, description, keywords, rules_patterns) VALUES
((SELECT id FROM archetype_categories WHERE name = 'Win Conditions'), 
 'Combo Pieces', 
 'Cards that enable infinite combos',
 '["infinite", "combo", "win", "game"]',
 '["infinite", "you win the game", "wins? the game", "target player loses"]'),

((SELECT id FROM archetype_categories WHERE name = 'Win Conditions'), 
 'Big Threats', 
 'Large creatures or planeswalkers',
 '["power", "toughness", "flying", "trample"]',
 '["[0-9]+/[0-9]+", "power [0-9]+ or greater", "flying.*trample", "annihilator"]'),

((SELECT id FROM archetype_categories WHERE name = 'Win Conditions'), 
 'Alternative Win Cons', 
 'Non-combat win conditions',
 '["win", "game", "loses", "life", "poison"]',
 '["you win the game", "target player loses the game", "poison counter", "mill.*library"]');

-- Clear existing classifications to start fresh
DELETE FROM card_archetypes;
DELETE FROM commander_archetype_weights;

-- Classify well-known cards manually for high accuracy
-- Mana Rocks
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT c.id, af.id, 1.0, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Fast Mana'
  AND af.name = 'Mana Rocks'
  AND (
    LOWER(c.name) LIKE '%sol ring%' OR
    LOWER(c.name) LIKE '%mana crypt%' OR
    LOWER(c.name) LIKE '%mana vault%' OR
    LOWER(c.name) LIKE '%arcane signet%' OR
    LOWER(c.name) LIKE '%chrome mox%' OR
    LOWER(c.name) LIKE '%mox diamond%' OR
    LOWER(c.name) LIKE '%fellwar stone%' OR
    LOWER(c.name) LIKE '%signet%' OR
    LOWER(c.name) LIKE '%talisman%'
  );

-- Unconditional Tutors
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT c.id, af.id, 1.0, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Tutors'
  AND af.name = 'Unconditional Tutors'
  AND (
    LOWER(c.name) LIKE '%demonic tutor%' OR
    LOWER(c.name) LIKE '%vampiric tutor%' OR
    LOWER(c.name) LIKE '%imperial seal%' OR
    LOWER(c.name) LIKE '%grim tutor%' OR
    LOWER(c.name) LIKE '%diabolic tutor%'
  );

-- Counterspells
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT c.id, af.id, 1.0, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Interaction'
  AND af.name = 'Counterspells'
  AND (
    LOWER(c.name) = 'counterspell' OR
    LOWER(c.name) LIKE '%force of will%' OR
    LOWER(c.name) LIKE '%mana drain%' OR
    LOWER(c.name) = 'negate' OR
    LOWER(c.name) LIKE '%swan song%' OR
    LOWER(c.name) LIKE '%fierce guardianship%'
  );

-- Board Wipes
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT c.id, af.id, 1.0, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Interaction'
  AND af.name = 'Board Wipes'
  AND (
    LOWER(c.name) LIKE '%wrath of god%' OR
    LOWER(c.name) LIKE '%day of judgment%' OR
    LOWER(c.name) LIKE '%supreme verdict%' OR
    LOWER(c.name) LIKE '%cyclonic rift%' OR
    LOWER(c.name) LIKE '%toxic deluge%' OR
    LOWER(c.name) = 'damnation'
  );

-- Card Draw engines
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT c.id, af.id, 1.0, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Card Advantage'
  AND af.name = 'Card Draw'
  AND (
    LOWER(c.name) LIKE '%rhystic study%' OR
    LOWER(c.name) LIKE '%mystic remora%' OR
    LOWER(c.name) LIKE '%phyrexian arena%' OR
    LOWER(c.name) = 'necropotence' OR
    LOWER(c.name) LIKE '%sylvan library%'
  );

-- Classify cards based on rules text patterns
-- Mana rocks (artifacts that add mana)
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.8, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Fast Mana'
  AND af.name = 'Mana Rocks'
  AND JSON_EXTRACT(c.data, '$.type_line') LIKE '%Artifact%'
  AND (
    LOWER(c.data) LIKE '%{t}%add%mana%' OR
    LOWER(c.data) LIKE '%add%{%}%' OR
    LOWER(c.data) LIKE '%add one mana%'
  )
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Mana dorks (creatures that add mana)
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.8, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Fast Mana'
  AND af.name = 'Mana Dorks'
  AND JSON_EXTRACT(c.data, '$.type_line') LIKE '%Creature%'
  AND (
    LOWER(c.data) LIKE '%{t}%add%{%}%' OR
    LOWER(c.data) LIKE '%add%mana%'
  )
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Land ramp spells
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.7, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Fast Mana'
  AND af.name = 'Land Ramp'
  AND (JSON_EXTRACT(c.data, '$.type_line') LIKE '%Sorcery%' OR JSON_EXTRACT(c.data, '$.type_line') LIKE '%Instant%')
  AND LOWER(c.data) LIKE '%search%library%land%battlefield%'
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Tutors (search library for card)
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.9, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Tutors'
  AND af.name = 'Unconditional Tutors'
  AND (
    LOWER(c.data) LIKE '%search your library for a card%' OR
    LOWER(c.data) LIKE '%search your library%card%hand%'
  )
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Creature tutors
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.8, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Tutors'
  AND af.name = 'Creature Tutors'
  AND (
    LOWER(c.data) LIKE '%search%library%creature%hand%' OR
    LOWER(c.data) LIKE '%search%library%creature%battlefield%'
  )
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Counterspells
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.9, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Interaction'
  AND af.name = 'Counterspells'
  AND (JSON_EXTRACT(c.data, '$.type_line') LIKE '%Instant%' OR LOWER(c.data) LIKE '%flash%')
  AND LOWER(c.data) LIKE '%counter target spell%'
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Spot removal
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.7, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Interaction'
  AND af.name = 'Spot Removal'
  AND (
    LOWER(c.data) LIKE '%destroy target creature%' OR
    LOWER(c.data) LIKE '%exile target creature%' OR
    LOWER(c.data) LIKE '%destroy target artifact%' OR
    LOWER(c.data) LIKE '%destroy target enchantment%'
  )
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Board wipes
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.9, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Interaction'
  AND af.name = 'Board Wipes'
  AND (
    LOWER(c.data) LIKE '%destroy all creatures%' OR
    LOWER(c.data) LIKE '%exile all creatures%' OR
    LOWER(c.data) LIKE '%all creatures get -%'
  )
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Card draw
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.8, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Card Advantage'
  AND af.name = 'Card Draw'
  AND (
    LOWER(c.data) LIKE '%draw% card%' OR
    LOWER(c.data) LIKE '%whenever%draw%card%'
  )
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Graveyard recursion
INSERT OR IGNORE INTO card_archetypes (card_id, function_id, confidence, context_dependent)
SELECT DISTINCT c.id, af.id, 0.8, 0
FROM Card c, archetype_functions af, archetype_categories ac
WHERE af.category_id = ac.id
  AND ac.name = 'Recursion'
  AND af.name = 'Graveyard Recursion'
  AND (
    LOWER(c.data) LIKE '%return%graveyard%hand%' OR
    LOWER(c.data) LIKE '%return%graveyard%battlefield%'
  )
  AND c.id NOT IN (SELECT card_id FROM card_archetypes WHERE function_id = af.id);

-- Calculate commander archetype preferences based on successful decks
INSERT OR REPLACE INTO commander_archetype_weights (commander_id, function_id, weight, recommended_count)
SELECT 
  cmd.id as commander_id,
  af.id as function_id,
  CAST(deck_count AS REAL) / total_successful_decks as weight,
  ROUND(CAST(total_cards AS REAL) / deck_count) as recommended_count
FROM (
  -- Get successful decks per commander
  SELECT 
    e.commanderId,
    COUNT(DISTINCT e.id) as total_successful_decks
  FROM Entry e
  INNER JOIN Tournament t ON t.id = e.tournamentId
  WHERE e.standing <= t.topCut OR e.standing <= (t.size / 4)
  GROUP BY e.commanderId
  HAVING COUNT(DISTINCT e.id) >= 3
) success_counts
INNER JOIN Commander cmd ON cmd.id = success_counts.commanderId
CROSS JOIN (
  -- Get archetype distribution in successful decks
  SELECT 
    e.commanderId,
    af.id as function_id,
    COUNT(DISTINCT e.id) as deck_count,
    COUNT(*) as total_cards
  FROM Entry e
  INNER JOIN Tournament t ON t.id = e.tournamentId
  INNER JOIN DecklistItem di ON di.entryId = e.id
  INNER JOIN card_archetypes ca ON ca.card_id = di.cardId
  INNER JOIN archetype_functions af ON af.id = ca.function_id
  WHERE (e.standing <= t.topCut OR e.standing <= (t.size / 4))
    AND ca.confidence > 0.5
  GROUP BY e.commanderId, af.id
  HAVING COUNT(DISTINCT e.id) >= 2
) archetype_dist ON archetype_dist.commanderId = success_counts.commanderId
INNER JOIN archetype_functions af ON af.id = archetype_dist.function_id
WHERE CAST(archetype_dist.deck_count AS REAL) / success_counts.total_successful_decks > 0.2
  AND ROUND(CAST(archetype_dist.total_cards AS REAL) / archetype_dist.deck_count) > 0;

-- Create helpful views
CREATE VIEW IF NOT EXISTS v_deck_archetypes AS
SELECT 
    di.entryId,
    ac.name as category,
    af.name as function_name,
    c.name as card_name,
    ca.confidence
FROM DecklistItem di
JOIN Card c ON c.id = di.cardId
JOIN card_archetypes ca ON ca.card_id = c.id
JOIN archetype_functions af ON af.id = ca.function_id
JOIN archetype_categories ac ON ac.id = af.category_id
WHERE ca.confidence > 0.3;

CREATE VIEW IF NOT EXISTS v_commander_archetype_summary AS
SELECT 
    cmd.name as commander_name,
    ac.name as category,
    af.name as function_name,
    caw.weight,
    caw.recommended_count,
    COUNT(DISTINCT ca.card_id) as available_cards
FROM Commander cmd
LEFT JOIN commander_archetype_weights caw ON caw.commander_id = cmd.id
LEFT JOIN archetype_functions af ON af.id = caw.function_id
LEFT JOIN archetype_categories ac ON ac.id = af.category_id
LEFT JOIN card_archetypes ca ON ca.function_id = af.id AND ca.confidence > 0.5
GROUP BY cmd.id, ac.id, af.id
ORDER BY cmd.name, ac.priority, caw.weight DESC;

COMMIT;

-- Show summary statistics
SELECT 'Archetype Categories Created' as step, COUNT(*) as count FROM archetype_categories
UNION ALL
SELECT 'Archetype Functions Created' as step, COUNT(*) as count FROM archetype_functions
UNION ALL
SELECT 'Cards Classified' as step, COUNT(*) as count FROM card_archetypes
UNION ALL
SELECT 'Commander Preferences Calculated' as step, COUNT(*) as count FROM commander_archetype_weights;

-- Show classification breakdown
SELECT 
  ac.name as category,
  COUNT(DISTINCT ca.card_id) as cards_classified
FROM card_archetypes ca
JOIN archetype_functions af ON af.id = ca.function_id
JOIN archetype_categories ac ON ac.id = af.category_id
WHERE ca.confidence > 0.5
GROUP BY ac.name
ORDER BY cards_classified DESC;

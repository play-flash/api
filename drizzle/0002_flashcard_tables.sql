-- Drop todos table
DROP TABLE IF EXISTS `todos`;

-- Create decks table
CREATE TABLE `decks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

-- Create cards table
CREATE TABLE `cards` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deck_id` integer NOT NULL REFERENCES `decks`(`id`) ON DELETE CASCADE,
  `front` text NOT NULL,
  `back` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

-- Create indexes
CREATE INDEX `idx_decks_user_id` ON `decks` (`user_id`);
CREATE INDEX `idx_cards_deck_id` ON `cards` (`deck_id`);

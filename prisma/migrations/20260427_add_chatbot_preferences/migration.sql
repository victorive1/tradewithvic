-- Add chatbot-specific personalization to UserPreference.
-- Default '{}' so existing rows pick up an empty preferences object.
ALTER TABLE "UserPreference"
ADD COLUMN "chatbotPreferences" TEXT NOT NULL DEFAULT '{}';

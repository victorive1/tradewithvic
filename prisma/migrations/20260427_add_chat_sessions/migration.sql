-- ChatSession + ChatSessionMessage for persisted chatbot history.
-- Cascade delete: removing a User removes their conversations; removing a
-- session removes its messages.

CREATE TABLE "ChatSession" (
  "id"           TEXT PRIMARY KEY,
  "userId"       TEXT NOT NULL,
  "title"        TEXT,
  "currentAgent" TEXT NOT NULL DEFAULT 'base',
  "escalated"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ChatSession_userId_updatedAt_idx" ON "ChatSession"("userId", "updatedAt");

CREATE TABLE "ChatSessionMessage" (
  "id"             TEXT PRIMARY KEY,
  "sessionId"      TEXT NOT NULL,
  "role"           TEXT NOT NULL,
  "content"        TEXT NOT NULL,
  "agent"          TEXT,
  "agentName"      TEXT,
  "intent"         TEXT,
  "structuredJson" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatSessionMessage_sessionId_fkey" FOREIGN KEY ("sessionId")
    REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ChatSessionMessage_sessionId_createdAt_idx" ON "ChatSessionMessage"("sessionId", "createdAt");

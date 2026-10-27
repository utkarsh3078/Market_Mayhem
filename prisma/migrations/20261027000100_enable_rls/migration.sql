-- Supabase exposes tables in the public schema through its Data API (PostgREST).
-- Enabling row-level security with no policies blocks that API for the anon and authenticated
-- roles. The game server connects as the table owner, which RLS does not restrict.
-- Harmless on plain PostgreSQL.

ALTER TABLE "Player" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoomPlayer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

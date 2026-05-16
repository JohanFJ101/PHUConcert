-- Add ticketing id imported from BookMyShow/admin CSV.
ALTER TABLE "User" ADD COLUMN "ticketId" TEXT;

CREATE UNIQUE INDEX "User_ticketId_key" ON "User"("ticketId");

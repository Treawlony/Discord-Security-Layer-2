-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('PASSWORD_SET', 'PASSWORD_CHANGED', 'ELEVATION_REQUESTED', 'ELEVATION_GRANTED', 'ELEVATION_EXPIRED', 'ELEVATION_REVOKED', 'FAILED_ATTEMPT', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'ELIGIBILITY_GRANTED', 'ELIGIBILITY_REVOKED');

-- CreateTable
CREATE TABLE "guild_configs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sessionDurationMin" INTEGER NOT NULL DEFAULT 60,
    "lockoutThreshold" INTEGER NOT NULL DEFAULT 5,
    "alertChannelId" TEXT,
    "auditChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim_users" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pim_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligible_roles" (
    "id" TEXT NOT NULL,
    "pimUserId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eligible_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_elevations" (
    "id" TEXT NOT NULL,
    "pimUserId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "elevatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "active_elevations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "pimUserId" TEXT,
    "discordUserId" TEXT NOT NULL,
    "eventType" "AuditEventType" NOT NULL,
    "roleId" TEXT,
    "roleName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guild_configs_guildId_key" ON "guild_configs"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "pim_users_discordUserId_guildId_key" ON "pim_users"("discordUserId", "guildId");

-- CreateIndex
CREATE UNIQUE INDEX "eligible_roles_pimUserId_roleId_key" ON "eligible_roles"("pimUserId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "active_elevations_pimUserId_roleId_key" ON "active_elevations"("pimUserId", "roleId");

-- CreateIndex
CREATE INDEX "audit_logs_guildId_createdAt_idx" ON "audit_logs"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_discordUserId_idx" ON "audit_logs"("discordUserId");

-- AddForeignKey
ALTER TABLE "eligible_roles" ADD CONSTRAINT "eligible_roles_pimUserId_fkey" FOREIGN KEY ("pimUserId") REFERENCES "pim_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_elevations" ADD CONSTRAINT "active_elevations_pimUserId_fkey" FOREIGN KEY ("pimUserId") REFERENCES "pim_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_pimUserId_fkey" FOREIGN KEY ("pimUserId") REFERENCES "pim_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

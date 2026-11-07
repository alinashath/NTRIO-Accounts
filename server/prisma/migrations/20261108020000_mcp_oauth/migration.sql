-- CreateTable
CREATE TABLE "mcp_users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" UUID NOT NULL,
    "client_id" VARCHAR(128) NOT NULL,
    "client_name" VARCHAR(256),
    "redirect_uris" TEXT[],
    "token_endpoint_auth_method" VARCHAR(64) NOT NULL DEFAULT 'none',
    "grant_types" TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token']::TEXT[],
    "response_types" TEXT[] DEFAULT ARRAY['code']::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_authorization_codes" (
    "id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "mcp_user_id" UUID NOT NULL,
    "redirect_uri" VARCHAR(2048) NOT NULL,
    "code_challenge" VARCHAR(128) NOT NULL,
    "code_challenge_method" VARCHAR(16) NOT NULL DEFAULT 'S256',
    "scope" VARCHAR(64) NOT NULL DEFAULT 'org',
    "resource" VARCHAR(2048) NOT NULL,
    "issuer" VARCHAR(512) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_refresh_tokens" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "mcp_user_id" UUID NOT NULL,
    "scope" VARCHAR(64) NOT NULL DEFAULT 'org',
    "resource" VARCHAR(2048) NOT NULL,
    "issuer" VARCHAR(512) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "mcp_user_id" UUID NOT NULL,
    "tool_name" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_users_username_key" ON "mcp_users"("username");

-- CreateIndex
CREATE INDEX "mcp_users_organization_id_idx" ON "mcp_users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_client_id_key" ON "oauth_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_authorization_codes_code_hash_key" ON "oauth_authorization_codes"("code_hash");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_expires_at_idx" ON "oauth_authorization_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_refresh_tokens_token_hash_key" ON "oauth_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_expires_at_idx" ON "oauth_refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "mcp_audit_events_organization_id_created_at_idx" ON "mcp_audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "mcp_audit_events_mcp_user_id_created_at_idx" ON "mcp_audit_events"("mcp_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "mcp_users" ADD CONSTRAINT "mcp_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_mcp_user_id_fkey" FOREIGN KEY ("mcp_user_id") REFERENCES "mcp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_mcp_user_id_fkey" FOREIGN KEY ("mcp_user_id") REFERENCES "mcp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_audit_events" ADD CONSTRAINT "mcp_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_audit_events" ADD CONSTRAINT "mcp_audit_events_mcp_user_id_fkey" FOREIGN KEY ("mcp_user_id") REFERENCES "mcp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

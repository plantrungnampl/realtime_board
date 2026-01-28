ALTER TABLE core.organization_invite
    ADD COLUMN invite_token_hash VARCHAR(64);

ALTER TABLE core.organization_invite
    ALTER COLUMN invite_token DROP NOT NULL;

CREATE INDEX idx_org_invite_token_hash
    ON core.organization_invite(invite_token_hash)
    WHERE invite_token_hash IS NOT NULL;

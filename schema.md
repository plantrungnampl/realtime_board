# 🏗️ Database Design: Realtime Collaborative Board

## 📁 Schema Structure

### 1️⃣ Extensions & Setup

```sql
-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram matching for search
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- GiST index for exclusion
CREATE EXTENSION IF NOT EXISTS "ltree";          -- Hierarchical data

-- ============================================================================
-- SCHEMAS
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS core;      -- Core entities (users, orgs)
CREATE SCHEMA IF NOT EXISTS board;     -- Board-related entities
CREATE SCHEMA IF NOT EXISTS collab;    -- Collaboration features
CREATE SCHEMA IF NOT EXISTS audit;     -- Audit logging
CREATE SCHEMA IF NOT EXISTS crdt;
-- ============================================================================
-- CUSTOM TYPES
-- ============================================================================

-- Element types on board
CREATE TYPE board.element_type AS ENUM (
    'shape',           -- Rectangle, Circle, Triangle, etc.
    'text',            -- Text box
    'sticky_note',     -- Sticky note
    'image',           -- Image
    'video',           -- Video embed
    'frame',           -- Frame/Container
    'connector',       -- Line/Arrow connecting elements
    'drawing',         -- Freehand drawing
    'embed',           -- External embed (YouTube, etc.)
    'document',        -- Document/File
    'component'        -- Reusable component
);

-- Board member roles
CREATE TYPE core.board_role AS ENUM (
    'owner',           -- Full control
    'admin',           -- Can manage members
    'editor',          -- Can edit
    'commenter',       -- Can comment only
    'viewer'           -- Read only
);

-- Organization member roles
CREATE TYPE core.org_role AS ENUM (
    'owner',
    'admin',
    'member',
    'guest'
);

-- Subscription tiers
CREATE TYPE core.subscription_tier AS ENUM (
    'free',
    'starter',
    'professional',
    'enterprise'
);

-- Presence status
CREATE TYPE collab.presence_status AS ENUM (
    'online',
    'idle',
    'offline'
);

-- Comment status
CREATE TYPE collab.comment_status AS ENUM (
    'open',
    'resolved',
    'archived'
);
```

---

### 2️⃣ Core Schema - Users & Organizations

```sql
CREATE TABLE core.user (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

    email               VARCHAR(255) NOT NULL,
    email_verified_at   TIMESTAMPTZ,
    password_hash       VARCHAR(255),

    username            VARCHAR(50),
    display_name        VARCHAR(100) NOT NULL,
    avatar_url          TEXT,
    bio                 TEXT,

    preferences         JSONB NOT NULL DEFAULT '{
        "theme": "system",
        "language": "en",
        "notifications": {
            "email": true,
            "push": true,
            "mentions": true
        },
        "defaultBoardSettings": {
            "gridEnabled": true,
            "snapToGrid": true
        }
    }'::jsonb,

    is_active           BOOLEAN NOT NULL DEFAULT true,
    last_active_at      TIMESTAMPTZ,

    subscription_tier   core.subscription_tier NOT NULL DEFAULT 'free',
    subscription_expires_at TIMESTAMPTZ,

    metadata            JSONB DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ,

    -- CHECK constraints OK
    CONSTRAINT user_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT user_username_format CHECK (username ~* '^[a-z0-9_]{3,50}$')
);
CREATE UNIQUE INDEX user_email_unique
    ON core.user(email)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX user_username_unique
    ON core.user(username)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_user_email ON core.user(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_username ON core.user(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_created_at ON core.user(created_at);
CREATE INDEX idx_user_subscription ON core.user(subscription_tier, subscription_expires_at);
CREATE INDEX idx_user_preferences ON core.user USING gin(preferences);	
CREATE TABLE core.organization (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

    name                VARCHAR(100) NOT NULL,
    slug                VARCHAR(100) NOT NULL,
    description         TEXT,
    logo_url            TEXT,

    settings            JSONB NOT NULL DEFAULT '{
        "allowPublicBoards": false,
        "defaultBoardPermission": "editor",
        "ssoEnabled": false,
        "domainRestriction": null
    }'::jsonb,

    subscription_tier   core.subscription_tier NOT NULL DEFAULT 'free',
    subscription_expires_at TIMESTAMPTZ,
    max_members         INTEGER NOT NULL DEFAULT 5,
    max_boards          INTEGER NOT NULL DEFAULT 10,
    storage_limit_mb    INTEGER NOT NULL DEFAULT 100,
    storage_used_mb     INTEGER NOT NULL DEFAULT 0,

    billing_email       VARCHAR(255),
    billing_address     JSONB,

    metadata            JSONB DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT org_slug_format CHECK (slug ~* '^[a-z0-9-]{3,100}$'),
    CONSTRAINT org_storage_check CHECK (storage_used_mb <= storage_limit_mb)
);
CREATE UNIQUE INDEX org_slug_unique
    ON core.organization(slug)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_org_slug ON core.organization(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_org_subscription ON core.organization(subscription_tier);
CREATE INDEX idx_org_settings ON core.organization USING gin(settings);
CREATE TABLE core.organization_member (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

    -- References
    organization_id     UUID NOT NULL REFERENCES core.organization(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES core.user(id) ON DELETE CASCADE,

    -- Role
    role                core.org_role NOT NULL DEFAULT 'member',

    -- Invitation
    invited_by          UUID REFERENCES core.user(id),
    invited_at          TIMESTAMPTZ,
    accepted_at         TIMESTAMPTZ,

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT org_member_unique UNIQUE (organization_id, user_id)
);

-- Indexes
CREATE INDEX idx_org_member_org ON core.organization_member(organization_id);
CREATE INDEX idx_org_member_user ON core.organization_member(user_id);
CREATE INDEX idx_org_member_role ON core.organization_member(organization_id, role);
```

---

### 3️⃣ Board Schema - Boards & Elements

```sql
-- ============================================================================
-- BOARD.BOARD - Main board entity
-- ============================================================================
CREATE TABLE board.board (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- Ownership
    organization_id     UUID REFERENCES core.organization(id) ON DELETE CASCADE,
    created_by          UUID NOT NULL REFERENCES core.user(id),
    
    -- Basic Info
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    thumbnail_url       TEXT,
    
    -- Visibility
    is_public           BOOLEAN NOT NULL DEFAULT false,
    is_template         BOOLEAN NOT NULL DEFAULT false,
    
    -- Canvas Settings
    canvas_settings     JSONB NOT NULL DEFAULT '{
        "width": 10000,
        "height": 10000,
        "backgroundColor": "#ffffff",
        "gridSize": 20,
        "gridEnabled": true,
        "snapToGrid": true,
        "showRulers": true,
        "defaultZoom": 1
    }'::jsonb,
    
    -- Viewport (last saved position)
    viewport            JSONB DEFAULT '{
        "x": 0,
        "y": 0,
        "zoom": 1
    }'::jsonb,
    
    -- Version Control (Optimistic Locking)
    version             INTEGER NOT NULL DEFAULT 1,
    
    -- Statistics
    element_count       INTEGER NOT NULL DEFAULT 0,
    view_count          INTEGER NOT NULL DEFAULT 0,
    last_edited_at      TIMESTAMPTZ,
    last_edited_by      UUID REFERENCES core.user(id),
    
    -- Metadata
    tags                TEXT[] DEFAULT '{}',
    metadata            JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT board_name_not_empty CHECK (length(trim(name)) > 0)
);

-- Indexes
CREATE INDEX idx_board_org ON board.board(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_board_created_by ON board.board(created_by);
CREATE INDEX idx_board_public ON board.board(is_public) WHERE is_public = true AND deleted_at IS NULL;
CREATE INDEX idx_board_template ON board.board(is_template) WHERE is_template = true AND deleted_at IS NULL;
CREATE INDEX idx_board_tags ON board.board USING gin(tags);
CREATE INDEX idx_board_name_search ON board.board USING gin(name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_board_updated ON board.board(updated_at DESC) WHERE deleted_at IS NULL;

-- ============================================================================
-- BOARD.BOARD_MEMBER - Board access control
-- ============================================================================
CREATE TABLE board.board_member (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- References
    board_id            UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES core.user(id) ON DELETE CASCADE,
    
    -- Role & Permissions
    role                core.board_role NOT NULL DEFAULT 'viewer',
    custom_permissions  JSONB,  -- Override default role permissions
    
    -- Favorites & Preferences
    is_favorite         BOOLEAN NOT NULL DEFAULT false,
    last_accessed_at    TIMESTAMPTZ,
    
    -- Invitation
    invited_by          UUID REFERENCES core.user(id),
    invite_token        VARCHAR(64),
    invite_expires_at   TIMESTAMPTZ,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT board_member_unique UNIQUE (board_id, user_id)
);

-- Indexes
CREATE INDEX idx_board_member_board ON board.board_member(board_id);
CREATE INDEX idx_board_member_user ON board.board_member(user_id);
CREATE INDEX idx_board_member_favorites ON board.board_member(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX idx_board_member_token ON board.board_member(invite_token) WHERE invite_token IS NOT NULL;

-- ============================================================================
-- BOARD.LAYER - Layers for organizing elements
-- ============================================================================
CREATE TABLE board.layer (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- Reference
    board_id            UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,
    
    -- Properties
    name                VARCHAR(100) NOT NULL DEFAULT 'Layer',
    order_index         INTEGER NOT NULL DEFAULT 0,
    is_visible          BOOLEAN NOT NULL DEFAULT true,
    is_locked           BOOLEAN NOT NULL DEFAULT false,
    opacity             DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT layer_opacity_range CHECK (opacity >= 0 AND opacity <= 1),
    CONSTRAINT layer_order_unique UNIQUE (board_id, order_index) DEFERRABLE INITIALLY DEFERRED
);

-- Indexes
CREATE INDEX idx_layer_board ON board.layer(board_id);
CREATE INDEX idx_layer_order ON board.layer(board_id, order_index);

-- ============================================================================
-- BOARD.ELEMENT - All elements on the board
-- ============================================================================
CREATE TABLE board.element (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- References
    board_id            UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,
    layer_id            UUID REFERENCES board.layer(id) ON DELETE SET NULL,
    parent_id           UUID REFERENCES board.element(id) ON DELETE CASCADE,  -- For grouping
    created_by          UUID NOT NULL REFERENCES core.user(id),
    
    -- Type
    element_type        board.element_type NOT NULL,
    
    -- Position & Size
    position_x          DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y          DOUBLE PRECISION NOT NULL DEFAULT 0,
    width               DOUBLE PRECISION NOT NULL DEFAULT 100,
    height              DOUBLE PRECISION NOT NULL DEFAULT 100,
    rotation            DOUBLE PRECISION NOT NULL DEFAULT 0,
    
    -- Z-Index within layer
    z_index             INTEGER NOT NULL DEFAULT 0,
    
    -- Locking
    is_locked           BOOLEAN NOT NULL DEFAULT false,
    locked_by           UUID REFERENCES core.user(id),
    locked_at           TIMESTAMPTZ,
    
    -- Style Properties
    style               JSONB NOT NULL DEFAULT '{
        "fill": "#ffffff",
        "stroke": "#000000",
        "strokeWidth": 1,
        "opacity": 1,
        "cornerRadius": 0,
        "shadow": null
    }'::jsonb,
    
    -- Type-specific properties
    properties          JSONB NOT NULL DEFAULT '{}',
    /*
    Shape: { "shapeType": "rectangle" | "circle" | "triangle" | ... }
    Text: { "content": "...", "fontSize": 16, "fontFamily": "Arial", "textAlign": "left" }
    Sticky: { "content": "...", "color": "yellow" }
    Image: { "src": "...", "alt": "..." }
    Connector: { "startElementId": "...", "endElementId": "...", "startPoint": {...}, "endPoint": {...}, "lineType": "straight" | "curved" }
    Frame: { "title": "...", "clipContent": true }
    Drawing: { "paths": [...], "brushSize": 2, "brushColor": "#000" }
    */
    
    -- Version Control
    version             INTEGER NOT NULL DEFAULT 1,
    
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT element_positive_dimensions CHECK (width > 0 AND height > 0),
    CONSTRAINT element_rotation_range CHECK (rotation >= 0 AND rotation < 360)
);

-- Indexes
CREATE INDEX idx_element_board ON board.element(board_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_element_layer ON board.element(layer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_element_parent ON board.element(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_element_type ON board.element(board_id, element_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_element_created_by ON board.element(created_by);
CREATE INDEX idx_element_position ON board.element(board_id, position_x, position_y) WHERE deleted_at IS NULL;
CREATE INDEX idx_element_z_index ON board.element(board_id, layer_id, z_index) WHERE deleted_at IS NULL;
CREATE INDEX idx_element_properties ON board.element USING gin(properties);
CREATE INDEX idx_element_style ON board.element USING gin(style);

-- Spatial index for viewport queries (PostgreSQL doesn't have native spatial, but we can use range)
CREATE INDEX idx_element_bounds ON board.element(
    board_id,
    position_x,
    position_y,
    (position_x + width),
    (position_y + height)
) WHERE deleted_at IS NULL;

-- ============================================================================
-- BOARD.ASSET - Uploaded files/images
-- ============================================================================
CREATE TABLE board.asset (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- Ownership
    organization_id     UUID REFERENCES core.organization(id) ON DELETE CASCADE,
    uploaded_by         UUID NOT NULL REFERENCES core.user(id),
    
    -- File Info
    filename            VARCHAR(255) NOT NULL,
    original_filename   VARCHAR(255) NOT NULL,
    mime_type           VARCHAR(100) NOT NULL,
    file_size_bytes     BIGINT NOT NULL,
    
    -- Storage
    storage_provider    VARCHAR(50) NOT NULL DEFAULT 's3',  -- s3, gcs, azure, local
    storage_path        TEXT NOT NULL,
    storage_bucket      VARCHAR(255),
    
    -- URLs
    url                 TEXT NOT NULL,
    thumbnail_url       TEXT,
    
    -- Image Metadata
    image_metadata      JSONB,
    /*
    {
        "width": 1920,
        "height": 1080,
        "format": "jpeg",
        "colorSpace": "sRGB",
        "hasAlpha": false
    }
    */
    
    -- Processing Status
    processing_status   VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    processing_error    TEXT,
    
    -- Usage Tracking
    usage_count         INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT asset_size_positive CHECK (file_size_bytes > 0)
);

-- Indexes
CREATE INDEX idx_asset_org ON board.asset(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_asset_uploaded_by ON board.asset(uploaded_by);
CREATE INDEX idx_asset_mime ON board.asset(mime_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_asset_status ON board.asset(processing_status) WHERE processing_status != 'completed';

-- ============================================================================
-- BOARD.ELEMENT_ASSET - Link elements to assets
-- ============================================================================
CREATE TABLE board.element_asset (
    element_id          UUID NOT NULL REFERENCES board.element(id) ON DELETE CASCADE,
    asset_id            UUID NOT NULL REFERENCES board.asset(id) ON DELETE CASCADE,
    
    -- Relationship type
    relationship_type   VARCHAR(50) NOT NULL DEFAULT 'content',  -- content, background, attachment
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (element_id, asset_id)
);

-- Indexes
CREATE INDEX idx_element_asset_element ON board.element_asset(element_id);
CREATE INDEX idx_element_asset_asset ON board.element_asset(asset_id);
```

---

### 4️⃣ Collaboration Schema

```sql
-- ============================================================================
-- COLLAB.PRESENCE - Real-time user presence
-- ============================================================================
CREATE TABLE collab.presence (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- References
    board_id            UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES core.user(id) ON DELETE CASCADE,
    
    -- Session
    session_id          UUID NOT NULL,
    connection_id       VARCHAR(100),  -- WebSocket connection ID
    
    -- Cursor Position
    cursor_x            DOUBLE PRECISION,
    cursor_y            DOUBLE PRECISION,
    
    -- Viewport
    viewport            JSONB DEFAULT '{
        "x": 0,
        "y": 0,
        "zoom": 1
    }'::jsonb,
    
    -- Status
    status              collab.presence_status NOT NULL DEFAULT 'online',
    
    -- Selection
    selected_elements   UUID[] DEFAULT '{}',
    
    -- Device Info
    device_info         JSONB,
    
    -- Timestamps
    connected_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disconnected_at     TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT presence_unique_session UNIQUE (board_id, session_id)
);

-- Indexes
CREATE INDEX idx_presence_board ON collab.presence(board_id) 
    WHERE disconnected_at IS NULL;
CREATE INDEX idx_presence_user ON collab.presence(user_id);
CREATE INDEX idx_presence_heartbeat ON collab.presence(last_heartbeat_at) 
    WHERE disconnected_at IS NULL;
CREATE INDEX idx_presence_status ON collab.presence(board_id, status) 
    WHERE status = 'online';

-- ============================================================================
-- COLLAB.COMMENT - Comments on board or elements
-- ============================================================================
CREATE TABLE collab.comment (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- References
    board_id            UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,
    element_id          UUID REFERENCES board.element(id) ON DELETE CASCADE,
    parent_id           UUID REFERENCES collab.comment(id) ON DELETE CASCADE,  -- Reply thread
    created_by          UUID NOT NULL REFERENCES core.user(id),
    
    -- Position (for board-level comments)
    position_x          DOUBLE PRECISION,
    position_y          DOUBLE PRECISION,
    
    -- Content
    content             TEXT NOT NULL,
    content_html        TEXT,  -- Rendered HTML with mentions
    
    -- Mentions
    mentions            UUID[] DEFAULT '{}',
    
    -- Status
    status              collab.comment_status NOT NULL DEFAULT 'open',
    resolved_by         UUID REFERENCES core.user(id),
    resolved_at         TIMESTAMPTZ,
    
    -- Edit tracking
    is_edited           BOOLEAN NOT NULL DEFAULT false,
    edited_at           TIMESTAMPTZ,
    
    -- Thread info (denormalized for performance)
    reply_count         INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT comment_content_not_empty CHECK (length(trim(content)) > 0)
);

-- Indexes
CREATE INDEX idx_comment_board ON collab.comment(board_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_comment_element ON collab.comment(element_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_comment_parent ON collab.comment(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_comment_created_by ON collab.comment(created_by);
CREATE INDEX idx_comment_status ON collab.comment(board_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_comment_mentions ON collab.comment USING gin(mentions) WHERE deleted_at IS NULL;
CREATE INDEX idx_comment_created ON collab.comment(board_id, created_at DESC) WHERE deleted_at IS NULL;

-- ============================================================================
-- COLLAB.REACTION - Emoji reactions on elements/comments
-- ============================================================================
CREATE TABLE collab.reaction (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- Target (one must be set)
    element_id          UUID REFERENCES board.element(id) ON DELETE CASCADE,
    comment_id          UUID REFERENCES collab.comment(id) ON DELETE CASCADE,
    
    -- Reaction
    user_id             UUID NOT NULL REFERENCES core.user(id) ON DELETE CASCADE,
    emoji               VARCHAR(50) NOT NULL,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT reaction_target_check CHECK (
        (element_id IS NOT NULL AND comment_id IS NULL) OR
        (element_id IS NULL AND comment_id IS NOT NULL)
    ),
    CONSTRAINT reaction_unique_element UNIQUE (element_id, user_id, emoji),
    CONSTRAINT reaction_unique_comment UNIQUE (comment_id, user_id, emoji)
);

-- Indexes
CREATE INDEX idx_reaction_element ON collab.reaction(element_id) WHERE element_id IS NOT NULL;
CREATE INDEX idx_reaction_comment ON collab.reaction(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_reaction_user ON collab.reaction(user_id);

-- ============================================================================
-- COLLAB.NOTIFICATION - User notifications
-- ============================================================================
CREATE TABLE collab.notification (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- Recipient
    user_id             UUID NOT NULL REFERENCES core.user(id) ON DELETE CASCADE,
    
    -- Source
    actor_id            UUID REFERENCES core.user(id) ON DELETE SET NULL,
    
    -- Target
    board_id            UUID REFERENCES board.board(id) ON DELETE CASCADE,
    element_id          UUID REFERENCES board.element(id) ON DELETE CASCADE,
    comment_id          UUID REFERENCES collab.comment(id) ON DELETE CASCADE,
    
    -- Content
    notification_type   VARCHAR(50) NOT NULL,
    title               VARCHAR(255) NOT NULL,
    body                TEXT,
    data                JSONB DEFAULT '{}',
    
    -- Status
    is_read             BOOLEAN NOT NULL DEFAULT false,
    read_at             TIMESTAMPTZ,
    
    -- Delivery
    email_sent          BOOLEAN NOT NULL DEFAULT false,
    push_sent           BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT notification_type_valid CHECK (
        notification_type IN (
            'board_invite',
            'board_mention',
            'comment_reply',
            'comment_mention',
            'element_update',
            'board_shared'
        )
    )
);

-- Indexes
CREATE INDEX idx_notification_user ON collab.notification(user_id, is_read, created_at DESC);
CREATE INDEX idx_notification_unread ON collab.notification(user_id, created_at DESC) 
    WHERE is_read = false;
CREATE INDEX idx_notification_board ON collab.notification(board_id);
CREATE INDEX idx_notification_type ON collab.notification(user_id, notification_type);

-- Partitioning by created_at for better performance (optional)
-- CREATE TABLE collab.notification_y2024m01 PARTITION OF collab.notification
--     FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

---

### 5️⃣ Audit Schema

```sql
-- ============================================================================
-- AUDIT.EVENT_LOG - Comprehensive audit logging
-- ============================================================================
CREATE TABLE audit.event_log (
    id                  UUID DEFAULT uuid_generate_v7(),
    
    event_type          VARCHAR(100) NOT NULL,
    event_category      VARCHAR(50) NOT NULL,
    
    actor_id            UUID REFERENCES core.user(id) ON DELETE SET NULL,
    actor_type          VARCHAR(20) NOT NULL DEFAULT 'user',
    
    target_type         VARCHAR(50) NOT NULL,
    target_id           UUID NOT NULL,

    board_id            UUID REFERENCES board.board(id) ON DELETE SET NULL,
    organization_id     UUID REFERENCES core.organization(id) ON DELETE SET NULL,

    old_values          JSONB,
    new_values          JSONB,
    changed_fields      TEXT[],

    ip_address          INET,
    user_agent          TEXT,
    request_id          UUID,
    session_id          UUID,

    metadata            JSONB DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);


-- Create partitions (monthly)
CREATE TABLE audit.event_log_y2024m01 PARTITION OF audit.event_log
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE audit.event_log_y2024m02 PARTITION OF audit.event_log
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE IF NOT EXISTS audit.event_log_y2025m12 PARTITION OF audit.event_log
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS audit.event_log_y2026m01 PARTITION OF audit.event_log
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
    
CREATE TABLE IF NOT EXISTS audit.event_log_y2026m02 PARTITION OF audit.event_log
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Indexes
CREATE INDEX idx_event_log_actor ON audit.event_log(actor_id, created_at DESC);
CREATE INDEX idx_event_log_target ON audit.event_log(target_type, target_id, created_at DESC);
CREATE INDEX idx_event_log_board ON audit.event_log(board_id, created_at DESC);
CREATE INDEX idx_event_log_type ON audit.event_log(event_type, created_at DESC);
CREATE INDEX idx_event_log_created ON audit.event_log(created_at DESC);

-- ============================================================================
-- AUDIT.ELEMENT_HISTORY - Element change history for undo/redo
-- ============================================================================
CREATE TABLE audit.element_history (
    id                  UUID DEFAULT uuid_generate_v7(),

    element_id          UUID NOT NULL,
    board_id            UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,

    changed_by          UUID REFERENCES core.user(id) ON DELETE SET NULL,

    version             INTEGER NOT NULL,

    operation           VARCHAR(20) NOT NULL,

    element_data        JSONB NOT NULL,

    changed_fields      TEXT[],
    batch_id            UUID,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE audit.element_history_y2024m01 PARTITION OF audit.element_history
    FOR VALUES FROM ('2025-12-01') TO ('2026-12-01');
CREATE TABLE audit.element_history_y2024m02 PARTITION OF audit.element_history
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit.element_history_y2024m03 PARTITION OF audit.element_history
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Indexes
CREATE INDEX idx_element_history_element ON audit.element_history(element_id, version DESC);
CREATE INDEX idx_element_history_board ON audit.element_history(board_id, created_at DESC);
CREATE INDEX idx_element_history_batch ON audit.element_history(batch_id) 
    WHERE batch_id IS NOT NULL;

-- ============================================================================
-- AUDIT.BOARD_SNAPSHOT - Full board snapshots for versioning
-- ============================================================================
CREATE TABLE audit.board_snapshot (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    
    -- Reference
    board_id            UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,
    
    -- Version
    version             INTEGER NOT NULL,
    version_name        VARCHAR(100),
    
    -- Snapshot
    board_data          JSONB NOT NULL,      -- Board metadata
    elements_data       JSONB NOT NULL,      -- All elements
    layers_data         JSONB NOT NULL,      -- All layers
    
    -- Statistics
    element_count       INTEGER NOT NULL,
    size_bytes          INTEGER,
    
    -- Actor
    created_by          UUID REFERENCES core.user(id) ON DELETE SET NULL,
    
    -- Type
    snapshot_type       VARCHAR(20) NOT NULL DEFAULT 'manual',  -- auto, manual, milestone
    
    -- Timestamp
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT snapshot_version_unique UNIQUE (board_id, version)
);

-- Indexes
CREATE INDEX idx_board_snapshot_board ON audit.board_snapshot(board_id, created_at DESC);
CREATE INDEX idx_board_snapshot_type ON audit.board_snapshot(board_id, snapshot_type);
```
### CDRT
-- 1 stream = 1 board (hoặc board+page nếu bạn chia)
CREATE SCHEMA IF NOT EXISTS crdt;

CREATE TABLE crdt.board_update (
  board_id        UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,
  
  -- seq tăng dần (Lưu ý: BIGSERIAL là global, không reset theo board_id)
  seq             BIGSERIAL NOT NULL,

  actor_id        UUID REFERENCES core.user(id) ON DELETE SET NULL,
  session_id      UUID,
  client_id       UUID,
  batch_id        UUID,

  update_bin      BYTEA NOT NULL,

  -- Cột ảo tính size
  update_bytes    INTEGER GENERATED ALWAYS AS (octet_length(update_bin)) STORED,
  
  -- Cột partition
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (board_id, seq, created_at)
) PARTITION BY RANGE (created_at);

-- Tạo partition
CREATE TABLE crdt.board_update_y2025m12 PARTITION OF crdt.board_update
FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');


-- 2. Index này vẫn cần nếu bạn hay query thống kê theo thời gian mà không theo board
CREATE INDEX idx_board_update_created_at ON crdt.board_update(created_at DESC);

-- 3. Index này tốt cho việc audit log xem user làm gì
CREATE INDEX idx_board_update_actor ON crdt.board_update(actor_id, created_at DESC);
---
-- 2) Snapshot binary: lưu "state-as-update" để load nhanh
CREATE TABLE crdt.board_snapshot (
  board_id      UUID NOT NULL REFERENCES board.board(id) ON DELETE CASCADE,
  snapshot_seq  BIGINT NOT NULL,         -- trạng thái sau khi apply tới seq này

  state_bin     BYTEA NOT NULL,
  state_bytes   INTEGER GENERATED ALWAYS AS (octet_length(state_bin)) STORED,

  created_by    UUID REFERENCES core.user(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (board_id, snapshot_seq)
);

CREATE INDEX idx_crdt_snapshot_latest ON crdt.board_snapshot(board_id, snapshot_seq DESC);

-- 3) Cursor cho projection worker
CREATE TABLE crdt.board_projection_cursor (
  board_id   UUID PRIMARY KEY REFERENCES board.board(id) ON DELETE CASCADE,
  last_seq   BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
### 6️⃣ Functions & Triggers

```sql
-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- =============================================================================
-- UUID HELPER
-- - Your original uses uuid_generate_v7(); that function isn't guaranteed.
-- - This helper tries uuid_generate_v7() or uuidv7() if available, else gen_random_uuid().
-- =============================================================================
CREATE OR REPLACE FUNCTION core.new_uuid()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  u uuid;
BEGIN
  BEGIN
    EXECUTE 'SELECT uuid_generate_v7()' INTO u;
    RETURN u;
  EXCEPTION WHEN undefined_function THEN
    BEGIN
      EXECUTE 'SELECT uuidv7()' INTO u;
      RETURN u;
    EXCEPTION WHEN undefined_function THEN
      RETURN gen_random_uuid();
    END;
  END;
END;
$$;



-- Updated timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables
CREATE TRIGGER update_user_updated_at
    BEFORE UPDATE ON core.user
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_updated_at
    BEFORE UPDATE ON core.organization
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_board_updated_at
    BEFORE UPDATE ON board.board
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_element_updated_at
    BEFORE UPDATE ON board.element
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comment_updated_at
    BEFORE UPDATE ON collab.comment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- OPTIMISTIC LOCKING
-- ============================================================================
CREATE OR REPLACE FUNCTION board.check_element_version()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.version != OLD.version + 1 THEN
        RAISE EXCEPTION 'Optimistic locking conflict: element % has been modified', OLD.id
            USING ERRCODE = 'serialization_failure';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER element_version_check
    BEFORE UPDATE ON board.element
    FOR EACH ROW
    WHEN (OLD.version IS DISTINCT FROM NEW.version)
    EXECUTE FUNCTION board.check_element_version();

-- ============================================================================
-- ELEMENT COUNT TRACKING
-- ============================================================================
CREATE OR REPLACE FUNCTION board.update_element_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE board.board 
        SET element_count = element_count + 1,
            last_edited_at = CURRENT_TIMESTAMP,
            last_edited_by = NEW.created_by
        WHERE id = NEW.board_id;
    ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN
        UPDATE board.board 
        SET element_count = element_count - 1,
            last_edited_at = CURRENT_TIMESTAMP
        WHERE id = COALESCE(NEW.board_id, OLD.board_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER element_count_trigger
    AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON board.element
    FOR EACH ROW EXECUTE FUNCTION board.update_element_count();

-- ============================================================================
-- COMMENT REPLY COUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION collab.update_reply_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
        UPDATE collab.comment 
        SET reply_count = reply_count + 1 
        WHERE id = NEW.parent_id;
    ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
        UPDATE collab.comment 
        SET reply_count = reply_count - 1 
        WHERE id = OLD.parent_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_reply_count_trigger
    AFTER INSERT OR DELETE ON collab.comment
    FOR EACH ROW EXECUTE FUNCTION collab.update_reply_count();

-- ============================================================================
-- AUDIT LOGGING TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION audit.log_changes()
RETURNS TRIGGER AS $$
DECLARE
    _old_data JSONB;
    _new_data JSONB;
    _changed_fields TEXT[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        _new_data := to_jsonb(NEW);
        INSERT INTO audit.event_log (
            event_type, event_category, actor_id, 
            target_type, target_id, new_values
        ) VALUES (
            TG_TABLE_NAME || '.created', TG_TABLE_SCHEMA,
            COALESCE(NEW.created_by, current_setting('app.current_user_id', true)::uuid),
            TG_TABLE_NAME, NEW.id, _new_data
        );
    ELSIF TG_OP = 'UPDATE' THEN
        _old_data := to_jsonb(OLD);
        _new_data := to_jsonb(NEW);
        
        -- Get changed fields
        SELECT array_agg(key) INTO _changed_fields
        FROM jsonb_each(_old_data) old_kv
        FULL OUTER JOIN jsonb_each(_new_data) new_kv USING (key)
        WHERE old_kv.value IS DISTINCT FROM new_kv.value;
        
        INSERT INTO audit.event_log (
            event_type, event_category, actor_id,
            target_type, target_id, old_values, new_values, changed_fields
        ) VALUES (
            TG_TABLE_NAME || '.updated', TG_TABLE_SCHEMA,
            current_setting('app.current_user_id', true)::uuid,
            TG_TABLE_NAME, NEW.id, _old_data, _new_data, _changed_fields
        );
    ELSIF TG_OP = 'DELETE' THEN
        _old_data := to_jsonb(OLD);
        INSERT INTO audit.event_log (
            event_type, event_category, actor_id,
            target_type, target_id, old_values
        ) VALUES (
            TG_TABLE_NAME || '.deleted', TG_TABLE_SCHEMA,
            current_setting('app.current_user_id', true)::uuid,
            TG_TABLE_NAME, OLD.id, _old_data
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to important tables
CREATE TRIGGER audit_board_changes
    AFTER INSERT OR UPDATE OR DELETE ON board.board
    FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

CREATE TRIGGER audit_element_changes
    AFTER INSERT OR UPDATE OR DELETE ON board.element
    FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

-- ============================================================================
-- ELEMENT HISTORY FOR UNDO/REDO
-- ============================================================================
CREATE OR REPLACE FUNCTION audit.save_element_history()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit.element_history (
        element_id, board_id, changed_by, version, operation, element_data,
        batch_id
    ) VALUES (
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.board_id, OLD.board_id),
        current_setting('app.current_user_id', true)::uuid,
        COALESCE(NEW.version, OLD.version),
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'create'
            WHEN TG_OP = 'DELETE' OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN 'delete'
            ELSE 'update'
        END,
        to_jsonb(COALESCE(NEW, OLD)),
        current_setting('app.batch_id', true)::uuid
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER save_element_history_trigger
    AFTER INSERT OR UPDATE OR DELETE ON board.element
    FOR EACH ROW EXECUTE FUNCTION audit.save_element_history();

-- ============================================================================
-- USEFUL QUERY FUNCTIONS
-- ============================================================================

-- Get elements within viewport
CREATE OR REPLACE FUNCTION board.get_elements_in_viewport(
    p_board_id UUID,
    p_viewport_x DOUBLE PRECISION,
    p_viewport_y DOUBLE PRECISION,
    p_viewport_width DOUBLE PRECISION,
    p_viewport_height DOUBLE PRECISION,
    p_zoom DOUBLE PRECISION DEFAULT 1.0
)
RETURNS SETOF board.element AS $$
BEGIN
    RETURN QUERY
    SELECT e.*
    FROM board.element e
    WHERE e.board_id = p_board_id
      AND e.deleted_at IS NULL
      AND e.position_x + e.width >= p_viewport_x
      AND e.position_x <= p_viewport_x + p_viewport_width / p_zoom
      AND e.position_y + e.height >= p_viewport_y
      AND e.position_y <= p_viewport_y + p_viewport_height / p_zoom
    ORDER BY e.layer_id, e.z_index;
END;
$$ LANGUAGE plpgsql;

-- Get board with statistics
CREATE OR REPLACE FUNCTION board.get_board_with_stats(p_board_id UUID)
RETURNS TABLE (
    board_id UUID,
    name VARCHAR(255),
    element_count INTEGER,
    member_count BIGINT,
    comment_count BIGINT,
    active_users BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.name,
        b.element_count,
        (SELECT COUNT(*) FROM board.board_member WHERE board_id = b.id),
        (SELECT COUNT(*) FROM collab.comment WHERE board_id = b.id AND deleted_at IS NULL),
        (SELECT COUNT(*) FROM collab.presence WHERE board_id = b.id AND status = 'online')
    FROM board.board b
    WHERE b.id = p_board_id AND b.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Clean up old presence records
CREATE OR REPLACE FUNCTION collab.cleanup_stale_presence(p_timeout_minutes INTEGER DEFAULT 5)
RETURNS INTEGER AS $$
DECLARE
    _count INTEGER;
BEGIN
    UPDATE collab.presence
    SET status = 'offline', disconnected_at = CURRENT_TIMESTAMP
    WHERE disconnected_at IS NULL
      AND last_heartbeat_at < CURRENT_TIMESTAMP - (p_timeout_minutes || ' minutes')::interval;
    
    GET DIAGNOSTICS _count = ROW_COUNT;
    RETURN _count;
END;
$$ LANGUAGE plpgsql;
```

---

### 7️⃣ Row Level Security (RLS)

```sql
-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE board.board ENABLE ROW LEVEL SECURITY;
ALTER TABLE board.element ENABLE ROW LEVEL SECURITY;
ALTER TABLE board.board_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab.comment ENABLE ROW LEVEL SECURITY;

-- Board access policy
CREATE POLICY board_access_policy ON board.board
    FOR ALL
    USING (
        deleted_at IS NULL AND (
            is_public = true
            OR created_by = current_setting('app.current_user_id', true)::uuid
            OR EXISTS (
                SELECT 1 FROM board.board_member bm
                WHERE bm.board_id = board.id
                AND bm.user_id = current_setting('app.current_user_id', true)::uuid
            )
            OR EXISTS (
                SELECT 1 FROM core.organization_member om
                WHERE om.organization_id = board.organization_id
                AND om.user_id = current_setting('app.current_user_id', true)::uuid
            )
        )
    );

-- Element access follows board access
CREATE POLICY element_access_policy ON board.element
    FOR ALL
    USING (
        deleted_at IS NULL AND EXISTS (
            SELECT 1 FROM board.board b
            WHERE b.id = board_id
            AND b.deleted_at IS NULL
            AND (
                b.is_public = true
                OR b.created_by = current_setting('app.current_user_id', true)::uuid
                OR EXISTS (
                    SELECT 1 FROM board.board_member bm
                    WHERE bm.board_id = b.id
                    AND bm.user_id = current_setting('app.current_user_id', true)::uuid
                )
            )
        )
    );

-- Edit policy (only editors and above can modify elements)
CREATE POLICY element_edit_policy ON board.element
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM board.board_member bm
            WHERE bm.board_id = board_id
            AND bm.user_id = current_setting('app.current_user_id', true)::uuid
            AND bm.role IN ('owner', 'admin', 'editor')
        )
    );

-- Comment access policy
CREATE POLICY comment_access_policy ON collab.comment
    FOR ALL
    USING (
        deleted_at IS NULL AND EXISTS (
            SELECT 1 FROM board.board b
            WHERE b.id = board_id
            AND b.deleted_at IS NULL
            AND (
                b.is_public = true
                OR EXISTS (
                    SELECT 1 FROM board.board_member bm
                    WHERE bm.board_id = b.id
                    AND bm.user_id = current_setting('app.current_user_id', true)::uuid
                    AND bm.role IN ('owner', 'admin', 'editor', 'commenter')
                )
            )
        )
    );
```

---

### 8️⃣ Performance Optimization

```sql
-- ============================================================================
-- MATERIALIZED VIEWS FOR PERFORMANCE
-- ============================================================================

-- Board statistics materialized view
CREATE MATERIALIZED VIEW board.board_stats AS
SELECT 
    b.id AS board_id,
    b.name,
    b.organization_id,
    b.created_by,
    b.element_count,
    COUNT(DISTINCT bm.user_id) AS member_count,
    COUNT(DISTINCT c.id) FILTER (WHERE c.deleted_at IS NULL) AS comment_count,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'open') AS open_comment_count,
    b.created_at,
    b.updated_at,
    b.last_edited_at
FROM board.board b
LEFT JOIN board.board_member bm ON bm.board_id = b.id
LEFT JOIN collab.comment c ON c.board_id = b.id
WHERE b.deleted_at IS NULL
GROUP BY b.id;

CREATE UNIQUE INDEX ON board.board_stats(board_id);
CREATE INDEX ON board.board_stats(organization_id);
CREATE INDEX ON board.board_stats(created_by);

-- Refresh function
CREATE OR REPLACE FUNCTION board.refresh_board_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY board.board_stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONNECTION POOLING SETTINGS (for application)
-- ============================================================================
/*
Recommended PgBouncer settings:
- pool_mode = transaction
- default_pool_size = 20
- max_client_conn = 1000
- server_idle_timeout = 600
*/

-- ============================================================================
-- VACUUM AND ANALYZE SETTINGS
-- ============================================================================
-- For high-write tables
ALTER TABLE board.element SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE collab.presence SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE audit.event_log SET (
    autovacuum_vacuum_scale_factor = 0.1
);
```

---


Dựa trên cấu trúc Database bạn đang có (đặc biệt là bảng core.organization), form điền thông tin (Onboarding Modal) sẽ cần thiết kế tinh gọn nhưng đủ để map dữ liệu vào 2 trường quan trọng: name và metadata.

Dưới đây là thiết kế chi tiết cho Form này:

1. Phác thảo giao diện (Wireframe)
Bạn nên thiết kế một Modal (cửa sổ nổi) nằm giữa màn hình, với bố cục như sau:

Plaintext

+---------------------------------------------------------------+
|  Tell us about your team                                      | <--- Title (H1)
|  ___________________________________________________________  |
|                                                               |
|  What's your team name?                                       | <--- Label 1
|  [ Rocket Studio                          ]                   | <--- Input Text
|  (e.g., Design Team, Acme Corp, Marketing)                    | <--- Helper text
|                                                               |
|  What kind of work do you do?                                 | <--- Label 2
|  [ Engineering / IT                       v ]                 | <--- Select/Dropdown
|                                                               |
|                                                               |
|                      [ Continue -> ]                          | <--- Submit Button
|                                                               |
+---------------------------------------------------------------+
2. Chi tiết từng trường (Input Fields)
A. Trường "Team Name"
UI Type: Input Text.

Label: "What's your team name?"

Validation:

Không được để trống.

Max length: 100 ký tự (do Schema quy định VARCHAR(100)).

Xử lý dữ liệu:

Giá trị này sẽ lưu vào cột core.organization.name.

Ẩn (Backend xử lý): Bạn không cần hiện trường nhập "Slug/URL". Từ cái tên user nhập (ví dụ "Rocket Studio"), Backend sẽ tự generate ra slug ("rocket-studio") để lưu vào DB.

B. Trường "Kind of work" (Lĩnh vực)
UI Type: Select (Dropdown) hoặc Combobox.

Label: "What kind of work do you do?"

Options (Gợi ý):

Engineering / IT

Design / Creative

Product Management

Marketing / Sales

Education

Other

Xử lý dữ liệu:

Giá trị chọn được (ví dụ: "engineering") sẽ được gói vào một JSON để lưu vào cột core.organization.metadata.

Lý do: Schema của bạn dùng JSONB cho metadata, nên việc dùng Dropdown giúp chuẩn hóa dữ liệu (tránh việc người thì nhập "IT", người nhập "Dev", người nhập "Coder").

3. Logic gửi dữ liệu (Frontend Payload)
Khi user bấm nút [ Continue ], Frontend sẽ gửi một cục JSON như sau về API:

JSON

// POST /api/v1/onboarding/create-team
{
  "teamName": "Rocket Studio",
  "industry": "engineering",  // Giá trị lấy từ Dropdown
  "size": "1-10"              // (Optional) Nếu bạn muốn hỏi thêm quy mô team
}
4. Logic lưu vào Database (Backend Mapping)
Backend nhận cục JSON trên và map vào câu lệnh SQL (như đã bàn ở câu trước):

Lấy "Rocket Studio" -> gán vào name.

Tự tạo slug "rocket-studio" -> gán vào slug.

Lấy "engineering" và "1-10" -> đóng gói lại thành JSON {"industry": "engineering", "size": "1-10"} -> gán vào metadata.

5. Gợi ý UX nâng cao (Optional)
Nếu bạn muốn form trông "xịn" hơn và tận dụng tối đa cái bảng metadata, bạn có thể thêm một bước nhỏ:

Thay Dropdown bằng các thẻ chọn (Selection Cards): Thay vì một list xổ xuống chán ngắt, hãy hiện các icon to đẹp:

[💻 Engineering]

[🎨 Design]

[📢 Marketing]

Hỏi thêm Use Case (nếu cần): "Bạn định dùng Board này để làm gì?" (Brainstorming, Flowchart, Agile...). Cái này cực tốt để sau này bạn gợi ý Template phù hợp cho họ. Thông tin này cũng nhét hết vào metadata.

Kết luận: Bạn chỉ cần đúng 2 input: Input Text (cho tên) và Dropdown/Select (cho metadata) là đủ để khởi tạo một Organization hoàn chỉnh trong Database của bạn.

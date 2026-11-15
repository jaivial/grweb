-- +goose Up
-- Transactional outbox: rows are written in the same transaction as the change and published to Redis Streams by the relay.
CREATE TABLE IF NOT EXISTS outbox (
    id           uuid PRIMARY KEY,
    type         text        NOT NULL,
    payload      jsonb       NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (id) WHERE published_at IS NULL;

-- Idempotent consumers: an event is handled once per consumer group.
CREATE TABLE IF NOT EXISTS processed_events (
    consumer     text        NOT NULL,
    event_id     uuid        NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer, event_id)
);

-- +goose Down
DROP TABLE IF EXISTS processed_events;
DROP TABLE IF EXISTS outbox;

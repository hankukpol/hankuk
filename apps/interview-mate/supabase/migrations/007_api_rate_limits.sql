CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INT NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at
  ON public.api_rate_limits(reset_at);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key TEXT,
  p_limit INT,
  p_window_ms INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window INTERVAL;
  v_bucket api_rate_limits%ROWTYPE;
  v_allowed BOOLEAN := false;
  v_retry_after_sec INT := 0;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RAISE EXCEPTION 'RATE_LIMIT_KEY_REQUIRED';
  END IF;

  IF p_limit <= 0 THEN
    RAISE EXCEPTION 'RATE_LIMIT_LIMIT_INVALID';
  END IF;

  IF p_window_ms <= 0 THEN
    RAISE EXCEPTION 'RATE_LIMIT_WINDOW_INVALID';
  END IF;

  v_window := p_window_ms * INTERVAL '1 millisecond';

  DELETE FROM api_rate_limits
  WHERE reset_at <= v_now - INTERVAL '1 day';

  LOOP
    SELECT *
    INTO v_bucket
    FROM api_rate_limits
    WHERE bucket_key = p_key
    FOR UPDATE;

    EXIT WHEN FOUND;

    BEGIN
      INSERT INTO api_rate_limits (
        bucket_key,
        request_count,
        reset_at,
        created_at,
        updated_at
      )
      VALUES (
        p_key,
        0,
        v_now + v_window,
        v_now,
        v_now
      );
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  IF v_bucket.reset_at <= v_now THEN
    UPDATE api_rate_limits
    SET request_count = 1,
        reset_at = v_now + v_window,
        updated_at = v_now
    WHERE bucket_key = p_key
    RETURNING *
    INTO v_bucket;

    v_allowed := true;
  ELSIF v_bucket.request_count >= p_limit THEN
    v_allowed := false;
  ELSE
    UPDATE api_rate_limits
    SET request_count = request_count + 1,
        updated_at = v_now
    WHERE bucket_key = p_key
    RETURNING *
    INTO v_bucket;

    v_allowed := true;
  END IF;

  v_retry_after_sec := GREATEST(
    CEIL(EXTRACT(EPOCH FROM (v_bucket.reset_at - v_now)))::INT,
    1
  );

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', p_limit,
    'remaining', CASE
      WHEN v_allowed THEN GREATEST(p_limit - v_bucket.request_count, 0)
      ELSE 0
    END,
    'resetAt', to_char(
      v_bucket.reset_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'retryAfterSec', v_retry_after_sec
  );
END;
$$;

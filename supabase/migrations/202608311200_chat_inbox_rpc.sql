-- Inbox de chat: agrega conversas em uma única query (substitui 4+ round-trips no app).

CREATE INDEX IF NOT EXISTS idx_chat_messages_empresa_created
  ON public.chat_messages (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_read_markers_usuario
  ON public.chat_read_markers (usuario_id);

CREATE OR REPLACE FUNCTION public.get_recent_chat_conversations()
RETURNS TABLE (
  type text,
  id uuid,
  name text,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_empresa_id uuid;
  v_nome text;
  v_mention text;
BEGIN
  SELECT u.id, u.empresa_id, u.nome_completo
  INTO v_user_id, v_empresa_id, v_nome
  FROM usuarios u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_user_id IS NULL OR v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  v_mention := '[' || replace(replace(v_nome, '%', '\%'), '_', '\_') || ']';

  RETURN QUERY
  WITH markers AS (
    SELECT m.context_type, m.context_id, m.last_read_at
    FROM chat_read_markers m
    WHERE m.usuario_id = v_user_id
  ),
  relevant_messages AS (
    SELECT
      m.context_type::text AS ctx_type,
      CASE
        WHEN m.context_type = 'direct' THEN
          CASE WHEN m.sender_id = v_user_id THEN m.context_id ELSE m.sender_id END
        ELSE m.context_id
      END AS peer_id,
      m.content,
      m.created_at,
      m.sender_id
    FROM chat_messages m
    WHERE m.empresa_id = v_empresa_id
      AND m.context_type <> 'global'
      AND m.context_id IS NOT NULL
      AND (
        m.context_type = 'direct'
        OR (
          m.context_type = 'card'
          AND (m.sender_id = v_user_id OR m.content LIKE '%' || v_mention || '%' ESCAPE '\')
        )
      )
  ),
  aggregated AS (
    SELECT
      rm.ctx_type,
      rm.peer_id,
      (array_agg(rm.content ORDER BY rm.created_at DESC))[1] AS last_msg,
      max(rm.created_at) AS last_at,
      count(*) FILTER (
        WHERE rm.sender_id <> v_user_id
          AND rm.created_at > coalesce(mrk.last_read_at, '1970-01-01'::timestamptz)
      )::bigint AS unread
    FROM relevant_messages rm
    LEFT JOIN markers mrk
      ON mrk.context_type = rm.ctx_type
     AND mrk.context_id = rm.peer_id::text
    GROUP BY rm.ctx_type, rm.peer_id
  ),
  active_conversations AS (
    SELECT
      a.ctx_type AS conv_type,
      a.peer_id AS conv_id,
      CASE
        WHEN a.ctx_type = 'card' THEN c.titulo
        ELSE u.nome_completo
      END AS conv_name,
      coalesce(a.last_msg, '') AS conv_last_message,
      a.last_at AS conv_last_message_at,
      a.unread AS conv_unread_count
    FROM aggregated a
    LEFT JOIN crm_cards c
      ON a.ctx_type = 'card' AND c.id = a.peer_id AND c.empresa_id = v_empresa_id
    LEFT JOIN usuarios u
      ON a.ctx_type = 'direct' AND u.id = a.peer_id AND u.empresa_id = v_empresa_id
    WHERE a.peer_id IS NOT NULL
  )
  SELECT ac.conv_type, ac.conv_id, ac.conv_name, ac.conv_last_message, ac.conv_last_message_at, ac.conv_unread_count
  FROM active_conversations ac
  UNION ALL
  SELECT
    'direct'::text,
    u.id,
    u.nome_completo,
    ''::text,
    '1970-01-01'::timestamptz,
    0::bigint
  FROM usuarios u
  WHERE u.empresa_id = v_empresa_id
    AND u.id <> v_user_id
    AND NOT EXISTS (
      SELECT 1 FROM active_conversations ac
      WHERE ac.conv_type = 'direct' AND ac.conv_id = u.id
    )
  ORDER BY conv_last_message_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_recent_chat_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_chat_conversations() TO authenticated;

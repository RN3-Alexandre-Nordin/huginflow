-- Habilita Realtime para cards do CRM (movimentação no kanban entre usuários).

ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_cards;

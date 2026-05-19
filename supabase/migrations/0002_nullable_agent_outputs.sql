-- 0002_nullable_agent_outputs.sql
--
-- El pipeline `runADAM()` usa `Promise.allSettled` para A1/A2/A3 con
-- resilience: cualquiera de los 3 puede caer y el pipeline sigue.
-- La migración 0001 declaró estas columnas como NOT NULL, lo cual
-- contradice la realidad arquitectónica y hacía fallar silenciosamente
-- el insert en /api/agents/run cuando algún agente caía o cuando el
-- endpoint pasaba null por no exponer aún los intermedios.
--
-- Esta migración permite NULL en los outputs de A1/A2/A3.
-- `a4_output` se mantiene NOT NULL: si A4 cae, no hay run que loguear
-- (el pipeline lanza A4FailedError antes de llegar al insert).

alter table public.analyses_log alter column a1_output drop not null;
alter table public.analyses_log alter column a2_output drop not null;
alter table public.analyses_log alter column a3_output drop not null;

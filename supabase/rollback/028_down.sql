-- Rollback da migration 028 (D-084): tira a opção "Cliente chegou" do salão. A tela volta a
-- oferecer sempre "Cliente chegou" (o backend antigo não lê a coluna).
begin;
alter table public.empresas drop column if exists agenda_usa_chegada;
commit;

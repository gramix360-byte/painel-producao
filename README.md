# Painel de Produção

Sistema web para cadastro e acompanhamento de pedidos de brindes personalizados.

## Recursos

- Cadastro de pedidos com vários itens
- Painel de produção para TV/monitor
- Status Aguardando → Em produção → Finalizado
- Prioridade normal ou urgente
- Histórico e busca de pedidos
- Funcionamento offline com IndexedDB
- Fila de sincronização automática quando a internet volta
- Sincronização com Supabase
- PWA instalável no computador/celular

## Estrutura

O projeto é uma aplicação web estática (HTML/CSS/JavaScript), sem etapa de build. Pode ser hospedado gratuitamente no GitHub Pages ou Cloudflare Pages.

## Banco de dados

O backend utiliza Supabase com as tabelas `orders` e `order_items`.

> A chave utilizada no navegador é a chave pública/anon do Supabase. Nunca coloque uma service role key neste repositório.

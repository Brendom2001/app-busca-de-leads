# LeadHunter — Prospecção Inteligente de Leads

App web para prospectar negócios locais que precisam de landing pages / sites profissionais.

## Como funciona

1. Busca negócios via **Google Maps (Serper API)**
2. Filtra por qualidade (rating ≥ 3.5, mínimo 10 avaliações)
3. Analisa a presença web de cada negócio
4. Classifica como: **Sem Site** / **Só Instagram** / **Site Fraco**
5. Gera score de oportunidade e mensagem de abordagem WhatsApp via **OpenAI GPT-4o-mini**

## Requisitos

- Node.js v18+
- Chaves de API: [Serper](https://serper.dev) + [OpenAI](https://platform.openai.com)

## Instalação

```bash
cd lead-prospector
npm install
```

## Configuração

O arquivo `.env` já está configurado com as chaves. Para usar suas próprias chaves, edite `.env`:

```env
SERPER_API_KEY=sua_chave_aqui
OPENAI_API_KEY=sua_chave_aqui
PORT=3000
```

## Rodando

```bash
# Produção
npm start

# Desenvolvimento (com hot-reload)
npm run dev
```

Acesse: **http://localhost:3000**

## Como usar

1. Digite a cidade/bairro (ex: `São Paulo - SP`)
2. Digite a categoria (ex: `clínica estética`, `dentista`, `advocacia`)
3. Escolha a quantidade de resultados (5–20)
4. Clique em **Buscar Leads**
5. Use os filtros para navegar entre os tipos de lead
6. Copie a mensagem de abordagem com um clique

## Classificação de presença web

| Status | Descrição |
|---|---|
| 🔴 Sem Site | Campo website vazio no Google |
| 🟣 Só Instagram | Website aponta para redes sociais |
| 🟡 Site Fraco | Site existe mas é simples demais |

Negócios com site bom (SITE_DECENTE) são automaticamente excluídos — não são leads.

## Stack

- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/JS vanilla (arquivo único)
- **APIs**: Serper (Google Maps), OpenAI GPT-4o-mini

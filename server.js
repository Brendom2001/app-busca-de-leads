require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('[DEBUG] SERPER_API_KEY:', SERPER_API_KEY ? `${SERPER_API_KEY.substring(0, 6)}...` : 'UNDEFINED');
console.log('[DEBUG] OPENAI_API_KEY:', OPENAI_API_KEY ? 'OK' : 'UNDEFINED');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const SOCIAL_DOMAINS = [
  'instagram.com', 'linktr.ee', 'linktree.com', 'bio.link',
  'beacons.ai', 'facebook.com', 'wa.me', 'whatsapp.com',
  'twitter.com', 'x.com', 'tiktok.com', 'youtube.com'
];

function normalizeUrl(url) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

async function classifyWebPresence(rawUrl) {
  if (!rawUrl) return 'SEM_SITE';

  const urlLower = rawUrl.toLowerCase();
  if (SOCIAL_DOMAINS.some(d => urlLower.includes(d))) return 'SÓ_INSTAGRAM';

  const url = normalizeUrl(rawUrl);

  try {
    const response = await axios.get(url, {
      httpsAgent,
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      maxRedirects: 3,
      responseType: 'text',
    });

    const html = typeof response.data === 'string' ? response.data : '';

    const hasViewport = /meta[^>]*name\s*=\s*["']viewport["']/i.test(html);
    const headingCount = (html.match(/<h[1-3][^>]*>/gi) || []).length;
    const sectionCount = (html.match(/<section[^>]*>/gi) || []).length;
    const hasForm = /<form[^>]*>/i.test(html);
    const hasContactKeyword = /contato|fale\s+conosco|agende|reserva|agendamento|orçamento/i.test(html);
    const hasNav = /<nav[^>]*>/i.test(html) || (html.match(/<a[^>]*href/gi) || []).length >= 5;

    const strongSignals = [hasViewport, hasForm || hasContactKeyword, headingCount >= 4 || sectionCount >= 3, hasNav].filter(Boolean).length;

    if (strongSignals >= 3) return 'SITE_DECENTE';
    return 'SITE_FRACO';
  } catch {
    return 'SITE_FRACO';
  }
}

async function scoreLeadsWithOpenAI(leads, category, city) {
  const leadsBlock = leads.map((l, i) => {
    const statusLabel = { SEM_SITE: 'SEM_SITE', 'SÓ_INSTAGRAM': 'SÓ_INSTAGRAM', SITE_FRACO: 'SITE_FRACO' }[l.webStatus] || l.webStatus;
    return [
      `[Lead ${i}]`,
      `id: ${i}`,
      `Nome: ${l.name}`,
      `Categoria: ${category}`,
      `Cidade: ${city}`,
      `Avaliação Google: ${l.rating ?? 'N/A'} (${l.ratingCount ?? 'N/A'} avaliações)`,
      `Presença web atual: ${statusLabel}`,
      `Website atual: ${l.website || '(nenhum)'}`,
    ].join('\n');
  }).join('\n\n');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Você é um especialista em copywriting de alta conversão para pequenos negócios no Brasil. Você escreve mensagens de WhatsApp que parecem enviadas por uma pessoa real — não um vendedor, não um bot. Suas mensagens funcionam porque atacam uma dor específica do negócio e terminam com uma pergunta que o lead não consegue ignorar.',
        },
        {
          role: 'user',
          content: `Para cada lead, gere uma mensagem de abordagem WhatsApp seguindo as regras abaixo.

REGRAS:
1. Máximo 4 linhas.
2. SEMPRE começar com "Oi" ou "Boa tarde" seguido do nome do negócio ou da pessoa responsável se disponível. Natural, como uma pessoa mandando mensagem.
3. Linha 2: uma observação específica e positiva sobre o negócio — nota no Google, tempo de mercado, nicho — algo que mostre que você pesquisou, não que jogou no template.
4. Linha 3: apresentar a consequência do problema de forma leve, sem atacar. Não dizer "você perde cliente", mas sim algo como "a maioria das buscas por [categoria] em [cidade] não te encontra ainda".
5. Linha 4: terminar com uma pergunta curiosa e aberta, que pressupõe que o lead já pensa nisso. Não perguntar SE quer, mas como está lidando.
6. Tom: curioso, leve, humano. Como um conhecido que notou algo e quer entender melhor — não um vendedor.
7. Nunca usar 'landing page'. Usar 'site', 'página própria' ou 'presença online'.
8. Máximo 1 emoji, opcional.
9. Português brasileiro informal e natural.

EXEMPLOS DO TOM EXATO:
- "Oi, [Nome]! Vi que a clínica tem ótimas avaliações no Google — impressionante. Só que quem pesquisa por [categoria] em [cidade] ainda não te encontra facilmente online. Como vocês estão recebendo pacientes novos hoje em dia?"
- "Boa tarde! A [Clínica X] aparece bem no Maps, mas sem um site próprio a maioria das buscas no Google acaba indo pro concorrente. Isso já apareceu como problema pra vocês?"
- "Oi! Vi que o [Nome] tem bastante avaliação positiva — negócio consolidado. Só percebi que a presença online ainda pode melhorar, e isso às vezes deixa cliente novo escapar. Vocês já pensaram nisso?"

LEADS:
${leadsBlock}

Retorne APENAS o JSON array, sem texto adicional:
[{"id": 0, "score": 8, "justification": "...", "whatsappMessage": "..."}]`,
        },
      ],
      temperature: 0.75,
      max_tokens: 2000,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const content = response.data.choices[0].message.content.trim();
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Resposta OpenAI inválida');
  return JSON.parse(match[0]);
}

app.post('/api/search', async (req, res) => {
  const { city, category, limit = 10 } = req.body;

  if (!city || !category) {
    return res.status(400).json({ error: 'Cidade e categoria são obrigatórios.' });
  }

  const maxResults = Math.min(Math.max(parseInt(limit) || 10, 5), 20);

  try {
    // 1. Busca via Serper Search
    let serperData;
    try {
      const serperRes = await axios.post(
        'https://google.serper.dev/search',
        { q: `${category} em ${city}`, gl: 'br', hl: 'pt', num: maxResults, type: 'search' },
        {
          headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
          timeout: 12000,
        }
      );
      serperData = serperRes.data;
    } catch (err) {
      if (err.response?.status === 401) return res.status(401).json({ error: 'Chave Serper inválida.' });
      if (err.response?.status === 403) {
        console.error('[SERPER 403]', JSON.stringify(err.response?.data));
        return res.status(403).json({ error: 'Serper recusou a requisição: ' + JSON.stringify(err.response?.data) });
      }
      if (err.response?.status === 429) return res.status(429).json({ error: 'Rate limit Serper.' });
      throw err;
    }

    const kg = serperData.knowledgeGraph || {};
    const organic = serperData.organic || [];
    if (organic.length === 0) {
      return res.json({ leads: [], total: 0, filtered: 0, message: 'Nenhum resultado encontrado para essa busca.' });
    }

    // 2. Filtrar: manter todos (organic não tem rating garantido)
    const qualified = organic;

    // 3. Classificar presença web (limita ao solicitado)
    const toProcess = qualified.slice(0, maxResults);
    const leadsRaw = [];

    await Promise.all(
      toProcess.map(async (place) => {
        const website = place.link || null;
        const webStatus = await classifyWebPresence(website);
        if (webStatus !== 'SITE_DECENTE') {
          leadsRaw.push({
            name: place.title || kg.title || 'Sem nome',
            address: kg.address || '',
            phone: kg.phoneNumber || kg.phone || null,
            rating: kg.rating || null,
            ratingCount: kg.ratingCount || null,
            website,
            snippet: place.snippet || '',
            webStatus,
          });
        }
      })
    );

    if (leadsRaw.length === 0) {
      return res.json({
        leads: [],
        total: organic.length,
        filtered: qualified.length,
        message: 'Todos os negócios encontrados já possuem boa presença web.',
      });
    }

    // 4. Score via OpenAI (máx 10 leads)
    const leadsToScore = leadsRaw.slice(0, 10);
    let scores = [];

    try {
      scores = await scoreLeadsWithOpenAI(leadsToScore, category, city);
    } catch (err) {
      if (err.response?.status === 401) return res.status(401).json({ error: 'Chave OpenAI inválida. Verifique o .env.' });
      if (err.response?.status === 429) return res.status(429).json({ error: 'Rate limit OpenAI atingido. Aguarde alguns segundos.' });
      // Fallback sem scores
      scores = leadsToScore.map((_, i) => ({
        id: i,
        score: 5,
        justification: 'Análise indisponível no momento',
        whatsappMessage: '',
      }));
    }

    // 5. Mesclar e ordenar por score
    const finalLeads = leadsToScore
      .map((lead, i) => {
        const scoreData = scores.find(s => s.id === i) || {
          score: 5,
          justification: '',
          whatsappMessage: '',
        };
        return { ...lead, ...scoreData };
      })
      .sort((a, b) => b.score - a.score);

    res.json({
      leads: finalLeads,
      total: organic.length,
      filtered: qualified.length,
    });
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Erro interno ao processar a busca. Tente novamente.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Lead Prospector rodando em http://localhost:${PORT}\n`);
});

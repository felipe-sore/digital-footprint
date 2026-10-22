'use strict';

const LABELS = {
  'site.title': ['Page title', 'Título da página'],
  'site.description': ['Meta description', 'Meta description'],
  'site.h1': ['Main heading (H1)', 'Título principal (H1)'],
  'site.ctas': ['Calls to action', 'Chamadas para ação'],
  'site.forms': ['Forms', 'Formulários'],
  'site.structured_data': ['Structured data', 'Dados estruturados'],
  'technical.js_rendered': ['Built by JavaScript', 'Montada por JavaScript'],
  'technical.https': ['HTTPS', 'HTTPS'],
  'technical.http_to_https': ['http redirects to https', 'http redireciona para https'],
  'technical.viewport': ['Mobile viewport', 'Adaptada ao celular (viewport)'],
  'technical.response_ms': ['Homepage response time', 'Tempo de resposta da home'],
  'technical.robots': ['robots.txt', 'robots.txt'],
  'technical.sitemap': ['Sitemap', 'Sitemap'],
  'technical.tag.ga4': ['Google Analytics 4', 'Google Analytics 4'],
  'technical.tag.gtm': ['Google Tag Manager', 'Google Tag Manager'],
  'technical.tag.hubspot': ['HubSpot', 'HubSpot'],
  'technical.tag.rdstation': ['RD Station', 'RD Station'],
  'technical.tag.hotjar': ['Hotjar', 'Hotjar'],
  'seo.sitemap_entries': ['Pages in the sitemap', 'Páginas no sitemap'],
  'seo.sitemap_files': ['Sitemaps in the index', 'Sitemaps no índice'],
  'seo.organic_traffic': ['Organic traffic per month', 'Tráfego orgânico por mês'],
  'seo.organic_keywords': ['Organic keywords', 'Palavras-chave orgânicas'],
  'seo.organic_search_visits': ['Organic search visits per month', 'Visitas de busca orgânica por mês'],
  'paid.tag.googleAds': ['Google Ads tag', 'Tag do Google Ads'],
  'paid.tag.metaPixel': ['Meta Pixel', 'Meta Pixel'],
  'paid.tag.linkedinInsight': ['LinkedIn Insight Tag', 'LinkedIn Insight Tag'],
  'paid.tag.tiktokPixel': ['TikTok Pixel', 'TikTok Pixel'],
  'paid.paid_traffic': ['Paid search traffic per month', 'Tráfego de busca paga por mês'],
  'paid.paid_keywords': ['Paid keywords', 'Palavras-chave pagas'],
  'paid.paid_cost_usd': ['Paid search spend per month', 'Investimento em busca paga por mês'],
  'paid.paid_search_visits': ['Paid search visits per month', 'Visitas de busca paga por mês'],
  'traffic.total_visits': ['Visits per month', 'Visitas por mês'],
  'traffic.no_data': ['Provider data', 'Dados do provedor'],
  'content.blog_link': ['Blog linked from the homepage', 'Blog com link na home'],
};

const SOCIAL_NAMES = { linkedin: 'LinkedIn', instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', x: 'X', tiktok: 'TikTok', whatsapp: 'WhatsApp' };

const UI = {
  en: {
    tagline: 'Public digital presence audit',
    sections: {
      overview: 'Overview', site: 'Website and UX', seo: 'SEO', social: 'Social media', paid: 'Paid media',
      content: 'Content', reputation: 'Reputation and social proof', technical: 'Technical performance',
      branding: 'Branding', traffic: 'Traffic channels', maturity: 'Digital maturity', conclusion: 'Executive summary',
    },
    levels: { initial: 'Initial', intermediate: 'Intermediate', advanced: 'Advanced', insufficient: 'Not enough data', not_identified: 'Not identified', not_scored: 'Not scored' },
    diag: { diagnosis: 'Diagnosis', evidence: 'Evidence', opportunity: 'Opportunity', risk: 'Risk' },
    yes: 'Yes', no: 'No', notOnHome: 'not found on the homepage', checkManually: 'not identified, check manually',
    est: 'est.', critical: 'Critical risk', complaints: 'Public complaints', sources: 'Sources', collected: 'Data collected',
    reviews: 'reviews', answered: 'answered', overall: 'Overall maturity', socialOnSite: (n) => `${n} on the site`,
    passFail: (p, f, u) => `${p} ok, ${f} missing${u ? `, ${u} not identified` : ''}`,
    legend: '~ marks a number modeled by a paid tool, with the tool, month and market. "est." marks our own estimate, with its basis. N/I means the source was blocked or the data was not found: it is not zero.',
    jsPage: 'This homepage is built by JavaScript. The reading below is partial, and what was not read is marked as not identified.',
    siteNotRead: 'The homepage was not read',
    notes: {
      not_in_html: () => 'not in the page HTML; a tag manager can load it later',
      js_page: () => 'the page is built by JavaScript; this reading is partial',
      no_link_home: () => 'no link on the homepage',
      http_no_answer: () => 'the http address did not answer',
      sitemap_unread: () => 'the sitemap could not be read',
      robots_disallow: () => 'robots.txt asks crawlers not to read the homepage',
      blocked: () => 'the site answered with an anti-bot page',
      unreachable: ({ error }) => `the site could not be reached${error ? ` (${error})` : ''}`,
      http_error: ({ status }) => `the site answered HTTP ${status}`,
      not_read: () => 'the site was not read',
      provider_failed: ({ provider, reason }) => `${provider}: the request failed (${reason})`,
      provider_no_data: ({ provider }) => `${provider}: no data for this domain and market`,
    },
  },
  'pt-BR': {
    tagline: 'Diagnóstico de presença digital pública',
    sections: {
      overview: 'Visão geral', site: 'Site e UX', seo: 'SEO', social: 'Redes sociais', paid: 'Mídia paga',
      content: 'Conteúdo estratégico', reputation: 'Reputação e prova social', technical: 'Performance técnica',
      branding: 'Branding', traffic: 'Canais de tráfego', maturity: 'Maturidade digital', conclusion: 'Conclusão executiva',
    },
    levels: { initial: 'Inicial', intermediate: 'Intermediário', advanced: 'Avançado', insufficient: 'Dados insuficientes', not_identified: 'Não identificado', not_scored: 'Sem nota' },
    diag: { diagnosis: 'Diagnóstico', evidence: 'Evidência', opportunity: 'Oportunidade', risk: 'Risco' },
    yes: 'Sim', no: 'Não', notOnHome: 'não encontrado na home', checkManually: 'não identificado, verificar manualmente',
    est: 'est.', critical: 'Risco crítico', complaints: 'Reclamações públicas', sources: 'Fontes', collected: 'Dados coletados em',
    reviews: 'avaliações', answered: 'respondidas', overall: 'Maturidade geral', socialOnSite: (n) => `${n} no site`,
    passFail: (p, f, u) => `${p} ok, ${f} ausentes${u ? `, ${u} não identificados` : ''}`,
    legend: '~ indica número modelado por ferramenta paga, com a ferramenta, o mês e o mercado. "est." indica estimativa nossa, com a base do cálculo. N/I significa fonte bloqueada ou dado não encontrado: não é zero.',
    jsPage: 'Esta home é montada por JavaScript. A leitura abaixo é parcial, e o que não foi lido aparece como não identificado.',
    siteNotRead: 'A home não foi lida',
    notes: {
      not_in_html: () => 'não está no HTML da página; um gerenciador de tags pode carregá-la depois',
      js_page: () => 'a página é montada por JavaScript; esta leitura é parcial',
      no_link_home: () => 'sem link na home',
      http_no_answer: () => 'o endereço http não respondeu',
      sitemap_unread: () => 'não foi possível ler o sitemap',
      robots_disallow: () => 'o robots.txt pede que robôs não leiam a home',
      blocked: () => 'o site respondeu com uma página anti-robô',
      unreachable: ({ error }) => `não foi possível acessar o site${error ? ` (${error})` : ''}`,
      http_error: ({ status }) => `o site respondeu HTTP ${status}`,
      not_read: () => 'o site não foi lido',
      provider_failed: ({ provider, reason }) => `${provider}: a consulta falhou (${reason})`,
      provider_no_data: ({ provider }) => `${provider}: sem dados para este domínio e mercado`,
    },
  },
};

const PROVIDER_SUFFIX = /\.(semrush|similarweb|dataforseo)$/;

function labelFor(item, lang) {
  if (item.label) return item.label;
  const i = lang === 'pt-BR' ? 1 : 0;
  const base = item.id.replace(PROVIDER_SUFFIX, '');
  if (LABELS[base]) return LABELS[base][i];
  const social = base.match(/^social\.([a-z]+)\.link$/);
  if (social) return UI[lang].socialOnSite(SOCIAL_NAMES[social[1]] || social[1]);
  return item.id;
}

function strings(lang) {
  if (!UI[lang]) throw new Error(`unknown language "${lang}" (use en or pt-BR)`);
  return UI[lang];
}

module.exports = { strings, labelFor, LANGS: Object.keys(UI) };

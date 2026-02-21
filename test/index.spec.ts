import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker, {
  canonicalModule,
  toCoarseModule,
  detectPreferredModule,
  extractEntities,
  checkHardEscalation,
  isGreetingOnly,
  isThanksOnly,
  detectLanguage,
  normalizeSupportResponse,
  extractJsonBlock,
  clamp01,
  routeFor,
  augmentSignals,
} from '../src/index';

/* ------------------------------------------------------------------ */
/*  canonicalModule                                                     */
/* ------------------------------------------------------------------ */
describe('canonicalModule', () => {
  it('maps known sujets to coarse module', () => {
    expect(canonicalModule('templates')).toBe('builder');
    expect(canonicalModule('theme')).toBe('builder');
  });

  it('returns identity for already-coarse modules', () => {
    expect(canonicalModule('orders')).toBe('orders');
    expect(canonicalModule('builder')).toBe('builder');
    expect(canonicalModule('settings')).toBe('settings');
    expect(canonicalModule('payments')).toBe('payments');
  });

  it('returns "general" for unknown input', () => {
    expect(canonicalModule('')).toBe('general');
    expect(canonicalModule('xyzzy')).toBe('general');
  });
});

/* ------------------------------------------------------------------ */
/*  toCoarseModule                                                     */
/* ------------------------------------------------------------------ */
describe('toCoarseModule', () => {
  it('keeps already-coarse module names', () => {
    expect(toCoarseModule('orders')).toBe('orders');
    expect(toCoarseModule('builder')).toBe('builder');
    expect(toCoarseModule('products')).toBe('products');
    expect(toCoarseModule('shipping')).toBe('shipping');
    expect(toCoarseModule('payments')).toBe('payments');
    expect(toCoarseModule('pos')).toBe('pos');
    expect(toCoarseModule('technical')).toBe('technical');
    expect(toCoarseModule('auth')).toBe('auth');
    expect(toCoarseModule('inventory')).toBe('inventory');
    expect(toCoarseModule('notifications')).toBe('notifications');
  });

  it('maps fine-grained to coarse', () => {
    expect(toCoarseModule('template')).toBe('builder');
    expect(toCoarseModule('templates')).toBe('builder');
    expect(toCoarseModule('content')).toBe('builder');
    expect(toCoarseModule('domain')).toBe('settings');
    expect(toCoarseModule('ssl')).toBe('settings');
    expect(toCoarseModule('dns')).toBe('settings');
    // New expanded taxonomy
    expect(toCoarseModule('login')).toBe('auth');
    expect(toCoarseModule('password')).toBe('auth');
    expect(toCoarseModule('otp')).toBe('auth');
    expect(toCoarseModule('stock')).toBe('inventory');
    expect(toCoarseModule('inventaire')).toBe('inventory');
    expect(toCoarseModule('notification')).toBe('notifications');
    expect(toCoarseModule('bug')).toBe('technical');
    expect(toCoarseModule('crash')).toBe('technical');
    expect(toCoarseModule('incident')).toBe('technical');
  });

  it('handles edge cases: null, undefined, empty, "unclear"', () => {
    expect(toCoarseModule(null)).toBe('general');
    expect(toCoarseModule(undefined)).toBe('general');
    expect(toCoarseModule('')).toBe('general');
    expect(toCoarseModule('unclear')).toBe('general');
  });

  it('is case-insensitive', () => {
    expect(toCoarseModule('ORDERS')).toBe('orders');
    expect(toCoarseModule('Builder')).toBe('builder');
    expect(toCoarseModule('SSL')).toBe('settings');
  });
});

/* ------------------------------------------------------------------ */
/*  detectPreferredModule                                              */
/* ------------------------------------------------------------------ */
describe('detectPreferredModule', () => {
  it('detects orders from French keywords', () => {
    const r = detectPreferredModule('Ma commande est en retard', []);
    expect(r.module).toBe('orders');
    expect(r.score).toBeGreaterThan(0);
  });

  it('detects builder from template keywords', () => {
    const r = detectPreferredModule('Je veux modifier mon template', []);
    expect(r.module).toBe('builder');
  });

  it('detects products from product keywords', () => {
    const r = detectPreferredModule('Comment ajouter un produit ?', []);
    expect(r.module).toBe('products');
  });

  it('detects settings from domain keywords', () => {
    const r = detectPreferredModule('Mon domaine ne fonctionne plus', []);
    expect(r.module).toBe('settings');
  });

  it('returns general for vague messages', () => {
    const r = detectPreferredModule('aide svp', []);
    expect(r.module).toBe('general');
  });

  it('uses conversation history context', () => {
    const history = [
      { role: 'user' as const, content: 'probleme commande' },
      { role: 'assistant' as const, content: 'Quel est le numero?' },
    ];
    const r = detectPreferredModule("c'est #12345", history);
    expect(r.module).toBe('orders');
  });
});

/* ------------------------------------------------------------------ */
/*  extractEntities                                                    */
/* ------------------------------------------------------------------ */
describe('extractEntities', () => {
  it('extracts URL', () => {
    const e = extractEntities('Mon site https://mystore.tiktak.space ne marche pas');
    expect(e.url).toBe('https://mystore.tiktak.space');
  });

  it('extracts domain', () => {
    const e = extractEntities('Le domaine example.com est down');
    expect(e.domain).toBe('example.com');
  });

  it('extracts order ID with # prefix', () => {
    const e = extractEntities('Commande #12345 pas livree');
    expect(e.order_id).toBe('12345');
  });

  it('extracts order ID with "commande" prefix', () => {
    const e = extractEntities('Ma commande 98765 est bloquee');
    expect(e.order_id).toBe('98765');
  });

  it('extracts SKU', () => {
    const e = extractEntities('Le produit SKU: ABC-123 est indisponible');
    expect(e.sku_or_product).toBe('ABC-123');
  });

  it('extracts payment method', () => {
    const e = extractEntities('Je veux payer par stripe');
    expect(e.payment_method).toBe('stripe');
  });

  it('extracts error message from quotes', () => {
    const e = extractEntities('Je vois "Internal Server Error 500 something"');
    expect(e.error_message).toBe('Internal Server Error 500 something');
  });

  it('returns empty for clean messages', () => {
    const e = extractEntities('Bonjour');
    expect(e.url).toBeUndefined();
    expect(e.order_id).toBeUndefined();
    expect(e.sku_or_product).toBeUndefined();
  });

  it('handles empty input', () => {
    const e = extractEntities('');
    expect(Object.keys(e).length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  checkHardEscalation                                                */
/* ------------------------------------------------------------------ */
describe('checkHardEscalation', () => {
  it('triggers on 500 error', () => {
    const r = checkHardEscalation('Mon site affiche une 500 error');
    expect(r.triggered).toBe(true);
    expect(r.reason).toContain('5xx');
  });

  it('triggers on 502 error', () => {
    expect(checkHardEscalation('erreur 502').triggered).toBe(true);
  });

  it('triggers on internal server error', () => {
    expect(checkHardEscalation('I get Internal Server Error').triggered).toBe(true);
  });

  it('triggers on service unavailable', () => {
    expect(checkHardEscalation('The service unavailable page').triggered).toBe(true);
  });

  it('triggers on panne systeme', () => {
    const r = checkHardEscalation('Il y a une panne totale');
    expect(r.triggered).toBe(true);
  });

  it('triggers on erreur serveur', () => {
    expect(checkHardEscalation('erreur serveur sur le site').triggered).toBe(true);
  });

  it('does NOT trigger on regular problems', () => {
    expect(checkHardEscalation('Ma commande est en retard').triggered).toBe(false);
    expect(checkHardEscalation('Je ne peux pas modifier mon template').triggered).toBe(false);
    expect(checkHardEscalation('Comment changer mon mot de passe?').triggered).toBe(false);
  });

  it('returns empty reason when not triggered', () => {
    const r = checkHardEscalation('question normale');
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/*  isGreetingOnly                                                     */
/* ------------------------------------------------------------------ */
describe('isGreetingOnly', () => {
  it('detects "bonjour"', () => {
    expect(isGreetingOnly('bonjour')).toBe(true);
    expect(isGreetingOnly('Bonjour')).toBe(true);
  });

  it('detects "hello"', () => {
    expect(isGreetingOnly('hello')).toBe(true);
  });

  it('detects "salam"', () => {
    expect(isGreetingOnly('salam')).toBe(true);
  });

  it('does NOT trigger on greeting + long question', () => {
    expect(isGreetingOnly('bonjour je voudrais savoir comment creer un produit')).toBe(false);
  });

  it('allows greeting with 1-2 extra words', () => {
    expect(isGreetingOnly('salut toi')).toBe(true);
  });

  it('rejects messages >3 words even with greeting', () => {
    expect(isGreetingOnly('bonjour comment ca va bien')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  isThanksOnly                                                       */
/* ------------------------------------------------------------------ */
describe('isThanksOnly', () => {
  it('detects "merci"', () => {
    expect(isThanksOnly('merci')).toBe(true);
    expect(isThanksOnly('Merci')).toBe(true);
  });

  it('detects "thanks"', () => {
    expect(isThanksOnly('thanks')).toBe(true);
  });

  it('detects "merci beaucoup"', () => {
    expect(isThanksOnly('merci beaucoup')).toBe(true);
  });

  it('does NOT trigger on thanks + more context', () => {
    expect(isThanksOnly("merci mais j'ai encore un probleme avec ma commande")).toBe(false);
  });

  it('rejects messages >6 words with real content', () => {
    expect(isThanksOnly('merci beaucoup mais le problème est toujours là')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  detectLanguage                                                     */
/* ------------------------------------------------------------------ */
describe('detectLanguage', () => {
  it('detects French (default)', () => {
    expect(detectLanguage('Je veux modifier ma commande')).toBe('fr');
  });

  it('detects Arabic script', () => {
    expect(detectLanguage('\u0645\u0631\u062D\u0628\u0627 \u0643\u064A\u0641 \u0627\u0644\u062D\u0627\u0644')).toBe('ar');
  });

  it('detects Darija / Arabizi', () => {
    expect(detectLanguage('chnou lmochkil m3a lcommande')).toBe('darija');
    expect(detectLanguage('kifech nbadel template')).toBe('darija');
  });

  it('detects English', () => {
    expect(detectLanguage('How can I change the template?')).toBe('en');
    expect(detectLanguage('Please help me with this issue')).toBe('en');
  });

  it('defaults to French for ambiguous text', () => {
    expect(detectLanguage('commande probleme')).toBe('fr');
  });

  it('handles empty input', () => {
    expect(detectLanguage('')).toBe('fr');
  });
});

/* ------------------------------------------------------------------ */
/*  normalizeSupportResponse                                           */
/* ------------------------------------------------------------------ */
describe('normalizeSupportResponse', () => {
  it('fills defaults for empty input', () => {
    const r = normalizeSupportResponse({});
    expect(r.mode).toBe('clarify');
    expect(r.answer).toBe('');
    expect(r.signals).toBeDefined();
    expect(r.signals.confidence).toBe(0);
    expect(r.context).toBe('general');
  });

  it('preserves mode and answer', () => {
    const r = normalizeSupportResponse({ mode: 'solve', answer: 'Voici la solution.' });
    expect(r.mode).toBe('solve');
    expect(r.answer).toBe('Voici la solution.');
  });

  it('passes through P0 new fields', () => {
    const r = normalizeSupportResponse({
      ticket_type: 'bug',
      sentiment: 'frustrated',
      severity: 'high',
      detected_language: 'fr',
      processing_time_ms: 450,
    });
    expect(r.ticket_type).toBe('bug');
    expect(r.sentiment).toBe('frustrated');
    expect(r.severity).toBe('high');
    expect(r.detected_language).toBe('fr');
    expect(r.processing_time_ms).toBe(450);
  });

  it('normalizes preferredModule from context', () => {
    const r = normalizeSupportResponse({ context: 'templates' });
    expect(r.preferredModule).toBe('builder');
    expect(r.context).toBe('builder');
  });

  it('generates answer from questions when answer missing', () => {
    const r = normalizeSupportResponse({
      mode: 'clarify',
      questions: ['Quel est votre domaine?', 'Quel navigateur?'],
    });
    expect(r.answer).toContain('Quel est votre domaine?');
    expect(r.answer).toContain('Quel navigateur?');
  });

  it('generates escalation answer when mode=escalate and no answer', () => {
    const r = normalizeSupportResponse({ mode: 'escalate' });
    expect(r.answer).toContain('escalader');
  });

  it('includes evidence if present', () => {
    const r = normalizeSupportResponse({ evidence: [{ source: 'playbook', text: 'test' }] });
    expect(r.evidence).toHaveLength(1);
  });

  it('does not include evidence if absent', () => {
    const r = normalizeSupportResponse({ mode: 'solve', answer: 'ok' });
    expect(r.evidence).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  extractJsonBlock                                                   */
/* ------------------------------------------------------------------ */
describe('extractJsonBlock', () => {
  it('extracts JSON from markdown code fence', () => {
    const raw = 'Here is the result:\n```json\n{"answer":"hello"}\n```\nDone.';
    const result = extractJsonBlock(raw);
    expect(result).toBe('{"answer":"hello"}');
  });

  it('extracts plain JSON object', () => {
    const raw = 'Some text {"key":"value"} more text';
    const result = extractJsonBlock(raw);
    expect(result).toContain('{"key":"value"}');
  });

  it('returns null for no JSON', () => {
    expect(extractJsonBlock('just plain text')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  clamp01                                                            */
/* ------------------------------------------------------------------ */
describe('clamp01', () => {
  it('clamps values to [0, 1]', () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-0.3)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
  });

  it('handles NaN', () => {
    expect(clamp01(NaN)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  routeFor                                                           */
/* ------------------------------------------------------------------ */
describe('routeFor', () => {
  it('returns route for known context', () => {
    const route = routeFor('orders', undefined);
    expect(route).toBeTruthy();
    expect(typeof route).toBe('string');
  });

  it('returns null for unknown context', () => {
    expect(routeFor('nonexistent_xyz', undefined)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  augmentSignals                                                     */
/* ------------------------------------------------------------------ */
describe('augmentSignals', () => {
  it('bumps severity from low to medium on urgent message', () => {
    const signals = { severity: 'low' };
    augmentSignals(signals, { message: "C'est urgent!" });
    expect(signals.severity).toBe('medium');
  });

  it('does not bump severity when already high', () => {
    const signals = { severity: 'high' };
    augmentSignals(signals, { message: 'urgent please' });
    expect(signals.severity).toBe('high');
  });

  it('does not modify when no urgency keywords', () => {
    const signals = { severity: 'low' };
    augmentSignals(signals, { message: 'Ma commande est en retard' });
    expect(signals.severity).toBe('low');
  });
});

/* ------------------------------------------------------------------ */
/*  Integration: Worker HTTP routes                                    */
/* ------------------------------------------------------------------ */
describe('Worker HTTP', () => {
  it('returns non-500 on GET /', async () => {
    const response = await SELF.fetch('https://example.com/');
    expect(response.status).toBeLessThan(500);
  });

  it('returns 404 on unknown path', async () => {
    const response = await SELF.fetch('https://example.com/nonexistent');
    expect(response.status).toBe(404);
  });

  it('handles OPTIONS preflight', async () => {
    const response = await SELF.fetch('https://example.com/chat', {
      method: 'OPTIONS',
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });
});

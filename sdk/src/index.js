// FeatureTrack JavaScript SDK — works in browsers and Node.js 18+ (uses global fetch).
//
//   import { FeatureTrack } from '@featuretrack/sdk';
//   const ft = new FeatureTrack({ apiKey: 'ft_live_…', host: 'https://api.featuretrack.dev' });
//   ft.identify('user_123', { email: 'jane@example.com', plan: 'pro' });
//   ft.track('checkout_started', { cart_value: 129.5 });
//   if (await ft.isEnabled('new-checkout')) ft.featureExposed('new-checkout');
//   await ft.shutdown();

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class FeatureTrackError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class FeatureTrack {
  /**
   * @param {object} options
   * @param {string} options.apiKey     Environment API key (ft_dev_ / ft_stg_ / ft_live_)
   * @param {string} [options.host]     API base URL (default http://localhost:4000)
   * @param {number} [options.flushAt]  Flush when this many events are queued (default 20, max 100)
   * @param {number} [options.flushInterval] Flush every N ms (default 5000)
   * @param {number} [options.maxRetries]    Retries for network/5xx/429 errors (default 3)
   * @param {number} [options.maxQueueSize]  Drop oldest events beyond this size (default 1000)
   * @param {boolean} [options.persist] Persist anonymous id in localStorage (browser, default true)
   * @param {(err: Error) => void} [options.onError]
   * @param {typeof fetch} [options.fetch]
   */
  constructor({ apiKey, host = 'http://localhost:4000', flushAt = 20, flushInterval = 5000, maxRetries = 3, maxQueueSize = 1000, persist = true, onError, fetch: fetchImpl, debug = false } = {}) {
    if (!apiKey) throw new Error('FeatureTrack: apiKey is required');
    this.apiKey = apiKey;
    this.host = host.replace(/\/$/, '');
    this.flushAt = Math.min(Math.max(1, flushAt), 100);
    this.flushInterval = flushInterval;
    this.maxRetries = maxRetries;
    this.maxQueueSize = maxQueueSize;
    this.onError = onError || ((err) => debug && console.warn('[FeatureTrack]', err.message));
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.debug = debug;
    this.queue = [];
    this.flags = null;
    this.flagsFetchedAt = 0;
    this.superProperties = {};
    this.persist = persist && isBrowser && typeof localStorage !== 'undefined';
    this.anonymousId = this._load('ft_anon_id') || uuid();
    this._save('ft_anon_id', this.anonymousId);
    this.userId = this._load('ft_user_id') || null;
    this.traits = {};
    this.timer = flushInterval > 0 ? setInterval(() => this.flush().catch(() => {}), flushInterval) : null;
    if (this.timer?.unref) this.timer.unref();
    if (isBrowser) {
      window.addEventListener('pagehide', () => this._beaconFlush());
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this._beaconFlush());
    }
  }

  get distinctId() {
    return this.userId || this.anonymousId;
  }

  /** Associates subsequent events with a known user and records traits. */
  identify(userId, traits = {}) {
    if (!userId) throw new Error('FeatureTrack.identify: userId is required');
    this.userId = String(userId);
    this._save('ft_user_id', this.userId);
    this.traits = { ...this.traits, ...traits };
    this.flags = null; // targeting may change
    return this._enqueue({ type: 'identify', distinctId: this.userId, anonymousId: this.anonymousId, traits });
  }

  /** Properties merged into every subsequent event. */
  register(properties) {
    Object.assign(this.superProperties, properties);
  }

  /** Records an event. Options: distinctId (server-side), timestamp, messageId. */
  track(event, properties = {}, options = {}) {
    if (!event) throw new Error('FeatureTrack.track: event name is required');
    const context = { library: { name: '@featuretrack/sdk', version: '1.0.0' } };
    if (isBrowser) Object.assign(context, { page: { url: location.href, path: location.pathname, referrer: document.referrer, title: document.title }, userAgent: navigator.userAgent, locale: navigator.language });
    return this._enqueue({
      type: 'track',
      event,
      distinctId: options.distinctId || this.distinctId,
      properties: { ...this.superProperties, ...properties },
      timestamp: options.timestamp ? new Date(options.timestamp).toISOString() : new Date().toISOString(),
      messageId: options.messageId || uuid(),
      context,
    });
  }

  /** Records that a user saw / was given access to a feature. */
  featureExposed(featureKey, properties = {}, options = {}) {
    return this.track('$feature_exposed', { ...properties, feature: featureKey }, options);
  }

  /** Records that a user actually used a feature (counts toward adoption). */
  featureUsed(featureKey, properties = {}, options = {}) {
    return this.track('$feature_used', { ...properties, feature: featureKey }, options);
  }

  /** Evaluates feature flags for the current (or given) user. Cached for 60s. */
  async getFlags({ distinctId, properties, force = false } = {}) {
    const id = distinctId || this.distinctId;
    if (!force && !distinctId && this.flags && Date.now() - this.flagsFetchedAt < 60_000) return this.flags;
    const res = await this._request('/v1/flags', { distinctId: id, properties: { ...this.traits, ...properties } });
    if (!distinctId) {
      this.flags = res.flags;
      this.flagsFetchedAt = Date.now();
    }
    return res.flags;
  }

  /** True if the feature flag is enabled. Optionally records an exposure automatically. */
  async isEnabled(featureKey, { distinctId, properties, trackExposure = true } = {}) {
    try {
      const flags = await this.getFlags({ distinctId, properties });
      const enabled = !!flags[featureKey];
      if (enabled && trackExposure) this.featureExposed(featureKey, { source: 'flag' }, { distinctId });
      return enabled;
    } catch (err) {
      this.onError(err);
      return false;
    }
  }

  /** Clears the identified user (e.g. on logout) and starts a new anonymous id. */
  reset() {
    this.userId = null;
    this.traits = {};
    this.flags = null;
    this.anonymousId = uuid();
    this._save('ft_anon_id', this.anonymousId);
    this._save('ft_user_id', null);
  }

  /** Sends queued events now. Resolves with the server response of the last batch. */
  async flush() {
    if (this._flushing) return this._flushing;
    this._flushing = (async () => {
      let last = null;
      while (this.queue.length) {
        const batch = this.queue.splice(0, 100);
        try {
          last = await this._request('/v1/batch', { batch });
          const rejected = last.results?.filter((r) => r.status === 'rejected') || [];
          if (rejected.length) this.onError(new FeatureTrackError(`${rejected.length} event(s) rejected: ${JSON.stringify(rejected[0].errors)}`, 422, rejected));
        } catch (err) {
          // Re-queue on retryable failure (messageIds keep retries idempotent server-side).
          if (!err.status || err.status >= 500 || err.status === 429) this.queue.unshift(...batch);
          this.onError(err);
          break;
        }
      }
      return last;
    })();
    try {
      return await this._flushing;
    } finally {
      this._flushing = null;
    }
  }

  /** Flushes and stops timers. Call before a Node.js process exits. */
  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }

  _enqueue(message) {
    this.queue.push(message);
    if (this.queue.length > this.maxQueueSize) this.queue.splice(0, this.queue.length - this.maxQueueSize);
    if (this.queue.length >= this.flushAt) this.flush().catch(() => {});
    return message.messageId;
  }

  async _request(path, body) {
    let attempt = 0;
    for (;;) {
      try {
        const res = await this.fetch(`${this.host}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
          keepalive: isBrowser,
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) return json;
        const error = new FeatureTrackError(json?.error?.message || `HTTP ${res.status}`, res.status, json);
        if ((res.status >= 500 || res.status === 429) && attempt < this.maxRetries) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(retryAfter ? retryAfter * 1000 : 2 ** attempt * 500);
          attempt++;
          continue;
        }
        throw error;
      } catch (err) {
        if (err instanceof FeatureTrackError) throw err;
        if (attempt >= this.maxRetries) throw err;
        await sleep(2 ** attempt * 500);
        attempt++;
      }
    }
  }

  _beaconFlush() {
    if (!this.queue.length || typeof fetch === 'undefined') return;
    const batch = this.queue.splice(0, 100);
    fetch(`${this.host}/v1/batch`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ batch }) }).catch(() => this.queue.unshift(...batch));
  }

  _load(k) {
    try {
      return this.persist ? localStorage.getItem(k) : null;
    } catch {
      return null;
    }
  }

  _save(k, v) {
    try {
      if (!this.persist) return;
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  }
}

export default FeatureTrack;

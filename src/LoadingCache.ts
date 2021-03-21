export interface LoadingCacheOptions<K, V> {
  expireAfterWrite?: number;
  expireAfterAccess?: number;
  refreshAfterWrite?: number;
  onRemove?: (entry: [K, V], cause: RemovalCause) => void;

  loader: (key: K) => V | Promise<V>;
}

export enum RemovalCause {
  EXPLICIT_DELETE = 'EXPLICIT_DELETE',
  EXPIRED = 'EXPIRED',
  REPLACED = 'REPLACED',
}

export class LoadingCache<K, V> {
  protected cache = new Map<K, V>();
  protected options: LoadingCacheOptions<K, V>;
  protected afterAccessExpirationTimers = new Map<K, ReturnType<typeof setTimeout>>();
  protected afterWriteExpirationTimers = new Map<K, ReturnType<typeof setTimeout>>();
  protected refreshAfterWriteTimers = new Map<K, ReturnType<typeof setInterval>>();

  constructor(
    optionsOrLoader: LoadingCacheOptions<K, V> | LoadingCacheOptions<K, V>['loader']
  ) {
    this.options =
      typeof optionsOrLoader === 'function'
        ? { loader: optionsOrLoader }
        : optionsOrLoader;
  }

  public async get(key: K): Promise<V> {
    const existingValue = this.cache.get(key);

    if (existingValue) {
      this.maybeSetAfterAccessExpirationTimer(key);
      return Promise.resolve(existingValue);
    }

    const value = await this.load(key);
    this.maybeSetAfterAccessExpirationTimer(key);
    return value;
  }

  public set(key: K, value: V): void {
    const oldValue = this.cache.get(key);
    this.cache.set(key, value);

    const { onRemove } = this.options;
    if (oldValue && onRemove) {
      onRemove([key, oldValue], RemovalCause.REPLACED);
    }

    this.maybeSetAfterWriteExpirationTimer(key);
    this.maybeSetAfterAccessExpirationTimer(key);
    this.maybeSetRefreshAfterWriteTimer(key);
  }

  public delete(key: K): boolean {
    return this.removeWithCause(key, RemovalCause.EXPLICIT_DELETE);
  }

  public has(key: K): boolean {
    return this.cache.has(key);
  }

  // does not run `onRemove` listener
  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }

  public forEach(step: (value: V, key: K) => void): void {
    this.cache.forEach((value, key) => step(value, key));
  }

  public values(): IterableIterator<V> {
    return this.cache.values();
  }

  public keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  public entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  protected async load(key: K): Promise<V> {
    const value = await this.options.loader(key);
    this.set(key, value);
    return value;
  }

  protected expire(key: K): void {
    this.removeWithCause(key, RemovalCause.EXPIRED);
  }

  protected removeWithCause(key: K, cause: RemovalCause): boolean {
    const value = this.cache.get(key);
    if (value) {
      this.clearTimers(key);

      this.cache.delete(key);
      const { onRemove } = this.options;
      if (onRemove) {
        onRemove([key, value], cause);
      }

      return true;
    }

    return false;
  }

  protected maybeSetAfterAccessExpirationTimer(key: K): void {
    const { expireAfterAccess } = this.options;
    if (expireAfterAccess) {
      const existingTimer = this.afterAccessExpirationTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.expire(key);
      }, expireAfterAccess);
      this.afterAccessExpirationTimers.set(key, timer);
    }
  }

  protected maybeSetAfterWriteExpirationTimer(key: K): void {
    const { expireAfterWrite } = this.options;
    if (expireAfterWrite) {
      const existingTimer = this.afterWriteExpirationTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.expire(key);
      }, expireAfterWrite);
      this.afterWriteExpirationTimers.set(key, timer);
    }
  }

  protected maybeSetRefreshAfterWriteTimer(key: K): void {
    const { refreshAfterWrite } = this.options;
    if (refreshAfterWrite) {
      const existingTimer = this.refreshAfterWriteTimers.get(key);
      if (existingTimer) {
        clearInterval(existingTimer);
      }

      const timer = setInterval(() => {
        this.load(key);
      }, refreshAfterWrite);
      this.refreshAfterWriteTimers.set(key, timer);
    }
  }

  protected clearTimers(key: K): void {
    const afterAccessTimer = this.afterAccessExpirationTimers.get(key);
    if (afterAccessTimer) {
      clearTimeout(afterAccessTimer);
      this.afterAccessExpirationTimers.delete(key);
    }

    const afterWriteTimer = this.afterWriteExpirationTimers.get(key);
    if (afterWriteTimer) {
      clearTimeout(afterWriteTimer);
      this.afterWriteExpirationTimers.delete(key);
    }

    const refreshTimer = this.refreshAfterWriteTimers.get(key);
    if (refreshTimer) {
      clearInterval(refreshTimer);
      this.refreshAfterWriteTimers.delete(key);
    }
  }
}

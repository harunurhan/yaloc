import { LoadingCache, RemovalCause } from '../src';

jest.useFakeTimers();

function resolveAfter<T>(value: T, time: number): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(value);
    }, time);
  });
}

function clearPromiseQueue(): Promise<void> {
  return new Promise(resolve => {
    resolve();
  });
}

describe('LoadingCache', () => {
  it('loads the value for a key if it does not exist', async () => {
    const cache = new LoadingCache<string, string>(key =>
      Promise.resolve(`value-of-${key}`)
    );
    const value = await cache.get('foo');
    expect(value).toEqual('value-of-foo');
  });

  it('returns the manually set value for a key without loading', async () => {
    const cache = new LoadingCache<string, string>(key =>
      Promise.resolve(`value-of-${key}`)
    );
    cache.set('foo', 'bar');
    const value = await cache.get('foo');
    expect(value).toEqual('bar');
  });

  it('calls the loader only once', async () => {
    const loader = jest.fn(key => Promise.resolve(`value-of-${key}`));
    const cache = new LoadingCache<string, string>(loader);
    await cache.get('foo');
    await cache.get('foo');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('propagates the error that is thrown during loading', async () => {
    const cache = new LoadingCache<string, string>(key => {
      throw new Error(`can not load "${key}"`);
    });
    try {
      await cache.get('foo');
    } catch (error) {
      expect(error.message).toEqual('can not load "foo"');
    }
  });

  it('propagates the error if load function rejects with an error', async () => {
    const cache = new LoadingCache<string, string>(key =>
      Promise.reject(new Error(`can not load "${key}"`))
    );
    try {
      await cache.get('foo');
    } catch (error) {
      expect(error.message).toEqual('can not load "foo"');
    }
  });

  it('overrides loaded value when it is manually set', async () => {
    const cache = new LoadingCache<string, string>(key =>
      Promise.resolve(`value-of-${key}`)
    );
    await cache.get('foo');
    cache.set('foo', 'bar');
    const value = await cache.get('foo');
    expect(value).toEqual('bar');
  });

  it('calls onRemove when an entry is explicitly deleted', () => {
    const onRemove = jest.fn();
    const cache = new LoadingCache<string, string>({
      loader: key => Promise.resolve(`value-of-${key}`),
      onRemove,
    });
    cache.set('foo', 'bar');
    cache.delete('foo');
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(
      ['foo', 'bar'],
      RemovalCause.EXPLICIT_DELETE
    );
  });

  it('calls onRemove when an entry is value is replaced', () => {
    const onRemove = jest.fn();
    const cache = new LoadingCache<string, string>({
      loader: key => Promise.resolve(`value-of-${key}`),
      onRemove,
    });
    cache.set('foo', 'bar');
    cache.set('foo', 'replaced bar');
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(
      ['foo', 'bar'],
      RemovalCause.REPLACED
    );
  });

  it('calls onRemove when an entry is expired', () => {
    const onRemove = jest.fn();
    const cache = new LoadingCache<string, string>({
      loader: key => Promise.resolve(`value-of-${key}`),
      expireAfterWrite: 1000,
      onRemove,
    });
    cache.set('foo', 'bar');

    jest.advanceTimersByTime(1005);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(['foo', 'bar'], RemovalCause.EXPIRED);
    expect(cache.has('foo')).toBe(false);
  });

  it('expires a key when given time is elapsed after last write', () => {
    const cache = new LoadingCache<string, string>({
      loader: key => Promise.resolve(`value-of-${key}`),
      expireAfterWrite: 1000,
    });
    cache.set('foo', 'bar 1');
    jest.advanceTimersByTime(900);

    cache.set('foo', 'bar 2');
    jest.advanceTimersByTime(500);

    expect(cache.has('foo')).toBe(true);

    jest.advanceTimersByTime(505);
    expect(cache.has('foo')).toBe(false);
  });

  it('tracks write expiration timer after loading finishes', async () => {
    const cache = new LoadingCache<string, string>({
      loader: key => resolveAfter(`${key}-value`, 500),
      expireAfterWrite: 1000,
    });

    cache.get('foo');
    jest.advanceTimersByTime(505);
    await clearPromiseQueue(); // loading finished
    expect(cache.has('foo')).toBe(true);

    jest.advanceTimersByTime(505);
    expect(cache.has('foo')).toBe(true);

    jest.advanceTimersByTime(500);
    expect(cache.has('foo')).toBe(false);
  });

  it('expires when given time is elapsed after last access', () => {
    const cache = new LoadingCache<string, string>({
      loader: key => Promise.resolve(`value-of-${key}`),
      expireAfterAccess: 1000,
    });
    cache.set('foo', 'bar');
    cache.get('foo');
    jest.advanceTimersByTime(505);

    cache.get('foo');
    jest.advanceTimersByTime(505);
    expect(cache.has('foo')).toBe(true);

    jest.advanceTimersByTime(500);
    expect(cache.has('foo')).toBe(false);
  });

  it('starts access expiration timer after loading finishes', async () => {
    const cache = new LoadingCache<string, string>({
      loader: key => resolveAfter(`${key}-value`, 500),
      expireAfterAccess: 1000,
    });

    cache.get('foo');
    jest.advanceTimersByTime(505);
    await clearPromiseQueue(); // loading finished
    expect(cache.has('foo')).toBe(true);

    jest.advanceTimersByTime(505);
    expect(cache.has('foo')).toBe(true);

    jest.advanceTimersByTime(500);
    expect(cache.has('foo')).toBe(false);
  });

  it('resets access expiration timer also when value is manually set', async () => {
    const cache = new LoadingCache<string, string>({
      loader: key => Promise.resolve(`value-of-${key}`),
      expireAfterAccess: 1000,
    });
    cache.set('foo', 'bar 1');
    cache.get('foo');
    jest.advanceTimersByTime(505);

    cache.set('foo', 'bar 2');
    jest.advanceTimersByTime(505);
    expect(cache.has('foo')).toBe(true);

    jest.advanceTimersByTime(500);
    expect(cache.has('foo')).toBe(false);
  });

  it('refreshes after each given time is elapsed', async () => {
    let counter = 0;
    const cache = new LoadingCache<string, string>({
      loader: key => {
        counter++;
        return Promise.resolve(`${key} -> ${counter}`);
      },
      refreshAfterWrite: 1000,
    });
    const value = await cache.get('foo');
    expect(value).toEqual('foo -> 1');

    jest.advanceTimersByTime(1002);
    await clearPromiseQueue();

    const valueAfterFirstRefreshTime = await cache.get('foo');
    expect(valueAfterFirstRefreshTime).toEqual('foo -> 2');

    jest.advanceTimersByTime(500);
    await clearPromiseQueue();

    const valueAfterRefreshTimeAndBeforeSecondOne = await cache.get('foo');
    expect(valueAfterRefreshTimeAndBeforeSecondOne).toEqual('foo -> 2');

    jest.advanceTimersByTime(501);
    await clearPromiseQueue();

    const valueAfterSecondRefreshTime = await cache.get('foo');
    expect(valueAfterSecondRefreshTime).toEqual('foo -> 3');
  });

  it('resets refresh interval after when value is manually set', async () => {
    const loader = jest.fn(key => Promise.resolve(`value-of-${key}`));
    const cache = new LoadingCache<string, string>({
      loader,
      refreshAfterWrite: 1000,
    });
    await cache.get('foo');
    jest.advanceTimersByTime(505);

    cache.set('foo', 'manual update');
    jest.advanceTimersByTime(505);
    expect(loader).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(500);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('clears all entries', async () => {
    const cache = new LoadingCache<string, string>({
      loader: key => Promise.resolve(`value-of-${key}`),
    });
    // load some values
    await cache.get('foo');
    await cache.get('bar');

    expect(cache.has('foo')).toBe(true);
    expect(cache.has('bar')).toBe(true);

    cache.clear();

    expect(cache.has('foo')).toBe(false);
    expect(cache.has('bar')).toBe(false);
    expect(cache.size()).toEqual(0);
  });
});

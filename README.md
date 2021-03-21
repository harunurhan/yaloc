# Yet Another LOading Cache (yaloc)

A loading cache data structure for web and node, written in TS.

Inspired by guava's LoadingCache.

## Installation

```bash
yarn add yaloc

npm install --save yaloc
```

## Usage

(Please see tests for the most up to date, guaranteed behaviour.)

### basic

```typescript
import { LoadingCache } from 'yaloc';

const cache = new LoadingCache((key: WhateverType) => getValueFromRemoteSource(key));

await cache.get("foo");
await cache.get("foo"); // doesn't call `getValueFromRemoteSource` for `"foo"`
```

### full example

```typescript
import { LoadingCache } from 'yaloc';

const cache = new LoadingCache<string, string>({
  loader: (key) => getValueFromRemoteSource(key),
  expireAfterAccess: 60 * 1000 // removes an entry, if it hasn't been accessed for a minute
  expireAfterWrite: 5 * 60 * 1000 // removes an entry, 5 minutes after it has been loaded
  refreshAfterWrite: 15 * 1000 // reloads an entry every 15 seconds
  onRemove: ([key, value], removalCause) => { // called whenever an entry is removed from the cache
    console.log(`value for ${key} is removed because ${removalCause}`);
  }
})
```

## Roadmap

- [] more test coverage
- [] more examples
- [] `timeUnit` support for expire and refresh options
- [] `maximumSize` support
- [] `LoadingCacheBuilder` that is an alternative to passing all options `new LoadingCache({ ... })`
- [] ?? `WeakLoadingCache` that is backed by `WeakMap`, probably without expiration features.
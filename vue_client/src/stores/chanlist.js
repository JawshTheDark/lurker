import { defineStore } from 'pinia';

// Per-network channel-browser state. The server owns the cache; the store is
// just a view of the most recent paginated search plus refresh progress.
// `page.rows` is the current visible slice — concatenated as the user
// scrolls, replaced on filter/sort changes.
export const useChanlistStore = defineStore('chanlist', {
  state: () => ({
    byNetwork: {},
  }),
  getters: {
    forNetwork: (state) => (networkId) => state.byNetwork[networkId] || null,
  },
  actions: {
    ensure(networkId) {
      if (!this.byNetwork[networkId]) {
        this.byNetwork[networkId] = {
          // Meta — copied from the server's chanlist_meta row.
          fetchedAt: null,
          inProgress: false,
          totalCount: 0,
          // Current query state.
          query: '',
          sortBy: 'users',
          sortDir: 'desc',
          // Result page.
          rows: [],
          total: 0,
          offset: 0,
          // Pagination flags.
          loading: false,
          // Used to drop late results that no longer match the active query.
          // The server doesn't know about request ordering; the client tags
          // each request with the (query, sortBy, sortDir) snapshot it sent
          // and discards results whose snapshot has been superseded.
          requestKey: '',
        };
      }
      return this.byNetwork[networkId];
    },
    setQuery(networkId, query) {
      const s = this.ensure(networkId);
      s.query = query;
    },
    setSort(networkId, sortBy, sortDir) {
      const s = this.ensure(networkId);
      s.sortBy = sortBy;
      s.sortDir = sortDir;
    },
    setLoading(networkId, loading, requestKey) {
      const s = this.ensure(networkId);
      s.loading = loading;
      if (requestKey != null) s.requestKey = requestKey;
    },
    applyResult(payload) {
      const s = this.ensure(payload.networkId);
      const key = resultKey(payload);
      if (key !== s.requestKey) return; // Stale.
      // offset===0 means a fresh query: replace. Otherwise append (infinite
      // scroll). Dedupe by name in case batches overlap due to a refresh
      // arriving mid-pagination.
      if (payload.offset === 0) {
        s.rows = payload.rows;
      } else {
        const seen = new Set(s.rows.map((r) => r.channel));
        for (const r of payload.rows) {
          if (!seen.has(r.channel)) s.rows.push(r);
        }
      }
      s.offset = payload.offset;
      s.total = payload.total;
      s.fetchedAt = payload.fetchedAt;
      s.inProgress = payload.inProgress;
      s.totalCount = payload.totalCount;
      s.loading = false;
    },
    applyState(payload) {
      const s = this.ensure(payload.networkId);
      s.fetchedAt = payload.fetchedAt ?? s.fetchedAt;
      s.inProgress = !!payload.inProgress;
      if (typeof payload.totalCount === 'number') s.totalCount = payload.totalCount;
    },
    applyProgress(networkId, total) {
      const s = this.ensure(networkId);
      s.inProgress = true;
      if (typeof total === 'number') s.totalCount = total;
    },
    applyEnd(networkId, total) {
      const s = this.ensure(networkId);
      s.inProgress = false;
      if (typeof total === 'number') s.totalCount = total;
      // fetchedAt is filled in on the next search result (which the modal
      // kicks off in response to chanlist-end).
    },
    applyStart(networkId) {
      const s = this.ensure(networkId);
      s.inProgress = true;
      s.totalCount = 0;
      s.fetchedAt = null;
    },
  },
});

// (query, sortBy, sortDir) tuple. Offset is intentionally excluded — pagination
// continues a request, not invalidates it.
export function resultKey({ query, sortBy, sortDir }) {
  return `${query}\x00${sortBy}\x00${sortDir}`;
}

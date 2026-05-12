<template>
  <div class="modal" @click.self="$emit('close')" @keydown.esc="$emit('close')">
    <div class="card" tabindex="-1" ref="cardEl">
      <header class="head">
        <h2>channels — {{ networkLabel }}</h2>
        <button class="link" @click="$emit('close')" title="close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="controls">
        <input
          ref="filterEl"
          v-model="filterInput"
          class="filter"
          type="text"
          placeholder="filter (name or topic)"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn" :disabled="state.inProgress" @click="refresh">
          {{ state.inProgress ? `Streaming… ${state.totalCount}` : 'Refresh' }}
        </button>
        <span class="meta">{{ headerLabel }}</span>
      </div>
      <div ref="listEl" class="list-wrap" @scroll="onScroll">
        <table v-if="state.rows.length" class="list">
          <thead>
            <tr>
              <th class="col-name">
                <button class="sort" @click="setSort('name')">
                  name<span v-if="state.sortBy === 'name'">{{ state.sortDir === 'asc' ? ' ▲' : ' ▼' }}</span>
                </button>
              </th>
              <th class="col-users">
                <button class="sort" @click="setSort('users')">
                  users<span v-if="state.sortBy === 'users'">{{ state.sortDir === 'asc' ? ' ▲' : ' ▼' }}</span>
                </button>
              </th>
              <th class="col-topic">topic</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ch in state.rows"
              :key="ch.channel"
              class="row"
              @click="onJoin(ch)"
              :title="`Join ${ch.channel}`"
            >
              <td class="col-name">{{ ch.channel }}</td>
              <td class="col-users">{{ ch.num_users }}</td>
              <td class="col-topic">{{ ch.topic }}</td>
            </tr>
            <tr v-if="state.loading"><td colspan="3" class="loading">Loading…</td></tr>
          </tbody>
        </table>
        <p v-else-if="state.loading || state.inProgress" class="empty">
          {{ state.inProgress ? `Streaming channels… ${state.totalCount}` : 'Loading…' }}
        </p>
        <p v-else-if="!state.totalCount" class="empty">No channels cached yet — Refresh to fetch.</p>
        <p v-else class="empty">No matches.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch, onBeforeUnmount } from 'vue';
import { useChanlistStore, resultKey } from '../stores/chanlist.js';
import { useNetworksStore } from '../stores/networks.js';
import { useBuffersStore } from '../stores/buffers.js';
import { socketSend } from '../composables/useSocket.js';

const PAGE_LIMIT = 200;
const FILTER_DEBOUNCE_MS = 200;

const props = defineProps({
  networkId: { type: Number, required: true },
});
const emit = defineEmits(['close']);

const chanlist = useChanlistStore();
const networks = useNetworksStore();
const buffers = useBuffersStore();

const cardEl = ref(null);
const filterEl = ref(null);
const listEl = ref(null);
const filterInput = ref('');
let filterTimer = null;
let prevInProgress = false;

// Lazy-init the store entry so v-if/.rows reads don't return null.
chanlist.ensure(props.networkId);
const state = computed(() => chanlist.forNetwork(props.networkId));

// Seed the filter input from any prior session so reopening the modal doesn't
// silently throw away a search the user had typed before they closed it.
filterInput.value = state.value.query;

const networkLabel = computed(() => {
  const net = networks.networks.find((n) => n.id === props.networkId);
  return net?.name || `net:${props.networkId}`;
});

const headerLabel = computed(() => {
  const s = state.value;
  if (s.inProgress) return `streaming · ${s.totalCount}`;
  if (s.fetchedAt) {
    return `${s.total.toLocaleString()} match · ${s.totalCount.toLocaleString()} total · fetched ${relTime(s.fetchedAt)}`;
  }
  return '';
});

function relTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function sendSearch(offset) {
  const s = state.value;
  const key = resultKey({ query: s.query, sortBy: s.sortBy, sortDir: s.sortDir });
  chanlist.setLoading(props.networkId, true, key);
  socketSend({
    type: 'chanlist-search',
    networkId: props.networkId,
    query: s.query,
    sortBy: s.sortBy,
    sortDir: s.sortDir,
    offset,
    limit: PAGE_LIMIT,
  });
}

function refresh() {
  socketSend({ type: 'list-channels', networkId: props.networkId });
}

function setSort(key) {
  const s = state.value;
  let dir;
  if (s.sortBy === key) {
    dir = s.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    dir = key === 'users' ? 'desc' : 'asc';
  }
  chanlist.setSort(props.networkId, key, dir);
  sendSearch(0);
}

watch(filterInput, (next) => {
  if (filterTimer) clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    chanlist.setQuery(props.networkId, next);
    sendSearch(0);
  }, FILTER_DEBOUNCE_MS);
});

// When a refresh completes (inProgress flips true→false), re-pull page 1 so
// the just-cached rows replace whatever was on screen. The transition matters
// — running on every false reading would also fire on initial open.
watch(() => state.value.inProgress, (next) => {
  if (prevInProgress && !next) sendSearch(0);
  prevInProgress = next;
});

function onScroll() {
  const el = listEl.value;
  if (!el || state.value.loading) return;
  const s = state.value;
  const haveAll = s.rows.length >= s.total;
  if (haveAll) return;
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (dist < 240) sendSearch(s.rows.length);
}

function onJoin(ch) {
  socketSend({ type: 'join', networkId: props.networkId, channel: ch.channel });
  buffers.activate(props.networkId, ch.channel);
  emit('close');
}

onMounted(() => {
  cardEl.value?.focus();
  prevInProgress = state.value.inProgress;
  // Always pull a fresh first page on open so the rows match whatever the
  // current search snapshot is, and so a stale `rows` list left over from a
  // prior session is replaced by current cache state.
  sendSearch(0);
  // If we've never refreshed for this network, kick a LIST so the user sees
  // results without an explicit click. fetchedAt is null until the first
  // chanlist-end persists.
  if (!state.value.fetchedAt && !state.value.inProgress && state.value.totalCount === 0) {
    refresh();
  }
  setTimeout(() => filterEl.value?.focus(), 0);
});

onBeforeUnmount(() => {
  if (filterTimer) clearTimeout(filterTimer);
});
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.card {
  background: var(--bg);
  border: 1px solid var(--accent);
  width: min(900px, 92vw);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  outline: none;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.head h2 {
  margin: 0;
  flex: 1;
  color: var(--accent);
  font-weight: 600;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.link {
  background: none;
  border: none;
  color: var(--fg-muted);
  cursor: pointer;
  font: inherit;
  padding: 0 4px;
}
.link:hover { color: var(--fg); }

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
}
.filter {
  flex: 1;
  min-width: 0;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 4px 8px;
  font: inherit;
}
.filter:focus { outline: none; border-color: var(--accent); }
.btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg);
  font: inherit;
  padding: 4px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover:not(:disabled) { border-color: var(--accent); background: var(--bg-soft); }
.btn:disabled { opacity: 0.6; cursor: default; }
.meta { color: var(--fg-muted); font-size: 0.9em; }

.list-wrap {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.list {
  width: 100%;
  border-collapse: collapse;
}
.list th, .list td {
  text-align: left;
  padding: 4px 16px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.list thead th {
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 1;
  color: var(--fg-muted);
  font-weight: 500;
}
.sort {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  padding: 0;
  cursor: pointer;
}
.sort:hover { color: var(--fg); }
.col-users { width: 80px; text-align: right; }
.col-name  { width: 200px; color: var(--accent); white-space: nowrap; }
.col-topic { color: var(--fg-muted); }
.row { cursor: pointer; }
.row:hover { background: var(--bg-soft); }
.row:hover .col-topic { color: var(--fg); }
.loading {
  text-align: center;
  color: var(--fg-muted);
  font-style: italic;
}
.empty {
  text-align: center;
  color: var(--fg-muted);
  font-style: italic;
  padding: 32px;
}
</style>

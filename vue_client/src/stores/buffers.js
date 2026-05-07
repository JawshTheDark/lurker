import { defineStore } from 'pinia';

const MAX_PER_BUFFER = 500;

function key(networkId, target) {
  return `${networkId}::${target}`;
}

function ensureBuffer(state, networkId, target) {
  const k = key(networkId, target);
  if (!state.buffers[k]) {
    state.buffers[k] = {
      networkId,
      target,
      messages: [],
      members: [],
      topic: null,
      unread: 0,
      mention: false,
    };
  }
  return state.buffers[k];
}

export const useBuffersStore = defineStore('buffers', {
  state: () => ({
    buffers: {},
  }),
  getters: {
    list: (state) => Object.values(state.buffers),
    byKey: (state) => (k) => state.buffers[k] || null,
    forNetwork: (state) => (networkId) => Object.values(state.buffers).filter((b) => b.networkId === networkId),
  },
  actions: {
    ensure(networkId, target) {
      return ensureBuffer(this, networkId, target);
    },
    pushMessage(event) {
      if (!event.target) return;
      const buf = ensureBuffer(this, event.networkId, event.target);
      buf.messages.push(event);
      if (buf.messages.length > MAX_PER_BUFFER) buf.messages.splice(0, buf.messages.length - MAX_PER_BUFFER);
    },
    replaceBacklog(networkId, target, events) {
      const buf = ensureBuffer(this, networkId, target);
      buf.messages = events.slice(-MAX_PER_BUFFER);
    },
    setMembers(networkId, target, members) {
      const buf = ensureBuffer(this, networkId, target);
      buf.members = members;
    },
    setTopic(networkId, target, topic) {
      const buf = ensureBuffer(this, networkId, target);
      buf.topic = topic;
    },
    removeMember(networkId, target, nick) {
      const buf = ensureBuffer(this, networkId, target);
      buf.members = buf.members.filter((m) => (m.nick || m) !== nick);
    },
    addMember(networkId, target, nick) {
      const buf = ensureBuffer(this, networkId, target);
      const existing = buf.members.find((m) => (m.nick || m) === nick);
      if (!existing) buf.members.push({ nick, modes: [] });
    },
    renameMember(networkId, target, oldNick, newNick) {
      const buf = ensureBuffer(this, networkId, target);
      for (const m of buf.members) {
        if ((m.nick || m) === oldNick) {
          if (typeof m === 'object') m.nick = newNick;
        }
      }
    },
    drop(networkId, target) {
      delete this.buffers[key(networkId, target)];
    },
    markRead(networkId, target) {
      const buf = this.buffers[key(networkId, target)];
      if (buf) {
        buf.unread = 0;
        buf.mention = false;
      }
    },
    markUnread(networkId, target, isMention = false) {
      const buf = this.buffers[key(networkId, target)];
      if (!buf) return;
      buf.unread += 1;
      if (isMention) buf.mention = true;
    },
  },
});

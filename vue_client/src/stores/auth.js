import { defineStore } from 'pinia';
import { api } from '../api.js';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    checked: false,
    error: null,
  }),
  actions: {
    async fetchMe() {
      try {
        const { user } = await api('/api/auth/me');
        this.user = user;
      } catch (err) {
        this.user = null;
      } finally {
        this.checked = true;
      }
      return this.user;
    },
    async login(username, password) {
      this.error = null;
      try {
        const { user } = await api('/api/auth/login', {
          method: 'POST',
          body: { username, password },
        });
        this.user = user;
        this.checked = true;
        return user;
      } catch (err) {
        this.error = err.message || 'login failed';
        throw err;
      }
    },
    async logout() {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } finally {
        this.user = null;
      }
    },
  },
});

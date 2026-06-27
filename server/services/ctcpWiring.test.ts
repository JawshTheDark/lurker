// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// CTCP wiring (#263): the glue between live IRC traffic and our CTCP handling on
// IrcConnection. The wire-format + reply rules are unit-pinned in ctcp.test.ts;
// these exercise the PLUMBING — does an inbound request auto-reply over NOTICE
// and surface a status line; does an inbound reply route back to the issuing
// buffer with a PING latency; does an outbound /ctcp frame + echo; do the flood
// guard and self-echo / RPEE2E guards hold.

// MUST be first — redirect DATABASE_PATH before the static imports below open
// the real data/lurker.db.
import '../test-utils/isolateDb.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { IrcConnection } from './ircConnection.js';
import { createUser } from '../db/users.js';
import { createNetwork } from '../db/networks.js';
import { IRC_VERSION } from '../utils/userAgent.js';

beforeAll(() => {
  createUser('ctcp-alice'); // id 1
  createNetwork(1, { name: 'n', host: 'h', port: 6697, tls: true, nick: 'alice' }); // network id 1
});

function makeConn(): IrcConnection {
  return new IrcConnection({
    network: {
      id: 1,
      user_id: 1,
      name: 'n',
      host: 'irc.example.test',
      port: 6697,
      tls: 1,
      trusted_certificates: 1,
      nick: 'alice',
      username: null,
      realname: null,
      server_password: null,
      autoconnect: 1,
      sasl_account: null,
      sasl_password: null,
      connect_commands: null,
      position: 0,
      created_at: new Date().toISOString(),
    },
    onEvent: () => {},
  });
}

// Spy the wire + publish seams on a freshly-built connection.
function harness() {
  const conn = makeConn();
  const ctcpRequest = vi.fn<(target: string, type: string, ...p: string[]) => void>();
  const ctcpResponse = vi.fn<(target: string, type: string, ...p: string[]) => void>();
  const publishEphemeral = vi.fn<(event: Record<string, unknown>) => void>();
  conn.client.ctcpRequest = ctcpRequest;
  conn.client.ctcpResponse = ctcpResponse;
  conn.publishEphemeral = publishEphemeral;
  const ctcpLines = () =>
    publishEphemeral.mock.calls.map((c) => c[0]).filter((e) => e.type === 'ctcp') as Array<{
      target: string;
      text: string;
    }>;
  return { conn, ctcpRequest, ctcpResponse, publishEphemeral, ctcpLines };
}

describe('inbound CTCP request (auto-reply + surface)', () => {
  it('answers VERSION with the Lurker user-agent and notes the probe', () => {
    const { conn, ctcpResponse, ctcpLines } = harness();

    conn.client.emit('ctcp request', {
      nick: 'bob',
      ident: 'b',
      hostname: 'h',
      type: 'VERSION',
      message: 'VERSION',
    });

    expect(ctcpResponse).toHaveBeenCalledWith('bob', 'VERSION', IRC_VERSION);
    const lines = ctcpLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].target).toBe(':server:1'); // probes land in the server buffer
    expect(lines[0].text).toBe('bob requested CTCP VERSION');
  });

  it('echoes a PING payload back verbatim', () => {
    const { conn, ctcpResponse } = harness();
    conn.client.emit('ctcp request', { nick: 'bob', type: 'PING', message: 'PING 1719500000000' });
    expect(ctcpResponse).toHaveBeenCalledWith('bob', 'PING', '1719500000000');
  });

  it('does not reply to an unsupported type but still shows the probe', () => {
    const { conn, ctcpResponse, ctcpLines } = harness();
    conn.client.emit('ctcp request', { nick: 'bob', type: 'USERINFO', message: 'USERINFO' });
    expect(ctcpResponse).not.toHaveBeenCalled();
    expect(ctcpLines()[0].text).toBe('bob requested CTCP USERINFO (no reply)');
  });

  it('ignores our own request echoed back by an echo-message server', () => {
    const { conn, ctcpResponse, publishEphemeral } = harness();
    conn.client.emit('ctcp request', { nick: 'alice', type: 'VERSION', message: 'VERSION' });
    expect(ctcpResponse).not.toHaveBeenCalled();
    expect(publishEphemeral).not.toHaveBeenCalled();
  });

  it('never treats an RPEE2E PRIVMSG as a standard CTCP query', () => {
    const { conn, ctcpResponse, publishEphemeral } = harness();
    conn.client.emit('ctcp request', {
      nick: 'bob',
      type: 'RPEE2E',
      message: 'RPEE2E KEYREQ v=1 c=#x',
    });
    expect(ctcpResponse).not.toHaveBeenCalled();
    expect(publishEphemeral).not.toHaveBeenCalled();
  });

  it('rate-limits a flood of requests to the burst budget', () => {
    const { conn, ctcpResponse } = harness();
    for (let i = 0; i < 10; i++) {
      conn.client.emit('ctcp request', { nick: 'bob', type: 'VERSION', message: 'VERSION' });
    }
    // CTCP_REPLY_BURST = 5; all fire within the same ms so no token refills.
    expect(ctcpResponse).toHaveBeenCalledTimes(5);
  });

  it('a malformed (empty) CTCP does not drain the reply budget', () => {
    const { conn, ctcpResponse } = harness();
    // Empty-body CTCPs (\x01\x01) parse to no type — they must be rejected
    // BEFORE a token is taken, or a peer could starve real replies.
    for (let i = 0; i < 20; i++) {
      conn.client.emit('ctcp request', { nick: 'bob', type: '', message: '' });
    }
    expect(ctcpResponse).not.toHaveBeenCalled();
    // A real VERSION afterward is still answered — the budget is intact.
    conn.client.emit('ctcp request', { nick: 'bob', type: 'VERSION', message: 'VERSION' });
    expect(ctcpResponse).toHaveBeenCalledWith('bob', 'VERSION', IRC_VERSION);
  });
});

describe('outbound CTCP request (/ctcp, /ping)', () => {
  it('frames a /ctcp VERSION and echoes it to the issuing buffer', () => {
    const { conn, ctcpRequest, ctcpLines } = harness();
    conn.sendCtcpRequest('#chan', 'bob', 'VERSION', '');
    expect(ctcpRequest).toHaveBeenCalledWith('bob', 'VERSION');
    const lines = ctcpLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ target: '#chan', text: '→ CTCP VERSION to bob' });
  });

  it('auto-fills a bare PING with an epoch-ms timestamp payload', () => {
    const { conn, ctcpRequest } = harness();
    conn.sendCtcpRequest('bob', 'bob', 'PING', '');
    expect(ctcpRequest).toHaveBeenCalledTimes(1);
    const [target, type, payload] = ctcpRequest.mock.calls[0];
    expect(target).toBe('bob');
    expect(type).toBe('PING');
    expect(Number.isFinite(Number(payload))).toBe(true);
  });

  it('uppercases an arbitrary lowercase type', () => {
    const { conn, ctcpRequest } = harness();
    conn.sendCtcpRequest('#chan', 'bob', 'time', '');
    expect(ctcpRequest).toHaveBeenCalledWith('bob', 'TIME');
  });
});

describe('inbound CTCP reply (route + latency)', () => {
  it('routes a reply back to the buffer the request was issued from', () => {
    const { conn, ctcpResponse, ctcpLines } = harness();
    conn.sendCtcpRequest('#chan', 'bob', 'VERSION', '');
    conn.client.emit('ctcp response', {
      nick: 'bob',
      type: 'VERSION',
      message: 'VERSION WeeChat 4.0',
    });
    expect(ctcpResponse).not.toHaveBeenCalled(); // we never reply to a reply
    const reply = ctcpLines().find((l) => l.text.includes('reply'));
    expect(reply?.target).toBe('#chan');
    expect(reply?.text).toBe('CTCP VERSION reply from bob: WeeChat 4.0');
  });

  it('reports PING round-trip latency from the echoed timestamp', () => {
    const { conn, ctcpRequest, ctcpLines } = harness();
    conn.sendCtcpRequest('#chan', 'bob', 'PING', '');
    const ts = ctcpRequest.mock.calls[0][2] as string; // the auto-filled epoch-ms payload
    conn.client.emit('ctcp response', { nick: 'bob', type: 'PING', message: `PING ${ts}` });
    const reply = ctcpLines().find((l) => l.text.includes('PING reply'));
    expect(reply?.target).toBe('#chan');
    expect(reply?.text).toMatch(/^CTCP PING reply from bob: \d+\.\d{3}s$/);
  });

  it('falls back to the server buffer for an unsolicited reply', () => {
    const { conn, ctcpLines } = harness();
    conn.client.emit('ctcp response', {
      nick: 'bob',
      type: 'VERSION',
      message: 'VERSION Unsolicited',
    });
    const reply = ctcpLines().find((l) => l.text.includes('reply'));
    expect(reply?.target).toBe(':server:1');
  });
});

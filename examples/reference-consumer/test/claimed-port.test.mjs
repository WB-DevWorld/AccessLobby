import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { listenOnClaimedPort } from './claimed-port.mjs';

test('parallel port claims stay listening on distinct ports', async () => {
  const claim = () => listenOnClaimedPort(async port => {
    const server = createServer((request, response) => { response.end(String(port)); });
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');
    return server;
  });
  for (let round = 0; round < 20; round++) {
    const [first, second] = await Promise.all([claim(), claim()]);
    try {
      assert.notEqual(first.address().port, second.address().port);
      assert.equal(await (await fetch(`http://127.0.0.1:${first.address().port}`)).text(), String(first.address().port));
      assert.equal(await (await fetch(`http://127.0.0.1:${second.address().port}`)).text(), String(second.address().port));
    } finally {
      await Promise.all([first, second].map(server => new Promise(resolve => server.close(resolve))));
    }
  }
});

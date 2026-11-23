import { createServer } from 'node:http';
import { once } from 'node:events';
import { open, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const lockPath = join(tmpdir(), 'accesslobby-reference-consumer-port.lock');

async function acquire() {
  for (;;) {
    try { return await open(lockPath, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > 30000) await unlink(lockPath);
      } catch { /* another claim owns or removed the lock */ }
      await delay(15);
    }
  }
}

const ephemeralPort = async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};

// Hold the lock from the moment the ephemeral port is released until the caller is listening on it.
export async function listenOnClaimedPort(launch) {
  const handle = await acquire();
  try {
    const port = await ephemeralPort();
    return await launch(port);
  } finally {
    await handle.close();
    await unlink(lockPath);
  }
}

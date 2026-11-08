
export function enforceConnectionCap(server, capMs, label = 'server') {
  if (!capMs || capMs <= 0) return;

  server.on('request', (req, res) => {
    const timer = setTimeout(() => {
      if (!res.writableEnded) {
        console.warn(`[netcap:${label}] killed ${req.method} ${req.url} (open > ${capMs} ms)`);
        req.socket.destroy();
      }
    }, capMs);
    timer.unref();

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);
  });
}

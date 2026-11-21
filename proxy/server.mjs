import http from 'node:http';
import { handler } from './handler.mjs';

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('access-control-allow-origin', '*');
  if (u.pathname === '/p/') { try { return await handler(req, res); }
    catch (e) { res.statusCode = 500; res.end('proxy error'); } }
  res.statusCode = 200;
  res.setHeader('content-type', 'text/plain');
  res.end('proxy up');
}).listen(process.env.PORT || 10000, () => console.log('listening'));